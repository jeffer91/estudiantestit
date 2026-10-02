import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const context = {
  console,
  setTimeout,
  clearTimeout,
  AbortController,
  fetch: async () => { throw new Error('La prueba no debe llamar a una IA externa.'); },
  MutationObserver: function MutationObserver() { this.observe = function observe() {}; },
  document: {
    readyState: 'loading',
    body: null,
    head: { appendChild() {} },
    write() {},
    addEventListener() {},
    createElement() { return {}; }
  }
};

context.window = context;
context.window.location = { hostname: 'localhost', protocol: 'http:', origin: 'http://localhost:5500' };
vm.createContext(context);

[
  'estudiantes-mvp/js/ia.biblioteca.academica.js',
  'estudiantes-mvp/js/ia.linguistica.service.js',
  'estudiantes-mvp/js/ia.nueve.core.js',
  'estudiantes-mvp/js/ia.providers.service.js'
].forEach(file => vm.runInContext(read(file), context, { filename: file }));

const params = {
  estudiante: { cedula: '0000000000', nombreCarrera: 'Administración' },
  propuesta: {
    temaGeneral: 'gestión de inventarios',
    lugarContexto: 'empresa comercial',
    grupoEstudio: 'personal operativo',
    problemaNecesidad: 'control insuficiente',
    objetivo: 'mejorar el control',
    anioPeriodo: '2026'
  }
};

// Compatibilidad con el prompt 3x3 histórico.
const promptHistorico = context.EstudianteMVPIANueveCore.construirPrompt(params);
const rawHistorico = await context.EstudianteMVPIAProviders.generarTexto({ id: 'motor_interno' }, promptHistorico, {});
const parsedHistorico = context.EstudianteMVPIANueveCore.parsearRespuesta(rawHistorico);
const reportHistorico = context.EstudianteMVPIANueveCore.validarYRecomendar(parsedHistorico, params);
assert.equal(context.EstudianteMVPIANueveCore.contarTitulos(reportHistorico.secciones), 9);
assert.equal(reportHistorico.apto, true);

// Regresión del flujo real: el servicio robusto genera DATOS sin guion inicial.
context.EstudianteMVPFirebaseIA = {
  listarProveedoresActivos: async () => [{ id: 'motor_interno', activo: true, prioridad: 1 }],
  listarProveedores: async () => [{ id: 'motor_interno', activo: true, prioridad: 1 }],
  obtenerProveedorPreferido: () => ({ id: 'motor_interno', activo: true, prioridad: 1 })
};
vm.runInContext(read('estudiantes-mvp/js/ia.titulacion.robusto.service.js'), context, { filename: 'ia.titulacion.robusto.service.js' });
vm.runInContext(read('estudiantes-mvp/js/ia.fallback.secuencial.patch.js'), context, { filename: 'ia.fallback.secuencial.patch.js' });

const resultadoProduccion = await context.EstudianteMVPIATitulacion.generarOpcionesParaPropuesta({ ...params, maxProcesos: 1 });
assert.equal(resultadoProduccion.cantidadOpciones, 3, 'El motor interno debe entregar las tres opciones en el flujo real.');
assert.equal(resultadoProduccion.opcionesFinales.length, 3);
for (const opcion of resultadoProduccion.opcionesFinales) {
  assert.doesNotMatch(opcion.titulo, /(?:tema|contexto|grupo|necesidad|objetivo|período) registrado/i);
  assert.match(opcion.titulo, /inventarios/i);
}

assert.ok(context.EstudianteMVPIABibliotecaAcademica);
assert.ok(context.EstudianteMVPIALinguistica);
const client = read('estudiantes-mvp/js/ia.providers.service.js');
assert.match(client, /motor_interno/);
assert.doesNotMatch(client, /apiKey|secret|Bearer\s+[A-Za-z0-9]/i);

const index = read('firebase-backend/functions/index.js');
const learning = read('firebase-backend/functions/_lib/neon-learning.js');
const migration = read('firebase-backend/migrations/001_ia_learning.sql');
assert.match(index, /\['aprendizaje', aprendizaje\]/);
assert.match(learning, /titulos-neon-database-url/);
assert.match(migration, /ia_generation_events/);
assert.match(migration, /ia_learning_feedback/);

['_worker.js', 'wrangler.jsonc', 'publicar-cloudflare.ps1', '_routes.json'].forEach(file => {
  assert.equal(fs.existsSync(path.join(root, file)), false);
});
const forbidden = /pages\.dev|workers\.dev|api\.cloudflare\.com/i;
function walk(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(file);
    if (/\.(?:js|html|css)$/i.test(entry.name)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), forbidden);
  });
}
['estudiantes-mvp', 'coordinadores-mvp', 'trabajo-titulacion-mvp', 'administrador'].forEach(directory => walk(path.join(root, directory)));
console.log('IA completa OK: flujo histórico y flujo real producen títulos válidos; Firebase y memoria Neon preparados.');
