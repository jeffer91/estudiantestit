/* =========================================================
Archivo: coordinador.state.js
Ruta: /coordinadores-mvp/js/coordinador.state.js
Función:
- Mantener períodos, coordinadores, títulos, vista y búsqueda.
- Filtrar con equivalencias flexibles de período y carrera.
- Exponer conteos para diagnosticar dónde desaparecen los registros.
========================================================= */
(function(window){
  'use strict';

  var listeners=[];
  var state={
    iniciado:false,cargando:false,periodos:[],periodoActual:null,
    coordinadores:[],coordinadorActual:null,envios:[],registrosFiltrados:[],
    vistaActual:'pendientes',busqueda:'',estudianteSeleccionado:null,
    ultimaCarga:null,ultimoError:null,
    diagnosticoFiltros:{recibidos:0,conTitulos:0,delPeriodo:0,deCarreras:0,delEstado:0,mostrados:0}
  };

  function utils(){return window.CoordinadorMVPUtils||null;}
  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function normal(valor){
    return texto(valor).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();
  }
  function estadoNormal(valor){return normal(valor).replace(/ /g,'_');}
  function errorSerializable(error){
    if(!error)return null;
    if(typeof error==='string')return{name:'Error',message:error};
    if(error instanceof Error)return{name:error.name||'Error',message:error.message||String(error),stack:error.stack||''};
    if(typeof error==='object'){
      var mensaje=error.message||error.mensaje||error.error||error.detalle||error.codigo;
      if(typeof mensaje==='object'){try{mensaje=JSON.stringify(mensaje);}catch(e){mensaje=String(mensaje);}}
      if(!mensaje){try{mensaje=JSON.stringify(error);}catch(e2){mensaje=String(error);}}
      return{name:texto(error.name||'Error'),message:texto(mensaje||'Error desconocido'),detalle:error};
    }
    return{name:'Error',message:String(error)};
  }
  function clonar(valor){
    if(valor instanceof Error)return errorSerializable(valor);
    try{return JSON.parse(JSON.stringify(valor,function(_clave,item){return item instanceof Error?errorSerializable(item):item;}));}
    catch(error){if(utils()&&utils().clonar){try{return utils().clonar(valor);}catch(e){}}return valor;}
  }
  function guardarLocal(clave,valor){try{window.localStorage.setItem(clave,JSON.stringify(valor));}catch(error){}}
  function leerLocal(clave){try{var valor=window.localStorage.getItem(clave);return valor?JSON.parse(valor):'';}catch(error){return '';}}

  function iniciar(){state.iniciado=true;state.vistaActual=leerLocal('coordinadores_mvp__ultima_vista')||'pendientes';recalcularFiltros();emitir('iniciado');return true;}
  function obtenerEstado(){return clonar(state);}
  function estaCargando(){return state.cargando===true;}
  function setCargando(valor){state.cargando=valor===true;emitir('cargando');}
  function setError(error){state.ultimoError=errorSerializable(error);emitir('error');}
  function limpiarError(){state.ultimoError=null;emitir('error-limpiado');}

  function setPeriodos(lista,principal){
    var ultimoId=leerLocal('coordinadores_mvp__ultimo_periodo');
    var seleccionado=null;
    state.periodos=Array.isArray(lista)?lista.slice():[];
    if(ultimoId)seleccionado=state.periodos.find(function(item){return item.id===ultimoId;})||null;
    if(!seleccionado&&principal&&principal.id)seleccionado=state.periodos.find(function(item){return item.id===principal.id;})||null;
    if(!seleccionado)seleccionado=state.periodos[0]||null;
    state.periodoActual=seleccionado;
    if(seleccionado)guardarLocal('coordinadores_mvp__ultimo_periodo',seleccionado.id);
    recalcularFiltros();emitir('periodos');
  }
  function setPeriodoActual(id){
    id=texto(id);
    state.periodoActual=state.periodos.find(function(item){return item.id===id;})||null;
    if(state.periodoActual)guardarLocal('coordinadores_mvp__ultimo_periodo',state.periodoActual.id);
    /* Los envíos ya cargados se conservan y solo se vuelven a filtrar. */
    state.estudianteSeleccionado=null;
    recalcularFiltros();emitir('periodo');return obtenerPeriodoActual();
  }
  function obtenerPeriodos(){return clonar(state.periodos);}
  function obtenerPeriodoActual(){return state.periodoActual?clonar(state.periodoActual):null;}

  function setCoordinadores(lista){
    var ultimoId=leerLocal('coordinadores_mvp__ultimo_coordinador');
    state.coordinadores=Array.isArray(lista)?lista.slice():[];
    state.coordinadorActual=ultimoId?state.coordinadores.find(function(item){return item.id===ultimoId;})||null:null;
    recalcularFiltros();emitir('coordinadores');
  }
  function setCoordinadorActual(id){
    id=texto(id);state.coordinadorActual=state.coordinadores.find(function(item){return item.id===id;})||null;
    if(state.coordinadorActual)guardarLocal('coordinadores_mvp__ultimo_coordinador',state.coordinadorActual.id);
    recalcularFiltros();emitir('coordinador');return obtenerCoordinadorActual();
  }
  function obtenerCoordinadores(){return clonar(state.coordinadores);}
  function obtenerCoordinadorActual(){return state.coordinadorActual?clonar(state.coordinadorActual):null;}

  function setEnvios(lista){state.envios=Array.isArray(lista)?lista.slice():[];state.ultimaCarga=new Date().toISOString();recalcularFiltros();emitir('envios');}
  function obtenerEnvios(){return clonar(state.envios);}
  function setVistaActual(vista){if(['pendientes','aprobados','devueltos'].indexOf(vista)<0)return false;state.vistaActual=vista;guardarLocal('coordinadores_mvp__ultima_vista',vista);recalcularFiltros();emitir('vista');return true;}
  function obtenerVistaActual(){return state.vistaActual;}
  function setBusqueda(valor){state.busqueda=texto(valor);recalcularFiltros();emitir('busqueda');}
  function obtenerBusqueda(){return state.busqueda;}
  function estadosVista(vista){if(vista==='aprobados')return['APROBADO','REEMPLAZADO'];if(vista==='devueltos')return['DEVUELTO'];return['PENDIENTE_REVISION','PENDIENTE_SYNC','ENVIADO','PENDIENTE'];}

  function tokensCarrera(valor){
    var ignorar={UNIVERSITARIA:1,UNIVERSITARIO:1,TECNOLOGIA:1,TECNOLOGO:1,SUPERIOR:1,EN:1,DE:1,DEL:1,LA:1,EL:1,Y:1,ONLINE:1,TSU:1};
    return normal(valor).split(' ').filter(function(token){return token.length>=3&&!ignorar[token];});
  }
  function carreraEquivalente(a,b){
    var na=normal(a);var nb=normal(b);
    if(!na||!nb)return false;
    if(na===nb||na.indexOf(nb)>=0||nb.indexOf(na)>=0)return true;
    var ta=tokensCarrera(a);var tb=tokensCarrera(b);
    if(!ta.length||!tb.length)return false;
    var comunes=ta.filter(function(token){return tb.indexOf(token)>=0;});
    var base=Math.min(ta.length,tb.length);
    return comunes.length>=2&&comunes.length/base>=0.7;
  }
  function coincideCarrera(envio,coordinador){
    var carreras=coordinador&&Array.isArray(coordinador.carreras)?coordinador.carreras:[];
    var valores=[envio&&envio.carrera,envio&&envio.codigoCarrera].filter(Boolean);
    if(!carreras.length||!valores.length)return false;
    return carreras.some(function(carrera){return valores.some(function(valor){return carreraEquivalente(valor,carrera);});});
  }

  function firmaPeriodo(valor){
    var base=normal(valor);
    if(!base)return'';
    var meses={ENERO:'01',FEBRERO:'02',MARZO:'03',ABRIL:'04',MAYO:'05',JUNIO:'06',JULIO:'07',AGOSTO:'08',SEPTIEMBRE:'09',SETIEMBRE:'09',OCTUBRE:'10',NOVIEMBRE:'11',DICIEMBRE:'12'};
    Object.keys(meses).forEach(function(mes){base=base.replace(new RegExp('\\b'+mes+'\\b','g'),meses[mes]);});
    var pares=[];var visto={};var m;
    var agregar=function(anio,mes){mes=String(Number(mes)).padStart(2,'0');var par=anio+'-'+mes;if(Number(mes)>=1&&Number(mes)<=12&&!visto[par]){visto[par]=true;pares.push(par);}};
    var reYM=/\b(20\d{2})\s+(\d{1,2})\b/g;
    while((m=reYM.exec(base)))agregar(m[1],m[2]);
    var reMY=/\b(\d{1,2})\s+(20\d{2})\b/g;
    while((m=reMY.exec(base)))agregar(m[2],m[1]);
    if(pares.length>=2)return pares[0]+'__'+pares[pares.length-1];
    if(pares.length===1)return pares[0];
    return base;
  }
  function periodoEquivalente(a,b){
    var na=normal(a);var nb=normal(b);
    if(!na||!nb)return false;
    if(na===nb||na.indexOf(nb)>=0||nb.indexOf(na)>=0)return true;
    var fa=firmaPeriodo(a);var fb=firmaPeriodo(b);
    return Boolean(fa&&fb&&fa===fb);
  }
  function coincidePeriodo(envio,periodo){
    if(!periodo)return false;
    var esperados=[periodo.id,periodo.label].filter(Boolean);
    var disponibles=[envio&&envio.periodoId,envio&&envio.periodoLabel,envio&&envio.periodo].filter(Boolean);
    return esperados.some(function(a){return disponibles.some(function(b){return periodoEquivalente(a,b);});});
  }

  function tieneTitulos(envio){return Boolean(envio&&(envio.titulo1||envio.titulo2||envio.titulo3));}
  function recalcularFiltros(){
    var permitidos=estadosVista(state.vistaActual);var busqueda=normal(state.busqueda);
    var periodo=state.periodoActual;var coordinador=state.coordinadorActual;
    var conTitulos=state.envios.filter(tieneTitulos);
    var delPeriodo=conTitulos.filter(function(envio){return coincidePeriodo(envio,periodo);});
    var deCarreras=delPeriodo.filter(function(envio){return coincideCarrera(envio,coordinador);});
    var delEstado=deCarreras.filter(function(envio){return permitidos.indexOf(estadoNormal(envio.estado))>=0;});
    state.registrosFiltrados=delEstado.filter(function(envio){
      var base=normal([envio.cedula,envio.nombres,envio.carrera,envio.codigoCarrera,envio.periodoLabel].join(' '));
      return !busqueda||base.indexOf(busqueda)>=0;
    });
    state.diagnosticoFiltros={
      recibidos:state.envios.length,
      conTitulos:conTitulos.length,
      delPeriodo:delPeriodo.length,
      deCarreras:deCarreras.length,
      delEstado:delEstado.length,
      mostrados:state.registrosFiltrados.length
    };
    return state.registrosFiltrados;
  }
  function obtenerRegistrosFiltrados(){return clonar(state.registrosFiltrados);}
  function obtenerTotalFiltrado(){return state.registrosFiltrados.length;}
  function obtenerDiagnosticoFiltros(){return clonar(state.diagnosticoFiltros);}
  function seleccionarEstudiante(id){id=texto(id);state.estudianteSeleccionado=state.envios.find(function(item){return item.id===id||item._docId===id||item._clave===id||item.cedula===id;})||null;emitir('estudiante');return obtenerEstudianteSeleccionado();}
  function setEstudianteSeleccionado(envio){state.estudianteSeleccionado=envio||null;emitir('estudiante');}
  function obtenerEstudianteSeleccionado(){return state.estudianteSeleccionado?clonar(state.estudianteSeleccionado):null;}
  function actualizarEnvioLocal(id,cambios){id=texto(id);var actualizado=null;state.envios=state.envios.map(function(item){if(item.id!==id&&item._docId!==id&&item._clave!==id&&item.cedula!==id)return item;actualizado=Object.assign({},item,cambios||{});return actualizado;});if(actualizado)state.estudianteSeleccionado=actualizado;recalcularFiltros();emitir('envio-actualizado');return actualizado?clonar(actualizado):null;}
  function limpiar(){state.envios=[];state.registrosFiltrados=[];state.estudianteSeleccionado=null;state.ultimoError=null;recalcularFiltros();emitir('limpio');}
  function escuchar(callback){if(typeof callback!=='function')return function(){};listeners.push(callback);return function(){listeners=listeners.filter(function(item){return item!==callback;});};}
  function emitir(tipo){var snapshot=obtenerEstado();listeners.forEach(function(listener){try{listener(tipo,snapshot);}catch(error){console.warn('[CoordinadorState]',error);}});}

  window.CoordinadorMVPState=Object.freeze({
    iniciar:iniciar,obtenerEstado:obtenerEstado,estaCargando:estaCargando,setCargando:setCargando,setError:setError,limpiarError:limpiarError,
    setPeriodos:setPeriodos,setPeriodoActual:setPeriodoActual,obtenerPeriodos:obtenerPeriodos,obtenerPeriodoActual:obtenerPeriodoActual,
    setCoordinadores:setCoordinadores,setCoordinadorActual:setCoordinadorActual,obtenerCoordinadores:obtenerCoordinadores,obtenerCoordinadorActual:obtenerCoordinadorActual,
    setEnvios:setEnvios,obtenerEnvios:obtenerEnvios,setVistaActual:setVistaActual,obtenerVistaActual:obtenerVistaActual,setBusqueda:setBusqueda,obtenerBusqueda:obtenerBusqueda,
    recalcularFiltros:recalcularFiltros,obtenerRegistrosFiltrados:obtenerRegistrosFiltrados,obtenerTotalFiltrado:obtenerTotalFiltrado,obtenerDiagnosticoFiltros:obtenerDiagnosticoFiltros,
    seleccionarEstudiante:seleccionarEstudiante,setEstudianteSeleccionado:setEstudianteSeleccionado,obtenerEstudianteSeleccionado:obtenerEstudianteSeleccionado,
    actualizarEnvioLocal:actualizarEnvioLocal,limpiar:limpiar,escuchar:escuchar
  });
})(window);
