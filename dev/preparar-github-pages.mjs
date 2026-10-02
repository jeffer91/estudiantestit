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
function cacheBustLocalAssets(relativePath) {
  let html = read(relativePath);
  html = html.replace(
    /((?:src|href)=(?:\"|')(?:js|css)\/[^\"'?]+)(?:\?[^\"']*)?((?:\"|'))/g,
    '$1?v=github-' + buildId + '$2'
  );
  write(relativePath, html);
}
function injectRuntime(relativePath, options = {}) {
  let html = read(relativePath);
  const depth = relativePath.split('/').length - 1;
  const prefix = '../'.repeat(depth);
  const runtimeSrc = prefix + 'runtime-config.js?v=github-' + buildId;
  const authSrc = prefix + 'firebase-auth-client.js?v=github-' + buildId;
  const scripts = [];

  if (!html.includes('runtime-config.js')) {
    scripts.push('  <script src="' + runtimeSrc + '"></script>');
  }
  if (options.auth === true && !html.includes('firebase-auth-client.js')) {
    scripts.push('  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js"></script>');
    scripts.push('  <script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js"></script>');
    scripts.push('  <script src="' + authSrc + '"></script>');
  }
  if (!scripts.length) return;
  if (!html.includes('</head>')) throw new Error('No se encontró </head> en ' + relativePath);
  html = html.replace('</head>', scripts.join('\n') + '\n</head>');
  write(relativePath, html);
}
function removeIfExists(relativePath) {
  fs.rmSync(path.join(output, relativePath), { recursive: true, force: true });
}
function removePublicCloudflareFallbacks(directory) {
  const target = path.join(output, directory);
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    const relativePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      removePublicCloudflareFallbacks(relativePath);
      continue;
    }
    if (!/\.(?:html|js|json|txt)$/i.test(entry.name)) continue;
    let content = read(relativePath);
    content = content
      .replaceAll('https://titulos.pages.dev', 'https://jeffer91.github.io/estudiantestit')
      .replaceAll('https://titulos-coordinadores.pages.dev', 'https://jeffer91.github.io/estudiantestit')
      .replaceAll('https://titulos-investigadores.pages.dev', 'https://jeffer91.github.io/estudiantestit')
      .replaceAll('https://titulos-administrador.pages.dev', 'https://jeffer91.github.io/estudiantestit');
    write(relativePath, content);
  }
}

copyDir(path.join(root, '.pages-estudiantes', 'estudiantes'), path.join(output, 'estudiantes'));
copyDir(path.join(root, '.pages-estudiantes', 'trabajo-titulacion'), path.join(output, 'trabajo-titulacion'));
copyDir(path.join(root, '.pages-coordinadores'), path.join(output, 'coordinadores'));
copyDir(path.join(root, '.pages-investigadores'), path.join(output, 'investigadores'));
copyDir(path.join(root, '.pages-administrador'), path.join(output, 'administrador'));
fs.copyFileSync(path.join(root, 'github-pages', 'firebase-direct-public.js'), path.join(output, 'firebase-direct-public.js'));
fs.copyFileSync(path.join(root, 'github-pages', 'runtime-config.js'), path.join(output, 'runtime-config.js'));
fs.copyFileSync(path.join(root, 'github-pages', 'firebase-auth-client.js'), path.join(output, 'firebase-auth-client.js'));

// Estudiantes: en GitHub Pages la consulta y el envío público usan Firestore
// directamente, sin Cloudflare ni Firebase Functions.
let directStudentHtml = read('estudiantes/estudiante.html');
if (!directStudentHtml.includes('firebase-direct-public.js')) {
  directStudentHtml = directStudentHtml.replace('</head>', '  <script src="../firebase-direct-public.js?v=github-' + buildId + '"></script>\n</head>');
  write('estudiantes/estudiante.html', directStudentHtml);
}
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
cacheBustLocalAssets('estudiantes/estudiante.html');
injectRuntime('estudiantes/estudiante.html');
fs.copyFileSync(path.join(output, 'estudiantes', 'estudiante.html'), path.join(output, 'estudiantes', 'index.html'));

// Trabajo de Titulación: Firestore directo + rutas relativas compatibles con project pages.
let workHtml = read('trabajo-titulacion/index.html');
workHtml = workHtml.replaceAll('\"/estudiantes/', '\"../estudiantes/').replaceAll("'/estudiantes/", "'../estudiantes/");
write('trabajo-titulacion/index.html', workHtml);
let directWorkHtml = read('trabajo-titulacion/index.html');
if (!directWorkHtml.includes('firebase-direct-public.js')) {
  directWorkHtml = directWorkHtml.replace('</head>', '  <script src="../firebase-direct-public.js?v=github-' + buildId + '"></script>\n</head>');
  write('trabajo-titulacion/index.html', directWorkHtml);
}
cacheBustLocalAssets('trabajo-titulacion/index.html');
removePublicCloudflareFallbacks('estudiantes');
removePublicCloudflareFallbacks('trabajo-titulacion');

// GitHub Pages publica toda la interfaz. Las operaciones que necesitan secretos
// o permisos elevados pasan por Firebase Functions; ninguna pantalla usa Cloudflare.
injectRuntime('estudiantes/estudiante.html');
fs.copyFileSync(path.join(output, 'estudiantes', 'estudiante.html'), path.join(output, 'estudiantes', 'index.html'));
injectRuntime('coordinadores/index.html', { auth: true });
injectRuntime('coordinadores/coordinador.html', { auth: true });
injectRuntime('investigadores/index.html');
removePublicCloudflareFallbacks('coordinadores');
removePublicCloudflareFallbacks('investigadores');

// Administrador ya dispone de lecturas directas de Firebase en GitHub Pages.
let adminHtml = read('administrador/ad-index.html');
adminHtml = adminHtml
  .replace(/<script>\s*window\.TITULOS_API_BASE=[\s\S]*?<\/script>\s*/gi, '')
  .replace(/([?&]r=)[^"'&\\s]+/g, '$1github-pages-' + buildId);
write('administrador/ad-index.html', adminHtml);
injectRuntime('administrador/ad-index.html', { auth: true });
removePublicCloudflareFallbacks('administrador');
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
if (!studentBuilt.includes('firebase-direct-public.js')) {
  throw new Error('GitHub Pages: falta Firebase directo para Estudiantes.');
}
if (!studentBuilt.includes('runtime-config.js')) {
  throw new Error('GitHub Pages: Estudiantes no carga la configuración del backend Firebase.');
}
if (!workBuilt.includes('firebase-direct-public.js')) {
  throw new Error('GitHub Pages: falta Firebase directo para Trabajo de Titulación.');
}
if (!studentBuilt.includes('estudiante.app.js?v=github-' + buildId)) {
  throw new Error('GitHub Pages: Estudiantes no invalida la caché de sus scripts por despliegue.');
}
if (!workBuilt.includes('trabajo-titulacion.js?v=github-' + buildId)) {
  throw new Error('GitHub Pages: Trabajo de Titulación no invalida la caché de sus scripts por despliegue.');
}
if (!coordinatorBuilt.includes('runtime-config.js') || !coordinatorBuilt.includes('firebase-auth-client.js')) {
  throw new Error('GitHub Pages: Coordinadores no carga Firebase Functions y Authentication.');
}
if (!read('investigadores/index.html').includes('runtime-config.js')) {
  throw new Error('GitHub Pages: Investigación no carga la configuración del backend Firebase.');
}
if (!adminBuilt.includes('runtime-config.js') || !adminBuilt.includes('firebase-auth-client.js')) {
  throw new Error('GitHub Pages: Administrador no carga Firebase Functions y Authentication.');
}
if (!read('coordinadores/404.html').includes(projectBase + '/coordinadores/')) {
  throw new Error('GitHub Pages: 404 de Coordinadores fuera del Project Page.');
}
if (!read('administrador/404.html').includes(projectBase + '/administrador/')) {
  throw new Error('GitHub Pages: 404 del Administrador fuera del Project Page.');
}

for (const directory of ['estudiantes', 'trabajo-titulacion', 'coordinadores', 'investigadores', 'administrador']) {
  const pending = [directory];
  while (pending.length) {
    const relative = pending.pop();
    const absolute = path.join(output, relative);
    const stat = fs.statSync(absolute);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(absolute)) pending.push(path.join(relative, child));
      continue;
    }
    if (!/\.(?:html|js|css|md|json|txt)$/i.test(relative)) continue;
    const content = read(relative);
    if (/pages\.dev|workers\.dev/i.test(content)) {
      throw new Error('GitHub Pages: dependencia de Cloudflare detectada en ' + relative + '.');
    }
  }
}

if (!read('runtime-config.js').includes('https://us-central1-titulos-ec2fa.cloudfunctions.net')) {
  throw new Error('GitHub Pages: runtime-config.js no apunta al backend Firebase esperado.');
}

console.log('[GitHub Pages] Sitio preparado en .pages-github.');
console.log('[GitHub Pages] Rutas: /estudiantes/, /trabajo-titulacion/, /coordinadores/, /investigadores/, /administrador/.');
console.log('[GitHub Pages] Frontend: GitHub Pages. Datos públicos: Firebase directo. IA y operaciones protegidas: Firebase Functions.');
console.log('[GitHub Pages] Cloudflare: sin dependencias en el artefacto publicado.');
console.log('[GitHub Pages] Smoke checks de las cinco páginas: OK.');
