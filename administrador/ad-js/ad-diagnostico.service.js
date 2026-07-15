/* =========================================================
Archivo: ad-diagnostico.service.js
Ruta: /administrador/ad-js/ad-diagnostico.service.js
Función:
- Probar conexión Firebase.
- Leer titulos_config/app.
- Revisar colecciones principales con conteo y muestra.
- Mostrar estado de Google Sheets configurado en Firebase.
- Copiar la configuración válida de Sheets a localStorage para Coordinadores.
========================================================= */
(function(window){
  "use strict";

  var SHEETS_STORAGE_KEY="titulos_sheets_config_v1";

  function config(){return window.AD_CONFIG||{};}
  function utils(){return window.AD_UTILS||{};}
  function firebaseService(){if(!window.ADFirebaseService)throw new Error("ADFirebaseService no está disponible.");return window.ADFirebaseService;}
  function texto(valor){if(utils().normalizarTexto)return utils().normalizarTexto(valor);return String(valor===null||valor===undefined?"":valor).trim();}
  function ocultarToken(valor){if(utils().ocultarToken)return utils().ocultarToken(valor);var limpio=texto(valor);return limpio?limpio.slice(0,8)+"******":"";}
  function valorBooleano(valor){return valor===true||texto(valor).toLowerCase()==="true";}

  function extraerPeriodo(configApp){
    var data=configApp||{};var periodoActivo=data.periodoActivo||{};
    var id=texto(data.periodoActivoId||periodoActivo.id||data.periodoId||config().periodos.fallbackId);
    var label=texto(data.periodoActivoLabel||periodoActivo.label||data.periodoLabel||config().periodos.fallbackLabel);
    return {id:id,label:label,periodoActivo:periodoActivo,periodosActivos:Array.isArray(data.periodosActivos)?data.periodosActivos:[],periodosActivosLabels:Array.isArray(data.periodosActivosLabels)?data.periodosActivosLabels:[]};
  }
  function extraerSheets(configApp){
    var data=configApp||{};
    return {
      activo:valorBooleano(data.sheetsActivo),
      webAppUrl:texto(data.sheetsWebAppUrl||data.sheetsUrl||data.sheetsEndpoint||""),
      token:texto(data.sheetsToken||""),
      tokenOculto:ocultarToken(data.sheetsToken||""),
      timeoutMs:Number(data.sheetsTimeoutMs||45000),
      ultimaPrueba:texto(data.sheetsUltimaPrueba||""),
      ultimoResultado:texto(data.sheetsUltimoResultado||"")
    };
  }
  function guardarSheetsRuntime(configApp){
    var sheets=extraerSheets(configApp);
    if(!sheets.webAppUrl)return false;
    var runtime={
      endpoint:sheets.webAppUrl,
      url:sheets.webAppUrl,
      token:sheets.token,
      activo:sheets.activo!==false,
      timeoutMs:Math.max(5000,Number(sheets.timeoutMs||45000)),
      nombre:"Google Sheets Titulación",
      actualizadoEn:new Date().toISOString(),
      origen:"titulos_config/app"
    };
    try{window.localStorage.setItem(SHEETS_STORAGE_KEY,JSON.stringify(runtime));return true;}
    catch(error){return false;}
  }

  function revisarColeccion(nombre,limite,opciones){
    var opts=opciones||{};var tareaMuestra;
    if(opts.orden){tareaMuestra=firebaseService().listarColeccionOrdenada(nombre,opts.orden,opts.direccion||"desc",limite||5).catch(function(){return firebaseService().listarColeccion(nombre,limite||5);});}
    else tareaMuestra=firebaseService().listarColeccion(nombre,limite||5);
    return Promise.all([
      firebaseService().contarColeccion(nombre).catch(function(error){return {ok:false,total:0,error:error.message||String(error),metodo:"error"};}),
      tareaMuestra.catch(function(error){return {ok:false,totalLeido:0,datos:[],error:error.message||String(error)};})
    ]).then(function(partes){var conteo=partes[0]||{};var muestra=partes[1]||{};return {nombre:nombre,ok:Boolean(conteo.ok||muestra.ok),total:Number(conteo.total||0),metodoConteo:conteo.metodo||"sin conteo",totalLeido:Number(muestra.totalLeido||0),muestra:muestra.datos||[],error:conteo.error||muestra.error||""};})
      .catch(function(error){return {nombre:nombre,ok:false,total:0,metodoConteo:"error",totalLeido:0,muestra:[],error:error.message||String(error)};});
  }
  function obtenerLogsRecientes(limite){
    var colecciones=config().colecciones||{};var max=limite||10;
    return firebaseService().listarColeccionOrdenada(colecciones.logs,"fecha","desc",max)
      .catch(function(){return firebaseService().listarColeccionOrdenada(colecciones.logs,"fechaCliente","desc",max);})
      .catch(function(){return firebaseService().listarColeccionOrdenada(colecciones.logs,"creadoEn","desc",max);})
      .catch(function(){return firebaseService().listarColeccion(colecciones.logs,max);})
      .then(function(resultado){return resultado.datos||[];}).catch(function(){return [];});
  }
  function probarFirebase(){
    var colecciones=config().colecciones||{};var documentoConfig=config().documentos&&config().documentos.appConfig;
    return firebaseService().inicializar().then(function(){return firebaseService().leerDocumento(colecciones.titulosConfig,documentoConfig);})
      .then(function(configResultado){
        var configApp=configResultado.data||{};guardarSheetsRuntime(configApp);
        var tareas=[
          revisarColeccion(colecciones.estudiantes,5),
          revisarColeccion(colecciones.titulos,5,{orden:"fechaenviotitulos",direccion:"desc"}),
          revisarColeccion(colecciones.coordinadores,5),
          revisarColeccion(colecciones.historial,5,{orden:"archivadoEn",direccion:"desc"}),
          revisarColeccion(colecciones.logs,5,{orden:"fecha",direccion:"desc"}),
          obtenerLogsRecientes(10)
        ];
        return Promise.all(tareas).then(function(resumen){return {ok:true,proyecto:config().firebaseConfig.projectId,configExiste:configResultado.existe,configApp:configApp,periodo:extraerPeriodo(configApp),sheets:extraerSheets(configApp),sheetsCompartidoConCoordinadores:Boolean(extraerSheets(configApp).webAppUrl),colecciones:resumen.slice(0,5),logsRecientes:resumen[5]||[]};});
      });
  }
  function probarSheets(){
    var colecciones=config().colecciones||{};var documentoConfig=config().documentos&&config().documentos.appConfig;
    return firebaseService().leerDocumento(colecciones.titulosConfig,documentoConfig).then(function(configResultado){
      var configApp=configResultado.data||{};var sheets=extraerSheets(configApp);guardarSheetsRuntime(configApp);
      var payload=Object.assign({},config().sheets.pingPayload||{},{fechaCliente:new Date().toISOString()});
      if(!sheets.webAppUrl)return {ok:false,sheets:sheets,mensaje:"No existe sheetsWebAppUrl en titulos_config/app."};
      if(!sheets.activo)return {ok:false,sheets:sheets,mensaje:"Google Sheets está configurado, pero sheetsActivo no está en true."};
      if(sheets.token){payload.token=sheets.token;if(payload.datos&&typeof payload.datos==='object')payload.datos.token=sheets.token;}
      return fetch(sheets.webAppUrl,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify(payload)})
        .then(function(respuesta){return respuesta.text().then(function(textoRespuesta){var json=null;try{json=JSON.parse(textoRespuesta);}catch(errorJson){json={raw:textoRespuesta};}return {ok:respuesta.ok&&json.ok!==false,status:respuesta.status,sheets:sheets,respuesta:json,sheetsCompartidoConCoordinadores:true,mensaje:respuesta.ok?"PING enviado a Google Sheets y configuración compartida con Coordinadores.":"Google Sheets respondió con error HTTP."};});})
        .catch(function(error){return {ok:false,sheets:sheets,mensaje:error.message||String(error)};});
    });
  }
  function resumenTextoFirebase(resultado){
    var lineas=[];var colecciones=resultado.colecciones||[];
    lineas.push("Firebase conectado correctamente.");
    lineas.push("Proyecto: "+resultado.proyecto);
    lineas.push("Config titulos_config/app: "+(resultado.configExiste?"encontrada":"no encontrada"));
    lineas.push("Período principal: "+resultado.periodo.label+" ("+resultado.periodo.id+")");
    lineas.push("Google Sheets: "+(resultado.sheets.activo?"activo":"inactivo"));
    lineas.push("URL Sheets: "+(resultado.sheets.webAppUrl?"configurada":"no configurada"));
    lineas.push("Configuración compartida con Coordinadores: "+(resultado.sheetsCompartidoConCoordinadores?"sí":"no"));
    lineas.push("Última prueba Sheets: "+(resultado.sheets.ultimaPrueba||"sin dato"));
    lineas.push("Último resultado Sheets: "+(resultado.sheets.ultimoResultado||"sin dato"));
    lineas.push("");
    for(var i=0;i<colecciones.length;i+=1){lineas.push("Colección "+colecciones[i].nombre+": "+(colecciones[i].ok?"ok | total "+colecciones[i].total+" | muestra "+colecciones[i].totalLeido:"error: "+colecciones[i].error));}
    return lineas.join("\n");
  }

  window.ADDiagnosticoService={probarFirebase:probarFirebase,probarSheets:probarSheets,extraerPeriodo:extraerPeriodo,extraerSheets:extraerSheets,guardarSheetsRuntime:guardarSheetsRuntime,resumenTextoFirebase:resumenTextoFirebase,obtenerLogsRecientes:obtenerLogsRecientes};
})(window);
