# GitHub Pages + Firebase + Neon

La aplicación web se publica únicamente desde `main` en GitHub Pages:

- App: `https://jeffer91.github.io/estudiantestit/`
- Estudiantes: `https://jeffer91.github.io/estudiantestit/estudiantes/`
- Backend: `https://us-central1-titulos-ec2fa.cloudfunctions.net/api`

GitHub Pages contiene solo HTML/CSS/JavaScript público. Las credenciales de IA no se incluyen en el sitio.

## Firebase

`firebase-backend/functions` es el backend oficial. Firestore conserva la configuración de proveedores y Google Secret Manager conserva el material secreto de sus API keys. El navegador solo ve identificadores anónimos como `motor_1`.

El workflow `.github/workflows/publicar-firebase-github-pages.yml` despliega Firebase Functions desde `main` usando Workload Identity Federation. Configura en GitHub → Settings → Secrets and variables → Actions → Variables:

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

No guardes JSON de cuentas de servicio, API keys ni tokens en el repositorio.

## Neon: aprendizaje de IA

Neon se usa solamente como memoria de aprendizaje. El navegador nunca se conecta directamente a Neon. La migración `firebase-backend/migrations/001_ia_learning.sql` crea las tablas `ia_generation_events` e `ia_learning_feedback`.

La URL pooled de producción se guarda en Google Secret Manager del proyecto `titulos-ec2fa` con el nombre `titulos-neon-database-url`.

## Validación

```bash
npm run check
npm run build:github-pages
```

El motor interno produce títulos incluso si las IA externas o la memoria de aprendizaje no están disponibles.
