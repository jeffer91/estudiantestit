/*
  Puente visual para la consulta académica.
  No duplica la consulta: únicamente abre y cierra el modal según el estado real de la pantalla.
*/
(function (window, document) {
  'use strict';

  if (window.__ESTUDIANTE_CONSULTA_PROGRESO_BRIDGE__) return;
  window.__ESTUDIANTE_CONSULTA_PROGRESO_BRIDGE__ = true;

  var instalado = false;
  var consultaEnCurso = false;
  var cerrando = false;
  var observador = null;
  var intentos = 0;

  function texto(valor) {
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function cedulaValida(valor) {
    var cedula = texto(valor).replace(/\D/g, '');
    if (cedula.length === 9) cedula = '0' + cedula;
    return cedula.length === 10;
  }

  function obtenerModal() {
    return window.EstudianteMVPConsultaProgreso || null;
  }

  function panelVisible(selector) {
    var elemento = document.querySelector(selector);
    if (!elemento) return false;
    return elemento.hidden !== true &&
      elemento.getAttribute('aria-hidden') !== 'true' &&
      window.getComputedStyle(elemento).display !== 'none';
  }

  function consultaFinalizoCorrectamente() {
    return panelVisible('[data-step-panel="datos"]') ||
      panelVisible('#revisionTitulosPanel');
  }

  function mensajeErrorActual() {
    var estado = document.getElementById('estadoPrincipal');
    if (!estado) return '';

    if (
      estado.classList.contains('is-error') ||
      estado.classList.contains('error')
    ) {
      return texto(estado.textContent);
    }

    return '';
  }

  function cerrarConExito() {
    var modal = obtenerModal();

    if (!consultaEnCurso || cerrando || !modal) return;
    cerrando = true;

    if (typeof modal.cerrar === 'function') {
      modal.cerrar().then(function () {
        consultaEnCurso = false;
        cerrando = false;
      });
    } else {
      consultaEnCurso = false;
      cerrando = false;
    }
  }

  function mostrarError(mensaje) {
    var modal = obtenerModal();
    var input = document.getElementById('cedulaInput');

    if (!consultaEnCurso || !mensaje || !modal) return;
    consultaEnCurso = false;
    cerrando = false;

    if (typeof modal.mostrarError === 'function') {
      modal.mostrarError(mensaje, function () {
        if (input) input.focus();
      });
    }
  }

  function revisarResultado() {
    var error;

    if (!consultaEnCurso) return;

    if (consultaFinalizoCorrectamente()) {
      cerrarConExito();
      return;
    }

    error = mensajeErrorActual();
    if (error) mostrarError(error);
  }

  function iniciarModal(evento) {
    var input = document.getElementById('cedulaInput');
    var modal = obtenerModal();

    if (!input || !cedulaValida(input.value) || !modal) return;
    if (consultaEnCurso) return;

    consultaEnCurso = true;
    cerrando = false;

    if (typeof modal.abrir === 'function') {
      modal.abrir({ cedula: input.value });
    }

    window.setTimeout(revisarResultado, 0);
  }

  function instalarObservador() {
    if (observador) return;

    observador = new MutationObserver(function () {
      revisarResultado();
    });

    observador.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'aria-hidden']
    });
  }

  function instalar() {
    var form = document.getElementById('formConsulta');
    var modal = obtenerModal();

    if (instalado) return;

    if (!form || !modal) {
      intentos += 1;
      if (intentos <= 150) window.setTimeout(instalar, 100);
      return;
    }

    instalado = true;
    form.addEventListener('submit', iniciarModal, true);
    instalarObservador();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }
})(window, document);
