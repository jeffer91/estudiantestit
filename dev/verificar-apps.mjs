import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

function read(relativePath) {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push('No existe: ' + relativePath);
    return '';
  }
  return fs.readFileSync(absolutePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function localAssets(htmlPath) {
  const html = read(htmlPath);
  const directory = path.dirname(htmlPath);
  const assets = [];
  const regex = /<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = regex.exec(html))) {
    const raw = String(match[1] || '').trim();
    if (!raw || /^(?:https?:|data:|#|\/\/)/i.test(raw)) continue;
    const clean = raw.split(/[?#]/)[0];
    assets.push(path.normalize(path.join(directory, clean)));
  }
  return { html, assets };
}

function checkAssets(htmlPath) {
  const result = localAssets(htmlPath);
  result.assets.forEach((asset) => {
    assert(fs.existsSync(path.join(root, asset)), htmlPath + ' referencia un archivo inexistente: ' + asset);
  });
  return result.html;
}

function requireIds(html, ids, appName) {
  ids.forEach((id) => {
    const expression = new RegExp('id=["\\\']' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\\\']');
    assert(expression.test(html), appName + ' no contiene el elemento #' + id + '.');
  });
}

const studentHtml = checkAssets('estudiantes-mvp/estudiante.html');
const coordinatorHtml = checkAssets('coordinadores-mvp/coordinador.html');
const adminHtml = checkAssets('administrador/ad-index.html');

requireIds(studentHtml, [
  'formConsulta', 'cedulaInput', 'estadoPrincipal', 'formTelegram', 'telegramInput',
  'formPropuestas', 'formEnvio', 'confirmacionEnvio', 'estadoEnvioFinal'
], 'Estudiantes');
requireIds(coordinatorHtml, [
  'periodoSelect', 'coordinadorSelect', 'estadoPrincipal', 'tablaEstudiantesBody',
  'detalleModal', 'tituloFinalInput', 'comentarioCoordinadorInput', 'btnAprobarEnvio', 'btnDevolverEnvio'
], 'Coordinadores');
requireIds(adminHtml, [
  'ad-loading', 'ad-seccion-estado', 'ad-periodo-select', 'ad-tabla-periodos',
  'ad-form-estudiante', 'ad-form-coordinador', 'ad-form-asignacion', 'ad-tabla-titulos',
  'ad-form-devolver', 'ad-form-ia', 'ad-diagnostico-salida'
], 'Administrador');

const adminApi = read('administrador/ad-js/ad-api.service.js');
const coordinatorBootstrap = read('coordinadores-mvp/js/coordinador.bootstrap.independiente.js');
const studentRequirements = read('estudiantes-mvp/js/requisitos.estudiantes.service.js');
const studentSheets = read('estudiantes-mvp/js/sheets.service.js');
const studentReview = read('estudiantes-mvp/js/estudiante.consulta.revision.js');
const studentApp = read('estudiantes-mvp/js/estudiante.app.js');
const accessApi = read('functions/api/acceso-estudiante.js');
const requirementsApi = read('functions/api/requisitos.js');
const studentBuild = read('dev/preparar-pages-estudiantes.mjs');
const localBuild = read('dev/preparar-pages-local.mjs');
const appsScript = read('apps-script/RESPALDO-TITULOS-APP/consulta-estudiantes.gs');

assert(/API_PUBLICA\s*=\s*['"]https:\/\/titulos\.pages\.dev['"]/.test(adminApi), 'Administrador no apunta a la API central en producción.');
assert(/https:\/\/titulos-coordinadores\.pages\.dev/.test(coordinatorBootstrap), 'Coordinadores no apunta a su API oficial en producción.');
assert(/127\.0\.0\.1:8788/.test(adminApi), 'Administrador no apunta al proxy local 8788 durante desarrollo.');
assert(/127\.0\.0\.1:8788/.test(coordinatorBootstrap), 'Coordinadores no apunta al proxy local 8788 durante desarrollo.');
assert(/\/api\/requisitos/.test(studentRequirements), 'Estudiantes no consulta la API de Requisitos.');
assert(/\/api\/titulos/.test(studentSheets), 'Estudiantes no utiliza la API de Títulos.');
assert(/\/api\/acceso-estudiante/.test(studentReview), 'La consulta inicial de Estudiantes no utiliza la API unificada.');
assert(/abrirModalConsulta\(\)/.test(studentReview), 'El modal de consulta no se abre inmediatamente.');
assert(/parsearCapasJson/.test(studentReview), 'El frontend no procesa respuestas JSON anidadas.');
assert(/Promise\.allSettled/.test(accessApi), 'La API unificada no ejecuta consultas paralelas.');
assert(/CONSULTAR_ENVIO_BASE_CEDULA/.test(accessApi), 'La API unificada no consulta Envios de forma independiente.');
assert(/CONSULTAR_RESOLUCION_CEDULA/.test(accessApi), 'La API unificada no consulta Resoluciones de forma independiente.');
assert(/CONSULTAR_ENVIO_CEDULA/.test(accessApi), 'La API unificada no conserva el fallback de compatibilidad.');
assert(!/legacyPromise/.test(accessApi), 'La compatibilidad antigua todavía se inicia en todas las consultas.');
assert(/Fallback único y condicional/.test(accessApi), 'La compatibilidad no está limitada a un fallback condicional.');
assert(/periodEquivalent/.test(accessApi), 'La API unificada no compara etiquetas e identificadores de período.');
assert(/origen:\s*['"]RESOLUCIONES['"]/.test(accessApi), 'Resoluciones no tiene la mayor jerarquía.');
assert(/origen:\s*['"]ENVIOS['"]/.test(accessApi), 'Envíos no tiene la segunda jerarquía.');
assert(/origen:\s*['"]REQUISITOS['"]/.test(accessApi), 'Requisitos no tiene la tercera jerarquía.');
assert(/scope:\s*periodId\s*\?\s*['"]period['"]\s*:\s*['"]all['"]/.test(requirementsApi), 'La consulta sin período no busca en todos los períodos activos.');
assert(!/firebase\.core\.service|firebase\.estudiantes\.service|firebase\.envios\.service|firebase\.ia\.service/i.test(studentHtml), 'Estudiantes todavía carga scripts Firebase eliminados.');
assert(!/ad-firebase\.service/i.test(adminHtml), 'Administrador todavía carga el servicio Firebase eliminado.');
assert(!/estudiante\.resolucion\.patch|estudiante\.consulta\.optimizada|estudiante\.devolucion\.runtime/i.test(studentHtml), 'Estudiantes todavía carga un controlador o parche antiguo.');
assert(!/optimizedScript|runtimeScript|insertar.*consulta|inyectar.*consulta/i.test(studentBuild), 'El build de Estudiantes todavía inserta controladores adicionales.');
assert(!/optimizedScript|runtimeScript|insertar.*consulta|inyectar.*consulta/i.test(localBuild), 'El build local todavía inserta controladores adicionales.');
assert(/LEGACY_SCRIPTS/.test(studentBuild), 'El build de Estudiantes no bloquea controladores antiguos.');
assert(/LEGACY_SCRIPTS/.test(localBuild), 'El build local no bloquea controladores antiguos.');
assert(!/createElement\(['"]script['"]\)[\s\S]*estudiante\.consulta\.revision/.test(studentRequirements), 'Requisitos vuelve a cargar dinámicamente el controlador de consulta.');
assert(!/formConsulta\.addEventListener[\s\S]*manejarConsulta/.test(studentApp), 'estudiante.app.js todavía registra un segundo controlador de consulta.');
assert(/No se envió al servidor/.test(studentApp), 'La contingencia local no diferencia un envío real de un respaldo local.');
assert(/CONSULTAR_ENVIO_BASE_CEDULA/.test(appsScript), 'El módulo Apps Script no expone la consulta separada de Envios.');
assert(/CONSULTAR_RESOLUCION_CEDULA/.test(appsScript), 'El módulo Apps Script no expone la consulta separada de Resoluciones.');

const studentOrder = [
  'requisitos.estudiantes.service.js',
  'titulos.cola.service.js',
  'sheets.service.js',
  'estudiante.app.js',
  'estudiante.consulta.revision.js'
].map((name) => studentHtml.indexOf(name));
assert(studentOrder.every((index) => index >= 0), 'Estudiantes no carga todos los servicios requeridos.');
assert(studentOrder.every((index, position) => position === 0 || index > studentOrder[position - 1]), 'Los servicios de Estudiantes están cargados en un orden incorrecto.');

if (errors.length) {
  console.error('\n[Apps] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}

console.log('[Apps] Estudiantes: controlador único, tres consultas iniciales, fallback condicional y jerarquía correctos.');
console.log('[Apps] Coordinadores: archivos, API y elementos principales correctos.');
console.log('[Apps] Administrador: archivos, API central y elementos principales correctos.');
