import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const envPath = path.join(process.cwd(), '.dev.vars');

if (fs.existsSync(envPath)) {
  console.log('[Configuración local] .dev.vars detectado; sus valores opcionales se conservarán.');
} else {
  console.log('[Configuración local] No se requiere .dev.vars para conectar las dos Firebase.');
}

console.log('[Configuración local] UTET=utet-4387a; Títulos=titulos-ec2fa; acceso mediante Cloudflare Functions.');
