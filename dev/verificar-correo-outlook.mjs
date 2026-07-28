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

const globalService = read('functions/_lib/admin-global.js');
const api = read('administrador/ad-js/ad-api.service.js');
const outlook = read('administrador/ad-js/ad-correo-outlook.js');
const globalApp = read('administrador/ad-js/ad-administracion-global.js');
const build = read('dev/preparar-pages-administrador.mjs');
const mailCode = outlook + globalApp;

assert(/CorreoInstitucional/.test(globalService), 'La lista global no recupera el correo institucional.');
assert(/CorreoPersonal/.test(globalService), 'La lista global no recupera el correo personal.');
assert(/correoInstitucional/.test(globalService) && /correoPersonal/.test(globalService), 'Los correos no se entregan al Administrador.');
assert(/ADAdminStatisticsLast/.test(api), 'El Administrador no conserva los faltantes para preparar recordatorios.');
assert(/ad-correo-outlook\.js/.test(api), 'El módulo de Outlook no se carga en el Administrador.');
assert(/outlook\.office\.com\/mail\/deeplink\/compose/.test(mailCode), 'El botón no abre el compositor web de Outlook.');
assert(/correoInstitucional/.test(mailCode) && /correoPersonal/.test(mailCode), 'Outlook no utiliza ambos correos del estudiante.');
assert(/Coordinación de Titulación/.test(mailCode) && /Reciba un cordial saludo/.test(mailCode), 'El correo no contiene el mensaje formal definido.');
assert(/_blank/.test(mailCode), 'Outlook no se abre en una pestaña nueva.');
assert(/ad-correo-outlook\.js/.test(build), 'El build del Administrador no valida el módulo de Outlook.');

assert(/correo-masivo-faltantes/.test(outlook), 'No existe el botón de correo masivo para faltantes.');
assert(/NO_ENVIADO/.test(outlook), 'El correo masivo no limita los destinatarios a estudiantes que no han enviado.');
assert(/\bbcc\s*:/.test(outlook), 'El correo masivo no protege los destinatarios mediante CCO.');
assert(/MASS_BATCH_SIZE\s*=\s*50/.test(outlook), 'El correo masivo no divide los destinatarios en lotes controlados.');
assert(/ad-mail-mass-confirm/.test(outlook), 'El correo masivo no solicita confirmación antes de abrir Outlook.');
assert(/ningún correo se enviará automáticamente/.test(outlook), 'La interfaz no aclara que el envío debe confirmarse en Outlook.');
assert(/periodoIdTitulos/.test(outlook), 'El correo masivo no comprueba que la lista corresponda al período seleccionado.');

if (errors.length) {
  console.error('\n[Outlook] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}
console.log('[Outlook] Correcto: correos individuales y correo masivo en CCO para estudiantes faltantes.');
