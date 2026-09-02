/* Flujo compartido de Titulación: Coordinación -> Investigación -> aprobación final. */
import { text } from './firestore-fixed.js';

export const ESTADOS_TITULACION = Object.freeze({
  PENDIENTE_COORDINADOR: 'PENDIENTE_COORDINADOR',
  DEVUELTO_ESTUDIANTE: 'DEVUELTO',
  PENDIENTE_INVESTIGADOR: 'PENDIENTE_INVESTIGADOR',
  APROBADO_FINAL: 'APROBADO_FINAL'
});

export function normalizarEstadoProceso(value) {
  const estado = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!estado) return ESTADOS_TITULACION.PENDIENTE_COORDINADOR;
  if (estado === 'PENDIENTE_INVESTIGADOR' || estado === 'VALIDADO_COORDINADOR') {
    return ESTADOS_TITULACION.PENDIENTE_INVESTIGADOR;
  }
  if (estado === 'APROBADO_FINAL') return ESTADOS_TITULACION.APROBADO_FINAL;
  if (estado.includes('DEVUEL')) return ESTADOS_TITULACION.DEVUELTO_ESTUDIANTE;
  if (estado.includes('PENDIENT') || estado === 'ENVIADO') {
    return ESTADOS_TITULACION.PENDIENTE_COORDINADOR;
  }
  if (estado === 'APROBADO' || estado === 'REEMPLAZADO') return estado;
  return estado;
}

export function estadoProcesoEnvio(envio = {}) {
  return normalizarEstadoProceso(envio.estadoProceso || envio.estado);
}

export function esPendienteInvestigacion(envio = {}) {
  return estadoProcesoEnvio(envio) === ESTADOS_TITULACION.PENDIENTE_INVESTIGADOR;
}

export function resultadoPorCambio(antes, despues) {
  const limpiar = (value) => text(value).replace(/\s+/g, ' ').toLowerCase();
  return limpiar(antes) === limpiar(despues)
    ? 'APROBADO_SIN_CAMBIOS'
    : 'APROBADO_CON_CORRECCION';
}

export function tituloCoordinacion(envio = {}) {
  return text(
    envio.tituloCoordinador ||
    envio.tituloValidadoCoordinador ||
    envio.tituloAprobado ||
    envio.tituloFinal ||
    envio.tituloCorregido ||
    envio.tituloElegido
  );
}

export function tipoTrabajoLabel(envio = {}) {
  return text(envio.tipoTrabajo).toUpperCase() === 'TRABAJO_TITULACION'
    ? 'Trabajo de Titulación'
    : 'Artículo Académico';
}

export function carreraEnvio(envio = {}) {
  return text(envio.carreraNombre || envio.carrera || envio.nombreCarrera || envio.NombreCarrera);
}

export function nombresEnvio(envio = {}) {
  return text(envio.nombres || envio.estudiante || envio.Nombres || envio.nombreCompleto);
}
