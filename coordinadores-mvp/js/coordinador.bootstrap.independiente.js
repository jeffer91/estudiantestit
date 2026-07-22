/* Cargador autónomo de Coordinadores. */
(function(window,document){
  'use strict';

  var VERSION='2.8.4';

  function texto(valor){
    return String(valor===null||valor===undefined?'':valor).trim();
  }

  function esLocal(){
    var host=texto(window.location&&window.location.hostname).toLowerCase();
    return ['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(host)>=0;
  }

  function apiBase(){
    var definida=texto(window.TITULOS_API_BASE||'');
    if(definida)return definida.replace(/\/$/,'');
    if(esLocal())return 'http://127.0.0.1:8788';

    var host=texto(window.location&&window.location.hostname).toLowerCase();

    /*
      El enlace oficial usa sus propias Pages Functions.
      El dominio histórico se conserva como acceso compatible, pero sus
      solicitudes se dirigen al proyecto oficial para evitar configuraciones
      y secretos duplicados.
    */
    if(host==='coordinadores.pages.dev'){
      return 'https://titulos-coordinadores.pages.dev';
    }

    var origen=texto(window.location&&window.location.origin);
    if(/^https?:\/\//i.test(origen))return origen.replace(/\/$/,'');
    return 'https://titulos-coordinadores.pages.dev';
  }

  window.TITULOS_API_BASE=apiBase();

  function cargarScript(ruta){
    return new Promise(function(resolve,reject){
      var script=document.createElement('script');
      script.src=ruta+'?v='+encodeURIComponent(VERSION);
      script.async=false;
      script.onload=function(){resolve(ruta);};
      script.onerror=function(){reject(new Error('No se pudo cargar '+ruta));};
      document.body.appendChild(script);
    });
  }

  function cargarAplicacion(){
    var archivos=[
      'js/coordinador.sheets.primary.js',
      'js/coordinador.catalogo.local.js',
      'js/coordinador.envios.carreras.js',
      'js/coordinador.ui.js',
      'js/coordinador.modal.js',
      'js/coordinador.app.js'
    ];
    return archivos.reduce(function(promesa,ruta){
      return promesa.then(function(){return cargarScript(ruta);});
    },Promise.resolve());
  }

  function mostrarError(error){
    var estado=document.getElementById('estadoPrincipal');
    var periodo=document.getElementById('periodoSelect');
    var coordinador=document.getElementById('coordinadorSelect');
    if(periodo)periodo.innerHTML='<option value="">No disponible</option>';
    if(coordinador){
      coordinador.innerHTML='<option value="">No disponible</option>';
      coordinador.disabled=true;
    }
    if(estado){
      estado.className='status-message is-error';
      estado.textContent=error&&error.message?error.message:'No se pudo iniciar Coordinadores.';
    }
    console.error('[Coordinadores] Error de inicio:',error);
  }

  cargarAplicacion().catch(mostrarError);
  window.CoordinadorMVPBootstrapIndependiente=Object.freeze({version:VERSION,apiBase:apiBase});
})(window,document);
