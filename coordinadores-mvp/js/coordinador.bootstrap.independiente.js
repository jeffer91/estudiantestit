/* Inicio autónomo de Coordinadores usando únicamente RESPALDO TITULOS APP. */
(function(window,document){
  'use strict';
  var VERSION='2.8.0';
  var API_PUBLICA='https://titulos.pages.dev';
  var API_LOCAL='http://127.0.0.1:8788';
  var TIEMPO_INICIO=20000;

  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function esEntornoLocal(){var host=texto(window.location&&window.location.hostname).toLowerCase();return['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(host)>=0;}
  function usarProxyLocal(){if(window.TITULOS_USAR_PROXY_LOCAL===true)return true;try{return new URLSearchParams(window.location&&window.location.search||'').get('proxy')==='local';}catch(error){return false;}}
  function apiBase(){var configurada=texto(window.TITULOS_API_BASE||'');if(configurada)return configurada.replace(/\/$/,'');if(esEntornoLocal()||usarProxyLocal())return API_LOCAL;return API_PUBLICA;}
  window.TITULOS_API_BASE=apiBase();

  function comprobarServicio(){
    var controlador=typeof AbortController==='function'?new AbortController():null;
    var temporizador=controlador?setTimeout(function(){controlador.abort();},TIEMPO_INICIO):null;
    return fetch(apiBase()+'/api/titulos',{
      method:'POST',
      cache:'no-store',
      headers:{'Content-Type':'application/json','X-Titulos-App':'coordinadores'},
      body:JSON.stringify({accion:'CONFIGURACION_PUBLICA',metodo:'GET',datos:{}}),
      signal:controlador?controlador.signal:undefined
    }).then(function(respuesta){
      return respuesta.text().then(function(cuerpo){
        var json={};
        try{json=cuerpo?JSON.parse(cuerpo):{};}catch(errorJson){throw new Error('RESPALDO TITULOS APP respondió en un formato no válido.');}
        if(!respuesta.ok||json.ok===false||json.activo===false)throw new Error(json.mensaje||json.error||'RESPALDO TITULOS APP no está disponible.');
        return json;
      });
    }).catch(function(error){
      if(error&&error.name==='AbortError')throw new Error('La conexión con RESPALDO TITULOS APP superó 20 segundos.');
      throw error;
    }).finally(function(){if(temporizador)clearTimeout(temporizador);});
  }

  function cargarScript(ruta){return new Promise(function(resolve,reject){var script=document.createElement('script');script.src=ruta+'?v='+encodeURIComponent(VERSION);script.async=false;script.onload=function(){resolve(ruta);};script.onerror=function(){reject(new Error('No se pudo cargar '+ruta));};document.body.appendChild(script);});}
  function cargarAplicacion(){var archivos=['js/coordinador.sheets.primary.js','js/coordinador.catalogo.local.js','js/coordinador.envios.carreras.js','js/coordinador.ui.js','js/coordinador.modal.js','js/coordinador.app.js'];return archivos.reduce(function(promesa,ruta){return promesa.then(function(){return cargarScript(ruta);});},Promise.resolve());}
  function mostrarError(error){var estado=document.getElementById('estadoPrincipal'),periodo=document.getElementById('periodoSelect'),coordinador=document.getElementById('coordinadorSelect');if(periodo)periodo.innerHTML='<option value="">No disponible</option>';if(coordinador){coordinador.innerHTML='<option value="">No disponible</option>';coordinador.disabled=true;}if(estado){estado.className='status-message is-error';estado.textContent=error&&error.message?error.message:'No se pudo iniciar Coordinadores.';}console.error('[Coordinadores] Error de inicio:',error);}

  /* La interfaz se carga de inmediato. La aplicación principal maneja la conexión. */
  cargarAplicacion().catch(mostrarError);

  window.CoordinadorMVPBootstrapIndependiente=Object.freeze({version:VERSION,resolverConfiguracion:comprobarServicio,apiBase:apiBase});
})(window,document);
