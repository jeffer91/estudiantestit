import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { coincidePeriodoTrabajo, esTrabajoTitulacion } from '../functions/_lib/trabajo-titulacion-unificado.js';

const root = process.cwd();
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

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

assert(
  esTrabajoTitulacion({
    id: '2026-02__2026-08__1723533988',
    migracionId: 'MIG_20260724053138',
    estado: 'DEVUELTO',
    resolucionActualId: '2026-02__2026-08__1723533988__r001__da588d97',
    observacion: 'Se debe delimitar el título',
    fechaResolucion: '2026-07-22T13:42:42.257Z'
  }),
  'Un Trabajo de Titulación histórico migrado sin tipoTrabajo no se reconoce.'
);
assert(
  !esTrabajoTitulacion({
    id: '2026-02__2026-08__0105566293',
    tipoTrabajo: 'ARTICULO_ACADEMICO',
    migracionId: 'MIG_ARTICULO'
  }),
  'Un artículo con tipo explícito está siendo confundido con Trabajo de Titulación.'
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

const historyEndpoint = read('functions/api/historial-titulos.js');
assert(
  /historialDisponible:\s*false/.test(historyEndpoint),
  'El historial informativo vuelve a responder con error fatal en lugar de degradarse.'
);

const publicHistory = read('estudiantes-mvp/js/titulos.historial.publico.js');
assert(
  /panel\.hidden=true/.test(publicHistory),
  'El frontend del historial no se oculta de forma segura cuando el historial falla.'
);

const titlesApi = read('functions/api/titulos.js');
assert(
  !/if\s*\(action\s*===\s*['"]ENVIO_ESTUDIANTE['"]\)\s*\{\s*const previous = await lookupEnvio/.test(titlesApi),
  'El proxy de Títulos vuelve a hacer una consulta previa obligatoria antes de escribir.'
);

const studentSheets = read('estudiantes-mvp/js/sheets.service.js');
assert(
  /if\s*\(previo\.ok\s*&&\s*previo\.encontrado/.test(studentSheets),
  'El frontend vuelve a bloquear el envío cuando la consulta previa falla.'
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
  /tipoTrabajo:\s*'ARTICULO_ACADEMICO'/.test(titlesV8),
  'Los nuevos artículos no quedan tipificados explícitamente.'
);

const workEndpoint = read('functions/api/trabajo-titulacion.js');
assert(
  /reutilizoEnvioHistorico/.test(workEndpoint),
  'Trabajo de Titulación no conserva explícitamente el registro histórico al reenviar.'
);
assert(
  /tipoTrabajo:\s*TIPO/.test(workEndpoint),
  'Trabajo de Titulación no tipifica el documento al guardar o resolver.'
);

if (errors.length) {
  console.error('\n[Compatibilidad histórica] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  console.error('');
  process.exit(1);
}

console.log('[Compatibilidad histórica] Períodos e IDs históricos son legibles.');
console.log('[Compatibilidad histórica] Trabajos migrados sin tipoTrabajo se reconocen sin pisar artículos explícitos.');
console.log('[Compatibilidad histórica] Historial degrada sin bloquear la pantalla.');
console.log('[Compatibilidad histórica] Lecturas auxiliares no bloquean el envío final.');
console.log('[Compatibilidad histórica] Reenvíos conservan el envioId existente y tipifican los nuevos registros.');
