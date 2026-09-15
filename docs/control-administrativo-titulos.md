# Control administrativo del flujo de títulos

El módulo Administrador incorpora tres acciones de intervención sobre un envío de títulos:

- **Devolver a Coordinador:** reabre el caso en Coordinación sin borrar las revisiones anteriores.
- **Devolver a Investigador:** devuelve a Investigación un caso que ya cuenta con un título validado por Coordinación y libera cualquier bloqueo de revisión anterior.
- **Aprobar título directamente:** permite seleccionar una de las tres propuestas y registrarla como aprobación final realizada por Administración.

Todas las acciones requieren una justificación, conservan la trazabilidad en `workflow_eventos` y no atribuyen una aprobación administrativa al Coordinador ni al Investigador.
