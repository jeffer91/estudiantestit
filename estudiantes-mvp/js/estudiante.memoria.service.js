/*
  Archivo: estudiante.memoria.service.js
  Ruta: estudiantes-mvp/js/estudiante.memoria.service.js
  Funciones principales:
  - Guardar el avance del estudiante en la memoria del navegador.
  - Recuperar el avance cuando el estudiante vuelve a abrir la pantalla.
  - Borrar el avance cuando se envía correctamente o cuando se inicia un nuevo registro.
  - Evitar consultas innecesarias a Firebase si ya existe un estudiante guardado en memoria.
  - Mostrar y controlar el popup de recuperación de avance.
*/
(function (window, document) {
  'use strict';

  var STORAGE_KEY = 'estudiantes_mvp_avance_v1';
  var STORAGE_VERSION = '1.0.0';
  var debounceTimer = null;
  var debounceMs = 350;

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function ahoraIso() {
    var utils = obtenerUtils();

    if (utils && typeof utils.fechaIso === 'function') {
      return utils.fechaIso();
    }

    return new Date().toISOString();
  }

  function clonar(data) {
    var utils = obtenerUtils();

    if (utils && typeof utils.clonar === 'function') {
      return utils.clonar(data);
    }

    return JSON.parse(JSON.stringify(data || null));
  }

  function localStorageDisponible() {
    try {
      if (!window.localStorage) {
        return false;
      }

      var pruebaKey = STORAGE_KEY + '_test';
      window.localStorage.setItem(pruebaKey, '1');
      window.localStorage.removeItem(pruebaKey);
      return true;
    } catch (error) {
      console.warn('[Estudiantes MVP] localStorage no disponible:', error);
      return false;
    }
  }

  function limpiarValor(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function normalizarNumero(valor, fallback) {
    var numero = Number(valor || 0);

    if (!numero || numero < 1) {
      return fallback || 1;
    }

    if (numero > 3) {
      return 3;
    }

    return numero;
  }

  function prepararSnapshot(estado, extras) {
    estado = estado || {};
    extras = extras || {};

    return {
      version: STORAGE_VERSION,
      actualizadoEn: ahoraIso(),
      pasoActual: limpiarValor(extras.pasoActual || estado.pasoActual || 'consulta'),
      propuestaActual: normalizarNumero(extras.propuestaActual || estado.propuestaActual || 1, 1),
      estudiante: estado.estudiante || null,
      telegramUser: limpiarValor(estado.telegramUser || ''),
      propuestas: Array.isArray(estado.propuestas) ? clonar(estado.propuestas) : [],
      tituloPreferidoNumero: Number(estado.tituloPreferidoNumero || 0),
      creadoEnLocal: estado.creadoEnLocal || ahoraIso(),
      enviado: !!estado.enviado,
      ultimoResultadoEnvio: estado.ultimoResultadoEnvio || null
    };
  }

  function guardar(estado, extras) {
    var snapshot;

    if (!localStorageDisponible()) {
      return {
        ok: false,
        mensaje: 'La memoria del navegador no está disponible.'
      };
    }

    try {
      snapshot = prepararSnapshot(estado, extras);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));

      return {
        ok: true,
        mensaje: 'Avance guardado en este navegador.',
        snapshot: snapshot
      };
    } catch (error) {
      console.error('[Estudiantes MVP] No se pudo guardar avance:', error);

      return {
        ok: false,
        mensaje: 'No se pudo guardar el avance.',
        error: error
      };
    }
  }

  function guardarDesdeState(extras) {
    var state = window.EstudianteMVPState;
    var estado;

    if (!state || typeof state.obtenerEstado !== 'function') {
      return {
        ok: false,
        mensaje: 'No existe estado para guardar.'
      };
    }

    estado = state.obtenerEstado();

    if (window.EstudianteMVPPropuestasPaginacion &&
        typeof window.EstudianteMVPPropuestasPaginacion.obtenerActual === 'function') {
      extras = extras || {};
      extras.propuestaActual = window.EstudianteMVPPropuestasPaginacion.obtenerActual();
    }

    return guardar(estado, extras);
  }

  function programarGuardado(extras) {
    window.clearTimeout(debounceTimer);

    debounceTimer = window.setTimeout(function () {
      guardarDesdeState(extras || {});
    }, debounceMs);
  }

  function leer() {
    var crudo;
    var data;

    if (!localStorageDisponible()) {
      return null;
    }

    try {
      crudo = window.localStorage.getItem(STORAGE_KEY);

      if (!crudo) {
        return null;
      }

      data = JSON.parse(crudo);

      if (!data || typeof data !== 'object') {
        return null;
      }

      if (data.enviado) {
        borrar();
        return null;
      }

      return data;
    } catch (error) {
      console.warn('[Estudiantes MVP] No se pudo leer avance guardado:', error);
      return null;
    }
  }

  function existeAvance() {
    return !!leer();
  }

  function borrar() {
    if (!localStorageDisponible()) {
      return false;
    }

    try {
      window.localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (error) {
      console.warn('[Estudiantes MVP] No se pudo borrar avance guardado:', error);
      return false;
    }
  }

  function obtenerCedulaDesdeEstudiante(estudiante) {
    estudiante = estudiante || {};

    return limpiarValor(
      estudiante.cedula ||
      estudiante.numeroIdentificacion ||
      estudiante.identificacion ||
      estudiante.documento ||
      ''
    );
  }

  function obtenerCedulaGuardada(snapshot) {
    snapshot = snapshot || leer();

    if (!snapshot) {
      return '';
    }

    return obtenerCedulaDesdeEstudiante(snapshot.estudiante);
  }

  function cedulaCoincideConMemoria(cedula) {
    var guardada = obtenerCedulaGuardada();
    var actual = limpiarValor(cedula);

    return !!guardada && !!actual && guardada === actual;
  }

  function puedeEvitarConsultaFirebase(cedula) {
    var snapshot = leer();

    if (!snapshot || !snapshot.estudiante) {
      return false;
    }

    return cedulaCoincideConMemoria(cedula);
  }

  function mostrarPopup() {
    var popup = document.getElementById('memoriaPopup');

    if (!popup) {
      return false;
    }

    popup.hidden = false;
    popup.classList.add('is-visible');

    var botonContinuar = document.getElementById('btnMemoriaContinuar');
    if (botonContinuar && typeof botonContinuar.focus === 'function') {
      botonContinuar.focus();
    }

    return true;
  }

  function ocultarPopup() {
    var popup = document.getElementById('memoriaPopup');

    if (!popup) {
      return false;
    }

    popup.hidden = true;
    popup.classList.remove('is-visible');

    return true;
  }

  function mostrarPopupSiHayAvance() {
    if (!existeAvance()) {
      return false;
    }

    return mostrarPopup();
  }

  function aplicarAvanceEnState(snapshot) {
    var state = window.EstudianteMVPState;

    snapshot = snapshot || leer();

    if (!snapshot || !state) {
      return {
        ok: false,
        mensaje: 'No existe avance para aplicar.'
      };
    }

    if (typeof state.cargarEstado === 'function') {
      state.cargarEstado(snapshot);
      return {
        ok: true,
        mensaje: 'Avance restaurado.',
        snapshot: snapshot
      };
    }

    if (typeof state.reiniciarTodo === 'function') {
      state.reiniciarTodo();
    }

    if (snapshot.estudiante && typeof state.setEstudiante === 'function') {
      state.setEstudiante(snapshot.estudiante);
    }

    if (snapshot.telegramUser && typeof state.setTelegram === 'function') {
      state.setTelegram(snapshot.telegramUser);
    }

    if (Array.isArray(snapshot.propuestas) && typeof state.setPropuestas === 'function') {
      state.setPropuestas(snapshot.propuestas);
    }

    if (typeof state.setTituloPreferidoNumero === 'function') {
      state.setTituloPreferidoNumero(snapshot.tituloPreferidoNumero || 0);
    }

    if (typeof state.setPasoActual === 'function') {
      state.setPasoActual(snapshot.pasoActual || 'consulta');
    }

    return {
      ok: true,
      mensaje: 'Avance restaurado con funciones compatibles.',
      snapshot: snapshot
    };
  }

  function escucharCambiosFormulario() {
    document.addEventListener('input', function (evento) {
      if (!evento.target) {
        return;
      }

      if (debeGuardarPorElemento(evento.target)) {
        programarGuardado();
      }
    });

    document.addEventListener('change', function (evento) {
      if (!evento.target) {
        return;
      }

      if (debeGuardarPorElemento(evento.target)) {
        programarGuardado();
      }
    });
  }

  function debeGuardarPorElemento(elemento) {
    if (!elemento || !elemento.id) {
      return false;
    }

    if (elemento.closest && elemento.closest('#memoriaPopup')) {
      return false;
    }

    return [
      'cedulaInput',
      'telegramInput',
      'p1Titulo',
      'p1Tema',
      'p1Contexto',
      'p1Grupo',
      'p1Periodo',
      'p1Problema',
      'p1Objetivo',
      'p2Titulo',
      'p2Tema',
      'p2Contexto',
      'p2Grupo',
      'p2Periodo',
      'p2Problema',
      'p2Objetivo',
      'p3Titulo',
      'p3Tema',
      'p3Contexto',
      'p3Grupo',
      'p3Periodo',
      'p3Problema',
      'p3Objetivo',
      'confirmacionEnvio'
    ].indexOf(elemento.id) !== -1 || elemento.name === 'tituloPreferido';
  }

  window.EstudianteMVPMemoria = Object.freeze({
    guardar: guardar,
    guardarDesdeState: guardarDesdeState,
    programarGuardado: programarGuardado,
    leer: leer,
    existeAvance: existeAvance,
    borrar: borrar,
    obtenerCedulaGuardada: obtenerCedulaGuardada,
    cedulaCoincideConMemoria: cedulaCoincideConMemoria,
    puedeEvitarConsultaFirebase: puedeEvitarConsultaFirebase,
    mostrarPopup: mostrarPopup,
    ocultarPopup: ocultarPopup,
    mostrarPopupSiHayAvance: mostrarPopupSiHayAvance,
    aplicarAvanceEnState: aplicarAvanceEnState,
    escucharCambiosFormulario: escucharCambiosFormulario
  });
})(window, document);