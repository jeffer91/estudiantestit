import assert from 'node:assert/strict';
import { __test } from '../functions/api/acceso-estudiante.js';

const cedula = '1313244988';
const periodo = 'Noviembre 2025 a Mayo 2026';

const respuestaAnidada = {
  respuesta: JSON.stringify({
    data: JSON.stringify({
      envio: {
        cedula,
        periodo,
        estado: 'PENDIENTE_REVISION',
        titulo1: 'pr 1',
        titulo2: 'pr 2',
        titulo3: 'pr 3',
        preferido: '1'
      },
      resolucion: {
        'Cédula': cedula,
        'Período': periodo,
        'Estado final': 'DEVUELTO',
        Coordinador: 'Mayra Molina',
        Observación: 'repetir esta mal',
        'Título elegido': 'pr 1',
        'Fecha resolución': '2026-07-22T20:38:50.254Z'
      }
    })
  })
};

const envio = __test.selectRecord(
  respuestaAnidada,
  __test.looksLikeEnvio,
  cedula,
  periodo,
  'envio'
);
const resolucion = __test.selectRecord(
  respuestaAnidada,
  __test.looksLikeResolution,
  cedula,
  periodo,
  'resolution'
);
const decision = __test.effectiveState(envio, resolucion);

assert.ok(envio, 'No se recuperó el envío anidado.');
assert.ok(resolucion, 'No se recuperó la resolución anidada.');
assert.equal(envio.titulo1, 'pr 1');
assert.equal(envio.titulo2, 'pr 2');
assert.equal(envio.titulo3, 'pr 3');
assert.equal(decision.estado, 'DEVUELTO');
assert.equal(decision.origen, 'RESOLUCIONES');

const otroPeriodo = {
  envio: {
    cedula,
    periodo: 'Febrero 2026 a Agosto 2026',
    titulo1: 'No corresponde',
    titulo2: 'No corresponde',
    titulo3: 'No corresponde'
  }
};
assert.equal(
  __test.selectRecord(otroPeriodo, __test.looksLikeEnvio, cedula, periodo, 'envio'),
  null,
  'No debe seleccionarse un envío de otro período.'
);

console.log('[Acceso estudiante] Envío, resolución, JSON anidado y jerarquía correctos.');
