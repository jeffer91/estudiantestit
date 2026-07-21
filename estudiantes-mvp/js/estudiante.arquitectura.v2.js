/* Arquitectura v3: índices de Google Sheets para identidad y proceso. */
(function (window, document) {
  'use strict';

  if (window.__ESTUDIANTE_ARQUITECTURA_INDICES__) return;
  window.__ESTUDIANTE_ARQUITECTURA_INDICES__ = true;

  function mensajeError(error, fallback) {
    return error && error.message ? error.message : fallback;
  }

  function manejarEnvio(evento) {
    var form = evento.target;
    var state;
    var ui;
    var sheets;
    var memoria;
    var acepto;
    var validacionPropuestas;
    var validacionFavorito;
    var payload;

    if (!form || form.id !== 'formEnvio') return;

    evento.preventDefault();
    evento.stopImmediatePropagation();

    state = window.EstudianteMVPState;
    ui = window.EstudianteMVPUI;
    sheets = window.EstudianteMVPSheets;
    memoria = window.EstudianteMVPMemoria;
    acepto = document.getElementById('confirmacionEnvio');

    if (!state || !ui || !sheets) return;

    validacionPropuestas = state.validarPropuestas();
    validacionFavorito = state.validarFavorito();

    if (!validacionPropuestas.ok) {
      ui.mostrarEstado('#estadoEnvioFinal', validacionPropuestas.mensaje, 'error');
      ui.mostrarPaso('propuestas');
      return;
    }
    if (!validacionFavorito.ok) {
      ui.mostrarEstado('#estadoEnvioFinal', validacionFavorito.mensaje, 'error');
      ui.mostrarPaso('resumen');
      return;
    }
    if (!acepto || !acepto.checked) {
      ui.mostrarEstado(
        '#estadoEnvioFinal',
        'Confirma que deseas enviar tus propuestas.',
        'error'
      );
      return;
    }

    payload = state.construirPayloadEnvio();
    ui.setCargando(true, 'Enviando registro...');
    ui.mostrarEstado('#estadoEnvioFinal', 'Enviando registro...', 'info');

    sheets.enviarEnvio(payload)
      .then(function (resultado) {
        var final = {
          ok: true,
          estado: 'PENDIENTE_REVISION',
          sheets: resultado,
          mensaje: 'Tu registro fue enviado correctamente.'
        };

        state.marcarEnviado(final);
        if (memoria && memoria.borrar) memoria.borrar();
        ui.pintarResultadoEnvio(final);
        ui.mostrarPaso('enviar');
      })
      .catch(function (error) {
        ui.mostrarEstado(
          '#estadoEnvioFinal',
          mensajeError(
            error,
            'No se pudo completar el envío. Revisa tu conexión e intenta nuevamente.'
          ),
          'error'
        );
      })
      .then(function () {
        ui.setCargando(false);
      });
  }

  function limpiarTextos() {
    var paragraph = document.querySelector(
      '[data-step-panel="consulta"] .section-heading p:last-child'
    );
    if (paragraph) {
      paragraph.textContent =
        'Ingresa solo tu número de cédula para consultar tus datos académicos.';
    }
  }

  document.addEventListener('submit', manejarEnvio, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', limpiarTextos, { once: true });
  } else {
    limpiarTextos();
  }

  window.EstudianteMVPArquitecturaV2 = Object.freeze({
    version: '3.0.0',
    fuenteProceso: 'google-sheets',
    fuenteIdentidad: 'indice-estudiantes',
    consultaAcceso: 'CONSULTAR_ACCESO_ESTUDIANTE'
  });
})(window, document);
