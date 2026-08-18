import assert from 'node:assert/strict';
import fs from 'node:fs';

function read(path) {
  assert.ok(fs.existsSync(path), `No existe ${path}.`);
  return fs.readFileSync(path, 'utf8');
}

const services = read('administrador/ad-js/ad-servicios.app.js');
const performance = read('administrador/ad-js/ad-performance.patch.js');
const workAdmin = read('administrador/ad-js/ad-trabajo-titulacion-admin.patch.js');
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
  /data-ad-performance/,
  'La corrección de rendimiento no tiene protección contra carga duplicada.'
);
assert.match(
  services,
  /data-ad-trabajo-titulacion-admin/,
  'Trabajo de Titulación no tiene protección contra carga duplicada.'
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
  performance,
  /ADAdminGlobalLast=null/,
  'La corrección de rendimiento no descarta datos antiguos tras un error.'
);
assert.match(
  workAdmin,
  /ADMIN_QUITAR_ENVIO_TRABAJO_TITULACION/,
  'Las acciones administrativas de Trabajo de Titulación no están disponibles.'
);

console.log('[Administrador runtime] Web y Electron comparten los mismos complementos sin duplicarlos.');
