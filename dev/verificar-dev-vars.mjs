import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const envPath = path.join(process.cwd(), '.dev.vars');

if (!fs.existsSync(envPath)) {
  console.log('[Configuración local] No existe .dev.vars; se usarán las configuraciones web de Firebase.');
  console.log('[Configuración local] El respaldo de Google Sheets se buscará en Firebase Títulos/servicios.');
  process.exit(0);
}

const content = fs.readFileSync(envPath, 'utf8');
const firebaseDetected = [
  'TITULOS_FIREBASE_SERVICE_ACCOUNT',
  'UTET_FIREBASE_SERVICE_ACCOUNT'
].filter((name) => new RegExp('^\\s*' + name + '\\s*=', 'm').test(content));

const sheetsDetected = [
  'REQUISITOS_SHEETS_URL',
  'REQUISITOS_SHEETS_TOKEN',
  'REQUISITOS_SHEETS_ID'
].filter((name) => new RegExp('^\\s*' + name + '\\s*=', 'm').test(content));

if (firebaseDetected.length) {
  console.log('[Configuración local] Cuentas de servicio opcionales: ' + firebaseDetected.join(', '));
} else {
  console.log('[Configuración local] Firebase usará las configuraciones web incluidas.');
}

if (sheetsDetected.length === 3) {
  console.log('[Configuración local] Respaldo Google Sheets configurado para la hoja Estudiantes.');
} else if (sheetsDetected.length) {
  console.log('[Configuración local] Respaldo Google Sheets incompleto. Faltan variables en .dev.vars.');
} else {
  console.log('[Configuración local] El respaldo Google Sheets se buscará en Firebase Títulos/servicios.');
}

console.log('[Configuración local] Flujo: UTET → Google Sheets Estudiantes → Firebase Títulos.');
