# Integracion continua, entrega continua y plan de pruebas

**Proyecto:** Plataforma de transformacion digital de Perfect Dance Academy
**Entrega:** Octava — Implementacion DevOps 1
**Fecha de entrega:** 26 de septiembre de 2026
**Universidad Mariano Galvez de Guatemala**
Facultad de Ingenieria en Sistemas de Informacion — Seminario

**Lenguaje de programacion:** JavaScript sobre Node.js 20 LTS
**Sistema gestor de base de datos:** PostgreSQL 16
**Plataforma de canalizacion:** GitHub Actions
**Repositorio:** un unico repositorio con codigo, pruebas, documentacion e infraestructura

---

## Indice

**Parte I — Integracion continua y entrega continua**
1. Que problema resuelve y por que se agrego
2. Lo que habia antes y lo que hay ahora
3. Arquitectura de la canalizacion
4. Las cuatro etapas, en detalle
5. Cuando se dispara cada etapa
6. Que detiene la entrega
7. Entrega continua hasta staging
8. Trazabilidad de versiones
9. Manejo de credenciales

**Parte II — Plan de pruebas**
10. Proposito
11. Objetivos
12. Alcance
13. Parametros del sistema
14. Tipos de prueba
15. Estrategia de pruebas
16. Casos de prueba
17. Ejecucion del plan de pruebas
18. Resultados obtenidos
19. Verificaciones manuales
20. Metricas y criterios de aceptacion

**Parte III — Pipeline CI/CD funcional**
21. El archivo de la canalizacion
22. Flujo de demostracion de fallo
23. Anexo: equivalencia en GitLab CI y en Jenkins

**Parte IV — Evidencia**
24. Capturas de las ejecuciones
25. Como reproducir todo desde cero

---
---

# Parte I — Integracion continua y entrega continua

## 1. Que problema resuelve y por que se agrego

Antes de esta entrega, cada integrante probaba en su maquina y el codigo se
fusionaba confiando en esa palabra. Tres cosas fallaban de forma recurrente:

- **"En mi maquina si funciona".** Una dependencia instalada localmente, una
  variable de entorno puesta a mano o una base de datos con datos viejos hacian
  que el mismo codigo se comportara distinto en dos computadoras.
- **Defectos descubiertos tarde.** Un error introducido el lunes aparecia el
  jueves, cuando ya habia cinco cambios encima y era costoso saber cual lo causo.
- **Despliegue manual y ceremonioso.** Publicar una version requeria recordar
  una secuencia de pasos, y cualquier olvido se pagaba en el entorno.

La **integracion continua** ataca los dos primeros: cada cambio propuesto se
construye y se prueba de forma automatica, en una maquina limpia, con el mismo
procedimiento para todos. Si algo se rompe, se sabe en minutos y se sabe cual
cambio lo rompio.

La **entrega continua** ataca el tercero: una version que pasa todas las
verificaciones se despliega sola a un entorno de staging, sin que nadie ejecute
comandos a mano.

El principio que gobierna todo el diseno es uno solo:

> **Una version que falla una prueba no avanza.** No se construye su imagen, no
> se publica en el registro y no toca ningun entorno.

## 2. Lo que habia antes y lo que hay ahora

| Aspecto | Antes de esta entrega | Despues |
| --- | --- | --- |
| Ejecucion de pruebas | Manual, en la maquina de cada quien | Automatica en cada propuesta de cambio y cada fusion |
| Cantidad de pruebas | 56 casos, solo unitarias e integracion | 141 casos en seis tipos de prueba |
| Analisis estatico | Inexistente (el guion `lint` estaba declarado pero sin herramienta instalada) | ESLint 9, y es la primera puerta de la canalizacion |
| Pruebas en navegador | Ninguna | 13 casos de aceptacion sobre una consola operativa |
| Pruebas de seguridad | Ninguna especifica | 40 casos entre los dos niveles |
| Pruebas de rendimiento | Ninguna | 5 casos con medicion por percentil |
| Construccion de imagenes | Manual, y de hecho nunca se habian construido | Automatica, con comprobacion de que la imagen arranca |
| Despliegue | Inexistente | Automatico a staging en Amazon ECS tras cada fusion a `main` |
| Reportes | Ninguno | JUnit, cobertura de codigo y reporte HTML navegable, conservados 14 dias |
| Credenciales de despliegue | No aplicaba | Federacion de identidad, sin ninguna llave almacenada |

Lo que se agrego, archivo por archivo:

| Archivo | Que aporta |
| --- | --- |
| `.github/workflows/ci.yml` | La canalizacion de cuatro etapas |
| `.github/workflows/demostracion-fallo.yml` | Ejecucion fallida controlada, para evidencia |
| `playwright.config.js` | Cuatro proyectos de prueba y el reporte HTML |
| `eslint.config.js` | Reglas de analisis estatico |
| `tests/e2e/` | Sistema, aceptacion, seguridad y rendimiento |
| `tests/seguridad/` | Superficie HTTP: cabeceras, acceso y entrada no confiable |
| `tests/unitarias/seguridad.test.js` | Token de sesion y control de acceso |
| `tests/integracion/consola.test.js` | Entrega de la consola operativa |
| `public/` | Consola operativa, superficie de las pruebas de aceptacion |
| `scripts/migrar.js` | Aplica el esquema en local y en staging |
| `scripts/esperar-salud.js` | Espera a que un despliegue quede en verde |
| `scripts/url-staging.sh` | Resuelve la direccion publica de staging |
| `infra/staging.yml` | Entorno de staging: red, base de datos, contenedores y panel |
| `infra/oidc-github.yml` | Confianza entre GitHub Actions y la cuenta de AWS |

## 3. Arquitectura de la canalizacion

```
                        Cambio confirmado y enviado
                                    |
                                    v
                  +---------------------------------+
                  |  ETAPA 1 - VERIFICACION         |
                  |                                 |
                  |  Obtener el codigo              |
                  |  Instalar dependencias exactas  |
                  |  Analisis estatico (ESLint)     |
                  |  96 casos de Jest               |
                  |  Reporte JUnit + cobertura      |
                  +---------------------------------+
                        |                       |
              +---------+                       +---------+
              v                                           v
  +---------------------------+         +-------------------------------+
  |  ETAPA 2 - CONSTRUCCION   |         |  ETAPA 3 - PRUEBAS END TO END |
  |                           |         |                               |
  |  Cinco imagenes           |         |  Docker Compose levanta        |
  |  Arranque real de la      |         |  PostgreSQL, Redis y la app    |
  |  imagen y sonda de vida   |         |  45 casos de Playwright:       |
  |  Publicacion en Amazon    |         |  sistema, aceptacion,          |
  |  ECR (solo desde main)    |         |  seguridad y rendimiento       |
  |                           |         |  Reporte HTML navegable        |
  +---------------------------+         +-------------------------------+
              |                                           |
              +---------------------+---------------------+
                                    |
                                    v
                  +---------------------------------+
                  |  ETAPA 4 - DESPLIEGUE           |   solo desde main
                  |                                 |
                  |  Migracion de base de datos     |
                  |  Nueva revision de la tarea     |
                  |  Actualizacion del servicio     |
                  |  Prueba de humo contra la       |
                  |  direccion publica              |
                  +---------------------------------+
                                    |
                                    v
                        Version corriendo en staging
```

Las etapas 2 y 3 corren en paralelo: ambas dependen solo de la 1 y ninguna de la
otra. Es lo que mantiene la canalizacion completa por debajo de los veinticinco
minutos.

## 4. Las cuatro etapas, en detalle

### Etapa 1 — Verificacion

| Paso | Herramienta | Falla si |
| --- | --- | --- |
| Obtener el codigo | `actions/checkout@v4` | El repositorio no esta accesible |
| Preparar Node.js 20 con cache | `actions/setup-node@v4` | — |
| Instalar dependencias exactas | `npm ci` | `package-lock.json` no concuerda con `package.json` |
| Analisis estatico | `npm run lint` | Hay variables sin uso, referencias inexistentes u otros errores |
| Bateria de pruebas | `npm run test:ci` | Cualquiera de los 96 casos falla |
| Publicar reportes | `actions/upload-artifact@v4` | — |

Se usa `npm ci` y no `npm install` a proposito: instala exactamente las
versiones del archivo de candado, de modo que la canalizacion construye siempre
con las mismas dependencias y no con la version mas reciente que exista ese dia.

Produce el artefacto **reporte-jest** y un resumen en la pagina de la ejecucion
con el conteo de casos ejecutados y fallidos.

### Etapa 2 — Construccion

Construye las cinco imagenes —el monolito y los cuatro modulos— con cache de
capas entre ejecuciones. Despues hace algo que no es habitual y que vale la
pena: **arranca la imagen del monolito y espera a que responda la sonda de
vida**. Una imagen que construye pero no arranca es un fallo que conviene
descubrir aqui y no en el despliegue.

La publicacion en Amazon ECR ocurre solo si se cumplen tres condiciones a la
vez: la rama es `main`, la variable `DESPLIEGUE_HABILITADO` vale `true` y el rol
de federacion esta configurado. Sobre una solicitud de incorporacion las
imagenes se construyen pero no se publican: la propuesta se verifica entera sin
tocar ningun registro ni ningun entorno.

### Etapa 3 — Pruebas end to end

Levanta la plataforma completa dentro del servidor de construccion —PostgreSQL
con su esquema y sus disparadores, Redis y la aplicacion—, espera a que la sonda
de salud quede en verde y ejecuta las cuatro suites de Playwright.

Este nivel existe porque hay reglas que **no se pueden comprobar con dobles**:
el cupo maximo por clase y la generacion automatica de la mensualidad viven en
disparadores del motor de base de datos, no en el codigo de la aplicacion. La
unica forma de probarlas es contra un PostgreSQL real.

Produce el artefacto **reporte-playwright** con el reporte HTML navegable. Ante
un fallo, el reporte incluye la captura de pantalla y el video del navegador en
el instante del error, y el paso siguiente vuelca los ultimos doscientos
renglones de registro de cada contenedor.

### Etapa 4 — Despliegue a staging

Se ejecuta solo desde `main` y solo si las etapas 2 y 3 terminaron en verde.

1. **Migracion.** Lanza una tarea puntual de Fargate con la misma imagen y el
   comando `node scripts/migrar.js`. Corre dentro de la red privada, que es el
   unico lugar desde donde se alcanza la base de datos. Si termina con codigo
   distinto de cero, el despliegue se detiene ahi.
2. **Nueva revision de la tarea.** Toma la definicion vigente, le fija la imagen
   recien publicada y registra una revision nueva.
3. **Actualizacion del servicio.** Actualiza el servicio de ECS y espera a que
   estabilice. El interruptor de circuito esta activo: si la tarea nueva no
   arranca, ECS revierte a la anterior por su cuenta.
4. **Prueba de humo.** Resuelve la direccion publica de la tarea, espera a que
   la sonda de salud responda y ejecuta las comprobaciones de solo lectura de la
   suite de sistema contra el entorno recien desplegado.

## 5. Cuando se dispara cada etapa

| Evento | Etapa 1 | Etapa 2 (construir) | Etapa 2 (publicar) | Etapa 3 | Etapa 4 |
| --- | --- | --- | --- | --- | --- |
| Confirmacion en una rama de trabajo | No | No | No | No | No |
| Solicitud de incorporacion hacia `develop` o `main` | Si | Si | No | Si | No |
| Fusion o confirmacion en `develop` | Si | Si | No | Si | No |
| Fusion o confirmacion en `main` | Si | Si | **Si** | Si | **Si** |
| Ejecucion manual desde la pestania Actions | Si | Si | Segun la rama | Si | Segun la rama |

Solo se ejecuta una canalizacion por rama a la vez. Si llegan dos cambios
seguidos a `main`, se cancela la ejecucion anterior: no tiene sentido desplegar
una version que ya quedo obsoleta, y evita que dos despliegues se pisen sobre el
mismo entorno.

## 6. Que detiene la entrega

Cualquiera de estas condiciones corta la canalizacion y deja la version fuera:

1. Un error de analisis estatico.
2. Cualquiera de los 96 casos de Jest que falle.
3. Una imagen que no construya.
4. Una imagen que construya pero no responda la sonda de vida.
5. Una definicion de Docker Compose invalida.
6. Cualquiera de los 45 casos de Playwright que falle.
7. Una migracion de base de datos que termine con error.
8. Un servicio de ECS que no logre estabilizar.
9. Una prueba de humo que no obtenga respuesta de la direccion publica.

## 7. Entrega continua hasta staging

El ciclo completo, desde que alguien escribe una linea hasta que esa linea esta
corriendo en AWS, no tiene ningun paso manual:

```
git checkout -b feature/HU-030-descuento
   ... trabajar ...
git commit -m "agregar(pagos): descuento por segunda hermana (HU-030)"
git push -u origin feature/HU-030-descuento
gh pr create --base develop --fill      --> etapas 1, 2 y 3; no despliega
gh pr merge --squash                    --> etapas 1, 2 y 3 sobre develop
git checkout main && git merge develop
git push origin main                    --> las cuatro etapas; despliega a staging
```

**Esa ultima linea es la que despliega.** Nadie ejecuta un comando de
despliegue.

## 8. Trazabilidad de versiones

La etiqueta de cada imagen son los ocho primeros caracteres del identificador
del commit. Nunca se despliega `latest`: la etiqueta identifica sin ambiguedad
que codigo esta corriendo.

Eso permite responder en un solo paso la pregunta que mas cuesta en un incidente
real: *que version exacta esta en el entorno*. La sonda `/health` devuelve la
version, y esa version corresponde a un commit concreto del repositorio.

## 9. Manejo de credenciales

**No hay ninguna llave de acceso guardada en GitHub.** La canalizacion se
autentica por federacion de identidad con OpenID Connect: GitHub emite un token
firmado que AWS verifica, y a cambio entrega credenciales temporales que expiran
al terminar la ejecucion.

El rol solo puede asumirse desde la rama `main` de este repositorio y desde su
entorno `staging`. Una rama de trabajo, o una bifurcacion del repositorio hecha
por un tercero, no obtiene credenciales.

En el entorno de staging, la contrasena de la base de datos y el secreto de
firma de los tokens los genera AWS Secrets Manager y nunca aparecen en la
plantilla, en el repositorio ni en la definicion de la tarea: el contenedor los
recibe por referencia al secreto.

---
---

# Parte II — Plan de pruebas

## 10. Proposito

Este plan define como se comprueba que la plataforma hace lo que el
levantamiento de requerimientos dice que debe hacer, y como se demuestra que
sigue haciendolo despues de cada cambio.

No es un documento de intenciones. Cada caso descrito corresponde a codigo que
se ejecuta: la linea *Ubicacion* de cada caso indica el archivo donde vive, y la
canalizacion los corre completos en cada propuesta de cambio y en cada fusion
hacia la rama principal. Un caso que no se puede ejecutar no pertenece a este
plan: pertenece a la lista de verificaciones manuales de la seccion 19.

## 11. Objetivos

**Objetivo general.** Verificar que la plataforma cumple los requerimientos
funcionales y no funcionales acordados, y que cada version que llega al entorno
de staging esta libre de defectos conocidos en el recorrido central del negocio.

**Objetivos especificos.**

1. Comprobar que el recorrido de inscripcion y registro —la solicitud de la
   aspirante, su aceptacion y la asignacion de clase, horario y docente— se
   resuelve como una sola operacion y no deja registros parciales (RF-020 a
   RF-023).
2. Comprobar que las reglas que viven en el motor de base de datos —el cupo
   maximo por clase y la generacion automatica de la mensualidad— se cumplen
   aunque la aplicacion intentara saltarlas (RN-004, RN-007).
3. Comprobar que el control de acceso por rol impide toda operacion que no
   corresponda al rol de quien la solicita (RF-001 a RF-006, RNF-015).
4. Comprobar que la plataforma responde dentro de los tiempos comprometidos en
   las pantallas de mayor consulta (RNF-001).
5. Comprobar que ningun dato sensible —contrasenas, hashes, datos de tarjeta,
   detalles internos del motor— sale en ninguna respuesta (RNF-016, RNF-017).
6. Dejar evidencia reproducible de cada ejecucion: reporte JUnit, cobertura de
   codigo y reporte HTML navegable.
7. Detener la entrega de cualquier version que no pase la totalidad de los casos
   automatizados.

## 12. Alcance

### 12.1 Incluido

| Componente | Que se prueba |
| --- | --- |
| Modulo `auth` | Inicio de sesion, emision y caducidad del token, control de acceso por rol, bitacora de auditoria |
| Modulo `catalogo` | Disciplinas, niveles, clases, cupo disponible, cache de lectura y su invalidacion |
| Modulo `inscripcion` | Solicitud, validacion de edad, aceptacion con registro completo, rechazo, reserva de cupo |
| Modulo `pagos` | Mensualidades, medios de pago, autorizacion en la pasarela, comprobante, doble cobro |
| Nucleo | Sonda de salud, formato de error, cabeceras de proteccion, limites del cuerpo de la peticion |
| Consola operativa | Recorrido completo desde el navegador, mensajes de error visibles, uso en pantalla pequena |
| Reglas del motor | Disparador de cupo maximo y disparador de generacion de mensualidad |
| Contenedores | Que las cinco imagenes construyen, arrancan y responden la sonda de vida |
| Canalizacion | Que una version con defectos no llega a staging |

### 12.2 Excluido

- Los modulos de eventos, tienda en linea y difusion, que no forman parte de
  esta fase.
- La pasarela de pagos real. La plataforma nunca recibe datos de tarjeta; el
  adaptador se ejercita en modo simulado y la integracion con el proveedor
  certificado se probara en preproduccion cuando exista contrato.
- Pruebas de carga sostenida y de estres. Las pruebas de rendimiento miden
  tiempo de respuesta con carga ligera, no el punto de quiebre.
- Compatibilidad con navegadores distintos de los declarados en la seccion 13.
- Recuperacion ante desastres y respaldo de la base de datos de produccion.

## 13. Parametros del sistema

### 13.1 Version del producto bajo prueba

| Elemento | Valor |
| --- | --- |
| Nombre | pda-platform |
| Version | 1.0.0 |
| Identificador de la version probada | primeros ocho caracteres del commit, visible en `/health` |
| Rama | `main` |

### 13.2 Plataforma de ejecucion

| Elemento | Valor |
| --- | --- |
| Lenguaje | JavaScript sobre Node.js 20 LTS |
| Marco de trabajo web | Express 4.19 |
| Sistema gestor de base de datos | PostgreSQL 16 |
| Cache | Redis 7 |
| Contenedores | Docker Engine 29.4.0, Compose v2 |
| Imagen base | `node:20-alpine` |

### 13.3 Entornos

| Entorno | Donde corre | Base de datos | Proposito |
| --- | --- | --- | --- |
| Local | Maquina del desarrollador, Docker Compose | PostgreSQL 16 en contenedor | Desarrollo y ejecucion completa del plan antes de proponer un cambio |
| Integracion continua | GitHub Actions, `ubuntu-latest` | PostgreSQL 16 en contenedor, efimero | Ejecucion automatica en cada propuesta y cada fusion |
| Staging | Amazon ECS sobre Fargate | Amazon RDS PostgreSQL 16, `db.t4g.micro` | Verificacion de la version desplegada y demostracion de la entrega |

### 13.4 Equipo de pruebas

| Elemento | Maquina de desarrollo | Servidor de integracion continua | Staging |
| --- | --- | --- | --- |
| Sistema operativo | macOS 15 (Darwin 25.6) | Ubuntu 24.04 LTS | Amazon Linux 2023 (Fargate) |
| Procesador | Apple Silicon, 8 nucleos | 4 nucleos virtuales x86-64 | 0.5 vCPU asignada a la tarea |
| Memoria | 16 GB | 16 GB | 1 GB asignado a la tarea |
| Almacenamiento | SSD NVMe | SSD | 20 GB gp2 en la base de datos |
| Red | Conexion domestica, 100 Mbps | Red de GitHub | VPC propia, `10.20.0.0/16` |

La diferencia de potencia entre las tres maquinas es la razon por la que los
umbrales de rendimiento estan holgados: un umbral ajustado a la maquina de
desarrollo convertiria cada ejecucion del servidor en un falso negativo, y una
bateria que falla sin motivo real es una bateria que el equipo aprende a
ignorar.

### 13.5 Navegadores

| Navegador | Version | Uso |
| --- | --- | --- |
| Chromium (empaquetado con Playwright) | 153.0.8010.12 | Pruebas de aceptacion automatizadas, en modo sin ventana |
| Google Chrome | 141 o superior | Revision manual de experiencia de uso |
| Safari | 18 | Revision manual de experiencia de uso en macOS |
| Chrome para Android | 141 o superior | Revision manual en pantalla de telefono |

Resoluciones: 1280x720 en las pruebas automatizadas de escritorio y 390x844 en
la comprobacion de pantalla angosta.

### 13.6 Herramientas

| Herramienta | Version | Funcion |
| --- | --- | --- |
| Jest | 29.7.0 | Pruebas unitarias, de integracion y de seguridad sobre la superficie HTTP |
| Supertest | 7.2.2 | Peticiones HTTP contra la aplicacion levantada en memoria |
| Playwright | 1.63.0 | Pruebas de sistema, aceptacion, seguridad y rendimiento contra el despliegue real |
| jest-junit | 16.0.0 | Reporte en formato JUnit para el servidor de integracion continua |
| ESLint | 9.39.5 | Analisis estatico previo a las pruebas |
| Postman | coleccion incluida en el repositorio | Exploracion manual de la API |

## 14. Tipos de prueba

### 14.1 Pruebas unitarias

Verifican una regla de negocio aislada, sin red, sin base de datos y sin
dependencias externas. Son las mas numerosas y las mas rapidas, lo que permite
ejecutarlas en cada guardado durante el desarrollo.

Cubren el calculo de edad de la aspirante y su validacion contra el rango de
cada disciplina, la emision y verificacion del token de sesion, y la traduccion
de errores a respuestas HTTP.

**Ubicacion:** `tests/unitarias/` — 19 casos.

### 14.2 Pruebas de integracion

Verifican el contrato HTTP de cada modulo: rutas, codigos de respuesta, forma
del cuerpo y comportamiento ante entradas invalidas. Se ejecutan sobre la
aplicacion completa levantada en memoria, con PostgreSQL y Redis sustituidos por
dobles.

La sustitucion es deliberada. Permite que la bateria corra en cualquier maquina
sin infraestructura previa, y que cada caso controle con exactitud que devuelve
la base de datos, incluidos los fallos que serian dificiles de provocar contra
un motor real.

**Ubicacion:** `tests/integracion/` — 54 casos.

### 14.3 Pruebas de sistema

Verifican el recorrido completo contra la plataforma desplegada de verdad:
contenedores en marcha, PostgreSQL con sus disparadores y Redis atendiendo. Es
el unico nivel donde se puede comprobar lo que vive en el motor y no en el
codigo.

**Ubicacion:** `tests/e2e/sistema-recorrido.spec.js` — 10 casos.

### 14.4 Pruebas de aceptacion

Reproducen en el navegador lo que hara una persona el dia de la puesta en
marcha. El criterio de aprobacion es el enunciado de la historia de usuario, no
el contrato tecnico: la prueba pasa si la encargada de una aspirante logra
enviar su solicitud y la direccion logra aceptarla, asignarle clase y cobrar la
mensualidad, viendo en pantalla lo que corresponde en cada paso.

**Ubicacion:** `tests/e2e/aceptacion-consola.spec.js` — 13 casos.

### 14.5 Pruebas de seguridad

Verifican los requerimientos no funcionales de proteccion, en dos niveles: sobre
la superficie HTTP con dobles, para cubrir muchos casos rapido, y contra el
despliegue real, para lo que depende de la configuracion del entorno.

Cubren cabeceras de proteccion, control de acceso sin sesion y con rol
insuficiente, rechazo de tokens falsificados o alterados, no divulgacion de
detalles internos del motor, tratamiento de entrada no confiable y ausencia de
datos de tarjeta en cualquier respuesta.

**Ubicacion:** `tests/seguridad/` (23 casos) y
`tests/e2e/seguridad-plataforma.spec.js` (17 casos).

### 14.6 Pruebas de rendimiento

Miden el tiempo de respuesta de las operaciones de mayor consulta contra el
despliegue real y lo comparan con el compromiso del requerimiento. Registran
minimo, media, percentil 95 y maximo de cada serie.

**Ubicacion:** `tests/e2e/rendimiento-catalogo.spec.js` — 5 casos.

### 14.7 Distribucion

| Nivel | Casos | Duracion medida | Frecuencia |
| --- | --- | --- | --- |
| Unitarias | 19 | incluidas en el segundo de Jest | Cada guardado, cada propuesta de cambio |
| Integracion | 54 | incluidas en el segundo de Jest | Cada guardado, cada propuesta de cambio |
| Seguridad con dobles | 23 | incluidas en el segundo de Jest | Cada propuesta de cambio |
| **Subtotal de Jest** | **96** | **1.0 s** | |
| Sistema | 10 | 1.7 s | Cada propuesta de cambio y cada fusion |
| Aceptacion | 13 | 6.5 s | Cada propuesta de cambio y cada fusion |
| Seguridad end to end | 17 | 2.6 s | Cada propuesta de cambio y cada fusion |
| Rendimiento | 5 | 1.3 s | Cada propuesta de cambio y cada fusion |
| **Subtotal de Playwright** | **45** | **14.2 s con el arranque del navegador** | |
| **Total automatizado** | **141** | | |
| Manuales de experiencia de uso | 6 | 30 min | Una vez por entrega |

La forma es deliberada: muchas pruebas baratas en la base y pocas caras en la
cima. Una bateria que tarda veinte minutos deja de ejecutarse.

## 15. Estrategia de pruebas

### 15.1 Automatizado frente a manual

Se automatiza todo lo que tenga un resultado esperado definido sin ambiguedad:
codigos de respuesta, contenido del cuerpo, estados en la base de datos, tiempos
de respuesta y presencia o ausencia de texto en la pantalla.

Se reserva a la revision manual lo que exige juicio humano: si el mensaje de
error se entiende sin conocer el sistema, si el orden de los campos acompania el
modo en que una persona llena el formulario, si la pantalla se lee comoda en el
telefono de la encargada.

### 15.2 Datos de prueba

Ningun dato corresponde a personas reales. `db/init/02_semilla.sql` siembra tres
usuarios de demostracion —uno por rol—, tres disciplinas, ocho niveles, cinco
clases y dos solicitudes pendientes. Las credenciales de demostracion solo
existen en local y en staging.

Cada prueba que crea datos usa un sufijo derivado de la marca de tiempo, y las
que necesitan una alumna con mensualidad pendiente **se la fabrican** en lugar
de apoyarse en la que dejo otra prueba. Esa decision es la que permite ejecutar
la bateria dos veces seguidas sin reiniciar el entorno y obtener el mismo
resultado.

### 15.3 Criterios de entrada

Una version entra a prueba cuando compila, el analisis estatico no reporta
errores y las cinco imagenes de contenedor construyen.

### 15.4 Criterios de salida

1. La totalidad de los casos automatizados pasa, sin excepciones ni casos
   omitidos por conveniencia.
2. La cobertura de sentencias de `src/` no baja respecto de la version anterior.
3. Ningun defecto de severidad alta o critica queda abierto.
4. Las verificaciones manuales de la seccion 19 estan ejecutadas y registradas.

### 15.5 Gestion de defectos

Los defectos se registran como incidencias en GitHub Issues, con la etiqueta
`defecto` y su severidad. Todo defecto corregido entra acompaniado de la prueba
automatizada que lo habria detectado: es la unica manera de garantizar que no
regresa.

| Severidad | Definicion | Respuesta |
| --- | --- | --- |
| Critica | Perdida de datos, cobro incorrecto o acceso no autorizado | Se detiene la entrega y se corrige de inmediato |
| Alta | Un recorrido principal no se puede completar | Se corrige antes de la entrega |
| Media | Funcion secundaria degradada, con rodeo disponible | Se programa para el sprint siguiente |
| Baja | Detalle de presentacion o de redaccion | Se acumula y se corrige por lotes |

### 15.6 Riesgos del plan y como se atienden

| Riesgo | Efecto | Como se atiende |
| --- | --- | --- |
| Los dobles ocultan un defecto real del motor | Un defecto llega a staging | Las reglas del motor se prueban ademas en el nivel de sistema, contra la base real |
| Las pruebas de rendimiento fallan por el ruido del servidor compartido | El equipo aprende a ignorar la bateria | Umbrales holgados, medicion por percentil y registro de la tendencia |
| Las pruebas end to end dejan datos que afectan la ejecucion siguiente | Fallos intermitentes | Datos con sufijo unico, cada prueba fabrica los suyos, ejecucion en serie |
| La cuenta de AWS agota la capa gratuita | El entorno de staging se apaga | El entorno se levanta para la demostracion y se elimina al terminar |
| Una prueba depende del orden de las demas | Fallos dificiles de reproducir | `workers: 1`, `fullyParallel: false` y verificacion con dos corridas seguidas |

## 16. Casos de prueba

Veinticuatro casos automatizados, agrupados por tipo. Cada uno indica su
identificador, el requerimiento o historia que cubre, sus precondiciones, sus
pasos, el resultado esperado, el resultado obtenido en la ejecucion del 25 de
septiembre de 2026 y el archivo donde vive.

### 16.1 Pruebas unitarias

#### CP-U01 — Calculo de la edad de la aspirante

| Campo | Contenido |
| --- | --- |
| **Tipo** | Unitaria |
| **Requerimiento** | RF-020, RN-002 |
| **Precondiciones** | Ninguna. La funcion no depende de red ni de base de datos. |
| **Pasos** | 1. Invocar `calcularEdad('2016-03-14')` con fecha de referencia 19/09/2026.<br>2. Invocar `calcularEdad('2016-12-01')` con la misma referencia.<br>3. Invocar `calcularEdad('2016-09-19')` con la misma referencia. |
| **Resultado esperado** | 10 anios en el primer caso, 9 en el segundo —el cumpleanios aun no ocurre— y 10 en el tercero, porque el anio se cumple el mismo dia. |
| **Resultado obtenido** | Aprobado (25/09/2026). Los tres calculos devuelven 10, 9 y 10 anios. |
| **Ubicacion** | `tests/unitarias/inscripcion.reglas.test.js` |

#### CP-U02 — Validacion del rango de edad por disciplina

| Campo | Contenido |
| --- | --- |
| **Tipo** | Unitaria |
| **Requerimiento** | RF-020, RN-002 |
| **Precondiciones** | Disciplina de ejemplo con edad minima 4 y edad maxima 25. |
| **Pasos** | 1. Validar una edad de 10 anios.<br>2. Validar los extremos, 4 y 25.<br>3. Validar 3 anios.<br>4. Validar 30 anios.<br>5. Validar 45 anios contra una disciplina sin rango definido. |
| **Resultado esperado** | Los pasos 1, 2 y 5 no lanzan error. Los pasos 3 y 4 lanzan `ErrorAplicacion` con estado 422 y codigo `EDAD_FUERA_DE_RANGO`, con mensaje que nombra el limite incumplido. |
| **Resultado obtenido** | Aprobado (25/09/2026). Los extremos se aceptan; 3 y 30 anios lanzan 422 con codigo `EDAD_FUERA_DE_RANGO`. |
| **Ubicacion** | `tests/unitarias/inscripcion.reglas.test.js` |

#### CP-U03 — Contenido y caducidad del token de sesion

| Campo | Contenido |
| --- | --- |
| **Tipo** | Unitaria |
| **Requerimiento** | RNF-015, RNF-020 |
| **Precondiciones** | Secreto de firma definido por variable de entorno. |
| **Pasos** | 1. Emitir un token para un usuario con rol Administrador.<br>2. Verificarlo y leer su contenido.<br>3. Emitir un token firmado con otro secreto y verificarlo.<br>4. Alterar el ultimo caracter de un token valido y verificarlo. |
| **Resultado esperado** | El token contiene identificador, rol y correo, y ningun dato sensible. La fecha de expiracion es posterior a la de emision. Los pasos 3 y 4 lanzan error de verificacion. |
| **Resultado obtenido** | Aprobado (25/09/2026). El token porta identificador, rol y correo; la firma ajena y la alterada se rechazan. |
| **Ubicacion** | `tests/unitarias/seguridad.test.js` |

#### CP-U04 — Middleware de sesion y de rol

| Campo | Contenido |
| --- | --- |
| **Tipo** | Unitaria |
| **Requerimiento** | RF-001 a RF-006, RNF-015, RNF-020 |
| **Precondiciones** | Ninguna. |
| **Pasos** | 1. Invocar el middleware de sesion con una cabecera `Bearer` valida.<br>2. Invocarlo sin cabecera de autorizacion.<br>3. Invocarlo con esquema `Basic`.<br>4. Invocarlo con un token ya expirado.<br>5. Invocar el middleware de rol con un rol autorizado y con uno distinto. |
| **Resultado esperado** | El paso 1 continua y deja el usuario resuelto en la peticion. Los pasos 2, 3 y 4 producen error 401; el 4 con el mensaje que distingue la sesion expirada del token invalido. El paso 5 continua con el rol autorizado y produce 403 con el otro. |
| **Resultado obtenido** | Aprobado (25/09/2026). 401 sin cabecera, con esquema `Basic` y con token expirado, este ultimo con el mensaje de sesion expirada; 403 con rol distinto. |
| **Ubicacion** | `tests/unitarias/seguridad.test.js` |

---

### 16.2 Pruebas de integracion

#### CP-I01 — Inicio de sesion por el contrato HTTP

| Campo | Contenido |
| --- | --- |
| **Tipo** | Integracion |
| **Requerimiento** | RF-002, RNF-016, RNF-018 |
| **Precondiciones** | Aplicacion levantada en memoria con el modulo `auth` montado; repositorio sustituido por un doble que devuelve un usuario activo con contrasena cifrada. |
| **Pasos** | 1. `POST /api/auth/login` con correo y contrasena correctos.<br>2. Repetir con contrasena incorrecta.<br>3. Repetir con un correo inexistente.<br>4. Repetir con un usuario en estado Suspendido. |
| **Resultado esperado** | Paso 1: codigo 200, token emitido, datos del usuario sin el hash de la contrasena y registro en la bitacora de auditoria. Pasos 2 y 3: codigo 401 con el mismo mensaje en ambos, sin revelar si el correo existe. Paso 4: codigo 401 indicando cuenta inactiva. |
| **Resultado obtenido** | Aprobado (25/09/2026). Token emitido y asiento en la bitacora; correo inexistente y contrasena incorrecta devuelven la misma respuesta 401. |
| **Ubicacion** | `tests/integracion/auth.test.js` |

#### CP-I02 — Cache de lectura del catalogo

| Campo | Contenido |
| --- | --- |
| **Tipo** | Integracion |
| **Requerimiento** | RF-010, RNF-001 |
| **Precondiciones** | Doble de Redis vacio y doble de PostgreSQL con tres disciplinas. |
| **Pasos** | 1. `GET /api/catalogo/disciplinas`.<br>2. Repetir la misma peticion con la cache ya poblada.<br>3. `GET /api/catalogo/disciplinas/9999/niveles`. |
| **Resultado esperado** | Paso 1: codigo 200 con `origen: base_de_datos` y escritura en la cache. Paso 2: codigo 200 con `origen: cache` y ninguna consulta a PostgreSQL. Paso 3: codigo 404 con codigo `NO_ENCONTRADO`. |
| **Resultado obtenido** | Aprobado (25/09/2026). Primera lectura `base_de_datos`, segunda `cache`, sin consulta a PostgreSQL; disciplina inexistente 404. |
| **Ubicacion** | `tests/integracion/catalogo.test.js` |

#### CP-I03 — Solicitud de inscripcion con datos incompletos

| Campo | Contenido |
| --- | --- |
| **Tipo** | Integracion |
| **Requerimiento** | RF-020 |
| **Precondiciones** | Aplicacion levantada con el modulo `inscripcion` montado. |
| **Pasos** | 1. `POST /api/inscripcion/solicitudes` con el cuerpo completo y edad valida.<br>2. Repetir omitiendo la fecha de nacimiento y el nombre del encargado.<br>3. Repetir con una aspirante fuera del rango de edad de la disciplina. |
| **Resultado esperado** | Paso 1: codigo 201 con la solicitud en estado Recibida. Paso 2: codigo 400 con codigo `DATOS_INCOMPLETOS` y el mensaje enumerando los dos campos faltantes. Paso 3: codigo 422 con codigo `EDAD_FUERA_DE_RANGO` y ninguna solicitud creada. |
| **Resultado obtenido** | Aprobado (25/09/2026). 201 con datos completos; 400 enumerando los dos campos faltantes; 422 fuera de rango de edad. |
| **Ubicacion** | `tests/integracion/inscripcion.test.js` |

#### CP-I04 — Aceptacion como una sola transaccion

| Campo | Contenido |
| --- | --- |
| **Tipo** | Integracion |
| **Requerimiento** | RF-021, RF-022, RF-023, RN-004 |
| **Precondiciones** | Solicitud en estado Recibida; sesion con rol Administrador; doble de PostgreSQL que simula el fallo del tercer paso de la transaccion. |
| **Pasos** | 1. Aceptar la solicitud indicando clase y nivel.<br>2. Aceptar indicando una clase de otra disciplina.<br>3. Aceptar una clase sin cupo disponible.<br>4. Aceptar dos veces la misma solicitud.<br>5. Aceptar con un rol distinto de Administrador. |
| **Resultado esperado** | Paso 1: codigo 201; alumna creada, disciplina asignada y cupo reservado, con el horario y la docente de la clase en la respuesta. Paso 2: codigo 422 con `CLASE_INCOMPATIBLE`. Paso 3: codigo 409 sin ningun registro parcial. Paso 4: codigo 409. Paso 5: codigo 403. |
| **Resultado obtenido** | Aprobado (25/09/2026). 201 con la asignacion completa; 422 por clase incompatible; 409 sin cupo, en segunda aceptacion; 403 con otro rol. |
| **Ubicacion** | `tests/integracion/inscripcion.test.js` |

#### CP-I05 — Pago de una mensualidad y emision del comprobante

| Campo | Contenido |
| --- | --- |
| **Tipo** | Integracion |
| **Requerimiento** | RF-030, RNF-017 |
| **Precondiciones** | Mensualidad pendiente; sesion valida; adaptador de la pasarela sustituido por un doble. |
| **Pasos** | 1. Pagar con medio Tarjeta y autorizacion aprobada.<br>2. Pagar con la pasarela rechazando la autorizacion.<br>3. Pagar una mensualidad ya saldada.<br>4. Pagar con un medio no contemplado.<br>5. Pagar en efectivo. |
| **Resultado esperado** | Paso 1: codigo 201, pago aprobado, comprobante emitido y mensualidad en estado Pagada. Paso 2: codigo 402, pago registrado como rechazado, sin comprobante y mensualidad pendiente. Paso 3: codigo 409. Paso 4: codigo 422 con `MEDIO_NO_VALIDO`. Paso 5: codigo 201 sin consultar la pasarela. |
| **Resultado obtenido** | Aprobado (25/09/2026). 201 con comprobante; 402 sin comprobante al rechazar la pasarela; 409 si ya estaba saldada; 422 con medio no valido; efectivo no consulta la pasarela. |
| **Ubicacion** | `tests/integracion/pagos.test.js` |

---

### 16.3 Pruebas de sistema

#### CP-S01 — Disponibilidad de la plataforma desplegada

| Campo | Contenido |
| --- | --- |
| **Tipo** | Sistema |
| **Requerimiento** | RNF-010, RNF-024 |
| **Precondiciones** | Entorno levantado con `npm run entorno:arriba` y `BASE_URL` apuntando a el. |
| **Pasos** | 1. `GET /health`.<br>2. `GET /` para obtener la consola operativa. |
| **Resultado esperado** | Paso 1: codigo 200, estado `ok`, los cuatro modulos montados y ambas dependencias —PostgreSQL y Redis— en `ok`. Paso 2: codigo 200 con la pantalla en HTML. |
| **Resultado obtenido** | Aprobado (25/09/2026). `/health` responde 200 con los cuatro modulos y ambas dependencias en `ok`; la consola se entrega en la raiz. |
| **Ubicacion** | `tests/e2e/sistema-recorrido.spec.js`, proyecto `sistema` |

#### CP-S02 — Catalogo contra la base de datos real

| Campo | Contenido |
| --- | --- |
| **Tipo** | Sistema |
| **Requerimiento** | RF-010 a RF-014, RNF-001 |
| **Precondiciones** | Entorno levantado con los datos semilla aplicados. |
| **Pasos** | 1. Iniciar sesion como Administrador e invalidar la cache.<br>2. `GET /api/catalogo/disciplinas` dos veces seguidas.<br>3. `GET /api/catalogo/clases` y revisar cada registro.<br>4. `GET /api/catalogo/disciplinas/9999/niveles`. |
| **Resultado esperado** | La primera lectura responde `origen: base_de_datos` y la segunda `origen: cache`, con contenido identico. Cada clase publica disciplina, nivel, dia, horario, docente y un cupo disponible que nunca supera al cupo maximo. La disciplina inexistente responde 404. |
| **Resultado obtenido** | Aprobado (25/09/2026). Origen `base_de_datos` y luego `cache` con contenido identico; cinco clases con horario, docente y cupo; 404 en disciplina inexistente. |
| **Ubicacion** | `tests/e2e/sistema-recorrido.spec.js` |

#### CP-S03 — De la solicitud al comprobante en una sola cadena

| Campo | Contenido |
| --- | --- |
| **Tipo** | Sistema |
| **Requerimiento** | RF-020 a RF-023, RF-030, RN-004, RN-007 |
| **Precondiciones** | Entorno levantado con datos semilla; al menos una clase con cupo disponible. |
| **Pasos** | 1. Enviar una solicitud sin sesion, con datos completos y edad valida.<br>2. Iniciar sesion como Administrador y listar las solicitudes recibidas.<br>3. Aceptar la solicitud asignando clase y nivel.<br>4. Consultar las mensualidades de la alumna recien registrada.<br>5. Pagar la mensualidad con medio Tarjeta.<br>6. Volver a consultar el catalogo. |
| **Resultado esperado** | La solicitud queda Recibida y aparece en la bandeja. La aceptacion responde 201 con la alumna registrada y la asignacion de clase, dia, hora y docente. Existe exactamente una mensualidad, del periodo en curso, por el monto de la disciplina y en estado Pendiente: la genero el disparador del motor, no la aplicacion. El pago responde 201, deja la mensualidad Pagada y emite un comprobante con numero correlativo `PDA-########`. El cupo disponible de la clase bajo exactamente en uno. |
| **Resultado obtenido** | Aprobado (25/09/2026). Cadena completa en 319 ms: solicitud Recibida, alumna registrada con clase y docente, una sola mensualidad del periodo generada por el disparador, pago 201 con comprobante `PDA-########` y cupo reducido en uno. |
| **Ubicacion** | `tests/e2e/sistema-recorrido.spec.js` |

#### CP-S04 — El cupo maximo lo impone el motor, no la aplicacion

| Campo | Contenido |
| --- | --- |
| **Tipo** | Sistema |
| **Requerimiento** | RF-014, RN-004 |
| **Precondiciones** | Entorno recien reiniciado con `npm run datos:reiniciar`, de modo que la clase con menos cupo tenga a lo sumo veinte espacios libres. |
| **Pasos** | 1. Elegir la clase con menos cupo disponible.<br>2. Registrar tantas alumnas como espacios libres queden.<br>3. Intentar registrar una alumna mas en la misma clase.<br>4. Consultar el cupo de esa clase. |
| **Resultado esperado** | Los registros del paso 2 responden 201. El registro del paso 3 responde 409 con codigo `CONFLICTO` y no deja ningun registro parcial: la restriccion la aplica el disparador `tr_validar_cupo_clase`, de modo que se cumpliria aunque la aplicacion la omitiera. El cupo disponible queda en cero. |
| **Resultado obtenido** | Aprobado (25/09/2026). Ocupados todos los espacios libres de la clase con menos cupo, el siguiente registro respondio 409 y el cupo quedo en cero. La restriccion la aplico el disparador `tr_validar_cupo_clase`. |
| **Ubicacion** | `tests/e2e/sistema-recorrido.spec.js` |

---

### 16.4 Pruebas de aceptacion

#### CP-A01 — La aspirante consulta la oferta sin registrarse

| Campo | Contenido |
| --- | --- |
| **Tipo** | Aceptacion (navegador) |
| **Historia** | HU-013 |
| **Precondiciones** | Entorno levantado; navegador Chromium; sin sesion iniciada. |
| **Pasos** | 1. Abrir la consola operativa en la raiz del sitio.<br>2. Observar la tabla de disciplinas y la de clases.<br>3. Pulsar "Cargar catalogo" una segunda vez. |
| **Resultado esperado** | La pantalla abre con las dos tablas pobladas y el indicador de sesion en "Sin sesion". Cada clase muestra su horario en formato hora-hora. La segunda consulta indica que los datos vinieron de la cache. |
| **Resultado obtenido** | Aprobado (25/09/2026). Las dos tablas abren pobladas, el indicador muestra "Sin sesion" y la segunda consulta reporta origen `cache`. |
| **Ubicacion** | `tests/e2e/aceptacion-consola.spec.js`, proyecto `aceptacion` |

#### CP-A02 — La encargada envia la solicitud desde la pantalla

| Campo | Contenido |
| --- | --- |
| **Tipo** | Aceptacion (navegador) |
| **Historia** | HU-014 |
| **Precondiciones** | Entorno levantado; pestania "Solicitud de inscripcion" abierta. |
| **Pasos** | 1. Llenar el formulario completo con una aspirante de 10 anios en Ballet clasico y enviarlo.<br>2. Enviar el formulario dejando vacias la fecha de nacimiento y el nombre del encargado.<br>3. Enviar el formulario con una aspirante de 2 anios en Ballet clasico. |
| **Resultado esperado** | Paso 1: la pantalla confirma en verde el numero de solicitud, el nombre de la aspirante, la disciplina y el estado Recibida. Paso 2: aviso en rojo que enumera los campos faltantes, entre ellos la fecha de nacimiento. Paso 3: aviso en rojo que indica la edad minima de la disciplina. En ningun caso aparece un error tecnico sin traducir. |
| **Resultado obtenido** | Aprobado (25/09/2026). Confirmacion en verde con numero de solicitud y estado Recibida; avisos en rojo enumerando campos faltantes e indicando la edad minima. |
| **Ubicacion** | `tests/e2e/aceptacion-consola.spec.js` |

#### CP-A03 — Control de acceso visto desde la consola

| Campo | Contenido |
| --- | --- |
| **Tipo** | Aceptacion (navegador) |
| **Historia** | HU-002 |
| **Precondiciones** | Entorno levantado con los tres usuarios de demostracion. |
| **Pasos** | 1. Iniciar sesion con las credenciales de la direccion.<br>2. Cerrar sesion e iniciar con una contrasena incorrecta.<br>3. Iniciar sesion como Docente e intentar aceptar una solicitud. |
| **Resultado esperado** | Paso 1: el encabezado muestra el nombre y el rol Administrador. Paso 2: aviso "Credenciales invalidas", sin indicar si el correo existe, y el encabezado vuelve a "Sin sesion". Paso 3: la consola informa que no se cuenta con permisos para esa operacion. |
| **Resultado obtenido** | Aprobado (25/09/2026). Nombre y rol en el encabezado; "Credenciales invalidas" sin revelar si el correo existe; el rol Docente recibe el aviso de falta de permisos. |
| **Ubicacion** | `tests/e2e/aceptacion-consola.spec.js` |

#### CP-A04 — Recorrido completo de la direccion, de extremo a extremo

| Campo | Contenido |
| --- | --- |
| **Tipo** | Aceptacion (navegador) |
| **Historia** | HU-015, HU-021 |
| **Precondiciones** | Entorno levantado; al menos una clase de Ballet clasico con cupo libre. |
| **Pasos** | 1. Enviar una solicitud desde la pestania de inscripcion.<br>2. Iniciar sesion como Administrador.<br>3. Cargar las solicitudes recibidas y localizar la recien enviada.<br>4. Elegir la clase de Ballet con mas espacios libres y aceptar.<br>5. Ir a la pestania de pagos y consultar las mensualidades de la alumna.<br>6. Cobrar la mensualidad con medio Tarjeta.<br>7. Volver a consultar las mensualidades. |
| **Resultado esperado** | La solicitud aparece en la bandeja con el nombre correcto. La aceptacion confirma en pantalla la alumna registrada, la clase, el dia, la hora y la docente. Aparece exactamente una mensualidad, en estado Pendiente y de la disciplina correcta. El cobro confirma el pago aprobado, el numero de comprobante y el nuevo estado Pagada, que se mantiene al volver a consultar. |
| **Resultado obtenido** | Aprobado (25/09/2026). Recorrido completo en navegador en 1.4 s: solicitud, aceptacion con clase, dia, hora y docente, mensualidad Pendiente unica, cobro aprobado con comprobante y estado Pagada persistente. |
| **Ubicacion** | `tests/e2e/aceptacion-consola.spec.js` |

---

### 16.5 Pruebas de seguridad

#### CP-SEG01 — Cabeceras de proteccion del navegador

| Campo | Contenido |
| --- | --- |
| **Tipo** | Seguridad |
| **Requerimiento** | RNF-019 |
| **Precondiciones** | Aplicacion en ejecucion, local o desplegada. |
| **Pasos** | 1. Realizar cualquier peticion y leer las cabeceras de la respuesta. |
| **Resultado esperado** | No existe la cabecera `X-Powered-By`. La politica de contenido declara `default-src 'self'`. `X-Content-Type-Options` vale `nosniff` y `X-Frame-Options` vale `SAMEORIGIN`. |
| **Resultado obtenido** | Aprobado (25/09/2026). Sin `X-Powered-By`; `default-src 'self'`, `nosniff` y `SAMEORIGIN` presentes. |
| **Ubicacion** | `tests/seguridad/superficie-http.test.js` y `tests/e2e/seguridad-plataforma.spec.js` |

#### CP-SEG02 — Acceso sin sesion y con rol insuficiente

| Campo | Contenido |
| --- | --- |
| **Tipo** | Seguridad |
| **Requerimiento** | RF-001 a RF-006, RNF-015 |
| **Precondiciones** | Aplicacion en ejecucion. |
| **Pasos** | 1. Llamar sin cabecera de autorizacion a: perfil, listado de usuarios, listado de solicitudes, aceptacion de solicitud, mensualidades e invalidacion de cache.<br>2. Llamar al listado de usuarios con un token de rol Docente.<br>3. Aceptar una solicitud con un token de rol Encargado.<br>4. Consultar el catalogo publico sin sesion. |
| **Resultado esperado** | Las seis rutas del paso 1 responden 401 con codigo `NO_AUTORIZADO`. Los pasos 2 y 3 responden 403 con codigo `PROHIBIDO`. El paso 4 responde 200: el catalogo es la unica lectura publica. |
| **Resultado obtenido** | Aprobado (25/09/2026). Las seis rutas sin sesion responden 401; Docente y Encargado reciben 403; el catalogo publico responde 200. |
| **Ubicacion** | `tests/seguridad/superficie-http.test.js` y `tests/e2e/seguridad-plataforma.spec.js` |

#### CP-SEG03 — Integridad del token y no divulgacion de secretos

| Campo | Contenido |
| --- | --- |
| **Tipo** | Seguridad |
| **Requerimiento** | RNF-015, RNF-016, RNF-020 |
| **Precondiciones** | Sesion valida obtenida con las credenciales de demostracion. |
| **Pasos** | 1. Revisar la respuesta del inicio de sesion.<br>2. Construir un token con el mismo contenido pero firma inventada y usarlo.<br>3. Alterar dos caracteres de un token legitimo y usarlo.<br>4. Comparar la respuesta ante correo inexistente y ante contrasena incorrecta.<br>5. Leer el contenido del token. |
| **Resultado esperado** | La respuesta no contiene la contrasena, ni su hash, ni patron alguno de bcrypt. Los pasos 2 y 3 responden 401. El paso 4 devuelve exactamente la misma respuesta en ambos casos. El token declara caducidad no mayor a una hora y no transporta datos sensibles. |
| **Resultado obtenido** | Aprobado (25/09/2026). Ni contrasena ni hash en la respuesta; firma inventada y token alterado rechazados con 401; respuestas identicas ante correo inexistente y contrasena incorrecta; caducidad de 30 minutos. |
| **Ubicacion** | `tests/e2e/seguridad-plataforma.spec.js` |

#### CP-SEG04 — Entrada no confiable y datos de tarjeta

| Campo | Contenido |
| --- | --- |
| **Tipo** | Seguridad |
| **Requerimiento** | RNF-017, RNF-019 |
| **Precondiciones** | Aplicacion en ejecucion; una mensualidad pendiente para el ultimo paso. |
| **Pasos** | 1. Enviar una inyeccion SQL en el parametro de consulta del catalogo.<br>2. Enviar un cuerpo que no es JSON valido.<br>3. Enviar un cuerpo que supera un megabyte.<br>4. Provocar un fallo interno y leer la respuesta.<br>5. Pagar con tarjeta y revisar el cuerpo de la respuesta. |
| **Resultado esperado** | Paso 1: la consulta viaja parametrizada, el texto SQL nunca se concatena y las tablas siguen intactas. Paso 2: codigo 400 con `JSON_INVALIDO`. Paso 3: codigo 413 con `CUERPO_DEMASIADO_GRANDE`. Paso 4: codigo 500 con el mensaje generico, sin nombres de tabla, sentencias ni numeros de linea. Paso 5: ningun numero con formato de tarjeta, ningun codigo de verificacion y ningun campo que los contenga. |
| **Resultado obtenido** | Aprobado (25/09/2026). Consulta parametrizada con `$1` y tablas intactas; 400 `JSON_INVALIDO`; 413 `CUERPO_DEMASIADO_GRANDE`; 500 con mensaje generico sin detalles del motor; ningun dato de tarjeta en la respuesta del pago. |
| **Ubicacion** | `tests/seguridad/superficie-http.test.js` y `tests/e2e/seguridad-plataforma.spec.js` |

---

### 16.6 Pruebas de rendimiento

#### CP-REN01 — Tiempo de respuesta del catalogo

| Campo | Contenido |
| --- | --- |
| **Tipo** | Rendimiento |
| **Requerimiento** | RNF-001 |
| **Precondiciones** | Entorno levantado y estabilizado; sin otra carga sobre la maquina. |
| **Pasos** | 1. Invalidar la cache y medir una consulta de disciplinas.<br>2. Invalidar de nuevo, medir la primera consulta y luego treinta consultas consecutivas. |
| **Resultado esperado** | La primera consulta, que llega hasta PostgreSQL, responde en menos de 2000 ms. Las consultas siguientes se resuelven desde la cache con un percentil 95 por debajo de 800 ms. El reporte registra minimo, media, percentil 95 y maximo. |
| **Resultado obtenido** | Aprobado (25/09/2026). Primera consulta por debajo del umbral de 2000 ms; treinta consultas desde cache con minimo 0 ms, media 1 ms, percentil 95 de 3 ms y maximo 3 ms. |
| **Ubicacion** | `tests/e2e/rendimiento-catalogo.spec.js`, proyecto `rendimiento` |

#### CP-REN02 — Comportamiento ante peticiones simultaneas

| Campo | Contenido |
| --- | --- |
| **Tipo** | Rendimiento |
| **Requerimiento** | RNF-001, RNF-010 |
| **Precondiciones** | Entorno levantado. |
| **Pasos** | 1. Lanzar veinte consultas de clases en paralelo y medir cada una.<br>2. Medir diez llamadas consecutivas a la sonda de vida. |
| **Resultado esperado** | Las veinte consultas responden con codigo 200 y su percentil 95 se mantiene por debajo de 4000 ms. La sonda de vida, que no consulta dependencias, responde con percentil 95 por debajo de 800 ms: si tardara mas, el proceso estaria bloqueado. |
| **Resultado obtenido** | Aprobado (25/09/2026). Veinte consultas simultaneas, todas 200, con media 16 ms, percentil 95 de 27 ms y maximo 28 ms. Sonda de vida: percentil 95 de 3 ms sobre diez muestras. |
| **Ubicacion** | `tests/e2e/rendimiento-catalogo.spec.js` |

#### CP-REN03 — Costo del registro completo de una alumna

| Campo | Contenido |
| --- | --- |
| **Tipo** | Rendimiento |
| **Requerimiento** | RNF-001, RF-021 |
| **Precondiciones** | Entorno levantado; una clase con cupo disponible; solicitud ya creada. |
| **Pasos** | 1. Medir el tiempo de la aceptacion, que abarca la creacion de la alumna, la asignacion de disciplina, la reserva de cupo, la generacion de la mensualidad por disparador y el asiento en la bitacora. |
| **Resultado esperado** | La operacion completa responde 201 en menos de 4000 ms. El dato queda registrado en el reporte para observar su evolucion entre versiones. |
| **Resultado obtenido** | Aprobado (25/09/2026). El registro completo de una alumna, con su disparador de mensualidad, se resolvio en 288 ms. |
| **Ubicacion** | `tests/e2e/rendimiento-catalogo.spec.js` |

---

### 16.7 Resumen de trazabilidad

| Id | Tipo | Requerimiento o historia | Automatizado | Corre en la etapa |
| --- | --- | --- | --- | --- |
| CP-U01 | Unitaria | RF-020, RN-002 | Si | 1 |
| CP-U02 | Unitaria | RF-020, RN-002 | Si | 1 |
| CP-U03 | Unitaria | RNF-015, RNF-020 | Si | 1 |
| CP-U04 | Unitaria | RF-001 a RF-006 | Si | 1 |
| CP-I01 | Integracion | RF-002, RNF-016 | Si | 1 |
| CP-I02 | Integracion | RF-010, RNF-001 | Si | 1 |
| CP-I03 | Integracion | RF-020 | Si | 1 |
| CP-I04 | Integracion | RF-021 a RF-023 | Si | 1 |
| CP-I05 | Integracion | RF-030, RNF-017 | Si | 1 |
| CP-S01 | Sistema | RNF-010, RNF-024 | Si | 3 |
| CP-S02 | Sistema | RF-010 a RF-014 | Si | 3 |
| CP-S03 | Sistema | RF-020 a RF-023, RF-030 | Si | 3 |
| CP-S04 | Sistema | RF-014, RN-004 | Si | 3 |
| CP-A01 | Aceptacion | HU-013 | Si | 3 |
| CP-A02 | Aceptacion | HU-014 | Si | 3 |
| CP-A03 | Aceptacion | HU-002 | Si | 3 |
| CP-A04 | Aceptacion | HU-015, HU-021 | Si | 3 |
| CP-SEG01 | Seguridad | RNF-019 | Si | 1 y 3 |
| CP-SEG02 | Seguridad | RF-001 a RF-006 | Si | 1 y 3 |
| CP-SEG03 | Seguridad | RNF-015, RNF-016 | Si | 3 |
| CP-SEG04 | Seguridad | RNF-017, RNF-019 | Si | 1 y 3 |
| CP-REN01 | Rendimiento | RNF-001 | Si | 3 |
| CP-REN02 | Rendimiento | RNF-001, RNF-010 | Si | 3 |
| CP-REN03 | Rendimiento | RNF-001, RF-021 | Si | 3 |
| CP-M01 a CP-M06 | Experiencia de uso | RNF-002, RNF-003 | No | Revision manual por entrega |

---

## 17. Ejecucion del plan de pruebas

### 17.1 Ejecucion automatica

La canalizacion ejecuta el plan completo sin intervencion, en cada propuesta de
cambio y en cada fusion hacia la rama principal.

| Etapa | Que ejecuta | Que produce |
| --- | --- | --- |
| 1. Verificacion | Analisis estatico y 96 casos de Jest | `reports/junit.xml`, cobertura en `coverage/` |
| 2. Construccion | Cinco imagenes y prueba de humo de la imagen | Imagenes publicadas en Amazon ECR |
| 3. Pruebas end to end | 45 casos de Playwright sobre el entorno completo | Reporte HTML navegable y `reports/playwright-junit.xml` |
| 4. Despliegue | Migracion y actualizacion del servicio en staging | Prueba de humo contra la direccion publica |

### 17.2 Ejecucion manual

**Niveles unitario, de integracion y de seguridad con dobles.** No requieren
infraestructura: corren en cualquier maquina con Node.js 20.

```bash
npm ci
npm run lint                  # analisis estatico
npm test                      # los 96 casos
npm run test:unitarias        # solo el nivel unitario
npm run test:integracion      # solo el contrato HTTP de los modulos
npm run test:seguridad        # solo la superficie de seguridad
npm run test:ci               # como en el servidor: reporte JUnit y cobertura
```

**Niveles de sistema, aceptacion, seguridad y rendimiento.** Requieren la
plataforma levantada.

```bash
npm run entorno:arriba              # PostgreSQL, Redis y la aplicacion
npm run salud                       # espera a que la sonda quede en verde
npm run datos:reiniciar             # deja la base en su estado conocido
npx playwright install chromium     # solo la primera vez

npm run e2e                         # las cuatro suites
npm run e2e:sistema
npm run e2e:aceptacion
npm run e2e:seguridad
npm run e2e:rendimiento
```

Para ejecutar el mismo plan contra staging en lugar del entorno local:

```bash
BASE_URL="$(./scripts/url-staging.sh)" npm run e2e:sistema
```

### 17.3 Reportes

```bash
npm run reporte:e2e          # abre el reporte HTML de Playwright en el navegador
npm run reporte:cobertura    # genera coverage/index.html
```

| Reporte | Ruta | Contenido |
| --- | --- | --- |
| Reporte HTML de Playwright | `reports/playwright/index.html` | Cada caso con su duracion, sus pasos, las mediciones de rendimiento y, ante un fallo, la captura y el video del navegador |
| Resultado en formato JUnit | `reports/junit.xml` y `reports/playwright-junit.xml` | Lo que consume el servidor de integracion continua |
| Cobertura de codigo | `coverage/index.html` | Sentencias, ramas, funciones y lineas cubiertas por archivo |

En la canalizacion los tres quedan como artefactos descargables de cada
ejecucion, con catorce dias de retencion.

---

## 18. Resultados obtenidos

### 18.1 Registro de la ejecucion

| Elemento | Valor |
| --- | --- |
| Fecha | 25 de septiembre de 2026 |
| Entorno | Local, Docker Compose, perfil `monolito` |
| Maquina | macOS 15 (Darwin 25.6), Apple Silicon, 16 GB |
| Node.js | v23.4.0 en la maquina; Node 20 dentro de la imagen |
| Motor de contenedores | Docker 29.4.0 sobre OrbStack |
| Base de datos | PostgreSQL 16 en contenedor, reiniciada con `npm run datos:reiniciar` |
| Navegador | Chromium 153.0.8010.12, empaquetado con Playwright 1.63.0 |

### 18.2 Resultado consolidado

| Bateria | Casos | Aprobados | Fallidos | Omitidos | Duracion |
| --- | --- | --- | --- | --- | --- |
| Jest (unitarias, integracion, seguridad) | 96 | 96 | 0 | 0 | 1.0 s |
| Playwright (sistema, aceptacion, seguridad, rendimiento) | 45 | 45 | 0 | 0 | 14.2 s |
| **Total** | **141** | **141** | **0** | **0** | **15.2 s** |

Analisis estatico: sin errores ni advertencias.

### 18.3 Mediciones de rendimiento

| Medicion | Muestras | Minimo | Media | Percentil 95 | Maximo | Umbral | Resultado |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Catalogo desde cache | 30 | 0 ms | 1 ms | 3 ms | 3 ms | 800 ms | Aprobado |
| Veinte consultas simultaneas | 20 | 10 ms | 16 ms | 27 ms | 28 ms | 4000 ms | Aprobado |
| Sonda de vida | 10 | 1 ms | 1 ms | 3 ms | 3 ms | 800 ms | Aprobado |
| Registro completo de una alumna | 1 | — | 288 ms | — | — | 4000 ms | Aprobado |

### 18.4 Comprobacion de independencia entre casos

La bateria se ejecuto **dos veces consecutivas sin reiniciar los datos** entre
una corrida y la otra, y dio el mismo resultado: 45 de 45 en ambas. Ningun caso
depende del orden de ejecucion ni del estado que dejo el anterior.

La primera corrida revelo dos casos que se omitian en silencio porque dependian
de datos que otra prueba habia modificado, y una condicion de carrera al leer el
contenido de una tabla antes de que llegara la respuesta. Los tres defectos
estaban en las pruebas, no en la plataforma, y quedaron corregidos.

### 18.5 Comprobacion de que la canalizacion detiene una version defectuosa

Se verificaron los tres defectos que inyecta el flujo de demostracion:

| Defecto inyectado | Que lo detecta | Resultado |
| --- | --- | --- |
| Se invierte la comparacion del limite inferior de edad | CP-U02 y CP-I03 | 4 casos fallidos de 19 |
| Se cambia el codigo de respuesta del recurso creado, de 201 a 200 | CP-I03 y CP-I04 | 3 casos fallidos de 54 |
| Se introduce una variable que nadie usa | Analisis estatico | 1 error, antes de ejecutar prueba alguna |

En los tres casos la canalizacion se detiene en la etapa 1 y no llega a
construir ninguna imagen.

### 18.6 Lo que falta ejecutar

Estos resultados corresponden al entorno local y al analisis estatico. Queda
pendiente repetir la ejecucion contra el entorno de staging una vez desplegado,
con `BASE_URL="$(./scripts/url-staging.sh)" npm run e2e`, y actualizar esta
seccion con esa segunda corrida.

---

## 19. Verificaciones manuales de experiencia de uso

Se ejecutan una vez por entrega, sobre el entorno levantado. No tienen resultado
binario: lo que se busca es juicio sobre si la pantalla se entiende.

| Id | Que se revisa | Criterio | Resultado |
| --- | --- | --- | --- |
| CP-M01 | Mensajes de error del formulario de solicitud | Una persona que no conoce el sistema entiende que dato falta y como corregirlo | Pendiente |
| CP-M02 | Orden y agrupacion de los campos | El recorrido con la tecla de tabulacion sigue el orden en que una persona llenaria el formulario | Pendiente |
| CP-M03 | Lectura en telefono | A 390 pixeles de ancho ningun texto se corta ni la pagina se desplaza en horizontal | Pendiente |
| CP-M04 | Retroalimentacion de las operaciones lentas | La persona percibe que el sistema esta trabajando y no vuelve a pulsar el boton | Pendiente |
| CP-M05 | Terminologia | Los terminos coinciden con los que usa la academia: aspirante, encargado, disciplina, nivel, clase, mensualidad | Pendiente |
| CP-M06 | Contraste y tamanio de letra | El texto se lee con comodidad en una pantalla de portatil a la luz del dia | Pendiente |

Tres de estos aspectos tienen ademas una comprobacion automatica que cubre su
lado objetivo: que la pagina no se desplace en horizontal en pantalla angosta,
que cada campo tenga su etiqueta asociada y que la consola del navegador no
registre errores.

---

## 20. Metricas y criterios de aceptacion de la entrega

| Metrica | Meta | Medido |
| --- | --- | --- |
| Casos automatizados que pasan | 100 % | 141 de 141 |
| Defectos criticos o altos abiertos | 0 | 0 |
| Duracion de la bateria de Jest | menos de 10 s | 1.0 s |
| Duracion de la bateria completa en local | menos de 60 s | 15.2 s |
| Tiempo de respuesta del catalogo desde cache, percentil 95 | menos de 800 ms | 3 ms |
| Casos omitidos por depender de otra prueba | 0 | 0 |
| Duracion de la canalizacion completa | menos de 25 min | Por medir en la primera ejecucion |
| Despliegues a staging que requirieron reversion | 0 | Por medir |

---
---

# Parte III — Pipeline CI/CD funcional

## 21. El archivo de la canalizacion

> **Nota sobre el formato del archivo.** El enunciado de la entrega menciona
> `Jenkinsfile` o `.gitlab-ci.yml` como ejemplos del archivo que define la
> canalizacion. Este proyecto la implementa en **GitHub Actions**, cuyo archivo
> equivalente es `.github/workflows/ci.yml`. La eleccion responde a que el
> repositorio ya vive en GitHub, a que no requiere levantar ni mantener un
> servidor de Jenkins, y a que su capa gratuita cubre de sobra el uso de un
> proyecto academico. La seccion 23 incluye la traduccion del mismo flujo a
> GitLab CI y a Jenkins, para dejar constancia de que el diseno no depende de la
> herramienta.

**Ruta en el repositorio:** `.github/workflows/ci.yml`

El archivo completo, tal como esta en el repositorio:

```yaml
# =============================================================================
# Perfect Dance Academy - Canalizacion de integracion y entrega continua
#
# Cuatro etapas encadenadas. Cada una es una puerta: si no pasa, las siguientes
# no se ejecutan y nada llega al entorno de staging.
#
#   1. verificacion   Obtener el codigo, instalar, analisis estatico y la
#                     bateria de Jest (unitarias, integracion y seguridad).
#   2. construccion   Construir las cinco imagenes de contenedor y, solo desde
#                     main, publicarlas en Amazon ECR con la etiqueta del commit.
#   3. pruebas-e2e    Levantar la plataforma completa con Docker Compose y correr
#                     Playwright: sistema, aceptacion, seguridad y rendimiento.
#   4. despliegue     Aplicar migraciones y actualizar el servicio de staging en
#                     Amazon ECS, y comprobar con una prueba de humo que quedo
#                     en linea.
#
# Las etapas 2 (publicacion) y 4 solo corren sobre la rama main. Sobre una
# solicitud de incorporacion se construyen las imagenes pero no se publican:
# asi una propuesta de cambio se verifica entera sin tocar ningun entorno.
#
# Configuracion previa en GitHub (Settings del repositorio):
#   Variables    AWS_REGION, AWS_ROL_DESPLIEGUE, DESPLIEGUE_HABILITADO
#   Environment  staging
# El detalle esta en docs/despliegue-staging.md.
# =============================================================================

name: Integracion y entrega continua

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]
  workflow_dispatch:

# Una sola ejecucion por rama: si llegan dos cambios seguidos, se cancela la
# anterior y no se despliegan dos versiones a la vez sobre el mismo entorno.
concurrency:
  group: cicd-${{ github.ref }}
  cancel-in-progress: true

env:
  VERSION_NODE: '20'
  REGION_AWS: ${{ vars.AWS_REGION || 'us-east-1' }}
  REPOSITORIO_ECR: pda-platform
  PILA_STAGING: ${{ vars.PILA_STAGING || 'pda-staging' }}

permissions:
  contents: read

jobs:

  # ===========================================================================
  # ETAPA 1 - Obtencion del codigo, construccion del proyecto y pruebas
  # ===========================================================================
  verificacion:
    name: 1. Verificacion (analisis estatico y bateria de Jest)
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - name: Obtener el codigo
        uses: actions/checkout@v4

      - name: Preparar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.VERSION_NODE }}
          cache: npm

      - name: Instalar dependencias
        run: npm ci

      - name: Analisis estatico
        run: npm run lint

      - name: Bateria de pruebas con reporte y cobertura
        run: npm run test:ci

      - name: Publicar el reporte de pruebas y la cobertura
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: reporte-jest
          path: |
            reports/junit.xml
            coverage/
          retention-days: 14

      - name: Resumen de la etapa
        if: always()
        run: |
          {
            echo "### Etapa 1 - Verificacion"
            echo ""
            echo "| Elemento | Valor |"
            echo "| --- | --- |"
            echo "| Rama | \`${{ github.ref_name }}\` |"
            echo "| Commit | \`${GITHUB_SHA:0:8}\` |"
            echo "| Node.js | $(node --version) |"
            if [ -f reports/junit.xml ]; then
              TOTAL=$(grep -o 'tests="[0-9]*"' reports/junit.xml | head -1 | grep -o '[0-9]*')
              FALLOS=$(grep -o 'failures="[0-9]*"' reports/junit.xml | head -1 | grep -o '[0-9]*')
              echo "| Pruebas ejecutadas | ${TOTAL:-sin dato} |"
              echo "| Pruebas fallidas | ${FALLOS:-sin dato} |"
            fi
          } >> "$GITHUB_STEP_SUMMARY"

  # ===========================================================================
  # ETAPA 2 - Construccion de las imagenes de contenedor
  # ===========================================================================
  construccion:
    name: 2. Construccion de imagenes
    runs-on: ubuntu-latest
    needs: verificacion
    timeout-minutes: 25

    permissions:
      contents: read
      id-token: write

    outputs:
      etiqueta: ${{ steps.etiqueta.outputs.valor }}
      publicada: ${{ steps.publicar.outputs.publicada }}

    steps:
      - name: Obtener el codigo
        uses: actions/checkout@v4

      - name: Preparar Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Calcular la etiqueta de la imagen
        id: etiqueta
        run: echo "valor=${GITHUB_SHA:0:8}" >> "$GITHUB_OUTPUT"

      - name: Validar la definicion del entorno de contenedores
        run: |
          docker compose --profile monolito config --quiet
          docker compose --profile microservicios config --quiet

      - name: Construir la imagen del monolito
        uses: docker/build-push-action@v6
        with:
          context: .
          file: docker/Dockerfile
          tags: pda-platform:${{ steps.etiqueta.outputs.valor }}
          load: true
          cache-from: type=gha,scope=monolito
          cache-to: type=gha,mode=max,scope=monolito

      - name: Construir la imagen de cada modulo
        run: |
          for SERVICIO in auth catalogo inscripcion pagos; do
            echo "::group::Imagen del servicio $SERVICIO"
            docker build -f "docker/$SERVICIO/Dockerfile" \
              -t "pda-$SERVICIO:${{ steps.etiqueta.outputs.valor }}" .
            echo "::endgroup::"
          done

      - name: Comprobar que la imagen arranca y responde la sonda de vida
        run: |
          docker run -d --name pda-humo -p 3000:3000 \
            -e SERVICE=monolito -e NODE_ENV=production \
            -e JWT_SECRET=secreto-solo-para-esta-comprobacion \
            "pda-platform:${{ steps.etiqueta.outputs.valor }}"
          for INTENTO in $(seq 1 20); do
            if curl -fsS http://localhost:3000/health/vivo > /dev/null; then
              echo "La imagen responde la sonda de vida."
              docker rm -f pda-humo
              exit 0
            fi
            sleep 3
          done
          echo "La imagen no respondio la sonda de vida."
          docker logs pda-humo
          docker rm -f pda-humo
          exit 1

      # --- Publicacion en Amazon ECR: unicamente desde la rama principal -----
      - name: Autenticarse en AWS con identidad federada
        if: github.ref == 'refs/heads/main' && vars.DESPLIEGUE_HABILITADO == 'true'
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_ROL_DESPLIEGUE }}
          aws-region: ${{ env.REGION_AWS }}
          role-session-name: pda-construccion-${{ github.run_id }}

      - name: Iniciar sesion en Amazon ECR
        if: github.ref == 'refs/heads/main' && vars.DESPLIEGUE_HABILITADO == 'true'
        id: ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Publicar las cinco imagenes
        if: github.ref == 'refs/heads/main' && vars.DESPLIEGUE_HABILITADO == 'true'
        id: publicar
        env:
          REGISTRO: ${{ steps.ecr.outputs.registry }}
          ETIQUETA: ${{ steps.etiqueta.outputs.valor }}
        run: |
          set -euo pipefail
          docker tag "pda-platform:$ETIQUETA" "$REGISTRO/$REPOSITORIO_ECR:$ETIQUETA"
          docker tag "pda-platform:$ETIQUETA" "$REGISTRO/$REPOSITORIO_ECR:latest"
          docker push "$REGISTRO/$REPOSITORIO_ECR:$ETIQUETA"
          docker push "$REGISTRO/$REPOSITORIO_ECR:latest"

          for SERVICIO in auth catalogo inscripcion pagos; do
            if aws ecr describe-repositories --repository-names "$REPOSITORIO_ECR-$SERVICIO" \
                 --region "$REGION_AWS" > /dev/null 2>&1; then
              docker tag "pda-$SERVICIO:$ETIQUETA" "$REGISTRO/$REPOSITORIO_ECR-$SERVICIO:$ETIQUETA"
              docker push "$REGISTRO/$REPOSITORIO_ECR-$SERVICIO:$ETIQUETA"
            else
              echo "El repositorio $REPOSITORIO_ECR-$SERVICIO no existe en ECR; se omite."
            fi
          done

          echo "publicada=true" >> "$GITHUB_OUTPUT"
          echo "imagen=$REGISTRO/$REPOSITORIO_ECR:$ETIQUETA" >> "$GITHUB_OUTPUT"

      - name: Resumen de la etapa
        if: always()
        run: |
          {
            echo "### Etapa 2 - Construccion"
            echo ""
            echo "- Etiqueta de esta version: \`${{ steps.etiqueta.outputs.valor }}\`"
            echo "- Imagenes construidas: monolito, auth, catalogo, inscripcion, pagos"
            if [ "${{ steps.publicar.outputs.publicada }}" = "true" ]; then
              echo "- Publicadas en Amazon ECR: si"
            else
              echo "- Publicadas en Amazon ECR: no (solo se publica desde main con el despliegue habilitado)"
            fi
          } >> "$GITHUB_STEP_SUMMARY"

  # ===========================================================================
  # ETAPA 3 - Pruebas de sistema, aceptacion, seguridad y rendimiento
  # ===========================================================================
  pruebas-e2e:
    name: 3. Pruebas end to end (Playwright)
    runs-on: ubuntu-latest
    needs: verificacion
    timeout-minutes: 25

    steps:
      - name: Obtener el codigo
        uses: actions/checkout@v4

      - name: Preparar Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.VERSION_NODE }}
          cache: npm

      - name: Instalar dependencias
        run: npm ci

      - name: Instalar el navegador de pruebas
        run: npx playwright install --with-deps chromium

      - name: Levantar la plataforma completa
        run: docker compose --profile monolito up -d --build

      - name: Esperar a que la sonda de salud quede en verde
        run: node scripts/esperar-salud.js http://localhost:3000 180

      - name: Dejar la base de datos en su estado conocido
        run: docker compose --profile monolito exec -T api node scripts/migrar.js --verificar

      - name: Ejecutar las cuatro suites
        env:
          BASE_URL: http://localhost:3000
        run: npm run e2e

      - name: Registros de los contenedores si algo fallo
        if: failure()
        run: docker compose --profile monolito logs --no-color --tail 200

      - name: Publicar el reporte HTML de Playwright
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: reporte-playwright
          path: |
            reports/playwright/
            reports/playwright-junit.xml
            reports/playwright-artefactos/
          retention-days: 14

      - name: Apagar el entorno
        if: always()
        run: docker compose --profile monolito down -v

      - name: Resumen de la etapa
        if: always()
        run: |
          {
            echo "### Etapa 3 - Pruebas end to end"
            echo ""
            echo "Suites ejecutadas: sistema, aceptacion, seguridad y rendimiento."
            echo ""
            echo "El reporte HTML navegable queda como artefacto **reporte-playwright**"
            echo "de esta ejecucion. Para verlo: descargarlo, descomprimirlo y abrir"
            echo "\`playwright/index.html\`, o ejecutar \`npm run reporte:e2e\` en local."
          } >> "$GITHUB_STEP_SUMMARY"

  # ===========================================================================
  # ETAPA 4 - Despliegue al entorno de staging
  # ===========================================================================
  despliegue-staging:
    name: 4. Despliegue a staging
    runs-on: ubuntu-latest
    needs: [construccion, pruebas-e2e]
    if: github.ref == 'refs/heads/main' && vars.DESPLIEGUE_HABILITADO == 'true'
    timeout-minutes: 30

    environment:
      name: staging
      url: ${{ steps.direccion.outputs.url }}

    permissions:
      contents: read
      id-token: write

    steps:
      - name: Obtener el codigo
        uses: actions/checkout@v4

      - name: Autenticarse en AWS con identidad federada
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ vars.AWS_ROL_DESPLIEGUE }}
          aws-region: ${{ env.REGION_AWS }}
          role-session-name: pda-despliegue-${{ github.run_id }}

      - name: Leer los datos de la pila de staging
        id: pila
        run: |
          set -euo pipefail
          leer() {
            aws cloudformation describe-stacks --stack-name "$PILA_STAGING" \
              --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text
          }
          {
            echo "cluster=$(leer NombreCluster)"
            echo "servicio=$(leer NombreServicio)"
            echo "familia=$(leer FamiliaTarea)"
            echo "subredes=$(leer SubredesPublicas)"
            echo "grupo_seguridad=$(leer GrupoSeguridadServicio)"
            echo "registro=$(leer RegistroImagenes)"
          } >> "$GITHUB_OUTPUT"

      - name: Aplicar el esquema de base de datos si hiciera falta
        env:
          CLUSTER: ${{ steps.pila.outputs.cluster }}
          FAMILIA: ${{ steps.pila.outputs.familia }}
          SUBREDES: ${{ steps.pila.outputs.subredes }}
          GRUPO: ${{ steps.pila.outputs.grupo_seguridad }}
        run: |
          set -euo pipefail
          echo "Ejecutando la migracion como tarea puntual dentro de la red privada..."
          TAREA=$(aws ecs run-task \
            --cluster "$CLUSTER" \
            --task-definition "$FAMILIA" \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[$SUBREDES],securityGroups=[$GRUPO],assignPublicIp=ENABLED}" \
            --overrides '{"containerOverrides":[{"name":"api","command":["node","scripts/migrar.js"]}]}' \
            --query 'tasks[0].taskArn' --output text)

          echo "Tarea de migracion: $TAREA"
          aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TAREA"

          CODIGO=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TAREA" \
            --query 'tasks[0].containers[?name==`api`].exitCode' --output text)
          RAZON=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TAREA" \
            --query 'tasks[0].stoppedReason' --output text)

          echo "Codigo de salida: $CODIGO ($RAZON)"
          if [ "$CODIGO" != "0" ]; then
            echo "La migracion fallo. Revisar el grupo de registros /ecs/pda-staging."
            exit 1
          fi

      - name: Preparar la nueva revision de la definicion de tarea
        id: definicion
        env:
          FAMILIA: ${{ steps.pila.outputs.familia }}
        run: |
          set -euo pipefail
          aws ecs describe-task-definition --task-definition "$FAMILIA" \
            --query 'taskDefinition' --output json > tarea-actual.json
          # register-task-definition no admite los campos que solo describe
          # devuelve como informacion de estado.
          jq 'del(.taskDefinitionArn, .revision, .status, .requiresAttributes,
                  .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)' \
            tarea-actual.json > tarea-base.json
          echo "archivo=tarea-base.json" >> "$GITHUB_OUTPUT"

      - name: Fijar la imagen recien publicada
        id: render
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: ${{ steps.definicion.outputs.archivo }}
          container-name: api
          image: ${{ steps.pila.outputs.registro }}/pda-platform:${{ needs.construccion.outputs.etiqueta }}

      - name: Actualizar el servicio y esperar a que estabilice
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: ${{ steps.render.outputs.task-definition }}
          service: ${{ steps.pila.outputs.servicio }}
          cluster: ${{ steps.pila.outputs.cluster }}
          wait-for-service-stability: true

      - name: Resolver la direccion publica del entorno
        id: direccion
        env:
          CLUSTER: ${{ steps.pila.outputs.cluster }}
          SERVICIO: ${{ steps.pila.outputs.servicio }}
        run: |
          set -euo pipefail
          TAREA=$(aws ecs list-tasks --cluster "$CLUSTER" --service-name "$SERVICIO" \
            --desired-status RUNNING --query 'taskArns[0]' --output text)
          ENI=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TAREA" \
            --query "tasks[0].attachments[0].details[?name=='networkInterfaceId'].value" --output text)
          IP=$(aws ec2 describe-network-interfaces --network-interface-ids "$ENI" \
            --query 'NetworkInterfaces[0].Association.PublicIp' --output text)
          echo "url=http://$IP:3000" >> "$GITHUB_OUTPUT"
          echo "El entorno de staging quedo en http://$IP:3000"

      - name: Prueba de humo contra staging
        run: node scripts/esperar-salud.js "${{ steps.direccion.outputs.url }}" 180

      - name: Preparar Node.js para la verificacion posterior
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.VERSION_NODE }}
          cache: npm

      - name: Comprobar el recorrido principal en staging
        env:
          BASE_URL: ${{ steps.direccion.outputs.url }}
        run: |
          npm ci
          # Solo las comprobaciones de lectura: el despliegue se valida sin
          # alterar los datos del entorno.
          npx playwright test --project=sistema --grep "sonda de salud|catalogo academico"

      - name: Publicar el reporte de la prueba de humo
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: reporte-humo-staging
          path: reports/playwright/
          retention-days: 14

      - name: Resumen del despliegue
        if: always()
        run: |
          {
            echo "### Etapa 4 - Despliegue a staging"
            echo ""
            echo "| Elemento | Valor |"
            echo "| --- | --- |"
            echo "| Imagen desplegada | \`pda-platform:${{ needs.construccion.outputs.etiqueta }}\` |"
            echo "| Cluster | \`${{ steps.pila.outputs.cluster }}\` |"
            echo "| Servicio | \`${{ steps.pila.outputs.servicio }}\` |"
            echo "| Direccion | ${{ steps.direccion.outputs.url }} |"
            echo ""
            echo "La direccion cambia en cada despliegue: la tarea de Fargate recibe una"
            echo "direccion publica nueva y el entorno no lleva balanceador, por decision"
            echo "de costo. Para consultarla en cualquier momento: \`./scripts/url-staging.sh\`."
          } >> "$GITHUB_STEP_SUMMARY"
```

---

## 22. Flujo de demostracion de fallo

La entrega pide evidencia de ejecuciones exitosas **y fallidas**. Romper una
prueba a proposito en una rama y confirmarla deja basura en la historia del
repositorio. Para evitarlo, el repositorio incluye un segundo flujo que produce
la misma evidencia sin modificar nada.

**Ruta en el repositorio:** `.github/workflows/demostracion-fallo.yml`

Se ejecuta a mano:

1. Entrar a la pestania **Actions** del repositorio.
2. Elegir **Demostracion de ejecucion fallida** en la lista de la izquierda.
3. Pulsar **Run workflow**, elegir el tipo de defecto y confirmar.

| Tipo de defecto | Que hace | Que lo detecta |
| --- | --- | --- |
| `regla-de-negocio` | Invierte la comparacion del limite inferior de edad | CP-U02 y CP-I03: una aspirante de 3 anios pasaria a aceptarse en una disciplina cuya edad minima es 4 |
| `contrato-http` | Cambia el codigo de respuesta del recurso creado, de 201 a 200 | CP-I03 y CP-I04 |
| `analisis-estatico` | Introduce una variable que nadie usa | El paso de ESLint, antes de ejecutar una sola prueba |

El defecto solo existe en la copia de trabajo del servidor y desaparece al
terminar la ejecucion. El registro muestra la diferencia introducida, de modo
que la captura explica por si sola que se rompio y que lo detecto.

---

## 23. Anexo: equivalencia en GitLab CI y en Jenkins

Las tres herramientas expresan el mismo diseno: cuatro etapas encadenadas, dos
de ellas en paralelo, con publicacion y despliegue restringidos a la rama
principal. Lo que cambia es la sintaxis.

> Estas dos traducciones se incluyen como constancia del diseno. **No se han
> ejecutado**, porque el proyecto usa GitHub Actions; la version probada y en
> uso es la de la seccion 21.
>
> Ambas invocan un guion `scripts/desplegar-staging.sh` que **no existe en el
> repositorio**: la canalizacion en uso ejecuta esos mismos pasos en linea
> dentro de la etapa 4, y aqui se resumen en una sola llamada para no repetir
> cuarenta renglones en cada traduccion. Los pasos que encapsularia son los
> cuatro de la seccion 4: migracion, nueva revision de la definicion de tarea,
> actualizacion del servicio y espera a que estabilice.

### 23.1 Equivalencia en GitLab CI (`.gitlab-ci.yml`)

```yaml
stages: [verificacion, construccion, pruebas-e2e, despliegue]

variables:
  VERSION_NODE: "20"
  REPOSITORIO_ECR: pda-platform
  DOCKER_DRIVER: overlay2

default:
  image: node:20
  cache:
    key:
      files: [package-lock.json]
    paths: [node_modules/]

# --- Etapa 1 ----------------------------------------------------------------
verificacion:
  stage: verificacion
  script:
    - npm ci
    - npm run lint
    - npm run test:ci
  artifacts:
    when: always
    expire_in: 14 days
    paths: [reports/, coverage/]
    reports:
      junit: reports/junit.xml

# --- Etapa 2 ----------------------------------------------------------------
construccion:
  stage: construccion
  image: docker:27
  services: [docker:27-dind]
  script:
    - export ETIQUETA="${CI_COMMIT_SHA:0:8}"
    - docker build -f docker/Dockerfile -t "pda-platform:$ETIQUETA" .
    - |
      for SERVICIO in auth catalogo inscripcion pagos; do
        docker build -f "docker/$SERVICIO/Dockerfile" -t "pda-$SERVICIO:$ETIQUETA" .
      done
    # Comprobacion de que la imagen arranca de verdad
    - docker run -d --name pda-humo -p 3000:3000 -e JWT_SECRET=comprobacion "pda-platform:$ETIQUETA"
    - for i in $(seq 1 20); do wget -q -O- http://localhost:3000/health/vivo && break || sleep 3; done
    - docker rm -f pda-humo
    # Publicacion unicamente desde la rama principal
    - |
      if [ "$CI_COMMIT_BRANCH" = "$CI_DEFAULT_BRANCH" ]; then
        aws ecr get-login-password --region "$AWS_REGION" \
          | docker login --username AWS --password-stdin "$REGISTRO_ECR"
        docker tag "pda-platform:$ETIQUETA" "$REGISTRO_ECR/$REPOSITORIO_ECR:$ETIQUETA"
        docker push "$REGISTRO_ECR/$REPOSITORIO_ECR:$ETIQUETA"
      fi

# --- Etapa 3 ----------------------------------------------------------------
pruebas-e2e:
  stage: pruebas-e2e
  image: mcr.microsoft.com/playwright:v1.63.0-jammy
  services:
    - name: postgres:16-alpine
      alias: postgres
    - name: redis:7-alpine
      alias: redis
  variables:
    POSTGRES_DB: pda
    POSTGRES_USER: pda_app
    POSTGRES_PASSWORD: pda_local
    POSTGRES_HOST: postgres
    REDIS_HOST: redis
    BASE_URL: http://localhost:3000
  script:
    - npm ci
    - node scripts/migrar.js
    - npm start &
    - node scripts/esperar-salud.js http://localhost:3000 180
    - npm run e2e
  artifacts:
    when: always
    expire_in: 14 days
    paths: [reports/playwright/, reports/playwright-artefactos/]
    reports:
      junit: reports/playwright-junit.xml

# --- Etapa 4 ----------------------------------------------------------------
despliegue-staging:
  stage: despliegue
  rules:
    - if: $CI_COMMIT_BRANCH == $CI_DEFAULT_BRANCH
  environment:
    name: staging
  script:
    - ./scripts/desplegar-staging.sh "${CI_COMMIT_SHA:0:8}"
    - node scripts/esperar-salud.js "$(./scripts/url-staging.sh)" 180
```

Diferencia de fondo respecto de la version de GitHub Actions: GitLab no ofrece
federacion de identidad con AWS de la misma forma, de modo que las credenciales
entrarian como variables protegidas del proyecto. Es un punto debil frente a la
solucion adoptada, donde no se almacena ninguna llave.

### 23.2 Equivalencia en Jenkins (`Jenkinsfile`)

```groovy
pipeline {
    agent any

    environment {
        VERSION_NODE      = '20'
        REPOSITORIO_ECR   = 'pda-platform'
        ETIQUETA          = "${env.GIT_COMMIT.take(8)}"
    }

    options {
        timeout(time: 30, unit: 'MINUTES')
        disableConcurrentBuilds()
    }

    stages {

        stage('1. Verificacion') {
            steps {
                sh 'npm ci'
                sh 'npm run lint'
                sh 'npm run test:ci'
            }
            post {
                always {
                    junit 'reports/junit.xml'
                    archiveArtifacts artifacts: 'reports/**, coverage/**', allowEmptyArchive: true
                }
            }
        }

        stage('Construccion y pruebas end to end') {
            parallel {

                stage('2. Construccion') {
                    steps {
                        sh 'docker build -f docker/Dockerfile -t pda-platform:${ETIQUETA} .'
                        sh '''
                            for SERVICIO in auth catalogo inscripcion pagos; do
                              docker build -f "docker/$SERVICIO/Dockerfile" \
                                -t "pda-$SERVICIO:${ETIQUETA}" .
                            done
                        '''
                        sh '''
                            docker run -d --name pda-humo -p 3000:3000 \
                              -e JWT_SECRET=comprobacion pda-platform:${ETIQUETA}
                            for i in $(seq 1 20); do
                              curl -fsS http://localhost:3000/health/vivo && break || sleep 3
                            done
                            docker rm -f pda-humo
                        '''
                    }
                }

                stage('3. Pruebas end to end') {
                    steps {
                        sh 'docker compose --profile monolito up -d --build'
                        sh 'node scripts/esperar-salud.js http://localhost:3000 180'
                        sh 'npm run e2e'
                    }
                    post {
                        always {
                            junit 'reports/playwright-junit.xml'
                            publishHTML(target: [
                                reportDir:  'reports/playwright',
                                reportFiles:'index.html',
                                reportName: 'Reporte de Playwright'
                            ])
                            sh 'docker compose --profile monolito down -v'
                        }
                    }
                }
            }
        }

        stage('4. Despliegue a staging') {
            when { branch 'main' }
            steps {
                withCredentials([[$class: 'AmazonWebServicesCredentialsBinding',
                                  credentialsId: 'aws-pda']]) {
                    sh './scripts/desplegar-staging.sh ${ETIQUETA}'
                    sh 'node scripts/esperar-salud.js "$(./scripts/url-staging.sh)" 180'
                }
            }
        }
    }

    post {
        failure {
            echo 'La canalizacion se detuvo: ninguna imagen se publico y staging no se toco.'
        }
    }
}
```

---
---

# Parte IV — Evidencia

## 24. Capturas de las ejecuciones

> **Instrucciones para completar esta seccion.**
> Guardar cada imagen en `docs/capturas/` con el nombre indicado en cada
> recuadro. Los enlaces de abajo ya apuntan a esos nombres, de modo que las
> imagenes aparecen solas al guardarlas. Si alguna captura no aplica todavia
> —por ejemplo las de staging antes de desplegar— se deja el recuadro con la
> nota de pendiente.

### 24.1 Canalizacion: ejecucion exitosa

---

**CAPTURA 1 — Ejecucion completa en verde**

*Que debe mostrarse:* la vista de una ejecucion en la pestania **Actions** con
las cuatro etapas en verde y sus nombres visibles.
*Donde obtenerla:* Actions → la ejecucion mas reciente sobre `main`.

![Ejecucion completa en verde](capturas/01-ejecucion-exitosa.png)

---

**CAPTURA 2 — Resumen de la ejecucion**

*Que debe mostrarse:* la seccion **Summary** de esa misma ejecucion, con las
tablas que genera cada etapa: rama, commit, version de Node, pruebas ejecutadas
y fallidas, etiqueta de la imagen.
*Donde obtenerla:* dentro de la ejecucion, al inicio de la pagina.

![Resumen de la ejecucion](capturas/02-resumen-ejecucion.png)

---

**CAPTURA 3 — Detalle de la etapa de verificacion**

*Que debe mostrarse:* el registro del paso *Bateria de pruebas con reporte y
cobertura*, desplegado, donde se lea el conteo final de Jest.
*Donde obtenerla:* dentro de la ejecucion → trabajo *1. Verificacion*.

![Detalle de la etapa de verificacion](capturas/03-etapa-verificacion.png)

---

**CAPTURA 4 — Artefactos producidos**

*Que debe mostrarse:* la lista de artefactos al pie de la pagina de la
ejecucion: `reporte-jest` y `reporte-playwright`.
*Donde obtenerla:* dentro de la ejecucion, seccion **Artifacts**.

![Artefactos producidos](capturas/04-artefactos.png)

---

### 24.2 Canalizacion: ejecucion fallida

---

**CAPTURA 5 — Ejecucion detenida por un defecto**

*Que debe mostrarse:* la ejecucion del flujo *Demostracion de ejecucion fallida*
en rojo, con el paso que fallo marcado.
*Donde obtenerla:* Actions → Demostracion de ejecucion fallida → Run workflow →
elegir `regla-de-negocio` → esperar a que termine en rojo.

![Ejecucion detenida por un defecto](capturas/05-ejecucion-fallida.png)

---

**CAPTURA 6 — Detalle del caso que detecto el defecto**

*Que debe mostrarse:* el registro desplegado con el nombre del caso fallido y la
diferencia entre el valor esperado y el obtenido.
*Donde obtenerla:* dentro de esa ejecucion → paso *Bateria de pruebas con
reporte*. El paso anterior, *Inyectar el defecto*, muestra la linea que se
modifico.

![Detalle del caso fallido](capturas/06-caso-fallido.png)

---

### 24.3 Reportes de pruebas

---

**CAPTURA 7 — Reporte HTML de Playwright, vista general**

*Que debe mostrarse:* el resumen con los 45 casos agrupados en los cuatro
proyectos y el conteo de aprobados.
*Donde obtenerla:* `npm run reporte:e2e` despues de una corrida local, o
descargando el artefacto `reporte-playwright` y abriendo `playwright/index.html`.

![Reporte de Playwright, vista general](capturas/07-reporte-playwright.png)

---

**CAPTURA 8 — Reporte HTML de Playwright, detalle de un caso**

*Que debe mostrarse:* el detalle de un caso con sus pasos. Se sugiere
**CP-S03** (recorrido completo) o **CP-REN01**, donde se ven las mediciones de
tiempo registradas como anotacion.
*Donde obtenerla:* en el mismo reporte, pulsando sobre el caso.

![Detalle de un caso en el reporte](capturas/08-detalle-caso.png)

---

**CAPTURA 9 — Cobertura de codigo**

*Que debe mostrarse:* el resumen de cobertura por archivo.
*Donde obtenerla:* `npm run reporte:cobertura` y abrir `coverage/index.html`, o
la tabla que imprime `npm run test:ci` en la terminal.

![Cobertura de codigo](capturas/09-cobertura.png)

---

**CAPTURA 10 — Ejecucion de la bateria en la terminal**

*Que debe mostrarse:* la salida de `npm test` con el conteo final, y la de
`npm run e2e` con los 45 casos.
*Donde obtenerla:* terminal local.

![Ejecucion en terminal](capturas/10-terminal.png)

---

### 24.4 La plataforma funcionando

---

**CAPTURA 11 — Consola operativa**

*Que debe mostrarse:* la consola en el navegador con el catalogo cargado, o el
recorrido de la direccion con una alumna recien registrada.
*Donde obtenerla:* `npm run entorno:arriba` y abrir `http://localhost:3000`.

![Consola operativa](capturas/11-consola.png)

---

**CAPTURA 12 — Entorno de staging desplegado**

*Que debe mostrarse:* la consola operativa respondiendo desde la direccion
publica de AWS, o la salida de `curl` sobre `/health` de staging.
*Donde obtenerla:* `./scripts/url-staging.sh` despues del despliegue.

![Entorno de staging](capturas/12-staging.png)

---

**CAPTURA 13 — Servicio en Amazon ECS**

*Que debe mostrarse:* el servicio en la consola de AWS con su tarea en estado
*Running* y la revision de la definicion de tarea desplegada.
*Donde obtenerla:* consola de AWS → ECS → cluster `pda-platform-staging`.

![Servicio en Amazon ECS](capturas/13-ecs.png)

---

**CAPTURA 14 — Panel de CloudWatch**

*Que debe mostrarse:* el panel `pda-platform-staging` con el uso de procesador y
memoria, las metricas de la base de datos y la consulta de registros.
*Donde obtenerla:* consola de AWS → CloudWatch → Dashboards.

![Panel de CloudWatch](capturas/14-cloudwatch.png)

---

**CAPTURA 15 — Despliegue disparado por una fusion a main**

*Que debe mostrarse:* la ejecucion de la canalizacion donde se ve la etapa
*4. Despliegue a staging* completada, con la direccion del entorno en el
resumen.
*Donde obtenerla:* Actions, despues de fusionar un cambio a `main`.

![Despliegue a staging](capturas/15-despliegue.png)

---

## 25. Como reproducir todo desde cero

```bash
# 1. Obtener el codigo e instalar
git clone https://github.com/USUARIO/pda-platform.git
cd pda-platform
npm ci
cp .env.example .env          # completar los valores

# 2. Nivel 1 de pruebas: sin infraestructura
npm run lint
npm test

# 3. Levantar el entorno completo
npm run entorno:arriba
npm run salud
npm run datos:reiniciar

# 4. Nivel 2 de pruebas
npx playwright install chromium
npm run e2e

# 5. Ver los reportes
npm run reporte:e2e
npm run reporte:cobertura

# 6. Abrir la consola operativa
open http://localhost:3000

# 7. Apagar
npm run entorno:abajo
```

Para dejar operativo el despliegue a staging en AWS, el procedimiento completo
—con la creacion del rol de federacion, la pila de infraestructura, la
configuracion de las variables en GitHub y el desmontaje al terminar— esta en
`docs/despliegue-staging.md`.

---

## Documentos relacionados en el repositorio

| Documento | Contenido |
| --- | --- |
| `docs/plan-de-pruebas.md` | Plan de pruebas de trabajo, con el mismo contenido de la Parte II |
| `docs/pipeline-cicd.md` | Detalle operativo de la canalizacion |
| `docs/despliegue-staging.md` | Configuracion de GitHub y AWS, comandos y desmontaje |
| `docs/configuracion-aws.md` | Canalizacion alternativa con AWS CodePipeline |
| `docs/flujo-de-trabajo.md` | Convencion de ramas, mensajes de confirmacion y revision |
