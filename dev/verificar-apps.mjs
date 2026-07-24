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
  'ad-loading', 'ad-seccion-estado', 'ad-seccion-periodos', 'ad-seccion-carreras',
  'ad-seccion-coordinadores', 'ad-seccion-titulos', 'ad-seccion-estadisticas',
  'ad-form-coordinador', 'ad-form-ia', 'ad-diagnostico-salida'
], 'Administrador');

const adminApi = read('administrador/ad-js/ad-api.service.js');
const adminApp = read('administrador/ad-js/ad-google-sheets.app.js');
const adminGlobalApp = read('administrador/ad-js/ad-administracion-global.js');
const coordinatorBootstrap = read('coordinadores-mvp/js/coordinador.bootstrap.independiente.js');
const studentRequirements = read('estudiantes-mvp/js/requisitos.estudiantes.service.js');
const studentSheets = read('estudiantes-mvp/js/sheets.service.js');
const studentReview = read('estudiantes-mvp/js/estudiante.consulta.revision.js');
const studentReviewCss = read('estudiantes-mvp/css/estudiante.consulta.revision.css');
const studentApp = read('estudiantes-mvp/js/estudiante.app.js');
const accessApi = read('functions/api/acceso-estudiante.js');
const requirementsApi = read('functions/api/requisitos.js');
const statisticsApi = read('functions/api/estadisticas.js');
const globalService = read('functions/_lib/admin-global.js');
const studentBuild = read('dev/preparar-pages-estudiantes.mjs');
const coordinatorBuild = read('dev/preparar-pages-coordinadores.mjs');
const adminBuild = read('dev/preparar-pages-administrador.mjs');
const localBuild = read('dev/preparar-pages-local.mjs');

assert(/window\.location&&window\.location\.origin/.test(adminApi), 'Administrador no usa su API del mismo dominio.');
assert(/titulos-administrador\.pages\.dev/.test(adminApi), 'Administrador no tiene dominio oficial de respaldo.');
assert(/\/api\/estadisticas/.test(adminApi), 'Administrador no consulta el endpoint administrativo global.');
assert(/listarTitulosGlobal/.test(adminApi) && /listarPeriodosAdmin/.test(adminApi), 'Administrador no expone lista global y períodos completos.');
assert(/ad-administracion-global\.js/.test(adminApi), 'No se carga el controlador administrativo global.');
assert(/ADMIN_LISTA_GLOBAL_TITULOS/.test(statisticsApi), 'La API no ofrece la lista global de títulos.');
assert(/ADMIN_LISTAR_PERIODOS/.test(statisticsApi) && /ADMIN_GUARDAR_PERIODO/.test(statisticsApi), 'La API no administra períodos.');
assert(/ADMIN_ASIGNAR_CARRERA_COORDINADOR/.test(statisticsApi), 'La API no asigna carreras a coordinadores.');
assert(/EstudiantesPeriodo/.test(globalService) && /envios/.test(globalService), 'La lista global no combina UTET y Títulos.');
assert(/NO_ENVIADO/.test(globalService) && /fueraPoblacion/.test(globalService), 'La lista global no distingue faltantes o registros externos.');
assert(/coordinadorId/.test(globalService) && /carrerasIds/.test(globalService), 'La relación carrera-coordinador no mantiene compatibilidad.');
assert(/toggle-period/.test(adminGlobalApp) && /principal-period/.test(adminGlobalApp), 'Administrador no permite activar o definir el período principal.');
assert(/data-v2-career-select/.test(adminGlobalApp), 'Carreras no permite asignar coordinadores.');
assert(/NO_ENVIADO/.test(adminGlobalApp) && /outlook\.office\.com/.test(adminGlobalApp) && /wa\.me/.test(adminGlobalApp), 'Títulos no incluye no enviados, Outlook y WhatsApp.');
assert(/delete-detail/.test(adminGlobalApp) && /return-detail/.test(adminGlobalApp), 'El modal no permite devolver o eliminar.');
assert(/role\(context\.request\) !== 'admin'/.test(statisticsApi), 'Las operaciones globales no están restringidas al administrador.');
assert(!/ad-seccion-devolver|ad-form-devolver/.test(adminHtml), 'Administrador todavía conserva la pantalla separada de devolución.');
assert(/https:\/\/titulos-coordinadores\.pages\.dev/.test(coordinatorBootstrap), 'Coordinadores no apunta a su dominio oficial.');
assert(/127\.0\.0\.1:8788/.test(adminApi), 'Administrador no apunta al entorno local 8788.');
assert(/127\.0\.0\.1:8788/.test(coordinatorBootstrap), 'Coordinadores no apunta al entorno local 8788.');
assert(/\/api\/requisitos/.test(studentRequirements), 'Estudiantes no consulta la API de Requisitos.');
assert(/\/api\/titulos/.test(studentSheets), 'Estudiantes no utiliza la API de Títulos.');
assert(/\/api\/acceso-estudiante/.test(studentReview), 'La consulta inicial de Estudiantes no utiliza la API unificada.');
assert(/abrirModalConsulta\(\)/.test(studentReview), 'El modal de consulta no se abre inmediatamente.');
assert(/parsearCapasJson/.test(studentReview), 'El frontend no procesa respuestas JSON anidadas.');
assert(/Promise\.allSettled/.test(accessApi), 'La API unificada no ejecuta las consultas en paralelo.');
assert(/periodoId:\s*periodId/.test(accessApi), 'La API unificada no asigna correctamente periodoId.');
assert(/periodoLabel:\s*periodLabel/.test(accessApi), 'La API unificada no asigna correctamente periodoLabel.');
assert(/CONSULTAR_ENVIO_CEDULA/.test(accessApi), 'La API unificada no usa el flujo de Títulos.');
assert(/periodEquivalent/.test(accessApi), 'La API unificada no compara etiquetas e identificadores de período.');
assert(/origen:\s*['"]RESOLUCIONES['"]/.test(accessApi), 'Resoluciones no tiene la mayor jerarquía.');
assert(/origen:\s*['"]ENVIOS['"]/.test(accessApi), 'Envíos no tiene la segunda jerarquía.');
assert(/origen:\s*['"]REQUISITOS['"]/.test(accessApi), 'Requisitos no tiene la tercera jerarquía.');
assert(/#modalConsultaTitulos\s*\{[\s\S]*display:\s*none\s*!important/.test(studentReviewCss), 'El modal histórico de consulta no está desactivado.');
assert(/scope:\s*periodId\s*\?\s*['"]period['"]\s*:\s*['"]all['"]/.test(requirementsApi), 'La consulta sin período no busca en todos los períodos activos.');
assert(!/firebase\.core\.service|firebase\.estudiantes\.service|firebase\.envios\.service|firebase\.ia\.service/i.test(studentHtml), 'Estudiantes todavía carga scripts Firebase directos eliminados.');
assert(!/ad-firebase\.service/i.test(adminHtml), 'Administrador todavía carga un servicio Firebase directo.');
assert(!/estudiante\.resolucion\.patch|estudiante\.consulta\.optimizada|estudiante\.devolucion\.runtime/i.test(studentHtml), 'Estudiantes todavía carga un controlador antiguo.');
assert(!/optimizedScript|runtimeScript|insertar.*consulta|inyectar.*consulta/i.test(studentBuild + localBuild), 'Un build todavía inserta controladores adicionales.');
assert(/LEGACY_SCRIPTS/.test(studentBuild) && /LEGACY_SCRIPTS/.test(localBuild), 'Los builds no bloquean controladores antiguos.');
assert(/VERSION\s*=\s*['"]2\.4\.3['"]/.test(studentBuild), 'El build de Estudiantes no usa la versión validada 2.4.3.');
assert(/VERSION_ESTUDIANTES\s*=\s*['"]2\.4\.3['"]/.test(localBuild), 'El build local no usa la versión validada 2.4.3.');
assert(!/createElement\(['"]script['"]\)[\s\S]*estudiante\.consulta\.revision/.test(studentRequirements), 'Requisitos vuelve a cargar dinámicamente el controlador de consulta.');
assert(!/formConsulta\.addEventListener[\s\S]*manejarConsulta/.test(studentApp), 'estudiante.app.js todavía registra un segundo controlador de consulta.');
assert(/No se envió al servidor/.test(studentApp), 'La contingencia local no diferencia un envío real de un respaldo local.');
assert(/\.pages-coordinadores/.test(coordinatorBuild), 'No existe build independiente de Coordinadores.');
assert(/\.pages-administrador/.test(adminBuild), 'No existe build independiente de Administrador.');

if (errors.length) {
  console.error('\n[Apps] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}

console.log('[Apps] Estudiantes: consulta, envío y revisión integrados mediante Cloudflare Functions.');
console.log('[Apps] Coordinadores: dominio, períodos activos y carreras asignadas correctos.');
console.log('[Apps] Administrador: períodos completos, carreras, lista global y estadísticas unificadas.');
