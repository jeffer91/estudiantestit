/*
  Archivo: coordinador.state.js
  Ruta: coordinadores-mvp/js/coordinador.state.js

  Funciones principales:
  - Mantener el estado central de coordinadores-mvp.
  - Guardar coordinador seleccionado, vista activa, envíos y búsqueda.
  - Filtrar estudiantes por coordinador, carrera, estado y texto.
  - Seleccionar estudiante para el modal.
  - Notificar cambios a la UI.
*/

(function (window) {
  'use strict';

  var listeners = [];

  var state = {
    iniciado: false,
    cargando: false,
    vistaActual: 'pendientes',
    busqueda: '',
    coordinadores: [],
    coordinadorActual: null,
    envios: [],
    registrosFiltrados: [],
    estudianteSeleccionado: null,
    ultimaCarga: null,
    ultimoError: null
  };

  function obtenerConfig() {
    return window.CoordinadorMVPConfig || null;
  }

  function obtenerUtils() {
    return window.CoordinadorMVPUtils || null;
  }

  function iniciar() {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var vistaGuardada;

    if (!config || !utils) {
      return false;
    }

    vistaGuardada = utils.leerLocal(
      config.obtener('almacenamiento.claveUltimaVista'),
      config.obtener('ui.vistaInicial', 'pendientes')
    );

    if (config.obtenerVista(vistaGuardada)) {
      state.vistaActual = vistaGuardada;
    } else {
      state.vistaActual = config.obtener('ui.vistaInicial', 'pendientes');
    }

    state.iniciado = true;
    recalcularFiltros();
    emitir('iniciado');

    return true;
  }

  function obtenerEstado() {
    return obtenerUtils().clonar(state);
  }

  function estaCargando() {
    return state.cargando === true;
  }

  function setCargando(valor) {
    state.cargando = valor === true;
    emitir('cargando');
  }

  function setError(error) {
    state.ultimoError = error || null;
    emitir('error');
  }

  function limpiarError() {
    state.ultimoError = null;
    emitir('error-limpiado');
  }

  function setCoordinadores(coordinadores) {
    state.coordinadores = Array.isArray(coordinadores) ? coordinadores.slice() : [];

    restaurarUltimoCoordinadorSiExiste();
    recalcularFiltros();
    emitir('coordinadores');
  }

  function obtenerCoordinadores() {
    return state.coordinadores.slice();
  }

  function setCoordinadorActual(coordinadorId) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var encontrado = null;

    coordinadorId = utils.limpiarTexto(coordinadorId);

    state.coordinadores.forEach(function (coordinador) {
      if (coordinador && coordinador.id === coordinadorId) {
        encontrado = coordinador;
      }
    });

    state.coordinadorActual = encontrado;

    if (encontrado) {
      utils.guardarLocal(
        config.obtener('almacenamiento.claveUltimoCoordinador'),
        encontrado.id
      );
    }

    recalcularFiltros();
    emitir('coordinador');
  }

  function obtenerCoordinadorActual() {
    return state.coordinadorActual ? obtenerUtils().clonar(state.coordinadorActual) : null;
  }

  function restaurarUltimoCoordinadorSiExiste() {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var ultimoId;
    var existe = false;

    if (state.coordinadorActual || !state.coordinadores.length) {
      return;
    }

    ultimoId = utils.leerLocal(config.obtener('almacenamiento.claveUltimoCoordinador'), '');

    if (!ultimoId) {
      return;
    }

    state.coordinadores.forEach(function (coordinador) {
      if (coordinador.id === ultimoId) {
        existe = true;
      }
    });

    if (existe) {
      setCoordinadorActual(ultimoId);
    }
  }

  function setEnvios(envios) {
    state.envios = Array.isArray(envios) ? envios.slice() : [];
    state.ultimaCarga = new Date().toISOString();
    recalcularFiltros();
    emitir('envios');
  }

  function obtenerEnvios() {
    return state.envios.slice();
  }

  function setVistaActual(vistaId) {
    var config = obtenerConfig();
    var utils = obtenerUtils();

    vistaId = utils.limpiarTexto(vistaId);

    if (!config.obtenerVista(vistaId)) {
      return false;
    }

    state.vistaActual = vistaId;

    utils.guardarLocal(
      config.obtener('almacenamiento.claveUltimaVista'),
      vistaId
    );

    recalcularFiltros();
    emitir('vista');

    return true;
  }

  function obtenerVistaActual() {
    return state.vistaActual;
  }

  function setBusqueda(texto) {
    state.busqueda = obtenerUtils().limpiarTexto(texto);
    recalcularFiltros();
    emitir('busqueda');
  }

  function obtenerBusqueda() {
    return state.busqueda;
  }

  function obtenerRegistrosFiltrados() {
    return state.registrosFiltrados.slice();
  }

  function obtenerTotalFiltrado() {
    return state.registrosFiltrados.length;
  }

  function recalcularFiltros() {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var vista;
    var estadoEsperado;
    var coordinador;
    var busqueda;

    if (!config || !utils) {
      state.registrosFiltrados = [];
      return [];
    }

    vista = config.obtenerVista(state.vistaActual);
    estadoEsperado = vista ? utils.normalizarEstado(vista.estado) : '';
    coordinador = state.coordinadorActual;
    busqueda = utils.limpiarTexto(state.busqueda).toLowerCase();

    state.registrosFiltrados = state.envios.filter(function (envio) {
      var coincideEstado;
      var coincideCarrera;
      var coincideBusqueda;
      var textoBusqueda;

      envio = envio || {};

      coincideEstado = estadoEsperado
        ? utils.normalizarEstado(envio.estado) === estadoEsperado
        : true;

      coincideCarrera = coordinador
        ? utils.carreraPermitida(envio.carrera, coordinador.carreras)
        : false;

      textoBusqueda = [
        envio.cedula,
        envio.nombres,
        envio.nombre,
        envio.carrera,
        envio.periodo
      ].join(' ').toLowerCase();

      coincideBusqueda = busqueda
        ? textoBusqueda.indexOf(busqueda) !== -1
        : true;

      return coincideEstado && coincideCarrera && coincideBusqueda;
    });

    return state.registrosFiltrados;
  }

  function seleccionarEstudiante(id) {
    var utils = obtenerUtils();
    var encontrado = null;

    id = utils.limpiarTexto(id);

    state.envios.forEach(function (envio) {
      if (!envio || encontrado) {
        return;
      }

      if (envio.id === id || envio._clave === id || envio.cedula === id) {
        encontrado = envio;
      }
    });

    state.estudianteSeleccionado = encontrado;
    emitir('estudiante');

    return encontrado ? utils.clonar(encontrado) : null;
  }

  function setEstudianteSeleccionado(envio) {
    state.estudianteSeleccionado = envio || null;
    emitir('estudiante');
  }

  function obtenerEstudianteSeleccionado() {
    return state.estudianteSeleccionado
      ? obtenerUtils().clonar(state.estudianteSeleccionado)
      : null;
  }

  function actualizarEnvioLocal(id, cambios) {
    var utils = obtenerUtils();
    var actualizado = null;

    id = utils.limpiarTexto(id);
    cambios = cambios || {};

    state.envios = state.envios.map(function (envio) {
      var copia;

      if (!envio) {
        return envio;
      }

      if (envio.id !== id && envio._clave !== id && envio.cedula !== id) {
        return envio;
      }

      copia = Object.assign({}, envio, cambios);
      actualizado = copia;
      return copia;
    });

    if (state.estudianteSeleccionado) {
      if (
        state.estudianteSeleccionado.id === id ||
        state.estudianteSeleccionado._clave === id ||
        state.estudianteSeleccionado.cedula === id
      ) {
        state.estudianteSeleccionado = actualizado;
      }
    }

    recalcularFiltros();
    emitir('envio-actualizado');

    return actualizado ? utils.clonar(actualizado) : null;
  }

  function quitarEnvioLocal(id) {
    var utils = obtenerUtils();

    id = utils.limpiarTexto(id);

    state.envios = state.envios.filter(function (envio) {
      return envio && envio.id !== id && envio._clave !== id && envio.cedula !== id;
    });

    if (
      state.estudianteSeleccionado &&
      (
        state.estudianteSeleccionado.id === id ||
        state.estudianteSeleccionado._clave === id ||
        state.estudianteSeleccionado.cedula === id
      )
    ) {
      state.estudianteSeleccionado = null;
    }

    recalcularFiltros();
    emitir('envio-removido');
  }

  function limpiar() {
    state.cargando = false;
    state.busqueda = '';
    state.envios = [];
    state.registrosFiltrados = [];
    state.estudianteSeleccionado = null;
    state.ultimoError = null;
    state.ultimaCarga = null;

    emitir('limpio');
  }

  function escuchar(callback) {
    if (typeof callback !== 'function') {
      return function () {};
    }

    listeners.push(callback);

    return function () {
      listeners = listeners.filter(function (listener) {
        return listener !== callback;
      });
    };
  }

  function emitir(tipo) {
    var snapshot = obtenerUtils() ? obtenerEstado() : state;

    listeners.forEach(function (listener) {
      try {
        listener(tipo, snapshot);
      } catch (errorListener) {
        if (window.console && typeof window.console.warn === 'function') {
          window.console.warn('[Coordinador State] Error en listener:', errorListener);
        }
      }
    });
  }

  window.CoordinadorMVPState = Object.freeze({
    iniciar: iniciar,
    obtenerEstado: obtenerEstado,
    estaCargando: estaCargando,
    setCargando: setCargando,
    setError: setError,
    limpiarError: limpiarError,
    setCoordinadores: setCoordinadores,
    obtenerCoordinadores: obtenerCoordinadores,
    setCoordinadorActual: setCoordinadorActual,
    obtenerCoordinadorActual: obtenerCoordinadorActual,
    setEnvios: setEnvios,
    obtenerEnvios: obtenerEnvios,
    setVistaActual: setVistaActual,
    obtenerVistaActual: obtenerVistaActual,
    setBusqueda: setBusqueda,
    obtenerBusqueda: obtenerBusqueda,
    obtenerRegistrosFiltrados: obtenerRegistrosFiltrados,
    obtenerTotalFiltrado: obtenerTotalFiltrado,
    recalcularFiltros: recalcularFiltros,
    seleccionarEstudiante: seleccionarEstudiante,
    setEstudianteSeleccionado: setEstudianteSeleccionado,
    obtenerEstudianteSeleccionado: obtenerEstudianteSeleccionado,
    actualizarEnvioLocal: actualizarEnvioLocal,
    quitarEnvioLocal: quitarEnvioLocal,
    limpiar: limpiar,
    escuchar: escuchar
  });
})(window);