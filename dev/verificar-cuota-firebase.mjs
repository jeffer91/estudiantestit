import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const errors = [];

function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) {
    errors.push(`No existe: ${relativePath}`);
    return '';
  }
  return fs.readFileSync(absolute, 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

const admin = read('administrador/ad-js/ad-google-sheets.app.js');
const coordinatorHtml = read('coordinadores-mvp/coordinador.html');
const coordinatorBootstrap = read('coordinadores-mvp/js/coordinador.bootstrap.independiente.js');
const coordinator = read('coordinadores-mvp/js/coordinador.app.js');
const coordinatorApi = read('coordinadores-mvp/js/coordinador.sheets.primary.js');
const coordinatorWrapper = read('coordinadores-mvp/js/coordinador.envios.carreras.js');
const titlesV6 = read('functions/_lib/titulos-firebase-v6.js');
const titlesV7 = read('functions/_lib/titulos-firebase-v7.js');
const history = read('functions/_lib/titulos-historial.js');
const historyApi = read('functions/api/historial-titulos.js');
const workApi = read('functions/api/trabajo-titulacion.js');
const localBuilder = read('dev/preparar-pages-local.mjs');
const adminGlobalV5 = read('functions/_lib/admin-global-v5.js');
const adminGlobalV6 = read('functions/_lib/admin-global-v6.js');
const unifiedWork = read('functions/_lib/trabajo-titulacion-unificado.js');
const requisitos = read('functions/_lib/requisitos-firebase-fixed.js');

assert(
  !/listarTitulos\(\{\s*carreras:\s*['"]['"]\s*,\s*carrera:\s*['"]['"]\s*,\s*estado:\s*['"]['"]\s*,\s*periodo:\s*['"]['"]\s*\}\)/.test(admin),
  'El Administrador vuelve a pedir todos los títulos sin período.'
);
assert(
  /listarTitulos\(\{[^}]*periodoId:\s*periodo\.id[^}]*periodo:/.test(admin),
  'El Administrador no consulta los títulos por el período seleccionado.'
);
assert(
  /return cargarTitulos\(\)/.test(admin) && /Promise\.allSettled\(\[cargarPeriodos\(\),cargarCoordinadores\(\),cargarIA\(\)\]\)/.test(admin),
  'El Administrador no espera el catálogo de períodos antes de cargar títulos.'
);

assert(
  /principalPeriodValues/.test(titlesV6) && /payload\.incluirTodos \|\| payload\.todas/.test(titlesV6),
  'Firebase Títulos no protege las consultas sin filtros con el período principal.'
);
assert(
  /role === ['"]coordinator['"] && !careers\.length && !hasOtherFilter/.test(titlesV6),
  'Un coordinador sin carreras todavía podría disparar una lectura global.'
);
assert(
  /listCollection\('TITULOS', 'envios', \{ maxDocuments: 5000 \}, env\)/.test(titlesV6),
  'No se identificó la única ruta explícita autorizada para un resumen global.'
);

assert(
  /queryEqual\([\s\S]*'resoluciones'[\s\S]*'envioId'/.test(titlesV7),
  'El historial anterior no se consulta por envioId.'
);
assert(
  !/listCollection\([\s\S]*'resoluciones'/.test(titlesV7),
  'El historial de coordinadores vuelve a leer toda la colección resoluciones.'
);
assert(
  /principalPeriodValues/.test(titlesV7) && /queryRowsByPeriod/.test(titlesV7) &&
  /compatibilidadAcotadaPorPeriodo:\s*true/.test(titlesV7),
  'La compatibilidad de carreras no está acotada al período solicitado o principal.'
);
assert(
  !/(?:listCollection|listEnviosCollection)\('TITULOS',\s*'envios',\s*\{\s*maxDocuments:\s*5000/.test(titlesV7),
  'La capa final de Coordinadores todavía puede leer 5.000 envíos para resolver una carrera.'
);

assert(
  /queryEqual\('TITULOS',\s*'versiones_envio',\s*'envioId'/.test(history) &&
  /queryEqual\('TITULOS',\s*'resoluciones',\s*'envioId'/.test(history),
  'El historial completo no consulta versiones y resoluciones por envioId.'
);
assert(
  /ensureCurrentVersion/.test(history) && /ensureCurrentResolution/.test(history),
  'El historial no recupera una versión o resolución actual cuando falta el documento hijo.'
);
assert(
  /consultarHistorialTitulos/.test(historyApi),
  'No existe el endpoint independiente del historial.'
);

assert(
  /commitDocuments\('TITULOS',\s*\[/.test(workApi) &&
  /collection:\s*COLECCION_VERSIONES/.test(workApi) &&
  /collection:\s*COLECCION_RESOLUCIONES/.test(workApi),
  'Trabajo de Titulación no guarda el envío y su historial de forma atómica.'
);
assert(
  /carreraClave:\s*claveCarrera/.test(workApi),
  'Trabajo de Titulación no guarda la clave normalizada de la carrera.'
);
assert(
  /Number\(previous && previous\.versionActual \|\| 0\)/.test(workApi) &&
  /Number\(envio\.numeroRevisiones \|\| 0\)/.test(workApi),
  'Los contadores de Trabajo de Titulación podrían repetirse si faltó un documento histórico.'
);

assert(
  /HISTORY_FILE/.test(localBuilder) &&
  /prepararTrabajoLocal\(\)/.test(localBuilder) &&
  /injectScript\(html, HISTORY_FILE\)/.test(localBuilder),
  'El entorno local no carga el historial en Artículos y Trabajo de Titulación.'
);

assert(
  /queryEqual\([\s\S]*COLECCION_ENVIOS[\s\S]*'tipoTrabajo'[\s\S]*TIPO_TRABAJO_TITULACION/.test(unifiedWork),
  'Trabajo de Titulación no consulta envíos mediante el campo tipoTrabajo.'
);
assert(
  !/listarTrabajosTitulacionUnificados[\s\S]{0,400}listCollection\([\s\S]{0,160}COLECCION_ENVIOS/.test(unifiedWork),
  'Trabajo de Titulación vuelve a recorrer toda la colección envios.'
);
assert(
  /ENABLE_LEGACY_TITULOS_MIGRATION/.test(unifiedWork) && /MIGRACION_LEGADA_DESACTIVADA/.test(unifiedWork),
  'La migración histórica ya no está protegida por activación explícita.'
);

assert(
  /queryPeriodRows\('UTET', 'EstudiantesPeriodo'/.test(adminGlobalV5) &&
  /queryPeriodRows\('TITULOS', 'envios'/.test(adminGlobalV5),
  'Las estadísticas no consultan UTET y envíos por período.'
);
assert(
  !/listCollection\('UTET', 'EstudiantesPeriodo', \{ maxDocuments: 10000 \}/.test(adminGlobalV5),
  'Las estadísticas vuelven a leer EstudiantesPeriodo completo.'
);
assert(
  /segundaLecturaEnviosEliminada:\s*true/.test(adminGlobalV6),
  'La capa final del Administrador no confirma la eliminación de la segunda lectura de envíos.'
);

assert(
  /coordinador\.bootstrap\.independiente\.js/.test(coordinatorHtml) &&
  /coordinador\.envios\.carreras\.js/.test(coordinatorBootstrap),
  'La prueba no está siguiendo la cadena real de módulos cargados por Coordinadores.'
);
assert(
  /listarEnvios\(\{forzar:forzar===true,carreras:coordinador\.carreras\|\|\[\]\}\)/.test(coordinator),
  'Coordinadores no consulta únicamente sus carreras asignadas.'
);
assert(
  !/incluirTodos:\s*['"]?true['"]?/.test(coordinatorApi),
  'El servicio principal de Coordinadores vuelve a solicitar todos los envíos.'
);
assert(
  !/incluirTodos\s*:\s*['"]?true['"]?/.test(coordinatorWrapper) &&
  !/todas\s*:\s*['"]?true['"]?/.test(coordinatorWrapper),
  'Un módulo cargado después del servicio principal vuelve a solicitar todos los envíos.'
);
assert(
  /listarOriginal\(opciones\)/.test(coordinatorWrapper),
  'El módulo de compatibilidad de Coordinadores no conserva los filtros originales.'
);
assert(
  /!carreras\.length&&!periodo/.test(coordinatorWrapper),
  'El módulo activo de Coordinadores permite consultas sin carrera ni período.'
);

assert(
  /const includePeriods = scope === 'periods' \|\| scope === 'all'/.test(requisitos) &&
  /const includeCareers = scope !== 'periods'/.test(requisitos),
  'Requisitos vuelve a leer períodos y carreras aunque solo se solicite un catálogo.'
);
assert(
  /includePeriods \? listTitlePeriods\(env\) : Promise\.resolve\(\[\]\)/.test(requisitos),
  'La consulta de carreras todavía vuelve a descargar el catálogo de períodos.'
);

if (errors.length) {
  console.error('\n[Cuota Firebase] Se encontraron riesgos:\n');
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  console.error('');
  process.exit(1);
}

console.log('[Cuota Firebase] Administrador consulta títulos por período.');
console.log('[Cuota Firebase] Toda la cadena activa de Coordinadores conserva los filtros.');
console.log('[Cuota Firebase] Compatibilidad de carreras acotada al período y sin lectura global.');
console.log('[Cuota Firebase] Historial completo consultado por envioId y con recuperación segura.');
console.log('[Cuota Firebase] Trabajo de Titulación guarda historial atómico y carrera normalizada.');
console.log('[Cuota Firebase] Requisitos evita lecturas duplicadas de catálogos.');
console.log('[Cuota Firebase] Migraciones automáticas y dobles lecturas permanecen bloqueadas.');
