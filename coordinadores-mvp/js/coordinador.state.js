/* =========================================================
Archivo: coordinador.state.js
Ruta: /coordinadores-mvp/js/coordinador.state.js
Función:
- Mantener períodos, coordinadores, títulos, vista y búsqueda.
- Filtrar por período, carreras asignadas, estado y texto.
========================================================= */
(function(window){
  'use strict';

  var listeners = [];
  var state = {
    iniciado: false,
    cargando: false,
    periodos: [],
    periodoActual: null,
    coordinadores: [],
    coordinadorActual: null,
    envios: [],
    registrosFiltrados: [],
    vistaActual: 'pendientes',
    busqueda: '',
    estudianteSeleccionado: null,
    ultimaCarga: null,
    ultimoError: null
  };

  function utils(){ return window.CoordinadorMVPUtils || null; }
  function texto(valor){ return String(valor === null || valor === undefined ? '' : valor).trim(); }
  function normal(valor){
    return texto(valor)
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function estadoNormal(valor){ return normal(valor).replace(/ /g, '_'); }

  function clonar(valor){
    if(utils() && utils().clonar) return utils().clonar(valor);
    try{ return JSON.parse(JSON.stringify(valor)); }catch(error){ return valor; }
  }

  function guardarLocal(clave, valor){
    try{ window.localStorage.setItem(clave, JSON.stringify(valor)); }catch(error){}
  }

  function leerLocal(clave){
    try{
      var valor = window.localStorage.getItem(clave);
      return valor ? JSON.parse(valor) : '';
    }catch(error){ return ''; }
  }

  function iniciar(){
    state.iniciado = true;
    state.vistaActual = leerLocal('coordinadores_mvp__ultima_vista') || 'pendientes';
    recalcularFiltros();
    emitir('iniciado');
    return true;
  }

  function obtenerEstado(){ return clonar(state); }
  function estaCargando(){ return state.cargando === true; }

  function setCargando(valor){
    state.cargando = valor === true;
    emitir('cargando');
  }

  function setError(error){
    state.ultimoError = error || null;
    emitir('error');
  }

  function limpiarError(){
    state.ultimoError = null;
    emitir('error-limpiado');
  }

  function setPeriodos(lista, principal){
    var ultimoId = leerLocal('coordinadores_mvp__ultimo_periodo');
    var seleccionado = null;
    state.periodos = Array.isArray(lista) ? lista.slice() : [];

    if(ultimoId){
      seleccionado = state.periodos.find(function(item){ return item.id === ultimoId; }) || null;
    }
    if(!seleccionado && principal && principal.id){
      seleccionado = state.periodos.find(function(item){ return item.id === principal.id; }) || null;
    }
    if(!seleccionado) seleccionado = state.periodos[0] || null;

    state.periodoActual = seleccionado;
    if(seleccionado) guardarLocal('coordinadores_mvp__ultimo_periodo', seleccionado.id);
    recalcularFiltros();
    emitir('periodos');
  }

  function setPeriodoActual(id){
    id = texto(id);
    state.periodoActual = state.periodos.find(function(item){ return item.id === id; }) || null;
    if(state.periodoActual) guardarLocal('coordinadores_mvp__ultimo_periodo', state.periodoActual.id);
    state.envios = [];
    state.estudianteSeleccionado = null;
    recalcularFiltros();
    emitir('periodo');
    return obtenerPeriodoActual();
  }

  function obtenerPeriodos(){ return clonar(state.periodos); }
  function obtenerPeriodoActual(){ return state.periodoActual ? clonar(state.periodoActual) : null; }

  function setCoordinadores(lista){
    var ultimoId = leerLocal('coordinadores_mvp__ultimo_coordinador');
    state.coordinadores = Array.isArray(lista) ? lista.slice() : [];
    state.coordinadorActual = ultimoId
      ? state.coordinadores.find(function(item){ return item.id === ultimoId; }) || null
      : null;
    recalcularFiltros();
    emitir('coordinadores');
  }

  function setCoordinadorActual(id){
    id = texto(id);
    state.coordinadorActual = state.coordinadores.find(function(item){ return item.id === id; }) || null;
    if(state.coordinadorActual) guardarLocal('coordinadores_mvp__ultimo_coordinador', state.coordinadorActual.id);
    recalcularFiltros();
    emitir('coordinador');
    return obtenerCoordinadorActual();
  }

  function obtenerCoordinadores(){ return clonar(state.coordinadores); }
  function obtenerCoordinadorActual(){ return state.coordinadorActual ? clonar(state.coordinadorActual) : null; }

  function setEnvios(lista){
    state.envios = Array.isArray(lista) ? lista.slice() : [];
    state.ultimaCarga = new Date().toISOString();
    recalcularFiltros();
    emitir('envios');
  }

  function obtenerEnvios(){ return clonar(state.envios); }

  function setVistaActual(vista){
    if(['pendientes','aprobados','devueltos'].indexOf(vista) < 0) return false;
    state.vistaActual = vista;
    guardarLocal('coordinadores_mvp__ultima_vista', vista);
    recalcularFiltros();
    emitir('vista');
    return true;
  }

  function obtenerVistaActual(){ return state.vistaActual; }

  function setBusqueda(valor){
    state.busqueda = texto(valor);
    recalcularFiltros();
    emitir('busqueda');
  }

  function obtenerBusqueda(){ return state.busqueda; }

  function estadosVista(vista){
    if(vista === 'aprobados') return ['APROBADO','REEMPLAZADO'];
    if(vista === 'devueltos') return ['DEVUELTO'];
    return ['PENDIENTE_REVISION','PENDIENTE_SYNC','ENVIADO','PENDIENTE'];
  }

  function coincideCarrera(envio, coordinador){
    var carreras = coordinador && Array.isArray(coordinador.carreras) ? coordinador.carreras : [];
    var valoresEnvio = [envio && envio.carrera, envio && envio.codigoCarrera].map(normal).filter(Boolean);

    if(!carreras.length || !valoresEnvio.length) return false;

    return carreras.some(function(item){
      var token = normal(item);
      if(!token) return false;
      return valoresEnvio.some(function(valor){
        return valor === token || valor.indexOf(token) >= 0 || token.indexOf(valor) >= 0;
      });
    });
  }

  function coincidePeriodo(envio, periodo){
    if(!periodo) return false;
    var id = normal(periodo.id);
    var label = normal(periodo.label);
    return Boolean(
      (id && normal(envio.periodoId) === id) ||
      (label && normal(envio.periodoLabel) === label) ||
      (label && normal(envio.periodo) === label)
    );
  }

  function recalcularFiltros(){
    var permitidos = estadosVista(state.vistaActual);
    var busqueda = normal(state.busqueda);
    var periodo = state.periodoActual;
    var coordinador = state.coordinadorActual;

    state.registrosFiltrados = state.envios.filter(function(envio){
      var textoBusqueda = normal([
        envio.cedula,
        envio.nombres,
        envio.carrera,
        envio.codigoCarrera,
        envio.periodoLabel
      ].join(' '));

      return Boolean(
        coincidePeriodo(envio, periodo) &&
        coincideCarrera(envio, coordinador) &&
        permitidos.indexOf(estadoNormal(envio.estado)) >= 0 &&
        (!busqueda || textoBusqueda.indexOf(busqueda) >= 0)
      );
    });

    return state.registrosFiltrados;
  }

  function obtenerRegistrosFiltrados(){ return clonar(state.registrosFiltrados); }
  function obtenerTotalFiltrado(){ return state.registrosFiltrados.length; }

  function seleccionarEstudiante(id){
    id = texto(id);
    state.estudianteSeleccionado = state.envios.find(function(item){
      return item.id === id || item._docId === id || item._clave === id || item.cedula === id;
    }) || null;
    emitir('estudiante');
    return obtenerEstudianteSeleccionado();
  }

  function setEstudianteSeleccionado(envio){
    state.estudianteSeleccionado = envio || null;
    emitir('estudiante');
  }

  function obtenerEstudianteSeleccionado(){
    return state.estudianteSeleccionado ? clonar(state.estudianteSeleccionado) : null;
  }

  function actualizarEnvioLocal(id, cambios){
    id = texto(id);
    var actualizado = null;
    state.envios = state.envios.map(function(item){
      if(item.id !== id && item._docId !== id && item._clave !== id && item.cedula !== id) return item;
      actualizado = Object.assign({}, item, cambios || {});
      return actualizado;
    });
    if(actualizado) state.estudianteSeleccionado = actualizado;
    recalcularFiltros();
    emitir('envio-actualizado');
    return actualizado ? clonar(actualizado) : null;
  }

  function limpiar(){
    state.envios = [];
    state.registrosFiltrados = [];
    state.estudianteSeleccionado = null;
    state.ultimoError = null;
    recalcularFiltros();
    emitir('limpio');
  }

  function escuchar(callback){
    if(typeof callback !== 'function') return function(){};
    listeners.push(callback);
    return function(){ listeners = listeners.filter(function(item){ return item !== callback; }); };
  }

  function emitir(tipo){
    var snapshot = obtenerEstado();
    listeners.forEach(function(listener){
      try{ listener(tipo, snapshot); }catch(error){ console.warn('[CoordinadorState]', error); }
    });
  }

  window.CoordinadorMVPState = Object.freeze({
    iniciar: iniciar,
    obtenerEstado: obtenerEstado,
    estaCargando: estaCargando,
    setCargando: setCargando,
    setError: setError,
    limpiarError: limpiarError,
    setPeriodos: setPeriodos,
    setPeriodoActual: setPeriodoActual,
    obtenerPeriodos: obtenerPeriodos,
    obtenerPeriodoActual: obtenerPeriodoActual,
    setCoordinadores: setCoordinadores,
    setCoordinadorActual: setCoordinadorActual,
    obtenerCoordinadores: obtenerCoordinadores,
    obtenerCoordinadorActual: obtenerCoordinadorActual,
    setEnvios: setEnvios,
    obtenerEnvios: obtenerEnvios,
    setVistaActual: setVistaActual,
    obtenerVistaActual: obtenerVistaActual,
    setBusqueda: setBusqueda,
    obtenerBusqueda: obtenerBusqueda,
    recalcularFiltros: recalcularFiltros,
    obtenerRegistrosFiltrados: obtenerRegistrosFiltrados,
    obtenerTotalFiltrado: obtenerTotalFiltrado,
    seleccionarEstudiante: seleccionarEstudiante,
    setEstudianteSeleccionado: setEstudianteSeleccionado,
    obtenerEstudianteSeleccionado: obtenerEstudianteSeleccionado,
    actualizarEnvioLocal: actualizarEnvioLocal,
    limpiar: limpiar,
    escuchar: escuchar
  });
})(window);
