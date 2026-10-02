# Administrador de Titulación

## Estructura actual

La aplicación del administrador se mantiene en una sola carpeta independiente:

```text
administrador/
├── index.html
├── ad-index.html
├── ad-css/
└── ad-js/
```

- `index.html`: entrada pública del Administrador en GitHub Pages.
- `ad-index.html`: panel completo del administrador.
- `ad-css/`: estilos del administrador.
- `ad-js/`: servicios y controladores del administrador.

Las páginas antiguas `ad-index-b6.html`, `ad-index-b7.html`, `ad-index-b8.html` y `ad-index-final.html` fueron eliminadas porque sus funciones ya están integradas en el panel principal.

## Publicación

El proyecto se publica en:

```text
https://jeffer91.github.io/estudiantestit/administrador/
```

Desde la raíz del repositorio:

```powershell
npm run build:github-pages
```

El script construye y valida la salida completa antes de que el workflow publique GitHub Pages desde `main`.
