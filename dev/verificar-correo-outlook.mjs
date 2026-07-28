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
const outlookFix = read('administrador/ad-js/ad-version.js');
const globalApp = read('administrador/ad-js/ad-administracion-global.js');
const build = read('dev/preparar-pages-administrador.mjs');
const mailCode = outlook + globalApp + outlookFix;

assert(/CorreoInstitucional/.test(globalService), 'La lista global no recupera el correo institucional.');
assert(/CorreoPersonal/.test(globalService), 'La lista global no recupera el correo personal.');
assert(/correoInstitucional/.test(globalService) && /correoPersonal/.test(globalService), 'Los correos no se entregan al Administrador.');
assert(/ADAdminStatisticsLast/.test(api), 'El Administrador no conserva los faltantes para preparar recordatorios.');
assert(/ad-correo-outlook\.js/.test(api), 'El módulo de Outlook no se carga en el Administrador.');
assert(/correoInstitucional/.test(mailCode) && /correoPersonal/.test(mailCode), 'Outlook no utiliza ambos correos del estudiante.');
assert(/Coordinación de Titulación/.test(mailCode) && /Reciba un cordial saludo/.test(mailCode), 'El correo no contiene el mensaje formal definido.');
assert(/_blank/.test(mailCode), 'Outlook no se abre mediante el cliente configurado.');
assert(/ad-correo-outlook\.js/.test(build), 'El build del Administrador no valida el módulo de Outlook.');

assert(/correo-masivo-faltantes/.test(outlook), 'No existe el botón de correo masivo para faltantes.');
assert(/NO_ENVIADO/.test(outlookFix), 'El correo corregido no limita los destinatarios a estudiantes que no han enviado.');
assert(/MASS_BATCH_SIZE\s*=\s*50/.test(outlookFix), 'El correo masivo no divide los destinatarios en lotes controlados.');
assert(/ad-mail-mass-confirm/.test(mailCode), 'El correo masivo no solicita confirmación antes de abrir Outlook.');
assert(/periodoIdSeleccionado/.test(outlookFix), 'El correo masivo no comprueba que la lista corresponda al período seleccionado.');

assert(/return 'mailto:'/.test(outlookFix), 'La corrección no utiliza el manejador de correo del sistema.');
assert(/bcc='\+codificarCorreos/.test(outlookFix), 'Los destinatarios masivos no se colocan en CCO.');
assert(/encodeURIComponent\(texto\(options\.subject\)\)/.test(outlookFix), 'El asunto no codifica correctamente los espacios.');
assert(/encodeURIComponent\(String\(options\.body\|\|''\)\)/.test(outlookFix), 'El cuerpo no codifica correctamente los espacios y saltos de línea.');
assert(/codificarCorreos\(to\)/.test(outlookFix), 'Los correos institucionales y personales no aparecen en los destinatarios individuales.');
assert(/stopImmediatePropagation/.test(outlookFix), 'La corrección no bloquea la apertura antigua con signos +.');
assert(/window\.addEventListener\('click',[\s\S]*?,true\)/.test(outlookFix), 'La corrección no intercepta Outlook antes del módulo antiguo.');

if (errors.length) {
  console.error('\n[Outlook] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}
console.log('[Outlook] Correcto: espacios legibles y correos institucionales/personales en Para o CCO.');
