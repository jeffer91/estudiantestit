/* Requisitos con períodos canónicos y consulta mínima de identidad. */
import {
  listTitleCareers
} from './requisitos-firebase.js';
import { getStudentBasicFast } from './requisitos-firebase-fast.js';
import {
  listCollection,
  periodSignature,
  text
} from './firestore-fixed.js';

function active(value) {
  const normalized = text(value === undefined || value === null || value === '' ? 'ACTIVO' : value).toUpperCase();
  return !['FALSE', '0', 'NO', 'INACTIVO', 'RETIRADO', 'ANULADO', 'CANCELADO'].includes(normalized);
}

function principal(row) {
  return Boolean(row && (
    row.principal === true ||
    row.esPrincipal === true ||
    text(row.tipo).toUpperCase() === 'PRINCIPAL' ||
    text(row.estado).toUpperCase() === 'PRINCIPAL'
  ));
}

export const getStudentBasic = getStudentBasicFast;
export { listTitleCareers };

export async function listTitlePeriods(env) {
  const rows = await listCollection('TITULOS', 'periodos', { maxDocuments: 1000 }, env);
  const seen = new Set();
  const periods = [];

  for (const row of rows) {
    if (!active(row.activo !== undefined ? row.activo : row.estado)) continue;
    const label = text(row.nombre || row.label || row.periodoNombre || row.periodoLabel || row.id);
    const id = periodSignature(label || row.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    periods.push({
      id,
      periodoId: id,
      documentId: text(row.id),
      label: label || id,
      periodoLabel: label || id,
      activo: true,
      principal: principal(row)
    });
  }

  periods.sort((a, b) => {
    const endA = text(a.id).split('__').pop();
    const endB = text(b.id).split('__').pop();
    if (endA !== endB) return endB.localeCompare(endA, 'es', { numeric: true });
    return text(b.id).localeCompare(text(a.id), 'es', { numeric: true });
  });

  let mainFound = false;
  periods.forEach((item) => {
    if (item.principal && !mainFound) mainFound = true;
    else if (item.principal) item.principal = false;
  });
  if (periods.length && !mainFound) periods[0].principal = true;
  return periods;
}

export async function pullRequisitos(action, payload = {}, env) {
  const normalizedAction = text(action).toLowerCase();

  if (normalizedAction === 'ping') {
    try {
      await listCollection('UTET', 'Estudiante', { pageSize: 1, maxDocuments: 1 }, env);
    } catch (_error) {
      await listCollection('UTET', 'Estudiantes', { pageSize: 1, maxDocuments: 1 }, env);
    }
    return {
      ok: true,
      servicio: 'REQUISITOS',
      projectId: 'utet-4387a',
      fuente: 'FIREBASE_UTET',
      autenticacion: 'firebase-rest'
    };
  }

  if (normalizedAction === 'pull_bl2') {
    const scope = text(payload.scope || 'all').toLowerCase();
    /* Una consulta de carreras no necesita volver a leer el catálogo de
       períodos. Cada alcance obtiene únicamente el catálogo solicitado. */
    const includePeriods = scope === 'periods' || scope === 'all';
    const includeCareers = scope !== 'periods';
    const [periods, careers] = await Promise.all([
      includePeriods ? listTitlePeriods(env) : Promise.resolve([]),
      includeCareers ? listTitleCareers(payload.periodoId, env) : Promise.resolve([])
    ]);
    return {
      ok: true,
      fuente: 'FIREBASE_UTET_Y_TITULOS',
      tables: {
        Periodos: periods,
        Carreras: careers,
        Estudiantes: [],
        BaseEstudiantes: [],
        EstudiantesPeriodo: []
      },
      periodos: periods,
      carreras: careers
    };
  }

  if (['consultar_estudiante', 'consultar_estudiante_titulacion'].includes(normalizedAction)) {
    return getStudentBasicFast(
      payload.cedula || payload.numeroIdentificacion || payload.identificacion,
      {
        includePhone: payload.includePhone === true || payload.rol === 'admin'
      },
      env
    );
  }

  throw new Error('Acción de Requisitos no implementada en Firebase: ' + action);
}
