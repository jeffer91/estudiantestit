# RESPALDO TITULOS APP — consultas separadas

El archivo `consulta-estudiantes.gs` no declara `doGet` ni `doPost`. Se añade al mismo proyecto de Google Apps Script donde ya existe `Código.gs`.

## Integración en el enrutador

Dentro de `procesarLecturaGet(payload)`, inmediatamente después de obtener `accion`, agrega:

```javascript
var consultaSeparada = procesarConsultaSeparadaPorAccion(payload, accion);
if (consultaSeparada !== null) return consultaSeparada;
```

Haz lo mismo dentro de `procesarPayloadPost(payload)` para mantener compatibilidad con llamadas que lleguen mediante POST.

Las acciones nuevas son:

- `CONSULTAR_ENVIO_BASE_CEDULA`: consulta exclusivamente la hoja `Envios`.
- `CONSULTAR_RESOLUCION_CEDULA`: consulta exclusivamente la hoja `Resoluciones`.

La acción histórica `CONSULTAR_ENVIO_CEDULA` se conserva para Coordinadores, Administrador y compatibilidad.

## Después de actualizar

1. Guarda el proyecto.
2. Ejecuta una vez `reconstruirIndiceEnviosSeguro()` desde el editor.
3. Actualiza la implementación existente de la aplicación web. No crees otra implementación ni cambies la URL `/exec` configurada en Claves.
4. Prueba la cédula `1313244988` y el período `Noviembre 2025 a Mayo 2026`.

El resultado esperado es `DEVUELTO`, con la observación del coordinador y permiso de reenvío.
