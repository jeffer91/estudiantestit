import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const output = path.join(root, '.pages-github');
const builders = [
  'dev/preparar-pages-estudiantes.mjs',
  'dev/preparar-pages-coordinadores.mjs',
  'dev/preparar-pages-investigadores.mjs',
  'dev/preparar-pages-administrador.mjs'
];

for (const script of builders) {
  execFileSync(process.execPath, [path.join(root, script)], { cwd: root, stdio: 'inherit' });
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

function copyDir(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
}
function read(relativePath) {
  return fs.readFileSync(path.join(output, relativePath), 'utf8');
}
function write(relativePath, content) {
  const target = path.join(output, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}
function injectApiBase(relativePath, apiBase) {
  let html = read(relativePath);
  const marker = 'window.TITULOS_API_BASE=' + JSON.stringify(apiBase);
  if (!html.includes(marker)) {
    if (!html.includes('</head>')) throw new Error('No se encontró </head> en ' + relativePath);
    html = html.replace('</head>', '  <script>' + marker + ';</script>\n</head>');
    write(relativePath, html);
  }
}
function removeIfExists(relativePath) {
  fs.rmSync(path.join(output, relativePath), { recursive: true, force: true });
}

copyDir(path.join(root, '.pages-estudiantes', 'estudiantes'), path.join(output, 'estudiantes'));
copyDir(path.join(root, '.pages-estudiantes', 'trabajo-titulacion'), path.join(output, 'trabajo-titulacion'));
copyDir(path.join(root, '.pages-coordinadores'), path.join(output, 'coordinadores'));
copyDir(path.join(root, '.pages-investigadores'), path.join(output, 'investigadores'));
copyDir(path.join(root, '.pages-administrador'), path.join(output, 'administrador'));

// Estudiantes: conservar la pantalla original y agregar una entrada limpia /estudiantes/.
injectApiBase('estudiantes/estudiante.html', 'https://titulos.pages.dev');
fs.copyFileSync(path.join(output, 'estudiantes', 'estudiante.html'), path.join(output, 'estudiantes', 'index.html'));
let studentRoute = read('estudiantes/js/estudiante.trabajo-titulacion.route.js');
studentRoute = studentRoute.replace("window.location.assign('/trabajo-titulacion/?cedula='", "window.location.assign('../trabajo-titulacion/?cedula='");
write('estudiantes/js/estudiante.trabajo-titulacion.route.js', studentRoute);

// Trabajo de Titulación: API de Cloudflare + rutas relativas compatibles con project pages.
let workHtml = read('trabajo-titulacion/index.html');
workHtml = workHtml.replaceAll('\"/estudiantes/', '\"../estudiantes/').replaceAll("'/estudiantes/", "'../estudiantes/");
write('trabajo-titulacion/index.html', workHtml);
injectApiBase('trabajo-titulacion/index.html', 'https://titulos.pages.dev');
let workJs = read('trabajo-titulacion/js/trabajo-titulacion.js');
const oldApiBase = "function apiBase(){var origin=text(window.location&&window.location.origin);if(['http://localhost:5500','http://127.0.0.1:5500'].indexOf(origin)>=0)return'http://127.0.0.1:8788';return origin&&origin!=='null'?origin:'https://titulos.pages.dev';}";
const newApiBase = "function apiBase(){var forced=text(window.TITULOS_API_BASE||'');var origin=text(window.location&&window.location.origin);if(forced)return forced.replace(/\\/$/,'');if(['http://localhost:5500','http://127.0.0.1:5500'].indexOf(origin)>=0)return'http://127.0.0.1:8788';return origin&&origin!=='null'?origin:'https://titulos.pages.dev';}";
if (!workJs.includes(oldApiBase)) throw new Error('No se pudo adaptar apiBase de Trabajo de Titulación.');
workJs = workJs.replace(oldApiBase, newApiBase);
write('trabajo-titulacion/js/trabajo-titulacion.js', workJs);

// Coordinadores: usar el backend ya desplegado en Cloudflare Pages.
injectApiBase('coordinadores/index.html', 'https://titulos-coordinadores.pages.dev');
injectApiBase('coordinadores/coordinador.html', 'https://titulos-coordinadores.pages.dev');

// Investigadores: sus llamadas eran same-origin; en GitHub Pages deben ir al backend oficial.
let investigatorJs = read('investigadores/js/investigadores.app.js');
investigatorJs = investigatorJs.replaceAll("'/api/investigadores'", "'https://titulos-investigadores.pages.dev/api/investigadores'");
write('investigadores/js/investigadores.app.js', investigatorJs);

// Administrador: mantener la UI en GitHub Pages y la API administrativa en Cloudflare.
injectApiBase('administrador/index.html', 'https://titulos-administrador.pages.dev');
injectApiBase('administrador/ad-index.html', 'https://titulos-administrador.pages.dev');

// Metadatos exclusivos de Cloudflare no tienen efecto en GitHub Pages.
[
  'estudiantes/_redirects', 'estudiantes/_headers', 'estudiantes/.wrangler',
  'trabajo-titulacion/_redirects', 'trabajo-titulacion/_headers',
  'coordinadores/_redirects', 'coordinadores/_headers',
  'investigadores/_redirects', 'investigadores/_headers',
  'administrador/_redirects', 'administrador/_headers'
].forEach(removeIfExists);


function redirectPage(relativePath, target, title) {
  const safeTarget = JSON.stringify(target);
  const safeTitle = String(title || 'Sistema de Titulación')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = [
    '<!doctype html>',
    '<html lang="es"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="robots" content="noindex">',
    '<title>' + safeTitle + '</title>',
    '<style>html,body{height:100%;margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#f5f7fb;color:#172033}.wrap{height:100%;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{max-width:560px;background:white;border:1px solid #dfe5ef;border-radius:18px;padding:28px;text-align:center;box-shadow:0 12px 40px rgba(20,30,55,.08)}a{color:#0b57d0;font-weight:700}</style>',
    '</head><body><main class="wrap"><div class="card">',
    '<h1>' + safeTitle + '</h1>',
    '<p>Conectando con el sistema y verificando la información en Firebase…</p>',
    '<p><a id="continuar" href="' + target + '">Continuar</a></p>',
    '</div></main>',
    '<script>(function(){var base=' + safeTarget + ';var suffix=(window.location.search||"")+(window.location.hash||"");var url=base+suffix;document.getElementById("continuar").href=url;window.location.replace(url);})();</script>',
    '</body></html>'
  ].join('\n');
  write(relativePath, html);
}

// Los frontends Cloudflare ya hablan con Firebase mediante Pages Functions en el
// mismo origen. Desde GitHub Pages se usa una entrada estable y se evita que CORS
// bloquee la consulta académica.
redirectPage('estudiantes/index.html', 'https://titulos.pages.dev/estudiantes/estudiante', 'Estudiantes');
redirectPage('estudiantes/estudiante.html', 'https://titulos.pages.dev/estudiantes/estudiante', 'Estudiantes');
redirectPage('trabajo-titulacion/index.html', 'https://titulos.pages.dev/trabajo-titulacion/', 'Trabajo de Titulación');
redirectPage('coordinadores/index.html', 'https://titulos-coordinadores.pages.dev/', 'Coordinadores');
redirectPage('coordinadores/coordinador.html', 'https://titulos-coordinadores.pages.dev/', 'Coordinadores');
redirectPage('investigadores/index.html', 'https://titulos-investigadores.pages.dev/', 'Investigadores');
redirectPage('administrador/index.html', 'https://titulos-administrador.pages.dev/', 'Administrador');
redirectPage('administrador/ad-index.html', 'https://titulos-administrador.pages.dev/', 'Administrador');

const home = [
  '<!doctype html>',
  '<html lang="es"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Sistema de Titulación</title>',
  '<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;margin:0;background:#f5f7fb;color:#172033}.wrap{max-width:920px;margin:64px auto;padding:24px}.card{background:#fff;border:1px solid #dfe5ef;border-radius:16px;padding:22px;margin:14px 0;box-shadow:0 8px 30px rgba(20,30,55,.06)}a{color:#0b57d0;font-weight:700;text-decoration:none}h1{margin-bottom:8px}p{color:#526078}</style>',
  '</head><body><main class="wrap">',
  '<h1>Sistema de Titulación</h1><p>Accesos oficiales publicados desde este repositorio.</p>',
  '<div class="card"><a href="./estudiantes/">Estudiantes</a></div>',
  '<div class="card"><a href="./trabajo-titulacion/">Trabajo de Titulación</a></div>',
  '<div class="card"><a href="./coordinadores/">Coordinadores</a></div>',
  '<div class="card"><a href="./investigadores/">Investigadores</a></div>',
  '<div class="card"><a href="./administrador/">Administrador</a></div>',
  '</main></body></html>'
].join('\n');
write('index.html', home);

const notFound = [
  '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
  '<title>Página no encontrada</title></head><body>',
  '<h1>Página no encontrada</h1><p><a href="/estudiantestit/">Volver al sistema de titulación</a></p>',
  '</body></html>'
].join('\n');
write('404.html', notFound);

for (const required of [
  'index.html', 'estudiantes/index.html', 'trabajo-titulacion/index.html',
  'coordinadores/index.html', 'investigadores/index.html', 'administrador/index.html'
]) {
  if (!fs.existsSync(path.join(output, required))) throw new Error('Falta archivo GitHub Pages: ' + required);
}

console.log('[GitHub Pages] Sitio preparado en .pages-github.');
console.log('[GitHub Pages] Rutas: /estudiantes/, /trabajo-titulacion/, /coordinadores/, /investigadores/, /administrador/.');