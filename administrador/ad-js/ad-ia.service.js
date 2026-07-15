/* =========================================================
Archivo: ad-ia.service.js
Ruta: /administrador/ad-js/ad-ia.service.js
Función:
- Administrar proveedores IA desde Firebase.
- Crear el catálogo inicial de 10 opciones.
- Agregar, editar, activar, desactivar y ordenar proveedores.
- Probar cada proveedor de forma individual.
- Guardar resultados de prueba y auditoría.
Dependencias:
- ad-config.js
- ad-firebase.service.js
========================================================= */

(function(window){
  "use strict";

  var CATALOGO = Object.freeze([
    {
      id:"gemini",
      nombre:"Google Gemini",
      tipo:"gemini",
      prioridad:1,
      endpoint:"",
      modelo:"gemini-2.0-flash",
      descripcion:"Proveedor principal de Google."
    },
    {
      id:"groq",
      nombre:"Groq",
      tipo:"openai-compatible",
      prioridad:2,
      endpoint:"https://api.groq.com/openai/v1/chat/completions",
      modelo:"llama-3.1-8b-instant",
      descripcion:"Inferencia rápida compatible con OpenAI."
    },
    {
      id:"cerebras",
      nombre:"Cerebras",
      tipo:"openai-compatible",
      prioridad:3,
      endpoint:"https://api.cerebras.ai/v1/chat/completions",
      modelo:"qwen-3-32b",
      descripcion:"Proveedor de inferencia rápida compatible con OpenAI."
    },
    {
      id:"cloudflare",
      nombre:"Cloudflare Workers AI",
      tipo:"cloudflare",
      prioridad:4,
      endpoint:"",
      modelo:"@cf/meta/llama-3.1-8b-instruct",
      descripcion:"Respaldo mediante Workers AI o un endpoint propio."
    },
    {
      id:"nvidia",
      nombre:"NVIDIA NIM",
      tipo:"openai-compatible",
      prioridad:5,
      endpoint:"https://integrate.api.nvidia.com/v1/chat/completions",
      modelo:"meta/llama-3.1-8b-instruct",
      descripcion:"API serverless compatible con OpenAI."
    },
    {
      id:"github_models",
      nombre:"GitHub Models",
      tipo:"openai-compatible",
      prioridad:6,
      endpoint:"https://models.github.ai/inference/chat/completions",
      modelo:"openai/gpt-4.1-mini",
      descripcion:"Modelos de GitHub mediante token personal."
    },
    {
      id:"openrouter",
      nombre:"OpenRouter Free Router",
      tipo:"openai-compatible",
      prioridad:7,
      endpoint:"https://openrouter.ai/api/v1/chat/completions",
      modelo:"openrouter/free",
      descripcion:"Selecciona automáticamente un modelo gratuito disponible."
    },
    {
      id:"openrouter_qwen",
      nombre:"Qwen Free - OpenRouter",
      tipo:"openai-compatible",
      prioridad:8,
      endpoint:"https://openrouter.ai/api/v1/chat/completions",
      modelo:"qwen/qwen3-4b:free",
      descripcion:"Modelo Qwen gratuito mediante OpenRouter."
    },
    {
      id:"openrouter_deepseek",
      nombre:"DeepSeek Free - OpenRouter",
      tipo:"openai-compatible",
      prioridad:9,
      endpoint:"https://openrouter.ai/api/v1/chat/completions",
      modelo:"deepseek/deepseek-r1-0528-qwen3-8b:free",
      descripcion:"Modelo DeepSeek gratuito mediante OpenRouter."
    },
    {
      id:"huggingface",
      nombre:"Hugging Face Inference",
      tipo:"openai-compatible",
      prioridad:10,
      endpoint:"https://router.huggingface.co/v1/chat/completions",
      modelo:"Qwen/Qwen3-8B",
      descripcion:"Respaldo mediante Inference Providers."
    }
  ]);

  function cfg(){ return window.AD_CONFIG || {}; }
  function fs(){
    if (!window.ADFirebaseService) throw new Error("ADFirebaseService no está disponible.");
    return window.ADFirebaseService;
  }
  function coleccion(){ return (cfg().colecciones && cfg().colecciones.ia) || "IA"; }
  function texto(v){ return String(v === null || v === undefined ? "" : v).trim(); }
  function idSeguro(v){
    if (window.AD_UTILS && typeof window.AD_UTILS.normalizarDocId === "function") {
      return window.AD_UTILS.normalizarDocId(v);
    }
    return texto(v).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
  }
  function numero(v,fallback){
    var n = Number(v);
    return Number.isFinite(n) ? n : Number(fallback || 0);
  }
  function booleano(v){
    if (v === true || v === false) return v;
    v = texto(v).toLowerCase();
    return ["true","1","si","sí","activo"].indexOf(v) >= 0;
  }
  function ocultarClave(valor){
    var key = texto(valor);
    if (!key) return "";
    if (key.length <= 8) return key.charAt(0) + "******";
    return key.slice(0,4) + "…" + key.slice(-4);
  }
  function limpiarProveedor(raw){
    var data = raw || {};
    var id = idSeguro(data.id || data.proveedor || data.provider || data._docId || data.nombre);
    return {
      id:id,
      proveedor:id,
      nombre:texto(data.nombre || data.name || id),
      tipo:texto(data.tipo || data.protocol || data.protocolo || inferirTipo(id)),
      activo:booleano(data.activo !== undefined ? data.activo : data.active),
      prioridad:Math.max(1,numero(data.prioridad || data.priority,999)),
      endpoint:texto(data.endpoint || data.url || data.baseUrl),
      modelo:texto(data.modelo || data.model || data.modelName),
      model:texto(data.model || data.modelo || data.modelName),
      apiKey:texto(data.apiKey || data.apikey || data.api_key || data.key || data.token),
      key:texto(data.key || data.token || data.apiKey || data.apikey),
      timeoutMs:Math.max(5000,numero(data.timeoutMs || data.timeout,45000)),
      maxTokens:Math.max(100,numero(data.maxTokens || data.max_tokens,900)),
      temperatura:numero(data.temperatura !== undefined ? data.temperatura : data.temperature,0.4),
      descripcion:texto(data.descripcion || data.description),
      ultimaPruebaOk:data.ultimaPruebaOk === true,
      ultimaPruebaEn:data.ultimaPruebaEn || "",
      ultimaLatenciaMs:numero(data.ultimaLatenciaMs,0),
      ultimoError:texto(data.ultimoError),
      actualizadoEn:data.actualizadoEn || "",
      raw:data
    };
  }
  function inferirTipo(id){
    id = idSeguro(id);
    if (id === "gemini") return "gemini";
    if (id === "cloudflare") return "cloudflare";
    if (["groq","openrouter","openrouter_qwen","openrouter_deepseek","cerebras","nvidia","github_models","huggingface"].indexOf(id) >= 0) {
      return "openai-compatible";
    }
    return "generic";
  }
  function ordenar(lista){
    return (lista || []).slice().sort(function(a,b){
      var pa = numero(a.prioridad,999);
      var pb = numero(b.prioridad,999);
      if (pa !== pb) return pa - pb;
      return String(a.nombre || a.id).localeCompare(String(b.nombre || b.id),"es");
    });
  }

  function listar(){
    var limite = cfg().ia && cfg().ia.maxProveedores || 50;
    return fs().listarColeccion(coleccion(),limite).then(function(resp){
      return ordenar((resp.datos || []).map(limpiarProveedor).filter(function(item){ return item.id; }));
    });
  }

  function leer(id){
    id = idSeguro(id);
    if (!id) return Promise.reject(new Error("No se recibió el ID del proveedor."));
    return fs().leerDocumento(coleccion(),id).then(function(resp){
      return resp.existe ? limpiarProveedor(resp.data) : null;
    });
  }

  function guardar(datos){
    var entrada = limpiarProveedor(datos || {});
    if (!entrada.id) return Promise.reject(new Error("El proveedor necesita un ID."));
    if (!entrada.nombre) return Promise.reject(new Error("El proveedor necesita un nombre."));
    if (!entrada.tipo) return Promise.reject(new Error("Selecciona el tipo de integración."));
    if (entrada.tipo !== "gemini" && !entrada.endpoint) {
      return Promise.reject(new Error("Este tipo de proveedor necesita endpoint."));
    }

    return leer(entrada.id).then(function(existente){
      var apiKey = texto(entrada.apiKey || entrada.key || (existente && (existente.apiKey || existente.key)));
      var data = {
        id:entrada.id,
        proveedor:entrada.id,
        nombre:entrada.nombre,
        tipo:entrada.tipo,
        activo:entrada.activo,
        prioridad:entrada.prioridad,
        endpoint:entrada.endpoint,
        modelo:entrada.modelo,
        model:entrada.modelo,
        apiKey:apiKey,
        key:apiKey,
        timeoutMs:entrada.timeoutMs,
        maxTokens:entrada.maxTokens,
        temperatura:entrada.temperatura,
        descripcion:entrada.descripcion,
        origen:"administrador",
        actualizadoPor:cfg().administrador || "administrador"
      };
      return fs().guardarDocumento(coleccion(),entrada.id,data,{ merge:true }).then(function(resultado){
        return registrarLog(existente ? "ADMIN_IA_ACTUALIZADA" : "ADMIN_IA_CREADA",{
          proveedorId:entrada.id,
          nombre:entrada.nombre,
          tipo:entrada.tipo,
          prioridad:entrada.prioridad,
          activo:entrada.activo
        }).catch(function(){ return null; }).then(function(){
          return Object.assign({},resultado,{ proveedor:limpiarProveedor(data) });
        });
      });
    });
  }

  function cambiarEstado(id,activo){
    id = idSeguro(id);
    return fs().guardarDocumento(coleccion(),id,{
      activo:activo === true,
      actualizadoPor:cfg().administrador || "administrador"
    },{ merge:true }).then(function(resultado){
      return registrarLog(activo ? "ADMIN_IA_ACTIVADA" : "ADMIN_IA_DESACTIVADA",{
        proveedorId:id,
        activo:activo === true
      }).catch(function(){ return null; }).then(function(){ return resultado; });
    });
  }

  function sembrarCatalogo(){
    return listar().then(function(actuales){
      var mapa = {};
      actuales.forEach(function(item){ mapa[item.id] = true; });
      var creados = [];
      var cadena = Promise.resolve();

      CATALOGO.forEach(function(preset){
        if (mapa[preset.id]) return;
        cadena = cadena.then(function(){
          var data = Object.assign({},preset,{
            activo:false,
            apiKey:"",
            key:"",
            timeoutMs:45000,
            maxTokens:900,
            temperatura:0.4,
            origen:"catalogo-administrador",
            actualizadoPor:cfg().administrador || "administrador"
          });
          return fs().guardarDocumento(coleccion(),preset.id,data,{ merge:true }).then(function(){
            creados.push(preset.id);
          });
        });
      });

      return cadena.then(function(){
        return registrarLog("ADMIN_IA_CATALOGO_CREADO",{
          totalCreados:creados.length,
          proveedores:creados
        }).catch(function(){ return null; }).then(function(){
          return { ok:true, creados:creados, totalCreados:creados.length };
        });
      });
    });
  }

  function probar(id){
    var proveedor;
    var inicio = Date.now();
    return leer(id).then(function(item){
      if (!item) throw new Error("No se encontró el proveedor.");
      proveedor = item;
      return ejecutarPrueba(item);
    }).then(function(resultado){
      var latencia = Date.now() - inicio;
      return guardarResultadoPrueba(proveedor.id,true,latencia,"").then(function(){
        return registrarLog("ADMIN_IA_PROBADA",{
          proveedorId:proveedor.id,
          ok:true,
          latenciaMs:latencia
        }).catch(function(){ return null; }).then(function(){
          return {
            ok:true,
            proveedor:proveedor.id,
            nombre:proveedor.nombre,
            latenciaMs:latencia,
            texto:resultado.texto,
            respuesta:resultado.respuesta
          };
        });
      });
    }).catch(function(error){
      var latencia = Date.now() - inicio;
      var mensaje = error && error.message ? error.message : String(error);
      if (!proveedor) throw error;
      return guardarResultadoPrueba(proveedor.id,false,latencia,mensaje)
        .catch(function(){ return null; })
        .then(function(){
          return registrarLog("ADMIN_IA_PROBADA",{
            proveedorId:proveedor.id,
            ok:false,
            latenciaMs:latencia,
            error:mensaje
          }).catch(function(){ return null; });
        })
        .then(function(){ throw error; });
    });
  }

  function guardarResultadoPrueba(id,ok,latencia,error){
    return fs().guardarDocumento(coleccion(),id,{
      ultimaPruebaOk:ok === true,
      ultimaPruebaEn:new Date().toISOString(),
      ultimaLatenciaMs:Number(latencia || 0),
      ultimoError:texto(error),
      actualizadoPor:cfg().administrador || "administrador"
    },{ merge:true });
  }

  function ejecutarPrueba(proveedor){
    var prompt = [
      "Responde únicamente JSON válido.",
      "Genera exactamente tres títulos académicos breves sobre mejora del aprendizaje con tecnología.",
      '{"sugerencias":[{"titulo":"..."},{"titulo":"..."},{"titulo":"..."}]}'
    ].join("\n");
    var tipo = texto(proveedor.tipo || inferirTipo(proveedor.id));
    if (tipo === "gemini") return probarGemini(proveedor,prompt);
    if (tipo === "openai-compatible") return probarOpenAI(proveedor,prompt);
    if (tipo === "cloudflare") return probarCloudflare(proveedor,prompt);
    return probarGenerico(proveedor,prompt);
  }

  function probarGemini(p,prompt){
    var key = texto(p.apiKey || p.key);
    var modelo = texto(p.modelo || p.model || "gemini-2.0-flash");
    var endpoint = texto(p.endpoint) || (
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(modelo) + ":generateContent?key=" + encodeURIComponent(key)
    );
    if (!key && endpoint.indexOf("key=") === -1) throw new Error("Gemini no tiene API key.");
    return enviar(endpoint,{
      contents:[{ role:"user", parts:[{ text:prompt }] }],
      generationConfig:{
        temperature:numero(p.temperatura,0.4),
        maxOutputTokens:numero(p.maxTokens,900)
      }
    },{
      "Content-Type":"application/json"
    },p.timeoutMs).then(function(respuesta){
      var textoRespuesta = respuesta && respuesta.candidates &&
        respuesta.candidates[0] && respuesta.candidates[0].content &&
        respuesta.candidates[0].content.parts && respuesta.candidates[0].content.parts[0] &&
        respuesta.candidates[0].content.parts[0].text;
      if (!textoRespuesta) throw new Error("Gemini respondió sin texto.");
      return { texto:textoRespuesta, respuesta:respuesta };
    });
  }

  function probarOpenAI(p,prompt){
    var key = texto(p.apiKey || p.key);
    var endpoint = texto(p.endpoint);
    var headers = {
      "Content-Type":"application/json",
      "Authorization":"Bearer " + key
    };
    if (!endpoint) throw new Error("El proveedor no tiene endpoint.");
    if (!key) throw new Error("El proveedor no tiene API key o token.");

    if (p.id.indexOf("openrouter") === 0) {
      headers["HTTP-Referer"] = window.location ? window.location.origin : "";
      headers["X-Title"] = "Administrador Titulación";
    }
    if (p.id === "github_models") {
      headers["Accept"] = "application/vnd.github+json";
    }

    return enviar(endpoint,{
      model:texto(p.modelo || p.model),
      messages:[
        { role:"system", content:"Eres una IA de titulación. Responde solo JSON válido." },
        { role:"user", content:prompt }
      ],
      temperature:numero(p.temperatura,0.4),
      max_tokens:numero(p.maxTokens,900)
    },headers,p.timeoutMs).then(function(respuesta){
      var textoRespuesta = respuesta && respuesta.choices && respuesta.choices[0] &&
        ((respuesta.choices[0].message && respuesta.choices[0].message.content) || respuesta.choices[0].text);
      textoRespuesta = textoRespuesta || (respuesta && (respuesta.output_text || respuesta.text));
      if (!textoRespuesta) throw new Error("El proveedor respondió sin texto.");
      return { texto:textoRespuesta, respuesta:respuesta };
    });
  }

  function probarCloudflare(p,prompt){
    var key = texto(p.apiKey || p.key);
    var endpoint = texto(p.endpoint);
    if (!endpoint) throw new Error("Cloudflare necesita endpoint completo.");
    if (!key) throw new Error("Cloudflare no tiene API key o token.");
    return enviar(endpoint,{
      model:texto(p.modelo || p.model),
      messages:[
        { role:"system", content:"Eres una IA de titulación. Responde solo JSON válido." },
        { role:"user", content:prompt }
      ],
      temperature:numero(p.temperatura,0.4),
      max_tokens:numero(p.maxTokens,900)
    },{
      "Content-Type":"application/json",
      "Authorization":"Bearer " + key
    },p.timeoutMs).then(function(respuesta){
      var textoRespuesta = respuesta && respuesta.result &&
        (respuesta.result.response || respuesta.result.text);
      textoRespuesta = textoRespuesta || (respuesta && (respuesta.response || respuesta.text));
      if (!textoRespuesta && respuesta && respuesta.choices && respuesta.choices[0]) {
        textoRespuesta = respuesta.choices[0].message && respuesta.choices[0].message.content;
      }
      if (!textoRespuesta) throw new Error("Cloudflare respondió sin texto.");
      return { texto:textoRespuesta, respuesta:respuesta };
    });
  }

  function probarGenerico(p,prompt){
    var key = texto(p.apiKey || p.key);
    var endpoint = texto(p.endpoint);
    var headers = { "Content-Type":"application/json" };
    if (!endpoint) throw new Error("El proveedor genérico necesita endpoint.");
    if (key) headers.Authorization = "Bearer " + key;
    return enviar(endpoint,{
      prompt:prompt,
      model:texto(p.modelo || p.model),
      temperature:numero(p.temperatura,0.4),
      max_tokens:numero(p.maxTokens,900)
    },headers,p.timeoutMs).then(function(respuesta){
      var textoRespuesta = respuesta && (respuesta.text || respuesta.output || respuesta.respuesta || respuesta.message);
      if (textoRespuesta && typeof textoRespuesta !== "string") textoRespuesta = JSON.stringify(textoRespuesta);
      if (!textoRespuesta) textoRespuesta = JSON.stringify(respuesta || {});
      return { texto:textoRespuesta, respuesta:respuesta };
    });
  }

  function enviar(endpoint,body,headers,timeoutMs){
    var controller = window.AbortController ? new AbortController() : null;
    var timer = null;
    var opciones = {
      method:"POST",
      headers:headers || { "Content-Type":"application/json" },
      body:JSON.stringify(body || {})
    };
    if (controller) {
      opciones.signal = controller.signal;
      timer = setTimeout(function(){ controller.abort(); },Math.max(5000,numero(timeoutMs,45000)));
    }
    return fetch(endpoint,opciones).then(function(resp){
      return resp.text().then(function(bodyText){
        var json;
        try { json = bodyText ? JSON.parse(bodyText) : {}; }
        catch(errorJson){ json = { text:bodyText, rawText:bodyText }; }
        if (!resp.ok) {
          var mensaje = json && json.error && (json.error.message || json.error);
          mensaje = mensaje || json.message || json.mensaje || ("HTTP " + resp.status);
          throw new Error(typeof mensaje === "string" ? mensaje : JSON.stringify(mensaje));
        }
        return json;
      });
    }).catch(function(error){
      if (error && error.name === "AbortError") throw new Error("La prueba superó el tiempo máximo.");
      throw error;
    }).then(function(resultado){
      if (timer) clearTimeout(timer);
      return resultado;
    },function(error){
      if (timer) clearTimeout(timer);
      throw error;
    });
  }

  function registrarLog(accion,detalle){
    var col = cfg().colecciones && cfg().colecciones.logs;
    if (!col) return Promise.resolve(null);
    return fs().agregarDocumento(col,{
      accion:accion,
      modulo:"ia_administrador",
      origen:"administrador",
      estado:"OK",
      detalle:detalle || {},
      administrador:cfg().administrador || "administrador",
      fecha:new Date().toISOString()
    });
  }

  window.ADIAService = {
    catalogo:function(){ return CATALOGO.slice(); },
    listar:listar,
    leer:leer,
    guardar:guardar,
    cambiarEstado:cambiarEstado,
    sembrarCatalogo:sembrarCatalogo,
    probar:probar,
    limpiarProveedor:limpiarProveedor,
    ocultarClave:ocultarClave
  };
})(window);
