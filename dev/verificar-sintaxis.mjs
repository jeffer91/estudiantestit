import fs from 'node:fs';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

const files = [
  'functions/_lib/http.js',
  'functions/_lib/firestore.js',
  'functions/_lib/firestore-fixed.js',
  'functions/_lib/requisitos-firebase.js',
  'functions/_lib/requisitos-firebase-fast.js',
  'functions/_lib/requisitos-firebase-fixed.js',
  'functions/_lib/requisitos-sheets-fallback.js',
  'functions/_lib/titulos-firebase.js',
  'functions/_lib/titulos-firebase-fixed.js',
  'functions/_lib/titulos-firebase-v6.js',
  'functions/_lib/titulos-firebase-v7.js',
  'functions/_lib/admin-global-fixed.js',
  'functions/_lib/admin-global-v5.js',
  'functions/_lib/admin-global-v6.js',
  'functions/_lib/firebase-titulos-report.js',
  'functions/_lib/estadisticas-admin.js',
  'functions/_lib/ia-firebase.js',
  'functions/_lib/claves.js',
  'functions/api/claves.js',
  'functions/api/titulos.js',
  'functions/api/estadisticas.js',
  'functions/api/acceso-estudiante.js',
  'functions/api/requisitos.js',
  'functions/api/ia.js',
  'estudiantes-mvp/js/requisitos.estudiantes.service.js',
  'estudiantes-mvp/js/titulos.cola.service.js',
  'estudiantes-mvp/js/ia.config.service.js',
  'estudiantes-mvp/js/sheets.service.js',
  'estudiantes-mvp/js/ia.providers.service.js',
  'estudiantes-mvp/js/estudiante.consulta.revision.js',
  'coordinadores-mvp/js/coordinador.bootstrap.independiente.js',
  'coordinadores-mvp/js/coordinador.sheets.primary.js',
  'coordinadores-mvp/js/coordinador.catalogo.local.js',
  'coordinadores-mvp/js/coordinador.envios.carreras.js',
  'coordinadores-mvp/js/coordinador.state.js',
  'coordinadores-mvp/js/coordinador.app.js',
  'administrador/ad-js/ad-api.service.js',
  'administrador/ad-js/ad-google-sheets.app.js',
  'administrador/ad-js/ad-administracion-global.js',
  'administrador/ad-js/ad-correo-outlook.js',
  'administrador/ad-js/ad-pdf-firebase.js',
  'administrador/ad-js/ad-version.js',
  'administrador/ad-js/ad-servicios.app.js',
  'electron/administrador/main.cjs',
  'electron/administrador/preload.cjs',
  'electron/administrador/cache.cjs',
  'dev/preparar-pages-local.mjs',
  'dev/preparar-pages-estudiantes.mjs',
  'dev/preparar-pages-coordinadores.mjs',
  'dev/preparar-pages-administrador.mjs',
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
