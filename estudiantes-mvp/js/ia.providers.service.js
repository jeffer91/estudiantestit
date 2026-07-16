/*
  Archivo: ia.providers.service.js
  Ruta: estudiantes-mvp/js/ia.providers.service.js
  Funciones principales:
  - Enviar solicitudes IA al proxy local durante pruebas con Live Server.
  - Usar /api/ia del mismo dominio cuando la app esté publicada.
  - Normalizar proveedores configurados desde el administrador.
  - Cargar diagnóstico visual y el motor robusto de tres títulos.
*/
(function (window, document) {
  'use strict';

  var URL_PROXY_LOCAL = 'http://127.0.0.1:8787/api/ia';

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function texto(valor) {
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function numero(valor, fallback) {
    var limpio = typeof valor === 'string' ? valor.replace(',', '.') : valor;
    var parsed = Number(limpio);
    return Number.isFinite(parsed) ? parsed : Number(fallback || 0);
  }

  function esEntornoLocal() {
    var hostname = String(window.location && window.location.hostname || '').toLowerCase();
    return [
      'localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'
    ].indexOf(hostname) >= 0;
  }

  function proxyUrl() {
    var urlForzada = texto(window.ESTUDIANTE_IA_PROXY_URL || '');
    if (urlForzada) return urlForzada;
    if (esEntornoLocal()) return URL_PROXY_LOCAL;
    return new URL('/api/ia', window.location.origin).toString();
  }

  function generarTexto(proveedor, prompt, opciones) {
    var normalizado = normalizarProveedorRuntime(proveedor || {});
    opciones = opciones || {};

    if (!normalizado.id) {
      return Promise.reject(new Error('Proveedor IA sin identificador.'));
    }
    if (!texto(prompt)) {
      return Promise.reject(new Error('No se recibió prompt para generar con IA.'));
    }

    return fetch(proxyUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: normalizado,
        prompt: prompt,
        options: {
          timeoutMs: numero(opciones.timeoutMs || normalizado.timeoutMs, 45000),
          temperatura: opciones.temperatura !== undefined
            ? numero(opciones.temperatura, normalizado.temperatura)
            : normalizado.temperatura,
          maxTokens: numero(opciones.maxTokens || normalizado.maxTokens, 1100)
        }
      })
    }).then(function (response) {
      return response.text().then(function (body) {
        var json;
        var errorRespuesta;

        try {
          json = body ? JSON.parse(body) : {};
        } catch (errorJson) {
          errorRespuesta = new Error('El servicio IA respondió en un formato no válido.');
          errorRespuesta.httpStatus = response.status;
          errorRespuesta.codigo = 'RESPUESTA_PROXY_INVALIDA';
          throw errorRespuesta;
        }

        if (!response.ok || json.ok === false) {
          errorRespuesta = new Error(
            json.error || json.message || ('El servicio IA respondió HTTP ' + response.status)
          );
          errorRespuesta.httpStatus = Number(
            json.httpStatus || json.upstreamStatus || response.status || 0
          );
          errorRespuesta.codigo = json.code || json.codigo || ('HTTP_' + response.status);
          throw errorRespuesta;
        }

        if (!texto(json.text)) {
          errorRespuesta = new Error('El proveedor IA respondió sin texto utilizable.');
          errorRespuesta.httpStatus = response.status;
          errorRespuesta.codigo = 'RESPUESTA_SIN_TEXTO';
          throw errorRespuesta;
        }

        return json.text;
      });
    }).catch(function (error) {
      if (error && error.message === 'Failed to fetch') {
        var errorConexion = new Error(
          esEntornoLocal()
            ? 'No se pudo conectar con el proxy IA local. Ejecuta npm run dev:ia en la raíz del proyecto.'
            : 'No se pudo conectar con el servicio /api/ia.'
        );
        errorConexion.codigo = 'FAILED_TO_FETCH';
        throw errorConexion;
      }
      throw error;
    });
  }

  function normalizarProveedorRuntime(proveedor) {
    var utils = obtenerUtils();
    var limpiar = utils && typeof utils.limpiarTexto === 'function'
      ? utils.limpiarTexto
      : texto;
    var normalizar = utils && typeof utils.normalizarClave === 'function'
      ? utils.normalizarClave
      : function (valor) {
          return texto(valor).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        };
    var id = normalizar(
      proveedor.id || proveedor.proveedor || proveedor.provider || ''
    );
    var tipo = normalizar(
      proveedor.tipo || proveedor.protocol || proveedor.protocolo || inferirTipo(id)
    ).replace(/_/g, '-');

    return {
      id: id,
      proveedor: id,
      nombre: limpiar(proveedor.nombre || proveedor.name || id),
      tipo: tipo,
      activo: proveedor.activo === true,
      prioridad: numero(proveedor.prioridad || proveedor.priority, prioridadFallback(id)),
      endpoint: limpiar(proveedor.endpoint || proveedor.url || ''),
      apiKey: limpiar(
        proveedor.apiKey || proveedor.apikey || proveedor.api_key || proveedor.key || proveedor.token || ''
      ),
      key: limpiar(
        proveedor.key || proveedor.token || proveedor.apiKey || proveedor.apikey || proveedor.api_key || ''
      ),
      model: limpiar(proveedor.model || proveedor.modelo || ''),
      modelo: limpiar(proveedor.modelo || proveedor.model || ''),
      timeoutMs: Math.max(5000, numero(proveedor.timeoutMs || proveedor.timeout, 45000)),
      maxTokens: Math.max(100, numero(proveedor.maxTokens || proveedor.max_tokens, 1100)),
      temperatura: numero(
        proveedor.temperatura !== undefined ? proveedor.temperatura : proveedor.temperature,
        0.35
      ),
      raw: proveedor
    };
  }

  function inferirTipo(id) {
    id = String(id || '').toLowerCase();
    if (id === 'gemini') return 'gemini';
    if (id === 'cloudflare') return 'cloudflare';
    if ([
      'groq', 'cerebras', 'nvidia', 'github_models', 'openrouter',
      'openrouter_qwen', 'openrouter_deepseek', 'huggingface'
    ].indexOf(id) >= 0) return 'openai-compatible';
    return 'generic';
  }

  function prioridadFallback(id) {
    var mapa = {
      gemini: 1,
      groq: 2,
      cerebras: 3,
      cloudflare: 4,
      nvidia: 5,
      github_models: 6,
      openrouter: 7,
      openrouter_qwen: 8,
      openrouter_deepseek: 9,
      huggingface: 10
    };
    return mapa[String(id || '').toLowerCase()] || 999;
  }

  function cargarScript(src) {
    var script;

    if (document.readyState === 'loading') {
      document.write('<script src="' + src + '"><\/script>');
      return;
    }

    script = document.createElement('script');
    script.src = src;
    script.async = false;
    document.head.appendChild(script);
  }

  function cargarAuxiliares() {
    if (!window.EstudianteMVPIADiagnostico) {
      cargarScript('js/ia.diagnostico.service.js?v=1.0.1');
    }
    cargarScript('js/ia.titulacion.robusto.service.js?v=2.0.0');
    cargarScript('js/ia.recomendacion.ui.js?v=1.0.0');
  }

  window.EstudianteMVPIAProviders = Object.freeze({
    generarTexto: generarTexto,
    normalizarProveedorRuntime: normalizarProveedorRuntime,
    proxyUrl: proxyUrl
  });

  cargarAuxiliares();
})(window, document);
