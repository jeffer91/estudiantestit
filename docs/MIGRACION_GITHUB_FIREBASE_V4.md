# Migración v4: GitHub Pages + Firebase

## Objetivo

Mover las cinco interfaces a GitHub Pages y mover el backend de Cloudflare Pages Functions a Firebase Functions, manteniendo Firestore y el flujo actual.

Sitio previsto:

- https://jeffer91.github.io/estudiantestit/
- /estudiantes/
- /trabajo-titulacion/
- /coordinadores/
- /investigadores/
- /administrador/

API prevista:

- https://us-central1-titulos-ec2fa.cloudfunctions.net/api/titulos
- https://us-central1-titulos-ec2fa.cloudfunctions.net/api/requisitos
- https://us-central1-titulos-ec2fa.cloudfunctions.net/api/investigadores
- https://us-central1-titulos-ec2fa.cloudfunctions.net/api/estadisticas
- https://us-central1-titulos-ec2fa.cloudfunctions.net/api/ia

## Secretos

Todos los secretos del servidor quedan en Google Secret Manager/Firebase Functions.

### Cuentas de servicio existentes

Copiar una sola vez los valores que hoy están en Cloudflare:

```bash
firebase functions:secrets:set TITULOS_FIREBASE_SERVICE_ACCOUNT --project titulos-ec2fa
firebase functions:secrets:set UTET_FIREBASE_SERVICE_ACCOUNT --project titulos-ec2fa
```

Después de validar la migración, esos secretos pueden eliminarse de Cloudflare.

### Proveedores de IA

Las credenciales nuevas ya no se guardan en Firestore. Se guardan como secretos con nombres:

```text
titulos-ia-<proveedor>
```

Firestore conserva solamente nombre, modelo, endpoint, estado, prioridad y `secretId`.

El Administrador incluye **Migrar secretos**. Esa acción mueve cualquier credencial antigua que todavía esté en la colección `ia` hacia Secret Manager y deja los campos de credenciales de Firestore en null.

La cuenta de ejecución de Firebase Functions necesita permisos para leer/crear versiones de secretos durante la migración. Para la primera migración se puede conceder temporalmente Secret Manager Admin y después reducirlo a los permisos mínimos.

## Firebase Authentication

Administrador y Coordinadores pasan a Firebase Authentication.

1. En Firebase Console > Authentication habilitar **Email/Password**.
2. Crear los usuarios.
3. En Firestore, colección `usuarios`, crear un documento cuyo ID sea el UID de Firebase Auth.

Administrador:

```json
{
  "role": "ADMIN",
  "nombre": "Administrador"
}
```

Coordinador:

```json
{
  "role": "COORDINADOR",
  "nombre": "Nombre del coordinador",
  "coordinadorId": "id-del-coordinador",
  "carreras": ["Carrera 1", "Carrera 2"]
}
```

Investigación conserva temporalmente su PIN y sesiones actuales; su API también queda en Firebase Functions.

## Despliegue de Functions sin secretos en GitHub

El workflow `.github/workflows/publicar-firebase.yml` utiliza GitHub OIDC + Google Workload Identity Federation. No guarda una llave JSON en GitHub.

Configurar como **Repository Variables**:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

La cuenta usada por GitHub debe poder desplegar Firebase Functions.

## GitHub Pages

El workflow `.github/workflows/publicar-github-pages.yml` genera un único sitio estático mediante:

```bash
npm run build:github-pages
```

El build copia las cinco aplicaciones, crea sus `index.html`, elimina archivos propios de Cloudflare e inyecta la configuración de API y Firebase Auth.

En GitHub > Settings > Pages seleccionar **GitHub Actions** como fuente.

## Orden seguro de cambio

1. Mantener los sitios Cloudflare actuales activos.
2. Desplegar Firebase Functions.
3. Configurar Authentication y usuarios.
4. Ejecutar la migración de secretos de IA.
5. Probar `/api/health`, Estudiantes, Trabajo de Titulación, Coordinadores, Investigación y Administrador.
6. Activar GitHub Pages.
7. Validar un flujo real completo.
8. Solo entonces retirar Cloudflare Pages/Functions y sus secretos.

## Pruebas obligatorias antes del corte

- Consulta de estudiante UTET.
- Envío de Artículo Académico.
- Envío de Trabajo de Titulación.
- Validación/devolución por Coordinación.
- Toma y resolución por Investigación.
- Aprobación directa y devoluciones desde Administrador.
- Historial de `workflow_eventos`.
- Estadísticas.
- Exportación PDF/Excel.
- WhatsApp/Outlook.
- Prueba de cada proveedor IA.
- Acceso denegado cuando un usuario no posee el rol correcto.
