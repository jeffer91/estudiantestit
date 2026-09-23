import fs from 'node:fs';
import process from 'node:process';

const errors = [];

function read(path) {
  if (!fs.existsSync(path)) {
    errors.push('Falta: ' + path);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const firestore = read('functions/_lib/firestore.js');
const http = read('functions/_lib/http.js');
const gateway = read('functions/index.js');
const rules = read('firestore.rules');
const authClient = read('github-pages/firebase-auth-client.js');
const titles = read('functions/_lib/titulos-firebase.js');
const titlesApi = read('functions/api/titulos.js');
const workApi = read('functions/api/trabajo-titulacion.js');
const access = read('functions/api/acceso-estudiante.js');
const adminApi = read('administrador/ad-js/ad-api.service.js');
const packageJson = read('package.json');

assert(/titulos-ec2fa/.test(firestore), 'No está configurado Firebase Títulos.');
assert(/utet-4387a/.test(firestore), 'No está configurado Firebase UTET.');
assert(/GoogleAuth/.test(firestore) && /Application Default Credentials|ADC/.test(firestore), 'Firestore no usa ADC/IAM.');
assert(/Authorization[^\n]+Bearer/.test(firestore), 'Firestore no envía autorización Bearer con ADC.');
assert(!/private_key|client_email|createSignedJwt|oauth2\.googleapis\.com\/token/.test(firestore), 'Firestore todavía contiene lógica de cuenta de servicio JSON.');
assert(/verifyIdToken/.test(gateway), 'Firebase Functions no verifica el ID token.');
assert(/collection\(['"]usuarios['"]\)/.test(gateway), 'Firebase Functions no consulta el perfil/rol autenticado.');
assert(/__verifiedRole/.test(gateway) && /__verifiedUser/.test(gateway), 'El gateway no propaga identidad verificada a las APIs.');
assert(/allow read, write: if false/.test(rules), 'Firestore no está cerrado al navegador.');
assert(/Auth\.Persistence\.NONE/.test(authClient), 'Administrador/Coordinadores persisten la sesión en el origen compartido.');
assert(/window\.top!==window\.self/.test(authClient), 'Las pantallas privilegiadas no bloquean ejecución embebida.');
assert(/trustedCoordinatorCareers/.test(workApi), 'Trabajo de Titulación no limita Coordinación por carreras.');
assert(/assertCoordinatorWriteAccess/.test(titlesApi), 'Artículo Académico no verifica carrera antes de escribir.');
assert(/window\.TITULOS_API_BASE/.test(adminApi), 'El Administrador no permite usar la API Firebase configurada.');
assert(/wrangler pages dev \.pages-local/.test(packageJson), 'El entorno local legado dejó de estar documentado para rollback.');
assert(!/\bsetCached\s*\(/.test(access), 'La consulta inicial llama una función de caché inexistente.');
assert(/function setCache\(key, value\)/.test(access), 'La consulta inicial no define la caché académica correctamente.');
assert(/return setCache\(key, \{/.test(access), 'La consulta inicial no guarda resultados académicos en caché.');
assert(/academicInflight\.set\(key, task\)/.test(access), 'La consulta inicial no evita solicitudes académicas duplicadas.');
assert(/if \(requested\)[\s\S]*if \(!candidates\.length\) return null;/.test(titles), 'Una consulta de período podría devolver un envío de otro período.');
assert(/RESOLUTION_STATES/.test(titles), 'Las resoluciones no limitan los estados permitidos.');
assert(/commitDocuments\('TITULOS'/.test(titles), 'Los envíos y resoluciones no usan escrituras atómicas.');

if (errors.length) {
  console.error('\n[Firebase/Auth] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}

console.log('[Firebase/Auth] Correcto: ADC/IAM, Auth verificada, Firestore cerrado y permisos por carrera.');
