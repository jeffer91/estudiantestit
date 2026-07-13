# Bloque 11 - Pruebas con datos reales

## Objetivo

Validar el panel principal:

```txt
/administrador/ad-index.html
```

Este bloque se concentra en probar y corregir errores de integración.

## Corrección aplicada

Los módulos visuales cargados al final del panel principal ahora bloquean el evento antes de que el controlador base muestre mensajes de bloque pendiente.

Archivos corregidos:

```txt
administrador/ad-js/ad-titulos.app.js
administrador/ad-js/ad-devolver.app.js
administrador/ad-js/ad-reparar.app.js
```

## Prueba 1 - Carga inicial

Abrir:

```txt
/administrador/ad-index.html
```

Validar:

- Firebase: conectado.
- Sheets: activo, inactivo o revisar, pero sin romper pantalla.
- Período principal visible.
- KPI de títulos cargado.
- KPI de coordinadores cargado.
- Tabla de logs visible.

## Prueba 2 - Períodos

Acciones:

- Escribir ID de período.
- Escribir label de período.
- Presionar `Agregar período`.
- Presionar `Definir principal`.

Validar en Firebase:

```txt
titulos_config / app
```

Campos esperados:

```txt
periodoActivo
periodoActivoId
periodoActivoLabel
periodosActivos
periodosActivosLabels
```

## Prueba 3 - Coordinadores

Acciones:

- Ingresar nombre.
- Ingresar Telegram.
- Guardar coordinador.

Validar en Firebase:

```txt
titulos_coordinadores
```

Campos esperados:

```txt
id
nombre
telegram
Telegram
activo
carreras
carrerasAsignadas
```

## Prueba 4 - Carreras

Acciones:

- Presionar `Cargar carreras`.
- Revisar selector de carreras.
- Seleccionar coordinador.
- Seleccionar carrera.
- Presionar `Asignar carrera`.

Validar:

- La carrera se agrega al coordinador.
- El log se registra en `titulos_logs`.

## Prueba 5 - Buscar título

Acciones:

- Escribir cédula real.
- Presionar `Buscar título`.

Validar:

- Lee `titulos / cedula`.
- Si no existe por ID, busca por campo `cedula`.
- Cruza con `Estudiantes`.
- Muestra título 1, título 2 y título 3.

## Prueba 6 - Devolver título

Usar solo con un registro de prueba.

Validar:

- Copia en `titulos_historial`.
- Log en `titulos_logs`.
- Eliminación del documento original en `titulos`.

## Prueba 7 - Reparar Firebase

Usar solo con un documento incorrecto real.

Validar:

- Detecta cédula.
- Crea `titulos / cedula`.
- Copia viejo a `titulos_historial`.
- Registra log.
- Elimina ID incorrecto.

## Pendientes después de pruebas

- Registrar errores de consola si aparecen.
- Corregir campos que no coincidan con Firestore real.
- Confirmar si se dejan o eliminan páginas de prueba.
