# Canalizacion de integracion y entrega continua

**Archivo:** `.github/workflows/ci.yml`
**Plataforma:** GitHub Actions
**Entrega:** Octava — Implementacion DevOps 1

---

## 1. Que resuelve

Antes de la canalizacion, cada integrante probaba en su maquina y el codigo se
fusionaba confiando en esa palabra. Con la canalizacion, ninguna version llega a
un entorno sin haber pasado por las mismas cuatro puertas, ejecutadas en la
misma maquina limpia y con el mismo resultado observable por todo el equipo.

El principio es uno solo: **una version que falla una prueba no avanza**. No se
construye su imagen, no se publica en el registro y no toca el entorno de
staging.

---

## 2. Las cuatro etapas

```
  Cambio confirmado
         |
         v
+-------------------------+
| 1. VERIFICACION         |  Obtener el codigo
|                         |  Instalar dependencias
|                         |  Analisis estatico (ESLint)
|                         |  Bateria de Jest: unitarias,
|                         |  integracion y seguridad
+-------------------------+
         |                \
         |                 \
         v                  v
+-------------------------+  +-------------------------------+
| 2. CONSTRUCCION         |  | 3. PRUEBAS END TO END         |
|                         |  |                               |
| Cinco imagenes          |  | Docker Compose levanta el     |
| Prueba de humo de la    |  | entorno completo              |
| imagen del monolito     |  | Playwright: sistema,          |
| Publicacion en ECR      |  | aceptacion, seguridad y       |
| (solo desde main)       |  | rendimiento                   |
+-------------------------+  +-------------------------------+
         |                           |
         +-------------+-------------+
                       |
                       v
         +-------------------------------+
         | 4. DESPLIEGUE A STAGING       |   solo desde main
         |                               |
         | Migracion de base de datos    |
         | Nueva revision de la tarea    |
         | Actualizacion del servicio    |
         | Prueba de humo contra la      |
         | direccion publica             |
         +-------------------------------+
```

Las etapas 2 y 3 se ejecutan en paralelo: ambas dependen solo de la 1, y
ninguna de la otra. Es lo que mantiene la canalizacion completa por debajo de
los veinticinco minutos.

### Etapa 1 — Verificacion

| Paso | Herramienta | Falla si |
| --- | --- | --- |
| Obtener el codigo | `actions/checkout` | El repositorio no esta accesible |
| Preparar Node.js 20 con cache de dependencias | `actions/setup-node` | — |
| Instalar dependencias exactas | `npm ci` | `package-lock.json` no concuerda con `package.json` |
| Analisis estatico | `npm run lint` | Hay variables sin uso, referencias inexistentes u otros errores |
| Bateria de pruebas | `npm run test:ci` | Cualquier caso falla |
| Publicar reportes | `actions/upload-artifact` | — |

Produce el artefacto **reporte-jest** con el resultado en formato JUnit y la
cobertura de codigo, y un resumen en la pagina de la ejecucion con el conteo de
casos ejecutados y fallidos.

### Etapa 2 — Construccion

Construye las cinco imagenes —el monolito y los cuatro modulos— con cache de
capas entre ejecuciones, y despues **arranca la imagen del monolito y espera a
que responda la sonda de vida**. Una imagen que construye pero no arranca es un
fallo que conviene descubrir aqui y no en el despliegue.

La publicacion en Amazon ECR ocurre unicamente cuando se cumplen tres
condiciones a la vez: la rama es `main`, la variable `DESPLIEGUE_HABILITADO`
vale `true` y el rol de federacion esta configurado. Sobre una solicitud de
incorporacion las imagenes se construyen pero no se publican: la propuesta se
verifica entera sin tocar ningun registro ni ningun entorno.

La etiqueta de cada imagen son los ocho primeros caracteres del commit. Nunca se
despliega `latest`: la etiqueta identifica sin ambiguedad que codigo esta
corriendo en staging.

### Etapa 3 — Pruebas end to end

Levanta la plataforma completa dentro del servidor de construccion —PostgreSQL
con su esquema y sus disparadores, Redis y la aplicacion—, espera a que la
sonda de salud quede en verde y ejecuta las cuatro suites de Playwright.

Produce el artefacto **reporte-playwright** con el reporte HTML navegable. Ante
un fallo, el reporte incluye la captura de pantalla y el video del navegador en
el instante del error, y el paso siguiente vuelca los ultimos doscientos
renglones de registro de cada contenedor.

### Etapa 4 — Despliegue a staging

Se ejecuta solo desde `main` y solo si las etapas 2 y 3 terminaron en verde.

1. **Migracion.** Lanza una tarea puntual de Fargate con la misma imagen y el
   comando `node scripts/migrar.js`. La tarea corre dentro de la red privada,
   que es el unico lugar desde donde se alcanza la base de datos. Si termina con
   codigo distinto de cero, el despliegue se detiene ahi.
2. **Nueva revision de la tarea.** Toma la definicion vigente, le fija la imagen
   recien publicada y registra una revision nueva.
3. **Actualizacion del servicio.** Actualiza el servicio de ECS y espera a que
   estabilice. El interruptor de circuito de despliegue esta activo: si la tarea
   nueva no arranca, ECS revierte a la anterior por su cuenta.
4. **Prueba de humo.** Resuelve la direccion publica de la tarea, espera a que
   la sonda de salud responda y ejecuta las comprobaciones de solo lectura de la
   suite de sistema contra el entorno recien desplegado.

---

## 3. Cuando se dispara

| Evento | Etapas 1, 2 (construir) y 3 | Etapa 2 (publicar) | Etapa 4 |
| --- | --- | --- | --- |
| Confirmacion en una rama de trabajo | No | No | No |
| Solicitud de incorporacion hacia `develop` o `main` | Si | No | No |
| Fusion o confirmacion en `develop` | Si | No | No |
| Fusion o confirmacion en `main` | Si | Si | Si |
| Ejecucion manual desde la pestania Actions | Si | Segun la rama | Segun la rama |

Solo se ejecuta una canalizacion por rama a la vez. Si llegan dos cambios
seguidos a `main`, se cancela la ejecucion anterior: no tiene sentido desplegar
una version que ya quedo obsoleta, y evita que dos despliegues se pisen sobre el
mismo entorno.

---

## 4. Evidencia de ejecuciones exitosas y fallidas

### Ejecucion exitosa

Se obtiene fusionando cualquier cambio hacia `main`. Las capturas utiles son
tres: la vista de la ejecucion con las cuatro etapas en verde, la pestania de
resumen con las tablas que genera cada etapa, y la lista de artefactos al pie de
la pagina.

### Ejecucion fallida

Romper una prueba a proposito en una rama y confirmarla deja basura en la
historia del repositorio. Para evitarlo, el repositorio incluye el flujo
**Demostracion de ejecucion fallida** (`.github/workflows/demostracion-fallo.yml`),
que se ejecuta a mano y produce la misma evidencia sin modificar nada:

1. Entrar a la pestania **Actions** del repositorio.
2. Elegir **Demostracion de ejecucion fallida** en la lista de la izquierda.
3. Pulsar **Run workflow**, elegir el tipo de defecto y confirmar.

| Tipo de defecto | Que hace | Que lo detecta |
| --- | --- | --- |
| `regla-de-negocio` | Invierte la comparacion del limite inferior de edad | CP-U02 y CP-I03: una aspirante de 3 anios pasaria a aceptarse en una disciplina cuya edad minima es 4 |
| `contrato-http` | Cambia el codigo de respuesta del recurso creado, de 201 a 200 | CP-I03 y CP-I04 |
| `analisis-estatico` | Introduce una variable que nadie usa | El paso de ESLint, antes incluso de ejecutar una sola prueba |

El defecto solo existe en la copia de trabajo del servidor y desaparece al
terminar la ejecucion. El registro muestra la diferencia introducida, de modo
que la captura explica por si sola que se rompio y que lo detecto.

---

## 5. Configuracion requerida en GitHub

En **Settings → Secrets and variables → Actions → Variables**:

| Variable | Valor | Para que |
| --- | --- | --- |
| `AWS_REGION` | `us-east-1` | Region donde vive la infraestructura |
| `AWS_ROL_DESPLIEGUE` | ARN del rol creado por `infra/oidc-github.yml` | Identidad que asume la canalizacion |
| `DESPLIEGUE_HABILITADO` | `true` | Interruptor general de las etapas que tocan AWS |
| `PILA_STAGING` | `pda-staging` | Nombre de la pila de CloudFormation, si se cambio el predeterminado |

No se guarda ningun secreto: la canalizacion obtiene credenciales temporales por
federacion de identidad y las pierde al terminar. No hay llaves de acceso de
larga duracion en el repositorio ni en la configuracion de GitHub.

En **Settings → Environments** se crea el entorno `staging`. Es opcional
exigirle aprobacion manual antes de desplegar; si se activa, la etapa 4 queda en
espera hasta que alguien la autorice, lo que resulta util el dia de la
presentacion.

En **Settings → Branches** conviene proteger `main`: exigir solicitud de
incorporacion, una aprobacion y que las etapas 1 y 3 hayan pasado en verde.

El procedimiento completo, con los comandos de AWS, esta en
`docs/despliegue-staging.md`.

---

## 6. Si `DESPLIEGUE_HABILITADO` no esta en `true`

La canalizacion funciona igual: verifica, construye las cinco imagenes y ejecuta
las cuatro suites end to end. Lo unico que no ocurre es la publicacion en ECR y
el despliegue, que aparecen como etapas omitidas en la vista de la ejecucion.

Es el modo en que conviene trabajar mientras la cuenta de AWS no este lista, y
el modo al que conviene volver despues de la presentacion, cuando la
infraestructura se elimine.

---

## 7. Relacion con la canalizacion de AWS

El repositorio conserva `infra/pipeline.yml`, que crea una canalizacion
equivalente con CodePipeline y CodeBuild. Corresponde a la implementacion
nativa de AWS y se documenta en `docs/configuracion-aws.md`.

Las dos hacen lo mismo hasta la publicacion de imagenes. La de GitHub Actions es
la que esta en uso porque no consume minutos de construccion facturables,
ejecuta las pruebas end to end con Docker Compose sin infraestructura adicional
y despliega a staging. La de AWS se conserva como alternativa documentada y como
evidencia del trabajo de la entrega anterior.

**No conviene tener las dos activas contra la misma rama:** ambas publicarian
sobre el mismo registro de imagenes. Si se despliega `infra/pipeline.yml`,
apagar la deteccion de cambios de su etapa de origen o dejar
`DESPLIEGUE_HABILITADO` en `false`.
