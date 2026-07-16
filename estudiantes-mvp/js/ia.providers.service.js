/*
  Archivo: ia.providers.service.js
  Ruta: estudiantes-mvp/js/ia.providers.service.js
  Funciones principales:
  - Enviar las solicitudes IA al endpoint interno /api/ia.
  - Evitar bloqueos CORS de NVIDIA, GitHub Models y otros proveedores.
  - Mantener endpoint, modelo y clave configurados desde el administrador.
  - Devolver únicamente el texto normalizado al motor de titulación.
*/
(function (window, document) {
  'use strict';

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function texto(valor) {
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function numero(valor, fallback) {
    var limpio = typeof valor === 'string'
      ? valor.replace(',', '.')
      : valor;
    var parsed = Number(limpio);

    return Number.isFinite(parsed)
      ? parsed
      : Number(fallback || 0);
  }

  function proxyUrl() {
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
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: normalizado,
        prompt: prompt,
        options: {
          timeoutMs: numero(
            opciones.timeoutMs || normalizado.timeoutMs,
            45000
          ),
          temperatura: opciones.temperatura !== undefined
            ? numero(opciones.temperatura, normalizado.temperatura)
            : normalizado.temperatura,
          maxTokens: numero(
            opciones.maxTokens || normalizado.maxTokens,
            900
          )
        }
      })
    }).then(function (response) {
      return response.text().then(function (body) {
        var json;
        var errorRespuesta;

        try {
          json = body ? JSON.parse(body) : {};
        } catch (errorJson) {
          if (response.status === 404 || /<!doctype|<html/i.test(body)) {
            errorRespuesta = new Error(
              'El servicio IA todavía no está desplegado. Espera el despliegue de Cloudflare Pages y recarga la página.'
            );
            errorRespuesta.httpStatus = response.status;
            throw errorRespuesta;
          }

          errorRespuesta = new Error('El servicio IA respondió en un formato no válido.');
          errorRespuesta.httpStatus = response.status;
          throw errorRespuesta;
        }

        if (!response.ok || json.ok === false) {
          errorRespuesta = new Error(
            json.error ||
            json.message ||
            ('El servicio IA respondió HTTP ' + response.status)
          );
          errorRespuesta.httpStatus = Number(
            json.httpStatus ||
            json.upstreamStatus ||
            response.status ||
            0
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
          'No se pudo conectar con el servicio /api/ia. Verifica que el último despliegue de Cloudflare Pages haya finalizado.'
        );
        errorConexion.codigo = 'FAILED_TO_FETCH';
        throw errorConexion;
      }

      throw error;
    });
  }

  function normalizarProveedorRuntime(proveedor) {
    var utils = obtenerUtils();
    var id;
    var tipo;

    if (!utils) {
      throw new Error('No está disponible EstudianteMVPUtils.');
    }

    proveedor = proveedor || {};

    id = utils.normalizarClave(
      proveedor.id ||
      proveedor.proveedor ||
      proveedor.provider ||
      ''
    );

    tipo = utils.normalizarClave(
      proveedor.tipo ||
      proveedor.protocol ||
      proveedor.protocolo ||
      inferirTipo(id)
    ).replace(/_/g, '-');

    return {
      id: id,
      proveedor: id,
      nombre: utils.limpiarTexto(
        proveedor.nombre ||
        proveedor.name ||
        id
      ),
      tipo: tipo,
      activo: proveedor.activo === true,
      prioridad: numero(
        proveedor.prioridad || proveedor.priority,
        prioridadFallback(id)
      ),
      endpoint: utils.limpiarTexto(
        proveedor.endpoint ||
        proveedor.url ||
        ''
      ),
      apiKey: utils.limpiarTexto(
        proveedor.apiKey ||
        proveedor.apikey ||
        proveedor.api_key ||
        ''
      ),
      key: utils.limpiarTexto(
        proveedor.key ||
        proveedor.token ||
        proveedor.apiKey ||
        ''
      ),
      model: utils.limpiarTexto(
        proveedor.model ||
        proveedor.modelo ||
        ''
      ),
      modelo: utils.limpiarTexto(
        proveedor.modelo ||
        proveedor.model ||
        ''
      ),
      timeoutMs: Math.max(
        5000,
        numero(proveedor.timeoutMs || proveedor.timeout, 45000)
      ),
      maxTokens: Math.max(
        100,
        numero(proveedor.maxTokens || proveedor.max_tokens, 900)
      ),
      temperatura: numero(
        proveedor.temperatura !== undefined
          ? proveedor.temperatura
          : proveedor.temperature,
        0.4
      ),
      raw: proveedor
    };
  }

  function inferirTipo(id) {
    id = String(id || '').toLowerCase();

    if (id === 'gemini') return 'gemini';
    if (id === 'cloudflare') return 'cloudflare';

    if (
      id === 'groq' ||
      id === 'cerebras' ||
      id === 'nvidia' ||
      id === 'github_models' ||
      id === 'openrouter' ||
      id === 'openrouter_qwen' ||
      id === 'openrouter_deepseek' ||
      id === 'huggingface'
    ) {
      return 'openai-compatible';
    }

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

  function cargarDiagnostico() {
    var src = 'js/ia.diagnostico.service.js?v=1.0.0';
    var script;

    if (window.EstudianteMVPIADiagnostico) {
      return;
    }

    if (document.readyState === 'loading') {
      document.write('<script src="' + src + '"><\/script>');
      return;
    }

    script = document.createElement('script');
    script.src = src;
    script.async = false;
    document.head.appendChild(script);
  }

  window.EstudianteMVPIAProviders = Object.freeze({
    generarTexto: generarTexto,
    normalizarProveedorRuntime: normalizarProveedorRuntime,
    proxyUrl: proxyUrl
  });

  cargarDiagnostico();
})(window, document);
