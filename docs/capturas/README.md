# Capturas de pantalla de la entrega

Las imagenes de esta carpeta las inserta
`docs/entrega-ci-cd-y-plan-de-pruebas.md` en su seccion 24. Cada recuadro de esa
seccion indica que debe mostrarse y donde obtenerla.

Los nombres son fijos: si el archivo se guarda con el nombre de la tabla, la
imagen aparece sola en el documento sin tocar nada mas.

| Archivo | Contenido |
| --- | --- |
| `01-ejecucion-exitosa.png` | Ejecucion de la canalizacion con las cuatro etapas en verde |
| `02-resumen-ejecucion.png` | Seccion Summary con las tablas que genera cada etapa |
| `03-etapa-verificacion.png` | Registro del paso de pruebas con el conteo final de Jest |
| `04-artefactos.png` | Lista de artefactos producidos por la ejecucion |
| `05-ejecucion-fallida.png` | Ejecucion detenida por un defecto inyectado |
| `06-caso-fallido.png` | Detalle del caso que detecto el defecto |
| `07-reporte-playwright.png` | Reporte HTML de Playwright, vista general |
| `08-detalle-caso.png` | Detalle de un caso con sus pasos y mediciones |
| `09-cobertura.png` | Resumen de cobertura de codigo |
| `10-terminal.png` | Salida de la bateria en la terminal |
| `11-consola.png` | Consola operativa en el navegador |
| `12-staging.png` | Entorno de staging respondiendo desde AWS |
| `13-ecs.png` | Servicio de Amazon ECS con su tarea en ejecucion |
| `14-cloudwatch.png` | Panel de CloudWatch del entorno |
| `15-despliegue.png` | Etapa de despliegue completada tras una fusion a main |

Formato sugerido: PNG, ancho de 1400 a 1800 pixeles. Conviene recortar la
ventana del navegador para que se lea el contenido y no el escritorio.

Estas imagenes son las unicas de la carpeta que se versionan; `.gitignore` no
las excluye.
