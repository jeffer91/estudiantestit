import { batchGetDocuments, text } from './firestore-fixed.js';
import { normalizarEstadoProceso } from './workflow-titulacion.js';

function legacyStatus(processStatus) {
  return processStatus === 'PENDIENTE_COORDINADOR' ? 'PENDIENTE_REVISION' : processStatus;
}

export function estadoActualEnvio(envio = {}) {
  return normalizarEstadoProceso(envio.estadoProceso || envio.estado || envio.estadoFinal);
}

async function cargarEnvios(ids, env) {
  const unique = [...new Set((ids || []).map(text).filter(Boolean))];
  const rows = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    rows.push(...await batchGetDocuments(
      'TITULOS',
      unique.slice(offset, offset + 100).map((documentId) => ({ collectionName: 'envios', documentId })),
      env
    ));
  }
  return rows;
}

function reconciliarFila(row, envio) {
  if (!row || !envio) return row;
  const estadoProceso = estadoActualEnvio(envio);
  const tipoTrabajo = text(envio.tipoTrabajo) || text(row.tipoTrabajo);
  return {
    ...row,
    estadoProceso,
    estado: legacyStatus(estadoProceso),
    tituloCoordinador: text(envio.tituloCoordinador || envio.tituloValidadoCoordinador),
    tituloFinal: text(envio.tituloFinalInvestigacion || envio.tituloFinal || envio.tituloAprobado || envio.tituloCorregido),
    resultadoCoordinador: text(envio.resultadoCoordinador),
    resultadoInvestigacion: text(envio.resultadoInvestigacion),
    observacionInvestigacion: text(envio.observacionInvestigacion),
    fechaValidacionCoordinador: text(envio.fechaValidacionCoordinador),
    fechaResolucionInvestigacion: text(envio.fechaResolucionInvestigacion),
    tipoTrabajo,
    tipoTrabajoLabel: tipoTrabajo === 'TRABAJO_TITULACION'
      ? 'Trabajo de Titulación'
      : tipoTrabajo === 'ARTICULO_ACADEMICO'
        ? 'Artículo académico'
        : text(row.tipoTrabajoLabel)
  };
}

export async function reconcileAdminGlobalState(global = {}, env) {
  const registros = Array.isArray(global.registros) ? global.registros : [];
  const fuera = Array.isArray(global.fueraPoblacion) ? global.fueraPoblacion : [];
  const ids = [...registros, ...fuera]
    .map((item) => text(item && item.envioId))
    .filter(Boolean);
  if (!ids.length) return global;

  const envios = await cargarEnvios(ids, env);
  const byId = new Map(envios.map((item) => [text(item.id), item]));
  const reconciliar = (rows) => rows.map((row) =>
    reconciliarFila(row, byId.get(text(row && row.envioId)))
  );
  const nuevosRegistros = reconciliar(registros);
  const nuevosFuera = reconciliar(fuera);

  return {
    ...global,
    registros: nuevosRegistros,
    estudiantes: nuevosRegistros,
    faltantes: nuevosRegistros.filter((item) => text(item.estado).toUpperCase() === 'NO_ENVIADO'),
    fueraPoblacion: nuevosFuera,
    estadosReconciliadosConEnvios: true
  };
}
