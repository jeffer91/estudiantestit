/*
  Diagnóstico visual del flujo IA por propuesta.
  - Cada propuesta tiene su propio bloque de puntos.
  - Registra generación, revisión y resultado final.
  - Muestra código de soporte solo cuando todos los procesos fallan.
*/
(function (window, document) {
  'use strict';

  var servicioOriginal = window.EstudianteMVPIAProviders;
  var ejecucion = null;
  var estilosInstalados = false;
  var eventosInstalados = false;

  if (!servicioOriginal || typeof servicioOriginal.generarTexto !== 'function') {
    console.warn('[Diagnóstico IA] No se encontró el servicio de proveedores.');
    return;
  }

  function instalar() {
    instalarEstilos();
    instalarContenedores();
    instalarEventos();
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
      '.ia-diagnostico__etapa-visible{font-size:12px;font-weight:700;color:#52637a;text-align:center}',
      '.ia-diagnostico__soporte{font-size:12px;line-height:1.35;text-align:center;color:#64748b}',
      '.ia-diagnostico__soporte[hidden]{display:none!important}',
      '.ia-diagnostico__codigo{font-weight:800;color:#334155;letter-spacing:.02em}',
      '@media(max-width:600px){.ia-diagnostico__punto{width:8px;height:8px}.ia-diagnostico__soporte,.ia-diagnostico__etapa-visible{font-size:11px}}'
    ].join('');

    document.head.appendChild(style);
    estilosInstalados = true;
  }

  function instalarContenedores() {
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-propuesta-panel]'),
      function (panel) {
        var numero = Number(panel.getAttribute('data-propuesta-panel') || 0);
        var acciones = panel.querySelector('.ai-actions');
        var bloque;

        if (!numero || !acciones || panel.querySelector('[data-ia-diagnostico="' + numero + '"]')) return;

        bloque = document.createElement('div');
        bloque.className = 'ia-diagnostico';
        bloque.setAttribute('data-ia-diagnostico', String(numero));
        bloque.setAttribute('aria-live', 'polite');
        bloque.hidden = true;
        bloque.innerHTML = [
          '<div class="ia-diagnostico__puntos" data-ia-puntos></div>',
          '<div class="ia-diagnostico__etapa-visible" data-ia-etapa-visible></div>',
          '<div class="ia-diagnostico__soporte" data-ia-soporte hidden>',
          '  <span>Código de soporte: <span class="ia-diagnostico__codigo" data-ia-codigo></span></span>',
          '</div>'
        ].join('');

        acciones.insertAdjacentElement('afterend', bloque);
      }
    );
  }

  function instalarEventos() {
    if (eventosInstalados) return;

    document.addEventListener('ia-titulacion:3x3-inicio', function (evento) {
      iniciarEjecucion(evento && evento.detail || {});
    });

    document.addEventListener('ia-titulacion:progreso', function (evento) {
      actualizarProgreso(evento && evento.detail || {});
    });

    document.addEventListener('ia-titulacion:3x3-exito', function (evento) {
      finalizarCorrecto(evento && evento.detail || {});
    });

    document.addEventListener('ia-titulacion:3x3-error', function (evento) {
      finalizarError(evento && evento.detail || {});
    });

    eventosInstalados = true;
  }

  function generarTextoConDiagnostico(proveedor, prompt, opciones) {
    var normalizado = normalizarProveedorSeguro(proveedor);
    var intento = iniciarProveedor(normalizado, opciones && opciones.modoRevision === true);

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

  function iniciarEjecucion(detalle) {
    var numeroPropuesta = Number(detalle.numeroPropuesta || 1);
    var bloque = obtenerBloque(numeroPropuesta);
    var puntos;
    var soporte;

    ejecucion = {
      codigo: crearCodigoSoporte(),
      propuesta: numeroPropuesta,
      inicio: new Date().toISOString(),
      inicioMs: Date.now(),
      etapa: 'Preparando el proceso',
      proceso: 1,
      maxProcesos: Number(detalle.maxProcesos || 3),
      proveedorActual: '',
      intentos: [],
      puntos: {},
      respondieron: 0,
      finalizada: false,
      registrada: false
    };

    if (bloque) {
      bloque.hidden = false;
      puntos = bloque.querySelector('[data-ia-puntos]');
      soporte = bloque.querySelector('[data-ia-soporte]');
      if (puntos) puntos.innerHTML = '';
      if (soporte) soporte.hidden = true;
      actualizarEtapaVisible();
    }
  }

  function actualizarProgreso(detalle) {
    if (!ejecucion || ejecucion.finalizada) return;
    if (detalle.numeroPropuesta && Number(detalle.numeroPropuesta) !== ejecucion.propuesta) return;

    ejecucion.proceso = Number(detalle.proceso || ejecucion.proceso || 1);
    ejecucion.maxProcesos = Number(detalle.maxProcesos || ejecucion.maxProcesos || 3);
    ejecucion.etapa = detalle.mensaje || detalle.etapa || ejecucion.etapa;
    actualizarEtapaVisible();
  }

  function iniciarProveedor(proveedor, revision) {
    var actual = ejecucion || iniciarEjecucion({ numeroPropuesta: 1 });
    var id = texto(proveedor.id || proveedor.proveedor || 'desconocido');
    var intento = {
      proveedor: id,
      nombre: texto(proveedor.nombre || id),
      modelo: texto(proveedor.modelo || proveedor.model || ''),
      tipo: texto(proveedor.tipo || ''),
      inicioMs: Date.now(),
      duracionMs: 0,
      estado: 'PROBANDO',
      httpStatus: 0,
      codigoError: '',
      mensaje: '',
      correccion: revision === true
    };

    actual.proveedorActual = id;
    actual.intentos.push(intento);
    actualizarPunto(proveedor, 'probando');
    return intento;
  }

  function proveedorRespondio(intento, respuesta) {
    if (!ejecucion || ejecucion.finalizada || !intento) return;

    intento.duracionMs = Date.now() - intento.inicioMs;
    intento.httpStatus = 200;
    intento.longitudRespuesta = texto(respuesta).length;
    intento.estado = 'RESPONDIO';
    ejecucion.respondieron += 1;
    actualizarPunto({ id: intento.proveedor, nombre: intento.nombre }, 'respuesta');
  }

  function proveedorFallo(intento, error) {
    if (!ejecucion || ejecucion.finalizada || !intento) return;

    intento.duracionMs = Date.now() - intento.inicioMs;
    intento.estado = 'ERROR';
    intento.httpStatus = extraerHttpStatus(error);
    intento.codigoError = deducirCodigoError(error);
    intento.mensaje = limpiarMensajeSeguro(error && error.message || error);
    actualizarPunto({ id: intento.proveedor, nombre: intento.nombre }, 'error');
  }

  function finalizarCorrecto(resultado) {
    var idFinal;

    if (!ejecucion || ejecucion.finalizada) return;

    idFinal = texto(resultado.proveedor || ejecucion.proveedorActual);
    if (idFinal) actualizarPunto({ id: idFinal, nombre: idFinal }, 'correcto');

    ejecucion.etapa = 'Tres opciones listas para elegir';
    ejecucion.finalizada = true;
    ejecucion.fin = new Date().toISOString();
    ejecucion.duracionTotalMs = Date.now() - ejecucion.inicioMs;
    actualizarEtapaVisible();
    ocultarSoporte();
  }

  function finalizarError(detalle) {
    var bloque;
    var soporte;
    var codigo;

    if (!ejecucion || ejecucion.finalizada) return;

    ejecucion.etapa = ejecucion.respondieron
      ? 'No se obtuvieron tres opciones válidas'
      : 'No fue posible conectar con los proveedores';
    ejecucion.finalizada = true;
    ejecucion.fin = new Date().toISOString();
    ejecucion.duracionTotalMs = Date.now() - ejecucion.inicioMs;
    ejecucion.errorFinal = limpiarMensajeSeguro(detalle.mensaje || detalle.error || '');

    bloque = obtenerBloque(ejecucion.propuesta);
    if (bloque) {
      bloque.hidden = false;
      soporte = bloque.querySelector('[data-ia-soporte]');
      codigo = bloque.querySelector('[data-ia-codigo]');
      if (codigo) codigo.textContent = ejecucion.codigo;
      if (soporte) soporte.hidden = false;
    }

    actualizarEtapaVisible();
    registrarEnSheets(ejecucion);
  }

  function actualizarPunto(proveedor, estado) {
    var bloque = ejecucion ? obtenerBloque(ejecucion.propuesta) : null;
    var contenedor;
    var id;
    var punto;

    if (!ejecucion || !bloque) return;

    id = texto(proveedor.id || proveedor.proveedor || 'desconocido');
    contenedor = bloque.querySelector('[data-ia-puntos]');
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
    punto.setAttribute('title', texto(proveedor.nombre || id) + ': ' + descripcionEstado(estado));
    punto.setAttribute('aria-label', texto(proveedor.nombre || id) + ': ' + descripcionEstado(estado));

    ejecucion.puntos[id] = {
      id: id,
      nombre: texto(proveedor.nombre || id),
      estado: estado
    };
  }

  function actualizarEtapaVisible() {
    var bloque = ejecucion ? obtenerBloque(ejecucion.propuesta) : null;
    var etapa = bloque ? bloque.querySelector('[data-ia-etapa-visible]') : null;

    if (etapa && ejecucion) {
      etapa.textContent = 'Proceso ' + ejecucion.proceso + ' de ' + ejecucion.maxProcesos + ' · ' + ejecucion.etapa;
    }
  }

  function registrarEnSheets(datos) {
    var sheets = window.EstudianteMVPSheets;
    var payload;

    if (!datos || datos.registrada || !sheets || typeof sheets.leerConfiguracion !== 'function') return;

    datos.registrada = true;
    payload = construirPayloadSeguro(datos);

    sheets.leerConfiguracion()
      .then(function (configSheets) {
        if (!configSheets || !configSheets.activo || !configSheets.endpoint) return null;

        return fetch(configSheets.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            accion: 'LOG',
            action: 'LOG',
            tipo: 'LOG',
            origen: 'estudiantes-mvp',
            fechaCliente: new Date().toISOString(),
            idRegistro: datos.codigo,
            datos: {
              nivel: 'ERROR',
              modulo: 'DiagnosticoIAPropuesta',
              mensaje: 'Fallo de generación IA ' + datos.codigo,
              detalle: JSON.stringify(payload),
              idRegistro: datos.codigo,
              prueba: false
            }
          })
        });
      })
      .catch(function () {});
  }

  function construirPayloadSeguro(datos) {
    var state = window.EstudianteMVPState;
    var estudiante = state && typeof state.obtenerEstudiante === 'function'
      ? state.obtenerEstudiante() || {}
      : {};
    var cedula = texto(estudiante.cedula || estudiante.numeroIdentificacion || '').replace(/\D/g, '');

    return {
      codigo: datos.codigo,
      fechaInicio: datos.inicio,
      fechaFin: datos.fin,
      cedulaEnmascarada: enmascararCedula(cedula),
      periodo: texto(estudiante.periodoLabel || estudiante.periodo || estudiante.periodoId || ''),
      propuesta: datos.propuesta,
      procesoFinal: datos.proceso,
      etapaFinal: datos.etapa,
      errorFinal: datos.errorFinal || '',
      duracionTotalMs: datos.duracionTotalMs,
      intentos: datos.intentos
    };
  }

  function normalizarProveedorSeguro(proveedor) {
    if (typeof servicioOriginal.normalizarProveedorRuntime === 'function') {
      try { return servicioOriginal.normalizarProveedorRuntime(proveedor || {}); } catch (error) {}
    }

    proveedor = proveedor || {};
    return {
      id: texto(proveedor.id || proveedor.proveedor || proveedor.provider || 'desconocido'),
      nombre: texto(proveedor.nombre || proveedor.name || proveedor.id || 'IA'),
      modelo: texto(proveedor.modelo || proveedor.model || ''),
      tipo: texto(proveedor.tipo || proveedor.protocol || '')
    };
  }

  function obtenerBloque(numeroPropuesta) {
    return document.querySelector('[data-ia-diagnostico="' + Number(numeroPropuesta || 0) + '"]');
  }

  function ocultarSoporte() {
    var bloque = ejecucion ? obtenerBloque(ejecucion.propuesta) : null;
    var soporte = bloque ? bloque.querySelector('[data-ia-soporte]') : null;
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

  function texto(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function limpiarMensajeSeguro(valor) {
    return texto(valor)
      .replace(/key=[^\s&]+/ig, 'key=***')
      .replace(/api[_-]?key[^\s&]*/ig, 'apiKey=***')
      .replace(/Bearer\s+[^\s]+/ig, 'Bearer ***')
      .replace(/token[=:][^\s&]+/ig, 'token=***')
      .slice(0, 350);
  }

  function extraerHttpStatus(error) {
    var directo = Number(error && error.httpStatus || 0);
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
    return 'ERROR_PROVEEDOR';
  }

  function descripcionEstado(estado) {
    var mapa = {
      probando: 'consultando',
      respuesta: 'respondió; validando títulos',
      correcto: 'entregó las opciones finales',
      error: 'error'
    };
    return mapa[estado] || estado;
  }

  function escaparSelector(valor) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(valor);
    return String(valor).replace(/(["\\])/g, '\\$1');
  }

  window.EstudianteMVPIAProviders = Object.freeze({
    generarTexto: generarTextoConDiagnostico,
    normalizarProveedorRuntime: servicioOriginal.normalizarProveedorRuntime,
    proxyUrl: servicioOriginal.proxyUrl
  });

  window.EstudianteMVPIADiagnostico = Object.freeze({
    version: '3.0.0',
    instalar: instalar
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }
})(window, document);
