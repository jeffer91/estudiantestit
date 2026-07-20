/* Inicio autónomo de Coordinadores mediante la API central segura. */
(function(window,document){
  'use strict';
  var VERSION='2.6.2';
  var API_PUBLICA='https://titulos.pages.dev';
  var API_LOCAL='http://127.0.0.1:8788';

  function texto(v){
    return String(v===null||v===undefined?'':v).trim();
  }

  function esEntornoLocal(){
    var host=texto(window.location&&window.location.hostname).toLowerCase();
    return ['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(host)>=0;
  }

  function usarProxyLocal(){
    var parametros;

    if(window.TITULOS_USAR_PROXY_LOCAL===true){
      return true;
    }

    try{
      parametros=new URLSearchParams(window.location&&window.location.search||'');
      return parametros.get('proxy')==='local';
    }catch(error){
      return false;
    }
  }

  function apiBase(){
    var configurada=texto(window.TITULOS_API_BASE||'');

    if(configurada){
      return configurada.replace(/\/$/,'');
    }

    /*
      Live Server y Wrangler local utilizan la API local del puerto 8788.
      Doble clic y Cloudflare publicado utilizan la API pública.
      También puede forzarse el modo local con ?proxy=local.
    */
    if(esEntornoLocal()||usarProxyLocal()){
      return API_LOCAL;
    }

    return API_PUBLICA;
  }

  window.TITULOS_API_BASE=apiBase();

  function comprobar(){
    return fetch(apiBase()+'/api/sheets',{
      method:'POST',
      cache:'no-store',
      headers:{
        'Content-Type':'application/json',
        'X-Titulos-App':'coordinadores'
      },
      body:JSON.stringify({
        accion:'CONFIGURACION_PUBLICA',
        metodo:'GET',
        datos:{}
      })
    }).then(function(respuesta){
      return respuesta.text().then(function(cuerpo){
        var json={};

        try{
          json=cuerpo?JSON.parse(cuerpo):{};
        }catch(errorJson){
          throw new Error('El servicio de titulación respondió en un formato no válido.');
        }

        if(!respuesta.ok||json.ok===false||json.activo===false){
          throw new Error(json.mensaje||json.error||'La conexión no está disponible.');
        }

        return json;
      });
    });
  }

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

    if(periodo){
      periodo.innerHTML='<option value="">No disponible</option>';
    }

    if(coordinador){
      coordinador.innerHTML='<option value="">No disponible</option>';
      coordinador.disabled=true;
    }

    if(estado){
      estado.className='status-message is-error';
      estado.textContent='No se pudo conectar con el servicio de titulación. Actualiza la página e intenta nuevamente.';
    }

    console.error('[Coordinadores] Error de inicio:',error);
  }

  comprobar().then(cargarAplicacion).catch(mostrarError);

  window.CoordinadorMVPBootstrapIndependiente=Object.freeze({
    version:VERSION,
    resolverConfiguracion:comprobar,
    apiBase:apiBase
  });
})(window,document);
