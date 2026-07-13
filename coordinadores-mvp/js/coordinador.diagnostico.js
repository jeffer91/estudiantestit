/*
  Archivo: coordinador.diagnostico.js
  Ruta: coordinadores-mvp/js/coordinador.diagnostico.js

  Funciones principales:
  - Revisar dependencias internas.
  - Probar conexión con Google Sheets.
  - Mostrar diagnóstico legible para Live Server, doble clic HTML y Electron.
  - Ayudar a detectar endpoint vacío, módulos faltantes o respuestas inválidas.
*/

(function (window) {
  'use strict';

  function obtenerConfig() {
    return window.CoordinadorMVPConfig || null;
  }

  function obtenerUtils() {
    return window.CoordinadorMVPUtils || null;
  }

  function obtenerState() {
    return window.CoordinadorMVPState || null;
  }

  function obtenerSheets() {
    return window.CoordinadorMVPSheets || null;
  }

  function obtenerUI() {
    return window.CoordinadorMVPUI || null;
  }

  function generarDiagnosticoLocal() {
    var config = obtenerConfig();
    var state = obtenerState();
    var endpoint = config ? config.obtenerEndpoint() : '';
    var snapshot = state ? state.obtenerEstado() : {};

    return {
      fecha: new Date().toISOString(),
      modoApertura: detectarModoApertura(),
      navegador: window.navigator ? window.navigator.userAgent : 'No disponible',
      ubicacion: window.location ? window.location.href : 'No disponible',
      app: config ? config.obtener('app') : null,
      endpointConfigurado: !!endpoint,
      endpointVista: endpoint ? ocultarEndpoint(endpoint) : '',
      modulos: {
        config: !!window.CoordinadorMVPConfig,
        utils: !!window.CoordinadorMVPUtils,
        state: !!window.CoordinadorMVPState,
        sheets: !!window.CoordinadorMVPSheets,
        ui: !!window.CoordinadorMVPUI,
        modal: !!window.CoordinadorMVPModal,
        diagnostico: !!window.CoordinadorMVPDiagnostico,
        app: !!window.CoordinadorMVPApp
      },
      estado: {
        vistaActual: snapshot.vistaActual || '',
        coordinadores: Array.isArray(snapshot.coordinadores) ? snapshot.coordinadores.length : 0,
        envios: Array.isArray(snapshot.envios) ? snapshot.envios.length : 0,
        filtrados: Array.isArray(snapshot.registrosFiltrados) ? snapshot.registrosFiltrados.length : 0,
        coordinadorActual: snapshot.coordinadorActual ? snapshot.coordinadorActual.nombre : ''
      },
      recomendaciones: generarRecomendaciones(endpoint)
    };
  }

  function detectarModoApertura() {
    var protocolo = window.location && window.location.protocol
      ? window.location.protocol
      : '';

    if (protocolo === 'file:') {
      return 'Doble clic / archivo local';
    }

    if (protocolo === 'http:' || protocolo === 'https:') {
      if (window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost') {
        return 'Live Server / servidor local';
      }

      return 'Servidor web';
    }

    return protocolo || 'No detectado';
  }

  function ocultarEndpoint(endpoint) {
    if (!endpoint) {
      return '';
    }

    if (endpoint.length <= 38) {
      return endpoint;
    }

    return endpoint.slice(0, 24) + '...' + endpoint.slice(-12);
  }

  function generarRecomendaciones(endpoint) {
    var recomendaciones = [];

    if (!endpoint) {
      recomendaciones.push('Pega el endpoint publicado de Apps Script en coordinador.config.js.');
    }

    if (window.location && window.location.protocol === 'file:') {
      recomendaciones.push('Si falla fetch con doble clic, prueba con Live Server. Algunas políticas del navegador bloquean solicitudes desde file://.');
    }

    if (!window.fetch) {
      recomendaciones.push('Este entorno no tiene fetch disponible. Revisa navegador o configuración de Electron.');
    }

    if (!window.CoordinadorMVPSheets) {
      recomendaciones.push('Falta cargar coordinador.sheets.service.js o está en orden incorrecto.');
    }

    return recomendaciones;
  }

  function probarConexion() {
    var sheets = obtenerSheets();
    var ui = obtenerUI();
    var diagnosticoBase = generarDiagnosticoLocal();

    if (ui) {
      ui.mostrarCargando('Probando conexión con Google Sheets...');
      ui.escribirDiagnostico({
        estado: 'probando',
        diagnosticoLocal: diagnosticoBase
      });
    }

    if (!sheets) {
      if (ui) {
        ui.ocultarCargando();
        ui.escribirDiagnostico({
          ok: false,
          mensaje: 'No está cargado el servicio de Google Sheets.',
          diagnosticoLocal: diagnosticoBase
        });
      }

      return Promise.reject(new Error('No está cargado el servicio de Google Sheets.'));
    }

    return sheets.probarConexion()
      .then(function (respuesta) {
        if (ui) {
          ui.ocultarCargando();
          ui.escribirDiagnostico({
            ok: true,
            mensaje: respuesta.mensaje || 'Conexión correcta.',
            respuesta: respuesta,
            diagnosticoLocal: generarDiagnosticoLocal()
          });
          ui.mostrarEstado('#estadoPrincipal', 'Conexión correcta con Google Sheets.', 'success');
        }

        return respuesta;
      })
      .catch(function (error) {
        if (ui) {
          ui.ocultarCargando();
          ui.escribirDiagnostico({
            ok: false,
            mensaje: obtenerMensajeError(error),
            diagnosticoLocal: generarDiagnosticoLocal()
          });
          ui.mostrarEstado('#estadoPrincipal', obtenerMensajeError(error), 'error');
        }

        throw error;
      });
  }

  function mostrarDiagnosticoLocal() {
    var ui = obtenerUI();

    if (ui) {
      ui.mostrarDiagnostico();
      ui.escribirDiagnostico(generarDiagnosticoLocal());
    }

    return generarDiagnosticoLocal();
  }

  function obtenerMensajeError(error) {
    var utils = obtenerUtils();

    if (utils && utils.obtenerMensajeError) {
      return utils.obtenerMensajeError(error, 'No se pudo completar el diagnóstico.');
    }

    return error && error.message
      ? error.message
      : 'No se pudo completar el diagnóstico.';
  }

  window.CoordinadorMVPDiagnostico = Object.freeze({
    generarDiagnosticoLocal: generarDiagnosticoLocal,
    detectarModoApertura: detectarModoApertura,
    probarConexion: probarConexion,
    mostrarDiagnosticoLocal: mostrarDiagnosticoLocal
  });
})(window);