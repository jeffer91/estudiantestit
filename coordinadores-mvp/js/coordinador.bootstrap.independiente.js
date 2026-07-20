/* Inicio autónomo de Coordinadores mediante la API central segura. */
(function(window,document){
  'use strict';
  var VERSION='2.6.0';
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function esLocal(){var h=texto(window.location&&window.location.hostname).toLowerCase();return ['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(h)>=0;}
  function apiBase(){var f=texto(window.TITULOS_API_BASE||'');if(f)return f.replace(/\/$/,'');if(esLocal())return 'http://127.0.0.1:8787';return 'https://titulos.pages.dev';}
  window.TITULOS_API_BASE=apiBase();
  function comprobar(){return fetch(apiBase()+'/api/sheets',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'coordinadores'},body:JSON.stringify({accion:'CONFIGURACION_PUBLICA',metodo:'GET',datos:{}})}).then(function(r){return r.json().then(function(j){if(!r.ok||j.ok===false||j.activo===false)throw new Error(j.mensaje||j.error||'La conexión no está disponible.');return j;});});}
  function cargarScript(ruta){return new Promise(function(resolve,reject){var s=document.createElement('script');s.src=ruta+'?v='+encodeURIComponent(VERSION);s.async=false;s.onload=function(){resolve(ruta);};s.onerror=function(){reject(new Error('No se pudo cargar '+ruta));};document.body.appendChild(s);});}
  function cargarAplicacion(){var archivos=['js/coordinador.sheets.primary.js','js/coordinador.catalogo.local.js','js/coordinador.envios.carreras.js','js/coordinador.ui.js','js/coordinador.modal.js','js/coordinador.app.js'];return archivos.reduce(function(p,r){return p.then(function(){return cargarScript(r);});},Promise.resolve());}
  function mostrarError(error){var estado=document.getElementById('estadoPrincipal');var periodo=document.getElementById('periodoSelect');var coordinador=document.getElementById('coordinadorSelect');if(periodo)periodo.innerHTML='<option value="">No disponible</option>';if(coordinador){coordinador.innerHTML='<option value="">No disponible</option>';coordinador.disabled=true;}if(estado){estado.className='status-message is-error';estado.textContent='No se pudo conectar con el servicio de titulación. Actualiza la página e intenta nuevamente.';}console.error('[Coordinadores] Error de inicio:',error);}
  comprobar().then(cargarAplicacion).catch(mostrarError);
  window.CoordinadorMVPBootstrapIndependiente=Object.freeze({version:VERSION,resolverConfiguracion:comprobar,apiBase:apiBase});
})(window,document);
