import fs from 'node:fs';
import process from 'node:process';

const errors = [];
function read(file) {
  if (!fs.existsSync(file)) {
    errors.push('Falta: ' + file);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
}
function expect(condition, message) {
  if (!condition) errors.push(message);
}

const titles = read('functions/api/titulos.js');
const work = read('functions/api/trabajo-titulacion.js');
const history = read('functions/api/historial-titulos.js');
const historyLib = read('functions/_lib/titulos-historial.js');
const investigator = read('functions/api/investigadores.js');
const coordinatorHtml = read('coordinadores-mvp/coordinador.html');
const coordinatorState = read('coordinadores-mvp/js/coordinador.state.js');
const coordinatorModal = read('coordinadores-mvp/js/coordinador.modal.js');
const student = read('estudiantes-mvp/js/estudiante.consulta.revision.js');
const workStudent = read('trabajo-titulacion-mvp/js/trabajo-titulacion.js');
const publicHistory = read('estudiantes-mvp/js/titulos.historial.publico.js');
const investigatorHtml = read('investigadores-mvp/index.html');
const localBuilder = read('dev/preparar-pages-local.mjs');
const investigatorJs = read('investigadores-mvp/js/investigadores.app.js');
const adminHtml = read('administrador/ad-index.html');
const adminJs = read('administrador/ad-js/ad-google-sheets.app.js');
const adminGlobalUi = read('administrador/ad-js/ad-administracion-global.js');
const adminStats = read('administrador/ad-js/ad-estadisticas-dashboard.patch.js');
const adminTitles = read('administrador/ad-js/ad-titulos-admin.patch.js');
const adminWorkApi = read('functions/api/admin-trabajo-titulacion.js');
const adminWorkUi = read('administrador/ad-js/ad-trabajo-titulacion-admin.patch.js');

expect(/PENDIENTE_INVESTIGADOR/.test(titles) && /registerCoordinatorValidation/.test(titles),
  'Artículo Académico no envía la validación de Coordinación a Investigación.');
expect(/registerStudentSubmission/.test(titles) && /PENDIENTE_COORDINADOR/.test(titles),
  'Artículo Académico no reinicia el flujo en Coordinación al reenviar.');
expect(/registerReturnToStudent/.test(titles) && /requiereAccionDe:\s*'ESTUDIANTE'/.test(titles),
  'Artículo Académico no consolida la devolución al estudiante en el estado global.');
expect(/PENDIENTE_INVESTIGADOR/.test(work) && /APROBADO_FINAL/.test(work),
  'Trabajo de Titulación no preserva los estados del nuevo flujo.');
expect(/workflow_eventos/.test(historyLib) && /lineaTiempo/.test(historyLib),
  'El historial no integra los eventos de Coordinación e Investigación.');
expect(/sanitizeHistory/.test(history) && /userRole === 'student'/.test(history),
  'El historial público no protege la identidad de los revisores.');

expect(/data-vista="validados"/.test(coordinatorHtml) &&
  /data-vista="aprobados"/.test(coordinatorHtml) &&
  /Validar y enviar a Investigación/.test(coordinatorHtml),
  'Coordinadores no expone Por revisar / Devueltos / Validados / Aprobados.');
expect(/PENDIENTE_INVESTIGADOR/.test(coordinatorState) && /APROBADO_FINAL/.test(coordinatorState),
  'Coordinadores no distingue validado de aprobado final.');
expect(/Validar y enviar a Investigación/.test(coordinatorModal),
  'El modal de Coordinación puede volver a mostrar el texto antiguo después de un error.');

expect(/PENDIENTE_INVESTIGADOR/.test(student) && /APROBADO_FINAL/.test(student),
  'Estudiante no reconoce Investigación o la aprobación final.');
expect(!/Comentario del coordinador/.test(student),
  'Estudiante todavía identifica al autor de una devolución.');
expect(/PENDIENTE_INVESTIGADOR/.test(workStudent) && /APROBADO_FINAL/.test(workStudent),
  'Trabajo de Titulación no muestra correctamente Investigación y aprobación final.');
expect(!/observación del coordinador/i.test(workStudent),
  'Trabajo de Titulación todavía revela la unidad que devolvió.');
expect(!/Coordinador no registrado/.test(publicHistory),
  'El historial público todavía identifica a la unidad revisora.');

expect(/REGISTRAR_PIN/.test(investigator) && /LOGIN_MAX_ATTEMPTS/.test(investigator) &&
  /investigacion_bloqueos/.test(investigator),
  'Investigación no tiene PIN seguro o bloqueo concurrente.');
expect(/queryEqual\([\s\S]*'envios'[\s\S]*'estadoProceso'[\s\S]*'PENDIENTE_INVESTIGADOR'/.test(investigator),
  'Investigación vuelve a recorrer toda la colección de envíos en vez de consultar solo sus pendientes.');
expect(/El título no tiene cambios/.test(investigator),
  'Investigación permite usar “Corregir y aprobar” sin una corrección real.');
expect(/Usar esta propuesta/.test(investigatorJs) && /Tomado por otro usuario/.test(investigatorJs),
  'La interfaz de Investigación no permite reutilizar propuestas o mostrar bloqueo.');
expect(/window\.confirm\(confirmacion\)/.test(investigatorJs) && /tituloModificado/.test(investigatorJs),
  'La aprobación final de Investigación no exige confirmación o no distingue una corrección real.');
expect(/Historial del proceso/.test(investigatorHtml),
  'Investigación no muestra el historial previo.');
expect(/investigadores-mvp/.test(localBuilder) && /Investigación/.test(localBuilder),
  'El entorno local no incluye la aplicación de Investigación.');

expect(/ad-seccion-investigadores/.test(adminHtml) &&
  /ad-filtro-titulo-investigador/.test(adminHtml),
  'Administrador no gestiona o filtra por investigadores.');
expect(/cargarInvestigadores/.test(adminJs) && /consultarHistorialTitulo/.test(adminJs),
  'Administrador no carga investigadores o historial.');
expect(/ad-v2-title-investigator/.test(adminGlobalUi) && /Historial del proceso/.test(adminGlobalUi) &&
  /resumenInvestigacion/.test(adminGlobalUi),
  'La lista global activa del Administrador no integra filtro, historial y resolución de Investigación.');
expect(/PENDIENTE_INVESTIGADOR/.test(adminStats),
  'El dashboard administrativo mezcla los pendientes de Investigación con Coordinación.');
expect(/APROBADO_FINAL/.test(adminTitles) && /mantenerAprobacionFinal/.test(adminTitles),
  'La corrección administrativa puede degradar una aprobación final.');
expect(/PENDIENTE_COORDINADOR/.test(adminWorkApi) && /workflow_eventos/.test(adminWorkApi),
  'Las acciones administrativas de Trabajo de Titulación no reinician el flujo con trazabilidad.');
expect(/PENDIENTE_INVESTIGADOR/.test(adminWorkUi) && /APROBADO_FINAL/.test(adminWorkUi),
  'La interfaz administrativa de Trabajo de Titulación no reconoce Investigación y aprobación final.');

if (errors.length) {
  console.error('\n[Flujo Investigación] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error((index + 1) + '. ' + error));
  console.error('');
  process.exit(1);
}

console.log('[Flujo Investigación] Estudiante -> Coordinación -> Investigación -> aprobación final verificado.');
console.log('[Flujo Investigación] Devoluciones reinician en Coordinación y ocultan la identidad al estudiante.');
console.log('[Flujo Investigación] Admin, historial, PIN y bloqueo concurrente están integrados.');
