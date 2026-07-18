/*
  Archivo: app.utils.js
  Ruta: estudiantes-mvp/js/app.utils.js
  Funciones principales:
  - Centralizar utilidades generales del MVP.
  - Limpiar y normalizar cédulas ecuatorianas de 9 o 10 dígitos.
  - Reconocer temporalmente registros antiguos que perdieron el cero inicial.
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

  function obtenerDigitos(valor) {
    return String(valor == null ? '' : valor)
      .replace(/[^\d]/g, '')
      .trim();
  }

  function limpiarCedula(valor) {
    var cedula = obtenerDigitos(valor);

    if (cedula.length === 9) {
      return '0' + cedula;
    }

    if (cedula.length === 10) {
      return cedula;
    }

    return '';
  }

  function obtenerVariantesCedula(valor) {
    var cedula = limpiarCedula(valor);
    var variantes = [];

    if (!cedula) {
      return variantes;
    }

    variantes.push(cedula);

    if (cedula.charAt(0) === '0') {
      variantes.push(cedula.slice(1));
    }

    return variantes.filter(function (item, index, lista) {
      return item && lista.indexOf(item) === index;
    });
  }

  function validarCedulaBasica(valor) {
    var digitos = obtenerDigitos(valor);
    var cedula = limpiarCedula(valor);

    if (!digitos) {
      return error('Ingresa tu número de cédula.', '#cedulaInput');
    }

    if (!cedula) {
      return error(
        'La cédula debe tener 10 números. También se acepta el registro antiguo de 9 números cuando se perdió el cero inicial.',
        '#cedulaInput'
      );
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

  function copiarApi(base) {
    var copia = {};

    Object.keys(base || {}).forEach(function (clave) {
      copia[clave] = base[clave];
    });

    return copia;
  }

  function esCampoCedula(campo) {
    return [
      'cedula',
      'numeroidentificacion',
      'identificacion',
      'documento'
    ].indexOf(normalizarClave(campo).replace(/_/g, '')) !== -1;
  }

  function variantesConsultaFirebase(valor) {
    var variantes = obtenerVariantesCedula(valor);
    var completas = variantes.slice();

    variantes.forEach(function (item) {
      var numerica = Number(item);

      if (Number.isSafeInteger(numerica)) {
        completas.push(numerica);
      }
    });

    return completas.filter(function (item, index, lista) {
      return lista.findIndex(function (otro) {
        return typeof otro === typeof item && otro === item;
      }) === index;
    });
  }

  function instalarCompatibilidadFirebase() {
    var base = window.EstudianteMVPFirebaseCore;
    var extendido;
    var leerOriginal;
    var consultarOriginal;

    if (!base || base.__cedulaCompatibilidad === true) {
      return;
    }

    leerOriginal = base.leerDocumento;
    consultarOriginal = base.consultarPorCampo;

    if (
      typeof leerOriginal !== 'function' ||
      typeof consultarOriginal !== 'function'
    ) {
      return;
    }

    extendido = copiarApi(base);

    extendido.leerDocumento = function (coleccion, documentoId) {
      var variantes = obtenerVariantesCedula(documentoId);
      var indice = 0;

      if (variantes.length < 2) {
        return leerOriginal.call(base, coleccion, documentoId);
      }

      function intentar() {
        if (indice >= variantes.length) {
          return Promise.resolve(null);
        }

        return leerOriginal.call(base, coleccion, variantes[indice++])
          .then(function (resultado) {
            return resultado || intentar();
          });
      }

      return intentar();
    };

    extendido.consultarPorCampo = function (
      coleccion,
      campo,
      operador,
      valor,
      limite
    ) {
      var variantes;
      var resultados = [];
      var vistos = {};
      var indice = 0;
      var maximo = Number(limite || 20);

      if ((operador || '==') !== '==' || !esCampoCedula(campo)) {
        return consultarOriginal.call(
          base,
          coleccion,
          campo,
          operador,
          valor,
          limite
        );
      }

      variantes = variantesConsultaFirebase(valor);

      if (!variantes.length) {
        return consultarOriginal.call(
          base,
          coleccion,
          campo,
          operador,
          valor,
          limite
        );
      }

      function consultarSiguiente() {
        if (indice >= variantes.length || resultados.length >= maximo) {
          return Promise.resolve(resultados.slice(0, maximo));
        }

        return consultarOriginal.call(
          base,
          coleccion,
          campo,
          '==',
          variantes[indice++],
          maximo
        ).then(function (lista) {
          (Array.isArray(lista) ? lista : []).forEach(function (item) {
            var id = String(
              item && (item._id || item.id) ||
              JSON.stringify(item || {})
            );

            if (!vistos[id]) {
              vistos[id] = true;
              resultados.push(item);
            }
          });

          return consultarSiguiente();
        });
      }

      return consultarSiguiente();
    };

    extendido.__cedulaCompatibilidad = true;
    window.EstudianteMVPFirebaseCore = Object.freeze(extendido);
  }

  function enviarConsultaSheetsAlternativa(endpoint, cedula, variantes) {
    if (!endpoint || !cedula || !window.fetch) {
      return Promise.resolve(null);
    }

    return window.fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        accion: 'CONSULTAR_ENVIO_CEDULA',
        tipo: 'CONSULTAR_ENVIO_CEDULA',
        consultarEnvio: true,
        cedula: cedula,
        numeroIdentificacion: cedula,
        cedulaAlternativa: variantes[0] || '',
        cedulasEquivalentes: variantes,
        fechaCliente: fechaIso()
      })
    }).then(function (respuesta) {
      return respuesta.text().then(function (texto) {
        var data;

        try {
          data = JSON.parse(texto || '{}');
        } catch (errorJson) {
          data = null;
        }

        if (!respuesta.ok || !data) {
          return null;
        }

        return {
          ok: data.ok !== false,
          encontrado: data.encontrado === true,
          cedula: data.cedula || cedula,
          envio: data.envio || null,
          mensaje: data.mensaje || ''
        };
      });
    }).catch(function () {
      return null;
    });
  }

  function instalarCompatibilidadSheets() {
    var base = window.EstudianteMVPSheets;
    var extendido;
    var consultarOriginal;

    if (!base || base.__cedulaCompatibilidad === true) {
      return;
    }

    consultarOriginal = base.consultarEnvioPorCedula;

    if (typeof consultarOriginal !== 'function') {
      return;
    }

    extendido = copiarApi(base);

    extendido.consultarEnvioPorCedula = function (valor) {
      var variantes = obtenerVariantesCedula(valor);
      var principal = variantes[0] || '';
      var alternativa = variantes[1] || '';
      var resultadoPrincipal;

      if (!principal) {
        return consultarOriginal.call(base, valor);
      }

      return consultarOriginal.call(base, principal)
        .then(function (resultado) {
          resultadoPrincipal = resultado;

          if (
            resultado &&
            resultado.encontrado === true
          ) {
            return resultado;
          }

          if (!alternativa || typeof base.leerConfiguracion !== 'function') {
            return resultado;
          }

          return base.leerConfiguracion()
            .then(function (configuracion) {
              return enviarConsultaSheetsAlternativa(
                configuracion && configuracion.endpoint,
                alternativa,
                variantes
              );
            })
            .then(function (resultadoAlternativo) {
              return resultadoAlternativo && resultadoAlternativo.encontrado
                ? resultadoAlternativo
                : resultadoPrincipal;
            })
            .catch(function () {
              return resultadoPrincipal;
            });
        });
    };

    extendido.__cedulaCompatibilidad = true;
    window.EstudianteMVPSheets = Object.freeze(extendido);
  }

  function instalarValidacionFormularioCedula() {
    var formulario = document.getElementById('formConsulta');
    var input = document.getElementById('cedulaInput');

    if (!formulario || !input || formulario.getAttribute('data-cedula-normalizada') === 'true') {
      return;
    }

    formulario.setAttribute('data-cedula-normalizada', 'true');
    input.setAttribute('maxlength', '10');
    input.setAttribute('pattern', '[0-9]{9,10}');

    input.addEventListener('input', function () {
      input.value = obtenerDigitos(input.value).slice(0, 10);
    });

    formulario.addEventListener('submit', function (evento) {
      var validacion = validarCedulaBasica(input.value);

      if (!validacion.ok) {
        evento.preventDefault();
        evento.stopImmediatePropagation();
        mostrarEstado('#estadoPrincipal', validacion.mensaje, 'error');
        input.focus();
        return;
      }

      input.value = validacion.data;
    }, true);
  }

  function instalarCompatibilidadCedulas() {
    instalarCompatibilidadFirebase();
    instalarCompatibilidadSheets();
    instalarValidacionFormularioCedula();
  }

  window.EstudianteMVPUtils = Object.freeze({
    limpiarTexto: limpiarTexto,
    limpiarTextoMultilinea: limpiarTextoMultilinea,
    limpiarCedula: limpiarCedula,
    obtenerVariantesCedula: obtenerVariantesCedula,
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

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      instalarCompatibilidadCedulas,
      { once: true }
    );
  } else {
    instalarCompatibilidadCedulas();
  }
})(window, document);
