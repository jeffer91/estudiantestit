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
const titles = read('functions/_lib/titulos-firebase.js');
const access = read('functions/api/acceso-estudiante.js');
const adminApi = read('administrador/ad-js/ad-api.service.js');
const packageJson = read('package.json');

assert(/titulos-ec2fa/.test(firestore), 'No está configurado Firebase Títulos.');
assert(/utet-4387a/.test(firestore), 'No está configurado Firebase UTET.');
assert(/apiKey/.test(firestore) && /AIza[0-9A-Za-z_-]{20,}/.test(firestore), 'Faltan las configuraciones web de Firebase.');
assert(/publicApiUrl/.test(firestore), 'Firestore no tiene modo de acceso con configuración web.');
assert(/serviceAccount/.test(firestore) && /oauth2\.googleapis\.com\/token/.test(firestore), 'Firestore no conserva OAuth opcional para producción.');
assert(/token \? url : publicApiUrl/.test(firestore), 'Firestore no selecciona entre OAuth y configuración web.');
assert(/requestHost/.test(http) && /titulos-administrador\.pages\.dev/.test(http), 'Los roles no se determinan por el dominio de destino.');
assert(/endsWith\(['"]\.['"]\s*\+\s*projectHost/.test(http), 'Los roles no contemplan dominios de vista previa de Pages.');
assert(!/origin\.includes\(['"]titulos-administrador/.test(http), 'El rol administrador todavía confía en el encabezado Origin.');
assert(/window\.location&&window\.location\.origin/.test(adminApi), 'El administrador no usa su API del mismo dominio.');
assert(!/API_PUBLICA=['"]https:\/\/titulos\.pages\.dev/.test(adminApi), 'El administrador todavía envía escrituras al dominio público de estudiantes.');
assert(/wrangler pages dev \.pages-local/.test(packageJson), 'El entorno local no indica la carpeta estática a Wrangler.');
assert(/deploy:administrador/.test(packageJson), 'No existe un despliegue independiente para Administrador.');
assert(!/\bsetCached\s*\(/.test(access), 'La consulta inicial llama una función de caché inexistente.');
assert(/\.then\(\(result\)\s*=>\s*setCache\(key, result, cedula\)\)/.test(access), 'La consulta inicial no guarda correctamente el resultado en caché.');
assert(/if \(requested\)[\s\S]*if \(!candidates\.length\) return null;/.test(titles), 'Una consulta de período podría devolver un envío perteneciente a otro período.');
assert(/RESOLUTION_STATES/.test(titles), 'Las resoluciones no limitan los estados permitidos.');
assert(/commitDocuments\('TITULOS'/.test(titles), 'Los envíos y resoluciones no usan escrituras atómicas.');

if (errors.length) {
  console.error('\n[Firebase/Auth] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}

console.log('[Firebase/Auth] Correcto: configuración web para pruebas, OAuth opcional, roles, períodos exactos y escrituras atómicas.');
