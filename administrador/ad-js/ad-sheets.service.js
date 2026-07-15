/* =========================================================
Archivo: ad-sheets.service.js
Ruta: /administrador/ad-js/ad-sheets.service.js
Función:
- Administrar la conexión principal con Google Sheets sin depender de Firebase.
- Guardar URL, token y estado en localStorage para compartirlos con Coordinadores.
- Importar una sola vez la configuración antigua guardada en Firebase.
- Probar las acciones reales del Apps Script actual mediante GET.
========================================================= */
(function(window){
  "use strict";

  var STORAGE_KEY="titulos_sheets_config_v1";
  var cache=null;

  function texto(valor){return String(valor===null||valor===undefined?"":valor).trim();}
  function booleano(valor,fallback){
    if(valor===true||valor===false) return valor;
    var normal=texto(valor).toLowerCase();
    if(["true","1","si","sí","activo","activa"].indexOf(normal)>=0) return true;
    if(["false","0","no","inactivo","inactiva"].indexOf(normal)>=0) return false;
    return fallback!==false;
  }
  function numero(valor,fallback){var n=Number(valor);return Number.isFinite(n)?n:Number(fallback||0);}
  function mensajeError(valor){
    if(valor===null||valor===undefined) return "Error desconocido de Google Sheets.";
    if(typeof valor==="string") return valor;
    if(valor instanceof Error&&valor.message) return mensajeError(valor.message);
    if(typeof valor==="object"){
      var candidato=valor.mensaje||valor.message||valor.error||valor.detalle||valor.codigo;
      if(candidato&&candidato!==valor) return mensajeError(candidato);
      try{return JSON.stringify(valor);}catch(errorJson){return String(valor);}
    }
    return String(valor);
  }
  function normalizar(data){
    data=data||{};
    return {
      endpoint:texto(data.endpoint||data.url||data.webAppUrl||data.appsScriptUrl||data.sheetsWebAppUrl||data.sheetsUrl||data.sheetsEndpoint),
      token:texto(data.token||data.sheetsToken||data.apiToken),
      activo:booleano(data.activo!==undefined?data.activo:data.sheetsActivo,true),
      timeoutMs:Math.max(5000,numero(data.timeoutMs||data.sheetsTimeoutMs,45000)),
      nombre:texto(data.nombre||data.name||"Google Sheets Titulación"),
      actualizadoEn:texto(data.actualizadoEn||data.actualizadoEnLocal||data.fechaActualizacion||""),
      origen:texto(data.origen||"localStorage")
    };
  }
  function leerLocal(){
    try{var raw=window.localStorage.getItem(STORAGE_KEY);return raw?normalizar(JSON.parse(raw)):null;}
    catch(error){return null;}
  }
  function guardarLocal(configuracion){
    var cfg=normalizar(configuracion);
    if(!cfg.endpoint) throw new Error("Ingresa la URL publicada de Apps Script terminada en /exec.");
    cfg.actualizadoEn=new Date().toISOString();
    cfg.origen="administrador-local";
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(cfg));}
    catch(error){throw new Error("No se pudo guardar la configuración en este navegador.");}
    cache=cfg;
    return Object.assign({},cfg);
  }
  function leerDocumentoSeguro(coleccion,documento){
    if(!window.ADFirebaseService||typeof window.ADFirebaseService.leerDocumento!=="function") return Promise.resolve(null);
    return window.ADFirebaseService.leerDocumento(coleccion,documento)
      .then(function(respuesta){return respuesta&&respuesta.existe?(respuesta.data||{}):null;})
      .catch(function(){return null;});
  }
  function importarDesdeFirebase(){
    return Promise.all([
      leerDocumentoSeguro("app_config","titulos_sheets"),
      leerDocumentoSeguro("titulos_config","app")
    ]).then(function(partes){
      var nueva=partes[0]||{};var antigua=partes[1]||{};
      var combinada={
        endpoint:nueva.endpoint||nueva.url||nueva.webAppUrl||antigua.sheetsWebAppUrl||antigua.sheetsUrl||antigua.sheetsEndpoint||"",
        token:nueva.token||nueva.sheetsToken||antigua.sheetsToken||"",
        activo:nueva.activo!==undefined?nueva.activo:antigua.sheetsActivo,
        timeoutMs:nueva.timeoutMs||antigua.sheetsTimeoutMs||45000,
        nombre:nueva.nombre||"Google Sheets Titulación",
        origen:"firebase-importado"
      };
      var cfg=normalizar(combinada);
      if(!cfg.endpoint) throw new Error("No se encontró una URL de Google Sheets en la configuración anterior.");
      return guardarLocal(cfg);
    });
  }
  function leerConfiguracion(opciones){
    opciones=opciones||{};
    if(cache&&!opciones.forzar) return Promise.resolve(Object.assign({},cache));
    var local=leerLocal();
    if(local&&local.endpoint){cache=local;return Promise.resolve(Object.assign({},local));}
    if(opciones.importarFirebase===false) return Promise.resolve(normalizar({activo:true}));
    return importarDesdeFirebase().catch(function(){return normalizar({activo:true});});
  }
  function serializarParametro(valor){
    if(valor===null||valor===undefined) return "";
    if(Array.isArray(valor)) return valor.join(",");
    if(typeof valor==="object"){
      try{return JSON.stringify(valor);}catch(error){return String(valor);}
    }
    return String(valor);
  }
  function construirUrlGet(endpoint,accion,payload,cfg){
    var url;
    try{url=new URL(endpoint,window.location.href);}catch(error){throw new Error("La URL de Apps Script no es válida.");}
    url.searchParams.set("accion",accion);
    url.searchParams.set("action",accion);
    url.searchParams.set("origen","administrador");
    url.searchParams.set("fechaCliente",new Date().toISOString());
    if(cfg.token) url.searchParams.set("token",cfg.token);
    Object.keys(payload||{}).forEach(function(clave){
      var valor=serializarParametro(payload[clave]);
      if(valor!=="") url.searchParams.set(clave,valor);
    });
    return url.toString();
  }
  function leerRespuesta(respuesta){
    return respuesta.text().then(function(cuerpo){
      var data;
      try{data=cuerpo?JSON.parse(cuerpo):{};}
      catch(errorJson){throw new Error("Google Sheets respondió texto no válido: "+texto(cuerpo).slice(0,180));}
      if(!respuesta.ok||data.ok===false) throw new Error(mensajeError(data));
      return data;
    });
  }
  function enviarGet(accion,payload){
    if(!accion) return Promise.reject(new Error("No se indicó la acción de Google Sheets."));
    return leerConfiguracion().then(function(cfg){
      if(!cfg.endpoint) throw new Error("Configura primero la URL de Apps Script en Administrador → Google Sheets.");
      if(!cfg.activo) throw new Error("La conexión con Google Sheets está desactivada.");
      var controller=window.AbortController?new AbortController():null;
      var timer=null;
      var opciones={method:"GET",cache:"no-store"};
      if(controller){opciones.signal=controller.signal;timer=window.setTimeout(function(){controller.abort();},cfg.timeoutMs);}
      return fetch(construirUrlGet(cfg.endpoint,accion,payload||{},cfg),opciones)
        .then(leerRespuesta)
        .catch(function(error){
          if(error&&error.name==="AbortError") throw new Error("Google Sheets superó el tiempo máximo de respuesta.");
          throw new Error(mensajeError(error));
        })
        .then(function(data){if(timer) window.clearTimeout(timer);return {ok:true,status:200,data:data,configuracion:cfg};},function(error){if(timer) window.clearTimeout(timer);throw error;});
    });
  }
  function construirPost(accion,payload,cfg){
    payload=payload||{};
    var body={accion:accion,action:accion,tipo:accion,origen:"administrador",fechaCliente:new Date().toISOString(),datos:Object.assign({},payload)};
    if(cfg.token){body.token=cfg.token;body.datos.token=cfg.token;}
    return body;
  }
  function enviarPost(accion,payload){
    if(!accion) return Promise.reject(new Error("No se indicó la acción de Google Sheets."));
    return leerConfiguracion().then(function(cfg){
      if(!cfg.endpoint) throw new Error("Configura primero la URL de Apps Script en Administrador → Google Sheets.");
      if(!cfg.activo) throw new Error("La conexión con Google Sheets está desactivada.");
      var controller=window.AbortController?new AbortController():null;
      var timer=null;
      var opciones={method:"POST",cache:"no-store",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(construirPost(accion,payload,cfg))};
      if(controller){opciones.signal=controller.signal;timer=window.setTimeout(function(){controller.abort();},cfg.timeoutMs);}
      return fetch(cfg.endpoint,opciones)
        .then(leerRespuesta)
        .catch(function(error){
          if(error&&error.name==="AbortError") throw new Error("Google Sheets superó el tiempo máximo de respuesta.");
          throw new Error(mensajeError(error));
        })
        .then(function(data){if(timer) window.clearTimeout(timer);return {ok:true,status:200,data:data,configuracion:cfg};},function(error){if(timer) window.clearTimeout(timer);throw error;});
    });
  }
  function enviarAccion(accion,payload){
    var lecturas=["PING","LISTAR_COORDINADORES","LISTAR_ENVIOS_POR_CARRERA","VERIFICAR_ENVIO","CONSULTAR_ESTUDIANTE","LISTAR_PENDIENTES_SYNC"];
    return lecturas.indexOf(String(accion||"").toUpperCase())>=0?enviarGet(accion,payload):enviarPost(accion,payload);
  }
  function extraerLista(respuesta){
    var data=respuesta&&respuesta.data!==undefined?respuesta.data:respuesta;
    if(Array.isArray(data)) return data;
    if(!data||typeof data!=="object") return [];
    var candidatos=[data.envios,data.coordinadores,data.registros,data.resultado,data.result,data.data,data.data&&data.data.envios,data.data&&data.data.coordinadores,data.data&&data.data.registros];
    for(var i=0;i<candidatos.length;i+=1){if(Array.isArray(candidatos[i])) return candidatos[i];}
    return [];
  }

  function probarPing(){return enviarGet("PING",{});}
  function probarCoordinadores(){return enviarGet("LISTAR_COORDINADORES",{});}
  function probarEnvios(){return enviarGet("LISTAR_ENVIOS_POR_CARRERA",{carreras:"",carrera:"",estado:""});}
  function consultarCedula(cedula,periodo){
    cedula=texto(cedula).replace(/\D/g,"");
    if(!cedula) return Promise.reject(new Error("Ingresa una cédula."));
    if(!texto(periodo)) return Promise.reject(new Error("Ingresa el período exacto para verificar el envío."));
    return enviarGet("VERIFICAR_ENVIO",{cedula:cedula,numeroIdentificacion:cedula,periodo:texto(periodo)});
  }

  window.ADSheetsService={
    STORAGE_KEY:STORAGE_KEY,
    leerConfiguracion:leerConfiguracion,
    guardarConfiguracion:function(data){return Promise.resolve(guardarLocal(data));},
    importarDesdeFirebase:importarDesdeFirebase,
    enviarAccion:enviarAccion,
    enviarGet:enviarGet,
    enviarPost:enviarPost,
    probarPing:probarPing,
    probarCoordinadores:probarCoordinadores,
    probarEnvios:probarEnvios,
    consultarCedula:consultarCedula,
    extraerLista:extraerLista,
    normalizar:normalizar,
    mensajeError:mensajeError
  };
})(window);
