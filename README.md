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
├── db/init/                  Esquema y datos semilla que PostgreSQL ejecuta al crearse
├── tests/
│   ├── unitarias/            Reglas de negocio aisladas
│   └── integracion/          Contrato HTTP de cada modulo
├── docs/                     Configuracion de AWS, flujo de trabajo y plan de pruebas
├── infra/pipeline.yml        Plantilla CloudFormation de la canalizacion
├── buildspec.yml             Fases de construccion para AWS CodeBuild
└── docker-compose.yml        Entorno completo con PostgreSQL y Redis
```

## Pruebas

```bash
npm ci
npm test            # 56 casos, sin dependencias externas
npm run test:ci     # con reporte JUnit y cobertura
```

Las pruebas no requieren PostgreSQL ni Redis: ambos se sustituyen por dobles, de
modo que la bateria corre igual en una maquina local y en el servidor de
construccion. El plan completo esta en `docs/plan-de-pruebas.md`.

## Integracion continua

Cada cambio en la rama principal dispara la canalizacion de AWS CodePipeline, que
instala dependencias, ejecuta la bateria de pruebas, construye las cinco imagenes
y las publica en Amazon ECR. Si una prueba falla, ninguna imagen se publica. Los
indicadores de construccion se concentran en un panel de Amazon CloudWatch.

La guia paso a paso para dejarla operativa esta en `docs/configuracion-aws.md`.
De forma complementaria, `.github/workflows/ci.yml` corre las mismas pruebas
sobre cada solicitud de incorporacion de cambios, antes de que el codigo llegue a
la rama principal.

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
