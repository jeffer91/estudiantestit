import fs from 'node:fs';
import process from 'node:process';

const errors = [];

function read(path) {
  if (!fs.existsSync(path)) {
    errors.push('No existe: ' + path);
    return '';
  }
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const statistics = read('functions/_lib/estadisticas-admin.js');
const api = read('administrador/ad-js/ad-api.service.js');
const outlook = read('administrador/ad-js/ad-correo-outlook.js');
const build = read('dev/preparar-pages-administrador.mjs');

assert(/CorreoInstitucional/.test(statistics), 'Las estadísticas no recuperan el correo institucional.');
assert(/CorreoPersonal/.test(statistics), 'Las estadísticas no recuperan el correo personal.');
assert(/correoInstitucional/.test(statistics) && /correoPersonal/.test(statistics), 'Los correos no se entregan al Administrador.');
assert(/ADAdminStatisticsLast/.test(api), 'El Administrador no conserva los faltantes para preparar recordatorios.');
assert(/ad-correo-outlook\.js/.test(api), 'El módulo de Outlook no se carga en el Administrador.');
assert(/outlook\.office\.com\/mail\/deeplink\/compose/.test(outlook), 'El botón no abre el compositor web de Outlook.');
assert(/correoInstitucional/.test(outlook) && /correoPersonal/.test(outlook), 'Outlook no utiliza ambos correos del estudiante.');
assert(/Coordinación de Titulación/.test(outlook) && /Reciba un cordial saludo/.test(outlook), 'El correo no contiene el mensaje formal definido.');
assert(/_blank/.test(outlook), 'Outlook no se abre en una pestaña nueva.');
assert(/ad-correo-outlook\.js/.test(build), 'El build del Administrador no valida el módulo de Outlook.');

if (errors.length) {
  console.error('\n[Outlook] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}

console.log('[Outlook] Correcto: correo institucional y personal, mensaje formal y revisión antes del envío.');
