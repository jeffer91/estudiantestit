import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const files = [
  'firebase-backend/functions/_lib/http.js',
  'firebase-backend/functions/_lib/firestore.js',
  'firebase-backend/functions/_lib/firestore-fixed.js',
  'firebase-backend/functions/_lib/workflow-titulacion.js',
  'firebase-backend/functions/_lib/titulos-historial.js',
  'firebase-backend/functions/_lib/requisitos-firebase.js',
  'firebase-backend/functions/_lib/requisitos-firebase-fast.js',
  'firebase-backend/functions/_lib/requisitos-firebase-fixed.js',
  'firebase-backend/functions/_lib/titulos-firebase.js',
  'firebase-backend/functions/_lib/titulos-firebase-fixed.js',
  'firebase-backend/functions/_lib/titulos-firebase-v6.js',
  'firebase-backend/functions/_lib/titulos-firebase-v7.js',
  'firebase-backend/functions/_lib/trabajo-titulacion-unificado.js',
  'firebase-backend/functions/_lib/admin-global-fixed.js',
  'firebase-backend/functions/_lib/admin-global-v5.js',
  'firebase-backend/functions/_lib/admin-global-v6.js',
  'firebase-backend/functions/_lib/admin-global-v8.js',
  'firebase-backend/functions/_lib/firebase-titulos-report.js',
  'firebase-backend/functions/_lib/estadisticas-admin.js',
  'firebase-backend/functions/_lib/admin-global-state.js',
  'firebase-backend/functions/_lib/revisiones-admin.js',
  'firebase-backend/functions/_lib/ia-firebase.js',
  'firebase-backend/functions/_lib/claves.js',
  'firebase-backend/functions/api/claves.js',
  'firebase-backend/functions/api/titulos.js',
  'firebase-backend/functions/api/trabajo-titulacion.js',
  'firebase-backend/functions/api/investigadores.js',
  'firebase-backend/functions/api/historial-titulos.js',
  'firebase-backend/functions/api/admin-trabajo-titulacion.js',
  'firebase-backend/functions/api/estadisticas.js',
  'firebase-backend/functions/api/acceso-estudiante.js',
  'firebase-backend/functions/api/requisitos.js',
  'firebase-backend/functions/api/ia.js',
  'firebase-backend/functions/index.js',
  'firebase-backend/functions/_lib/neon-learning.js',
  'firebase-backend/functions/api/aprendizaje.js',
  'firebase-backend/functions/api/ia.js',
  'firebase-backend/functions/api/investigadores.js',
  'firebase-backend/functions/api/admin-flujo.js',
  'estudiantes-mvp/js/requisitos.estudiantes.service.js',
  'estudiantes-mvp/js/titulos.cola.service.js',
  'estudiantes-mvp/js/ia.config.service.js',
  'estudiantes-mvp/js/sheets.service.js',
  'estudiantes-mvp/js/ia.providers.service.js',
  'estudiantes-mvp/js/ia.biblioteca.academica.js',
  'estudiantes-mvp/js/ia.linguistica.service.js',
  'estudiantes-mvp/js/ia.aprendizaje.service.js',
  'estudiantes-mvp/js/ia.nueve.core.js',
  'estudiantes-mvp/js/ia.nueve.integracion.js',
  'estudiantes-mvp/js/ia.fallback.secuencial.patch.js',
  'estudiantes-mvp/js/estudiante.consulta.revision.js',
  'estudiantes-mvp/js/titulos.historial.publico.js',
  'trabajo-titulacion-mvp/js/trabajo-titulacion.js',
  'coordinadores-mvp/js/coordinador.bootstrap.independiente.js',
  'coordinadores-mvp/js/coordinador.sheets.primary.js',
  'coordinadores-mvp/js/coordinador.catalogo.local.js',
  'coordinadores-mvp/js/coordinador.envios.carreras.js',
  'coordinadores-mvp/js/coordinador.state.js',
  'coordinadores-mvp/js/coordinador.ui.js',
  'coordinadores-mvp/js/coordinador.modal.js',
  'coordinadores-mvp/js/coordinador.trabajo-titulacion.js',
  'coordinadores-mvp/js/coordinador.app.js',
  'investigadores-mvp/js/investigadores.app.js',
  'administrador/ad-js/ad-api.service.js',
  'administrador/ad-js/ad-google-sheets.app.js',
  'administrador/ad-js/ad-administracion-global.js',
  'administrador/ad-js/ad-ia.service.js',
  'administrador/ad-js/ad-correo-outlook.js',
  'administrador/ad-js/ad-pdf-firebase.js',
  'administrador/ad-js/ad-version.js',
  'administrador/ad-js/ad-servicios.app.js',
  'administrador/ad-js/ad-estadisticas-minimal.js',
  'administrador/ad-js/ad-estadisticas-control.patch.js',
  'administrador/ad-js/ad-performance.patch.js',
  'administrador/ad-js/ad-titulos-admin.patch.js',
  'administrador/ad-js/ad-trabajo-titulacion-admin.patch.js',
  'electron/administrador/main.cjs',
  'electron/administrador/preload.cjs',
  'electron/administrador/cache.cjs',
  'dev/preparar-pages-local.mjs',
  'dev/preparar-pages-estudiantes.mjs',
  'dev/preparar-pages-coordinadores.mjs',
  'dev/preparar-pages-investigadores.mjs',
  'dev/preparar-pages-administrador.mjs',
  'dev/verificar-batch-firestore.mjs',
  'dev/verificar-apps.mjs',
  'dev/verificar-correo-outlook.mjs',
  'dev/verificar-arquitectura.mjs',
  'dev/verificar-firebase-auth.mjs',
  'dev/verificar-logica-acceso.mjs',
  'dev/verificar-apps-script.mjs',
  'dev/verificar-electron-administrador.mjs',
  'dev/verificar-sintaxis.mjs'
];

const errors = [];
for (const file of files) {
  if (!fs.existsSync(file)) {
    errors.push(`Falta: ${file}`);
    continue;
  }
  const result = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (result.status !== 0) {
    errors.push(`${file}\n${String(result.stderr || result.stdout || '').trim()}`);
  }
}

if (errors.length) {
  console.error('\n[Sintaxis] Se encontraron errores:\n');
  errors.forEach((error, index) => console.error(`${index + 1}. ${error}`));
  console.error('');
  process.exit(1);
}

console.log(`[Sintaxis] Correcta en ${files.length} archivos.`);
