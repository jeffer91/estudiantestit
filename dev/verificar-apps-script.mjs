import fs from 'node:fs';

const legacyPath = 'apps-script/RESPALDO-TITULOS-APP/consulta-estudiantes.gs';

if (fs.existsSync(legacyPath)) {
  const source = fs.readFileSync(legacyPath, 'utf8');
  new Function(source);
  console.log('[Legado] Apps Script se conserva con sintaxis válida, pero ya no es la base activa.');
} else {
  console.log('[Legado] No hay Apps Script activo; la arquitectura usa Firebase.');
}

const firebaseFiles = [
  'functions/_lib/firestore.js',
  'functions/_lib/requisitos-firebase.js',
  'functions/_lib/titulos-firebase.js'
];

for (const file of firebaseFiles) {
  if (!fs.existsSync(file)) throw new Error('Falta el módulo Firebase: ' + file);
}

console.log('[Firebase] La operación activa usa UTET y Títulos mediante Cloudflare Functions.');
