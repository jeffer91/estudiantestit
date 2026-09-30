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
  function extraerSheets(){
    var base=texto(window.TITULOS_API_BASE||'').replace(/\/$/,'');
    return {
      activo:Boolean(base),
      webAppUrl:base?base+'/api/sheets':'',
      token:'',
      tokenOculto:'',
      timeoutMs:45000,
      ultimaPrueba:'',
      ultimoResultado:''
    };
  }
  function guardarSheetsRuntime(){return false;}

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
    var servicio=window.ADSheetsService;
    if(!servicio||typeof servicio.probarPing!=='function'){
      return Promise.resolve({ok:false,mensaje:'El servicio Firebase de diagnóstico no está disponible.'});
    }
    return servicio.probarPing().then(function(respuesta){
      return {ok:true,respuesta:respuesta,mensaje:'Backend Firebase respondió correctamente.'};
    }).catch(function(error){
      return {ok:false,mensaje:error&&error.message||String(error)};
    });
  }
  function resumenTextoFirebase(resultado){
    var lineas=[],colecciones=resultado.colecciones||[];
    lineas.push('Firebase conectado correctamente.');
    lineas.push('Proyecto: '+resultado.proyecto);
    lineas.push('Config titulos_config/app: '+(resultado.configExiste?'encontrada':'no encontrada'));
    lineas.push('Período principal: '+resultado.periodo.label+' ('+resultado.periodo.id+')');
    lineas.push('Backend API: '+(window.TITULOS_API_BASE||'no configurado'));
    lineas.push('');
    for(var i=0;i<colecciones.length;i+=1){
      lineas.push('Colección '+colecciones[i].nombre+': '+(colecciones[i].ok?'ok | total '+colecciones[i].total+' | muestra '+colecciones[i].totalLeido:'error: '+colecciones[i].error));
    }
    return lineas.join('\n');
  }

  window.ADDiagnosticoService={probarFirebase:probarFirebase,probarSheets:probarSheets,extraerPeriodo:extraerPeriodo,extraerSheets:extraerSheets,guardarSheetsRuntime:guardarSheetsRuntime,resumenTextoFirebase:resumenTextoFirebase,obtenerLogsRecientes:obtenerLogsRecientes};
})(window);
