import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  assert.ok(fs.existsSync(path), `No existe ${path}.`);
  return fs.readFileSync(path, 'utf8');
}

const services = read('administrador/ad-js/ad-servicios.app.js');
const performance = read('administrador/ad-js/ad-performance.patch.js');
const workAdmin = read('administrador/ad-js/ad-trabajo-titulacion-admin.patch.js');
const titleAdmin = read('administrador/ad-js/ad-titulos-admin.patch.js');
const resolutionCore = read('functions/_lib/titulos-firebase-v7-core.js');
const report = read('functions/_lib/firebase-titulos-report.js');
const build = read('dev/preparar-pages-administrador.mjs');
const electron = read('electron/administrador/main.cjs');

assert.match(
  electron,
  /administrador['"],\s*['"]ad-index\.html/,
  'Electron debe seguir abriendo la interfaz base del Administrador.'
);
assert.match(
  services,
  /ad-performance\.patch\.js/,
  'La interfaz base no carga la corrección de rendimiento.'
);
assert.match(
  services,
  /ad-trabajo-titulacion-admin\.patch\.js/,
  'La interfaz base no carga las acciones administrativas de Trabajo de Titulación.'
);
assert.match(
  services,
  /ad-titulos-admin\.patch\.js/,
  'La interfaz base no carga la corrección administrativa de títulos.'
);
assert.match(
  services,
  /data-ad-performance/,
  'La corrección de rendimiento no tiene protección contra carga duplicada.'
);
assert.match(
  services,
  /data-ad-trabajo-titulacion-admin/,
  'Trabajo de Titulación no tiene protección contra carga duplicada.'
);
assert.match(
  services,
  /data-ad-titulos-admin/,
  'La corrección administrativa de títulos no tiene protección contra carga duplicada.'
);
assert.doesNotMatch(
  build,
  /instalarComplementosAdministrador/,
  'El build todavía inyecta una segunda copia de los complementos.'
);
assert.match(
  build,
  /ad-servicios\.app\.js/,
  'El build no valida el cargador común de complementos.'
);
assert.match(
  build,
  /ad-titulos-admin\.patch\.js/,
  'El build no exige el complemento de corrección administrativa de títulos.'
);
assert.match(
  performance,
  /ADAdminGlobalLast=null/,
  'La corrección de rendimiento no descarta datos antiguos tras un error.'
);
assert.match(
  workAdmin,
  /ADMIN_QUITAR_ENVIO_TRABAJO_TITULACION/,
  'Las acciones administrativas de Trabajo de Titulación no están disponibles.'
);
assert.match(
  titleAdmin,
  /Aprobados/,
  'El filtro administrativo no identifica el grupo de aprobados.'
);
assert.match(
  titleAdmin,
  /current==='APROBADO'\|\|current==='REEMPLAZADO'/,
  'Aprobados debe incluir APROBADO y REEMPLAZADO.'
);
assert.match(
  titleAdmin,
  /data-admin-title-action="save-correction"/,
  'El detalle administrativo no ofrece guardar una corrección de título.'
);
assert.match(
  titleAdmin,
  /estado:'REEMPLAZADO'/,
  'Una corrección administrativa debe guardar el estado REEMPLAZADO.'
);
assert.match(
  titleAdmin,
  /tituloElegido:current/,
  'La corrección administrativa debe conservar como referencia el título anterior.'
);
assert.match(
  titleAdmin,
  /tituloCorregido:corrected/,
  'La corrección administrativa debe enviar el nuevo título como tituloCorregido.'
);
assert.match(
  resolutionCore,
  /RESOLUTION_STATES = new Set\(\['APROBADO', 'REEMPLAZADO', 'DEVUELTO'\]\)/,
  'El backend no admite REEMPLAZADO como resolución válida.'
);
assert.match(
  resolutionCore,
  /collection: 'resoluciones'/,
  'El backend debe conservar cada corrección en el historial de resoluciones.'
);
assert.doesNotMatch(
  report,
  /migrarTrabajosTitulacionLegados/,
  'Generar el PDF no debe ejecutar migraciones ni escrituras.'
);
assert.doesNotMatch(
  report,
  /Promise\.all\(COLLECTIONS/,
  'El PDF no debe abrir todas las lecturas de Firebase en paralelo.'
);
assert.match(
  report,
  /for \(const \[name, limit\] of COLLECTIONS\)/,
  'El PDF debe leer las colecciones de forma secuencial.'
);
assert.match(
  report,
  /coleccionesTruncadas/,
  'El PDF debe informar si una colección excede el límite seguro.'
);

console.log('[Administrador runtime] Aprobados agrupados, corrección de títulos con historial, complementos compartidos y reporte seguro.');
