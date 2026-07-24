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
const adminApi = read('administrador/ad-js/ad-api.service.js');
const packageJson = read('package.json');

assert(/TITULOS_FIREBASE_SERVICE_ACCOUNT/.test(firestore), 'Firestore no exige la cuenta de servicio de Títulos.');
assert(/UTET_FIREBASE_SERVICE_ACCOUNT/.test(firestore), 'Firestore no exige la cuenta de servicio de UTET.');
assert(/oauth2\.googleapis\.com\/token/.test(firestore), 'Firestore no obtiene un token OAuth de Google.');
assert(/Authorization[^\n]+Bearer/.test(firestore), 'Firestore no envía el token Bearer.');
assert(!/apiKey\s*:|AIza[0-9A-Za-z_-]{20,}/.test(firestore), 'Firestore todavía contiene claves web como mecanismo de autorización.');
assert(/requestHost/.test(http) && /titulos-administrador\.pages\.dev/.test(http), 'Los roles no se determinan por el dominio de destino.');
assert(!/origin\.includes\(['"]titulos-administrador/.test(http), 'El rol administrador todavía confía en el encabezado Origin.');
assert(/window\.location&&window\.location\.origin/.test(adminApi), 'El administrador no usa su API del mismo dominio.');
assert(!/API_PUBLICA=['"]https:\/\/titulos\.pages\.dev/.test(adminApi), 'El administrador todavía envía escrituras al dominio público de estudiantes.');
assert(/wrangler pages dev \.pages-local/.test(packageJson), 'El entorno local no indica la carpeta estática a Wrangler.');
assert(/deploy:administrador/.test(packageJson), 'No existe un despliegue independiente para Administrador.');

if (errors.length) {
  console.error('\n[Firebase/Auth] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}

console.log('[Firebase/Auth] Correcto: cuentas de servicio OAuth, roles por host y administrador en dominio propio.');
