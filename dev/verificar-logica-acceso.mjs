import assert from 'node:assert/strict';
import { __test as accessTest } from '../functions/api/acceso-estudiante.js';
import { __test as firebaseTest } from '../functions/_lib/requisitos-firebase-fast.js';
import { __test as sheetsTest } from '../functions/_lib/requisitos-sheets-fallback.js';

const cedula = '1313244988';

assert.equal(accessTest.normalizeCedula(cedula), cedula);
assert.equal(accessTest.normalizeCedula('131-324-4988'), cedula);
assert.equal(accessTest.normalizeCedula('123'), '');

const firebaseDocument = {
  numeroIdentificacion: cedula,
  Nombres: 'MACIAS REZABALA ERICK ALEXANDER',
  payloadJson: JSON.stringify({
    NombreCarrera: 'PROCESAMIENTO EN ALIMENTOS',
    periodoId: '2025-11__2026-05',
    periodoLabel: 'Noviembre 2025 a Mayo 2026'
  })
};

const normalizedFirebase = firebaseTest.minimumStudent(firebaseDocument, cedula, false);
assert.equal(normalizedFirebase.complete, true);
assert.equal(normalizedFirebase.student.Nombres, 'MACIAS REZABALA ERICK ALEXANDER');
assert.equal(normalizedFirebase.student.NombreCarrera, 'PROCESAMIENTO EN ALIMENTOS');
assert.equal(normalizedFirebase.student.periodoId, '2025-11__2026-05');
assert.equal(accessTest.completeAcademic({
  encontrado: true,
  estudiante: normalizedFirebase.student
}), true);

const normalizedSheets = sheetsTest.normalizeFastStudent({
  ok: true,
  encontrado: true,
  estudiante: {
    cedula,
    Nombres: 'MACIAS REZABALA ERICK ALEXANDER',
    NombreCarrera: 'PROCESAMIENTO EN ALIMENTOS',
    periodoId: '2025-11__2026-05',
    periodoLabel: 'Noviembre 2025 a Mayo 2026'
  }
}, cedula);

assert.equal(normalizedSheets.encontrado, true);
assert.equal(normalizedSheets.datosCompletos, true);
assert.equal(normalizedSheets.fuente, 'GOOGLE_SHEETS_ESTUDIANTES');

const pending = accessTest.normalizeTitles({
  ok: true,
  existe: true,
  tieneEnvio: true,
  estado: 'PENDIENTE_REVISION',
  envio: {
    id: '2025-11__2026-05__1313244988',
    cedula,
    estado: 'PENDIENTE_REVISION',
    titulo1: 'pr 1',
    titulo2: 'pr 2',
    titulo3: 'pr 3'
  }
});
assert.equal(pending.tieneEnvio, true);
assert.equal(pending.estado, 'PENDIENTE_REVISION');
assert.equal(pending.permiteReenvio, false);

const returned = accessTest.normalizeTitles({
  ok: true,
  existe: true,
  tieneEnvio: true,
  estado: 'DEVUELTO',
  envio: {
    id: '2025-11__2026-05__1313244988',
    cedula,
    estado: 'DEVUELTO',
    titulo1: 'pr 1',
    titulo2: 'pr 2',
    titulo3: 'pr 3',
    coordinador: 'Mayra Molina',
    observacion: 'Debe corregir las propuestas.',
    fechaResolucion: '2026-07-24T17:00:00.000Z',
    resolucionActualId: 'resolucion_1'
  }
});
assert.equal(returned.tieneEnvio, true);
assert.equal(returned.tieneResolucion, true);
assert.equal(returned.estado, 'DEVUELTO');
assert.equal(returned.permiteReenvio, true);
assert.equal(returned.resolucion.coordinador, 'Mayra Molina');

const empty = accessTest.normalizeTitles({
  ok: true,
  existe: false,
  tieneEnvio: false
});
assert.equal(empty.tieneEnvio, false);
assert.equal(empty.estado, 'SIN_ENVIO');
assert.equal(empty.permiteReenvio, false);

console.log('[Acceso estudiante] UTET mínimo, respaldo Sheets y resolución de Títulos validados.');
