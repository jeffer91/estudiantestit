import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const envPath = path.join(process.cwd(), '.dev.vars');
const required = [
  'TITULOS_FIREBASE_SERVICE_ACCOUNT',
  'UTET_FIREBASE_SERVICE_ACCOUNT'
];

if (!fs.existsSync(envPath)) {
  console.error('[Configuración local] Falta .dev.vars.');
  console.error('[Configuración local] Copia .dev.vars.example como .dev.vars y agrega las dos cuentas de servicio.');
  process.exit(1);
}

const content = fs.readFileSync(envPath, 'utf8');
const missing = required.filter((name) => !new RegExp('^\\s*' + name + '\\s*=', 'm').test(content));

if (missing.length) {
  console.error('[Configuración local] Faltan variables obligatorias: ' + missing.join(', '));
  process.exit(1);
}

console.log('[Configuración local] Credenciales de Títulos y UTET detectadas en .dev.vars.');
console.log('[Configuración local] UTET=utet-4387a; Títulos=titulos-ec2fa; acceso mediante Cloudflare Functions.');
