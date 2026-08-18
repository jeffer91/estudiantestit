import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAdminGlobalList } from '../functions/_lib/admin-global-v7.js';
import { enrichAdminPeriodPayload } from '../functions/_lib/estadisticas-admin.js';

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

const enriched = enrichAdminPeriodPayload(
  {
    periodoId: '2025-10__2026-03',
    periodo: '2025-10__2026-03'
  },
  {
    periodos: [{
      id: '2025-10__2026-03',
      periodoId: '2025-10__2026-03',
      documentId: '2026-10',
      label: 'Octubre 2025 a Marzo 2026',
      periodoLabel: 'Octubre 2025 a Marzo 2026'
    }]
  }
);

assert.equal(
  enriched.periodoLabel,
  'Octubre 2025 a Marzo 2026',
  'La API administrativa debe conservar el nombre legible del período.'
);
assert.equal(
  enriched.periodo,
  '2026-10',
  'La API administrativa debe incluir el ID institucional como alias de consulta.'
);
assert.equal(
  enriched.periodoId,
  '2025-10__2026-03',
  'El ID canónico del período debe permanecer estable.'
);

const performance = fs.readFileSync('administrador/ad-js/ad-performance.patch.js', 'utf8');
assert(
  /ADAdminGlobalLast=null/.test(performance),
  'Un error de carga debe descartar la lista global anterior para no mostrar falsos ceros.'
);
assert(
  /too many subrequests/i.test(performance) && /límite del servidor/i.test(performance),
  'El Administrador debe convertir el error técnico de subrequests en un mensaje comprensible.'
);
assert(
  /estadisticasDesdeListaGlobal:true/.test(performance),
  'Las estadísticas deben reutilizar la lista global cuando ya está disponible.'
);

console.log('[Administrador v7] Consultas acotadas, alias de período y estado de error verificados.');
