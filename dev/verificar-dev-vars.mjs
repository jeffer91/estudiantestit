import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const envPath = path.join(process.cwd(), '.dev.vars');

if (!fs.existsSync(envPath)) {
  console.log('[Configuración local] No existe .dev.vars; se usarán las configuraciones web de Firebase.');
  console.log('[Configuración local] El acceso dependerá de las reglas actuales de Firestore.');
  process.exit(0);
}

const content = fs.readFileSync(envPath, 'utf8');
const detected = [
  'TITULOS_FIREBASE_SERVICE_ACCOUNT',
  'UTET_FIREBASE_SERVICE_ACCOUNT'
].filter((name) => new RegExp('^\\s*' + name + '\\s*=', 'm').test(content));

if (detected.length) {
  console.log('[Configuración local] Cuentas de servicio opcionales detectadas: ' + detected.join(', '));
} else {
  console.log('[Configuración local] .dev.vars no contiene cuentas de servicio; se usarán las configuraciones web.');
}

console.log('[Configuración local] UTET=utet-4387a; Títulos=titulos-ec2fa; acceso mediante Cloudflare Functions.');
