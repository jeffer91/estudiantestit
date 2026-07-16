/*
  Archivo: ia.diagnostico.service.js
  Ruta: estudiantes-mvp/js/ia.diagnostico.service.js
  Funciones principales:
  - Mostrar puntos de colores para cada proveedor IA utilizado.
  - Registrar tiempos y errores sin mostrar datos técnicos sensibles.
  - Detectar si una respuesta fue descartada por la validación de títulos.
  - Mostrar etapa y código de soporte cuando la generación termina con error.
  - Guardar el diagnóstico en la hoja Logs mediante el Apps Script existente.
  - No modificar el envío normal de títulos del estudiante.
*/
(function (window, document) {
  'use strict';

  var servicioOriginal = window.EstudianteMVPIAProviders;
  var ejecucion = null;
  var observadoresInstalados = false;
  var estilosInstalados = false;

  if (!servicioOriginal || typeof servicioOriginal.generarTexto !== 'function') {
    console.warn('[Diagnóstico IA] No se encontró el servicio de proveedores.');
    return;
  }

  function texto(valor) {
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function numero(valor, fallback) {
    var parsed = Number(valor);
    return Number.isFinite(parsed) ? parsed : Number(fallback || 0);
  }

  function instalar() {
    instalarEstilos();
    instalarContenedores();
    instalarObservadores();
  }

  function instalarEstilos() {
    var style;

    if (estilosInstalados || document.getElementById('ia-diagnostico-estilos')) {
      estilosInstalados = true;
      return;
    }

    style = document.createElement('style');
    style.id = 'ia-diagnostico-estilos';
    style.textContent = [
      '.ia-diagnostico{display:flex;flex-direction:column;align-items:center;gap:7px;margin:8px 0 2px;min-height:12px}',
      '.ia-diagnostico[hidden]{display:none!important}',
      '.ia-diagnostico__puntos{display:flex;align-items:center;justify-content:center;gap:7px;min-height:10px}',
      '.ia-diagnostico__punto{width:9px;height:9px;border-radius:999px;background:#cbd5e1;box-shadow:0 0 0 2px rgba(148,163,184,.12);transition:background-color .18s ease,transform .18s ease}',
      '.ia-diagnostico__punto[data-estado="probando"]{background:#eab308;transform:scale(1.18)}',
      '.ia-diagnostico__punto[data-estado="respuesta"]{background:#2563eb}',
      '.ia-diagnostico__punto[data-estado="correcto"]{background:#16a34a}',
      '.ia-diagnostico__punto[data-estado="error"]{background:#dc2626}',
      '.ia-diagnostico__punto[data-estado="omitido"]{background:#64748b}',
      '.ia-diagnostico__soporte{font-size:12px;line-height:1.35;text-align:center;color:#64748b}',
      '.ia-diagnostico__soporte[hidden]{display:none!important}',
      '.ia-diagnostico__codigo{font-weight:800;color:#334155;letter-spacing:.02em}',
      '.ia-diagnostico__etapa{font-weight:600}',
      '@media (max-width:600px){.ia-diagnostico__punto{width:8px;height:8px}.ia-diagnostico__soporte{font-size:11px}}'
    ].join('');
    document.head.appendChild(style);
    estilosInstalados = true;
  }

  function instalarContenedores() {
    var acciones = document.querySelectorAll('.ai-actions');

    Array.prototype.forEach.call(acciones, function (contenedorAcciones) {
      var articulo = contenedorAcciones.closest('[data-propuesta-panel]');
      var numeroPropuesta = articulo
        ? Number(articulo.getAttribute('data-propuesta-panel') || 0)
        : 0;
      var bloque;

      if (!numeroPropuesta || articulo.querySelector('[data-ia-diagnostico]')) {
        return;
      }

      bloque = document.createElement('div');
      bloque.className = 'ia-diagnostico';
      bloque.setAttribute('data-ia-diagnostico', String(numeroPropuesta));
      bloque.setAttribute('aria-live', 'polite');
      bloque.hidden = true;
      bloque.innerHTML = [
        '<div class="ia-diagnostico__puntos" data-ia-puntos></div>',
        '<div class="ia-diagnostico__soporte" data-ia-soporte hidden>',
        '  <span class="ia-diagnostico__etapa" data-ia-etapa></span>',
        '  <span aria-hidden="true"> · </span>',
        '  <span>Código de soporte: <span class="ia-diagnostico__codigo" data-ia-codigo></span></span>',
        '</div>'
      ].join('');

      contenedorAcciones.insertAdjacentElement('afterend', bloque);
    });
  }

  function instalarObservadores() {
    if (observadoresInstalados || !window.MutationObserver) {
      observadoresInstalados = true;
      return;
    }

    [1, 2, 3].forEach(function (numeroPropuesta) {
      var estado = document.getElementById('p' + numeroPropuesta + 'EstadoIA');
      var sugerencias = document.getElementById('p' + numeroPropuesta + 'Sugerencias');
      var observar = function () {
        revisarResultadoVisible(numeroPropuesta);
      };
      var observer;

      if (estado) {
        observer = new MutationObserver(observar);
        observer.observe(estado, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['class']
        });
      }

      if (sugerencias) {
        observer = new MutationObserver(observar);
        observer.observe(sugerencias, {
          childList: true,
          subtree: true
        });
      }
    });

    observadoresInstalados = true;
  }

  function generarTextoConDiagnostico(proveedor, prompt, opciones) {
    var normalizado = normalizarProveedorSeguro(proveedor);
    var intento = iniciarProveedor(normalizado);

    return servicioOriginal.generarTexto(proveedor, prompt, opciones)
      .then(function (respuesta) {
        proveedorRespondio(intento, respuesta);
        return respuesta;
      })
      .catch(function (error) {
        proveedorFallo(intento, error);
        throw error;
      });
  }

  function normalizarProveedorSeguro(proveedor) {
    if (typeof servicioOriginal.normalizarProveedorRuntime === 'function') {
      try {
        return servicioOriginal.normalizarProveedorRuntime(proveedor || {});
      } catch (error) {
        // Continuar con una normalización mínima.
      }
    }

    proveedor = proveedor || {};
    return {
      id: texto(proveedor.id || proveedor.proveedor || proveedor.provider || 'desconocido'),
      nombre: texto(proveedor.nombre || proveedor.name || proveedor.id || 'IA'),
      modelo: texto(proveedor.modelo || proveedor.model || ''),
      tipo: texto(proveedor.tipo || proveedor.protocol || '')
    };
  }

  function obtenerNumeroPropuestaVisible() {
    var visible = document.querySelector('[data-propuesta-panel]:not([hidden])');
    return visible
      ? Number(visible.getAttribute('data-propuesta-panel') || 0)
      : 0;
  }

  function iniciarEjecucion() {
    var numeroPropuesta = obtenerNumeroPropuestaVisible() || 1;
    var bloque;
    var puntos;
    var soporte;

    ejecucion = {
      codigo: crearCodigoSoporte(),
      propuesta: numeroPropuesta,
      inicio: new Date().toISOString(),
      inicioMs: Date.now(),
      etapa: 'Conexión con proveedores',
      proveedorActual: '',
      intentos: [],
      puntos: {},
      respondieron: 0,
      finalizada: false,
      registrada: false
    };

    bloque = obtenerBloque(numeroPropuesta);
    if (bloque) {
      bloque.hidden = false;
      puntos = obtenerElemento(bloque, '[data-ia-puntos]');
      soporte = obtenerElemento(bloque, '[data-ia-soporte]');
      if (puntos) puntos.innerHTML = '';
      if (soporte) soporte.hidden = true;
    }

    return ejecucion;
  }

  function iniciarProveedor(proveedor) {
    var actual = ejecucion && !ejecucion.finalizada
      ? ejecucion
      : iniciarEjecucion();
    var id = texto(proveedor.id || proveedor.proveedor || 'desconocido');
    var anterior;
    var intento;

    if (actual.proveedorActual && actual.proveedorActual !== id) {
      anterior = actual.puntos[actual.proveedorActual];
      if (anterior && anterior.estado === 'respuesta') {
        actual.etapa = 'Validación de títulos';
        anterior.motivo = 'La respuesta no superó la validación de los tres títulos.';
      }
    }

    intento = {
      proveedor: id,
      nombre: texto(proveedor.nombre || id),
      modelo: texto(proveedor.modelo || proveedor.model || ''),
      tipo: texto(proveedor.tipo || ''),
      inicio: new Date().toISOString(),
      inicioMs: Date.now(),
      duracionMs: 0,
      estado: 'PROBANDO',
      httpStatus: 0,
      codigoError: '',
      mensaje: '',
      correccion: actual.proveedorActual === id
    };

    actual.proveedorActual = id;
    actual.etapa = intento.correccion
      ? 'Corrección de la respuesta'
      : 'Conexión con proveedores';
    actual.intentos.push(intento);
    actualizarPunto(proveedor, 'probando');

    return intento;
  }

  function proveedorRespondio(intento, respuesta) {
    if (!ejecucion || ejecucion.finalizada || !intento) {
      return;
    }

    intento.duracionMs = Date.now() - intento.inicioMs;
    intento.httpStatus = 200;
    intento.longitudRespuesta = texto(respuesta).length;
    intento.estado = 'RESPONDIO';
    ejecucion.respondieron += 1;
    ejecucion.etapa = 'Validación de títulos';
    actualizarPunto({ id: intento.proveedor, nombre: intento.nombre }, 'respuesta');
  }

  function proveedorFallo(intento, error) {
    if (!ejecucion || ejecucion.finalizada || !intento) {
      return;
    }

    intento.duracionMs = Date.now() - intento.inicioMs;
    intento.estado = 'ERROR';
    intento.httpStatus = extraerHttpStatus(error);
    intento.codigoError = deducirCodigoError(error);
    intento.mensaje = limpiarMensajeSeguro(error && error.message || error);
    ejecucion.etapa = ejecucion.respondieron
      ? 'Validación de títulos'
      : 'Conexión con proveedores';
    actualizarPunto({ id: intento.proveedor, nombre: intento.nombre }, 'error');
  }

  function revisarResultadoVisible(numeroPropuesta) {
    var estado;
    var sugerencias;
    var mensaje;

    if (!ejecucion || ejecucion.finalizada || ejecucion.propuesta !== numeroPropuesta) {
      return;
    }

    estado = document.getElementById('p' + numeroPropuesta + 'EstadoIA');
    sugerencias = document.getElementById('p' + numeroPropuesta + 'Sugerencias');
    mensaje = estado ? texto(estado.textContent) : '';

    if (sugerencias && sugerencias.querySelector('.suggestion-card')) {
      finalizarCorrecto();
      return;
    }

    if (estado && estado.classList.contains('is-success')) {
      finalizarCorrecto();
      return;
    }

    if (estado && estado.classList.contains('is-error') && mensaje) {
      window.setTimeout(function () {
        var estadoActual = document.getElementById('p' + numeroPropuesta + 'EstadoIA');
        if (
          ejecucion &&
          !ejecucion.finalizada &&
          estadoActual &&
          estadoActual.classList.contains('is-error')
        ) {
          finalizarError();
        }
      }, 100);
    }
  }

  function finalizarCorrecto() {
    var punto;

    if (!ejecucion || ejecucion.finalizada) return;
    punto = ejecucion.puntos[ejecucion.proveedorActual];
    if (punto) {
      actualizarPunto({ id: ejecucion.proveedorActual, nombre: punto.nombre }, 'correcto');
    }
    ejecucion.etapa = 'Títulos generados';
    ejecucion.finalizada = true;
    ocultarSoporte(ejecucion.propuesta);
  }

  function finalizarError() {
    var bloque;
    var etapa;
    var etapaElemento;
    var codigoElemento;
    var soporte;

    if (!ejecucion || ejecucion.finalizada) return;

    etapa = ejecucion.respondieron
      ? 'Validación de títulos'
      : 'Conexión con proveedores';
    ejecucion.etapa = etapa;
    ejecucion.finalizada = true;
    ejecucion.fin = new Date().toISOString();
    ejecucion.duracionTotalMs = Date.now() - ejecucion.inicioMs;

    bloque = obtenerBloque(ejecucion.propuesta);
    if (bloque) {
      bloque.hidden = false;
      etapaElemento = obtenerElemento(bloque, '[data-ia-etapa]');
      codigoElemento = obtenerElemento(bloque, '[data-ia-codigo]');
      soporte = obtenerElemento(bloque, '[data-ia-soporte]');
      if (etapaElemento) etapaElemento.textContent = 'Etapa: ' + etapa;
      if (codigoElemento) codigoElemento.textContent = ejecucion.codigo;
      if (soporte) soporte.hidden = false;
    }

    registrarEnSheets(ejecucion);
  }

  function actualizarPunto(proveedor, estado) {
    var actual = ejecucion;
    var bloque;
    var contenedor;
    var id;
    var punto;

    if (!actual) return;
    id = texto(proveedor.id || proveedor.proveedor || 'desconocido');
    bloque = obtenerBloque(actual.propuesta);
    if (!bloque) return;
    contenedor = obtenerElemento(bloque, '[data-ia-puntos]');
    if (!contenedor) return;
    punto = contenedor.querySelector('[data-ia-proveedor="' + escaparSelector(id) + '"]');

    if (!punto) {
      punto = document.createElement('span');
      punto.className = 'ia-diagnostico__punto';
      punto.setAttribute('data-ia-proveedor', id);
      punto.setAttribute('role', 'img');
      contenedor.appendChild(punto);
    }

    punto.setAttribute('data-estado', estado);
    punto.setAttribute(
      'title',
      texto(proveedor.nombre || id) + ': ' + descripcionEstado(estado)
    );
    punto.setAttribute(
      'aria-label',
      texto(proveedor.nombre || id) + ': ' + descripcionEstado(estado)
    );

    actual.puntos[id] = {
      id: id,
      nombre: texto(proveedor.nombre || id),
      estado: estado
    };
  }

  function registrarEnSheets(datos) {
    var sheets = window.EstudianteMVPSheets;
    var payload;

    if (!datos || datos.registrada || !sheets || typeof sheets.leerConfiguracion !== 'function') {
      return;
    }

    datos.registrada = true;
    payload = construirPayloadSeguro(datos);

    sheets.leerConfiguracion()
      .then(function (configSheets) {
        if (!configSheets || !configSheets.activo || !configSheets.endpoint) {
          return null;
        }

        return fetch(configSheets.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify({
            accion: 'LOG',
            action: 'LOG',
            tipo: 'LOG',
            origen: 'estudiantes-mvp',
            fechaCliente: new Date().toISOString(),
            idRegistro: datos.codigo,
            datos: {
              nivel: 'ERROR',
              modulo: 'DiagnosticoIA',
              mensaje: 'Fallo de generación IA ' + datos.codigo,
              detalle: JSON.stringify(payload),
              idRegistro: datos.codigo,
              prueba: false
            }
          })
        });
      })
      .catch(function () {
        // Un fallo al guardar el diagnóstico no altera la experiencia del estudiante.
      });
  }

  function construirPayloadSeguro(datos) {
    var state = window.EstudianteMVPState;
    var estudiante = state && typeof state.obtenerEstudiante === 'function'
      ? state.obtenerEstudiante() || {}
      : {};
    var cedula = texto(
      estudiante.cedula ||
      estudiante.numeroIdentificacion ||
      ''
    ).replace(/\D/g, '');
    var periodo = texto(
      estudiante.periodoLabel ||
      estudiante.periodo ||
      estudiante.periodoId ||
      ''
    );

    return {
      codigo: datos.codigo,
      fechaInicio: datos.inicio,
      fechaFin: datos.fin,
      cedulaEnmascarada: enmascararCedula(cedula),
      periodo: periodo,
      propuesta: datos.propuesta,
      etapaFinal: datos.etapa,
      duracionTotalMs: datos.duracionTotalMs,
      intentos: datos.intentos.map(function (intento) {
        return {
          proveedor: intento.proveedor,
          modelo: intento.modelo,
          tipo: intento.tipo,
          estado: intento.estado,
          correccion: intento.correccion === true,
          duracionMs: intento.duracionMs,
          httpStatus: intento.httpStatus,
          codigoError: intento.codigoError,
          mensaje: intento.mensaje,
          longitudRespuesta: intento.longitudRespuesta || 0
        };
      })
    };
  }

  function obtenerBloque(numeroPropuesta) {
    return document.querySelector('[data-ia-diagnostico="' + Number(numeroPropuesta || 0) + '"]');
  }

  function obtenerElemento(contenedor, selector) {
    return contenedor ? contenedor.querySelector(selector) : null;
  }

  function ocultarSoporte(numeroPropuesta) {
    var bloque = obtenerBloque(numeroPropuesta);
    var soporte = obtenerElemento(bloque, '[data-ia-soporte]');
    if (soporte) soporte.hidden = true;
  }

  function crearCodigoSoporte() {
    var fecha = new Date();
    var partes = [
      String(fecha.getFullYear()).slice(-2),
      rellenar(fecha.getMonth() + 1),
      rellenar(fecha.getDate())
    ].join('');
    var aleatorio = Math.random().toString(36).slice(2, 6).toUpperCase();
    return 'IA-' + partes + '-' + aleatorio;
  }

  function rellenar(valor) {
    valor = String(valor);
    return valor.length < 2 ? '0' + valor : valor;
  }

  function enmascararCedula(cedula) {
    var cantidad;
    if (!cedula) return '';
    cantidad = Math.max(cedula.length - 2, 0);
    return new Array(cantidad + 1).join('*') + cedula.slice(-2);
  }

  function limpiarMensajeSeguro(valor) {
    return texto(valor)
      .replace(/key=[^\s&]+/ig, 'key=***')
      .replace(/api[_-]?key[^\s&]*/ig, 'apiKey=***')
      .replace(/Bearer\s+[^\s]+/ig, 'Bearer ***')
      .replace(/token[=:][^\s&]+/ig, 'token=***')
      .slice(0, 300);
  }

  function extraerHttpStatus(error) {
    var directo = numero(error && error.httpStatus, 0);
    var coincidencia;
    if (directo) return directo;
    coincidencia = texto(error && error.message || error).match(/HTTP\s*(\d{3})/i);
    return coincidencia ? Number(coincidencia[1]) : 0;
  }

  function deducirCodigoError(error) {
    var mensaje = texto(error && error.message || error).toUpperCase();
    var http = mensaje.match(/HTTP\s*(\d{3})/);
    if (http) return 'HTTP_' + http[1];
    if (mensaje.indexOf('TIEMPO') >= 0 || mensaje.indexOf('TIMEOUT') >= 0) return 'TIMEOUT';
    if (mensaje.indexOf('FETCH') >= 0 || mensaje.indexOf('CONECTAR') >= 0) return 'FAILED_TO_FETCH';
    if (mensaje.indexOf('JSON') >= 0 || mensaje.indexOf('FORMATO') >= 0) return 'FORMATO_INVALIDO';
    if (mensaje.indexOf('TITULO') >= 0 || mensaje.indexOf('SUGERENCIA') >= 0) return 'VALIDACION_TITULOS';
    return 'ERROR_PROVEEDOR';
  }

  function descripcionEstado(estado) {
    var mapa = {
      probando: 'probando',
      respuesta: 'respondió; validando títulos',
      correcto: 'generación correcta',
      error: 'error',
      omitido: 'no fue necesario'
    };
    return mapa[estado] || estado;
  }

  function escaparSelector(valor) {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(valor);
    }
    return String(valor).replace(/(["\\])/g, '\\$1');
  }

  window.EstudianteMVPIAProviders = Object.freeze({
    generarTexto: generarTextoConDiagnostico,
    normalizarProveedorRuntime: servicioOriginal.normalizarProveedorRuntime,
    proxyUrl: servicioOriginal.proxyUrl
  });

  window.EstudianteMVPIADiagnostico = Object.freeze({
    version: '1.0.0',
    instalar: instalar
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar);
  } else {
    instalar();
  }
})(window, document);
