/* Fachada administrativa optimizada.
 *
 * La reconstrucción completa UTET + TÍTULOS se conserva como fuente de verdad,
 * pero el Administrador trabaja normalmente sobre una vista materializada por
 * período. Esto evita repetir cruces costosos para Lista global y Estadísticas.
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
  readAdminStatisticsView,
  saveAdminView,
  statisticsFromGlobal
} from './admin-view.js';
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
    return input;
  }
}

async function rebuildGlobal(payload, env) {
  const rebuilt = await buildAdminGlobalListV8(payload, env);
  try {
    return await saveAdminView(rebuilt, env);
  } catch (_error) {
    /* La vista es una optimización, nunca la fuente de verdad. Si no puede
       guardarse, el Administrador sigue funcionando con el resultado real. */
    return {
      ...rebuilt,
      vistaAdministrativa: false,
      vistaError: true
    };
  }
}

export async function buildAdminGlobalList(payload = {}, env) {
  if (payload.forzarVista !== true) {
    try {
      const direct = await readAdminGlobalView(payload, env);
      if (direct) return direct;
    } catch (_error) {
      /* Si la vista está dañada o incompleta, se reconstruye desde las fuentes. */
    }
  }

  const resolved = await resolveAdminPeriodPayload(payload, env);
  if (resolved.forzarVista !== true) {
    try {
      const cached = await readAdminGlobalView(resolved, env);
      if (cached) return cached;
    } catch (_error) {
      /* Compatibilidad: el alias resuelto puede apuntar a una vista existente. */
    }
  }
  return rebuildGlobal(resolved, env);
}

export async function buildAdminStatistics(payload = {}, env) {
  if (payload.forzarVista !== true) {
    try {
      const direct = await readAdminStatisticsView(payload, env);
      if (direct) return direct;
    } catch (_error) {
      /* La estadística puede reconstruirse a partir de la lista real. */
    }
  }

  const resolved = await resolveAdminPeriodPayload(payload, env);
  if (resolved.forzarVista !== true) {
    try {
      const cached = await readAdminStatisticsView(resolved, env);
      if (cached) return cached;
    } catch (_error) {
      /* Compatibilidad con aliases históricos del período. */
    }
  }

  const global = await rebuildGlobal(resolved, env);
  return statisticsFromGlobal(global);
}
