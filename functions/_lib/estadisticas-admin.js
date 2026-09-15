/* Fachada administrativa optimizada.
 * La vista materializada se conserva como optimización, pero cada lectura se
 * reconcilia con el documento real de envío para no perder estados del flujo.
 */
import {
  assignCareerCoordinator,
  buildAdminGlobalList as buildAdminGlobalListV8,
  listAdminCareers,
  listAdminPeriodsCatalog,
  saveAdminPeriod
} from './admin-global-v8.js';
import {
  readAdminGlobalView,
  saveAdminView,
  statisticsFromGlobal
} from './admin-view.js';
import { reconcileAdminGlobalState } from './admin-global-state.js';
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
  const requested = text(input.periodoId || input.periodoLabel || input.periodo || input.documentId);
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
    periodo: documentId || existingPeriod || label || requested,
    documentId: text(input.documentId) || documentId
  };
}

async function resolveAdminPeriodPayload(payload, env) {
  const input = { ...(payload || {}) };
  const requested = text(input.periodoId || input.periodoLabel || input.periodo || input.documentId);
  if (!requested) return input;
  try {
    const catalog = await listAdminPeriodsCatalog(env);
    return enrichAdminPeriodPayload(input, catalog);
  } catch (_error) {
    return input;
  }
}

async function reconciled(view, env) {
  return view ? reconcileAdminGlobalState(view, env) : null;
}

async function rebuildGlobal(payload, env) {
  const raw = await buildAdminGlobalListV8(payload, env);
  const rebuilt = await reconcileAdminGlobalState(raw, env);
  try {
    return await saveAdminView(rebuilt, env);
  } catch (_error) {
    return { ...rebuilt, vistaAdministrativa: false, vistaError: true };
  }
}

export async function buildAdminGlobalList(payload = {}, env) {
  if (payload.forzarVista !== true) {
    try {
      const direct = await readAdminGlobalView(payload, env);
      if (direct) return reconciled(direct, env);
    } catch (_error) {}
  }

  const resolved = await resolveAdminPeriodPayload(payload, env);
  if (resolved.forzarVista !== true) {
    try {
      const cached = await readAdminGlobalView(resolved, env);
      if (cached) return reconciled(cached, env);
    } catch (_error) {}
  }
  return rebuildGlobal(resolved, env);
}

export async function buildAdminStatistics(payload = {}, env) {
  const global = await buildAdminGlobalList(payload, env);
  const statistics = statisticsFromGlobal(global);
  const resumen = statistics.resumen || {};
  return {
    ...statistics,
    mensaje: 'Estadísticas calculadas con el estado actual reconciliado: ' +
      Number(resumen.esperados || 0) + ' estudiantes, ' +
      Number(resumen.enviados || 0) + ' con envío.'
  };
}
