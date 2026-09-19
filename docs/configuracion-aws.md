# Configuracion de la canalizacion en AWS

Esta guia deja operativa la canalizacion de integracion continua descrita en la
plantilla `infra/pipeline.yml`. El recorrido completo toma entre veinte y treinta
minutos la primera vez.

## Lo que se crea

| Recurso | Servicio | Funcion |
| --- | --- | --- |
| Cinco repositorios de imagenes | Amazon ECR | Almacenan la imagen del monolito y la de cada modulo |
| Proyecto de construccion | AWS CodeBuild | Ejecuta las pruebas y construye las imagenes |
| Canalizacion de dos etapas | AWS CodePipeline | Se dispara con cada cambio en la rama principal de GitHub |
| Bucket de artefactos | Amazon S3 | Guarda el resultado de cada ejecucion |
| Panel e alarma | Amazon CloudWatch | Concentra los indicadores de construccion |

## Paso 1. Conectar la cuenta de AWS con GitHub

La conexion se autoriza una sola vez y queda disponible para todas las
canalizaciones de la cuenta.

1. Abrir la consola de AWS en la region de trabajo, por ejemplo `us-east-1`.
2. Entrar a **CodePipeline**, y en el menu lateral elegir **Settings** y luego
   **Connections**.
3. Pulsar **Create connection**, seleccionar **GitHub** y asignar un nombre, por
   ejemplo `conexion-github-pda`.
4. Autorizar la aplicacion en GitHub y limitar el acceso al repositorio del
   proyecto.
5. Verificar que la conexion aparece con estado **Available** y copiar su ARN.
   Una conexion en estado **Pending** no funciona: falta completar la
   autorizacion desde GitHub.

## Paso 2. Desplegar la plantilla

Desde la raiz del repositorio, con la interfaz de linea de comandos de AWS ya
configurada:

```bash
aws cloudformation deploy \
  --template-file infra/pipeline.yml \
  --stack-name pda-devops \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
      NombreProyecto=pda-platform \
      RepositorioGitHub=USUARIO/pda-platform \
      RamaGitHub=main \
      ConexionCodeStarArn=arn:aws:codeconnections:us-east-1:000000000000:connection/xxxxxxxx
```

El parametro `--capabilities CAPABILITY_NAMED_IAM` es obligatorio porque la
plantilla crea dos roles con nombre propio.

Al terminar, las direcciones de la canalizacion y del panel quedan en las salidas
de la pila:

```bash
aws cloudformation describe-stacks \
  --stack-name pda-devops \
  --query 'Stacks[0].Outputs' \
  --output table
```

## Paso 3. Comprobar la primera ejecucion

CodePipeline se dispara solo al detectar el primer cambio. Para forzarla:

```bash
aws codepipeline start-pipeline-execution --name pda-platform-canalizacion
```

La ejecucion pasa por dos etapas. **Origen** descarga el codigo desde GitHub.
**ConstruccionYPruebas** instala dependencias, ejecuta `npm run test:ci`,
construye las cinco imagenes y las publica en ECR. Si alguna prueba falla, la
etapa se detiene y ninguna imagen se publica.

Para revisar los registros de la ultima construccion:

```bash
aws logs tail /aws/codebuild/pda-platform-build --follow
```

## Paso 4. Revisar el panel

El panel `pda-platform-devops` en CloudWatch reune tres elementos: el conteo de
construcciones exitosas y fallidas, la duracion promedio de cada construccion y
una consulta sobre los registros que filtra las lineas de error mas recientes.
La alarma `pda-platform-construcciones-fallidas` se activa ante cualquier
construccion fallida; para recibir el aviso por correo basta crear un tema de
Amazon SNS, suscribir la direccion y asociarlo a la alarma.

## Costo

Los recursos de esta plantilla se mantienen dentro de la capa gratuita de AWS
mientras el uso sea el de un proyecto academico: cien minutos mensuales de
construccion en el tipo `BUILD_GENERAL1_SMALL`, una canalizacion activa, el
almacenamiento de imagenes bajo quinientos megabytes en ECR y tres paneles de
CloudWatch. La regla de ciclo de vida del repositorio principal conserva
unicamente las diez imagenes mas recientes para que el almacenamiento no crezca
sin control.

Conviene revisar las condiciones vigentes de la capa gratuita antes de desplegar,
porque los limites cambian con el tiempo.

## Para eliminar todo

```bash
aws cloudformation delete-stack --stack-name pda-devops
```

El bucket de artefactos y el repositorio principal de imagenes estan marcados
para conservarse, de modo que deben vaciarse y eliminarse manualmente si ya no se
necesitan.

## Que queda pendiente de la rubrica

AWS cubre el control de versiones, la canalizacion de construccion y pruebas, el
registro de imagenes y el panel de indicadores. No ofrece un equivalente directo
de dos componentes que la entrega solicita: el tablero de trabajo con epicas,
caracteristicas e historias de usuario, y el gestor de planes de prueba. Para
esos dos puntos hay dos caminos razonables. El primero es usar GitHub Projects y
GitHub Issues, que ya viven junto al repositorio y permiten modelar epicas,
historias y tareas. El segundo es abrir una organizacion gratuita de Azure DevOps
y utilizar unicamente Azure Boards y Azure Test Plans, sin Azure Pipelines. Esta
segunda via es la que se apega de forma literal al enunciado.
