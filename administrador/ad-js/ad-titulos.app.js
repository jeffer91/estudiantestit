/* =========================================================
Archivo: ad-titulos.app.js
Ruta: /administrador/ad-js/ad-titulos.app.js
Función:
- Sustituir las pantallas antiguas Títulos y Devolver título.
- Construir una única pantalla Estudiantes por período.
- Agregar filtros, buscador y acciones administrativas.
- Integrar la administración central de proveedores IA.
- Coordinar períodos, estadísticas y reparación segura.
========================================================= */
(function(window,document){
  "use strict";

  if (window.AD_CONFIG) {
    window.AD_CONFIG.version = "1.7.0";
    window.AD_CONFIG.accionesLog = window.AD_CONFIG.accionesLog || {};
    window.AD_CONFIG.accionesLog.periodoActivado =
      window.AD_CONFIG.accionesLog.periodoActivado || "ADMIN_PERIODO_ACTIVADO";
    window.AD_CONFIG.accionesLog.periodoDesactivado =
      window.AD_CONFIG.accionesLog.periodoDesactivado || "ADMIN_PERIODO_DESACTIVADO";
    window.AD_CONFIG.accionesLog.baseAnalizada =
      window.AD_CONFIG.accionesLog.baseAnalizada || "ADMIN_BASE_ANALIZADA";
    window.AD_CONFIG.accionesLog.tituloNormalizado =
      window.AD_CONFIG.accionesLog.tituloNormalizado || "ADMIN_TITULO_NORMALIZADO";
    window.AD_CONFIG.accionesLog.duplicadoDetectado =
      window.AD_CONFIG.accionesLog.duplicadoDetectado || "ADMIN_DUPLICADO_DETECTADO";
    window.AD_CONFIG.accionesLog.titulosDevueltos =
      window.AD_CONFIG.accionesLog.titulosDevueltos || "ADMIN_TITULOS_DEVUELTOS";
    window.AD_CONFIG.accionesLog.titulosEliminados =
      window.AD_CONFIG.accionesLog.titulosEliminados || "ADMIN_TITULOS_ELIMINADOS";
    window.AD_CONFIG.accionesLog.iaCreada =
      window.AD_CONFIG.accionesLog.iaCreada || "ADMIN_IA_CREADA";
    window.AD_CONFIG.accionesLog.iaActualizada =
      window.AD_CONFIG.accionesLog.iaActualizada || "ADMIN_IA_ACTUALIZADA";
    window.AD_CONFIG.accionesLog.iaProbada =
      window.AD_CONFIG.accionesLog.iaProbada || "ADMIN_IA_PROBADA";
  }

  var APP_VERSION = window.AD_CONFIG && window.AD_CONFIG.version
    ? String(window.AD_CONFIG.version)
    : "1.7.0";

  function $(id){ return document.getElementById(id); }

  function agregarCssArchivo(id,ruta){
    if (document.getElementById(id)) return;
    var link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = ruta + "?v=" + encodeURIComponent(APP_VERSION);
    document.head.appendChild(link);
  }

  function agregarCss(){
    agregarCssArchivo("ad-estudiantes-css","./ad-css/ad-estudiantes.css");
    agregarCssArchivo("ad-estadisticas-css","./ad-css/ad-estadisticas.css");
    agregarCssArchivo("ad-reparar-css","./ad-css/ad-reparar.css");
    agregarCssArchivo("ad-ia-css","./ad-css/ad-ia.css");
  }

  function cargarScript(src,id){
    return new Promise(function(resolve,reject){
      if (id && document.getElementById(id)) {
        resolve();
        return;
      }
      var script = document.createElement("script");
      script.src = src;
      script.async = false;
      if (id) script.id = id;
      script.onload = function(){ resolve(); };
      script.onerror = function(){ reject(new Error("No se pudo cargar " + src)); };
      document.body.appendChild(script);
    });
  }

  function htmlEstudiantes(){
    return [
      '<div class="ad-section-head">',
      '  <div>',
      '    <p class="ad-eyebrow">Seguimiento</p>',
      '    <h3>Estudiantes</h3>',
      '    <p class="ad-muted">Selecciona un período y utiliza los filtros para consultar el estado de las propuestas.</p>',
      '  </div>',
      '</div>',
      '<div class="ad-card">',
      '  <div class="ad-estudiantes-filtros">',
      '    <label>',
      '      <span>Período</span>',
      '      <select id="ad-estudiantes-periodo"><option value="">Cargando períodos...</option></select>',
      '    </label>',
      '    <label>',
      '      <span>Carrera</span>',
      '      <select id="ad-estudiantes-carrera"><option value="">Todas las carreras</option></select>',
      '    </label>',
      '    <label>',
      '      <span>Estado</span>',
      '      <select id="ad-estudiantes-estado">',
      '        <option value="">Todos los estados</option>',
      '        <option value="NO_ENVIO">No envió</option>',
      '        <option value="ENVIADO">Envió</option>',
      '        <option value="DEVUELTO">Devuelto</option>',
      '        <option value="APROBADO">Aprobado</option>',
      '      </select>',
      '    </label>',
      '    <label class="ad-estudiantes-buscador">',
      '      <span>Buscar estudiante</span>',
      '      <input id="ad-estudiantes-busqueda" type="search" placeholder="Cédula, nombre o carrera" autocomplete="off">',
      '    </label>',
      '  </div>',
      '  <div class="ad-estudiantes-resumen" aria-live="polite">',
      '    <span>Total <strong id="ad-estudiantes-total">0</strong></span>',
      '    <span>Enviaron <strong id="ad-estudiantes-enviaron">0</strong></span>',
      '    <span>No enviaron <strong id="ad-estudiantes-no-enviaron">0</strong></span>',
      '    <span>Devueltos <strong id="ad-estudiantes-devueltos">0</strong></span>',
      '  </div>',
      '  <div id="ad-estado-estudiantes" class="ad-status-box">Selecciona un período para cargar estudiantes.</div>',
      '  <div class="ad-table-wrap">',
      '    <table class="ad-table ad-tabla-estudiantes">',
      '      <thead><tr><th>Cédula</th><th>Nombre</th><th>Carrera</th><th>Estado</th><th>WhatsApp</th><th>Ver más</th></tr></thead>',
      '      <tbody id="ad-tabla-estudiantes"><tr><td colspan="6" class="ad-empty">Sin estudiantes cargados.</td></tr></tbody>',
      '    </table>',
      '  </div>',
      '</div>'
    ].join("");
  }

  function agregarModal(){
    if ($("ad-estudiante-modal")) return;
    var modal = document.createElement("section");
    modal.className = "ad-modal";
    modal.id = "ad-estudiante-modal";
    modal.hidden = true;
    modal.setAttribute("role","dialog");
    modal.setAttribute("aria-modal","true");
    modal.setAttribute("aria-labelledby","ad-estudiante-modal-titulo");
    modal.innerHTML = [
      '<div class="ad-modal-backdrop" data-ad-modal-cerrar></div>',
      '<div class="ad-modal-card">',
      '  <header class="ad-modal-header">',
      '    <div><p class="ad-eyebrow">Detalle del estudiante</p><h3 id="ad-estudiante-modal-titulo">Información</h3><p id="ad-estudiante-modal-subtitulo" class="ad-muted"></p></div>',
      '    <button class="ad-icon-btn" type="button" data-ad-modal-cerrar aria-label="Cerrar">×</button>',
      '  </header>',
      '  <div class="ad-modal-body" id="ad-estudiante-modal-contenido"></div>',
      '  <footer class="ad-modal-footer"><button class="ad-btn ad-btn-secondary" type="button" data-ad-modal-cerrar>Cerrar</button></footer>',
      '</div>'
    ].join("");
    document.body.appendChild(modal);
  }

  function agregarSeccionIA(){
    var nav = document.querySelector(".ad-nav");
    var referenciaNav = document.querySelector('[data-ad-view-target="ad-seccion-reparar"]') ||
      document.querySelector('[data-ad-view-target="ad-seccion-diagnostico"]');
    var enlace;
    var referenciaSeccion = $("ad-seccion-reparar") || $("ad-seccion-diagnostico") || $("ad-seccion-logs");
    var seccion;

    if (nav && !document.querySelector('[data-ad-view-target="ad-seccion-ia"]')) {
      enlace = document.createElement("a");
      enlace.href = "#ad-seccion-ia";
      enlace.setAttribute("data-ad-view-target","ad-seccion-ia");
      enlace.textContent = "IA";
      if (referenciaNav && referenciaNav.parentNode === nav) nav.insertBefore(enlace,referenciaNav);
      else nav.appendChild(enlace);
    }

    if (!$("ad-seccion-ia")) {
      seccion = document.createElement("section");
      seccion.className = "ad-section ad-view";
      seccion.id = "ad-seccion-ia";
      seccion.hidden = true;
      seccion.setAttribute("data-ad-view","");
      seccion.innerHTML = '<div class="ad-card"><div class="ad-empty">Cargando módulo IA...</div></div>';
      if (referenciaSeccion && referenciaSeccion.parentNode) referenciaSeccion.parentNode.insertBefore(seccion,referenciaSeccion);
      else {
        var main = document.querySelector(".ad-main");
        if (main) main.appendChild(seccion);
      }
    }
  }

  function activarModuloVista(id){
    window.setTimeout(function(){
      if (id === "ad-seccion-carreras" && window.ADCoordinadoresApp && typeof window.ADCoordinadoresApp.cargarDatosCarreras === "function") {
        window.ADCoordinadoresApp.cargarDatosCarreras(false).catch(function(){});
      }
      if (id === "ad-seccion-estudiantes" && window.ADEstudiantesRuntime && typeof window.ADEstudiantesRuntime.cargarPeriodos === "function") {
        var selector = $("ad-estudiantes-periodo");
        if (!selector || !selector.options || selector.options.length <= 1) window.ADEstudiantesRuntime.cargarPeriodos();
      }
      if (id === "ad-seccion-periodos" && window.ADPeriodosApp && typeof window.ADPeriodosApp.cargarPeriodos === "function") {
        window.ADPeriodosApp.cargarPeriodos();
      }
      if (id === "ad-seccion-estadisticas" && window.ADEstadisticasApp && typeof window.ADEstadisticasApp.cargarPeriodos === "function") {
        var selectorStats = $("ad-estadisticas-periodo");
        if (!selectorStats || !selectorStats.options || selectorStats.options.length <= 1) window.ADEstadisticasApp.cargarPeriodos();
      }
      if (id === "ad-seccion-ia" && window.ADIAApp) {
        if (typeof window.ADIAApp.instalar === "function") window.ADIAApp.instalar();
        else if (typeof window.ADIAApp.cargar === "function") window.ADIAApp.cargar();
      }
      if (id === "ad-seccion-reparar" && window.ADRepararApp && typeof window.ADRepararApp.instalarNormalizador === "function") {
        window.ADRepararApp.instalarNormalizador();
      }
    },0);
  }

  function mostrarVista(id){
    document.querySelectorAll("[data-ad-view]").forEach(function(vista){
      var activa = vista.id === id;
      vista.hidden = !activa;
      vista.classList.toggle("is-active",activa);
    });
    document.querySelectorAll("[data-ad-view-target]").forEach(function(enlace){
      var activo = enlace.getAttribute("data-ad-view-target") === id;
      enlace.classList.toggle("is-active",activo);
      if (activo) enlace.setAttribute("aria-current","page");
      else enlace.removeAttribute("aria-current");
    });
    window.dispatchEvent(new CustomEvent("ad:vista-cambiada",{ detail:{ id:id } }));
    activarModuloVista(id);
  }

  function instalarNavegacion(){
    document.addEventListener("click",function(evento){
      var enlace = evento.target && evento.target.closest ? evento.target.closest("[data-ad-view-target]") : null;
      if (!enlace) return;
      evento.preventDefault();
      mostrarVista(enlace.getAttribute("data-ad-view-target"));
    },true);
  }

  function transformar(){
    var enlaceTitulos = document.querySelector('[data-ad-view-target="ad-seccion-titulos"]');
    var seccionTitulos = $("ad-seccion-titulos");
    var enlaceDevolver = document.querySelector('[data-ad-view-target="ad-seccion-devolver"]');
    var seccionDevolver = $("ad-seccion-devolver");
    var tituloPrincipal = document.querySelector(".ad-header h2");
    var descripcionPrincipal = document.querySelector(".ad-header .ad-muted");

    if (enlaceTitulos) {
      enlaceTitulos.textContent = "Estudiantes";
      enlaceTitulos.setAttribute("href","#ad-seccion-estudiantes");
      enlaceTitulos.setAttribute("data-ad-view-target","ad-seccion-estudiantes");
    }
    if (seccionTitulos) {
      seccionTitulos.id = "ad-seccion-estudiantes";
      seccionTitulos.classList.remove("ad-danger-zone");
      seccionTitulos.innerHTML = htmlEstudiantes();
    }
    if (enlaceDevolver) enlaceDevolver.remove();
    if (seccionDevolver) seccionDevolver.remove();

    agregarSeccionIA();

    if (tituloPrincipal) tituloPrincipal.textContent = "Administrador de titulación";
    if (descripcionPrincipal) descripcionPrincipal.textContent = "Gestión de períodos, coordinadores, carreras, estudiantes, IA, estadísticas y diagnóstico de conexiones.";
    if ($("ad-badge-version")) $("ad-badge-version").textContent = "v" + APP_VERSION;
    if ($("ad-footer-version")) $("ad-footer-version").textContent = "Versión " + APP_VERSION;

    agregarCss();
    agregarModal();
    instalarNavegacion();

    if (window.location.hash === "#ad-seccion-ia") {
      window.setTimeout(function(){ mostrarVista("ad-seccion-ia"); },0);
    }
  }

  transformar();

  cargarScript("./ad-js/ad-periodos.app.js?v=" + encodeURIComponent(APP_VERSION),"ad-periodos-app-script")
    .catch(function(error){
      var seccion = $("ad-seccion-periodos");
      if (seccion) seccion.innerHTML = '<div class="ad-card"><div class="ad-empty">' + (error.message || String(error)) + '</div></div>';
    });

  cargarScript("./ad-js/ad-base-repair.service.js?v=" + encodeURIComponent(APP_VERSION),"ad-base-repair-service-script")
    .then(function(){
      if (window.ADRepararApp && typeof window.ADRepararApp.instalarNormalizador === "function") window.ADRepararApp.instalarNormalizador();
    })
    .catch(function(error){ console.error("No se pudo cargar el analizador de base:",error); });

  cargarScript("./ad-js/ad-estudiantes.service.js?v=" + encodeURIComponent(APP_VERSION),"ad-estudiantes-service-script")
    .then(function(){
      return cargarScript("./ad-js/ad-estudiantes.actions.service.js?v=" + encodeURIComponent(APP_VERSION),"ad-estudiantes-actions-script");
    })
    .then(function(){
      return cargarScript("./ad-js/ad-estudiantes.runtime.js?v=" + encodeURIComponent(APP_VERSION),"ad-estudiantes-runtime-script");
    })
    .then(function(){
      return cargarScript("./ad-js/ad-estadisticas.app.js?v=" + encodeURIComponent(APP_VERSION),"ad-estadisticas-app-script");
    })
    .catch(function(error){
      var estado = $("ad-estado-estudiantes");
      if (estado) {
        estado.classList.add("is-error");
        estado.textContent = error.message || String(error);
      }
    });

  cargarScript("./ad-js/ad-ia.service.js?v=" + encodeURIComponent(APP_VERSION),"ad-ia-service-script")
    .then(function(){
      return cargarScript("./ad-js/ad-ia.app.js?v=" + encodeURIComponent(APP_VERSION),"ad-ia-app-script");
    })
    .catch(function(error){
      var seccion = $("ad-seccion-ia");
      if (seccion) {
        seccion.innerHTML = '<div class="ad-card"><div class="ad-empty">No se pudo cargar el módulo IA: ' +
          (error.message || String(error)) + '</div></div>';
      }
    });

  window.ADTitulosApp = {
    mostrarVista:mostrarVista,
    transformar:transformar,
    activarModuloVista:activarModuloVista
  };
})(window,document);
