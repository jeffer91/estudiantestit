/* =========================================================
Archivo: ad-ia.service.js
Ruta: /administrador/ad-js/ad-ia.service.js
Función:
- Administrar proveedores IA desde Firebase.
- Crear el catálogo inicial de 10 opciones.
- Agregar, editar, activar, desactivar y ordenar proveedores.
- Probar proveedores mediante /api/ia para evitar bloqueos CORS.
- Guardar resultados de prueba y auditoría.
Dependencias:
- ad-config.js
- ad-firebase.service.js
- Cloudflare Pages Function /functions/api/ia.js
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
  function texto(valor){ return String(valor === null || valor === undefined ? "" : valor).trim(); }
  function numero(valor,fallback){
    var limpio = typeof valor === "string" ? valor.replace(",",".") : valor;
    var n = Number(limpio);
    return Number.isFinite(n) ? n : Number(fallback || 0);
  }
  function booleano(valor){
    if (valor === true || valor === false) return valor;
    return ["true","1","si","sí","activo"].indexOf(texto(valor).toLowerCase()) >= 0;
  }
  function idSeguro(valor){
    if (window.AD_UTILS && typeof window.AD_UTILS.normalizarDocId === "function") {
      return window.AD_UTILS.normalizarDocId(valor);
    }
    return texto(valor)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g,"_")
      .replace(/^_+|_+$/g,"");
  }
  function inferirTipo(id){
    id = idSeguro(id);
    if (id === "gemini") return "gemini";
    if (id === "cloudflare") return "cloudflare";
    if ([
      "groq","cerebras","nvidia","github_models","openrouter",
      "openrouter_qwen","openrouter_deepseek","huggingface"
    ].indexOf(id) >= 0) return "openai-compatible";
    return "generic";
  }
  function prioridadFallback(id){
    var mapa = {
      gemini:1,
      groq:2,
      cerebras:3,
      cloudflare:4,
      nvidia:5,
      github_models:6,
      openrouter:7,
      openrouter_qwen:8,
      openrouter_deepseek:9,
      huggingface:10
    };
    return mapa[idSeguro(id)] || 999;
  }
  function limpiarProveedor(raw){
    var data = raw || {};
    var id = idSeguro(data.id || data.proveedor || data.provider || data._docId || data.nombre);
    var prioridad = data.prioridad !== undefined ? data.prioridad : data.priority;
    return {
      id:id,
      proveedor:id,
      nombre:texto(data.nombre || data.name || id),
      tipo:texto(data.tipo || data.protocol || data.protocolo || inferirTipo(id)).replace(/_/g,"-"),
      activo:booleano(data.activo !== undefined ? data.activo : data.active),
      prioridad:Math.max(1,numero(prioridad,prioridadFallback(id))),
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
  function ordenar(lista){
    return (lista || []).slice().sort(function(a,b){
      var pa = numero(a.prioridad,999);
      var pb = numero(b.prioridad,999);
      if (pa !== pb) return pa - pb;
      return String(a.nombre || a.id).localeCompare(String(b.nombre || b.id),"es");
    });
  }
  function proxyUrl(){
    return new URL("/api/ia",window.location.origin).toString();
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
      var creados = [];
      var cadena = Promise.resolve();
      actuales.forEach(function(item){ mapa[item.id] = true; });

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

  function promptPrueba(){
    return [
      "Responde únicamente JSON válido.",
      "Genera exactamente tres títulos académicos de 15 a 25 palabras sobre mejora del aprendizaje mediante tecnología.",
      '{"sugerencias":[{"titulo":"..."},{"titulo":"..."},{"titulo":"..."}]}'
    ].join("\n");
  }

  function ejecutarProxy(proveedor,prompt,opciones){
    return fetch(proxyUrl(),{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({
        provider:proveedor,
        prompt:prompt,
        options:opciones || {}
      })
    }).then(function(resp){
      return resp.text().then(function(body){
        var json;
        try { json = body ? JSON.parse(body) : {}; }
        catch(errorJson) {
          if (resp.status === 404 || /<!doctype|<html/i.test(body)) {
            throw new Error("El proxy IA todavía no está desplegado en Cloudflare Pages. Espera el nuevo despliegue y recarga.");
          }
          throw new Error("El proxy IA respondió en un formato no válido.");
        }
        if (!resp.ok || json.ok === false) {
          throw new Error(json.error || json.message || ("El proxy IA respondió HTTP " + resp.status));
        }
        if (!texto(json.text)) throw new Error("El proveedor no devolvió texto utilizable.");
        return json;
      });
    }).catch(function(error){
      if (error && error.message === "Failed to fetch") {
        throw new Error("No se pudo conectar con /api/ia. Verifica que Cloudflare Pages haya terminado el despliegue con Functions.");
      }
      throw error;
    });
  }

  function probar(id){
    var proveedor;
    var inicio = Date.now();
    return leer(id).then(function(item){
      if (!item) throw new Error("No se encontró el proveedor.");
      proveedor = item;
      return ejecutarProxy(item,promptPrueba(),{
        timeoutMs:item.timeoutMs,
        temperatura:item.temperatura,
        maxTokens:item.maxTokens
      });
    }).then(function(resultado){
      var latencia = numero(resultado.latencyMs,Date.now() - inicio);
      return guardarResultadoPrueba(proveedor.id,true,latencia,"").then(function(){
        return registrarLog("ADMIN_IA_PROBADA",{
          proveedorId:proveedor.id,
          ok:true,
          latenciaMs:latencia,
          metodo:"pages-function"
        }).catch(function(){ return null; }).then(function(){
          return {
            ok:true,
            proveedor:proveedor.id,
            nombre:proveedor.nombre,
            latenciaMs:latencia,
            texto:resultado.text
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
            error:mensaje,
            metodo:"pages-function"
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
    proxyUrl:proxyUrl
  };
})(window);
