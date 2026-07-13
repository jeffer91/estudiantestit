/*
  Archivo: coordinador.utils.js
  Ruta: coordinadores-mvp/js/coordinador.utils.js

  Funciones principales:
  - Centralizar utilidades generales de coordinadores-mvp.
  - Limpiar textos, cédulas, estados y carreras.
  - Leer campos aunque las columnas de Google Sheets tengan nombres distintos.
  - Manejar DOM de forma segura.
  - Crear respuestas estándar y mensajes de error.
  - Mantener compatibilidad con Live Server, doble clic HTML y Electron.
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
      .replace(/[^\dA-Za-z-]/g, '')
      .trim();
  }

  function limpiarTitulo(valor) {
    return limpiarTextoMultilinea(valor)
      .replace(/^["“”'«»]+|["“”'«»]+$/g, '')
      .replace(/^\s*[-*•]\s*/g, '')
      .replace(/^\s*\d+[).:-]\s*/g, '')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/[.;,\s]+$/g, '')
      .trim();
  }

  function normalizarClave(valor) {
    return limpiarTexto(valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_ -]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .trim();
  }

  function normalizarEstado(valor) {
    return limpiarTexto(valor)
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .trim();
  }

  function normalizarCarrera(valor) {
    return limpiarTexto(valor)
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function normalizarCarreras(valor) {
    var texto;
    var partes;

    if (Array.isArray(valor)) {
      return valor
        .map(normalizarCarrera)
        .filter(Boolean);
    }

    texto = limpiarTextoMultilinea(valor);

    if (!texto) {
      return [];
    }

    partes = texto.split(/\n|;|\||,/g);

    return partes
      .map(normalizarCarrera)
      .filter(Boolean);
  }

  function carrerasComoTexto(carreras) {
    carreras = normalizarCarreras(carreras);

    if (!carreras.length) {
      return '-';
    }

    return carreras.join(', ');
  }

  function carreraPermitida(carreraEstudiante, carrerasCoordinador) {
    var carrera = normalizarCarrera(carreraEstudiante);
    var carreras = normalizarCarreras(carrerasCoordinador);
    var i;

    if (!carrera) {
      return false;
    }

    if (!carreras.length) {
      return true;
    }

    for (i = 0; i < carreras.length; i += 1) {
      if (carrera === carreras[i]) {
        return true;
      }

      if (carrera.indexOf(carreras[i]) !== -1 || carreras[i].indexOf(carrera) !== -1) {
        return true;
      }
    }

    return false;
  }

  function parseBoolean(valor, fallback) {
    var texto = limpiarTexto(valor).toLowerCase();

    if (valor === true) return true;
    if (valor === false) return false;

    if (!texto && typeof fallback === 'boolean') {
      return fallback;
    }

    if (['true', '1', 'si', 'sí', 'activo', 'activa', 'x', 'ok'].indexOf(texto) !== -1) {
      return true;
    }

    if (['false', '0', 'no', 'inactivo', 'inactiva'].indexOf(texto) !== -1) {
      return false;
    }

    return typeof fallback === 'boolean' ? fallback : false;
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

  function escaparHtml(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function contieneTexto(base, busqueda) {
    base = limpiarTexto(base).toLowerCase();
    busqueda = limpiarTexto(busqueda).toLowerCase();

    if (!busqueda) {
      return true;
    }

    return base.indexOf(busqueda) !== -1;
  }

  function obtenerCampo(objeto, aliases, fallback) {
    var i;
    var clave;

    objeto = objeto || {};
    aliases = Array.isArray(aliases) ? aliases : [aliases];

    for (i = 0; i < aliases.length; i += 1) {
      clave = aliases[i];

      if (Object.prototype.hasOwnProperty.call(objeto, clave)) {
        return objeto[clave];
      }
    }

    return fallback;
  }

  function obtenerCampoFlexible(objeto, aliases, fallback) {
    var mapa = {};
    var claves;
    var i;
    var claveOriginal;
    var claveNormalizada;
    var aliasNormalizado;

    objeto = objeto || {};
    aliases = Array.isArray(aliases) ? aliases : [aliases];
    claves = Object.keys(objeto);

    for (i = 0; i < claves.length; i += 1) {
      claveOriginal = claves[i];
      claveNormalizada = normalizarClave(claveOriginal);
      mapa[claveNormalizada] = claveOriginal;
    }

    for (i = 0; i < aliases.length; i += 1) {
      aliasNormalizado = normalizarClave(aliases[i]);

      if (Object.prototype.hasOwnProperty.call(mapa, aliasNormalizado)) {
        return objeto[mapa[aliasNormalizado]];
      }
    }

    return fallback;
  }

  function construirClaveEnvio(envio) {
    envio = envio || {};

    return [
      limpiarTexto(envio.periodo || envio.periodoLabel || 'sin_periodo'),
      limpiarCedula(envio.cedula || 'sin_cedula')
    ].join('__');
  }

  function ok(data, mensaje) {
    return {
      ok: true,
      data: data,
      mensaje: mensaje || '',
      error: null
    };
  }

  function error(mensaje, detalle) {
    return {
      ok: false,
      data: null,
      mensaje: mensaje || 'No se pudo completar la acción.',
      error: detalle || null
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
    var clases = ['is-info', 'is-success', 'is-warning', 'is-error'];

    if (!elemento) {
      return false;
    }

    elemento.textContent = mensaje || '';

    clases.forEach(function (clase) {
      elemento.classList.remove(clase);
    });

    if (tipo) {
      elemento.classList.add('is-' + tipo);
    }

    return true;
  }

  function guardarLocal(clave, data) {
    try {
      window.localStorage.setItem(clave, JSON.stringify(data));
      return true;
    } catch (errorGuardar) {
      return false;
    }
  }

  function leerLocal(clave, fallback) {
    var texto;

    try {
      texto = window.localStorage.getItem(clave);

      if (!texto) {
        return fallback;
      }

      return JSON.parse(texto);
    } catch (errorLeer) {
      return fallback;
    }
  }

  function borrarLocal(clave) {
    try {
      window.localStorage.removeItem(clave);
      return true;
    } catch (errorBorrar) {
      return false;
    }
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

  window.CoordinadorMVPUtils = Object.freeze({
    limpiarTexto: limpiarTexto,
    limpiarTextoMultilinea: limpiarTextoMultilinea,
    limpiarCedula: limpiarCedula,
    limpiarTitulo: limpiarTitulo,
    normalizarClave: normalizarClave,
    normalizarEstado: normalizarEstado,
    normalizarCarrera: normalizarCarrera,
    normalizarCarreras: normalizarCarreras,
    carrerasComoTexto: carrerasComoTexto,
    carreraPermitida: carreraPermitida,
    parseBoolean: parseBoolean,
    fechaIso: fechaIso,
    fechaLegible: fechaLegible,
    clonar: clonar,
    escaparHtml: escaparHtml,
    contieneTexto: contieneTexto,
    obtenerCampo: obtenerCampo,
    obtenerCampoFlexible: obtenerCampoFlexible,
    construirClaveEnvio: construirClaveEnvio,
    ok: ok,
    error: error,
    obtenerMensajeError: obtenerMensajeError,
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
    guardarLocal: guardarLocal,
    leerLocal: leerLocal,
    borrarLocal: borrarLocal,
    log: log,
    warn: warn,
    errorConsola: errorConsola
  });
})(window, document);