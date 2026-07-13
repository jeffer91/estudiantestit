/*
  Archivo: estudiante.propuestas.paginacion.js
  Ruta: estudiantes-mvp/js/estudiante.propuestas.paginacion.js
  Funciones principales:
  - Mostrar una propuesta a la vez dentro del Paso 4.
  - Permitir navegación interna: Propuesta 1, Propuesta 2 y Propuesta 3.
  - Validar la propuesta actual antes de avanzar.
  - Mantener indicador visual simple: Propuesta X de 3.
  - Avisar a la memoria del navegador cuando cambia la propuesta actual.
*/
(function (window, document) {
  'use strict';

  var TOTAL_PROPUESTAS = 3;
  var propuestaActual = 1;
  var opciones = {
    alCambiar: null,
    alGuardarPropuesta: null,
    alValidarPropuesta: null,
    alVerResumen: null,
    alGuardarAvance: null
  };

  function iniciar(configuracion) {
    opciones = mezclarOpciones(opciones, configuracion || {});
    mostrar(opciones.propuestaInicial || propuestaActual || 1, { sinScroll: true });
    return obtenerActual();
  }

  function mezclarOpciones(base, extra) {
    var salida = {};
    var clave;

    for (clave in base) {
      if (Object.prototype.hasOwnProperty.call(base, clave)) {
        salida[clave] = base[clave];
      }
    }

    for (clave in extra) {
      if (Object.prototype.hasOwnProperty.call(extra, clave)) {
        salida[clave] = extra[clave];
      }
    }

    return salida;
  }

  function obtenerUI() {
    return window.EstudianteMVPUI || null;
  }

  function obtenerMemoria() {
    return window.EstudianteMVPMemoria || null;
  }

  function obtenerActual() {
    return propuestaActual;
  }

  function normalizarNumero(numero) {
    numero = Number(numero || 1);

    if (numero < 1) {
      return 1;
    }

    if (numero > TOTAL_PROPUESTAS) {
      return TOTAL_PROPUESTAS;
    }

    return numero;
  }

  function mostrar(numero, config) {
    var paneles = document.querySelectorAll('[data-propuesta-panel]');
    var dots = document.querySelectorAll('[data-propuesta-dot]');
    var texto = document.getElementById('propuestaIndiceTexto');

    config = config || {};
    propuestaActual = normalizarNumero(numero);

    Array.prototype.forEach.call(paneles, function (panel) {
      var numeroPanel = Number(panel.getAttribute('data-propuesta-panel') || 0);
      var activo = numeroPanel === propuestaActual;

      panel.hidden = !activo;
      panel.classList.toggle('is-active', activo);
    });

    Array.prototype.forEach.call(dots, function (dot) {
      var numeroDot = Number(dot.getAttribute('data-propuesta-dot') || 0);
      dot.classList.toggle('is-active', numeroDot === propuestaActual);
    });

    if (texto) {
      texto.textContent = 'Propuesta ' + propuestaActual + ' de ' + TOTAL_PROPUESTAS;
    }

    limpiarEstadoPropuestas();

    if (typeof opciones.alCambiar === 'function') {
      opciones.alCambiar(propuestaActual);
    }

    guardarAvance();

    if (!config.sinScroll) {
      scrollAPropuestas();
    }

    enfocarPrimerCampo();

    return propuestaActual;
  }

  function anterior() {
    guardarPropuestaActual();
    return mostrar(propuestaActual - 1);
  }

  function siguiente() {
    var validacion;

    guardarPropuestaActual();
    validacion = validarPropuestaActual();

    if (!validacion.ok) {
      mostrarError(validacion.mensaje);
      enfocarSelector(validacion.selector);
      return false;
    }

    return mostrar(propuestaActual + 1);
  }

  function verResumen() {
    var validacion;

    guardarPropuestaActual();
    validacion = validarPropuestaActual();

    if (!validacion.ok) {
      mostrarError(validacion.mensaje);
      enfocarSelector(validacion.selector);
      return false;
    }

    guardarAvance();

    if (typeof opciones.alVerResumen === 'function') {
      opciones.alVerResumen();
    }

    return true;
  }

  function guardarPropuestaActual() {
    if (typeof opciones.alGuardarPropuesta === 'function') {
      opciones.alGuardarPropuesta(propuestaActual);
    }

    guardarAvance();
  }

  function validarPropuestaActual() {
    if (typeof opciones.alValidarPropuesta === 'function') {
      return normalizarValidacion(opciones.alValidarPropuesta(propuestaActual));
    }

    return validarCamposObligatorios(propuestaActual);
  }

  function validarCamposObligatorios(numero) {
    var campos = [
      {
        selector: '#p' + numero + 'Titulo',
        mensaje: 'Completa el título de la propuesta ' + numero + '.'
      },
      {
        selector: '#p' + numero + 'Tema',
        mensaje: 'Completa el tema general de la propuesta ' + numero + '.'
      },
      {
        selector: '#p' + numero + 'Contexto',
        mensaje: 'Completa el lugar o contexto de la propuesta ' + numero + '.'
      },
      {
        selector: '#p' + numero + 'Grupo',
        mensaje: 'Completa el grupo de estudio de la propuesta ' + numero + '.'
      },
      {
        selector: '#p' + numero + 'Periodo',
        mensaje: 'Completa el año o período de la propuesta ' + numero + '.'
      },
      {
        selector: '#p' + numero + 'Problema',
        mensaje: 'Completa el problema o necesidad de la propuesta ' + numero + '.'
      },
      {
        selector: '#p' + numero + 'Objetivo',
        mensaje: 'Completa el objetivo de la propuesta ' + numero + '.'
      }
    ];

    var faltante = campos.find(function (campo) {
      return !valor(campo.selector);
    });

    if (faltante) {
      return {
        ok: false,
        mensaje: faltante.mensaje,
        selector: faltante.selector
      };
    }

    return {
      ok: true,
      mensaje: 'Propuesta ' + numero + ' completa.'
    };
  }

  function normalizarValidacion(resultado) {
    if (!resultado || typeof resultado !== 'object') {
      return {
        ok: false,
        mensaje: 'No se pudo validar la propuesta actual.'
      };
    }

    return {
      ok: !!resultado.ok,
      mensaje: resultado.mensaje || (resultado.ok ? 'Propuesta completa.' : 'Completa la propuesta actual.'),
      selector: resultado.selector || ''
    };
  }

  function valor(selector) {
    var elemento = document.querySelector(selector);

    if (!elemento) {
      return '';
    }

    return String(elemento.value || '').trim();
  }

  function mostrarError(mensaje) {
    var ui = obtenerUI();

    if (ui && typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado('#estadoPropuestas', mensaje || 'Completa la propuesta actual.', 'error');
      return;
    }

    var estado = document.getElementById('estadoPropuestas');
    if (estado) {
      estado.textContent = mensaje || 'Completa la propuesta actual.';
      estado.className = 'status-message is-error';
    }
  }

  function limpiarEstadoPropuestas() {
    var ui = obtenerUI();

    if (ui && typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado('#estadoPropuestas', '', '');
      return;
    }

    var estado = document.getElementById('estadoPropuestas');
    if (estado) {
      estado.textContent = '';
      estado.className = 'status-message';
    }
  }

  function enfocarSelector(selector) {
    var elemento;

    if (!selector) {
      return;
    }

    elemento = document.querySelector(selector);

    if (elemento && typeof elemento.focus === 'function') {
      elemento.focus();
    }
  }

  function enfocarPrimerCampo() {
    var panel = document.querySelector('[data-propuesta-panel="' + propuestaActual + '"]');
    var campo;

    if (!panel) {
      return;
    }

    campo = panel.querySelector('input, textarea, select');

    if (campo && typeof campo.focus === 'function') {
      window.setTimeout(function () {
        campo.focus();
      }, 80);
    }
  }

  function scrollAPropuestas() {
    var panel = document.querySelector('[data-step-panel="propuestas"]');

    if (panel && typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function guardarAvance() {
    var memoria = obtenerMemoria();

    if (typeof opciones.alGuardarAvance === 'function') {
      opciones.alGuardarAvance(propuestaActual);
      return;
    }

    if (memoria && typeof memoria.programarGuardado === 'function') {
      memoria.programarGuardado({
        propuestaActual: propuestaActual,
        pasoActual: 'propuestas'
      });
    }
  }

  function manejarAccion(accion) {
    if (accion === 'propuesta-anterior') {
      return anterior();
    }

    if (accion === 'propuesta-siguiente') {
      return siguiente();
    }

    if (accion === 'propuesta-ver-resumen') {
      return verResumen();
    }

    return false;
  }

  window.EstudianteMVPPropuestasPaginacion = Object.freeze({
    iniciar: iniciar,
    mostrar: mostrar,
    anterior: anterior,
    siguiente: siguiente,
    verResumen: verResumen,
    obtenerActual: obtenerActual,
    guardarPropuestaActual: guardarPropuestaActual,
    validarPropuestaActual: validarPropuestaActual,
    manejarAccion: manejarAccion
  });
})(window, document);