# Configuración de Firebase para las tres aplicaciones

La arquitectura usa dos proyectos:

- **Firebase Títulos:** `titulos-ec2fa`
- **Firebase UTET:** `utet-4387a`

Las aplicaciones web no se conectan directamente a Firestore. Las lecturas y escrituras pasan por Cloudflare Pages Functions, que se autentican ante Google mediante cuentas de servicio.

## 1. Cuentas de servicio

Crea dos cuentas de servicio separadas:

1. **Títulos:** permiso mínimo para leer y escribir Firestore en `titulos-ec2fa`.
2. **UTET:** permiso mínimo de solo lectura para Firestore en `utet-4387a`.

Descarga cada archivo JSON y consérvalo fuera del repositorio. No lo envíes por correo, chat ni lo guardes dentro de las carpetas publicadas.

## 2. Secretos en Cloudflare Pages

Los dos secretos deben existir en cada uno de estos proyectos de Pages:

- `titulos`
- `titulos-coordinadores`
- `titulos-administrador`

Los nombres exactos son:

```text
TITULOS_FIREBASE_SERVICE_ACCOUNT
UTET_FIREBASE_SERVICE_ACCOUNT
```

Ejemplo para Estudiantes:

```powershell
npx wrangler pages secret put TITULOS_FIREBASE_SERVICE_ACCOUNT --project-name titulos
npx wrangler pages secret put UTET_FIREBASE_SERVICE_ACCOUNT --project-name titulos
```

Repite los mismos dos comandos cambiando `--project-name` por `titulos-coordinadores` y `titulos-administrador`.

Cuando Wrangler solicite el valor, pega el contenido JSON completo de la cuenta de servicio correspondiente. No escribas el JSON directamente dentro del comando porque podría quedar guardado en el historial de la terminal.

## 3. Desarrollo local

Copia el archivo de ejemplo:

```powershell
Copy-Item .dev.vars.example .dev.vars
```

Reemplaza los valores de ejemplo con los JSON reales convertidos a una sola línea. `.dev.vars` está excluido por `.gitignore` y nunca debe subirse.

Después ejecuta:

```powershell
npm run check
npm run dev:cloudflare
```

Rutas locales:

- Estudiantes: `http://127.0.0.1:8788/estudiantes-mvp/estudiante.html`
- Coordinadores: `http://127.0.0.1:8788/coordinadores-mvp/coordinador.html`
- Administrador: `http://127.0.0.1:8788/administrador/ad-index.html`

## 4. Protección del administrador y coordinadores

Antes de publicar, protege estos dos proyectos con Cloudflare Access:

- `titulos-administrador.pages.dev`
- `titulos-coordinadores.pages.dev`

El dominio de Estudiantes puede permanecer público. El administrador y coordinadores no deben depender únicamente de que la URL sea difícil de adivinar.

## 5. Reglas de Firestore

Las reglas web de Firestore pueden permanecer cerradas. La aplicación usa OAuth e IAM desde el servidor, por lo que no necesita abrir Firestore al navegador.

La cuenta de servicio de Títulos debe tener permisos IAM de lectura y escritura. La cuenta de UTET debe tener únicamente permisos IAM de lectura.

## 6. Validación y despliegue

```powershell
npm run check
npm run build:estudiantes
npm run build:coordinadores
npm run build:administrador
```

Publicación:

```powershell
npm run deploy:estudiantes
npm run deploy:coordinadores
npm run deploy:administrador
```

Después de publicar, ejecuta el diagnóstico del Administrador y comprueba:

- PING Títulos: OK
- PING UTET: OK
- Consulta de un estudiante real: nombre, carrera y período
- Celular visible únicamente en Administrador
- Envío de prueba almacenado en `envios` y `versiones_envio`
- Aprobación o devolución almacenada en `resoluciones` y reflejada en `envios`
- Proveedor de IA listado y probado desde Administrador
