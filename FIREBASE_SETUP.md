# Configuración Firebase — arquitectura v4

La arquitectura objetivo usa dos proyectos:

- **Firebase Títulos:** `titulos-ec2fa`
- **Firebase UTET:** `utet-4387a`

Las cinco interfaces se publican en GitHub Pages. El navegador no accede directamente a Firestore ni conoce secretos del servidor. Todas las operaciones protegidas pasan por Firebase Functions.

## 1. Identidad del servidor

Firebase Functions usa **Application Default Credentials (ADC)** de su propia identidad de ejecución. Ya no se utilizan archivos JSON de cuentas de servicio dentro de la aplicación.

La identidad de ejecución debe tener:

- lectura y escritura de Firestore en `titulos-ec2fa`;
- **solo lectura** de Firestore en `utet-4387a`;
- acceso a las versiones de los secretos de IA;
- permiso para agregar nuevas versiones de secretos de IA.

Para la migración inicial de las credenciales IA se necesita temporalmente permiso para crear los secretos. Después de aprovisionarlos, ese permiso de creación debe retirarse.

## 2. Secretos

Las claves reales de proveedores IA se almacenan en **Google Secret Manager del proyecto Firebase Títulos**.

Formato:

```text
titulos-ia-<proveedor>
```

Ejemplos:

```text
titulos-ia-groq
titulos-ia-gemini
titulos-ia-nvidia
```

Firestore conserva únicamente configuración no secreta: proveedor, modelo, endpoint, prioridad, estado y `secretId`.

El Administrador tiene la acción **Migrar secretos**, que:

1. aprovisiona los secretos de los proveedores existentes;
2. copia cualquier credencial heredada desde Firestore a Secret Manager;
3. elimina `credencial`, `apiKey` y `token` de los documentos de Firestore.

## 3. Firebase Authentication

Administrador y Coordinadores usan Firebase Authentication con Email/Password.

Los perfiles y permisos se leen desde:

```text
usuarios/{uid}
```

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

Las reglas de Firestore incluidas en el repositorio niegan toda lectura y escritura directa desde clientes. Por ello un usuario web no puede cambiar su propio rol ni sus carreras.

Las sesiones privilegiadas de GitHub Pages se mantienen solo en memoria del navegador; no se persisten en localStorage ni sessionStorage.

Investigación conserva durante la transición su acceso por cédula + PIN y sus sesiones actuales.

## 4. Permisos de carrera

El backend aplica los permisos de Coordinación. El navegador no decide qué carrera puede revisar un usuario.

El servidor:

- obtiene las carreras desde el perfil autenticado;
- filtra los listados;
- verifica el expediente antes de aprobar, corregir o devolver;
- aplica la misma restricción a Artículo Académico y Trabajo de Titulación.

## 5. Protección del uso de IA

La API pública de IA:

- acepta generación desde los orígenes web autorizados;
- aplica límites por IP en Firestore;
- limita 30 generaciones por 10 minutos y 180 por 24 horas;
- nunca devuelve la API key de un proveedor.

La colección técnica de límites usa `expiraEn`. Conviene activar una política TTL sobre ese campo para limpiar automáticamente registros antiguos.

## 6. Reglas Firestore

`firestore.rules` usa una política **deny all** para clientes web.

Firebase Functions accede mediante IAM/ADC y no depende de las reglas web.

## 7. Despliegue

GitHub Actions publica:

- las cinco interfaces en GitHub Pages;
- Firebase Functions y las reglas Firestore en `titulos-ec2fa`.

El despliegue a Google usa GitHub OIDC / Workload Identity Federation. No requiere guardar una llave JSON de Google en GitHub.

Variables del repositorio:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

## 8. Validación antes de retirar Cloudflare

No eliminar los despliegues actuales hasta verificar:

- consulta de estudiante UTET;
- Artículo Académico;
- Trabajo de Titulación;
- Coordinación por carreras;
- Investigación;
- Administrador;
- historial y auditoría;
- estadísticas;
- PDF/Excel;
- IA y sus fallbacks.

Cloudflare se retira únicamente después de completar estas pruebas en la nueva arquitectura.
