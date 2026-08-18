import assert from 'node:assert/strict';
import { executeTitulosAction } from '../functions/_lib/titulos-firebase-v7-core.js';

const originalFetch = globalThis.fetch;
const calls = [];
const commits = [];

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
  return { stringValue: String(value) };
}

function firestoreDocument(id, fields) {
  return {
    name: `projects/titulos-ec2fa/databases/(default)/documents/envios/${id}`,
    fields: Object.fromEntries(
      Object.entries(fields).map(([key, value]) => [key, encodeValue(value)])
    ),
    createTime: '2026-08-01T12:00:00.000Z',
    updateTime: '2026-08-18T20:00:00.000Z'
  };
}

const exactDocument = firestoreDocument('envio-exacto', {
  cedula: '1313465294',
  numeroIdentificacion: '1313465294',
  periodoId: '2026-04__2026-09',
  tipoTrabajo: 'TRABAJO_TITULACION',
  estado: 'APROBADO',
  titulo1: 'Título propuesto uno',
  titulo2: 'Título propuesto dos',
  titulo3: 'Título propuesto tres',
  tituloFinal: 'Título aprobado anterior'
});

globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  const method = String(options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : null;
  calls.push({ target, method, body });

  if (method === 'GET' && target.includes('/documents/envios/envio-exacto')) {
    return responseJson(exactDocument);
  }

  if (method === 'POST' && target.includes('/documents:runQuery')) {
    const collection = body && body.structuredQuery && body.structuredQuery.from &&
      body.structuredQuery.from[0] && body.structuredQuery.from[0].collectionId;
    assert.equal(collection, 'resoluciones', 'Antes de guardar solo debe consultarse el historial de resoluciones.');
    return responseJson([]);
  }

  if (method === 'POST' && target.includes('/documents:commit')) {
    commits.push(body);
    return responseJson({
      writeResults: [{ updateTime: '2026-08-18T20:30:00.000Z' }, { updateTime: '2026-08-18T20:30:00.000Z' }],
      commitTime: '2026-08-18T20:30:00.000Z'
    });
  }

  throw new Error(`Solicitud inesperada en la prueba: ${method} ${target}`);
};

try {
  const correctedTitle = 'Impacto de una intervención educativa de enfermería en el cuidado del recién nacido';
  const result = await executeTitulosAction('GUARDAR_RESOLUCION', {
    envioId: 'envio-exacto',
    cedula: '1313465294',
    numeroIdentificacion: '1313465294',
    periodoId: '2026-04__2026-09',
    periodoLabel: 'Abril 2026 a Septiembre 2026',
    periodo: 'Abril 2026 a Septiembre 2026',
    tipoTrabajo: 'TRABAJO_TITULACION',
    coordinador: 'Administrador de Titulación',
    estado: 'REEMPLAZADO',
    estadoFinal: 'REEMPLAZADO',
    tituloElegido: 'Título aprobado anterior',
    tituloCorregido: correctedTitle,
    observacion: 'Corrección del título final realizada desde Administrador.'
  }, 'admin', {});

  assert.equal(result.ok, true);
  assert.equal(result.envioId, 'envio-exacto');
  assert.equal(result.estado, 'REEMPLAZADO');
  assert.equal(result.tituloFinal, correctedTitle);

  assert.equal(
    calls.filter((call) => call.method === 'GET' && call.target.includes('/documents/envios/envio-exacto')).length,
    1,
    'Debe leer una sola vez el envío exacto seleccionado.'
  );
  assert.equal(
    calls.filter((call) => call.method === 'POST' && call.target.includes('/documents:runQuery')).length,
    1,
    'Solo debe consultar el historial de resoluciones, no volver a buscar el envío por cédula.'
  );
  assert.equal(commits.length, 1, 'La corrección debe guardarse en un único commit atómico.');

  const writes = commits[0].writes || [];
  assert.equal(writes.length, 2, 'El commit debe contener historial + actualización del envío.');
  assert.match(writes[0].update.name, /\/documents\/resoluciones\//);
  assert.match(writes[1].update.name, /\/documents\/envios\/envio-exacto$/);
  assert.equal(writes[1].update.fields.estado.stringValue, 'REEMPLAZADO');
  assert.equal(writes[1].update.fields.tituloFinal.stringValue, correctedTitle);
  assert.equal(writes[0].update.fields.tituloElegido.stringValue, 'Título aprobado anterior');
  assert.equal(writes[0].update.fields.tituloCorregido.stringValue, correctedTitle);

  await assert.rejects(
    executeTitulosAction('GUARDAR_RESOLUCION', {
      envioId: 'envio-exacto',
      cedula: '1714510680',
      coordinador: 'Administrador de Titulación',
      estado: 'REEMPLAZADO',
      tituloElegido: 'Título anterior',
      tituloCorregido: 'Título corregido que no debe guardarse'
    }, 'admin', {}),
    /no pertenece al estudiante/i,
    'Debe bloquear un envioId que corresponda a otra cédula.'
  );

  console.log('[Administrador títulos] Corrección exacta, historial y validación de cédula verificados.');
} finally {
  globalThis.fetch = originalFetch;
}
