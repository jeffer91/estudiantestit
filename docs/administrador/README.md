# Administrador de Titulación

## Estructura actual

La aplicación del administrador se mantiene en una sola carpeta independiente:

```text
administrador/
├── index.html
├── ad-index.html
├── _redirects
├── ad-css/
└── ad-js/
```

- `index.html`: entrada pública del proyecto Cloudflare Pages.
- `ad-index.html`: panel completo del administrador.
- `_redirects`: redirige las antiguas páginas de prueba al panel principal.
- `ad-css/`: estilos del administrador.
- `ad-js/`: servicios y controladores del administrador.

Las páginas antiguas `ad-index-b6.html`, `ad-index-b7.html`, `ad-index-b8.html` y `ad-index-final.html` fueron eliminadas porque sus funciones ya están integradas en el panel principal.

## Publicación

El proyecto se publica en:

```text
https://titulos-administrador.pages.dev/
```

Desde la raíz del repositorio:

```powershell
.\publicar-cloudflare.ps1 -Aplicacion administrador
```

El script valida `administrador/index.html`, `administrador/ad-index.html` y el CSS principal antes de desplegar.
