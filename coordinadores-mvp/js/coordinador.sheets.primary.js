/* =========================================================
Archivo: coordinador.sheets.primary.js
Ruta: /coordinadores-mvp/js/coordinador.sheets.primary.js
Función:
- Usar Google Sheets como fuente principal sin depender de Firebase.
- Leer la configuración guardada por Administrador → Google Sheets.
- Usar GET para las acciones de lectura que admite el Apps Script actual.
- Usar GUARDAR_RESOLUCION para aprobar y devolver títulos.
- Recuperar Preferido mediante VERIFICAR_ENVIO.
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
  function mensajeError(valor){
    if(valor===null||valor===undefined) return 'Error desconocido de Google Sheets.';
    if(typeof valor==='string') return valor;
    if(valor instanceof Error && valor.message) return mensajeError(valor.message);
    if(typeof valor==='object'){
      var candidato=valor.mensaje||valor.message||valor.error||valor.detalle||valor.codigo;
      if(candidato&&candidato!==valor) return mensajeError(candidato);
      try{return JSON.stringify(valor);}catch(errorJson){return String(valor);}
    }
    return String(valor);
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
  function leerConfiguracion(forzar){
    validar();
    if(configCache&&!forzar) return Promise.resolve(Object.assign({},configCache));
    var local=leerLocal();
    if(local&&local.endpoint){configCache=local;return Promise.resolve(Object.assign({},local));}
    var estatica=normalizarConfig({
      endpoint:config().obtener('sheets.endpoint',''),
      activo:true,
      timeoutMs:config().obtener('sheets.timeoutMs',45000),
      origen:'config-js'
    });
    if(estatica.endpoint){guardarLocal(estatica);return Promise.resolve(Object.assign({},estatica));}
    return Promise.reject(new Error('Configura Google Sheets en Administrador → Google Sheets antes de abrir Coordinadores.'));
  }

  function serializarParametro(valor){
    if(valor===null||valor===undefined) return '';
    if(Array.isArray(valor)) return valor.join(',');
    if(typeof valor==='object'){
      try{return JSON.stringify(valor);}catch(error){return String(valor);}
    }
    return String(valor);
  }
  function crearUrlGet(endpoint,accion,payload,cfg){
    var url;
    try{url=new URL(endpoint,window.location.href);}catch(error){throw new Error('La URL de Apps Script no es válida.');}
    url.searchParams.set('accion',accion);
    url.searchParams.set('action',accion);
    url.searchParams.set('origen',config().obtener('app.origen','coordinadores-mvp'));
    url.searchParams.set('fechaCliente',utils().fechaIso());
    if(cfg.token) url.searchParams.set('token',cfg.token);
    Object.keys(payload||{}).forEach(function(clave){
      var valor=serializarParametro(payload[clave]);
      if(valor!=='') url.searchParams.set(clave,valor);
    });
    return url.toString();
  }
  function leerRespuesta(respuesta){
    return respuesta.text().then(function(cuerpo){
      var data;
      try{data=cuerpo?JSON.parse(cuerpo):{};}
      catch(errorJson){throw new Error('Google Sheets respondió texto no válido: '+texto(cuerpo).slice(0,180));}
      if(!respuesta.ok||data.ok===false) throw new Error(mensajeError(data));
      return data;
    });
  }
  function enviarGet(accion,payload){
    validar();
    return leerConfiguracion(false).then(function(cfg){
      if(!cfg.activo) throw new Error('Google Sheets está desactivado en el administrador.');
      if(!cfg.endpoint) throw new Error('No existe URL de Apps Script configurada.');
      var controller=window.AbortController?new AbortController():null;
      var timer=null;
      var opciones={method:'GET',mode:'cors',cache:'no-store'};
      if(controller){opciones.signal=controller.signal;timer=window.setTimeout(function(){controller.abort();},cfg.timeoutMs);}
      return fetch(crearUrlGet(cfg.endpoint,accion,payload||{},cfg),opciones)
        .then(leerRespuesta)
        .catch(function(error){
          if(error&&error.name==='AbortError') throw new Error('Google Sheets superó el tiempo máximo de respuesta.');
          throw new Error(mensajeError(error));
        })
        .then(function(resultado){if(timer) window.clearTimeout(timer);return resultado;},function(error){if(timer) window.clearTimeout(timer);throw error;});
    });
  }
  function construirPost(accion,payload,cfg){
    payload=payload||{};
    var body={
      accion:accion,
      action:accion,
      tipo:accion,
      origen:config().obtener('app.origen','coordinadores-mvp'),
      version:config().obtener('app.version','1.0.0'),
      fechaCliente:utils().fechaIso(),
      datos:Object.assign({},payload)
    };
    if(cfg.token){
      body.token=cfg.token;
      body.datos.token=cfg.token;
    }
    return body;
  }
  function enviarPost(accion,payload){
    validar();
    return leerConfiguracion(false).then(function(cfg){
      if(!cfg.activo) throw new Error('Google Sheets está desactivado en el administrador.');
      if(!cfg.endpoint) throw new Error('No existe URL de Apps Script configurada.');
      var controller=window.AbortController?new AbortController():null;
      var timer=null;
      var opciones={
        method:'POST',
        mode:'cors',
        cache:'no-store',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body:JSON.stringify(construirPost(accion,payload||{},cfg))
      };
      if(controller){opciones.signal=controller.signal;timer=window.setTimeout(function(){controller.abort();},cfg.timeoutMs);}
      return fetch(cfg.endpoint,opciones)
        .then(leerRespuesta)
        .catch(function(error){
          if(error&&error.name==='AbortError') throw new Error('Google Sheets superó el tiempo máximo de respuesta.');
          throw new Error(mensajeError(error));
        })
        .then(function(resultado){if(timer) window.clearTimeout(timer);return resultado;},function(error){if(timer) window.clearTimeout(timer);throw error;});
    });
  }
  function enviarAccion(accion,payload){
    var lecturas=['PING','LISTAR_COORDINADORES','LISTAR_ENVIOS_POR_CARRERA','VERIFICAR_ENVIO','CONSULTAR_ESTUDIANTE','LISTAR_PENDIENTES_SYNC'];
    return lecturas.indexOf(String(accion||'').toUpperCase())>=0?enviarGet(accion,payload):enviarPost(accion,payload);
  }

  function extraerListaRecursiva(valor,claves,profundidad){
    if(profundidad>6||valor===null||valor===undefined) return [];
    if(Array.isArray(valor)) return valor;
    if(typeof valor!=='object') return [];
    for(var i=0;i<claves.length;i+=1){
      if(Array.isArray(valor[claves[i]])) return valor[claves[i]];
    }
    var nombres=Object.keys(valor);
    for(var j=0;j<nombres.length;j+=1){
      var encontrada=extraerListaRecursiva(valor[nombres[j]],claves,profundidad+1);
      if(encontrada.length) return encontrada;
    }
    return [];
  }
  function extraerLista(respuesta,tipo){
    var claves=tipo==='coordinadores'
      ?['coordinadores','registros','filas','rows','items','resultado','result','data']
      :['envios','registros','filas','rows','items','resultado','result','data'];
    return extraerListaRecursiva(respuesta,claves,0);
  }
  function campoFlexible(fila,aliases,fallback){return utils().obtenerCampoFlexible(fila||{},aliases||[],fallback===undefined?'':fallback);}
  function normalComparacion(valor){
    return texto(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function numeroFavorito(valor,titulos){
    var limpio=texto(valor);var coincidencia;var normalValor;var i;
    if(/^[123]$/.test(limpio)) return Number(limpio);
    coincidencia=limpio.match(/(?:t[ií]tulo|propuesta|opci[oó]n|alternativa|favorito)\s*#?\s*([123])/i);
    if(coincidencia) return Number(coincidencia[1]);
    normalValor=normalComparacion(limpio);
    if(normalValor){for(i=0;i<3;i+=1){if(normalComparacion(titulos[i])===normalValor) return i+1;}}
    return 0;
  }
  function normalizarCoordinador(fila,indice){
    var columnas=config().data.columnas.coordinadores;
    var nombre=utils().limpiarTexto(campoFlexible(fila,columnas.nombre,''));
    var carreras=utils().normalizarCarreras(campoFlexible(fila,columnas.carreras,''));
    var activo=utils().parseBoolean(campoFlexible(fila,columnas.activo,'ACTIVO'),true);
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
      id:id,_clave:id,fila:fila.__fila||fila.fila||fila.rowNumber||fila._rowNumber||(indice+2),
      cedula:utils().limpiarCedula(campoFlexible(fila,columnas.cedula,'')),
      nombres:utils().limpiarTexto(campoFlexible(fila,columnas.nombres,'')),
      carrera:utils().limpiarTexto(campoFlexible(fila,columnas.carrera,'')),
      codigoCarrera:utils().limpiarTexto(fila.codigoCarrera||fila.CodigoCarrera||''),
      periodo:periodo,periodoLabel:periodo,periodoId:utils().limpiarTexto(fila.periodoId||fila.PeriodoId||periodo),
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
    return enviarGet('LISTAR_COORDINADORES',{}).then(function(respuesta){
      var lista=extraerLista(respuesta,'coordinadores').map(normalizarCoordinador).filter(function(item){return item&&item.activo!==false&&item.nombre;});
      if(!lista.length) throw new Error('La hoja Coordinadores no devolvió registros activos.');
      return lista;
    });
  }
  function listarEnvios(opciones){
    opciones=opciones||{};
    var carreras=opciones.carreras||(opciones.coordinador&&opciones.coordinador.carreras)||[];
    return enviarGet('LISTAR_ENVIOS_POR_CARRERA',{
      hoja:config().obtener('hojas.envios'),
      carreras:Array.isArray(carreras)?carreras.join(','):carreras,
      carrera:Array.isArray(carreras)?carreras.join(','):carreras,
      estado:''
    }).then(function(respuesta){
      return extraerLista(respuesta,'envios').map(normalizarEnvio).filter(function(item){return item&&item.cedula&&item.titulo1&&item.titulo2&&item.titulo3;});
    });
  }
  function listarPeriodos(){
    return listarEnvios({carreras:[]}).then(function(lista){
      var mapa={};var periodos=[];
      lista.forEach(function(item){
        var id=texto(item.periodoId||item.periodoLabel||item.periodo);var label=texto(item.periodoLabel||item.periodo||item.periodoId);
        if(id&&!mapa[id]){mapa[id]=true;periodos.push({id:id,label:label||id,activo:true});}
      });
      if(!periodos.length){
        var fb=config().obtenerPeriodoFallback?config().obtenerPeriodoFallback():{id:'2026-02__2026-08',label:'Febrero 2026 a Agosto 2026'};
        periodos.push({id:fb.id,label:fb.label,activo:true});
      }
      return {periodos:periodos,principal:periodos[0],envios:lista};
    });
  }
  function extraerEnvioConsulta(respuesta,cedula,periodo){
    var candidatos=[respuesta&&respuesta.envio,respuesta&&respuesta.registro,respuesta&&respuesta.data&&respuesta.data.envio,respuesta&&respuesta.data&&respuesta.data.registro];
    for(var i=0;i<candidatos.length;i+=1){if(candidatos[i]&&typeof candidatos[i]==='object'&&!Array.isArray(candidatos[i])) return normalizarEnvio(candidatos[i],0);}
    var lista=extraerLista(respuesta,'envios').map(normalizarEnvio).filter(function(item){return item&&item.cedula===utils().limpiarCedula(cedula);});
    if(periodo){var p=normalComparacion(periodo);lista=lista.filter(function(item){return [item.periodo,item.periodoId,item.periodoLabel].some(function(v){return normalComparacion(v)===p;});});}
    return lista.length?lista[lista.length-1]:null;
  }
  function consultarEnvioPorCedula(cedula,periodo){
    cedula=utils().limpiarCedula(cedula);
    if(!cedula) return Promise.reject(new Error('No se recibió una cédula válida.'));
    if(!texto(periodo)) return Promise.reject(new Error('No se recibió el período del estudiante.'));
    return enviarGet('VERIFICAR_ENVIO',{
      cedula:cedula,
      numeroIdentificacion:cedula,
      periodo:texto(periodo)
    }).then(function(respuesta){
      if(respuesta&&respuesta.existe===false) throw new Error('Google Sheets no encontró el envío de la cédula '+cedula+' para ese período.');
      var envio=extraerEnvioConsulta(respuesta,cedula,periodo);
      if(!envio) throw new Error('Google Sheets no devolvió el envío de la cédula '+cedula+'.');
      return envio;
    });
  }
  function nombreCoordinador(valor){
    if(!valor) return '';
    if(typeof valor==='string') return valor;
    return texto(valor.nombre||valor.coordinador||valor.id||'');
  }
  function aprobarEnvio(envio,resolucion){
    envio=envio||{};resolucion=resolucion||{};
    var tituloFinal=utils().limpiarTitulo(resolucion.tituloFinal);
    var tituloOriginal=utils().limpiarTitulo(resolucion.tituloOriginal);
    if(!tituloFinal||tituloFinal.length<config().obtener('revision.tituloMinimo',8)) return Promise.reject(new Error(config().obtener('textos.seleccionaTitulo')));
    var estadoFinal=tituloFinal===tituloOriginal?config().obtenerEstado('aprobado'):config().obtenerEstado('reemplazado');
    var payload={
      cedula:envio.cedula||'',numeroIdentificacion:envio.cedula||'',periodo:envio.periodoLabel||envio.periodo||'',
      estudiante:envio.nombres||'',nombres:envio.nombres||'',carrera:envio.carrera||'',
      coordinador:nombreCoordinador(resolucion.coordinador),estadoFinal:estadoFinal,estado:estadoFinal,
      tituloElegido:tituloOriginal||tituloFinal,preferido:tituloOriginal||tituloFinal,
      tituloCorregido:tituloFinal!==tituloOriginal?tituloFinal:'',
      observacion:utils().limpiarTextoMultilinea(resolucion.comentarioCoordinador),
      comentario:utils().limpiarTextoMultilinea(resolucion.comentarioCoordinador),
      fechaResolucion:utils().fechaIso()
    };
    return enviarPost('GUARDAR_RESOLUCION',payload).then(function(respuesta){return {ok:true,estado:estadoFinal,mensaje:respuesta.mensaje||config().obtener('textos.aprobarOk'),respuesta:respuesta,payload:payload};});
  }
  function devolverEnvio(envio,resolucion){
    envio=envio||{};resolucion=resolucion||{};
    var comentario=utils().limpiarTextoMultilinea(resolucion.comentarioCoordinador);
    if(config().obtener('revision.comentarioObligatorioAlDevolver',true)&&comentario.length<config().obtener('revision.comentarioMinimo',4)) return Promise.reject(new Error(config().obtener('textos.comentarioDevolucion')));
    var estadoFinal=config().obtenerEstado('devuelto');
    var tituloElegido=envio.tituloPreferidoTexto||envio.tituloPreferido||envio.titulo1||'';
    var payload={
      cedula:envio.cedula||'',numeroIdentificacion:envio.cedula||'',periodo:envio.periodoLabel||envio.periodo||'',
      estudiante:envio.nombres||'',nombres:envio.nombres||'',carrera:envio.carrera||'',
      coordinador:nombreCoordinador(resolucion.coordinador),estadoFinal:estadoFinal,estado:estadoFinal,
      tituloElegido:tituloElegido,preferido:tituloElegido,tituloCorregido:'',
      observacion:comentario,comentario:comentario,fechaResolucion:utils().fechaIso()
    };
    return enviarPost('GUARDAR_RESOLUCION',payload).then(function(respuesta){return {ok:true,estado:estadoFinal,mensaje:respuesta.mensaje||config().obtener('textos.devolverOk'),respuesta:respuesta,payload:payload};});
  }
  function diagnostico(){
    return Promise.all([leerConfiguracion(true),enviarGet('PING',{})]).then(function(partes){return {ok:true,fuentePrincipal:'Google Sheets',endpointConfigurado:Boolean(partes[0].endpoint),activo:partes[0].activo,respuesta:partes[1],fecha:new Date().toISOString()};});
  }

  window.CoordinadorMVPSheetsPrimary=Object.freeze({
    leerConfiguracion:leerConfiguracion,enviarAccion:enviarAccion,enviarGet:enviarGet,enviarPost:enviarPost,
    listarCoordinadores:listarCoordinadores,listarPeriodos:listarPeriodos,listarEnvios:listarEnvios,
    consultarEnvioPorCedula:consultarEnvioPorCedula,aprobarEnvio:aprobarEnvio,devolverEnvio:devolverEnvio,diagnostico:diagnostico,
    normalizarCoordinador:normalizarCoordinador,normalizarEnvio:normalizarEnvio,mensajeError:mensajeError
  });
})(window);
