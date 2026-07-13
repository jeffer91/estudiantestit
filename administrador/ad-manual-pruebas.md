# Manual de pruebas - Administrador

## Entrada recomendada

Abrir primero:

```txt
/administrador/ad-index-final.html
```

Desde esa pantalla se accede a los módulos creados por bloques.

## Orden de prueba

### 1. Panel principal

Archivo:

```txt
/administrador/ad-index.html
```

Validar:

- Firebase conectado.
- Período principal visible.
- Diagnóstico de colecciones principales.
- Tabla de períodos.
- Tabla de logs.

### 2. Períodos

Probar en el panel principal:

- Agregar período.
- Definir período principal.
- Confirmar que todos los períodos sigan activos.
- Revisar log en `titulos_logs`.

### 3. Títulos enviados

Archivo:

```txt
/administrador/ad-index-b6.html
```

Validar:

- Buscar por cédula.
- Leer documento desde `titulos / cedula`.
- Si no existe por ID, buscar por campo `cedula`.
- Cruzar con `Estudiantes`.
- Mostrar título 1, título 2 y título 3.

### 4. Devolver título

Archivo:

```txt
/administrador/ad-index-b7.html
```

Validar solo con un caso de prueba:

- Copia en `titulos_historial`.
- Registro en `titulos_logs`.
- Eliminación del documento original en `titulos`.
- El estudiante puede volver a enviar.

### 5. Reparar Firebase

Archivo:

```txt
/administrador/ad-index-b8.html
```

Validar solo con un documento incorrecto real:

- Detectar cédula desde campo `cedula`, `numeroIdentificacion` o desde el ID.
- Crear documento correcto en `titulos / cedula`.
- Conservar campos originales.
- Normalizar carrera y período desde `Estudiantes`.
- Copiar documento viejo a `titulos_historial`.
- Registrar log en `titulos_logs`.
- Eliminar documento viejo.

## Colecciones usadas

```txt
Estudiantes
titulos_config
titulos_coordinadores
titulos
titulos_historial
titulos_logs
```

## Reglas respetadas

- La carpeta `administrador` es independiente.
- No se modifica `estudiantes-mvp`.
- No se modifica `coordinadores-mvp`.
- Todas las acciones directas guardan respaldo antes de borrar.
- Los períodos se manejan como activos.
- El ID correcto en `titulos` es la cédula.
