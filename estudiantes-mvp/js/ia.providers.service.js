/*
  Archivo: ia.providers.service.js
  Ruta: estudiantes-mvp/js/ia.providers.service.js
  Funciones principales:
  - Ejecutar solicitudes a proveedores IA configurados en Firebase.
  - Soportar Gemini, Groq y Cloudflare.
  - Usar endpoint, modelo y clave leídos desde Firebase.
  - Devolver texto limpio para que ia.titulacion.service.js lo convierta en sugerencias.
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

    proveedor = proveedor || {};
    opciones = opciones || {};
    normalizado = normalizarProveedorRuntime(proveedor);

    if (!normalizado.id) {
      return Promise.reject(new Error('Proveedor IA sin identificador.'));
    }

    if (!prompt) {
      return Promise.reject(new Error('No se recibió prompt para generar con IA.'));
    }

    if (normalizado.id === 'gemini') {
      return generarConGemini(normalizado, prompt, opciones);
    }

    if (normalizado.id === 'groq') {
      return generarConOpenAICompatible(normalizado, prompt, opciones, 'groq');
    }

    if (normalizado.id === 'openrouter') {
      return generarConOpenAICompatible(normalizado, prompt, opciones, 'openrouter');
    }

    if (normalizado.id === 'cloudflare') {
      return generarConCloudflare(normalizado, prompt, opciones);
    }

    if (normalizado.endpoint) {
      return generarConEndpointGenerico(normalizado, prompt, opciones);
    }

    return Promise.reject(new Error('Proveedor IA no soportado o sin endpoint: ' + normalizado.id));
  }

  function generarConGemini(proveedor, prompt, opciones) {
    var config = obtenerConfig();
    var apiKey = proveedor.apiKey || proveedor.key;
    var modelo = proveedor.modelo || proveedor.model || 'gemini-1.5-flash';
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
        temperature: Number(opciones.temperatura || config.obtener('ia.temperatura', 0.4)),
        maxOutputTokens: Number(opciones.maxTokens || config.obtener('ia.maxTokens', 900))
      }
    };

    return enviarJson(endpoint, body, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      timeoutMs: obtenerTimeout(opciones)
    }).then(function (respuesta) {
      return extraerTextoGemini(respuesta);
    });
  }

  function generarConOpenAICompatible(proveedor, prompt, opciones, tipo) {
    var config = obtenerConfig();
    var apiKey = proveedor.apiKey || proveedor.key;
    var modelo = proveedor.modelo || proveedor.model || obtenerModeloFallback(tipo);
    var endpoint = proveedor.endpoint || obtenerEndpointFallback(tipo);
    var headers;
    var body;

    if (!apiKey) {
      return Promise.reject(new Error((tipo || 'Proveedor') + ' no tiene apiKey configurada.'));
    }

    headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey
    };

    if (tipo === 'openrouter') {
      headers['HTTP-Referer'] = window.location ? window.location.origin : '';
      headers['X-Title'] = 'Estudiantes MVP';
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
      temperature: Number(opciones.temperatura || config.obtener('ia.temperatura', 0.4)),
      max_tokens: Number(opciones.maxTokens || config.obtener('ia.maxTokens', 900))
    };

    return enviarJson(endpoint, body, {
      method: 'POST',
      headers: headers,
      timeoutMs: obtenerTimeout(opciones)
    }).then(function (respuesta) {
      return extraerTextoOpenAICompatible(respuesta);
    });
  }

  function generarConCloudflare(proveedor, prompt, opciones) {
    var config = obtenerConfig();
    var apiKey = proveedor.apiKey || proveedor.key;
    var endpoint = proveedor.endpoint;
    var modelo = proveedor.modelo || proveedor.model || '';
    var body;

    if (!endpoint) {
      return Promise.reject(new Error('Cloudflare necesita un endpoint completo configurado en Firebase.'));
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
      temperature: Number(opciones.temperatura || config.obtener('ia.temperatura', 0.4)),
      max_tokens: Number(opciones.maxTokens || config.obtener('ia.maxTokens', 900))
    };

    return enviarJson(endpoint, body, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      timeoutMs: obtenerTimeout(opciones)
    }).then(function (respuesta) {
      return extraerTextoCloudflare(respuesta);
    });
  }

  function generarConEndpointGenerico(proveedor, prompt, opciones) {
    var config = obtenerConfig();
    var apiKey = proveedor.apiKey || proveedor.key;
    var headers = {
      'Content-Type': 'application/json'
    };
    var body = {
      prompt: prompt,
      model: proveedor.modelo || proveedor.model || '',
      temperature: Number(opciones.temperatura || config.obtener('ia.temperatura', 0.4)),
      max_tokens: Number(opciones.maxTokens || config.obtener('ia.maxTokens', 900))
    };

    if (apiKey) {
      headers.Authorization = 'Bearer ' + apiKey;
    }

    return enviarJson(proveedor.endpoint, body, {
      method: 'POST',
      headers: headers,
      timeoutMs: obtenerTimeout(opciones)
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
        if (timer) {
          clearTimeout(timer);
        }

        return response.text().then(function (texto) {
          var json = intentarParsearJson(texto);

          if (!response.ok) {
            throw new Error(obtenerMensajeHttp(response.status, json, texto));
          }

          return json || {
            text: texto,
            rawText: texto
          };
        });
      })
      .catch(function (error) {
        if (timer) {
          clearTimeout(timer);
        }

        if (error && error.name === 'AbortError') {
          throw new Error('La IA tardó demasiado en responder.');
        }

        throw error;
      });
  }

  function extraerTextoGemini(respuesta) {
    var candidato;
    var parte;

    if (!respuesta) {
      throw new Error('Gemini respondió vacío.');
    }

    if (respuesta.candidates && respuesta.candidates.length) {
      candidato = respuesta.candidates[0];

      if (candidato.content && candidato.content.parts && candidato.content.parts.length) {
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
      if (respuesta.choices[0].message && respuesta.choices[0].message.content) {
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
      return typeof respuesta.output === 'string' ? respuesta.output : JSON.stringify(respuesta.output);
    }

    if (respuesta.message) {
      return respuesta.message;
    }

    if (respuesta.respuesta) {
      return typeof respuesta.respuesta === 'string' ? respuesta.respuesta : JSON.stringify(respuesta.respuesta);
    }

    return JSON.stringify(respuesta);
  }

  function construirEndpointGemini(modelo, apiKey) {
    return 'https://generativelanguage.googleapis.com/v1beta/models/' +
      encodeURIComponent(modelo || 'gemini-1.5-flash') +
      ':generateContent?key=' +
      encodeURIComponent(apiKey || '');
  }

  function obtenerEndpointFallback(tipo) {
    if (tipo === 'groq') {
      return 'https://api.groq.com/openai/v1/chat/completions';
    }

    if (tipo === 'openrouter') {
      return 'https://openrouter.ai/api/v1/chat/completions';
    }

    return '';
  }

  function obtenerModeloFallback(tipo) {
    if (tipo === 'groq') {
      return 'llama-3.1-8b-instant';
    }

    if (tipo === 'openrouter') {
      return 'openai/gpt-4o-mini';
    }

    return '';
  }

  function normalizarProveedorRuntime(proveedor) {
    var utils = obtenerUtils();

    if (!utils) {
      throw new Error('No está disponible EstudianteMVPUtils.');
    }

    proveedor = proveedor || {};

    return {
      id: utils.normalizarClave(proveedor.id || proveedor.proveedor || proveedor.provider || ''),
      nombre: utils.limpiarTexto(proveedor.nombre || proveedor.name || proveedor.id || ''),
      activo: proveedor.activo === true,
      endpoint: utils.limpiarTexto(proveedor.endpoint || proveedor.url || ''),
      apiKey: utils.limpiarTexto(proveedor.apiKey || proveedor.apikey || proveedor.api_key || ''),
      key: utils.limpiarTexto(proveedor.key || proveedor.token || proveedor.apiKey || ''),
      model: utils.limpiarTexto(proveedor.model || proveedor.modelo || ''),
      modelo: utils.limpiarTexto(proveedor.modelo || proveedor.model || ''),
      raw: proveedor
    };
  }

  function obtenerTimeout(opciones) {
    var config = obtenerConfig();

    opciones = opciones || {};

    return Number(
      opciones.timeoutMs ||
      (config ? config.obtener('ia.timeoutMs', 45000) : 45000)
    );
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

    if (json && json.message) {
      return json.message;
    }

    if (json && json.mensaje) {
      return json.mensaje;
    }

    return 'El proveedor IA respondió con error HTTP ' + status + ': ' + String(texto || '').slice(0, 180);
  }

  window.EstudianteMVPIAProviders = Object.freeze({
    generarTexto: generarTexto,
    normalizarProveedorRuntime: normalizarProveedorRuntime
  });
})(window);
