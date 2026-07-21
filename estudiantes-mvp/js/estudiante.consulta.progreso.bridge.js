/*
  Puente visual para la consulta académica.
  Activa el modal de progreso y la revisión de envíos previamente registrados.
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

  function iniciarModal() {
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

  function cargarRevision() {
    var version = '2.3.0';
    var estiloId = 'estudiante-revision-estilo';
    var scriptId = 'estudiante-revision-script';
    var estilo;
    var script;

    if (!document.getElementById(estiloId)) {
      estilo = document.createElement('link');
      estilo.id = estiloId;
      estilo.rel = 'stylesheet';
      estilo.href = 'css/estudiante.consulta.revision.css?v=' + version;
      document.head.appendChild(estilo);
    }

    if (
      window.__ESTUDIANTE_CONSULTA_REVISION_CARGADA__ ||
      document.getElementById(scriptId)
    ) {
      return;
    }

    script = document.createElement('script');
    script.id = scriptId;
    script.src = 'js/estudiante.consulta.revision.js?v=' + version;
    script.async = false;
    script.onerror = function () {
      console.error('[Estudiantes MVP] No se pudo cargar la revisión de envíos previos.');
    };
    document.head.appendChild(script);
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
    cargarRevision();
    form.addEventListener('submit', iniciarModal, true);
    instalarObservador();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }
})(window, document);
