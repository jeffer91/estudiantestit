/* Inicio autónomo de Coordinadores. */
(function(window,document){
  'use strict';

  var VERSION='2.5.0';
  var STORAGE_PROPIO='titulos_coordinadores_sheets_config_v1';
  var STORAGE_COMPATIBILIDAD='titulos_sheets_config_v1';
  var CONFIG_URL='https://firestore.googleapis.com/v1/projects/utet-4387a/databases/(default)/documents/app_config/titulos_sheets';

  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function valorFirestore(campo){
    if(!campo||typeof campo!=='object')return '';
    if(Object.prototype.hasOwnProperty.call(campo,'stringValue'))return campo.stringValue;
    if(Object.prototype.hasOwnProperty.call(campo,'booleanValue'))return campo.booleanValue;
    if(Object.prototype.hasOwnProperty.call(campo,'integerValue'))return Number(campo.integerValue);
    if(Object.prototype.hasOwnProperty.call(campo,'doubleValue'))return Number(campo.doubleValue);
    return '';
  }
  function normalizar(data,origen){
    data=data||{};
    return{
      endpoint:texto(data.endpoint||data.url||data.webAppUrl||data.appsScriptUrl||data.sheetsWebAppUrl||data.sheetsUrl||data.sheetsEndpoint),
      token:texto(data.token||data.sheetsToken||data.apiToken),
      activo:data.activo===false||data.sheetsActivo===false?false:true,
      timeoutMs:Math.max(5000,Number(data.timeoutMs||data.sheetsTimeoutMs||45000)||45000),
      nombre:texto(data.nombre||data.name||'Conexión de titulación'),
      actualizadoEn:new Date().toISOString(),
      origen:origen||'coordinadores'
    };
  }
  function leerLocal(clave){
    try{
      var raw=window.localStorage.getItem(clave);
      var cfg=normalizar(raw?JSON.parse(raw):null,'coordinadores-local');
      return cfg.endpoint?cfg:null;
    }catch(error){return null;}
  }
  function guardarLocal(configuracion){
    var cfg=normalizar(configuracion,'coordinadores-independiente');
    if(!cfg.endpoint)return null;
    try{
      window.localStorage.setItem(STORAGE_PROPIO,JSON.stringify(cfg));
      window.localStorage.setItem(STORAGE_COMPATIBILIDAD,JSON.stringify(cfg));
    }catch(error){}
    return cfg;
  }
  function leerConfiguracionCentral(){
    return fetch(CONFIG_URL,{method:'GET',cache:'no-store'})
      .then(function(respuesta){
        if(!respuesta.ok)throw new Error('No se pudo consultar la configuración central.');
        return respuesta.json();
      })
      .then(function(documento){
        var fields=documento&&documento.fields?documento.fields:{};
        var plano={};
        Object.keys(fields).forEach(function(clave){plano[clave]=valorFirestore(fields[clave]);});
        var cfg=normalizar(plano,'configuracion-central');
        if(!cfg.endpoint)throw new Error('La configuración central no contiene una URL válida.');
        return guardarLocal(cfg);
      });
  }
  function leerConfiguracionEstatica(){
    var config=window.CoordinadorMVPConfig;
    var endpoint=config&&typeof config.obtener==='function'?config.obtener('sheets.endpoint',''):'';
    if(!texto(endpoint))return null;
    return guardarLocal({endpoint:endpoint,activo:true,timeoutMs:config.obtener('sheets.timeoutMs',45000)});
  }
  function resolverConfiguracion(){
    return leerConfiguracionCentral().catch(function(errorCentral){
      var respaldo=leerLocal(STORAGE_PROPIO)||leerConfiguracionEstatica()||leerLocal(STORAGE_COMPATIBILIDAD);
      if(respaldo){guardarLocal(respaldo);return respaldo;}
      window.__COORDINADOR_CONFIG_ERROR=errorCentral;
      return null;
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
    if(periodo)periodo.innerHTML='<option value="">No disponible</option>';
    if(coordinador){coordinador.innerHTML='<option value="">No disponible</option>';coordinador.disabled=true;}
    if(estado){
      estado.className='status-message is-error';
      estado.textContent='No se pudo obtener la configuración de conexión. Actualiza la página e intenta nuevamente.';
    }
    console.error('[Coordinadores] Error de inicio:',error);
  }

  resolverConfiguracion()
    .then(function(configuracion){
      if(!configuracion||!configuracion.endpoint){
        throw window.__COORDINADOR_CONFIG_ERROR||new Error('Configuración no disponible.');
      }
      return cargarAplicacion();
    })
    .catch(mostrarError);

  window.CoordinadorMVPBootstrapIndependiente=Object.freeze({
    version:VERSION,
    resolverConfiguracion:resolverConfiguracion,
    storagePropio:STORAGE_PROPIO
  });
})(window,document);
