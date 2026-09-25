# Plataforma Perfect Dance Academy

Plataforma de transformacion digital de Perfect Dance Academy, academia de danza
ubicada en San Miguel Petapa, Guatemala. Este repositorio corresponde a la
implementacion DevOps de la primera fase: el codigo contenerizado de los modulos
del nucleo, el entorno reproducible de desarrollo y la canalizacion de
integracion continua.

Proyecto academico de la Facultad de Ingenieria en Sistemas de Informacion,
Universidad Mariano Galvez de Guatemala.

---

## Arquitectura en una linea

Un solo codigo fuente organizado en modulos de dominio, que puede desplegarse de
dos maneras: como un contenedor unico con los cuatro modulos montados, o como
cuatro contenedores independientes detras de una puerta de enlace. El monolito
modular es la topologia de la primera version; la separacion por modulos es la
evolucion prevista y esta disponible desde ya, sin bifurcar el codigo.

| Modulo | Dominio de negocio | Puerto |
| --- | --- | --- |
| `auth` | Identidad, autenticacion y control de acceso por rol | 3001 |
| `catalogo` | Disciplinas, niveles, clases, horarios y cupo disponible | 3002 |
| `inscripcion` | Solicitud de la aspirante, resolucion y registro de la alumna | 3003 |
| `pagos` | Mensualidades, transacciones y comprobantes | 3004 |

El recorrido central de la plataforma es el de inscripcion y registro. La
aspirante o su encargado envian una solicitud indicando la disciplina de interes;
la direccion la acepta o la rechaza; y al aceptarla se crea el expediente de la
alumna y se le asigna, en una sola operacion, su clase con su horario y su
docente.

---

## Publicar este repositorio en GitHub

```bash
git init
git add .
git commit -m "Entrega 8: implementacion DevOps 1"
git branch -M main
git remote add origin https://github.com/USUARIO/pda-platform.git
git push -u origin main
git checkout -b develop && git push -u origin develop
```

Antes del primer envio conviene confirmar que `.env` no aparece en
`git status`: debe estar cubierto por `.gitignore`.

## Requisitos

- Docker Engine 24 o superior con el complemento Compose v2
- Node.js 20 o superior, solo si se desea ejecutar las pruebas fuera de contenedores
- Git

## Puesta en marcha

```bash
git clone https://github.com/USUARIO/pda-platform.git
cd pda-platform
cp .env.example .env          # completar los valores antes de continuar
docker compose --profile monolito up -d --build
```

La primera vez, PostgreSQL ejecuta los scripts de `db/init` y deja el esquema con
datos de demostracion. Para comprobar que todo respondio:

```bash
curl http://localhost:3000/health
curl http://localhost:3000/api/catalogo/disciplinas
```

Para levantar la topologia por modulos, con la puerta de enlace en el puerto
8080:

```bash
docker compose --profile microservicios up -d --build
curl http://localhost:8080/api/catalogo/disciplinas
curl http://localhost:8080/health/inscripcion
```

Para detener y limpiar:

```bash
docker compose --profile monolito down          # conserva los datos
docker compose --profile monolito down -v       # elimina tambien los volumenes
```

## Credenciales de demostracion

Solo existen en el entorno local y corresponden a personas ficticias.

| Correo | Contrasena | Rol |
| --- | --- | --- |
| `direccion@pda.local` | `Pda2026*admin` | Administrador |
| `docente@pda.local` | `Pda2026*docente` | Docente |
| `encargado@pda.local` | `Pda2026*encargado` | Encargado/Alumna |

## Recorrido completo de ejemplo

```bash
# 1. Consultar la oferta academica (publico)
curl http://localhost:3000/api/catalogo/disciplinas

# 2. Enviar una solicitud de inscripcion (publico)
curl -X POST http://localhost:3000/api/inscripcion/solicitudes \
  -H 'Content-Type: application/json' \
  -d '{"nombreAspirante":"Sofia Ruiz","fechaNacimiento":"2016-03-14",
       "idDisciplina":1,"nombreEncargado":"Ana Ruiz",
       "correoContacto":"encargado@pda.local"}'

# 3. Iniciar sesion como direccion
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"correo":"direccion@pda.local","contrasena":"Pda2026*admin"}' \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

# 4. Aceptar la solicitud y registrar a la alumna en una clase
curl -X POST http://localhost:3000/api/inscripcion/solicitudes/1/aceptar \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"idClase":1,"idNivel":1}'

# 5. Consultar la mensualidad generada automaticamente
curl -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3000/api/pagos/mensualidades?alumna=1'
```

## Estructura del repositorio

```
pda-platform/
├── src/
│   ├── core/                 Configuracion, base de datos, cache, seguridad, errores
│   ├── modules/
│   │   ├── auth/             Identidad y control de acceso
│   │   ├── catalogo/         Oferta academica
│   │   ├── inscripcion/      Solicitud, resolucion y registro
│   │   └── pagos/            Mensualidades y comprobantes
│   └── server.js             Punto de entrada unico para ambas topologias
├── docker/
│   ├── Dockerfile            Imagen del monolito modular
│   ├── auth/Dockerfile       Imagen del modulo de identidad
│   ├── catalogo/Dockerfile   Imagen del modulo de catalogo
│   ├── inscripcion/Dockerfile
│   ├── pagos/Dockerfile
│   └── gateway/nginx.conf    Enrutado por prefijo para la topologia por modulos
├── public/                   Consola operativa: pantalla estatica servida por la aplicacion
├── db/init/                  Esquema y datos semilla que PostgreSQL ejecuta al crearse
├── scripts/
│   ├── migrar.js             Aplica el esquema y la semilla en local y en staging
│   ├── esperar-salud.js      Espera a que un despliegue quede en verde
│   └── url-staging.sh        Resuelve la direccion publica del entorno de staging
├── tests/
│   ├── unitarias/            Reglas de negocio aisladas
│   ├── integracion/          Contrato HTTP de cada modulo
│   ├── seguridad/            Superficie HTTP: cabeceras, acceso y entrada no confiable
│   └── e2e/                  Sistema, aceptacion, seguridad y rendimiento con Playwright
├── docs/
│   ├── plan-de-pruebas.md    Plan completo con los veinticuatro casos
│   ├── pipeline-cicd.md      Las cuatro etapas de la canalizacion y su evidencia
│   ├── despliegue-staging.md Configuracion de GitHub y AWS, comandos y desmontaje
│   ├── configuracion-aws.md  Canalizacion alternativa con CodePipeline
│   └── flujo-de-trabajo.md   Convencion de ramas, mensajes y revision
├── .github/workflows/
│   ├── ci.yml                Canalizacion de cuatro etapas
│   └── demostracion-fallo.yml  Ejecucion fallida controlada, para la evidencia
├── infra/
│   ├── staging.yml           Entorno de staging: red, RDS, ECS Fargate y panel
│   ├── oidc-github.yml       Confianza entre GitHub Actions y la cuenta de AWS
│   └── pipeline.yml          Canalizacion de AWS CodePipeline
├── playwright.config.js      Cuatro proyectos de prueba y reporte HTML
├── eslint.config.js          Analisis estatico
├── buildspec.yml             Fases de construccion para AWS CodeBuild
└── docker-compose.yml        Entorno completo con PostgreSQL y Redis
```

## Pruebas

La bateria esta en dos niveles. El primero no necesita infraestructura de
ninguna clase; el segundo corre contra la plataforma desplegada de verdad.

```bash
npm ci

# Nivel 1: 96 casos con PostgreSQL y Redis sustituidos por dobles (menos de 1 s)
npm test
npm run test:unitarias
npm run test:integracion
npm run test:seguridad
npm run test:ci             # con reporte JUnit y cobertura, como en el servidor

# Nivel 2: 45 casos contra el entorno completo levantado
npm run entorno:arriba
npm run salud
npx playwright install chromium   # solo la primera vez
npm run e2e                 # sistema, aceptacion, seguridad y rendimiento
npm run e2e:aceptacion      # una sola suite

# Reportes
npm run reporte:e2e         # reporte HTML navegable de Playwright
npm run reporte:cobertura   # cobertura de codigo en coverage/index.html
```

Antes de una ejecucion de la que se vaya a tomar evidencia, conviene devolver la
base a su estado conocido con `npm run datos:reiniciar`.

El plan completo —objetivos, alcance, tipos de prueba, veinticuatro casos
detallados, estrategia y parametros del sistema— esta en
`docs/plan-de-pruebas.md`.

## Consola operativa

La plataforma sirve una consola en la raiz del sitio: `http://localhost:3000`.
Desde ella se recorre el proceso completo —consultar la oferta, enviar una
solicitud, aceptarla asignando clase y nivel, y cobrar la mensualidad— contra la
misma API HTTP que consumiria cualquier otro cliente. Es la superficie que
ejercitan las pruebas de aceptacion en navegador.

## Integracion y entrega continua

La canalizacion vive en `.github/workflows/ci.yml` y tiene cuatro etapas
encadenadas. Cada una es una puerta: si no pasa, las siguientes no se ejecutan y
nada llega al entorno de staging.

| Etapa | Que hace |
| --- | --- |
| 1. Verificacion | Obtiene el codigo, instala, analisis estatico y bateria de Jest |
| 2. Construccion | Construye las cinco imagenes, comprueba que arrancan y las publica en Amazon ECR |
| 3. Pruebas end to end | Levanta el entorno completo y corre las cuatro suites de Playwright |
| 4. Despliegue | Migra la base y actualiza el servicio de staging en Amazon ECS |

Una solicitud de incorporacion ejecuta las etapas 1 a 3 sin publicar ni
desplegar nada. Una fusion hacia `main` ejecuta las cuatro y deja la version
corriendo en staging.

- Detalle de las etapas y como obtener evidencia de ejecuciones exitosas y
  fallidas: `docs/pipeline-cicd.md`
- Configuracion de GitHub y de AWS, con todos los comandos: `docs/despliegue-staging.md`
- Canalizacion alternativa con AWS CodePipeline, de la entrega anterior:
  `docs/configuracion-aws.md`

## Variables de entorno

Todas se documentan en `.env.example`. El archivo `.env` nunca se versiona. Las
tres que deben cambiarse obligatoriamente antes de cualquier despliegue real son
`POSTGRES_PASSWORD`, `JWT_SECRET` y las credenciales de la pasarela de pagos.

## Nota sobre datos sensibles

La plataforma administra datos de menores de edad y nunca almacena informacion de
tarjetas: los datos de pago se entregan directamente a la pasarela certificada y
la base de datos conserva unicamente la referencia de la transaccion. Las
contrasenas se guardan siempre como hash. Las operaciones sensibles quedan
registradas en la bitacora de auditoria con usuario, fecha y hora.

## Equipo

| Integrante | Rol |
| --- | --- |
| Jorge Roberto Guerra Solorzano | Product Owner |
| Ludwin Humberto Cortez Dolores | Scrum Master |
| Jonathan Emanuel Garcia Davila | Desarrollo backend y pagos |
| Josue Daniel Garcia Vasquez | Desarrollo frontend y documentacion |

## Licencia

Proyecto academico sin fines comerciales.
