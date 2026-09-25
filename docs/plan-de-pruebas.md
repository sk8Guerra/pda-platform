# Plan de pruebas

**Proyecto:** Plataforma de transformacion digital de Perfect Dance Academy
**Entrega:** Octava — Implementacion DevOps 1
**Version del documento:** 2.0
**Fecha:** 26 de septiembre de 2026
**Elaborado por:** equipo de desarrollo del seminario
**Universidad Mariano Galvez de Guatemala** — Facultad de Ingenieria en Sistemas de Informacion

---

## 1. Proposito

Este documento define como se comprueba que la plataforma hace lo que el
levantamiento de requerimientos dice que debe hacer, y como se demuestra que
sigue haciendolo despues de cada cambio.

No es un documento de intenciones. Cada caso descrito aqui corresponde a codigo
que se ejecuta: la columna *Ubicacion* de cada caso indica el archivo y la suite
donde vive, y la canalizacion de integracion continua los corre completos en
cada propuesta de cambio y en cada fusion hacia la rama principal. Un caso que
no se puede ejecutar no pertenece a este plan: pertenece a la lista de
verificaciones manuales de la seccion 9.

El plan sustituye a la version 1.0, que cubria unicamente la bateria de Jest.

---

## 2. Objetivos

**Objetivo general.** Verificar que la plataforma cumple los requerimientos
funcionales y no funcionales acordados, y que cada version que llega al entorno
de staging esta libre de defectos conocidos en el recorrido central del negocio.

**Objetivos especificos.**

1. Comprobar que el recorrido de inscripcion y registro —la solicitud de la
   aspirante, su aceptacion y la asignacion de clase, horario y docente— se
   resuelve como una sola operacion y no deja registros parciales (RF-020 a
   RF-023).
2. Comprobar que las reglas que la entrega puso en el motor de base de datos
   —el cupo maximo por clase y la generacion automatica de la mensualidad— se
   cumplen aunque la aplicacion intentara saltarlas (RN-004, RN-007).
3. Comprobar que el control de acceso por rol impide toda operacion que no
   corresponda al rol de quien la solicita (RF-001 a RF-006, RNF-015).
4. Comprobar que la plataforma responde dentro de los tiempos comprometidos en
   las pantallas de mayor consulta (RNF-001).
5. Comprobar que ningun dato sensible —contrasenas, hashes, datos de tarjeta,
   detalles internos del motor— sale en ninguna respuesta (RNF-016, RNF-017).
6. Dejar evidencia reproducible de cada ejecucion: reporte JUnit, cobertura de
   codigo y reporte HTML navegable, conservados como artefactos de la
   canalizacion.
7. Detener la entrega de cualquier version que no pase la totalidad de los casos
   automatizados.

---

## 3. Alcance

### 3.1 Incluido

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

### 3.2 Excluido

- Los modulos de eventos, tienda en linea y difusion, que no forman parte de
  esta fase.
- La pasarela de pagos real. La plataforma nunca recibe datos de tarjeta; el
  adaptador se ejercita en modo simulado y la integracion con el proveedor
  certificado se probara en el entorno de preproduccion cuando exista contrato.
- Pruebas de carga sostenida y de estres. Las pruebas de rendimiento de este
  plan miden tiempo de respuesta con carga ligera, no el punto de quiebre.
- Compatibilidad con navegadores distintos de los declarados en la seccion 4.
- Recuperacion ante desastres y respaldo de la base de datos de produccion.

---

## 4. Parametros del sistema

### 4.1 Version del producto bajo prueba

| Elemento | Valor |
| --- | --- |
| Nombre | pda-platform |
| Version | 1.0.0 |
| Identificador de la version probada | primeros ocho caracteres del commit, visible en `/health` |
| Rama | `main` |
| Repositorio | GitHub, un repositorio unico para codigo, documentacion e infraestructura |

### 4.2 Plataforma de ejecucion

| Elemento | Valor |
| --- | --- |
| Lenguaje | JavaScript sobre Node.js 20 LTS |
| Marco de trabajo web | Express 4 |
| Sistema gestor de base de datos | PostgreSQL 16 |
| Cache | Redis 7 |
| Contenedores | Docker Engine 24 o superior, Compose v2 |
| Imagen base | `node:20-alpine` |

### 4.3 Entornos

| Entorno | Donde corre | Base de datos | Proposito |
| --- | --- | --- | --- |
| Local | Maquina del desarrollador, Docker Compose | PostgreSQL 16 en contenedor | Desarrollo y ejecucion completa del plan antes de proponer un cambio |
| Integracion continua | GitHub Actions, `ubuntu-latest` | PostgreSQL 16 en contenedor, efimero | Ejecucion automatica en cada propuesta de cambio y cada fusion |
| Staging | Amazon ECS sobre Fargate | Amazon RDS PostgreSQL 16, `db.t4g.micro` | Verificacion de la version desplegada y demostracion de la entrega |

### 4.4 Equipo de pruebas

| Elemento | Maquina de desarrollo | Servidor de integracion continua | Staging |
| --- | --- | --- | --- |
| Sistema operativo | macOS 15 (Darwin 25.6) | Ubuntu 24.04 LTS | Amazon Linux 2023 (Fargate) |
| Procesador | Apple Silicon, 8 nucleos | 4 nucleos virtuales x86-64 | 0.5 vCPU asignada a la tarea |
| Memoria | 16 GB | 16 GB | 1 GB asignado a la tarea |
| Almacenamiento | SSD NVMe | SSD | 20 GB gp2 en la base de datos |
| Red | Conexion domestica, 100 Mbps | Red de GitHub, dentro del centro de datos | VPC propia, `10.20.0.0/16` |

La diferencia de potencia entre las tres maquinas es la razon por la que los
umbrales de las pruebas de rendimiento estan holgados: un umbral ajustado a la
maquina de desarrollo convertiria cada ejecucion del servidor en un falso
negativo, y una bateria que falla sin motivo real es una bateria que el equipo
aprende a ignorar.

### 4.5 Navegadores

| Navegador | Version | Uso |
| --- | --- | --- |
| Chromium (empaquetado con Playwright) | 153.0.8010.12 | Pruebas de aceptacion automatizadas, en modo sin ventana dentro de la canalizacion |
| Google Chrome | 141 o superior | Revision manual de experiencia de uso |
| Safari | 18 | Revision manual de experiencia de uso en macOS |
| Chrome para Android | 141 o superior | Revision manual en pantalla de telefono |

Resoluciones utilizadas: 1280x720 en las pruebas automatizadas de escritorio y
390x844 en la comprobacion de pantalla angosta.

### 4.6 Herramientas

| Herramienta | Version | Funcion |
| --- | --- | --- |
| Jest | 29.7.0 | Pruebas unitarias, de integracion y de seguridad sobre la superficie HTTP |
| Supertest | 7.2.2 | Peticiones HTTP contra la aplicacion levantada en memoria |
| Playwright | 1.63.0 | Pruebas de sistema, aceptacion, seguridad y rendimiento contra el despliegue real |
| jest-junit | 16.0.0 | Reporte en formato JUnit para el servidor de integracion continua |
| ESLint | 9.39.5 | Analisis estatico previo a las pruebas |
| Postman | coleccion incluida en el repositorio | Exploracion manual de la API |

---

## 5. Tipos de prueba

### 5.1 Pruebas unitarias

Verifican una regla de negocio aislada, sin red, sin base de datos y sin
dependencias externas. Son las mas numerosas y las mas rapidas: la bateria
completa corre en menos de dos segundos, lo que permite ejecutarla en cada
guardado durante el desarrollo.

Cubren el calculo de edad de la aspirante y su validacion contra el rango de
cada disciplina, la emision y verificacion del token de sesion, y la traduccion
de errores a respuestas HTTP.

Ubicacion: `tests/unitarias/`.

### 5.2 Pruebas de integracion

Verifican el contrato HTTP de cada modulo: rutas, codigos de respuesta, forma
del cuerpo y comportamiento ante entradas invalidas. Se ejecutan sobre la
aplicacion completa levantada en memoria, con PostgreSQL y Redis sustituidos por
dobles.

La sustitucion es deliberada. Permite que la bateria corra en cualquier maquina
y en el servidor de construccion sin infraestructura previa, y que cada caso
controle con exactitud que devuelve la base de datos, incluidos los fallos que
serian dificiles de provocar contra un motor real.

Ubicacion: `tests/integracion/`.

### 5.3 Pruebas de sistema

Verifican el recorrido completo contra la plataforma desplegada de verdad:
contenedores en marcha, PostgreSQL con sus disparadores y Redis atendiendo. Es
el unico nivel donde se puede comprobar lo que vive en el motor y no en el
codigo, y donde se observa el efecto acumulado de varias operaciones
encadenadas.

Ubicacion: `tests/e2e/sistema-recorrido.spec.js`, proyecto `sistema` de Playwright.

### 5.4 Pruebas de aceptacion

Reproducen en el navegador lo que hara una persona el dia de la puesta en
marcha. El criterio de aprobacion es el enunciado de la historia de usuario, no
el contrato tecnico: la prueba pasa si la encargada de una aspirante logra
enviar su solicitud y la direccion logra aceptarla, asignarle clase y cobrar la
mensualidad, viendo en pantalla lo que corresponde en cada paso.

Ubicacion: `tests/e2e/aceptacion-consola.spec.js`, proyecto `aceptacion`.

### 5.5 Pruebas de seguridad

Verifican los requerimientos no funcionales de proteccion. Se ejecutan en dos
niveles: sobre la superficie HTTP con dobles, para cubrir muchos casos rapido, y
contra el despliegue real, para lo que depende de la configuracion del entorno.

Cubren cabeceras de proteccion del navegador, control de acceso sin sesion y con
rol insuficiente, rechazo de tokens falsificados o alterados, no divulgacion de
detalles internos del motor, tratamiento de entrada no confiable y ausencia de
datos de tarjeta en cualquier respuesta.

Ubicacion: `tests/seguridad/` y `tests/e2e/seguridad-plataforma.spec.js`.

### 5.6 Pruebas de rendimiento

Miden el tiempo de respuesta de las operaciones de mayor consulta contra el
despliegue real y lo comparan con el compromiso del requerimiento. Registran
minimo, media, percentil 95 y maximo de cada serie, que quedan en el reporte
HTML para observar la tendencia entre ejecuciones.

Ubicacion: `tests/e2e/rendimiento-catalogo.spec.js`, proyecto `rendimiento`.

### 5.7 Distribucion

| Nivel | Casos | Duracion medida | Frecuencia |
| --- | --- | --- | --- |
| Unitarias | 21 | incluidas en el segundo de Jest | Cada guardado, cada propuesta de cambio |
| Integracion | 54 | incluidas en el segundo de Jest | Cada guardado, cada propuesta de cambio |
| Seguridad con dobles | 23 | incluidas en el segundo de Jest | Cada propuesta de cambio |
| **Subtotal de Jest** | **98** | **1.0 s** | |
| Sistema | 10 | 1.7 s | Cada propuesta de cambio y cada fusion |
| Aceptacion | 13 | 6.5 s | Cada propuesta de cambio y cada fusion |
| Seguridad end to end | 17 | 2.6 s | Cada propuesta de cambio y cada fusion |
| Rendimiento | 5 | 1.3 s | Cada propuesta de cambio y cada fusion |
| **Subtotal de Playwright** | **45** | **14.2 s con el arranque del navegador** | |
| Manuales de experiencia de uso | 6 | 30 min | Una vez por entrega |

La forma es deliberada: muchas pruebas baratas en la base y pocas caras en la
cima. Una bateria que tarda veinte minutos deja de ejecutarse.

---

## 6. Estrategia de pruebas

### 6.1 Automatizado frente a manual

Se automatiza todo lo que tenga un resultado esperado definido sin ambiguedad:
codigos de respuesta, contenido del cuerpo, estados en la base de datos, tiempos
de respuesta y presencia o ausencia de texto en la pantalla.

Se reserva a la revision manual lo que exige juicio humano: si el mensaje de
error se entiende sin conocer el sistema, si el orden de los campos acompania el
modo en que una persona llena el formulario, si la pantalla se lee comoda en el
telefono de la encargada. Esos puntos estan en la seccion 9 y se ejecutan una
vez por entrega.

### 6.2 Datos de prueba

Ningun dato corresponde a personas reales. El archivo `db/init/02_semilla.sql`
siembra tres usuarios de demostracion —uno por rol—, tres disciplinas, ocho
niveles, cinco clases y dos solicitudes pendientes. Las credenciales de
demostracion solo existen en local y en staging.

Cada prueba que crea datos usa un sufijo derivado de la marca de tiempo, de modo
que puede repetirse sobre el mismo entorno sin chocar con la ejecucion anterior.
Antes de una ejecucion de la que se vaya a tomar evidencia, el entorno se
devuelve a su estado conocido con `npm run datos:reiniciar`.

### 6.3 Criterios de entrada

Una version entra a prueba cuando compila, el analisis estatico no reporta
errores y las cinco imagenes de contenedor construyen.

### 6.4 Criterios de salida

Una version se considera aprobada y apta para desplegarse a staging cuando:

1. La totalidad de los casos automatizados pasa, sin excepciones ni casos
   marcados como omitidos por conveniencia.
2. La cobertura de sentencias del codigo de `src/` no baja respecto de la
   version anterior.
3. Ningun defecto de severidad alta o critica queda abierto.
4. Las verificaciones manuales de experiencia de uso de la seccion 9 estan
   ejecutadas y sus observaciones registradas.

### 6.5 Gestion de defectos

Los defectos se registran como incidencias en GitHub Issues, con la etiqueta
`defecto` y la severidad. Un defecto critico o alto detiene la entrega. Todo
defecto corregido entra acompaniado de la prueba automatizada que lo habria
detectado: es la unica manera de garantizar que no regresa.

| Severidad | Definicion | Respuesta |
| --- | --- | --- |
| Critica | Perdida de datos, cobro incorrecto o acceso no autorizado | Se detiene la entrega y se corrige de inmediato |
| Alta | Un recorrido principal no se puede completar | Se corrige antes de la entrega |
| Media | Funcion secundaria degradada, con rodeo disponible | Se programa para el sprint siguiente |
| Baja | Detalle de presentacion o de redaccion | Se acumula y se corrige por lotes |

### 6.6 Riesgos del plan y como se atienden

| Riesgo | Efecto | Como se atiende |
| --- | --- | --- |
| Los dobles de PostgreSQL ocultan un defecto real del motor | Un defecto llega a staging | Las reglas del motor se prueban ademas en el nivel de sistema, contra la base real |
| Las pruebas de rendimiento fallan por el ruido del servidor compartido | El equipo aprende a ignorar la bateria | Umbrales holgados, medicion por percentil y registro de la tendencia en el reporte |
| Las pruebas end to end dejan datos que afectan la ejecucion siguiente | Fallos intermitentes | Datos con sufijo unico, ejecucion en serie y reinicio del entorno antes de una ejecucion de evidencia |
| La cuenta de AWS agota la capa gratuita | El entorno de staging se apaga | El entorno se levanta para la demostracion y se elimina al terminar |
| Una prueba depende del orden en que se ejecutan las demas | Fallos difíciles de reproducir | `workers: 1` y `fullyParallel: false`, con datos propios por caso |

---

## 7. Casos de prueba

### Como se completa la columna "Resultado obtenido"

La columna se llena con la salida real de la ejecucion, no antes. El
procedimiento de la seccion 8 produce dos reportes de los que se toma el dato:

- `reports/junit.xml` y la salida de `npm run test:ci` para los casos de los
  niveles unitario, de integracion y de seguridad con dobles.
- El reporte HTML de Playwright (`npm run reporte:e2e`) para los casos de
  sistema, aceptacion, seguridad end to end y rendimiento. Los identificadores
  `CP-S`, `CP-SEG` y `CP-REN` aparecen textualmente en los titulos del reporte,
  de modo que cada caso de esta tabla se localiza buscando su identificador.

Se escribe **Aprobado** con la fecha, o **Fallido** con el numero de la
incidencia que se abrio.

### Registro de la ejecucion que respalda esta version del documento

| Elemento | Valor |
| --- | --- |
| Fecha y hora | 25 de septiembre de 2026 |
| Entorno | Local, Docker Compose, perfil `monolito` |
| Maquina | macOS 15 (Darwin 25.6), Apple Silicon, 16 GB |
| Node.js | v23.4.0 (la imagen de contenedor usa Node 20) |
| Motor de contenedores | Docker 29.4.0 sobre OrbStack |
| Base de datos | PostgreSQL 16 en contenedor, reiniciada con `npm run datos:reiniciar` |
| Navegador | Chromium 153.0.8010.12, empaquetado con Playwright 1.63.0 |
| Resultado de Jest | 98 casos, 9 suites, 96 aprobados, 0 fallidos, 1.0 s |
| Resultado de Playwright | 45 casos, 4 proyectos, 45 aprobados, 0 fallidos, 14.2 s |

La bateria se ejecuto dos veces consecutivas sin reiniciar los datos entre una y
otra, y dio el mismo resultado: ningun caso depende del orden de ejecucion ni
del estado que dejo el anterior.

**Lo que falta ejecutar.** Estos resultados corresponden al entorno local. Antes
de la defensa conviene repetir la ejecucion contra el entorno de staging una vez
desplegado, con `BASE_URL="$(./scripts/url-staging.sh)" npm run e2e`, y
actualizar este registro con esa segunda corrida.

---

### 7.1 Pruebas unitarias

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

### 7.2 Pruebas de integracion

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

### 7.3 Pruebas de sistema

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

### 7.4 Pruebas de aceptacion

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

### 7.5 Pruebas de seguridad

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

### 7.6 Pruebas de rendimiento

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

### 7.7 Resumen de trazabilidad

| Id | Tipo | Requerimiento | Automatizado | Corre en la canalizacion |
| --- | --- | --- | --- | --- |
| CP-U01 | Unitaria | RF-020, RN-002 | Si | Etapa 1 |
| CP-U02 | Unitaria | RF-020, RN-002 | Si | Etapa 1 |
| CP-U03 | Unitaria | RNF-015, RNF-020 | Si | Etapa 1 |
| CP-U04 | Unitaria | RF-001 a RF-006 | Si | Etapa 1 |
| CP-I01 | Integracion | RF-002, RNF-016 | Si | Etapa 1 |
| CP-I02 | Integracion | RF-010, RNF-001 | Si | Etapa 1 |
| CP-I03 | Integracion | RF-020 | Si | Etapa 1 |
| CP-I04 | Integracion | RF-021 a RF-023 | Si | Etapa 1 |
| CP-I05 | Integracion | RF-030, RNF-017 | Si | Etapa 1 |
| CP-S01 | Sistema | RNF-010, RNF-024 | Si | Etapa 3 |
| CP-S02 | Sistema | RF-010 a RF-014 | Si | Etapa 3 |
| CP-S03 | Sistema | RF-020 a RF-023, RF-030 | Si | Etapa 3 |
| CP-S04 | Sistema | RF-014, RN-004 | Si | Etapa 3 |
| CP-A01 | Aceptacion | HU-013 | Si | Etapa 3 |
| CP-A02 | Aceptacion | HU-014 | Si | Etapa 3 |
| CP-A03 | Aceptacion | HU-002 | Si | Etapa 3 |
| CP-A04 | Aceptacion | HU-015, HU-021 | Si | Etapa 3 |
| CP-SEG01 | Seguridad | RNF-019 | Si | Etapas 1 y 3 |
| CP-SEG02 | Seguridad | RF-001 a RF-006 | Si | Etapas 1 y 3 |
| CP-SEG03 | Seguridad | RNF-015, RNF-016 | Si | Etapa 3 |
| CP-SEG04 | Seguridad | RNF-017, RNF-019 | Si | Etapas 1 y 3 |
| CP-REN01 | Rendimiento | RNF-001 | Si | Etapa 3 |
| CP-REN02 | Rendimiento | RNF-001, RNF-010 | Si | Etapa 3 |
| CP-REN03 | Rendimiento | RNF-001, RF-021 | Si | Etapa 3 |
| CP-M01 a CP-M06 | Experiencia de uso | RNF-002, RNF-003 | No | Revision manual por entrega |

Veinticuatro casos automatizados y seis verificaciones manuales.

---

## 8. Ejecucion del plan de pruebas

### 8.1 Ejecucion automatica

La canalizacion de GitHub Actions ejecuta el plan completo sin intervencion, en
cada propuesta de cambio y en cada fusion hacia la rama principal. El detalle de
las etapas esta en `docs/pipeline-cicd.md`.

| Etapa | Que ejecuta | Que produce |
| --- | --- | --- |
| 1. Verificacion | Analisis estatico y bateria de Jest | `reports/junit.xml`, cobertura en `coverage/` |
| 2. Construccion | Cinco imagenes y prueba de humo de la imagen | Imagenes publicadas en Amazon ECR |
| 3. Pruebas end to end | Las cuatro suites de Playwright sobre el entorno completo | Reporte HTML navegable y `reports/playwright-junit.xml` |
| 4. Despliegue | Migracion y actualizacion del servicio en staging | Prueba de humo contra la direccion publica |

### 8.2 Ejecucion manual, paso a paso

**Niveles unitario, de integracion y de seguridad con dobles.** No requieren
infraestructura: corren en cualquier maquina con Node.js 20.

```bash
npm ci
npm test                      # bateria completa
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

Para ejecutar el mismo plan contra el entorno de staging en lugar del local:

```bash
BASE_URL="$(./scripts/url-staging.sh)" npm run e2e:sistema
```

### 8.3 Reportes y evidencia

```bash
npm run reporte:e2e          # abre el reporte HTML de Playwright en el navegador
npm run reporte:cobertura    # genera coverage/index.html y lo deja listo para abrir
```

| Reporte | Ruta | Contenido |
| --- | --- | --- |
| Reporte HTML de Playwright | `reports/playwright/index.html` | Cada caso con su duracion, sus pasos, las mediciones de rendimiento y, ante un fallo, la captura de pantalla y el video del navegador |
| Resultado en formato JUnit | `reports/junit.xml` y `reports/playwright-junit.xml` | Lo que consume el servidor de integracion continua para mostrar el conteo de casos |
| Cobertura de codigo | `coverage/index.html` | Porcentaje de sentencias, ramas, funciones y lineas cubiertas por archivo |

En la canalizacion, los tres quedan como artefactos descargables de cada
ejecucion, con catorce dias de retencion. Para revisar el reporte HTML de una
ejecucion del servidor: descargar el artefacto **reporte-playwright**,
descomprimirlo y abrir `playwright/index.html`.

### 8.4 Evidencia que acompania la entrega

1. Captura de una ejecucion completa en verde, con las cuatro etapas.
2. Captura de una ejecucion en rojo, obtenida con el flujo
   *Demostracion de ejecucion fallida*, que muestra que la canalizacion detiene
   una version defectuosa antes de construir ninguna imagen.
3. Captura del reporte HTML de Playwright con las cuatro suites.
4. Captura del resumen de cobertura.
5. Captura de la consola operativa funcionando contra el entorno de staging.
6. Esta tabla de casos con la columna "Resultado obtenido" completada.

---

## 9. Verificaciones manuales de experiencia de uso

Se ejecutan una vez por entrega, sobre el entorno levantado, y su resultado se
registra como observacion. No tienen resultado binario: lo que se busca es
juicio sobre si la pantalla se entiende.

| Id | Que se revisa | Criterio |
| --- | --- | --- |
| CP-M01 | Mensajes de error del formulario de solicitud | Una persona que no conoce el sistema entiende que dato falta y como corregirlo, sin terminologia tecnica |
| CP-M02 | Orden y agrupacion de los campos | El recorrido con la tecla de tabulacion sigue el orden en que una persona llenaria el formulario |
| CP-M03 | Lectura en telefono | Con la pantalla a 390 pixeles de ancho, ningun texto se corta, ningun boton queda fuera de alcance y la pagina no se desplaza en horizontal |
| CP-M04 | Retroalimentacion de las operaciones lentas | Al aceptar una solicitud o cobrar una mensualidad, la persona percibe que el sistema esta trabajando y no vuelve a pulsar el boton |
| CP-M05 | Terminologia | Los terminos de la pantalla coinciden con los que usa la academia: aspirante, encargado, disciplina, nivel, clase, mensualidad |
| CP-M06 | Contraste y tamanio de letra | El texto se lee con comodidad en una pantalla de portatil a la luz del dia |

Tres de estos aspectos tienen ademas una comprobacion automatica que cubre el
lado objetivo del asunto: que la pagina no se desplace en horizontal en pantalla
angosta, que cada campo tenga su etiqueta asociada y que la consola del
navegador no registre errores.

---

## 10. Metricas y criterios de aceptacion de la entrega

| Metrica | Meta | Como se mide |
| --- | --- | --- |
| Casos automatizados que pasan | 100 % | Reporte JUnit de las etapas 1 y 3 |
| Cobertura de sentencias de `src/` | no menor que la version anterior | Reporte de cobertura |
| Defectos criticos o altos abiertos | 0 | GitHub Issues con etiqueta `defecto` |
| Duracion de la bateria de Jest | menos de 10 s | Salida de `npm run test:ci` |
| Duracion de la canalizacion completa | menos de 25 min | Historial de ejecuciones |
| Tiempo de respuesta del catalogo, percentil 95 | menos de 800 ms desde cache | CP-REN01 |
| Despliegues a staging que requirieron reversion | 0 | Historial de despliegues |

La construccion se considera aprobada cuando la totalidad de los casos
automatizados pasa, las cinco imagenes se construyen sin error y el entorno
completo levanta con las sondas de salud en verde. Cualquier caso fallido
detiene la canalizacion, bloquea la publicacion de imagenes e impide el
despliegue a staging.

---

## 11. Responsables

| Rol | Responsabilidad |
| --- | --- |
| Desarrollador que propone el cambio | Escribir las pruebas del comportamiento nuevo y dejar la bateria en verde antes de solicitar la incorporacion |
| Revisor de la solicitud de cambio | Verificar que las pruebas cubren el comportamiento nuevo y que las reglas de negocio quedaron donde corresponde |
| Responsable de calidad de la entrega | Ejecutar las verificaciones manuales, completar la columna de resultados y reunir la evidencia |
| Responsable de la canalizacion | Mantener el flujo de trabajo, los entornos y el acceso de la cuenta de AWS |

---

## 12. Historial del documento

| Version | Fecha | Cambio |
| --- | --- | --- |
| 1.0 | 19 de septiembre de 2026 | Plan inicial, unicamente bateria de Jest |
| 2.0 | 26 de septiembre de 2026 | Plan completo: seis tipos de prueba, veinticuatro casos detallados, parametros del sistema, estrategia, ejecucion y reportes |
