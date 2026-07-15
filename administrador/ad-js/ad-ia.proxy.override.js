/* =========================================================
Archivo: ad-ia.proxy.override.js
Ruta: /administrador/ad-js/ad-ia.proxy.override.js
Función:
- Usar el proxy IA desplegado en titulos.pages.dev aunque el
  administrador se abra desde otro origen o de forma local.
- Reintentar con el origen actual solo como respaldo.
- Guardar el resultado de la prueba en Firebase.
========================================================= */

(function(window){
  "use strict";

  var PROXY_PRODUCCION = "https://titulos.pages.dev/api/ia";
  var intentosInstalacion = 0;
  var maxIntentosInstalacion = 120;

  function texto(valor){
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function numero(valor,fallback){
    var limpio = typeof valor === "string" ? valor.replace(",", ".") : valor;
    var n = Number(limpio);
    return Number.isFinite(n) ? n : Number(fallback || 0);
  }

  function agregarUnico(lista,valor){
    valor = texto(valor);
    if (valor && lista.indexOf(valor) === -1) lista.push(valor);
  }

  function urlsProxy(){
    var lista = [];
    var configurado = window.AD_IA_PROXY_URL ||
      (window.AD_CONFIG && window.AD_CONFIG.ia && window.AD_CONFIG.ia.proxyUrl) ||
      "";

    agregarUnico(lista,configurado);
    agregarUnico(lista,PROXY_PRODUCCION);

    try {
      if (window.location && window.location.origin && window.location.origin !== "null") {
        agregarUnico(lista,new URL("/api/ia",window.location.origin).toString());
      }
    } catch(error) {}

    return lista;
  }

  function errorReintentable(error){
    return Boolean(error && (
      error.reintentarProxy === true ||
      error.message === "Failed to fetch" ||
      /HTTP\s+(404|405)/i.test(error.message || "") ||
      /no está desplegado|método no permitido/i.test(error.message || "")
    ));
  }

  function llamarUrl(url,payload){
    return fetch(url,{
      method:"POST",
      mode:"cors",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify(payload)
    }).then(function(respuesta){
      return respuesta.text().then(function(cuerpo){
        var data;

        try {
          data = cuerpo ? JSON.parse(cuerpo) : {};
        } catch(errorJson) {
          var errorFormato = new Error(
            respuesta.status === 404 || respuesta.status === 405
              ? "El proxy IA respondió HTTP " + respuesta.status
              : "El proxy IA respondió en un formato no válido."
          );
          errorFormato.reintentarProxy = respuesta.status === 404 || respuesta.status === 405;
          throw errorFormato;
        }

        if (!respuesta.ok || data.ok === false) {
          var errorHttp = new Error(
            data.error || data.message || ("El proxy IA respondió HTTP " + respuesta.status)
          );
          errorHttp.reintentarProxy = respuesta.status === 404 || respuesta.status === 405;
          throw errorHttp;
        }

        if (!texto(data.text)) {
          throw new Error("El proveedor no devolvió texto utilizable.");
        }

        data.proxyUrl = url;
        return data;
      });
    });
  }

  function ejecutarConFallback(payload){
    var urls = urlsProxy();

    function intentar(indice,ultimoError){
      if (indice >= urls.length) {
        throw ultimoError || new Error("No existe un proxy IA disponible.");
      }

      return llamarUrl(urls[indice],payload).catch(function(error){
        if (errorReintentable(error) && indice + 1 < urls.length) {
          return intentar(indice + 1,error);
        }
        throw error;
      });
    }

    return intentar(0,null);
  }

  function guardarResultado(id,ok,latencia,mensaje){
    if (!window.ADFirebaseService) return Promise.resolve(null);
    var coleccion = window.AD_CONFIG && window.AD_CONFIG.colecciones &&
      window.AD_CONFIG.colecciones.ia || "IA";

    return window.ADFirebaseService.guardarDocumento(coleccion,id,{
      ultimaPruebaOk:ok === true,
      ultimaPruebaEn:new Date().toISOString(),
      ultimaLatenciaMs:Number(latencia || 0),
      ultimoError:texto(mensaje),
      actualizadoPor:window.AD_CONFIG && window.AD_CONFIG.administrador || "administrador"
    },{ merge:true });
  }

  function registrarLog(id,ok,latencia,mensaje,proxyUrl){
    var coleccion = window.AD_CONFIG && window.AD_CONFIG.colecciones &&
      window.AD_CONFIG.colecciones.logs;

    if (!coleccion || !window.ADFirebaseService) return Promise.resolve(null);

    return window.ADFirebaseService.agregarDocumento(coleccion,{
      accion:"ADMIN_IA_PROBADA",
      modulo:"ia_administrador",
      origen:"administrador",
      estado:ok ? "OK" : "ERROR",
      detalle:{
        proveedorId:id,
        ok:ok === true,
        latenciaMs:Number(latencia || 0),
        error:texto(mensaje),
        proxyUrl:texto(proxyUrl),
        metodo:"pages-function-fallback"
      },
      administrador:window.AD_CONFIG && window.AD_CONFIG.administrador || "administrador",
      fecha:new Date().toISOString()
    }).catch(function(){ return null; });
  }

  function promptPrueba(){
    return [
      "Responde únicamente JSON válido.",
      "Genera exactamente tres títulos académicos de 15 a 25 palabras sobre mejora del aprendizaje mediante tecnología.",
      '{"sugerencias":[{"titulo":"..."},{"titulo":"..."},{"titulo":"..."}]}'
    ].join("\n");
  }

  function instalar(){
    var servicio = window.ADIAService;

    if (!servicio) {
      intentosInstalacion += 1;
      if (intentosInstalacion < maxIntentosInstalacion) {
        window.setTimeout(instalar,100);
      }
      return;
    }

    if (servicio.__proxyProduccionInstalado) return;

    servicio.probar = function(id){
      var proveedor;
      var inicio = Date.now();

      return servicio.leer(id).then(function(item){
        if (!item) throw new Error("No se encontró el proveedor.");
        proveedor = item;

        return ejecutarConFallback({
          provider:item,
          prompt:promptPrueba(),
          options:{
            timeoutMs:item.timeoutMs,
            temperatura:item.temperatura,
            maxTokens:item.maxTokens
          }
        });
      }).then(function(resultado){
        var latencia = numero(resultado.latencyMs,Date.now() - inicio);

        return guardarResultado(proveedor.id,true,latencia,"").then(function(){
          return registrarLog(
            proveedor.id,
            true,
            latencia,
            "",
            resultado.proxyUrl
          );
        }).then(function(){
          return {
            ok:true,
            proveedor:proveedor.id,
            nombre:proveedor.nombre,
            latenciaMs:latencia,
            texto:resultado.text,
            proxyUrl:resultado.proxyUrl
          };
        });
      }).catch(function(error){
        var latencia = Date.now() - inicio;
        var mensaje = error && error.message ? error.message : String(error);

        if (!proveedor) throw error;

        return guardarResultado(proveedor.id,false,latencia,mensaje)
          .catch(function(){ return null; })
          .then(function(){
            return registrarLog(proveedor.id,false,latencia,mensaje,"");
          })
          .then(function(){ throw error; });
      });
    };

    servicio.proxyUrl = function(){
      return urlsProxy()[0] || PROXY_PRODUCCION;
    };
    servicio.__proxyProduccionInstalado = true;
    window.AD_IA_PROXY_URL = PROXY_PRODUCCION;
  }

  instalar();
})(window);
