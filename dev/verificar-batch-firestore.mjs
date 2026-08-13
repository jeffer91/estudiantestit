import assert from 'node:assert/strict';
import {
  batchGetDocuments,
  queryIn
} from '../functions/_lib/firestore.js';
import { buildAdminGlobalList } from '../functions/_lib/admin-global-v6.js';

const originalFetch = globalThis.fetch;
const calls = [];
let scenario = 'helpers';

function firestoreDocument(name) {
  const id = name.split('/').pop();
  return {
    name,
    fields: {
      nombres: { stringValue: `Estudiante ${id}` },
      nombreCarreraActual: { stringValue: 'Carrera Uno' },
      celular: { stringValue: '0999999999' },
      correoInstitucional: { stringValue: `${id}@example.edu.ec` },
      activo: { booleanValue: true }
    }
  };
}

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  const body = JSON.parse(options.body || '{}');
  calls.push({ target, body });

  if (target.includes('documents:batchGet')) {
    return new Response(JSON.stringify(
      (body.documents || []).map((name) => ({ found: firestoreDocument(name) }))
    ), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (target.includes('documents:runQuery')) {
    const collectionId = body.structuredQuery && body.structuredQuery.from &&
      body.structuredQuery.from[0] && body.structuredQuery.from[0].collectionId;
    if (scenario === 'admin' && collectionId === 'matriculas') {
      return new Response(JSON.stringify(Array.from({ length: 300 }, (_, index) => {
        const id = String(1700000000 + index);
        return { document: {
          name: `projects/utet-4387a/databases/(default)/documents/matriculas/m-${id}`,
          fields: {
            cedula: { stringValue: id },
            periodoId: { stringValue: '2026-02__2026-08' },
            nombreCarreraActual: { stringValue: 'Carrera Uno' },
            estadoMatricula: { stringValue: 'ACTIVO' }
          }
        } };
      })), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (scenario === 'admin' && collectionId === 'envios') {
      return new Response(JSON.stringify([{
        document: {
          name: 'projects/titulos-ec2fa/databases/(default)/documents/envios/e-1700000000',
          fields: {
            cedula: { stringValue: '1700000000' },
            periodoId: { stringValue: '2026-02__2026-08' },
            estado: { stringValue: 'APROBADO' }
          }
        }
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify([
      { document: firestoreDocument('projects/utet-4387a/databases/(default)/documents/matriculas/m1') }
    ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (scenario === 'admin' && target.includes('/documents/carreras?')) {
    return new Response(JSON.stringify({ documents: [{
      name: 'projects/titulos-ec2fa/databases/(default)/documents/carreras/C1',
      fields: {
        codigo: { stringValue: 'C1' },
        nombre: { stringValue: 'Carrera Uno' },
        activo: { booleanValue: true }
      }
    }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  if (scenario === 'admin' && target.includes('/documents/coordinadores?')) {
    return new Response(JSON.stringify({ documents: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  throw new Error(`Solicitud inesperada: ${target}`);
};

try {
  const references = Array.from({ length: 501 }, (_, index) => ({
    collectionName: 'Estudiante',
    documentId: String(index).padStart(10, '0')
  }));
  const documents = await batchGetDocuments('UTET', references, {});
  const batchCalls = calls.filter((call) => call.target.includes('documents:batchGet'));

  assert.equal(batchCalls.length, 2, '501 documentos deben resolverse en dos subpeticiones agrupadas.');
  assert.equal(batchCalls[0].body.documents.length, 500);
  assert.equal(batchCalls[1].body.documents.length, 1);
  assert.equal(documents.length, 501);
  assert.equal(documents[0]._collection, 'Estudiante');

  const rows = await queryIn(
    'UTET',
    'matriculas',
    'periodoId',
    ['2026-02__2026-08', 'Febrero 2026 a Agosto 2026'],
    1000,
    {}
  );
  const queryCalls = calls.filter((call) => call.target.includes('documents:runQuery'));

  assert.equal(queryCalls.length, 1, 'Las variantes del período deben usar una sola consulta IN.');
  assert.equal(queryCalls[0].body.structuredQuery.where.fieldFilter.op, 'IN');
  assert.equal(
    queryCalls[0].body.structuredQuery.where.fieldFilter.value.arrayValue.values.length,
    2
  );
  assert.equal(rows.length, 1);

  calls.length = 0;
  scenario = 'admin';
  const global = await buildAdminGlobalList({
    periodoId: '2026-02__2026-08',
    periodo: 'Febrero 2026 a Agosto 2026'
  }, {});

  assert.equal(global.total, 300);
  assert.equal(global.faltantes.length, 299);
  assert.equal(global.lecturaEstudiantesAgrupada, true);
  assert.equal(
    calls.filter((call) => call.target.includes('documents:batchGet')).length,
    2,
    '300 estudiantes deben agruparse en dos lecturas maestras.'
  );
  assert.ok(
    calls.length < 10,
    `La lista administrativa usó demasiadas subpeticiones simuladas: ${calls.length}`
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log('[Firestore Batch] Lecturas agrupadas y variantes de período verificadas.');
