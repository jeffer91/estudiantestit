import fs from 'node:fs';

const path = 'apps-script/RESPALDO-TITULOS-APP/consulta-estudiantes.gs';
if (!fs.existsSync(path)) {
  throw new Error('No existe el módulo de consultas de RESPALDO TITULOS APP.');
}

const source = fs.readFileSync(path, 'utf8');
new Function(source);

for (const required of [
  'procesarConsultaSeparadaPorAccion',
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_RESOLUCION_CEDULA',
  'consultarEnvioBasePorCedula',
  'consultarResolucionPorCedula',
  'buscarUltimaResolucionPorCedula'
]) {
  if (!source.includes(required)) {
    throw new Error('El módulo de Apps Script no contiene: ' + required);
  }
}

console.log('[Apps Script] Consultas separadas de Envios y Resoluciones correctas.');
