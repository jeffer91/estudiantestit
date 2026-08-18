/* Compatibilidad para la API administrativa.
 * La v7 elimina barridos completos por período y une esquemas mixtos
 * sin superar silenciosamente los límites de Cloudflare.
 */
export {
  buildAdminGlobalList,
  buildAdminStatistics,
  listAdminPeriodsCatalog,
  saveAdminPeriod,
  listAdminCareers,
  assignCareerCoordinator
} from './admin-global-v7.js';
