/*
  Archivo: app.utils.js
  Ruta: estudiantes-mvp/js/app.utils.js
  Funciones principales:
  - Centralizar utilidades generales del MVP.
  - Limpiar textos, cédulas, Telegram y títulos.
  - Leer y escribir elementos del DOM de forma segura.
  - Crear respuestas estándar para evitar errores repetidos.
*/
(function (window, document) {
  'use strict';

  function limpiarTexto(valor) {
    return String(valor == null ? '' : valor)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function limpiarTextoMultilinea(valor) {
    return String(valor == null ? '' : valor)
      .replace(/\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function limpiarCedula(valor) {
    return String(valor == null ? '' : valor)
      .replace(/[^\d]/g, '')
      .trim();
  }

  function validarCedulaBasica(valor) {
    var cedula = limpiarCedula(valor);

    if (!cedula) {
      return error('Ingresa tu número de cédula.', '#cedulaInput');
    }

    if (cedula.length < 6 || cedula.length > 13) {
      return error('La cédula debe tener entre 6 y 13 números.', '#cedulaInput');
    }

    return ok(cedula, 'Cédula válida.');
  }

  function normalizarTelegram(valor) {
    var texto = limpiarTexto(valor);

    texto = texto
      .replace(/^https?:\/\/t\.me\//i, '')
      .replace(/^t\.me\//i, '')
      .replace(/\s+/g, '');

    if (!texto) {
      return '';
    }

    if (texto.charAt(0) !== '@') {
      texto = '@' + texto;
    }

    return texto;
  }

  function validarTelegram(valor) {
    var telegram = normalizarTelegram(valor);
    var username = telegram.replace(/^@/, '');

    if (!username) {
      return error('Ingresa tu usuario de Telegram.', '#telegramInput');
    }

    if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
      return error('Ingresa un usuario de Telegram válido. Debe iniciar con letra y tener entre 5 y 32 caracteres.', '#telegramInput');
    }

    return ok(telegram, 'Telegram válido.');
  }

  function limpiarTitulo(valor) {
    return limpiarTexto(valor)
      .replace(/^["“”'«»]+|["“”'«»]+$/g, '')
      .replace(/^\s*[-*•]\s*/g, '')
      .replace(/^\s*\d+[).:-]\s*/g, '')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/[.;,\s]+$/g, '')
      .trim();
  }

  function construirTituloId(periodoId, cedula) {
    periodoId = limpiarTexto(periodoId) || 'sin_periodo';
    cedula = limpiarCedula(cedula) || 'sin_cedula';

    return periodoId + '__' + cedula;
  }

  function fechaIso() {
    return new Date().toISOString();
  }

  function fechaLegible() {
    return new Date().toLocaleString('es-EC');
  }

  function clonar(objeto) {
    try {
      return JSON.parse(JSON.stringify(objeto || {}));
    } catch (errorClonar) {
      return {};
    }
  }

  function normalizarClave(valor) {
    return limpiarTexto(valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_ -]/g, '')
      .replace(/\s+/g, '_')
      .trim();
  }

  function byId(id) {
    if (!id) {
      return null;
    }

    return document.getElementById(id);
  }

  function query(selector) {
    if (!selector) {
      return null;
    }

    return document.querySelector(selector);
  }

  function queryAll(selector) {
    if (!selector) {
      return [];
    }

    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function valor(selector) {
    var elemento = query(selector);

    if (!elemento) {
      return '';
    }

    if ('value' in elemento) {
      return limpiarTexto(elemento.value);
    }

    return limpiarTexto(elemento.textContent);
  }

  function valorMultilinea(selector) {
    var elemento = query(selector);

    if (!elemento) {
      return '';
    }

    if ('value' in elemento) {
      return limpiarTextoMultilinea(elemento.value);
    }

    return limpiarTextoMultilinea(elemento.textContent);
  }

  function setValor(selector, valorNuevo) {
    var elemento = query(selector);

    if (!elemento) {
      return false;
    }

    if ('value' in elemento) {
      elemento.value = valorNuevo == null ? '' : String(valorNuevo);
    } else {
      elemento.textContent = valorNuevo == null ? '' : String(valorNuevo);
    }

    return true;
  }

  function setTexto(selector, texto) {
    var elemento = query(selector);

    if (!elemento) {
      return false;
    }

    elemento.textContent = texto == null ? '' : String(texto);
    return true;
  }

  function mostrar(selector) {
    var elemento = query(selector);

    if (!elemento) {
      return false;
    }

    elemento.classList.remove('is-hidden');
    elemento.hidden = false;
    return true;
  }

  function ocultar(selector) {
    var elemento = query(selector);

    if (!elemento) {
      return false;
    }

    elemento.classList.add('is-hidden');
    elemento.hidden = true;
    return true;
  }

  function mostrarEstado(selector, mensaje, tipo) {
    var elemento = query(selector);

    if (!elemento) {
      return false;
    }

    elemento.textContent = mensaje || '';
    elemento.classList.remove('is-info', 'is-success', 'is-warning', 'is-error');

    if (tipo) {
      elemento.classList.add('is-' + tipo);
    }

    return true;
  }

  function ok(data, mensaje) {
    return {
      ok: true,
      data: data,
      mensaje: mensaje || '',
      selector: ''
    };
  }

  function error(mensaje, selector, detalle) {
    return {
      ok: false,
      data: null,
      mensaje: mensaje || 'No se pudo completar la acción.',
      selector: selector || '',
      detalle: detalle || null
    };
  }

  function obtenerMensajeError(errorOriginal, fallback) {
    if (!errorOriginal) {
      return fallback || 'Ocurrió un error inesperado.';
    }

    if (errorOriginal.mensaje) {
      return limpiarTexto(errorOriginal.mensaje);
    }

    if (errorOriginal.message) {
      return limpiarTexto(errorOriginal.message);
    }

    return limpiarTexto(String(errorOriginal)) || fallback || 'Ocurrió un error inesperado.';
  }

  function log() {
    if (window.console && typeof window.console.log === 'function') {
      window.console.log.apply(window.console, arguments);
    }
  }

  function warn() {
    if (window.console && typeof window.console.warn === 'function') {
      window.console.warn.apply(window.console, arguments);
    }
  }

  function errorConsola() {
    if (window.console && typeof window.console.error === 'function') {
      window.console.error.apply(window.console, arguments);
    }
  }

  window.EstudianteMVPUtils = Object.freeze({
    limpiarTexto: limpiarTexto,
    limpiarTextoMultilinea: limpiarTextoMultilinea,
    limpiarCedula: limpiarCedula,
    validarCedulaBasica: validarCedulaBasica,
    normalizarTelegram: normalizarTelegram,
    validarTelegram: validarTelegram,
    limpiarTitulo: limpiarTitulo,
    construirTituloId: construirTituloId,
    fechaIso: fechaIso,
    fechaLegible: fechaLegible,
    clonar: clonar,
    normalizarClave: normalizarClave,
    byId: byId,
    query: query,
    queryAll: queryAll,
    valor: valor,
    valorMultilinea: valorMultilinea,
    setValor: setValor,
    setTexto: setTexto,
    mostrar: mostrar,
    ocultar: ocultar,
    mostrarEstado: mostrarEstado,
    ok: ok,
    error: error,
    obtenerMensajeError: obtenerMensajeError,
    log: log,
    warn: warn,
    errorConsola: errorConsola
  });
})(window, document);
