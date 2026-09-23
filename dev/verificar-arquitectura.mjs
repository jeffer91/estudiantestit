import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push('Falta: ' + relativePath);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const apps = [
  ['estudiantes-mvp', 'estudiante.html'],
  ['coordinadores-mvp', 'coordinador.html'],
  ['investigadores-mvp', 'index.html'],
  ['administrador', 'ad-index.html']
];

for (const [directory, expected] of apps) {
  const absolute = path.join(root, directory);
  const htmlFiles = fs.existsSync(absolute)
    ? fs.readdirSync(absolute).filter((name) => name.toLowerCase().endsWith('.html'))
    : [];
  assert(htmlFiles.length === 1, directory + ' debe contener exactamente un HTML. Encontrados: ' + htmlFiles.join(', '));
  assert(htmlFiles[0] === expected, directory + ' debe usar ' + expected + '.');
}

const studentHtml = read('estudiantes-mvp/estudiante.html');
const coordinatorHtml = read('coordinadores-mvp/coordinador.html');
const investigatorHtml = read('investigadores-mvp/index.html');
const adminHtml = read('administrador/ad-index.html');

assert(!/firebase-app|firebase-firestore/i.test(studentHtml), 'El estudiante no debe cargar Firebase directamente en el navegador.');
assert(!/firebase-app|firebase-firestore/i.test(coordinatorHtml), 'El HTML fuente de Coordinadores no debe cargar Firebase directamente; el build seguro lo inyecta.');
assert(!/firebase-app|firebase-firestore/i.test(investigatorHtml), 'Investigación no debe cargar Firebase directamente en el navegador.');
assert(!/firebase-app|firebase-firestore/i.test(adminHtml), 'El HTML fuente del Administrador no debe cargar Firebase directamente; el build seguro lo inyecta.');

const requiredFiles = [
  'firebase.json',
  'firestore.rules',
  'functions/index.js',
  'functions/_lib/http.js',
  'functions/_lib/firestore.js',
  'functions/_lib/requisitos-firebase.js',
  'functions/_lib/titulos-firebase.js',
  'functions/_lib/ia-firebase.js',
  'functions/_lib/claves.js',
  'functions/api/claves.js',
  'functions/api/titulos.js',
  'functions/api/trabajo-titulacion.js',
  'functions/api/investigadores.js',
  'functions/_lib/workflow-titulacion.js',
  'functions/api/requisitos.js',
  'functions/api/ia.js',
  'github-pages/runtime-config.js',
  'github-pages/firebase-auth-client.js',
  'dev/preparar-github-pages.mjs',
  'estudiantes-mvp/js/requisitos.estudiantes.service.js',
  'estudiantes-mvp/js/titulos.cola.service.js',
  'coordinadores-mvp/js/coordinador.sheets.primary.js',
  'coordinadores-mvp/js/coordinador.app.js',
  'investigadores-mvp/js/investigadores.app.js',
  'administrador/ad-js/ad-api.service.js',
  'administrador/ad-js/ad-google-sheets.app.js'
];
requiredFiles.forEach(read);

const firestore = read('functions/_lib/firestore.js');
const requirements = read('functions/_lib/requisitos-firebase.js');
const titles = read('functions/_lib/titulos-firebase.js');
const ai = read('functions/_lib/ia-firebase.js');
const claves = read('functions/_lib/claves.js');
const http = read('functions/_lib/http.js');
const gateway = read('functions/index.js');
const rules = read('firestore.rules');
const authClient = read('github-pages/firebase-auth-client.js');
const pageBuild = read('dev/preparar-github-pages.mjs');
const titlesApi = read('functions/api/titulos.js');
const workApi = read('functions/api/trabajo-titulacion.js');
const investigatorApi = read('functions/api/investigadores.js');
const workflowApi = read('functions/_lib/workflow-titulacion.js');
const requirementsApi = read('functions/api/requisitos.js');
const aiApi = read('functions/api/ia.js');
const adminApi = read('administrador/ad-js/ad-api.service.js');
const adminApp = read('administrador/ad-js/ad-google-sheets.app.js');

assert(/titulos-ec2fa/.test(firestore), 'No está configurado Firebase Títulos titulos-ec2fa.');
assert(/utet-4387a/.test(firestore), 'No está configurado Firebase UTET utet-4387a.');
assert(/GoogleAuth/.test(firestore), 'Firestore no usa Application Default Credentials.');
assert(!/private_key|client_email|createSignedJwt/.test(firestore), 'Firestore todavía contiene secretos o firma JWT manual.');
assert(/Authorization[^\n]+Bearer/.test(firestore), 'Firestore no usa Bearer con ADC.');
assert(/allow read, write: if false/.test(rules), 'Firestore no está cerrado a clientes web.');
assert(/verifyIdToken/.test(gateway) && /__verifiedRole/.test(gateway), 'El gateway Firebase no valida identidad y rol.');
assert(/Auth\.Persistence\.NONE/.test(authClient), 'Las sesiones privilegiadas no están aisladas en memoria.');
assert(/\.wrangler/.test(pageBuild) && /cacheBust/.test(pageBuild), 'El build GitHub Pages no limpia Wrangler o no versiona assets.');
assert(/Estudiantes/.test(requirements), 'La consulta UTET no usa la colección Estudiantes.');
assert(/EstudiantesPeriodo/.test(requirements), 'La consulta UTET no contempla EstudiantesPeriodo.');
assert(/numeroIdentificacion/.test(requirements) && /Nombres/.test(requirements) && /NombreCarrera/.test(requirements), 'La consulta UTET no normaliza cédula, nombre y carrera.');
assert(/includePhone/.test(requirements), 'La consulta UTET no contempla el celular exclusivo del administrador.');
assert(/versiones_envio/.test(titles) && /resoluciones/.test(titles), 'Títulos no usa colecciones de versiones y resoluciones.');
assert(/commitDocuments/.test(titles), 'Los envíos y resoluciones no se guardan de forma atómica.');
assert(/ENVIO_ESTUDIANTE/.test(titles) && /GUARDAR_RESOLUCION/.test(titles), 'Títulos no implementa envío y resolución.');
assert(/ADMIN_ELIMINAR_TITULOS/.test(titles), 'Títulos no implementa la eliminación administrativa.');
assert(/SecretManagerServiceClient/.test(ai) && /secretId/.test(ai), 'Las credenciales IA no están integradas con Secret Manager.');
assert(/credencial:\s*null/.test(ai) && /apiKey:\s*null/.test(ai), 'La migración IA no limpia credenciales de Firestore.');
assert(/executeTitulosAction/.test(claves) && /pullRequisitos/.test(claves), 'La fachada no enruta hacia las dos Firebase.');
assert(!/CLAVES_APPS_SCRIPT_URL|script\.google\.com/.test(claves + titles + requirements + ai), 'La capa activa todavía depende de Apps Script.');
assert(/__verifiedRole/.test(http), 'Las APIs no priorizan el rol verificado por Firebase.');
assert(/runService\s*\(\s*env\s*,\s*['"]TITULOS['"]/.test(titlesApi), 'La API de Títulos no usa la fachada Firebase.');
assert(/assertCoordinatorWriteAccess/.test(titlesApi), 'Artículo Académico no verifica carrera del coordinador.');
assert(/trustedCoordinatorCareers/.test(workApi) && /assertCoordinatorCareer/.test(workApi), 'Trabajo de Titulación no verifica carrera del coordinador.');
assert(/ADMIN_ELIMINAR_TITULOS/.test(titlesApi), 'La API no reserva la eliminación para Administrador.');
assert(/PENDIENTE_INVESTIGADOR/.test(workflowApi) && /APROBADO_FINAL/.test(workflowApi), 'No existe una máquina de estados compartida para Investigación.');
assert(/validarSesion/.test(investigatorApi) && /investigacion_bloqueos/.test(investigatorApi) && /workflow_eventos/.test(investigatorApi), 'Investigación no valida sesión, concurrencia y trazabilidad.');
assert(/runService\s*\(\s*env\s*,\s*['"]REQUISITOS['"]/.test(requirementsApi), 'La API de Requisitos no usa la fachada Firebase.');
assert(/generateAi/.test(aiApi), 'La API de IA no usa el motor Firebase.');
assert(/enforcePublicIaRateLimit/.test(gateway), 'La generación pública de IA no tiene límite en el gateway.');
assert(/CONSULTAR_ESTUDIANTE/.test(adminApi), 'Administrador no consulta el estudiante con el rol que permite devolver celular.');
assert(/eliminarTitulo/.test(adminApi) && /ADMIN_ELIMINAR_TITULOS/.test(adminApi), 'Administrador no expone la acción de eliminación.');
assert(/data-action=["']eliminar-titulo/.test(adminApp) && /window\.confirm/.test(adminApp), 'La interfaz no muestra confirmación antes de eliminar.');
assert(/window\.TITULOS_API_BASE/.test(adminApi), 'Administrador no usa la API Firebase configurada.');

if (errors.length) {
  console.error('\n[Arquitectura] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}

console.log('[Arquitectura] Correcta: GitHub Pages + Firebase Functions + ADC/IAM + Secret Manager.');
console.log('[Arquitectura] Firestore está cerrado al navegador y Coordinación se limita por carreras en backend.');
console.log('[Arquitectura] Cloudflare queda congelado únicamente como rollback durante la transición.');
