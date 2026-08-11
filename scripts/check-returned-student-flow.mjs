import { __test } from '../functions/_lib/titulos-firebase-v11.js';

const errors = [];
function assert(condition, message) {
  if (!condition) errors.push(message);
}

const katherine = {
  id: '2026-02__2026-08__1723533988',
  estado: 'NO_ENVIADO',
  requiereRevision: true,
  tituloFinal: 'titulo": "Identificación de dificultades cognitivas relacionadas con la lectura en niños de 3 a 4 años de la Escuela Cerro Hermoso durante el año 2026',
  tituloElegido: 'titulo": "Identificación de dificultades cognitivas relacionadas con la lectura en niños de 3 a 4 años de la Escuela Cerro Hermoso durante el año 2026',
  observacion: 'Se debe delimitar el título y estructurarlo bien, porque existen varias dificultades cognitivas'
};
const katherineResolution = {
  estado: 'DEVUELTO',
  observacion: katherine.observacion,
  coordinador: 'Maria Eugenia Barre'
};

assert(
  __test.effectiveState(katherine, katherineResolution) === 'DEVUELTO',
  'Un artículo histórico devuelto no puede convertirse en NO_ENVIADO.'
);

const restoredKatherine = __test.restoreReturnedEnvio(katherine, null, katherineResolution);
assert(restoredKatherine.estado === 'DEVUELTO', 'La devolución histórica no conserva estado DEVUELTO.');
assert(restoredKatherine.permitirReenvio === true, 'La devolución histórica no habilita el reenvío.');
assert(
  restoredKatherine.titulo1 === 'Identificación de dificultades cognitivas relacionadas con la lectura en niños de 3 a 4 años de la Escuela Cerro Hermoso durante el año 2026',
  'No se recuperó y limpió el título histórico disponible.'
);
assert(!restoredKatherine.titulo2 && !restoredKatherine.titulo3, 'Se inventaron títulos históricos inexistentes.');
assert(
  restoredKatherine.observacion === katherine.observacion,
  'No se conserva la observación real del coordinador.'
);

const version = {
  numeroVersion: 1,
  estado: 'DEVUELTO',
  titulo1: 'Título enviado 1',
  titulo2: 'Título enviado 2',
  titulo3: 'Título enviado 3',
  tituloPreferidoNumero: 2
};
const restoredFromVersion = __test.restoreReturnedEnvio(
  { id: '2026-02__0604119016', estado: 'DEVUELTO', requiereRevision: true },
  version,
  { estado: 'DEVUELTO', observacion: 'Corregir los títulos.' }
);
assert(
  restoredFromVersion.titulo1 === 'Título enviado 1' &&
  restoredFromVersion.titulo2 === 'Título enviado 2' &&
  restoredFromVersion.titulo3 === 'Título enviado 3',
  'No se recuperan las tres propuestas exactas desde versiones_envio.'
);
assert(restoredFromVersion.tituloPreferidoNumero === 2, 'No se conserva el título favorito de la versión enviada.');

assert(
  __test.effectiveState(
    { estado: 'PENDIENTE_REVISION', requiereRevision: false },
    { estado: 'DEVUELTO' }
  ) === 'PENDIENTE_REVISION',
  'Una devolución anterior está pisando un reenvío que ya volvió a pendiente de revisión.'
);

if (errors.length) {
  console.error('\n[Flujo devuelto estudiante] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  console.error('');
  process.exit(1);
}

console.log('[Flujo devuelto estudiante] Estado DEVUELTO, observación y títulos históricos verificados.');
console.log('[Flujo devuelto estudiante] Los reenvíos pendientes no son reemplazados por devoluciones anteriores.');
