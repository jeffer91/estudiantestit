import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { coincidePeriodoTrabajo } from '../functions/_lib/trabajo-titulacion-unificado.js';

const root = process.cwd();
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

/* Formatos de período e IDs observados en la base histórica. */
assert(
  coincidePeriodoTrabajo(
    { id: '2026-02__2026-08__0105566293', periodoId: '2026-02__2026-08' },
    'Febrero 2026 a Agosto 2026'
  ),
  'No se reconoce el formato de rango completo 2026-02__2026-08__cedula.'
);
assert(
  coincidePeriodoTrabajo(
    { id: '2026-02__2000129706', periodoId: '2026-02' },
    'Febrero 2026 a Agosto 2026'
  ),
  'No se reconoce el formato histórico 2026-02__cedula contra el rango Febrero-Agosto.'
);
assert(
  coincidePeriodoTrabajo(
    {
      id: '2026-10__1752222404__trabajo_titulacion',
      periodoId: '2026-10',
      periodoNombre: 'Octubre 2025 a Marzo 2026'
    },
    ['2026-10', 'Octubre 2025 a Marzo 2026']
  ),
  'No se reconoce el formato institucional de Trabajo de Titulación.'
);
assert(
  !coincidePeriodoTrabajo(
    { periodoId: '2026-10', periodoNombre: 'Octubre 2025 a Marzo 2026' },
    'Abril 2026 a Septiembre 2026'
  ),
  'La compatibilidad de períodos está mezclando períodos distintos.'
);

const historyBackend = read('functions/_lib/titulos-historial.js');
assert(
  /coordinador:\s*coordinator/.test(historyBackend),
  'El historial conserva el ReferenceError coordinador is not defined.'
);
assert(
  /Promise\.allSettled/.test(historyBackend),
  'El historial vuelve a fallar por completo si una colección auxiliar no responde.'
);
assert(
  /coincidePeriodoTrabajo/.test(historyBackend),
  'El historial no usa la compatibilidad de períodos históricos.'
);

const publicHistory = read('estudiantes-mvp/js/titulos.historial.publico.js');
assert(
  /data-history-loaded','error'/.test(publicHistory),
  'El frontend del historial no marca los errores como resueltos temporalmente.'
);
assert(
  /data-history-retry/.test(publicHistory),
  'El frontend no ofrece reintento manual después de un fallo.'
);
assert(
  /loaded==='true'\|\|loaded==='error'/.test(publicHistory),
  'El MutationObserver puede volver a disparar un bucle infinito después de un error.'
);

const titlesV8 = read('functions/_lib/titulos-firebase-v8.js');
assert(
  /normalized === 'ENVIO_ESTUDIANTE'/.test(titlesV8) && /saveCompatibleStudentSubmission/.test(titlesV8),
  'El reenvío de Artículo Académico no usa la ruta compatible.'
);
assert(
  /const id = rowId\(previous\) \|\| newArticleId/.test(titlesV8),
  'El reenvío no conserva el envioId histórico existente.'
);
assert(
  /periodoCanonicoId/.test(titlesV8),
  'Los nuevos reenvíos no guardan una referencia canónica de período sin renombrar el documento.'
);

if (errors.length) {
  console.error('\n[Compatibilidad histórica] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  console.error('');
  process.exit(1);
}

console.log('[Compatibilidad histórica] IDs cortos, rangos completos y Trabajo de Titulación son legibles.');
console.log('[Compatibilidad histórica] Historial tolera datos parciales y no entra en reintentos infinitos.');
console.log('[Compatibilidad histórica] Reenvíos conservan el envioId existente.');
