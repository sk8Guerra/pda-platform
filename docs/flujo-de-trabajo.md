# Flujo de trabajo con Git

Este documento fija la convencion de ramas, mensajes y revision que el equipo
sigue durante los sprints (RNF-022).

## Ramas permanentes

`main` contiene lo que esta desplegado o listo para desplegarse. Nadie escribe
directamente en ella: todo cambio entra por una solicitud de incorporacion
revisada. Cada fusion hacia `main` dispara la canalizacion completa.

`develop` integra el trabajo del sprint en curso. Es el punto de partida y de
llegada de las ramas de trabajo.

## Ramas de trabajo

Se crean siempre desde `develop` y se nombran con un prefijo que indica el tipo
de cambio, seguido del identificador de la historia y una descripcion corta:

```
feature/HU-014-reserva-de-cupo
fix/HU-021-validacion-de-edad
docs/entrega-8-devops
chore/actualizar-dependencias
```

Una rama de trabajo vive lo que dura la tarea que la origino. Si una tarea supera
las dieciseis horas estimadas, se divide en dos antes de empezar, no despues.

## Mensajes de confirmacion

El formato es un verbo en infinitivo, el ambito entre parentesis y el
identificador de la historia cuando aplique:

```
agregar(inscripcion): validar rango de edad contra la disciplina (HU-014)
corregir(pagos): no emitir comprobante si la pasarela rechaza (HU-021)
documentar(devops): guia de configuracion de la canalizacion en AWS
```

El cuerpo del mensaje explica el porque del cambio, no el que: el que ya se lee
en el diff.

## Revision de cambios

Toda solicitud de incorporacion requiere que la verificacion automatica pase en
verde y la aprobacion de al menos un companero distinto del autor. La revision se
enfoca en tres cosas: que las pruebas cubran el comportamiento nuevo, que las
reglas de negocio queden donde corresponde y que no se hayan introducido
credenciales ni datos reales en el codigo.

## Lo que nunca se versiona

El archivo `.env`, cualquier llave, certificado o credencial, los volumenes de
datos de los contenedores y los reportes generados por el pipeline. La plantilla
`.env.example` documenta que variables existen sin revelar ningun valor.

## Etiquetas de version

Cada entrega academica se marca con una etiqueta anotada:

```bash
git tag -a v0.8.0 -m "Entrega 8: implementacion DevOps 1"
git push origin v0.8.0
```
