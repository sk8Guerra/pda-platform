# Plan de pruebas inicial

## Alcance

El plan cubre los cuatro modulos contenerizados en esta entrega: identidad,
catalogo, inscripcion y pagos. Queda fuera por ahora el modulo de eventos, el de
tienda y el de difusion, que no forman parte del alcance del Sprint 1.

## Niveles de prueba

Las pruebas unitarias verifican reglas de negocio aisladas, sin dependencias
externas. El caso representativo es el calculo de edad de la aspirante y su
validacion contra el rango que define cada disciplina.

Las pruebas de integracion verifican el contrato HTTP de cada modulo. Se ejecutan
sobre la aplicacion completa levantada en memoria, con PostgreSQL y Redis
sustituidos por dobles, de modo que corren en cualquier maquina y en el servidor
de construccion sin infraestructura previa.

Las pruebas manuales exploratorias se ejecutan sobre el entorno de contenedores
levantado con Docker Compose, contra la base de datos real y sus disparadores.
Sirven para confirmar que las reglas impuestas en el motor se comportan como se
espera.

## Casos cubiertos por la automatizacion

| Identificador | Modulo | Caso | Resultado esperado |
| --- | --- | --- | --- |
| CP-01 | auth | Inicio de sesion con credenciales correctas | Token emitido y registro en la bitacora |
| CP-02 | auth | Contrasena incorrecta o correo inexistente | Codigo 401 con el mismo mensaje en ambos casos |
| CP-03 | auth | Cuenta suspendida | Codigo 401 indicando cuenta inactiva |
| CP-04 | auth | Acceso al listado de usuarios con rol Docente | Codigo 403 |
| CP-05 | catalogo | Primera consulta de disciplinas | Lectura de la base de datos y escritura en cache |
| CP-06 | catalogo | Consulta siguiente dentro del tiempo de vida | Respuesta desde cache sin consultar PostgreSQL |
| CP-07 | catalogo | Niveles de una disciplina inexistente | Codigo 404 |
| CP-08 | inscripcion | Solicitud con datos completos y edad valida | Codigo 201 con la solicitud en estado Recibida |
| CP-09 | inscripcion | Solicitud con campos faltantes | Codigo 400 enumerando los campos que faltan |
| CP-10 | inscripcion | Aspirante fuera del rango de edad | Codigo 422 sin crear la solicitud |
| CP-11 | inscripcion | Aceptacion con clase y nivel | Alumna creada, disciplina asignada y cupo confirmado |
| CP-12 | inscripcion | Aceptacion sobre una clase sin cupo | Codigo 409 y ningun registro parcial |
| CP-13 | inscripcion | Clase de una disciplina distinta a la solicitada | Codigo 422 |
| CP-14 | inscripcion | Segunda aceptacion de la misma solicitud | Codigo 409 |
| CP-15 | inscripcion | Aceptacion con rol distinto de Administrador | Codigo 403 |
| CP-16 | pagos | Pago aprobado de una mensualidad | Pago registrado, comprobante emitido, mensualidad saldada |
| CP-17 | pagos | Pago rechazado por la pasarela | Codigo 402, mensualidad sin saldar y sin comprobante |
| CP-18 | pagos | Mensualidad ya saldada | Codigo 409 |
| CP-19 | pagos | Medio de pago no contemplado | Codigo 422 |
| CP-20 | pagos | Pago en efectivo | No se consulta la pasarela |
| CP-21 | plataforma | Sonda de salud en ambas topologias | Codigo 200 con los modulos montados |
| CP-22 | plataforma | Sonda de salud con PostgreSQL caido | Codigo 503 con estado degradado |

## Casos de verificacion manual

La restriccion de cupo se comprueba insertando reservas hasta superar el maximo
de una clase: el disparador del motor debe rechazar la insercion aunque la
aplicacion lo permitiera. La generacion automatica de la mensualidad se comprueba
aceptando una solicitud y consultando la tabla de mensualidades, donde debe
aparecer el cargo del periodo en curso con el monto de la disciplina. El apagado
ordenado se comprueba deteniendo un contenedor y confirmando que cierra sus
conexiones antes de terminar.

## Criterio de aceptacion del sprint

La construccion se considera aprobada cuando la totalidad de los casos
automatizados pasa, las cinco imagenes se construyen sin error y el entorno
completo levanta con las sondas de salud en verde. Cualquier caso fallido detiene
la canalizacion y bloquea la publicacion de imagenes.

## Ejecucion

```bash
npm test                 # bateria completa
npm run test:ci          # con reporte JUnit y cobertura, como en el servidor
npx jest tests/unitarias # solo pruebas unitarias
```
