import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const output = path.join(root, '.pages-github');
const buildId = String(process.env.GITHUB_SHA || 'local').slice(0, 12);
const repositoryName = String(process.env.GITHUB_REPOSITORY || 'jeffer91/estudiantestit').split('/')[1] || 'estudiantestit';
const projectBase = '/' + repositoryName;
const siteOrigin = 'https://jeffer91.github.io';
const siteBase = siteOrigin + projectBase;
const firebaseApiBase = 'https://us-central1-titulos-ec2fa.cloudfunctions.net';
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

fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'github-pages', 'runtime-config.js'), path.join(output, 'assets', 'runtime-config.js'));
fs.copyFileSync(path.join(root, 'github-pages', 'firebase-auth-client.js'), path.join(output, 'assets', 'firebase-auth-client.js'));

function injectRuntime(relativePath, protectedPanel) {
  let html = read(relativePath);
  const runtimeSrc = projectBase + '/assets/runtime-config.js?v=' + buildId;
  if (!html.includes(runtimeSrc)) {
    const scripts = [
      '<script src="' + runtimeSrc + '"></script>'
    ];
    if (protectedPanel === true) {
      scripts.push('<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script>');
      scripts.push('<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js"></script>');
      scripts.push('<script src="' + projectBase + '/assets/firebase-auth-client.js?v=' + buildId + '"></script>');
    }
    if (!html.includes('</head>')) throw new Error('No se encontró </head> en ' + relativePath);
    html = html.replace('</head>', '  ' + scripts.join('\n  ') + '\n</head>');
    write(relativePath, html);
  }
}

function patchLegacyText(value) {
  let out = value;
  out = out.replaceAll('https://titulos.pages.dev/estudiantes/estudiante', siteBase + '/estudiantes/');
  out = out.replaceAll('https://titulos.pages.dev/estudiantes/', siteBase + '/estudiantes/');
  out = out.replaceAll('https://titulos.pages.dev/trabajo-titulacion/', siteBase + '/trabajo-titulacion/');
  out = out.replaceAll('https://titulos-administrador.pages.dev', firebaseApiBase);
  out = out.replaceAll('https://titulos-coordinadores.pages.dev', firebaseApiBase);
  out = out.replaceAll('https://titulos-investigadores.pages.dev', firebaseApiBase);
  out = out.replaceAll('https://titulos.pages.dev', firebaseApiBase);
  out = out.replaceAll('https://jeffer91.github.io/api/', firebaseApiBase + '/api/');
  return out;
}

function patchDirectoryForFirebase(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) {
      patchDirectoryForFirebase(full);
      continue;
    }
    if (!/\.(?:html|js|css|json)$/i.test(item.name)) continue;
    const value = patchLegacyText(fs.readFileSync(full, 'utf8'));
    fs.writeFileSync(full, value, 'utf8');
  }
}

// Estudiantes: conservar la pantalla original y agregar una entrada limpia /estudiantes/.
// GitHub Pages carga además el enrutador que detecta Trabajo de Titulación.
injectApiBase('estudiantes/estudiante.html', firebaseApiBase);
let studentRoute = read('estudiantes/js/estudiante.trabajo-titulacion.route.js');
studentRoute = studentRoute.replace("window.location.assign('/trabajo-titulacion/?cedula='", "window.location.assign('../trabajo-titulacion/?cedula='");
write('estudiantes/js/estudiante.trabajo-titulacion.route.js', studentRoute);

let studentConsulta = read('estudiantes/js/estudiante.consulta.revision.js');
studentConsulta = studentConsulta.replace(
  /\n\s*var FIREBASE_UTET_PUBLICO[\s\S]*?\n\s*function asegurarEstilosModal\(\)/,
  '\n\n  function asegurarEstilosModal()'
);
studentConsulta = studentConsulta.replace(
  /\n\s*var host = texto\(window\.location && window\.location\.hostname\)\.toLowerCase\(\);\n\n\s*if \(\/\\\.github\\\.io\$\/\.test\(host\)\) \{[\s\S]*?\n\s*\}\n/,
  '\n'
);
studentConsulta = studentConsulta.replace(
  /\.catch\(function \(error\) \{[\s\S]*?return consultarAccesoFirebaseDirecto\(identificacion\)[\s\S]*?\n\s*\}\)\n\s*\.then\(function \(resultado\)/,
  ".catch(function (error) {\n        if (timer) { window.clearTimeout(timer); timer = null; }\n        throw new Error(error && error.name === 'AbortError' ? 'La consulta tardó demasiado. Intenta nuevamente.' : (error && error.message || 'No fue posible verificar tu registro.'));\n      })\n      .then(function (resultado)"
);
write('estudiantes/js/estudiante.consulta.revision.js', studentConsulta);

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

// Trabajo de Titulación: backend Firebase propio + rutas relativas compatibles con Project Pages.
let workHtml = read('trabajo-titulacion/index.html');
workHtml = workHtml.replaceAll('\"/estudiantes/', '\"../estudiantes/').replaceAll("'/estudiantes/", "'../estudiantes/");
write('trabajo-titulacion/index.html', workHtml);
injectApiBase('trabajo-titulacion/index.html', firebaseApiBase);
let workJs = read('trabajo-titulacion/js/trabajo-titulacion.js');
const oldApiBase = "function apiBase(){var origin=text(window.location&&window.location.origin);if(['http://localhost:5500','http://127.0.0.1:5500'].indexOf(origin)>=0)return'http://127.0.0.1:8788';return origin&&origin!=='null'?origin:'https://titulos.pages.dev';}";
const newApiBase = "function apiBase(){var forced=text(window.TITULOS_API_BASE||'');var origin=text(window.location&&window.location.origin);if(forced)return forced.replace(/\\\/$/,'');if(['http://localhost:5500','http://127.0.0.1:5500'].indexOf(origin)>=0)return'http://127.0.0.1:5001/titulos-ec2fa/us-central1';return '" + firebaseApiBase + "';}";
if (!workJs.includes(oldApiBase)) throw new Error('No se pudo adaptar apiBase de Trabajo de Titulación.');
workJs = workJs.replace(oldApiBase, newApiBase);
write('trabajo-titulacion/js/trabajo-titulacion.js', workJs);

// Coordinadores: usar exclusivamente el backend Firebase propio de GitHub Pages.
injectApiBase('coordinadores/index.html', firebaseApiBase);
injectApiBase('coordinadores/coordinador.html', firebaseApiBase);

// Investigadores: el código fuente ya usa Firebase Functions y libera el bloqueo al cerrar.
let investigatorJs = read('investigadores/js/investigadores.app.js');
if (!investigatorJs.includes('function investigacionEndpoint()')) {
  throw new Error('Investigación no define su endpoint Firebase.');
}
if (investigatorJs.includes("fetch('/api/investigadores'") || investigatorJs.includes("sendBeacon('/api/investigadores'")) {
  throw new Error('Investigación conserva una llamada same-origin.');
}

// Administrador: la interfaz permanece en GitHub Pages.
// El Administrador usa exclusivamente el backend Firebase propio; no depende de Cloudflare.
let adminApi = read('administrador/ad-js/ad-api.service.js');
const githubDetector = "function esGitHubPages(){var h=texto(window.location&&window.location.hostname).toLowerCase();return h==='github.io'||/\\.github\\.io$/.test(h);}";
if (!adminApi.includes(githubDetector)) {
  throw new Error('No se encontró el detector de GitHub Pages del Administrador.');
}
adminApi = adminApi.replace(githubDetector, 'function esGitHubPages(){return false;}');
write('administrador/ad-js/ad-api.service.js', adminApi);

let adminHtml = read('administrador/ad-index.html');
adminHtml = adminHtml.replace(/<script[^>]+ad-firebase-direct\.js[^>]*><\/script>\s*/gi, '');
adminHtml = adminHtml
  .replace(/<script>\s*window\.TITULOS_API_BASE=[\s\S]*?<\/script>\s*/gi, '')
  .replace(/([?&]r=)[^"'&\\s]+/g, '$1github-pages-' + buildId);
write('administrador/ad-index.html', adminHtml);
injectApiBase('administrador/ad-index.html', firebaseApiBase);
fs.copyFileSync(
  path.join(output, 'administrador', 'ad-index.html'),
  path.join(output, 'administrador', 'index.html')
);


injectRuntime('estudiantes/estudiante.html', false);
fs.copyFileSync(path.join(output, 'estudiantes', 'estudiante.html'), path.join(output, 'estudiantes', 'index.html'));
injectRuntime('estudiantes/index.html', false);
injectRuntime('trabajo-titulacion/index.html', false);
injectRuntime('coordinadores/index.html', true);
injectRuntime('coordinadores/coordinador.html', true);
injectRuntime('investigadores/index.html', false);
injectRuntime('administrador/ad-index.html', true);
fs.copyFileSync(path.join(output, 'administrador', 'ad-index.html'), path.join(output, 'administrador', 'index.html'));
injectRuntime('administrador/index.html', true);

removeIfExists('administrador/ad-js/ad-firebase-direct.js');
patchDirectoryForFirebase(output);

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
if (!studentBuilt.includes(firebaseApiBase)) {
  throw new Error('GitHub Pages: Estudiantes no apunta al backend Firebase propio.');
}
if (!workBuilt.includes(firebaseApiBase)) {
  throw new Error('GitHub Pages: Trabajo de Titulación no apunta al backend Firebase propio.');
}
if (!coordinatorBuilt.includes(firebaseApiBase)) {
  throw new Error('GitHub Pages: Coordinadores no apunta al backend Firebase propio.');
}
if (!investigatorBuilt.includes(firebaseApiBase) || !investigatorBuilt.includes("INVESTIGACION_API_BASE+'/api/investigadores'")) {
  throw new Error('GitHub Pages: Investigación no apunta al backend Firebase propio.');
}
if (!adminBuilt.includes(firebaseApiBase)) {
  throw new Error('GitHub Pages: Administrador no apunta al backend Firebase propio.');
}
if (!coordinatorBuilt.includes('firebase-auth-client.js')) {
  throw new Error('GitHub Pages: Coordinadores no carga Firebase Auth.');
}
if (!adminBuilt.includes('firebase-auth-client.js')) {
  throw new Error('GitHub Pages: Administrador no carga Firebase Auth.');
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


const forbiddenOrigins = ['pages.dev', 'workers.dev', 'cloudflare'];
const malformedApiPatterns = [
  firebaseApiBase + 'https://',
  "base()+'" + firebaseApiBase,
  'base()+"' + firebaseApiBase,
  "apiBase() + '" + firebaseApiBase,
  'apiBase()+"' + firebaseApiBase,
  "firebaseApiBase + '" + firebaseApiBase
];
const scanStack = [output];
while (scanStack.length) {
  const directory = scanStack.pop();
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) { scanStack.push(full); continue; }
    if (!/\.(?:html|js|css|json)$/i.test(item.name)) continue;
    const value = fs.readFileSync(full, 'utf8');
    for (const forbidden of forbiddenOrigins) {
      if (value.toLowerCase().includes(forbidden.toLowerCase())) {
        throw new Error('GitHub Pages todavía contiene dependencia de ' + forbidden + ': ' + path.relative(output, full));
      }
    }
    for (const malformed of malformedApiPatterns) {
      if (value.includes(malformed)) {
        throw new Error('GitHub Pages contiene una URL API concatenada incorrectamente: ' + path.relative(output, full));
      }
    }
    if (value.includes('firestore.googleapis.com')) {
      throw new Error('GitHub Pages todavía contiene acceso directo a Firestore: ' + path.relative(output, full));
    }
  }
}
const studentConsultaBuilt = read('estudiantes/js/estudiante.consulta.revision.js');
if (studentConsultaBuilt.includes('consultarAccesoFirebaseDirecto')) {
  throw new Error('GitHub Pages: Estudiantes todavía contiene acceso directo a Firestore.');
}

const studentRequirementsBuilt = read('estudiantes/js/requisitos.estudiantes.service.js');
const studentSheetsBuilt = read('estudiantes/js/sheets.service.js');
const studentIaBuilt = read('estudiantes/js/ia.config.service.js');
const studentIaProviderBuilt = read('estudiantes/js/ia.providers.service.js');
const workJsBuilt = read('trabajo-titulacion/js/trabajo-titulacion.js');
const coordinatorApiBuilt = read('coordinadores/js/coordinador.sheets.primary.js');

if (!studentRequirementsBuilt.includes("apiBase() + '/api/requisitos'")) {
  throw new Error('GitHub Pages: Estudiantes no conserva el resolver correcto para /api/requisitos.');
}
if (!studentSheetsBuilt.includes("apiBase() + '/api/titulos'")) {
  throw new Error('GitHub Pages: Estudiantes no conserva el resolver correcto para /api/titulos.');
}
if (!studentIaBuilt.includes("apiBase() + '/api/ia")) {
  throw new Error('GitHub Pages: Estudiantes no conserva el resolver correcto para /api/ia.');
}
if (!studentIaProviderBuilt.includes('window.TITULOS_API_BASE') || !studentIaProviderBuilt.includes("return apiBase()+'/api/ia'")) {
  throw new Error('GitHub Pages: el generador real de IA no usa TITULOS_API_BASE.');
}
if (studentIaProviderBuilt.includes('titulos.pages.dev') || studentIaProviderBuilt.includes('window.location.origin')) {
  throw new Error('GitHub Pages: el generador real de IA conserva un origen heredado.');
}
if (!workJsBuilt.includes('fetch(apiBase()+path')) {
  throw new Error('GitHub Pages: Trabajo de Titulación no usa apiBase()+path.');
}
if (!coordinatorApiBuilt.includes("return base()+'/api/titulos'") || !coordinatorApiBuilt.includes("return base()+'/api/trabajo-titulacion'")) {
  throw new Error('GitHub Pages: Coordinadores no resuelve correctamente sus dos APIs.');
}
if (!investigatorBuilt.includes('investigacionEndpoint()') || investigatorBuilt.includes("fetch('/api/investigadores'") || investigatorBuilt.includes("sendBeacon('/api/investigadores'")) {
  throw new Error('GitHub Pages: Investigación no resuelve correctamente fetch/sendBeacon.');
}
if (!investigatorBuilt.includes("window.addEventListener('pagehide',liberarAlSalir)") || investigatorBuilt.includes("window.addEventListener('beforeunload'")) {
  throw new Error('GitHub Pages: Investigación no usa la liberación robusta por pagehide.');
}
if (!investigatorBuilt.includes("'Content-Type':'text/plain;charset=UTF-8'")) {
  throw new Error('GitHub Pages: Investigación no tiene fallback keepalive simple.');
}

const backendIndex = fs.readFileSync(path.join(root, 'firebase-backend', 'functions', 'index.js'), 'utf8');
for (const route of [
  'acceso-estudiante', 'admin-flujo', 'admin-trabajo-titulacion', 'claves',
  'estadisticas', 'historial-titulos', 'ia', 'investigadores', 'requisitos',
  'sheets', 'titulos', 'trabajo-titulacion'
]) {
  if (!backendIndex.includes("['" + route + "'")) {
    throw new Error('Backend Firebase: falta la ruta /api/' + route + '.');
  }
}

const sameOriginApiPattern = /(?:fetch|sendBeacon)\s*\(\s*['"]\/api\//;
const runtimeStack = [output];
while (runtimeStack.length) {
  const directory = runtimeStack.pop();
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) { runtimeStack.push(full); continue; }
    if (!/\.js$/i.test(item.name)) continue;
    const value = fs.readFileSync(full, 'utf8');
    if (sameOriginApiPattern.test(value)) {
      throw new Error('GitHub Pages conserva una llamada API same-origin: ' + path.relative(output, full));
    }
  }
}

console.log('[GitHub Pages] Sitio preparado en .pages-github.');
console.log('[GitHub Pages] Rutas: /estudiantes/, /trabajo-titulacion/, /coordinadores/, /investigadores/, /administrador/.');
console.log('[GitHub Pages] Smoke checks de las cinco páginas: OK.');