/* Fachada administrativa v7 con resolución de alias del catálogo de períodos.
 * El frontend trabaja con un ID canónico, pero los datos históricos pueden
 * conservar además un ID institucional y/o el nombre legible del período.
 * Antes de construir la lista se completan esas variantes desde `periodos`.
 */
import {
  assignCareerCoordinator,
  buildAdminGlobalList as buildAdminGlobalListV7,
  buildAdminStatistics as buildAdminStatisticsV7,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
} from './admin-global-v7.js';
import { samePeriod, text } from './firestore-fixed.js';

export {
  assignCareerCoordinator,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
};

function periodItems(catalog) {
  return catalog && (catalog.periodos || catalog.registros) || [];
}

export function enrichAdminPeriodPayload(payload = {}, catalog = {}) {
  const input = { ...(payload || {}) };
  const requested = text(
    input.periodoId || input.periodoLabel || input.periodo || input.documentId
  );
  if (!requested) return input;

  const items = periodItems(catalog);
  const target = items.find((item) =>
    text(item && item.id) === requested ||
    text(item && item.periodoId) === requested ||
    text(item && item.documentId) === requested ||
    text(item && item.label) === requested ||
    text(item && item.periodoLabel) === requested
  ) || items.find((item) =>
    samePeriod(item && (item.id || item.periodoId), requested) ||
    samePeriod(item && (item.label || item.periodoLabel), requested)
  );

  if (!target) return input;

  const canonical = text(target.id || target.periodoId || requested);
  const label = text(target.label || target.periodoLabel);
  const documentId = text(target.documentId);
  const existingPeriod = text(input.periodo);
  const periodAlias = !existingPeriod || existingPeriod === requested
    ? documentId || label || requested
    : existingPeriod;

  return {
    ...input,
    periodoId: text(input.periodoId) || canonical,
    periodoLabel: text(input.periodoLabel) || label,
    periodo: periodAlias
  };
}

async function resolveAdminPeriodPayload(payload, env) {
  const input = { ...(payload || {}) };
  const requested = text(
    input.periodoId || input.periodoLabel || input.periodo || input.documentId
  );
  if (!requested || text(input.periodoLabel)) return input;

  try {
    const catalog = await listAdminPeriodsCatalog(env);
    return enrichAdminPeriodPayload(input, catalog);
  } catch (_error) {
    /* La lista global todavía puede resolverse con los datos recibidos si el
       catálogo no está disponible temporalmente. No convertimos una lectura
       auxiliar en un bloqueo de toda la pantalla. */
    return input;
  }
}

export async function buildAdminGlobalList(payload = {}, env) {
  return buildAdminGlobalListV7(
    await resolveAdminPeriodPayload(payload, env),
    env
  );
}

export async function buildAdminStatistics(payload = {}, env) {
  return buildAdminStatisticsV7(
    await resolveAdminPeriodPayload(payload, env),
    env
  );
}
