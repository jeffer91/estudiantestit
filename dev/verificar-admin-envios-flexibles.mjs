import assert from 'node:assert/strict';
import { buildAdminGlobalList } from '../functions/_lib/admin-global-v8.js';
import { enrichAdminPeriodPayload } from '../functions/_lib/estadisticas-admin.js';

const originalFetch = globalThis.fetch;
const calls = [];

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function encodeValue(value) {
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  return { stringValue: String(value) };
}

function doc(name, fields) {
  return {
    name,
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, encodeValue(value)])
    ),
    createTime: '2026-07-30T01:39:22.613Z',
    updateTime: '2026-08-03T15:39:31.918Z'
  };
}

const andrea = {
  actualizadoEn: '2026-08-03T15:39:31.918Z',
  carreraNombre: 'VENTAS ONLINE',
  cedula: '1717094096',
  coordinador: 'Javier Tapia',
  estado: 'APROBADO',
  fechaEnvio: '2026-07-30T01:39:22.613Z',
  fechaResolucion: '2026-08-03T15:39:31.918Z',
  nombres: 'LESCANO TOCA ANDREA VANESSA',
  numeroIdentificacion: '1717094096',
  periodoId: '2026-02',
  periodoNombre: 'Febrero 2026 a Agosto 2026',
  titulo1: 'Diseño de una guía práctica de atención empática para familias en duelo',
  titulo2: 'Diagnóstico de la gestión de calidad en la atención al cliente durante emergencias',
  titulo3: 'Diseño de un sistema integrado de gestión comercial y comunicación interna para optimizar la atención en emergencias en Jardines Santa Rosa Parquesanto entre 2026 y 2027',
  tituloFinal: 'Diseño de un sistema integrado de gestión comercial y comunicación interna para optimizar la atención en emergencias en Jardines Santa Rosa Parquesanto entre 2026 y 2027',
  tituloPreferidoNumero: 1,
  versionActual: 1
};

function queryInfo(body) {
  const query = body && body.structuredQuery || {};
  const collection = query.from && query.from[0] && query.from[0].collectionId;
  const filter = query.where && query.where.fieldFilter || {};
  const field = filter.field && filter.field.fieldPath;
  return { collection, field, filter };
}

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};
  calls.push({ target, method, body });

  if (target.includes('documents:runQuery')) {
    const { collection, field } = queryInfo(body);

    if (collection === 'matriculas' && field === 'periodoId') {
      return responseJson([{
        document: doc(
          'projects/utet-4387a/databases/(default)/documents/matriculas/m-andrea',
          {
            cedula: '1717094096',
            periodoId: '2026-02__2026-08',
            nombreCarreraActual: 'VENTAS ONLINE',
            estadoMatricula: 'ACTIVO'
          }
        )
      }]);
    }

    /* Simula el fallo histórico: ninguna consulta por período encuentra el
       envío porque el documento conserva el periodoId corto 2026-02. */
    if (collection === 'envios' && [
      'periodoId', 'periodId', 'periodoCanonicoId',
      'periodoNombre', 'periodoLabel', 'periodo'
    ].includes(field)) {
      return responseJson([]);
    }

    /* La verificación secundaria por cédula sí debe recuperar el documento. */
    if (collection === 'envios' && field === 'cedula') {
      return responseJson([{
        document: doc(
          'projects/titulos-ec2fa/databases/(default)/documents/envios/2026-02__1717094096',
          andrea
        )
      }]);
    }

    if (collection === 'envios' && field === 'numeroIdentificacion') {
      return responseJson([]);
    }

    return responseJson([]);
  }

  if (target.includes('documents:batchGet')) {
    const documents = body.documents || [];
    return responseJson(documents
      .filter((name) => name.includes('/documents/Estudiante/1717094096'))
      .map((name) => ({
        found: doc(name, {
          nombres: 'LESCANO TOCA ANDREA VANESSA',
          nombreCarreraActual: 'VENTAS ONLINE',
          celular: '0999999999',
          correoInstitucional: 'andrea@example.edu.ec',
          activo: true
        })
      })));
  }

  if (target.includes('/documents/carreras?')) {
    return responseJson({
      documents: [doc(
        'projects/titulos-ec2fa/databases/(default)/documents/carreras/ventas_online',
        { codigo: 'ventas_online', nombre: 'VENTAS ONLINE', activo: true }
      )]
    });
  }

  if (target.includes('/documents/coordinadores?')) {
    return responseJson({ documents: [] });
  }

  throw new Error(`Solicitud inesperada: ${method} ${target}`);
};

try {
  const result = await buildAdminGlobalList({
    periodoId: '2026-02__2026-08',
    periodoLabel: 'Febrero 2026 a Agosto 2026'
  }, {});

  assert.equal(result.total, 1);
  assert.equal(result.registros[0].cedula, '1717094096');
  assert.equal(result.registros[0].estado, 'APROBADO');
  assert.equal(result.registros[0].enviado, true);
  assert.equal(result.registros[0].recuperadoPorCedula, true);
  assert.equal(result.registros[0].tituloFinal, andrea.tituloFinal);
  assert.equal(result.faltantes.length, 0);
  assert.equal(result.totalEnviosPeriodo, 1);
  assert.equal(result.enviosRecuperadosPorCedula, 1);
  assert.equal(result.verificacionFaltantesPorCedula, true);

  const fallbackQueries = calls.filter((call) => {
    if (!call.target.includes('documents:runQuery')) return false;
    const info = queryInfo(call.body);
    return info.collection === 'envios' && ['cedula', 'numeroIdentificacion'].includes(info.field);
  });
  assert.ok(fallbackQueries.length <= 2, 'La recuperación debe ser agrupada y no hacer una consulta por estudiante.');
} finally {
  globalThis.fetch = originalFetch;
}

const enriched = enrichAdminPeriodPayload(
  {
    periodoId: '2026-02__2026-08',
    periodoLabel: 'Febrero 2026 a Agosto 2026'
  },
  {
    periodos: [{
      id: '2026-02__2026-08',
      periodoId: '2026-02__2026-08',
      documentId: '2026-02',
      label: 'Febrero 2026 a Agosto 2026',
      periodoLabel: 'Febrero 2026 a Agosto 2026'
    }]
  }
);

assert.equal(enriched.periodoId, '2026-02__2026-08');
assert.equal(enriched.periodoLabel, 'Febrero 2026 a Agosto 2026');
assert.equal(
  enriched.periodo,
  '2026-02',
  'Aunque el frontend ya envíe periodoLabel, debe añadirse el ID institucional corto como alias.'
);
assert.equal(enriched.documentId, '2026-02');

console.log('[Administrador envíos flexibles] Andrea se reconoce como APROBADO y el alias 2026-02 queda cubierto.');
