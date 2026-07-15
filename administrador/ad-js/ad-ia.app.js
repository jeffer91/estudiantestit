/* =========================================================
Archivo: ad-ia.app.js
Ruta: /administrador/ad-js/ad-ia.app.js
Función:
- Construir y controlar la sección IA del administrador.
- Listar, agregar, editar, activar y desactivar proveedores.
- Crear el catálogo inicial de 10 opciones.
- Probar una IA o todas las IA activas.
========================================================= */

(function(window,document){
  "use strict";

  var estado = {
    proveedores:[],
    cargando:false,
    inicializado:false
  };

  function servicio(){
    if (!window.ADIAService) throw new Error("ADIAService no está disponible.");
    return window.ADIAService;
  }
  function $(id){ return document.getElementById(id); }
  function texto(v){ return String(v === null || v === undefined ? "" : v).trim(); }
  function escapar(v){
    return texto(v)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
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
    return mapa[texto(id).toLowerCase()] || 999;
  }

  function fecha(v){
    if (!v) return "Sin prueba";
    try {
      var d = new Date(v);
      return Number.isNaN(d.getTime()) ? texto(v) : d.toLocaleString("es-EC");
    } catch(error) {
      return texto(v);
    }
  }
  function setEstado(mensaje,tipo){
    var box = $("ad-ia-estado");
    if (!box) return;
    box.className = "ad-status-box";
    if (tipo === "error") box.classList.add("is-error");
    if (tipo === "success") box.classList.add("is-success");
    if (tipo === "warning") box.classList.add("is-warning");
    box.textContent = mensaje || "";
  }
  function setCargando(valor,mensaje){
    estado.cargando = valor === true;
    var botones = document.querySelectorAll("#ad-seccion-ia button");
    botones.forEach(function(btn){ btn.disabled = estado.cargando; });
    if (mensaje) setEstado(mensaje,"info");
  }

  function htmlBase(){
    return [
      '<div class="ad-section-head">',
      '  <div>',
      '    <p class="ad-eyebrow">Configuración central</p>',
      '    <h3>IA</h3>',
      '    <p class="ad-muted">Administra los proveedores que utiliza la pantalla de estudiantes. El estudiante solo recibe el resultado final.</p>',
      '  </div>',
      '</div>',
      '<div class="ad-card">',
      '  <div class="ad-ia-toolbar">',
      '    <div class="ad-ia-toolbar__buttons">',
      '      <button class="ad-btn ad-btn-primary" id="ad-ia-agregar" type="button">Agregar IA</button>',
      '      <button class="ad-btn ad-btn-secondary" id="ad-ia-catalogo" type="button">Cargar catálogo de 10</button>',
      '      <button class="ad-btn ad-btn-secondary" id="ad-ia-probar-todas" type="button">Probar todas las activas</button>',
      '      <button class="ad-btn ad-btn-secondary" id="ad-ia-recargar" type="button">Recargar</button>',
      '    </div>',
      '  </div>',
      '  <div class="ad-ia-summary">',
      '    <span>Total <strong id="ad-ia-total">0</strong></span>',
      '    <span>Activas <strong id="ad-ia-activas">0</strong></span>',
      '    <span>Con clave <strong id="ad-ia-con-clave">0</strong></span>',
      '    <span>Prueba correcta <strong id="ad-ia-pruebas-ok">0</strong></span>',
      '  </div>',
      '  <div class="ad-ia-warning">',
      '    Las claves se conservan cuando editas y dejas el campo vacío. Los modelos gratuitos pueden cambiar; por eso endpoint y modelo quedan editables.',
      '  </div>',
      '  <div id="ad-ia-estado" class="ad-status-box">Cargando proveedores IA...</div>',
      '  <div class="ad-table-wrap">',
      '    <table class="ad-table ad-ia-table">',
      '      <thead><tr><th>Prioridad</th><th>Proveedor</th><th>Tipo</th><th>Modelo</th><th>Estado</th><th>Última prueba</th><th>Acciones</th></tr></thead>',
      '      <tbody id="ad-ia-tabla"><tr><td colspan="7" class="ad-empty">Cargando...</td></tr></tbody>',
      '    </table>',
      '  </div>',
      '  <div id="ad-ia-pruebas-lista" class="ad-ia-test-all"></div>',
      '</div>',
      '<div class="ad-card ad-ia-form-card" id="ad-ia-form-card" hidden>',
      '  <div class="ad-ia-form-head">',
      '    <div><p class="ad-eyebrow">Proveedor</p><h4 id="ad-ia-form-titulo">Agregar IA</h4></div>',
      '    <button class="ad-icon-btn" type="button" id="ad-ia-form-cerrar" aria-label="Cerrar">×</button>',
      '  </div>',
      '  <form id="ad-ia-form">',
      '    <div class="ad-ia-form-grid">',
      '      <label>ID del proveedor<input id="ad-ia-id" type="text" placeholder="ejemplo_proveedor" required></label>',
      '      <label>Nombre visible<input id="ad-ia-nombre" type="text" placeholder="Nombre de la IA" required></label>',
      '      <label>Tipo<select id="ad-ia-tipo" required>',
      '        <option value="openai-compatible">OpenAI compatible</option>',
      '        <option value="gemini">Gemini</option>',
      '        <option value="cloudflare">Cloudflare</option>',
      '        <option value="generic">Genérico</option>',
      '      </select></label>',
      '      <label class="ad-ia-field-double">Endpoint<input id="ad-ia-endpoint" type="url" placeholder="https://..."></label>',
      '      <label>Modelo<input id="ad-ia-modelo" type="text" placeholder="modelo-gratuito"></label>',
      '      <label>Prioridad<input id="ad-ia-prioridad" type="number" min="1" max="999" value="10"></label>',
      '      <label>Tiempo máximo (ms)<input id="ad-ia-timeout" type="number" min="5000" step="1000" value="45000"></label>',
      '      <label>Máximo de tokens<input id="ad-ia-max-tokens" type="number" min="100" step="50" value="900"></label>',
      '      <label>Temperatura<input id="ad-ia-temperatura" type="number" min="0" max="2" step="0.1" value="0.4"></label>',
      '      <label class="ad-ia-field-double">API key o token<input id="ad-ia-api-key" type="password" autocomplete="new-password" placeholder="Dejar vacío para conservar la clave actual"></label>',
      '      <label class="ad-ia-check"><input id="ad-ia-activo" type="checkbox"><span>Proveedor activo</span></label>',
      '      <label class="ad-ia-field-full">Descripción<textarea id="ad-ia-descripcion" placeholder="Uso o nota del proveedor"></textarea></label>',
      '    </div>',
      '    <div class="ad-ia-actions">',
      '      <button class="ad-btn ad-btn-primary" type="submit">Guardar proveedor</button>',
      '      <button class="ad-btn ad-btn-secondary" type="button" id="ad-ia-form-probar">Guardar y probar</button>',
      '      <button class="ad-btn ad-btn-secondary" type="button" id="ad-ia-form-limpiar">Limpiar</button>',
      '    </div>',
      '  </form>',
      '</div>'
    ].join("");
  }

  function instalar(){
    var seccion = $("ad-seccion-ia");
    if (!seccion) return;
    if (!estado.inicializado) {
      seccion.innerHTML = htmlBase();
      conectarEventos();
      estado.inicializado = true;
    }
    cargar();
  }

  function conectarEventos(){
    $("ad-ia-agregar").addEventListener("click",function(){ abrirFormulario(null); });
    $("ad-ia-catalogo").addEventListener("click",crearCatalogo);
    $("ad-ia-probar-todas").addEventListener("click",probarTodas);
    $("ad-ia-recargar").addEventListener("click",cargar);
    $("ad-ia-form-cerrar").addEventListener("click",cerrarFormulario);
    $("ad-ia-form-limpiar").addEventListener("click",function(){ abrirFormulario(null); });
    $("ad-ia-form-probar").addEventListener("click",guardarYProbar);
    $("ad-ia-form").addEventListener("submit",function(evento){
      evento.preventDefault();
      guardarFormulario(false);
    });
    $("ad-ia-tabla").addEventListener("click",manejarAccionFila);
  }

  function cargar(forzar){
    var mantenerBloqueo = estado.cargando;
    if (estado.cargando && forzar !== true) return Promise.resolve();
    if (!mantenerBloqueo) setCargando(true,"Leyendo proveedores IA desde Firebase...");
    return servicio().listar().then(function(lista){
      estado.proveedores = (lista || []).map(function(proveedor){
        if (Number(proveedor.prioridad || 999) >= 999) {
          proveedor.prioridad = prioridadFallback(proveedor.id);
        }
        return proveedor;
      }).sort(function(a,b){
        return Number(a.prioridad || 999) - Number(b.prioridad || 999);
      });
      pintar();
      setEstado(
        estado.proveedores.length
          ? "Proveedores cargados correctamente."
          : "No hay proveedores. Presiona “Cargar catálogo de 10”.",
        estado.proveedores.length ? "success" : "warning"
      );
    }).catch(function(error){
      setEstado(error.message || String(error),"error");
      pintarVacio("No fue posible cargar los proveedores.");
    }).then(function(){
      if (!mantenerBloqueo) setCargando(false);
    });
  }

  function pintar(){
    var total = estado.proveedores.length;
    var activas = estado.proveedores.filter(function(p){ return p.activo; }).length;
    var conClave = estado.proveedores.filter(function(p){ return Boolean(p.apiKey || p.key); }).length;
    var pruebasOk = estado.proveedores.filter(function(p){ return p.ultimaPruebaOk; }).length;
    $("ad-ia-total").textContent = String(total);
    $("ad-ia-activas").textContent = String(activas);
    $("ad-ia-con-clave").textContent = String(conClave);
    $("ad-ia-pruebas-ok").textContent = String(pruebasOk);

    if (!total) {
      pintarVacio("No hay proveedores configurados.");
      return;
    }

    $("ad-ia-tabla").innerHTML = estado.proveedores.map(function(p){
      var pruebaClase = p.ultimaPruebaEn ? (p.ultimaPruebaOk ? "is-ok" : "is-error") : "";
      var pruebaTexto = p.ultimaPruebaEn
        ? (p.ultimaPruebaOk ? "Correcta" : "Error")
        : "Sin prueba";
      var latencia = p.ultimaLatenciaMs ? p.ultimaLatenciaMs + " ms" : "";
      return [
        '<tr>',
        '  <td><strong>' + escapar(p.prioridad) + '</strong></td>',
        '  <td><div class="ad-ia-name"><strong>' + escapar(p.nombre) + '</strong><small>' + escapar(p.id) + '</small></div></td>',
        '  <td>' + escapar(p.tipo) + '</td>',
        '  <td><div class="ad-ia-model"><strong>' + escapar(p.modelo || "Sin modelo") + '</strong><small>' + escapar(p.endpoint || "Endpoint automático") + '</small></div></td>',
        '  <td><span class="ad-ia-status ' + (p.activo ? "is-active" : "is-inactive") + '">' + (p.activo ? "Activa" : "Inactiva") + '</span></td>',
        '  <td><div class="ad-ia-test ' + pruebaClase + '"><strong>' + escapar(pruebaTexto) + '</strong><span>' + escapar(latencia || fecha(p.ultimaPruebaEn)) + '</span></div></td>',
        '  <td><div class="ad-ia-row-actions">',
        '    <button class="ad-btn ad-btn-secondary" type="button" data-ia-accion="editar" data-ia-id="' + escapar(p.id) + '">Editar</button>',
        '    <button class="ad-btn ad-btn-secondary" type="button" data-ia-accion="probar" data-ia-id="' + escapar(p.id) + '">Probar</button>',
        '    <button class="ad-btn ' + (p.activo ? "ad-btn-danger" : "ad-btn-primary") + '" type="button" data-ia-accion="estado" data-ia-id="' + escapar(p.id) + '" data-ia-activo="' + (p.activo ? "false" : "true") + '">' + (p.activo ? "Desactivar" : "Activar") + '</button>',
        '  </div></td>',
        '</tr>'
      ].join("");
    }).join("");
  }

  function pintarVacio(mensaje){
    $("ad-ia-tabla").innerHTML = '<tr><td colspan="7" class="ad-empty">' + escapar(mensaje) + '</td></tr>';
  }

  function manejarAccionFila(evento){
    var boton = evento.target && evento.target.closest ? evento.target.closest("[data-ia-accion]") : null;
    if (!boton || estado.cargando) return;
    var id = boton.getAttribute("data-ia-id");
    var accion = boton.getAttribute("data-ia-accion");
    var proveedor = estado.proveedores.find(function(item){ return item.id === id; });
    if (accion === "editar") abrirFormulario(proveedor);
    if (accion === "probar") probarUno(id);
    if (accion === "estado") cambiarEstado(id,boton.getAttribute("data-ia-activo") === "true");
  }

  function abrirFormulario(proveedor){
    var existe = Boolean(proveedor && proveedor.id);
    $("ad-ia-form-card").hidden = false;
    $("ad-ia-form-titulo").textContent = existe ? "Editar " + proveedor.nombre : "Agregar IA";
    $("ad-ia-id").value = existe ? proveedor.id : "";
    $("ad-ia-id").readOnly = existe;
    $("ad-ia-nombre").value = existe ? proveedor.nombre : "";
    $("ad-ia-tipo").value = existe ? proveedor.tipo : "openai-compatible";
    $("ad-ia-endpoint").value = existe ? proveedor.endpoint : "";
    $("ad-ia-modelo").value = existe ? proveedor.modelo : "";
    $("ad-ia-prioridad").value = existe ? proveedor.prioridad : siguientePrioridad();
    $("ad-ia-timeout").value = existe ? proveedor.timeoutMs : 45000;
    $("ad-ia-max-tokens").value = existe ? proveedor.maxTokens : 900;
    $("ad-ia-temperatura").value = existe ? proveedor.temperatura : 0.4;
    $("ad-ia-api-key").value = "";
    $("ad-ia-activo").checked = existe ? proveedor.activo : false;
    $("ad-ia-descripcion").value = existe ? proveedor.descripcion : "";
    $("ad-ia-form-card").scrollIntoView({ behavior:"smooth", block:"start" });
  }

  function cerrarFormulario(){
    $("ad-ia-form-card").hidden = true;
  }

  function siguientePrioridad(){
    if (!estado.proveedores.length) return 1;
    return Math.max.apply(null,estado.proveedores.map(function(p){ return Number(p.prioridad || 0); })) + 1;
  }

  function datosFormulario(){
    return {
      id:$("ad-ia-id").value,
      nombre:$("ad-ia-nombre").value,
      tipo:$("ad-ia-tipo").value,
      endpoint:$("ad-ia-endpoint").value,
      modelo:$("ad-ia-modelo").value,
      model:$("ad-ia-modelo").value,
      prioridad:Number($("ad-ia-prioridad").value || 999),
      timeoutMs:Number($("ad-ia-timeout").value || 45000),
      maxTokens:Number($("ad-ia-max-tokens").value || 900),
      temperatura:Number($("ad-ia-temperatura").value || 0.4),
      apiKey:$("ad-ia-api-key").value,
      key:$("ad-ia-api-key").value,
      activo:$("ad-ia-activo").checked,
      descripcion:$("ad-ia-descripcion").value
    };
  }

  function guardarFormulario(probarDespues){
    if (estado.cargando) return Promise.resolve();
    setCargando(true,"Guardando proveedor IA...");
    return servicio().guardar(datosFormulario()).then(function(resultado){
      setEstado("Proveedor guardado correctamente.","success");
      cerrarFormulario();
      return cargar(true).then(function(){
        if (probarDespues) return probarUno(resultado.proveedor.id);
        return resultado;
      });
    }).catch(function(error){
      setEstado(error.message || String(error),"error");
      throw error;
    }).then(function(resultado){
      setCargando(false);
      return resultado;
    },function(error){
      setCargando(false);
      return Promise.reject(error);
    });
  }

  function guardarYProbar(){
    guardarFormulario(true).catch(function(){});
  }

  function crearCatalogo(){
    if (estado.cargando) return;
    setCargando(true,"Creando los proveedores faltantes del catálogo...");
    servicio().sembrarCatalogo().then(function(resultado){
      setEstado(
        resultado.totalCreados
          ? "Catálogo actualizado. Proveedores nuevos: " + resultado.totalCreados + "."
          : "Los 10 proveedores del catálogo ya existen.",
        "success"
      );
      return cargar(true);
    }).catch(function(error){
      setEstado(error.message || String(error),"error");
    }).then(function(){
      setCargando(false);
    });
  }

  function cambiarEstado(id,activo){
    if (estado.cargando) return;
    setCargando(true,(activo ? "Activando " : "Desactivando ") + id + "...");
    servicio().cambiarEstado(id,activo).then(function(){
      setEstado("Estado actualizado correctamente.","success");
      return cargar(true);
    }).catch(function(error){
      setEstado(error.message || String(error),"error");
    }).then(function(){
      setCargando(false);
    });
  }

  function probarUno(id){
    if (estado.cargando) return Promise.resolve();
    setCargando(true,"Probando " + id + "...");
    return servicio().probar(id).then(function(resultado){
      setEstado(
        resultado.nombre + " respondió correctamente en " + resultado.latenciaMs + " ms.",
        "success"
      );
      return cargar(true).then(function(){ return resultado; });
    }).catch(function(error){
      setEstado("La prueba de " + id + " falló: " + (error.message || String(error)),"error");
      return cargar(true).then(function(){ throw error; });
    }).then(function(resultado){
      setCargando(false);
      return resultado;
    },function(error){
      setCargando(false);
      return Promise.reject(error);
    });
  }

  function probarTodas(){
    if (estado.cargando) return;
    var activas = estado.proveedores.filter(function(p){ return p.activo; });
    var lista = $("ad-ia-pruebas-lista");
    lista.innerHTML = "";
    if (!activas.length) {
      setEstado("No hay proveedores activos para probar.","warning");
      return;
    }

    setCargando(true,"Probando " + activas.length + " proveedores activos...");
    var resultados = [];
    var cadena = Promise.resolve();

    activas.forEach(function(p){
      cadena = cadena.then(function(){
        agregarResultadoPrueba(p.nombre,"Probando...");
        return servicio().probar(p.id).then(function(resultado){
          resultados.push({ id:p.id, ok:true, latenciaMs:resultado.latenciaMs });
          actualizarResultadoPrueba(p.nombre,"Correcta · " + resultado.latenciaMs + " ms",true);
        }).catch(function(error){
          resultados.push({ id:p.id, ok:false, error:error.message || String(error) });
          actualizarResultadoPrueba(p.nombre,"Error · " + (error.message || String(error)),false);
        });
      });
    });

    cadena.then(function(){
      var correctas = resultados.filter(function(r){ return r.ok; }).length;
      setEstado("Pruebas terminadas: " + correctas + " correctas de " + resultados.length + ".","success");
      return cargar(true);
    }).catch(function(error){
      setEstado(error.message || String(error),"error");
    }).then(function(){
      setCargando(false);
    });
  }

  function claveResultado(nombre){
    return "ad-ia-test-" + texto(nombre).toLowerCase().replace(/[^a-z0-9]+/g,"-");
  }

  function agregarResultadoPrueba(nombre,mensaje){
    var contenedor = $("ad-ia-pruebas-lista");
    var item = document.createElement("div");
    item.className = "ad-ia-test-item";
    item.id = claveResultado(nombre);
    item.innerHTML = "<strong>" + escapar(nombre) + "</strong><span>" + escapar(mensaje) + "</span>";
    contenedor.appendChild(item);
  }

  function actualizarResultadoPrueba(nombre,mensaje,ok){
    var item = $(claveResultado(nombre));
    if (!item) return;
    item.classList.toggle("is-ok",ok === true);
    item.classList.toggle("is-error",ok !== true);
    var span = item.querySelector("span");
    if (span) span.textContent = mensaje;
  }

  window.ADIAApp = {
    instalar:instalar,
    cargar:cargar,
    abrirFormulario:abrirFormulario,
    probarUno:probarUno,
    probarTodas:probarTodas
  };

  instalar();
})(window,document);
