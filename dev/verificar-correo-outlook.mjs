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
const main = read('electron/administrador/main.cjs');
const preload = read('electron/administrador/preload.cjs');
const globalApp = read('administrador/ad-js/ad-administracion-global.js');
const build = read('dev/preparar-pages-administrador.mjs');
const packageJson = JSON.parse(read('package.json') || '{}');
const mailCode = outlook + globalApp + outlookUi;
const uiVersion = (outlookUi.match(/var VERSION='([^']+)'/) || [])[1] || '';
const buildVersion = (build.match(/VERSION_ADMIN = '([^']+)'/) || [])[1] || '';

assert(/CorreoInstitucional/.test(globalService), 'La lista global no recupera el correo institucional.');
assert(/CorreoPersonal/.test(globalService), 'La lista global no recupera el correo personal.');
assert(/correoInstitucional/.test(globalService) && /correoPersonal/.test(globalService), 'Los correos no se entregan al Administrador.');
assert(/ADAdminStatisticsLast/.test(api), 'El Administrador no conserva los faltantes para preparar recordatorios.');
assert(/ad-correo-outlook\.js/.test(api), 'El módulo de Outlook no se carga en el Administrador.');
assert(/correoInstitucional/.test(mailCode) && /correoPersonal/.test(mailCode), 'El Administrador no utiliza ambos correos del estudiante.');
assert(/Coordinación de Titulación/.test(mailCode) && /Reciba un cordial saludo/.test(mailCode), 'El correo no contiene el mensaje formal definido.');
assert(/ad-correo-outlook\.js/.test(build), 'El build del Administrador no valida el módulo de Outlook.');

assert(uiVersion === packageJson.version, 'La versión de la interfaz no coincide con package.json.');
assert(buildVersion === packageJson.version, 'La versión del build del Administrador no coincide con package.json.');
assert(/correo-masivo-faltantes/.test(outlook), 'No existe el botón de correo masivo para faltantes.');
assert(/NO_ENVIADO/.test(outlookUi), 'El correo no limita los destinatarios a estudiantes que no han enviado.');
assert(/MASS_BATCH_SIZE\s*=\s*50/.test(outlookUi), 'El correo masivo no limita cada borrador a 50 direcciones.');
assert(/MAX_OUTLOOK_URL_LENGTH\s*=\s*7000/.test(outlookUi), 'El correo masivo no controla el tamaño del enlace de Outlook.');
assert(/ad-mail-mass-confirm/.test(mailCode), 'El correo masivo no solicita confirmación antes de preparar borradores.');
assert(/if\(selectedPeriod&&texto\(data\.periodoId\)!==selectedPeriod\)return\[\]/.test(outlookUi), 'La lista podría usar datos de un período distinto al seleccionado.');
assert(/gruposUnicosPorEstudiante/.test(outlookUi), 'Los correos de un mismo estudiante podrían separarse entre borradores.');
assert(/crearLotesSeguros/.test(outlookUi) && /tooLong/.test(outlookUi), 'Los borradores no se dividen de forma segura por cantidad y longitud.');
assert(/batches:summary\.batches\.map/.test(outlookUi), 'La sesión no conserva los lotes seguros calculados.');
assert(/institucionales:\s*institucionales/.test(outlookUi) && /personales:\s*personales/.test(outlookUi), 'La interfaz no separa correos institucionales y personales.');
assert(/copiar-correos-institucionales/.test(outlookUi), 'No existe el botón para copiar correos institucionales.');
assert(/copiar-correos-personales/.test(outlookUi), 'No existe el botón para copiar correos personales.');
assert(/copiar-todos-correos/.test(outlookUi), 'No existe el botón para copiar todos los correos.');
assert(/ad-mail-address-list/.test(outlookUi), 'No existe una vista previa visible de las direcciones.');
assert(/abrirCorreo\(\{to:batch,subject:session\.subject,body:session\.body\}\)/.test(outlookUi), 'El correo masivo no coloca los destinatarios en Para.');
assert(/to='\+encodeURIComponent\(to\.join\(';'\)\)/.test(outlookUi), 'El enlace de Outlook no incluye los destinatarios en Para.');
assert(/actualizarResumenModal/.test(outlookUi), 'El modal no actualiza el número real de borradores y destinatarios.');
assert(/destinatarios podrán ver las demás direcciones/.test(outlookUi), 'La interfaz no advierte que los destinatarios verán las direcciones en Para.');
assert(/Ctrl \+ V/.test(outlookUi) && /campo Para/.test(outlookUi), 'La interfaz no ofrece el pegado manual en Para como respaldo.');
assert(/Sin permisos especiales/.test(outlookUi), 'La interfaz no deja claro que no requiere permisos administrativos.');
assert(/window\.ADMailMassV2=true/.test(outlookUi) && /stopImmediatePropagation/.test(outlookUi), 'La corrección no bloquea la apertura antigua del borrador defectuoso.');
assert(/admin-clipboard:write/.test(main) && /clipboard\.writeText/.test(main), 'Electron no copia los correos mediante un canal seguro.');
assert(/admin-outlook:open-compose/.test(main), 'Electron no abre Outlook mediante un canal seguro.');
assert(/clipboard:\s*Object\.freeze/.test(preload) && /outlook:\s*Object\.freeze/.test(preload), 'El preload no expone copia y apertura de Outlook.');
assert(/outlook\.office\.com\/mail\/deeplink\/compose/.test(outlookUi), 'La interfaz no abre el compositor de Outlook Web.');
assert(!/bcc='\+encodeURIComponent/.test(outlookUi), 'La interfaz todavía depende del parámetro CCO que Outlook ignora.');
assert(!/Tenant ID|Client ID|Mail\.ReadWrite|graphBridge/.test(outlookUi), 'La interfaz todavía solicita configuración o permisos de Microsoft Graph.');
assert(!packageJson.dependencies || !packageJson.dependencies['@azure/msal-node'], 'El proyecto todavía instala MSAL sin necesitarlo.');
assert(!fs.existsSync('electron/administrador/microsoft-graph.cjs'), 'El servicio de Microsoft Graph todavía existe.');

if (errors.length) {
  console.error('\n[Outlook] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}
console.log('[Outlook] Correcto: correos institucionales y personales visibles, agrupados de forma segura y colocados en Para.');
