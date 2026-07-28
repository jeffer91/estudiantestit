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
const outlookUi = read('administrador/ad-js/ad-version.js');
const graph = read('electron/administrador/microsoft-graph.cjs');
const main = read('electron/administrador/main.cjs');
const preload = read('electron/administrador/preload.cjs');
const globalApp = read('administrador/ad-js/ad-administracion-global.js');
const build = read('dev/preparar-pages-administrador.mjs');
const mailCode = outlook + globalApp + outlookUi;

assert(/CorreoInstitucional/.test(globalService), 'La lista global no recupera el correo institucional.');
assert(/CorreoPersonal/.test(globalService), 'La lista global no recupera el correo personal.');
assert(/correoInstitucional/.test(globalService) && /correoPersonal/.test(globalService), 'Los correos no se entregan al Administrador.');
assert(/ADAdminStatisticsLast/.test(api), 'El Administrador no conserva los faltantes para preparar recordatorios.');
assert(/ad-correo-outlook\.js/.test(api), 'El módulo de Outlook no se carga en el Administrador.');
assert(/correoInstitucional/.test(mailCode) && /correoPersonal/.test(mailCode), 'El Administrador no utiliza ambos correos del estudiante.');
assert(/Coordinación de Titulación/.test(mailCode) && /Reciba un cordial saludo/.test(mailCode), 'El correo no contiene el mensaje formal definido.');
assert(/ad-correo-outlook\.js/.test(build), 'El build del Administrador no valida el módulo de Outlook.');

assert(/correo-masivo-faltantes/.test(outlook), 'No existe el botón de correo masivo para faltantes.');
assert(/NO_ENVIADO/.test(outlookUi), 'El correo no limita los destinatarios a estudiantes que no han enviado.');
assert(/MASS_BATCH_SIZE\s*=\s*50/.test(outlookUi), 'El correo masivo no divide los destinatarios en lotes controlados.');
assert(/ad-mail-mass-confirm/.test(mailCode), 'El correo masivo no solicita confirmación antes de crear borradores.');
assert(/periodoIdSeleccionado/.test(outlookUi), 'El correo masivo no comprueba que la lista corresponda al período seleccionado.');

assert(/@azure\/msal-node/.test(graph), 'La integración no utiliza MSAL oficial de Microsoft.');
assert(/Mail\.ReadWrite/.test(graph), 'La integración no solicita el permiso delegado Mail.ReadWrite.');
assert(/acquireTokenByDeviceCode/.test(graph), 'La integración no usa inicio de sesión seguro mediante código de dispositivo.');
assert(/graph\.microsoft\.com\/v1\.0/.test(graph), 'La integración no llama a Microsoft Graph v1.0.');
assert(/\/me\/messages/.test(graph), 'La integración no crea mensajes en la carpeta Borradores.');
assert(/bccRecipients/.test(graph), 'Los correos institucionales y personales no se colocan como destinatarios CCO reales.');
assert(!/\/send\b/.test(graph), 'La integración no debe enviar correos automáticamente.');
assert(/admin-graph:create-drafts/.test(main), 'Electron no registra la creación segura de borradores.');
assert(/admin-graph:device-code/.test(main), 'Electron no informa el código de autorización de Microsoft.');
assert(/graph:\s*Object\.freeze/.test(preload), 'El preload no expone el puente seguro de Microsoft Graph.');
assert(/graphBridge\.createDrafts/.test(outlookUi), 'La interfaz no solicita la creación real de borradores.');
assert(/ad-graph-tenant-id/.test(outlookUi) && /ad-graph-client-id/.test(outlookUi), 'La interfaz no permite configurar Tenant ID y Client ID.');
assert(/Crear borradores en Outlook/.test(outlookUi), 'El botón no indica que crea borradores reales en Outlook.');
assert(/stopImmediatePropagation/.test(outlookUi), 'La integración no bloquea la apertura antigua del borrador defectuoso.');

if (errors.length) {
  console.error('\n[Outlook] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}
console.log('[Outlook] Correcto: Microsoft Graph crea borradores reales con correos institucionales y personales en CCO.');
