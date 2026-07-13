# Cierre final - Administrador

## Estado general

La carpeta `administrador` queda como módulo independiente dentro del repositorio.

Entrada principal:

```txt
/administrador/ad-index.html
```

Entrada auxiliar de navegación:

```txt
/administrador/ad-index-final.html
```

## Módulos funcionales

```txt
1. Diagnóstico Firebase y Google Sheets
2. Períodos
3. Coordinadores
4. Carreras detectadas desde titulos + Estudiantes
5. Búsqueda de títulos enviados
6. Devolver título
7. Reparar documentos Firebase con ID incorrecto
8. Logs administrativos
```

## Archivos principales

```txt
administrador/ad-index.html
administrador/ad-css/ad-admin.css
administrador/ad-js/ad-config.js
administrador/ad-js/ad-firebase.service.js
administrador/ad-js/ad-diagnostico.service.js
administrador/ad-js/ad-periodos.service.js
administrador/ad-js/ad-titulos.service.js
administrador/ad-js/ad-coordinadores.service.js
administrador/ad-js/ad-app.js
administrador/ad-js/ad-coordinadores.app.js
administrador/ad-js/ad-titulos.app.js
administrador/ad-js/ad-devolver.app.js
administrador/ad-js/ad-reparar.app.js
```

## Páginas auxiliares conservadas

Se conservan como herramientas de emergencia y prueba aislada:

```txt
administrador/ad-index-b6.html   - prueba de títulos enviados
administrador/ad-index-b7.html   - prueba de devolución de título
administrador/ad-index-b8.html   - prueba de reparación Firebase
administrador/ad-index-final.html - entrada de navegación final
```

No se eliminan porque permiten probar acciones delicadas de forma aislada si el panel principal presenta un error visual.

## Colecciones Firestore usadas

```txt
Estudiantes
titulos_config
titulos_coordinadores
titulos
titulos_historial
titulos_logs
```

## Reglas finales respetadas

```txt
- No se modificó estudiantes-mvp.
- No se modificó coordinadores-mvp.
- La carpeta administrador funciona de manera independiente.
- Todos los archivos internos usan prefijo ad o están dentro de carpetas ad-*.
- El ID correcto de titulos es la cédula.
- Las acciones directas respaldan antes de eliminar.
- Devolver título copia a titulos_historial, registra log y elimina de titulos.
- Reparar Firebase crea titulos / cedula, respalda el viejo, registra log y elimina el ID incorrecto.
- Los períodos se mantienen activos; solo se define período principal.
```

## Orden de prueba final

```txt
1. Abrir /administrador/ad-index.html
2. Probar Firebase.
3. Revisar período principal.
4. Crear o actualizar coordinador.
5. Cargar carreras.
6. Asignar carrera a coordinador.
7. Buscar título por cédula.
8. Devolver título solo con un caso de prueba.
9. Reparar Firebase solo con un documento incorrecto confirmado.
10. Revisar titulos_historial y titulos_logs.
```

## Estado de cierre

El desarrollo por bloques queda cerrado.

Pendiente operativo: probar con datos reales y reportar cualquier error de consola o campo faltante para corrección puntual.
