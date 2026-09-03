/* Estado de Coordinadores: artículos académicos y Trabajos de Titulación. */
(function(window){
  'use strict';

  var listeners=[];
  var state={
    iniciado:false,cargando:false,coordinadores:[],coordinadorActual:null,
    envios:[],registrosFiltrados:[],vistaActual:'pendientes',busqueda:'',tipoTrabajoActual:'TODOS',
    estudianteSeleccionado:null,ultimaCarga:null,ultimoError:null,
    diagnosticoFiltros:{recibidos:0,conTitulos:0,deCarreras:0,delTipo:0,delEstado:0,mostrados:0}
  };

  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function normal(valor){return texto(valor).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function estadoNormal(valor){return normal(valor).replace(/ /g,'_');}
  function tipoNormal(envio){var raw=texto(envio&&envio.tipoTrabajo||envio&&envio.raw&&envio.raw.tipoTrabajo).toUpperCase();return raw==='TRABAJO_TITULACION'?'TRABAJO_TITULACION':'ARTICULO_ACADEMICO';}
  function guardarLocal(clave,valor){try{window.localStorage.setItem(clave,JSON.stringify(valor));}catch(error){}}
  function leerLocal(clave){try{var valor=window.localStorage.getItem(clave);return valor?JSON.parse(valor):'';}catch(error){return '';}}
  function errorSerializable(error){if(!error)return null;if(typeof error==='string')return{name:'Error',message:error};return{name:texto(error.name||'Error'),message:texto(error.message||error.mensaje||error.error||error)};}
  function clonar(valor){try{return JSON.parse(JSON.stringify(valor));}catch(error){return valor;}}
  function emitir(tipo){var snapshot=obtenerEstado();listeners.forEach(function(listener){try{listener(tipo,snapshot);}catch(error){console.warn('[CoordinadorState]',error);}});}

  function iniciar(){
    state.iniciado=true;
    var guardada=leerLocal('coordinadores_mvp__ultima_vista_titulos');
    var tipo=leerLocal('coordinadores_mvp__tipo_trabajo');
    state.vistaActual=['pendientes','devueltos','validados','aprobados'].indexOf(guardada)>=0?guardada:'pendientes';
    state.tipoTrabajoActual=['TODOS','ARTICULO_ACADEMICO','TRABAJO_TITULACION'].indexOf(tipo)>=0?tipo:'TODOS';
    recalcularFiltros();emitir('iniciado');return true;
  }
  function obtenerEstado(){return clonar(state);}
  function estaCargando(){return state.cargando===true;}
  function setCargando(valor){state.cargando=valor===true;emitir('cargando');}
  function setError(error){state.ultimoError=errorSerializable(error);emitir('error');}
  function limpiarError(){state.ultimoError=null;emitir('error-limpiado');}

  function setCoordinadores(lista){var ultimoId=leerLocal('coordinadores_mvp__ultimo_coordinador');state.coordinadores=Array.isArray(lista)?lista.slice():[];state.coordinadorActual=ultimoId?state.coordinadores.find(function(item){return item.id===ultimoId;})||null:null;recalcularFiltros();emitir('coordinadores');}
  function setCoordinadorActual(id){id=texto(id);state.coordinadorActual=state.coordinadores.find(function(item){return item.id===id;})||null;if(state.coordinadorActual)guardarLocal('coordinadores_mvp__ultimo_coordinador',state.coordinadorActual.id);recalcularFiltros();emitir('coordinador');return obtenerCoordinadorActual();}
  function obtenerCoordinadores(){return clonar(state.coordinadores);}
  function obtenerCoordinadorActual(){return state.coordinadorActual?clonar(state.coordinadorActual):null;}

  function setEnvios(lista){state.envios=Array.isArray(lista)?lista.slice():[];state.ultimaCarga=new Date().toISOString();recalcularFiltros();emitir('envios');}
  function obtenerEnvios(){return clonar(state.envios);}
  function setVistaActual(vista){if(['pendientes','devueltos','validados','aprobados'].indexOf(vista)<0)return false;state.vistaActual=vista;guardarLocal('coordinadores_mvp__ultima_vista_titulos',vista);recalcularFiltros();emitir('vista');return true;}
  function obtenerVistaActual(){return state.vistaActual;}
  function setBusqueda(valor){state.busqueda=texto(valor);recalcularFiltros();emitir('busqueda');}
  function obtenerBusqueda(){return state.busqueda;}
  function setTipoTrabajoActual(tipo){tipo=texto(tipo).toUpperCase();if(['TODOS','ARTICULO_ACADEMICO','TRABAJO_TITULACION'].indexOf(tipo)<0)return false;state.tipoTrabajoActual=tipo;guardarLocal('coordinadores_mvp__tipo_trabajo',tipo);recalcularFiltros();emitir('tipo-trabajo');return true;}
  function obtenerTipoTrabajoActual(){return state.tipoTrabajoActual;}

  function tokensCarrera(valor){var ignorar={UNIVERSITARIA:1,UNIVERSITARIO:1,TECNOLOGIA:1,TECNOLOGO:1,SUPERIOR:1,EN:1,DE:1,DEL:1,LA:1,EL:1,Y:1,ONLINE:1,TSU:1};return normal(valor).split(' ').filter(function(token){return token.length>=3&&!ignorar[token];});}
  function carreraEquivalente(a,b){var na=normal(a),nb=normal(b);if(!na||!nb)return false;if(na===nb||na.indexOf(nb)>=0||nb.indexOf(na)>=0)return true;var ta=tokensCarrera(a),tb=tokensCarrera(b);if(!ta.length||!tb.length)return false;var comunes=ta.filter(function(token){return tb.indexOf(token)>=0;});var base=Math.min(ta.length,tb.length);return comunes.length>=2&&comunes.length/base>=0.7;}
  function coincideCarrera(envio,coordinador){var carreras=coordinador&&Array.isArray(coordinador.carreras)?coordinador.carreras:[];var valores=[envio&&envio.carrera,envio&&envio.codigoCarrera].filter(Boolean);if(!carreras.length||!valores.length)return false;return carreras.some(function(carrera){return valores.some(function(valor){return carreraEquivalente(valor,carrera);});});}
  function tieneTitulos(envio){return Boolean(envio&&(envio.titulo1||envio.titulo2||envio.titulo3));}
  function estadosVista(vista){if(vista==='aprobados')return['APROBADO_FINAL','APROBADO','REEMPLAZADO'];if(vista==='validados')return['PENDIENTE_INVESTIGADOR'];if(vista==='devueltos')return['DEVUELTO'];return['PENDIENTE_REVISION','PENDIENTE_COORDINADOR','PENDIENTE_SYNC','ENVIADO','PENDIENTE'];}

  function recalcularFiltros(){
    var permitidos=estadosVista(state.vistaActual),busqueda=normal(state.busqueda),coordinador=state.coordinadorActual,tipo=state.tipoTrabajoActual;
    var conTitulos=state.envios.filter(tieneTitulos);
    var deCarreras=conTitulos.filter(function(envio){return coincideCarrera(envio,coordinador);});
    var delTipo=deCarreras.filter(function(envio){return tipo==='TODOS'||tipoNormal(envio)===tipo;});
    var delEstado=delTipo.filter(function(envio){return permitidos.indexOf(estadoNormal(envio.estadoProceso||envio.estado))>=0;});
    state.registrosFiltrados=delEstado.filter(function(envio){var base=normal([envio.cedula,envio.nombres,envio.carrera,envio.codigoCarrera,envio.periodoLabel,envio.periodoId,envio.tipoTrabajo,envio.tipoTrabajoLabel,envio.titulo1,envio.titulo2,envio.titulo3,envio.tituloCoordinador,envio.tituloFinal].join(' '));return !busqueda||base.indexOf(busqueda)>=0;});
    state.diagnosticoFiltros={recibidos:state.envios.length,conTitulos:conTitulos.length,deCarreras:deCarreras.length,delTipo:delTipo.length,delEstado:delEstado.length,mostrados:state.registrosFiltrados.length};
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

  window.CoordinadorMVPState=Object.freeze({
    iniciar:iniciar,obtenerEstado:obtenerEstado,estaCargando:estaCargando,setCargando:setCargando,setError:setError,limpiarError:limpiarError,
    setCoordinadores:setCoordinadores,setCoordinadorActual:setCoordinadorActual,obtenerCoordinadores:obtenerCoordinadores,obtenerCoordinadorActual:obtenerCoordinadorActual,
    setEnvios:setEnvios,obtenerEnvios:obtenerEnvios,setVistaActual:setVistaActual,obtenerVistaActual:obtenerVistaActual,setBusqueda:setBusqueda,obtenerBusqueda:obtenerBusqueda,
    setTipoTrabajoActual:setTipoTrabajoActual,obtenerTipoTrabajoActual:obtenerTipoTrabajoActual,
    recalcularFiltros:recalcularFiltros,obtenerRegistrosFiltrados:obtenerRegistrosFiltrados,obtenerTotalFiltrado:obtenerTotalFiltrado,obtenerDiagnosticoFiltros:obtenerDiagnosticoFiltros,
    seleccionarEstudiante:seleccionarEstudiante,setEstudianteSeleccionado:setEstudianteSeleccionado,obtenerEstudianteSeleccionado:obtenerEstudianteSeleccionado,
    actualizarEnvioLocal:actualizarEnvioLocal,limpiar:limpiar,escuchar:escuchar,
    setPeriodos:function(){},setPeriodoActual:function(){return null;},obtenerPeriodos:function(){return[];},obtenerPeriodoActual:function(){return null;}
  });
})(window);
