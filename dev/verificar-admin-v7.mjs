import assert from 'node:assert/strict';
import { buildAdminGlobalList } from '../functions/_lib/admin-global-v7.js';

const originalFetch = globalThis.fetch;
const calls = [];

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function doc(name, fields) {
  return {
    name,
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [
        key,
        typeof value === 'boolean'
          ? { booleanValue: value }
          : { stringValue: String(value) }
      ])
    )
  };
}

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  const body = options.body ? JSON.parse(options.body) : {};
  calls.push({ target, body, method: options.method || 'GET' });

  if (target.includes('documents:runQuery')) {
    const query = body.structuredQuery || {};
    const collection = query.from && query.from[0] && query.from[0].collectionId;
    const filter = query.where && query.where.fieldFilter || {};
    const field = filter.field && filter.field.fieldPath;

    if (collection === 'matriculas' && field === 'periodoId') {
      return responseJson([
        {
          document: doc(
            'projects/utet-4387a/databases/(default)/documents/matriculas/m1',
            {
              cedula: '1700000001',
              periodoId: '2026-02__2026-08',
              nombreCarreraActual: 'Carrera Uno',
              estadoMatricula: 'ACTIVO'
            }
          )
        },
        {
          document: doc(
            'projects/utet-4387a/databases/(default)/documents/matriculas/m2',
            {
              cedula: '1700000002',
              periodoId: '2026-02__2026-08',
              nombreCarreraActual: 'Carrera Uno',
              estadoMatricula: 'ACTIVO'
            }
          )
        }
      ]);
    }

    if (collection === 'matriculas' && field === 'periodoAcademicoId') {
      return responseJson([
        {
          document: doc(
            'projects/utet-4387a/databases/(default)/documents/matriculas/m3',
            {
              cedula: '1700000003',
              periodoAcademicoId: '2026-02__2026-08',
              nombreCarreraActual: 'Carrera Uno',
              estadoMatricula: 'ACTIVO'
            }
          )
        }
      ]);
    }

    if (collection === 'envios' && field === 'periodoId') {
      return responseJson([
        {
          document: doc(
            'projects/titulos-ec2fa/databases/(default)/documents/envios/e1',
            {
              cedula: '1700000001',
              periodoId: '2026-02__2026-08',
              estado: 'APROBADO',
              titulo1: 'Título uno',
              titulo2: 'Título dos',
              titulo3: 'Título tres',
              fechaEnvio: '2026-08-01T12:00:00.000Z'
            }
          )
        }
      ]);
    }

    return responseJson([]);
  }

  if (target.includes('documents:batchGet')) {
    const documents = body.documents || [];
    return responseJson(documents
      .filter((name) => name.includes('/documents/Estudiante/'))
      .map((name) => ({
        found: doc(name, {
          nombres: 'Estudiante ' + name.split('/').pop(),
          nombreCarreraActual: 'Carrera Uno',
          celular: '0999999999',
          correoInstitucional: name.split('/').pop() + '@example.edu.ec',
          activo: true
        })
      })));
  }

  if (target.includes('/documents/carreras?')) {
    return responseJson({
      documents: [
        doc(
          'projects/titulos-ec2fa/databases/(default)/documents/carreras/C1',
          {
            codigo: 'C1',
            nombre: 'Carrera Uno',
            activo: true
          }
        )
      ]
    });
  }

  if (target.includes('/documents/coordinadores?')) {
    return responseJson({ documents: [] });
  }

  throw new Error(`Solicitud inesperada: ${target}`);
};

try {
  const result = await buildAdminGlobalList({
    periodoId: '2026-02__2026-08',
    periodo: 'Febrero 2026 a Agosto 2026'
  }, {});

  assert.equal(result.total, 3, 'Debe unir matrículas guardadas con distintos campos de período.');
  assert.equal(result.totalEnviosPeriodo, 1);
  assert.equal(result.faltantes.length, 2);
  assert.equal(result.sinBarridosCompletos, true);
  assert.equal(result.consultasPeriodoAcotadas, true);

  assert.equal(
    calls.filter((call) => call.target.includes('/documents/matriculas?')).length,
    0,
    'No debe barrer la colección completa de matrículas.'
  );

  assert.equal(
    calls.filter((call) => call.target.includes('/documents/envios?')).length,
    0,
    'No debe barrer la colección completa de envíos.'
  );

  const runQueries = calls.filter((call) => call.target.includes('documents:runQuery'));
  assert.ok(
    runQueries.length <= 12,
    `La lista administrativa usó demasiadas consultas de período: ${runQueries.length}`
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('[Administrador v7] Períodos mixtos unidos sin barridos completos.');
