# Migración v4 — GitHub Pages + Firebase

## Arquitectura final

Las cinco interfaces se mantienen separadas:

1. `/estudiantes/`
2. `/trabajo-titulacion/`
3. `/coordinadores/`
4. `/investigadores/`
5. `/administrador/`

Base prevista:

```text
https://jeffer91.github.io/estudiantestit/
```

La API se ejecuta en Firebase Functions:

```text
https://us-central1-titulos-ec2fa.cloudfunctions.net/api/
```

Los datos continúan en Firestore Títulos y Firestore UTET.

## Seguridad aplicada

- Firebase Functions usa ADC/IAM: no existen secretos JSON de cuentas de servicio en la nueva arquitectura.
- UTET se consulta con permiso IAM de solo lectura.
- Claves IA en Google Secret Manager.
- Firestore bloqueado para acceso directo del navegador.
- Administrador y Coordinadores con Firebase Authentication.
- Roles y carreras comprobados en backend.
- Trabajo de Titulación y Artículo Académico restringidos a las carreras asignadas.
- Sesiones privilegiadas solo en memoria del navegador.
- Pantallas privilegiadas rechazan ejecución embebida.
- Uso público de IA limitado por origen e IP.
- Investigación conserva temporalmente PIN + sesión para evitar romper el flujo actual.
- Reportes administrativos sanitizan tokens, PIN hashes y secretos.

## Secretos IA

El Administrador contiene **Migrar secretos**.

La primera ejecución:

- crea los contenedores de secretos para los proveedores existentes;
- mueve las credenciales antiguas de Firestore a Secret Manager;
- limpia los campos sensibles de Firestore.

Después de la migración, retirar el permiso de creación de secretos de la identidad de ejecución y conservar únicamente los permisos mínimos necesarios para leer secretos y agregar nuevas versiones.

## Firebase Authentication

Habilitar Email/Password y crear `usuarios/{uid}` en Firestore.

Ejemplo Administrador:

```json
{"role":"ADMIN","nombre":"Administrador"}
```

Ejemplo Coordinador:

```json
{
  "role":"COORDINADOR",
  "nombre":"Nombre",
  "coordinadorId":"id",
  "carreras":["Carrera autorizada"]
}
```

El navegador no puede editar esta colección porque `firestore.rules` niega todo acceso directo.

## GitHub Pages

El build `npm run build:github-pages`:

- genera los cinco accesos;
- adapta rutas al prefijo `/estudiantestit/`;
- elimina `_headers`, `_redirects`, `_routes.json` y residuos `.wrangler`;
- inyecta la URL de Firebase Functions;
- versiona JS/CSS con el SHA del commit para evitar caché obsoleta;
- inyecta Firebase Authentication solo en Administrador y Coordinadores.

## Orden de activación

1. Mantener Cloudflare activo.
2. Configurar IAM de la identidad de ejecución.
3. Habilitar Firebase Authentication y crear usuarios/roles.
4. Desplegar Firebase Functions y reglas Firestore.
5. Ejecutar **Migrar secretos** desde Administrador.
6. Probar los cinco accesos.
7. Validar un caso real de punta a punta.
8. Activar GitHub Pages como entrada oficial.
9. Retirar Cloudflare y sus secretos únicamente al final.

## Pruebas obligatorias

- Consulta UTET.
- Envío y reenvío de Artículo Académico.
- Envío y reenvío de Trabajo de Titulación.
- Coordinador sin carrera: acceso rechazado a expedientes.
- Coordinador con carrera: solo ve y modifica sus expedientes.
- Investigación: login, bloqueo, heartbeat, liberar revisión y resolución.
- Administrador: devolver a Coordinación/Investigación, aprobar y eliminar.
- Historial `workflow_eventos`.
- Estadísticas.
- Exportaciones PDF/Excel.
- WhatsApp/Outlook.
- Proveedores IA y fallback.
- Límite de uso IA.
- Usuario sin rol administrativo intentando acceder al Administrador.
- Firestore directo desde navegador: acceso denegado.

No se elimina información de Firebase durante la migración.
