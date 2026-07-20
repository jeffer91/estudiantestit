/** Configuración base de la hoja Claves. */
var CLAVES_VERSION='1.0.0-google-sheets-central';
var CLAVES_HEADERS={
  Servicios:['clave','nombre','tipo','endpoint','secreto','spreadsheetId','estado','timeoutMs','version','mensaje','actualizadoEn'],
  IA:['id','nombre','tipo','endpoint','modelo','credencial','estado','prioridad','timeoutMs','maxTokens','temperatura','descripcion','ultimaPruebaOk','ultimaPruebaEn','ultimaLatenciaMs','ultimoError','actualizadoEn'],
  Configuracion:['clave','valor','descripcion','actualizadoEn'],
  Logs:['fecha','accion','estado','detalle']
};
function prepararClavesCentral(){
  var ss=SpreadsheetApp.getActiveSpreadsheet();
  if(!ss)throw new Error('Abre el proyecto desde la hoja Claves.');
  Object.keys(CLAVES_HEADERS).forEach(function(n){clavesHoja_(ss,n);});
  var acceso=clavesConfigValor_('ACCESO_PROXY');
  if(!acceso){acceso='CLAVES_'+Utilities.getUuid().replace(/-/g,'').toUpperCase();clavesGuardarConfig_('ACCESO_PROXY',acceso,'Acceso privado del proxy.');}
  clavesGuardarConfig_('ESTADO_GENERAL','ACTIVO','Estado global.');
  clavesGuardarConfig_('VERSION',CLAVES_VERSION,'Versión central.');
  if(!clavesBuscarFila_('Servicios',1,'TITULOS'))clavesGuardarServicio_({clave:'TITULOS',nombre:'RESPALDO TITULOS APP',estado:'INACTIVO',timeoutMs:45000,mensaje:'Configura endpoint y estado.'});
  if(!clavesBuscarFila_('Servicios',1,'REQUISITOS'))clavesGuardarServicio_({clave:'REQUISITOS',nombre:'REQUISITOS_BDLOCAL_SYNC',estado:'INACTIVO',timeoutMs:45000,mensaje:'Configura endpoint, secreto y estado.'});
  ['gemini','groq','openrouter'].forEach(function(id){if(!clavesBuscarFila_('IA',1,id))clavesGuardarIA_({id:id,nombre:id.charAt(0).toUpperCase()+id.slice(1),tipo:id==='gemini'?'gemini':'openai-compatible',endpoint:id==='groq'?'https://api.groq.com/openai/v1/chat/completions':id==='openrouter'?'https://openrouter.ai/api/v1/chat/completions':'',estado:'INACTIVO',prioridad:id==='gemini'?1:id==='groq'?2:3,timeoutMs:45000,maxTokens:3000,temperatura:0.3});});
  SpreadsheetApp.flush();
  Logger.log('ACCESO_PROXY: '+acceso);
  return{ok:true,accesoProxy:acceso,hojas:Object.keys(CLAVES_HEADERS),version:CLAVES_VERSION};
}
function clavesHoja_(ss,n){var h=ss.getSheetByName(n)||ss.insertSheet(n),heads=CLAVES_HEADERS[n];h.getRange(1,1,1,heads.length).setValues([heads]).setFontWeight('bold').setBackground('#0b1f3a').setFontColor('#fff');h.setFrozenRows(1);return h;}
function clavesTexto_(v){return String(v===null||v===undefined?'':v).trim();}
function clavesId_(v){return clavesTexto_(v).toLowerCase().replace(/[^a-z0-9_-]/g,'');}
function clavesActivo_(v){return['ACTIVO','TRUE','SI','1'].indexOf(clavesTexto_(v).toUpperCase())>=0;}
function clavesBuscarFila_(n,c,v){var h=clavesHoja_(SpreadsheetApp.getActiveSpreadsheet(),n);if(h.getLastRow()<2)return 0;var b=clavesTexto_(v).toLowerCase(),a=h.getRange(2,c,h.getLastRow()-1,1).getValues();for(var i=a.length-1;i>=0;i--)if(clavesTexto_(a[i][0]).toLowerCase()===b)return i+2;return 0;}
function clavesFilaObjeto_(n,f){var hs=CLAVES_HEADERS[n],v=SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n).getRange(f,1,1,hs.length).getValues()[0],o={};hs.forEach(function(h,i){o[h]=v[i];});return o;}
function clavesFilas_(n){var h=clavesHoja_(SpreadsheetApp.getActiveSpreadsheet(),n),hs=CLAVES_HEADERS[n];if(h.getLastRow()<2)return[];return h.getRange(2,1,h.getLastRow()-1,hs.length).getValues().map(function(v){var o={};hs.forEach(function(x,i){o[x]=v[i];});return o;});}
function clavesUpsert_(n,c,k,f){var h=clavesHoja_(SpreadsheetApp.getActiveSpreadsheet(),n),r=clavesBuscarFila_(n,c,k);if(r)h.getRange(r,1,1,f.length).setValues([f]);else h.appendRow(f);}
function clavesConfigValor_(k){var r=clavesBuscarFila_('Configuracion',1,clavesTexto_(k).toUpperCase());return r?clavesTexto_(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Configuracion').getRange(r,2).getValue()):'';}
function clavesGuardarConfig_(k,v,d){k=clavesTexto_(k).toUpperCase();if(!k)throw new Error('Falta clave de configuración.');clavesUpsert_('Configuracion',1,k,[k,clavesTexto_(v),clavesTexto_(d),new Date().toISOString()]);return{ok:true,clave:k,valor:clavesTexto_(v)};}
function clavesLog_(a,e,d){clavesHoja_(SpreadsheetApp.getActiveSpreadsheet(),'Logs').appendRow([new Date(),a,e,d]);}
function clavesJson_(o){return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);}
