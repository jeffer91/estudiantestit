import fs from 'node:fs';
import process from 'node:process';
import { estadoActualEnvio } from '../functions/_lib/admin-global-state.js';

const errors = [];
function expect(condition, message) { if (!condition) errors.push(message); }
function source(file) { return fs.readFileSync(file, 'utf8'); }

expect(estadoActualEnvio({ estadoProceso: 'PENDIENTE_INVESTIGADOR' }) === 'PENDIENTE_INVESTIGADOR', 'Se perdió PENDIENTE_INVESTIGADOR.');
expect(estadoActualEnvio({ estadoProceso: 'APROBADO_FINAL' }) === 'APROBADO_FINAL', 'Se perdió APROBADO_FINAL.');
expect(estadoActualEnvio({ estadoProceso: 'PENDIENTE_COORDINADOR' }) === 'PENDIENTE_COORDINADOR', 'Se perdió PENDIENTE_COORDINADOR.');

const servicios = source('administrador/ad-js/ad-servicios.app.js');
expect(servicios.includes('ad-estadisticas-minimal.js'), 'Administrador no carga estadísticas minimalistas.');
expect(!servicios.includes("cargarComplemento('./ad-js/ad-estadisticas-control.patch.js'"), 'El tablero antiguo de estadísticas sigue activo.');
expect(!servicios.includes("cargarComplemento('./ad-js/ad-estadisticas-dashboard.patch.js'"), 'El dashboard antiguo de estadísticas sigue activo.');

const base = source('administrador/ad-js/ad-google-sheets.app.js');
expect(base.includes('!window.ADAdminStatsMinimal'), 'La app base todavía puede duplicar la carga de estadísticas.');

const stats = source('functions/_lib/estadisticas-admin.js');
expect(stats.includes('reconcileAdminGlobalState'), 'Las estadísticas no reconcilian el estado real del envío.');

const reviews = source('functions/_lib/revisiones-admin.js');
expect(reviews.includes('event.cedula || envio.cedula'), 'El reporte no prioriza el contexto histórico del evento.');
expect(reviews.includes('Sin tipo registrado'), 'El reporte sigue clasificando tipos desconocidos como artículo.');
expect(reviews.includes('10.000 revisiones'), 'El reporte no protege contra truncado silencioso.');

const coordinator = source('functions/api/titulos.js');
const investigator = source('functions/api/investigadores.js');
expect(coordinator.includes('cedula: normalizeCedula(envio.cedula || envio.numeroIdentificacion)'), 'Coordinación no guarda snapshot histórico.');
expect(investigator.includes('estudiante: nombresEnvio(envio)'), 'Investigación no guarda snapshot histórico.');

const prep = source('dev/preparar-pages-administrador.mjs');
expect(prep.includes('ad-estadisticas-minimal.js'), 'El build no exige la nueva vista de estadísticas.');
expect(!prep.includes("path.join(output, 'ad-js', 'ad-estadisticas-dashboard.patch.js')"), 'El build todavía exige el dashboard antiguo.');

if (errors.length) {
  console.error('[Estadísticas] Auditoría fallida:');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  process.exit(1);
}
console.log('[Estadísticas] Flujo minimalista, estados, trazabilidad y build verificados.');
