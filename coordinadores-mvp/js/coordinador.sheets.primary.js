/* =========================================================
Archivo: coordinador.sheets.primary.js
Ruta: /coordinadores-mvp/js/coordinador.sheets.primary.js
Función:
- Usar Google Sheets como fuente principal sin depender de la cuota de Firebase.
- Leer la configuración guardada por Administrador → Google Sheets.
- Listar coordinadores, períodos y envíos.
- Consultar el registro más reciente por cédula para obtener Preferido.
- Aprobar y devolver directamente en Apps Script.
========================================================= */
(function(window){
  'use strict';

  var STORAGE_KEY='titulos_sheets_config_v1';
  var configCache=null;

  function config(){return window.CoordinadorMVPConfig||null;}
  function utils(){return window.CoordinadorMVPUtils||null;}
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function validar(){
    if(!config()) throw new Error('CoordinadorMVPConfig no está disponible.');
    if(!utils()) throw new Error('CoordinadorMVPUtils no está disponible.');
  }
  function numero(v,fallback){var n=Number(v);return Number.isFinite(n)?n:Number(fallback||0);}
  function booleano(v,fallback){
    if(v===true||v===false) return v;
    var n=texto(v).toLowerCase();
    if(['true','1','si','sí','activo','activa'].indexOf(n)>=0) return true;
    if(['false','0','no','inactivo','inactiva'].indexOf(n)>=0) return false;
    return fallback!==false;
  }
  function normalizarConfig(data){
    data=data||{};
    return {
      endpoint:texto(data.endpoint||data.url||data.webAppUrl||data.appsScriptUrl||data.sheetsWebAppUrl||data.sheetsUrl||data.sheetsEndpoint||config().obtener('sheets.endpoint','')),
      token:texto(data.token||data.sheetsToken||data.apiToken),
      activo:booleano(data.activo!==undefined?data.activo:data.sheetsActivo,true),
      timeoutMs:Math.max(5000,numero(data.timeoutMs||data.sheetsTimeoutMs||config().obtener('sheets.timeoutMs',45000),45000)),
      nombre:texto(data.nombre||data.name||'Google Sheets Titulación'),
      origen:texto(data.origen||'localStorage')
    };
  }
  function leerLocal(){
    try{
      var raw=window.localStorage.getItem(STORAGE_KEY);
      return raw?normalizarConfig(JSON.parse(raw)):null;
    }catch(error){return null;}
  }
  function guardarLocal(cfg){
    cfg=normalizarConfig(cfg);
    if(!cfg.endpoint) return cfg;
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(cfg));}catch(error){}
    configCache=cfg;
    return cfg;
  }
  function leerFirebaseLegacy(){
    if(!window.firebase||!window.firebase.firestore) return Promise.resolve(null);
    try{
      if(!window.firebase.apps||!window.firebase.apps.length){
        var firebaseConfig=window.AD_CONFIG&&window.AD_CONFIG.firebaseConfig||{};
        if(!firebaseConfig.apiKey||!firebaseConfig.projectId) return Promise.resolve(null);
        window.firebase.initializeApp(firebaseConfig);
      }
      var db=window.firebase.firestore();
      return Promise.all([
        db.collection('app_config').doc('titulos_sheets').get().catch(function(){return null;}),
        db.collection('titulos_config').doc('app').get().catch(function(){return null;})
      ]).then(function(partes){
        var nuevo=partes[0]&&partes[0].exists?(partes[0].data()||{}):{};
        var viejo=partes[1]&&partes[1].exists?(partes[1].data()||{}):{};
        var cfg=normalizarConfig({
          endpoint:nuevo.endpoint||nuevo.url||viejo.sheetsWebAppUrl||viejo.sheetsUrl||viejo.sheetsEndpoint,
          token:nuevo.token||nuevo.sheetsToken||viejo.sheetsToken,
          activo:nuevo.activo!==undefined?nuevo.activo:viejo.sheetsActivo,
          timeoutMs:nuevo.timeoutMs||viejo.sheetsTimeoutMs,
          origen:'firebase-importado'
        });
        return cfg.endpoint?guardarLocal(cfg):null;
      }).catch(function(){return null;});
    }catch(error){return Promise.resolve(null);}
  }
  function leerConfiguracion(forzar){
    validar();
    if(configCache&&!forzar) return Promise.resolve(Object.assign({},configCache));
    var local=leerLocal();
    if(local&&local.endpoint){configCache=local;return Promise.resolve(Object.assign({},local));}
    var estatica=normalizarConfig({endpoint:config().obtener('sheets.endpoint',''),activo:true,timeoutMs:config().obtener('sheets.timeoutMs',45000),origen:'config-js'});
    if(estatica.endpoint){guardarLocal(estatica);return Promise.resolve(Object.assign({},estatica));}
    return leerFirebaseLegacy().then(function(importada){
      if(importada&&importada.endpoint) return Object.assign({},importada);
      throw new Error('Configura Google Sheets en Administrador → Google Sheets antes de abrir Coordinadores.');
    });
  }
  function construirPayload(accion,payload,cfg){
    payload=payload||{};
    var body=Object.assign({},payload,{
      accion:accion,
      tipo:accion,
      origen:config().obtener('app.origen','coordinadores-mvp'),
      version:config().obtener('app.version','1.0.0'),
      fechaCliente:utils().fechaIso()
    });
    if(cfg.token){body.token=cfg.token;body.sheetsToken=cfg.token;}
    body.data=Object.assign({},payload);
    if(cfg.token){body.data.token=cfg.token;body.data.sheetsToken=cfg.token;}
    return body;
  }
  function enviarAccion(accion,payload){
    validar();
    if(!accion) return Promise.reject(new Error('No se definió la acción de Google Sheets.'));
    return leerConfiguracion(false).then(function(cfg){
      if(!cfg.activo) throw new Error('Google Sheets está desactivado en el administrador.');
      if(!cfg.endpoint) throw new Error('No existe URL de Apps Script configurada.');
      var controller=window.AbortController?new AbortController():null;
      var timer=null;
      var opciones={method:'POST',mode:'cors',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(construirPayload(accion,payload,cfg))};
      if(controller){opciones.signal=controller.signal;timer=window.setTimeout(function(){controller.abort();},cfg.timeoutMs);}
      return fetch(cfg.endpoint,opciones).then(function(respuesta){
        return respuesta.text().then(function(cuerpo){
          var data;
          try{data=cuerpo?JSON.parse(cuerpo):{};}catch(errorJson){throw new Error('Google Sheets respondió en un formato no válido.');}
          if(!respuesta.ok||data.ok===false) throw new Error(data.mensaje||data.error||('Google Sheets respondió HTTP '+respuesta.status));
          return data;
        });
      }).catch(function(error){
        if(error&&error.name==='AbortError') throw new Error('Google Sheets superó el tiempo máximo de respuesta.');
        throw error;
      }).then(function(resultado){if(timer) window.clearTimeout(timer);return resultado;},function(error){if(timer) window.clearTimeout(timer);throw error;});
    });
  }
  function extraerLista(respuesta,tipo){
    if(Array.isArray(respuesta)) return respuesta;
    if(!respuesta||typeof respuesta!=='object') return [];
    var candidatos=tipo==='coordinadores'?
      [respuesta.coordinadores,respuesta.data,respuesta.registros,respuesta.data&&respuesta.data.coordinadores,respuesta.data&&respuesta.data.registros]:
      [respuesta.envios,respuesta.data,respuesta.registros,respuesta.resultado,respuesta.result,respuesta.data&&respuesta.data.envios,respuesta.data&&respuesta.data.registros];
    for(var i=0;i<candidatos.length;i+=1){if(Array.isArray(candidatos[i])) return candidatos[i];}
    return [];
  }
  function campoFlexible(fila,aliases,fallback){return utils().obtenerCampoFlexible(fila||{},aliases||[],fallback===undefined?'':fallback);}
  function numeroFavorito(valor,titulos){
    var limpio=texto(valor);var coincidencia;var normalValor;var i;
    if(/^[123]$/.test(limpio)) return Number(limpio);
    coincidencia=limpio.match(/(?:t[ií]tulo|propuesta|opci[oó]n|alternativa|favorito)\s*#?\s*([123])/i);
    if(coincidencia) return Number(coincidencia[1]);
    normalValor=normalComparacion(limpio);
    if(normalValor){for(i=0;i<3;i+=1){if(normalComparacion(titulos[i])===normalValor) return i+1;}}
    return 0;
  }
  function normalComparacion(valor){
    return texto(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function normalizarCoordinador(fila,indice){
    var columnas=config().data.columnas.coordinadores;
    var nombre=utils().limpiarTexto(campoFlexible(fila,columnas.nombre,''));
    var carreras=utils().normalizarCarreras(campoFlexible(fila,columnas.carreras,''));
    var activo=utils().parseBoolean(campoFlexible(fila,columnas.activo,'activo'),true);
    return {id:utils().normalizarClave(nombre||('coordinador_'+indice)),nombre:nombre,carreras:carreras,carrerasTexto:utils().carrerasComoTexto(carreras),activo:activo,fuente:'google-sheets',raw:fila||{}};
  }
  function normalizarEnvio(fila,indice){
    var columnas=config().data.columnas.envios;
    fila=fila||{};
    var titulos=[
      utils().limpiarTitulo(campoFlexible(fila,columnas.titulo1,'')),
      utils().limpiarTitulo(campoFlexible(fila,columnas.titulo2,'')),
      utils().limpiarTitulo(campoFlexible(fila,columnas.titulo3,''))
    ];
    var preferidoRaw=utils().limpiarTexto(campoFlexible(fila,columnas.preferido,''));
    var preferidoNumero=numeroFavorito(preferidoRaw,titulos);
    var estadoPrincipal=utils().limpiarTexto(campoFlexible(fila,columnas.estado,''))||utils().limpiarTexto(campoFlexible(fila,columnas.estadoFirebase,''));
    estadoPrincipal=utils().normalizarEstado(estadoPrincipal||config().obtenerEstado('pendiente'));
    if(estadoPrincipal==='ENVIADO'||estadoPrincipal==='PENDIENTE_SYNC') estadoPrincipal=config().obtenerEstado('pendiente');
    var periodo=utils().limpiarTexto(campoFlexible(fila,columnas.periodo,''));
    var id=utils().limpiarTexto(campoFlexible(fila,columnas.idRegistro,''))||utils().limpiarTexto(fila.id||fila.ID||fila._id||'');
    var envio={
      id:id,_clave:id,fila:fila.fila||fila.rowNumber||fila._rowNumber||(indice+2),
      cedula:utils().limpiarCedula(campoFlexible(fila,columnas.cedula,'')),
      nombres:utils().limpiarTexto(campoFlexible(fila,columnas.nombres,'')),
      carrera:utils().limpiarTexto(campoFlexible(fila,columnas.carrera,'')),
      codigoCarrera:utils().limpiarTexto(fila.codigoCarrera||fila.CodigoCarrera||''),
      periodo:periodo,periodoLabel:periodo,periodoId:utils().limpiarTexto(fila.periodoId||fila.PeriodoId||''),
      telegram:utils().limpiarTexto(campoFlexible(fila,columnas.telegram,'')),estado:estadoPrincipal,
      fechaEnvio:utils().limpiarTexto(campoFlexible(fila,columnas.fechaEnvio,'')),
      titulo1:titulos[0],titulo2:titulos[1],titulo3:titulos[2],
      tituloPreferido:preferidoRaw||String(preferidoNumero||''),tituloPreferidoNumero:preferidoNumero,
      tituloPreferidoTexto:preferidoNumero?titulos[preferidoNumero-1]:preferidoRaw,preferido:preferidoNumero||preferidoRaw,
      tituloAprobado:utils().limpiarTitulo(campoFlexible(fila,columnas.tituloAprobado,'')),
      comentarioCoordinador:utils().limpiarTextoMultilinea(campoFlexible(fila,columnas.comentarioCoordinador,'')),
      coordinador:utils().limpiarTexto(campoFlexible(fila,columnas.coordinador,'')),
      fechaRevision:utils().limpiarTexto(campoFlexible(fila,columnas.fechaRevision,'')),fuente:'google-sheets',raw:fila
    };
    if(!envio.id){envio.id=utils().construirClaveEnvio?utils().construirClaveEnvio(envio):(envio.cedula||('envio_'+indice));envio._clave=envio.id;}
    return envio;
  }
  function listarCoordinadores(){
    return enviarAccion(config().obtenerAccion('listarCoordinadores'),{hoja:config().obtener('hojas.coordinadores')}).then(function(respuesta){
      return extraerLista(respuesta,'coordinadores').map(normalizarCoordinador).filter(function(item){return item&&item.activo!==false&&item.nombre;});
    });
  }
  function listarEnvios(opciones){
    opciones=opciones||{};var periodo=opciones.periodo||{};var coordinador=opciones.coordinador||null;
    return enviarAccion(config().obtenerAccion('listarEnvios'),{
      hoja:config().obtener('hojas.envios'),periodoId:texto(periodo.id||opciones.periodoId),periodoLabel:texto(periodo.label||opciones.periodoLabel),
      periodo:texto(periodo.label||periodo.id||opciones.periodo),coordinador:coordinador,carreras:opciones.carreras||(coordinador&&coordinador.carreras)||[],estado:opciones.estado||'',vista:opciones.vista||''
    }).then(function(respuesta){return extraerLista(respuesta,'envios').map(normalizarEnvio).filter(function(item){return item&&item.cedula&&item.titulo1&&item.titulo2&&item.titulo3;});});
  }
  function listarPeriodos(){
    return listarEnvios({periodo:'',periodoId:'',periodoLabel:'',carreras:[],vista:''}).then(function(lista){
      var mapa={};var periodos=[];
      lista.forEach(function(item){
        var id=texto(item.periodoId||item.periodoLabel||item.periodo);var label=texto(item.periodoLabel||item.periodo||item.periodoId);
        if(id&&!mapa[id]){mapa[id]=true;periodos.push({id:id,label:label||id,activo:true});}
      });
      if(!periodos.length){var fb=config().obtenerPeriodoFallback?config().obtenerPeriodoFallback():{id:'2026-02__2026-08',label:'Febrero 2026 a Agosto 2026'};periodos.push({id:fb.id,label:fb.label,activo:true});}
      return {periodos:periodos,principal:periodos[0],envios:lista};
    }).catch(function(){
      var fallback={id:'2026-02__2026-08',label:'Febrero 2026 a Agosto 2026',activo:true};
      return {periodos:[fallback],principal:fallback,envios:[]};
    });
  }
  function extraerEnvioConsulta(respuesta,cedula,periodo){
    var candidatos=[respuesta&&respuesta.envio,respuesta&&respuesta.registro,respuesta&&respuesta.data&&respuesta.data.envio,respuesta&&respuesta.data&&respuesta.data.registro];
    var i;for(i=0;i<candidatos.length;i+=1){if(candidatos[i]&&typeof candidatos[i]==='object'&&!Array.isArray(candidatos[i])) return normalizarEnvio(candidatos[i],0);}
    var lista=extraerLista(respuesta,'envios').map(normalizarEnvio).filter(function(item){return item&&item.cedula===utils().limpiarCedula(cedula);});
    if(periodo){var p=normalComparacion(periodo);lista=lista.filter(function(item){return [item.periodo,item.periodoId,item.periodoLabel].some(function(v){return normalComparacion(v)===p;});});}
    return lista.length?lista[lista.length-1]:null;
  }
  function consultarEnvioPorCedula(cedula,periodo){
    cedula=utils().limpiarCedula(cedula);
    if(!cedula) return Promise.reject(new Error('No se recibió una cédula válida.'));
    return enviarAccion('CONSULTAR_ENVIO_CEDULA',{hoja:config().obtener('hojas.envios'),cedula:cedula,numeroIdentificacion:cedula,periodo:texto(periodo)}).then(function(respuesta){
      var envio=extraerEnvioConsulta(respuesta,cedula,periodo);
      if(!envio) throw new Error('Google Sheets no devolvió el envío de la cédula '+cedula+'.');
      return envio;
    });
  }
  function aprobarEnvio(envio,resolucion){
    envio=envio||{};resolucion=resolucion||{};var tituloFinal=utils().limpiarTitulo(resolucion.tituloFinal);
    if(!tituloFinal||tituloFinal.length<config().obtener('revision.tituloMinimo',8)) return Promise.reject(new Error(config().obtener('textos.seleccionaTitulo')));
    var payload={hojaEnvios:config().obtener('hojas.envios'),hojaRevisiones:config().obtener('hojas.revisiones'),id:envio.id||envio._clave||'',idRegistro:envio.id||envio._clave||'',fila:envio.fila||'',cedula:envio.cedula||'',periodo:envio.periodoLabel||envio.periodo||'',carrera:envio.carrera||'',nombres:envio.nombres||'',estadoAnterior:envio.estado||'',estadoNuevo:tituloFinal===utils().limpiarTitulo(resolucion.tituloOriginal)?config().obtenerEstado('aprobado'):config().obtenerEstado('reemplazado'),tituloSeleccionadoNumero:Number(resolucion.tituloSeleccionadoNumero||0),tituloOriginal:resolucion.tituloOriginal||'',tituloFinal:tituloFinal,tituloAprobado:tituloFinal,comentarioCoordinador:utils().limpiarTextoMultilinea(resolucion.comentarioCoordinador),coordinador:resolucion.coordinador||null,fechaRevision:utils().fechaIso(),fechaRevisionLocal:utils().fechaLegible()};
    return enviarAccion(config().obtenerAccion('aprobarEnvio'),payload).then(function(respuesta){return {ok:true,estado:payload.estadoNuevo,mensaje:respuesta.mensaje||config().obtener('textos.aprobarOk'),respuesta:respuesta,payload:payload};});
  }
  function devolverEnvio(envio,resolucion){
    envio=envio||{};resolucion=resolucion||{};var comentario=utils().limpiarTextoMultilinea(resolucion.comentarioCoordinador);
    if(config().obtener('revision.comentarioObligatorioAlDevolver',true)&&comentario.length<config().obtener('revision.comentarioMinimo',4)) return Promise.reject(new Error(config().obtener('textos.comentarioDevolucion')));
    var payload={hojaEnvios:config().obtener('hojas.envios'),hojaDevueltos:config().obtener('hojas.devueltos'),hojaRevisiones:config().obtener('hojas.revisiones'),id:envio.id||envio._clave||'',idRegistro:envio.id||envio._clave||'',fila:envio.fila||'',cedula:envio.cedula||'',periodo:envio.periodoLabel||envio.periodo||'',carrera:envio.carrera||'',nombres:envio.nombres||'',telegram:envio.telegram||'',estadoAnterior:envio.estado||'',estadoNuevo:config().obtenerEstado('devuelto'),titulo1:envio.titulo1||'',titulo2:envio.titulo2||'',titulo3:envio.titulo3||'',preferido:envio.tituloPreferidoNumero||envio.tituloPreferido||'',tituloPreferido:envio.tituloPreferidoTexto||envio.tituloPreferido||'',comentarioCoordinador:comentario,coordinador:resolucion.coordinador||null,fechaRevision:utils().fechaIso(),fechaRevisionLocal:utils().fechaLegible(),moverDevueltosAHojaDevueltos:config().obtener('revision.moverDevueltosAHojaDevueltos',false)};
    return enviarAccion(config().obtenerAccion('devolverEnvio'),payload).then(function(respuesta){return {ok:true,estado:config().obtenerEstado('devuelto'),mensaje:respuesta.mensaje||config().obtener('textos.devolverOk'),respuesta:respuesta,payload:payload};});
  }
  function diagnostico(){return Promise.all([leerConfiguracion(true),enviarAccion(config().obtenerAccion('ping'),{prueba:true})]).then(function(partes){return {ok:true,fuentePrincipal:'Google Sheets',endpointConfigurado:Boolean(partes[0].endpoint),activo:partes[0].activo,respuesta:partes[1],fecha:new Date().toISOString()};});}

  window.CoordinadorMVPSheetsPrimary=Object.freeze({
    leerConfiguracion:leerConfiguracion,enviarAccion:enviarAccion,listarCoordinadores:listarCoordinadores,listarPeriodos:listarPeriodos,listarEnvios:listarEnvios,
    consultarEnvioPorCedula:consultarEnvioPorCedula,aprobarEnvio:aprobarEnvio,devolverEnvio:devolverEnvio,diagnostico:diagnostico,
    normalizarCoordinador:normalizarCoordinador,normalizarEnvio:normalizarEnvio
  });
})(window);
