/* Fachada administrativa v8 con resolución flexible de alias del catálogo.
 * El frontend puede enviar el ID canónico y el nombre legible, mientras los
 * registros históricos conservan un ID institucional corto. Antes de consultar
 * se añaden todas esas variantes para que ninguna quede fuera del cruce.
 */
import {
  assignCareerCoordinator,
  buildAdminGlobalList as buildAdminGlobalListV8,
  buildAdminStatistics as buildAdminStatisticsV8,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
} from './admin-global-v8.js';
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

  return {
    ...input,
    periodoId: text(input.periodoId) || canonical,
    periodoLabel: text(input.periodoLabel) || label,
    /* El ID del documento es el alias más importante para datos antiguos,
       por ejemplo 2026-02. Se conserva además de periodoId y periodoLabel. */
    periodo: documentId || existingPeriod || label || requested,
    documentId: text(input.documentId) || documentId
  };
}

async function resolveAdminPeriodPayload(payload, env) {
  const input = { ...(payload || {}) };
  const requested = text(
    input.periodoId || input.periodoLabel || input.periodo || input.documentId
  );
  if (!requested) return input;

  try {
    const catalog = await listAdminPeriodsCatalog(env);
    return enrichAdminPeriodPayload(input, catalog);
  } catch (_error) {
    /* Si el catálogo falla, la lista todavía puede intentar resolver con los
       valores recibidos. No convertimos una lectura auxiliar en un bloqueo. */
    return input;
  }
}

export async function buildAdminGlobalList(payload = {}, env) {
  return buildAdminGlobalListV8(
    await resolveAdminPeriodPayload(payload, env),
    env
  );
}

export async function buildAdminStatistics(payload = {}, env) {
  return buildAdminStatisticsV8(
    await resolveAdminPeriodPayload(payload, env),
    env
  );
}
