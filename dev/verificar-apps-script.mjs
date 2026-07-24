import fs from 'node:fs';

const legacyPath = 'apps-script/RESPALDO-TITULOS-APP/consulta-estudiantes.gs';
const fastQueryPath = 'google-apps-script/REQUISITOS_CONSULTA_RAPIDA.gs';

if (fs.existsSync(legacyPath)) {
  const source = fs.readFileSync(legacyPath, 'utf8');
  new Function(source);
  console.log('[Legado] Apps Script histórico conserva sintaxis válida.');
}

if (!fs.existsSync(fastQueryPath)) {
  throw new Error('Falta el parche de consulta rápida para la hoja Estudiantes.');
}

const fastSource = fs.readFileSync(fastQueryPath, 'utf8');
new Function(fastSource);

if (!/handleConsultarEstudianteRapido_/.test(fastSource)) {
  throw new Error('El parche no define la consulta rápida del estudiante.');
}
if (!/getSheetByName\("Estudiantes"\)/.test(fastSource)) {
  throw new Error('El parche no está limitado a la hoja Estudiantes.');
}
if (!/createTextFinder/.test(fastSource)) {
  throw new Error('El parche no busca la cédula de forma directa.');
}
if (/ensureAllSheets_|handlePullBL2_/.test(fastSource)) {
  throw new Error('El parche ejecuta procesos pesados que no corresponden a una consulta individual.');
}

const firebaseFiles = [
  'functions/_lib/firestore.js',
  'functions/_lib/requisitos-firebase-fast.js',
  'functions/_lib/requisitos-sheets-fallback.js',
  'functions/_lib/titulos-firebase-v7.js'
];

for (const file of firebaseFiles) {
  if (!fs.existsSync(file)) throw new Error('Falta el módulo: ' + file);
}

console.log('[Apps Script] Consulta rápida preparada para la hoja Estudiantes.');
console.log('[Firebase] Estudiantes usa UTET primero y Firebase Títulos después.');
