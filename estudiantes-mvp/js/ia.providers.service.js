/*
  Archivo: ia.providers.service.js
  Ruta: estudiantes-mvp/js/ia.providers.service.js
  Funciones principales:
  - Ejecutar solicitudes a proveedores IA configurados desde el administrador.
  - Soportar Gemini, OpenAI compatible, Cloudflare y endpoints genéricos.
  - Permitir cualquier cantidad de proveedores sin programarlos por separado.
  - Usar endpoint, modelo, prioridad y clave leídos desde Firebase.
  - Controlar timeout y errores sin detener toda la app.
*/
(function (window) {
  'use strict';

  function obtenerConfig() {
    return window.EstudianteMVPConfig || null;
  }

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function generarTexto(proveedor, prompt, opciones) {
    var normalizado;
    var tipo;

    proveedor = proveedor || {};
    opciones = opciones || {};
    normalizado = normalizarProveedorRuntime(proveedor);
    tipo = normalizado.tipo || inferirTipo(normalizado.id);

    if (!normalizado.id) {
      return Promise.reject(new Error('Proveedor IA sin identificador.'));
    }

    if (!prompt) {
      return Promise.reject(new Error('No se recibió prompt para generar con IA.'));
    }

    if (tipo === 'gemini') {
      return generarConGemini(normalizado, prompt, opciones);
    }

    if (tipo === 'openai-compatible') {
      return generarConOpenAICompatible(normalizado, prompt, opciones);
    }

    if (tipo === 'cloudflare') {
      return generarConCloudflare(normalizado, prompt, opciones);
    }

    if (tipo === 'generic') {
      return generarConEndpointGenerico(normalizado, prompt, opciones);
    }

    if (normalizado.endpoint) {
      return generarConEndpointGenerico(normalizado, prompt, opciones);
    }

    return Promise.reject(
      new Error('Proveedor IA no soportado o sin endpoint: ' + normalizado.id)
    );
  }

  function generarConGemini(proveedor, prompt, opciones) {
    var apiKey = proveedor.apiKey || proveedor.key;
    var modelo = proveedor.modelo || proveedor.model || 'gemini-2.0-flash';
    var endpoint = proveedor.endpoint || construirEndpointGemini(modelo, apiKey);
    var body;

    if (!apiKey && endpoint.indexOf('key=') === -1) {
      return Promise.reject(new Error('Gemini no tiene apiKey configurada.'));
    }

    body = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: prompt
            }
          ]
        }
      ],
      generationConfig: {
        temperature: obtenerTemperatura(proveedor, opciones),
        maxOutputTokens: obtenerMaxTokens(proveedor, opciones)
      }
    };

    return enviarJson(endpoint, body, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      timeoutMs: obtenerTimeout(proveedor, opciones)
    }).then(function (respuesta) {
      return extraerTextoGemini(respuesta);
    });
  }

  function generarConOpenAICompatible(proveedor, prompt, opciones) {
    var apiKey = proveedor.apiKey || proveedor.key;
    var modelo = proveedor.modelo || proveedor.model || obtenerModeloFallback(proveedor.id);
    var endpoint = proveedor.endpoint || obtenerEndpointFallback(proveedor.id);
    var headers;
    var body;

    if (!endpoint) {
      return Promise.reject(
        new Error('El proveedor ' + proveedor.id + ' no tiene endpoint configurado.')
      );
    }

    if (!apiKey) {
      return Promise.reject(
        new Error('El proveedor ' + proveedor.id + ' no tiene apiKey configurada.')
      );
    }

    if (!modelo) {
      return Promise.reject(
        new Error('El proveedor ' + proveedor.id + ' no tiene modelo configurado.')
      );
    }

    headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    };

    if (proveedor.id.indexOf('openrouter') === 0) {
      headers['HTTP-Referer'] = window.location ? window.location.origin : '';
      headers['X-Title'] = 'Estudiantes MVP';
    }

    if (proveedor.id === 'github_models') {
      headers.Accept = 'application/vnd.github+json';
    }

    body = {
      model: modelo,
      messages: [
        {
          role: 'system',
          content: 'Eres una IA de Titulación académica. Responde solo JSON válido.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: obtenerTemperatura(proveedor, opciones),
      max_tokens: obtenerMaxTokens(proveedor, opciones)
    };

    return enviarJson(endpoint, body, {
      method: 'POST',
      headers: headers,
      timeoutMs: obtenerTimeout(proveedor, opciones)
    }).then(function (respuesta) {
      return extraerTextoOpenAICompatible(respuesta);
    });
  }

  function generarConCloudflare(proveedor, prompt, opciones) {
    var apiKey = proveedor.apiKey || proveedor.key;
    var endpoint = proveedor.endpoint;
    var modelo = proveedor.modelo || proveedor.model || '';
    var body;

    if (!endpoint) {
      return Promise.reject(
        new Error('Cloudflare necesita un endpoint completo configurado en Firebase.')
      );
    }

    if (!apiKey) {
      return Promise.reject(new Error('Cloudflare no tiene apiKey configurada.'));
    }

    body = {
      model: modelo,
      messages: [
        {
          role: 'system',
          content: 'Eres una IA de Titulación académica. Responde solo JSON válido.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: obtenerTemperatura(proveedor, opciones),
      max_tokens: obtenerMaxTokens(proveedor, opciones)
    };

    return enviarJson(endpoint, body, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      timeoutMs: obtenerTimeout(proveedor, opciones)
    }).then(function (respuesta) {
      return extraerTextoCloudflare(respuesta);
    });
  }

  function generarConEndpointGenerico(proveedor, prompt, opciones) {
    var apiKey = proveedor.apiKey || proveedor.key;
    var headers = {
      'Content-Type': 'application/json'
    };
    var body;

    if (!proveedor.endpoint) {
      return Promise.reject(
        new Error('El proveedor genérico no tiene endpoint configurado.')
      );
    }

    body = {
      prompt: prompt,
      model: proveedor.modelo || proveedor.model || '',
      temperature: obtenerTemperatura(proveedor, opciones),
      max_tokens: obtenerMaxTokens(proveedor, opciones)
    };

    if (apiKey) {
      headers.Authorization = 'Bearer ' + apiKey;
    }

    return enviarJson(proveedor.endpoint, body, {
      method: 'POST',
      headers: headers,
      timeoutMs: obtenerTimeout(proveedor, opciones)
    }).then(function (respuesta) {
      return extraerTextoGenerico(respuesta);
    });
  }

  function enviarJson(endpoint, body, opciones) {
    var controller = null;
    var timer = null;
    var timeoutMs;
    var fetchOptions;

    opciones = opciones || {};
    timeoutMs = Number(opciones.timeoutMs || 45000);

    if (!endpoint) {
      return Promise.reject(new Error('No existe endpoint para el proveedor IA.'));
    }

    if (window.AbortController) {
      controller = new AbortController();
      timer = setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }

    fetchOptions = {
      method: opciones.method || 'POST',
      headers: opciones.headers || {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body || {})
    };

    if (controller) {
      fetchOptions.signal = controller.signal;
    }

    return fetch(endpoint, fetchOptions)
      .then(function (response) {
        return response.text().then(function (texto) {
          var json = intentarParsearJson(texto);

          if (!response.ok) {
            throw new Error(
              obtenerMensajeHttp(response.status, json, texto)
            );
          }

          return json || {
            text: texto,
            rawText: texto
          };
        });
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') {
          throw new Error('La IA tardó demasiado en responder.');
        }

        throw error;
      })
      .then(
        function (resultado) {
          if (timer) {
            clearTimeout(timer);
          }

          return resultado;
        },
        function (error) {
          if (timer) {
            clearTimeout(timer);
          }

          throw error;
        }
      );
  }

  function extraerTextoGemini(respuesta) {
    var candidato;
    var parte;

    if (!respuesta) {
      throw new Error('Gemini respondió vacío.');
    }

    if (respuesta.candidates && respuesta.candidates.length) {
      candidato = respuesta.candidates[0];

      if (
        candidato.content &&
        candidato.content.parts &&
        candidato.content.parts.length
      ) {
        parte = candidato.content.parts[0];

        if (parte.text) {
          return parte.text;
        }
      }
    }

    if (respuesta.text) {
      return respuesta.text;
    }

    throw new Error('No se pudo leer el texto devuelto por Gemini.');
  }

  function extraerTextoOpenAICompatible(respuesta) {
    if (!respuesta) {
      throw new Error('El proveedor respondió vacío.');
    }

    if (respuesta.choices && respuesta.choices.length) {
      if (
        respuesta.choices[0].message &&
        respuesta.choices[0].message.content
      ) {
        return respuesta.choices[0].message.content;
      }

      if (respuesta.choices[0].text) {
        return respuesta.choices[0].text;
      }
    }

    if (respuesta.output_text) {
      return respuesta.output_text;
    }

    if (respuesta.text) {
      return respuesta.text;
    }

    throw new Error('No se pudo leer el texto devuelto por el proveedor IA.');
  }

  function extraerTextoCloudflare(respuesta) {
    if (!respuesta) {
      throw new Error('Cloudflare respondió vacío.');
    }

    if (respuesta.result && respuesta.result.response) {
      return respuesta.result.response;
    }

    if (respuesta.result && respuesta.result.text) {
      return respuesta.result.text;
    }

    if (respuesta.response) {
      return respuesta.response;
    }

    if (respuesta.text) {
      return respuesta.text;
    }

    return extraerTextoOpenAICompatible(respuesta);
  }

  function extraerTextoGenerico(respuesta) {
    if (!respuesta) {
      throw new Error('El endpoint respondió vacío.');
    }

    if (respuesta.sugerencias) {
      return JSON.stringify(respuesta);
    }

    if (respuesta.text) {
      return respuesta.text;
    }

    if (respuesta.output) {
      return typeof respuesta.output === 'string'
        ? respuesta.output
        : JSON.stringify(respuesta.output);
    }

    if (respuesta.message) {
      return respuesta.message;
    }

    if (respuesta.respuesta) {
      return typeof respuesta.respuesta === 'string'
        ? respuesta.respuesta
        : JSON.stringify(respuesta.respuesta);
    }

    return JSON.stringify(respuesta);
  }

  function construirEndpointGemini(modelo, apiKey) {
    return 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(modelo || 'gemini-2.0-flash') +
      ':generateContent?key=' +
      encodeURIComponent(apiKey || '');
  }

  function obtenerEndpointFallback(id) {
    if (id === 'groq') {
      return 'https://api.groq.com/openai/v1/chat/completions';
    }

    if (
      id === 'openrouter' ||
      id === 'openrouter_qwen' ||
      id === 'openrouter_deepseek'
    ) {
      return 'https://openrouter.ai/api/v1/chat/completions';
    }

    if (id === 'cerebras') {
      return 'https://api.cerebras.ai/v1/chat/completions';
    }

    if (id === 'nvidia') {
      return 'https://integrate.api.nvidia.com/v1/chat/completions';
    }

    if (id === 'github_models') {
      return 'https://models.github.ai/inference/chat/completions';
    }

    if (id === 'huggingface') {
      return 'https://router.huggingface.co/v1/chat/completions';
    }

    return '';
  }

  function obtenerModeloFallback(id) {
    if (id === 'groq') {
      return 'llama-3.1-8b-instant';
    }

    if (id === 'openrouter') {
      return 'openrouter/free';
    }

    if (id === 'openrouter_qwen') {
      return 'qwen/qwen3-4b:free';
    }

    if (id === 'openrouter_deepseek') {
      return 'deepseek/deepseek-r1-0528-qwen3-8b:free';
    }

    if (id === 'cerebras') {
      return 'qwen-3-32b';
    }

    if (id === 'nvidia') {
      return 'meta/llama-3.1-8b-instruct';
    }

    if (id === 'github_models') {
      return 'openai/gpt-4.1-mini';
    }

    if (id === 'huggingface') {
      return 'Qwen/Qwen3-8B';
    }

    return '';
  }

  function normalizarProveedorRuntime(proveedor) {
    var utils = obtenerUtils();
    var tipo;

    if (!utils) {
      throw new Error('No está disponible EstudianteMVPUtils.');
    }

    proveedor = proveedor || {};
    tipo = utils.normalizarClave(
      proveedor.tipo ||
      proveedor.protocol ||
      proveedor.protocolo ||
      inferirTipo(proveedor.id || proveedor.proveedor)
    ).replace(/_/g, '-');

    return {
      id: utils.normalizarClave(
        proveedor.id ||
        proveedor.proveedor ||
        proveedor.provider ||
        ''
      ),
      nombre: utils.limpiarTexto(
        proveedor.nombre ||
        proveedor.name ||
        proveedor.id ||
        ''
      ),
      tipo: tipo,
      activo: proveedor.activo === true,
      prioridad: numeroSeguro(proveedor.prioridad || proveedor.priority, 999),
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
      timeoutMs: numeroSeguro(
        proveedor.timeoutMs ||
        proveedor.timeout,
        45000
      ),
      maxTokens: numeroSeguro(
        proveedor.maxTokens ||
        proveedor.max_tokens,
        900
      ),
      temperatura: numeroSeguro(
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

    if (id === 'gemini') {
      return 'gemini';
    }

    if (id === 'cloudflare') {
      return 'cloudflare';
    }

    if (
      id === 'groq' ||
      id === 'openrouter' ||
      id === 'openrouter_qwen' ||
      id === 'openrouter_deepseek' ||
      id === 'cerebras' ||
      id === 'nvidia' ||
      id === 'github_models' ||
      id === 'huggingface'
    ) {
      return 'openai-compatible';
    }

    return 'generic';
  }

  function obtenerTimeout(proveedor, opciones) {
    var config = obtenerConfig();

    proveedor = proveedor || {};
    opciones = opciones || {};

    return Number(
      opciones.timeoutMs ||
      proveedor.timeoutMs ||
      (config ? config.obtener('ia.timeoutMs', 45000) : 45000)
    );
  }

  function obtenerMaxTokens(proveedor, opciones) {
    var config = obtenerConfig();

    proveedor = proveedor || {};
    opciones = opciones || {};

    return Number(
      opciones.maxTokens ||
      proveedor.maxTokens ||
      (config ? config.obtener('ia.maxTokens', 900) : 900)
    );
  }

  function obtenerTemperatura(proveedor, opciones) {
    var config = obtenerConfig();

    proveedor = proveedor || {};
    opciones = opciones || {};

    if (opciones.temperatura !== undefined && opciones.temperatura !== null) {
      return Number(opciones.temperatura);
    }

    if (proveedor.temperatura !== undefined && proveedor.temperatura !== null) {
      return Number(proveedor.temperatura);
    }

    return Number(
      config ? config.obtener('ia.temperatura', 0.4) : 0.4
    );
  }

  function numeroSeguro(valor, fallback) {
    var numero = Number(valor);

    return Number.isFinite(numero)
      ? numero
      : Number(fallback || 0);
  }

  function intentarParsearJson(texto) {
    try {
      return JSON.parse(texto);
    } catch (error) {
      return null;
    }
  }

  function obtenerMensajeHttp(status, json, texto) {
    if (json && json.error && json.error.message) {
      return json.error.message;
    }

    if (json && json.error && typeof json.error === 'string') {
      return json.error;
    }

    if (json && json.message) {
      return json.message;
    }

    if (json && json.mensaje) {
      return json.mensaje;
    }

    return 'El proveedor IA respondió con error HTTP ' +
      status +
      ': ' +
      String(texto || '').slice(0, 180);
  }

  window.EstudianteMVPIAProviders = Object.freeze({
    generarTexto: generarTexto,
    normalizarProveedorRuntime: normalizarProveedorRuntime
  });
})(window);
