import fs from 'node:fs';

const path = 'apps-script/RESPALDO-TITULOS-APP/Codigo.gs';
if (!fs.existsSync(path)) {
  throw new Error('No existe el Código.gs corregido de RESPALDO TITULOS APP.');
}

const source = fs.readFileSync(path, 'utf8');
new Function(source);

for (const required of [
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_RESOLUCION_CEDULA',
  'consultarEnvioBasePorCedula',
  'consultarResolucionPorCedula',
  'buscarUltimaResolucionPorCedula'
]) {
  if (!source.includes(required)) {
    throw new Error('Código.gs no contiene: ' + required);
  }
}

console.log('[Apps Script] Consultas separadas de Envios y Resoluciones correctas.');
