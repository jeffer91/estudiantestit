/* Compatibilidad administrativa: /api/sheets usa el backend Firebase de Titulación. */
(function(window){
  'use strict';
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function numero(v,f){var n=Number(v);return Number.isFinite(n)?n:Number(f||0);}
  function esLocal(){var h=texto(window.location&&window.location.hostname).toLowerCase();return ['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(h)>=0;}
  function apiBase(){var f=texto(window.TITULOS_API_BASE||'');if(f)return f.replace(/\/$/,'');if(esLocal())return 'http://127.0.0.1:5001/titulos-ec2fa/us-central1';return 'https://us-central1-titulos-ec2fa.cloudfunctions.net';}
  function proxyUrl(){return apiBase()+'/api/sheets';}
  function mensajeError(v){if(v&&v.message)return v.message;if(typeof v==='string')return v;return 'Error del backend Firebase.';}
  function solicitar(accion,payload,metodo){return fetch(proxyUrl(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify({accion:accion,metodo:metodo||'POST',datos:payload||{}})}).then(function(resp){return resp.text().then(function(body){var json={};try{json=body?JSON.parse(body):{};}catch(e){throw new Error('El backend Firebase respondió en un formato no válido.');}if(!resp.ok||json.ok===false)throw new Error(json.mensaje||json.message||json.error||('Error HTTP '+resp.status));return json;});});}
  function leerConfiguracion(){return Promise.resolve({endpoint:proxyUrl(),url:proxyUrl(),activo:true,timeoutMs:45000,nombre:'Backend Firebase Titulación',actualizadoEn:'',origen:'firebase-functions'});}
  function guardarConfiguracion(){return Promise.reject(new Error('La conexión Firebase se configura en el backend y no desde el navegador.'));}
  function envolver(data){return{ok:true,status:200,data:data,configuracion:{origen:'firebase-functions'}};}
  function enviarGet(accion,payload){return solicitar(accion,payload,'GET').then(envolver);}
  function enviarPost(accion,payload){return solicitar(accion,payload,'POST').then(envolver);}
  function enviarAccion(accion,payload){var lecturas=['PING','LISTAR_COORDINADORES','LISTAR_PERIODOS_TITULACION','LISTAR_ENVIOS_COORDINADOR','LISTAR_ENVIOS_POR_CARRERA','VERIFICAR_ENVIO','CONSULTAR_ENVIO_CEDULA','RESUMEN_ADMINISTRADOR','LISTAR_BASE_ESTUDIANTES','LISTAR_PENDIENTES_SYNC','LISTAR_HISTORIAL_REPARACIONES','LISTAR_LOGS','ANALIZAR_GOOGLE_SHEETS','CONSULTAR_ESTUDIANTE'];return lecturas.indexOf(String(accion||'').toUpperCase())>=0?enviarGet(accion,payload):enviarPost(accion,payload);}
  function extraerLista(respuesta){var d=respuesta&&respuesta.data!==undefined?respuesta.data:respuesta;if(Array.isArray(d))return d;if(!d||typeof d!=='object')return[];var c=[d.envios,d.coordinadores,d.estudiantes,d.periodos,d.registros,d.pendientes,d.casos,d.historial,d.logs,d.resultado,d.result,d.data,d.data&&d.data.envios,d.data&&d.data.coordinadores,d.data&&d.data.estudiantes,d.data&&d.data.periodos];for(var i=0;i<c.length;i+=1)if(Array.isArray(c[i]))return c[i];return[];}
  function probarPing(){return enviarGet('PING',{});}
  function probarCoordinadores(){return enviarGet('LISTAR_COORDINADORES',{});}
  function probarEnvios(){return enviarGet('LISTAR_ENVIOS_POR_CARRERA',{carreras:'',carrera:'',estado:''});}
  function consultarCedula(cedula,periodo){cedula=texto(cedula).replace(/\D/g,'');if(!cedula)return Promise.reject(new Error('Ingresa una cédula.'));return enviarGet('VERIFICAR_ENVIO',{cedula:cedula,numeroIdentificacion:cedula,periodo:texto(periodo)});}
  window.ADSheetsService={STORAGE_KEY:'sin-localstorage',leerConfiguracion:leerConfiguracion,guardarConfiguracion:guardarConfiguracion,importarDesdeFirebase:leerConfiguracion,enviarAccion:enviarAccion,enviarGet:enviarGet,enviarPost:enviarPost,probarPing:probarPing,probarCoordinadores:probarCoordinadores,probarEnvios:probarEnvios,consultarCedula:consultarCedula,analizarGoogleSheets:function(p){return enviarGet('ANALIZAR_GOOGLE_SHEETS',p||{});},corregirGoogleSheets:function(p){return enviarPost('CORREGIR_GOOGLE_SHEETS',p||{});},listarHistorialReparaciones:function(l){return enviarGet('LISTAR_HISTORIAL_REPARACIONES',{limite:Math.max(1,numero(l,100))});},extraerLista:extraerLista,normalizar:function(d){return d||{};},mensajeError:mensajeError,proxyUrl:proxyUrl};
})(window);
