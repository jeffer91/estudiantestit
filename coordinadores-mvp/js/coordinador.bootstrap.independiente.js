/* Inicio autónomo de Coordinadores con Títulos y Requisitos desde Claves. */
(function(window,document){
  'use strict';
  var VERSION='2.7.0';
  var API_PUBLICA='https://titulos.pages.dev';
  var API_LOCAL='http://127.0.0.1:8788';
  var TIEMPO_INICIO=20000;
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function esEntornoLocal(){var host=texto(window.location&&window.location.hostname).toLowerCase();return['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(host)>=0;}
  function usarProxyLocal(){if(window.TITULOS_USAR_PROXY_LOCAL===true)return true;try{return new URLSearchParams(window.location&&window.location.search||'').get('proxy')==='local';}catch(error){return false;}}
  function apiBase(){var configurada=texto(window.TITULOS_API_BASE||'');if(configurada)return configurada.replace(/\/$/,'');if(esEntornoLocal()||usarProxyLocal())return API_LOCAL;return API_PUBLICA;}
  window.TITULOS_API_BASE=apiBase();
  function comprobarServicio(ruta,nombre){var controlador=typeof AbortController==='function'?new AbortController():null;var temporizador=controlador?setTimeout(function(){controlador.abort();},TIEMPO_INICIO):null;return fetch(apiBase()+ruta,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'coordinadores'},body:JSON.stringify({accion:'CONFIGURACION_PUBLICA',metodo:'GET',datos:{}}),signal:controlador?controlador.signal:undefined}).then(function(respuesta){return respuesta.text().then(function(cuerpo){var json={};try{json=cuerpo?JSON.parse(cuerpo):{};}catch(errorJson){throw new Error(nombre+' respondió en un formato no válido.');}if(!respuesta.ok||json.ok===false||json.activo===false)throw new Error(json.mensaje||json.error||nombre+' no está disponible.');return json;});}).catch(function(error){if(error&&error.name==='AbortError')throw new Error('La conexión local superó 20 segundos. Revisa CLAVES_APPS_SCRIPT_URL y CLAVES_ACCESS_TOKEN en .dev.vars.');throw error;}).finally(function(){if(temporizador)clearTimeout(temporizador);});}
  function comprobar(){return Promise.all([comprobarServicio('/api/titulos','RESPALDO TITULOS APP'),comprobarServicio('/api/requisitos','REQUISITOS_BDLOCAL_SYNC')]).then(function(partes){return{ok:true,titulos:partes[0],requisitos:partes[1]};});}
  function cargarScript(ruta){return new Promise(function(resolve,reject){var script=document.createElement('script');script.src=ruta+'?v='+encodeURIComponent(VERSION);script.async=false;script.onload=function(){resolve(ruta);};script.onerror=function(){reject(new Error('No se pudo cargar '+ruta));};document.body.appendChild(script);});}
  function cargarAplicacion(){var archivos=['js/coordinador.sheets.primary.js','js/coordinador.catalogo.local.js','js/coordinador.envios.carreras.js','js/coordinador.ui.js','js/coordinador.modal.js','js/coordinador.app.js'];return archivos.reduce(function(promesa,ruta){return promesa.then(function(){return cargarScript(ruta);});},Promise.resolve());}
  function mostrarError(error){var estado=document.getElementById('estadoPrincipal'),periodo=document.getElementById('periodoSelect'),coordinador=document.getElementById('coordinadorSelect');if(periodo)periodo.innerHTML='<option value="">No disponible</option>';if(coordinador){coordinador.innerHTML='<option value="">No disponible</option>';coordinador.disabled=true;}if(estado){estado.className='status-message is-error';estado.textContent=error&&error.message?error.message:'No se pudo conectar con los servicios de titulación.';}console.error('[Coordinadores] Error de inicio:',error);}
  comprobar().then(cargarAplicacion).catch(mostrarError);
  window.CoordinadorMVPBootstrapIndependiente=Object.freeze({version:VERSION,resolverConfiguracion:comprobar,apiBase:apiBase});
})(window,document);
