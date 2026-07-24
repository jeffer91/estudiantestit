/*
Archivo: functions/_lib/estadisticas-admin.js
Función:
- Mantener compatibilidad con la API de estadísticas.
- Usar la misma lista global que alimenta Títulos y Estadísticas.
*/

export {
  buildAdminGlobalList,
  buildAdminStatistics,
  listAdminPeriodsCatalog,
  saveAdminPeriod,
  listAdminCareers,
  assignCareerCoordinator
} from './admin-global.js';
