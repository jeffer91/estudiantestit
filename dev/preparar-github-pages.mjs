import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const output = path.join(root, '.pages-github');
const buildId = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
const repositoryName = String(process.env.GITHUB_REPOSITORY || 'jeffer91/estudiantestit').split('/')[1] || 'estudiantestit';
const projectBase = '/' + repositoryName;
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
// GitHub Pages carga además el enrutador que detecta Trabajo de Titulación.
injectApiBase('estudiantes/estudiante.html', 'https://titulos.pages.dev');
let studentRoute = read('estudiantes/js/estudiante.trabajo-titulacion.route.js');
studentRoute = studentRoute.replace("window.location.assign('/trabajo-titulacion/?cedula='", "window.location.assign('../trabajo-titulacion/?cedula='");
write('estudiantes/js/estudiante.trabajo-titulacion.route.js', studentRoute);

let studentHtml = read('estudiantes/estudiante.html');
if (!studentHtml.includes('estudiante.trabajo-titulacion.route.js')) {
  if (!studentHtml.includes('</body>')) throw new Error('No se encontró </body> en Estudiantes.');
  studentHtml = studentHtml.replace(
    '</body>',
    '  <script src="js/estudiante.trabajo-titulacion.route.js?v=github-' + buildId + '"></script>\n</body>'
  );
  write('estudiantes/estudiante.html', studentHtml);
}
fs.copyFileSync(path.join(output, 'estudiantes', 'estudiante.html'), path.join(output, 'estudiantes', 'index.html'));

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

// Administrador: la interfaz permanece en GitHub Pages.
// Mientras se valida la migración completa, reutiliza el backend administrativo existente
// sin modificar ni desplegar nada en Cloudflare.
let adminApi = read('administrador/ad-js/ad-api.service.js');
const githubDetector = "function esGitHubPages(){var h=texto(window.location&&window.location.hostname).toLowerCase();return h==='github.io'||/\\.github\\.io$/.test(h);}";
if (!adminApi.includes(githubDetector)) {
  throw new Error('No se encontró el detector de GitHub Pages del Administrador.');
}
adminApi = adminApi.replace(githubDetector, 'function esGitHubPages(){return false;}');
write('administrador/ad-js/ad-api.service.js', adminApi);

let adminHtml = read('administrador/ad-index.html');
adminHtml = adminHtml
  .replace(/<script>\s*window\.TITULOS_API_BASE=[\s\S]*?<\/script>\s*/gi, '')
  .replace(/([?&]r=)[^"'&\\s]+/g, '$1github-pages-' + buildId);
write('administrador/ad-index.html', adminHtml);
injectApiBase('administrador/ad-index.html', 'https://titulos-administrador.pages.dev');
fs.copyFileSync(
  path.join(output, 'administrador', 'ad-index.html'),
  path.join(output, 'administrador', 'index.html')
);

// Metadatos exclusivos de Cloudflare no tienen efecto en GitHub Pages.
[
  'estudiantes/_redirects', 'estudiantes/_headers', 'estudiantes/.wrangler',
  'trabajo-titulacion/_redirects', 'trabajo-titulacion/_headers',
  'coordinadores/_redirects', 'coordinadores/_headers',
  'investigadores/_redirects', 'investigadores/_headers',
  'administrador/_redirects', 'administrador/_headers'
].forEach(removeIfExists);


// Los 404 generados para despliegues de dominio raíz deben respetar el prefijo
// del Project Page de GitHub y nunca sacar al usuario de /estudiantestit/.
const coordinator404 = [
  '<!doctype html><html lang="es"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta http-equiv="refresh" content="0;url=' + projectBase + '/coordinadores/">',
  '<title>Coordinadores de Titulación</title></head><body>',
  '<p>Abriendo Coordinadores de Titulación…</p>',
  '<p><a href="' + projectBase + '/coordinadores/">Continuar</a></p>',
  '</body></html>'
].join('\n');
write('coordinadores/404.html', coordinator404);

const administrator404 = [
  '<!doctype html><html lang="es"><head><meta charset="utf-8">',
  '<meta name="viewport" content="width=device-width,initial-scale=1">',
  '<meta http-equiv="refresh" content="0;url=' + projectBase + '/administrador/">',
  '<title>Administrador de Titulación</title></head><body>',
  '<p>Abriendo el Administrador de Titulación…</p>',
  '<p><a href="' + projectBase + '/administrador/">Continuar</a></p>',
  '</body></html>'
].join('\n');
write('administrador/404.html', administrator404);


// GitHub Pages es la interfaz pública principal.
// Las aplicaciones se sirven directamente desde /estudiantes/, /trabajo-titulacion/,
// /coordinadores/, /investigadores/ y /administrador/ sin redirigir al usuario.
// El Administrador no debe salir de GitHub Pages.

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
  '<h1>Página no encontrada</h1><p><a href="' + projectBase + '/">Volver al sistema de titulación</a></p>',
  '</body></html>'
].join('\n');
write('404.html', notFound);

for (const required of [
  'index.html', 'estudiantes/index.html', 'trabajo-titulacion/index.html',
  'coordinadores/index.html', 'investigadores/index.html', 'administrador/index.html'
]) {
  if (!fs.existsSync(path.join(output, required))) throw new Error('Falta archivo GitHub Pages: ' + required);
}

// Smoke checks específicos del artefacto GitHub Pages.
const studentBuilt = read('estudiantes/index.html');
const workBuilt = read('trabajo-titulacion/index.html');
const coordinatorBuilt = read('coordinadores/index.html');
const investigatorBuilt = read('investigadores/js/investigadores.app.js');
const adminBuilt = read('administrador/index.html');
const adminApiBuilt = read('administrador/ad-js/ad-api.service.js');

if (!studentBuilt.includes('estudiante.trabajo-titulacion.route.js')) {
  throw new Error('GitHub Pages: Estudiantes no carga el enrutador de Trabajo de Titulación.');
}
if (read('estudiantes/js/estudiante.trabajo-titulacion.route.js').includes("window.location.assign('/trabajo-titulacion/")) {
  throw new Error('GitHub Pages: Estudiantes conserva una ruta absoluta incompatible con Project Pages.');
}
if (!studentBuilt.includes('https://titulos.pages.dev')) {
  throw new Error('GitHub Pages: falta backend configurado para Estudiantes.');
}
if (!workBuilt.includes('https://titulos.pages.dev')) {
  throw new Error('GitHub Pages: falta backend configurado para Trabajo de Titulación.');
}
if (!coordinatorBuilt.includes('https://titulos-coordinadores.pages.dev')) {
  throw new Error('GitHub Pages: falta backend configurado para Coordinadores.');
}
if (!investigatorBuilt.includes('https://titulos-investigadores.pages.dev/api/investigadores')) {
  throw new Error('GitHub Pages: falta backend configurado para Investigación.');
}
if (!adminBuilt.includes('https://titulos-administrador.pages.dev')) {
  throw new Error('GitHub Pages: falta backend configurado para Administrador.');
}
if (!adminApiBuilt.includes('function esGitHubPages(){return false;}')) {
  throw new Error('GitHub Pages: el Administrador todavía está desviando operaciones a Firebase directo.');
}
if (!read('coordinadores/404.html').includes(projectBase + '/coordinadores/')) {
  throw new Error('GitHub Pages: 404 de Coordinadores fuera del Project Page.');
}
if (!read('administrador/404.html').includes(projectBase + '/administrador/')) {
  throw new Error('GitHub Pages: 404 del Administrador fuera del Project Page.');
}

console.log('[GitHub Pages] Sitio preparado en .pages-github.');
console.log('[GitHub Pages] Rutas: /estudiantes/, /trabajo-titulacion/, /coordinadores/, /investigadores/, /administrador/.');
console.log('[GitHub Pages] Smoke checks de las cinco páginas: OK.');