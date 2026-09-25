# Despliegue a staging: configuracion de GitHub y de AWS

Esta guia deja operativo el camino completo: un cambio fusionado a `main`
termina, sin intervencion, corriendo en un entorno de AWS al que se puede entrar
desde el navegador.

El recorrido completo toma entre cuarenta y cinco minutos y una hora la primera
vez, casi toda de espera a que se cree la base de datos.

---

## 1. Que se crea

| Recurso | Servicio | Funcion |
| --- | --- | --- |
| Proveedor de identidad y rol | AWS IAM | Permite que GitHub Actions obtenga credenciales temporales sin guardar ninguna llave |
| Red propia con dos subredes | Amazon VPC | Aisla el entorno; sin NAT, para no pagar por el |
| Instancia PostgreSQL 16 | Amazon RDS | Base de datos del entorno, `db.t4g.micro` |
| Dos secretos | AWS Secrets Manager | Contrasena de la base y secreto de firma de los tokens |
| Repositorio de imagenes | Amazon ECR | Guarda la imagen de cada version |
| Cluster y servicio | Amazon ECS sobre Fargate | Ejecuta la aplicacion con Redis como contenedor lateral |
| Panel y alarma | Amazon CloudWatch | Uso de recursos, registros y aviso si el servicio se queda sin tareas |

**Decisiones de costo, deliberadas.** No hay balanceador de carga: la tarea
expone su propia direccion publica, que cambia en cada despliegue. No hay NAT:
las tareas viven en subredes publicas. Redis corre junto a la aplicacion en
lugar de ElastiCache. Con estas tres decisiones, el entorno cuesta unos pocos
dolares al mes, y cero si se apaga.

---

## 2. Requisitos previos

```bash
aws --version          # interfaz de linea de comandos v2
aws sts get-caller-identity   # confirma que hay credenciales configuradas
docker --version
gh --version           # opcional, para configurar GitHub desde la terminal
```

Si `aws sts get-caller-identity` falla, configurar el acceso con
`aws configure` o `aws sso login` antes de continuar.

---

## 3. Paso 1: confianza entre GitHub y AWS

Se crea una sola vez. Sustituir `USUARIO/pda-platform` por el repositorio real.

```bash
aws cloudformation deploy \
  --template-file infra/oidc-github.yml \
  --stack-name pda-oidc \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      RepositorioGitHub=USUARIO/pda-platform \
      NombreProyecto=pda-platform \
      CrearProveedorOIDC=si
```

> Si la cuenta ya tiene el proveedor de GitHub creado por otro proyecto, el
> despliegue falla con `EntityAlreadyExists`. Repetir el comando con
> `CrearProveedorOIDC=no`.

Obtener el ARN del rol, que hace falta en el paso 4:

```bash
aws cloudformation describe-stacks --stack-name pda-oidc \
  --query "Stacks[0].Outputs[?OutputKey=='ArnRolDespliegue'].OutputValue" \
  --output text
```

El rol solo puede asumirse desde la rama `main` de ese repositorio y desde su
entorno `staging`. Una rama de trabajo, o una bifurcacion del repositorio hecha
por un tercero, no obtiene credenciales.

---

## 4. Paso 2: la pila de staging

La primera vez conviene crearla con el servicio apagado, porque la imagen
todavia no existe en el registro y una tarea que no puede descargar su imagen
hace fallar la creacion del servicio.

```bash
aws cloudformation deploy \
  --template-file infra/staging.yml \
  --stack-name pda-staging \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      NombreProyecto=pda-platform \
      CantidadDeseada=0 \
      CrearRepositoriosECR=si
```

Tarda entre diez y quince minutos: casi todo es la creacion de la instancia de
PostgreSQL.

Para restringir el acceso a la direccion publica desde la que se presenta la
entrega, agregar `CidrDeAcceso=$(curl -s ifconfig.me)/32` a los parametros.

---

## 5. Paso 3: la primera imagen

La canalizacion publica las imagenes por su cuenta, pero la primera tiene que
existir antes de encender el servicio. Se construye y se publica a mano:

```bash
CUENTA=$(aws sts get-caller-identity --query Account --output text)
REGION=us-east-1
REGISTRO="$CUENTA.dkr.ecr.$REGION.amazonaws.com"

aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$REGISTRO"

# Fargate corre sobre x86-64. Desde una Mac con Apple Silicon hay que indicar
# la arquitectura de destino o la imagen no arranca en AWS.
docker buildx build --platform linux/amd64 \
  -f docker/Dockerfile \
  -t "$REGISTRO/pda-platform:latest" \
  --push .
```

---

## 6. Paso 4: encender el servicio

```bash
aws cloudformation deploy \
  --template-file infra/staging.yml \
  --stack-name pda-staging \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      NombreProyecto=pda-platform \
      CantidadDeseada=1 \
      CrearRepositoriosECR=si
```

Aplicar el esquema y los datos semilla sobre la base de datos recien creada. La
base no es alcanzable desde fuera de la red, de modo que la migracion corre como
una tarea puntual dentro de ella:

```bash
CLUSTER=$(aws cloudformation describe-stacks --stack-name pda-staging \
  --query "Stacks[0].Outputs[?OutputKey=='NombreCluster'].OutputValue" --output text)
FAMILIA=$(aws cloudformation describe-stacks --stack-name pda-staging \
  --query "Stacks[0].Outputs[?OutputKey=='FamiliaTarea'].OutputValue" --output text)
SUBREDES=$(aws cloudformation describe-stacks --stack-name pda-staging \
  --query "Stacks[0].Outputs[?OutputKey=='SubredesPublicas'].OutputValue" --output text)
GRUPO=$(aws cloudformation describe-stacks --stack-name pda-staging \
  --query "Stacks[0].Outputs[?OutputKey=='GrupoSeguridadServicio'].OutputValue" --output text)

aws ecs run-task \
  --cluster "$CLUSTER" \
  --task-definition "$FAMILIA" \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBREDES],securityGroups=[$GRUPO],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["node","scripts/migrar.js"]}]}'
```

Consultar la direccion del entorno y abrirla:

```bash
./scripts/url-staging.sh
open "$(./scripts/url-staging.sh)"
```

---

## 7. Paso 5: configurar el repositorio en GitHub

En **Settings → Secrets and variables → Actions → pestania Variables**, crear
cuatro variables de repositorio:

| Variable | Valor |
| --- | --- |
| `AWS_REGION` | `us-east-1` |
| `AWS_ROL_DESPLIEGUE` | el ARN obtenido en el paso 1 |
| `DESPLIEGUE_HABILITADO` | `true` |
| `PILA_STAGING` | `pda-staging` |

Desde la terminal, si se tiene `gh` instalado:

```bash
gh variable set AWS_REGION --body "us-east-1"
gh variable set AWS_ROL_DESPLIEGUE --body "arn:aws:iam::000000000000:role/pda-platform-rol-github"
gh variable set DESPLIEGUE_HABILITADO --body "true"
gh variable set PILA_STAGING --body "pda-staging"
gh variable list
```

**No se crea ningun secreto.** La canalizacion no guarda llaves: obtiene
credenciales temporales por federacion de identidad y las pierde al terminar.

En **Settings → Environments**, crear el entorno `staging`. Si se marca
*Required reviewers*, la etapa de despliegue queda en espera hasta que alguien
la autorice desde la interfaz, lo que resulta comodo el dia de la presentacion.

En **Settings → Branches**, proteger `main`: exigir solicitud de incorporacion
con una aprobacion, y exigir que las verificaciones
`1. Verificacion (analisis estatico y bateria de Jest)` y
`3. Pruebas end to end (Playwright)` esten en verde antes de permitir la fusion.

---

## 8. El ciclo de trabajo diario

```bash
# 1. Partir de develop, siempre al dia
git checkout develop && git pull

# 2. Una rama por tarea
git checkout -b feature/HU-030-descuento-por-hermana

# 3. Trabajar, con la bateria corriendo en local
npm test
npm run lint

# 4. Confirmar con el formato del proyecto
git add -A
git commit -m "agregar(pagos): aplicar descuento por segunda hermana (HU-030)"
git push -u origin feature/HU-030-descuento-por-hermana

# 5. Abrir la solicitud de incorporacion hacia develop
gh pr create --base develop --fill
```

Al abrir la solicitud, la canalizacion ejecuta las etapas 1, 2 y 3. Construye
las cinco imagenes pero no publica ninguna y no toca ningun entorno.

```bash
# 6. Ya revisada y en verde, se incorpora a develop
gh pr merge --squash

# 7. Cuando develop esta listo para salir, se promueve a main
git checkout main && git pull
git merge --no-ff develop
git push origin main
```

**Esa ultima linea es la que despliega.** La fusion a `main` dispara la
canalizacion completa: verifica, construye, publica las imagenes en ECR, corre
las cuatro suites end to end, aplica las migraciones y actualiza el servicio de
staging.

Seguirlo en vivo desde la terminal:

```bash
gh run watch
gh run view --log
```

Y comprobar el resultado:

```bash
./scripts/url-staging.sh
curl -s "$(./scripts/url-staging.sh)/health" | jq
```

---

## 9. Operacion del entorno

```bash
# Direccion publica actual
./scripts/url-staging.sh

# Registros de la aplicacion, en vivo
aws logs tail /ecs/pda-platform-staging --follow

# Estado del servicio
aws ecs describe-services --cluster pda-platform-staging \
  --services pda-platform-staging \
  --query 'services[0].{estado:status,deseadas:desiredCount,corriendo:runningCount}'

# Consola dentro del contenedor, para diagnosticar
TAREA=$(aws ecs list-tasks --cluster pda-platform-staging \
  --service-name pda-platform-staging --query 'taskArns[0]' --output text)
aws ecs execute-command --cluster pda-platform-staging \
  --task "$TAREA" --container api --interactive --command "/bin/sh"

# Dejar la base de datos en su estado conocido antes de una demostracion
aws ecs run-task --cluster pda-platform-staging \
  --task-definition pda-platform-staging --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBREDES],securityGroups=[$GRUPO],assignPublicIp=ENABLED}" \
  --overrides '{"containerOverrides":[{"name":"api","command":["node","scripts/migrar.js","--reiniciar"]}]}'

# Ejecutar el plan de pruebas contra staging
BASE_URL="$(./scripts/url-staging.sh)" npm run e2e:sistema
```

### Apagar el entorno sin eliminarlo

Entre la entrega y la defensa conviene dejarlo apagado. La base de datos sigue
existiendo y el entorno vuelve en dos minutos.

```bash
aws ecs update-service --cluster pda-platform-staging \
  --service pda-platform-staging --desired-count 0

# Para volver a encenderlo
aws ecs update-service --cluster pda-platform-staging \
  --service pda-platform-staging --desired-count 1
```

---

## 10. Desmontaje

Al terminar la presentacion, para que la cuenta deje de generar costo:

```bash
# 1. Apagar el servicio y esperar a que no quede ninguna tarea
aws ecs update-service --cluster pda-platform-staging \
  --service pda-platform-staging --desired-count 0
aws ecs wait services-stable --cluster pda-platform-staging \
  --services pda-platform-staging

# 2. Eliminar la pila de staging: red, base de datos, cluster, secretos y panel
aws cloudformation delete-stack --stack-name pda-staging
aws cloudformation wait stack-delete-complete --stack-name pda-staging

# 3. Eliminar el rol de despliegue
aws cloudformation delete-stack --stack-name pda-oidc

# 4. Apagar la canalizacion desde GitHub
gh variable set DESPLIEGUE_HABILITADO --body "false"
```

Los secretos de Secrets Manager quedan programados para borrarse en siete dias;
para eliminarlos de inmediato:

```bash
aws secretsmanager delete-secret --secret-id pda-platform/staging/postgres \
  --force-delete-without-recovery
aws secretsmanager delete-secret --secret-id pda-platform/staging/jwt \
  --force-delete-without-recovery
```

Comprobar que no queda nada encendido:

```bash
aws cloudformation list-stacks \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query 'StackSummaries[].StackName'
aws rds describe-db-instances --query 'DBInstances[].DBInstanceIdentifier'
aws ecs list-clusters
```

---

## 11. Problemas frecuentes

| Sintoma | Causa habitual | Como se resuelve |
| --- | --- | --- |
| `Could not assume role with OIDC` | La variable `AWS_ROL_DESPLIEGUE` esta vacia o el repositorio no coincide con el del paso 1 | Revisar el parametro `RepositorioGitHub` de la pila `pda-oidc` |
| El despliegue se queda esperando y ECS revierte | La imagen no existe con esa etiqueta, o se construyo para la arquitectura equivocada | Construir con `--platform linux/amd64` |
| `exec format error` en los registros | Imagen de Apple Silicon corriendo en Fargate x86-64 | La misma correccion anterior |
| La migracion termina con codigo distinto de cero | La base de datos aun no acepta conexiones | El guion reintenta dos minutos; si persiste, revisar el grupo de seguridad |
| `/health` responde 503 con `postgres: error` | El grupo de seguridad de la base no admite al del servicio | Confirmar que la pila se creo completa, sin recursos a medio crear |
| La direccion del entorno dejo de responder | La tarea se reemplazo y cambio de direccion | Volver a consultar `./scripts/url-staging.sh` |
| `CREATE_FAILED` en el repositorio de ECR | Ya existe, creado por `infra/pipeline.yml` | Repetir con `CrearRepositoriosECR=no` |
| La version del motor de PostgreSQL no existe en la region | El valor predeterminado quedo desfasado | `aws rds describe-db-engine-versions --engine postgres --query 'DBEngineVersions[-5:].EngineVersion'` y pasar uno con `VersionPostgres=` |
