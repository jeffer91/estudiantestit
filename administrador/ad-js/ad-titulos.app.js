/* =========================================================
Archivo: ad-titulos.app.js
Ruta: /administrador/ad-js/ad-titulos.app.js
Función:
- Sustituir las pantallas antiguas Títulos y Devolver título.
- Construir una única pantalla Estudiantes por período.
- Cargar los módulos y estilos de la nueva pantalla.
========================================================= */
(function(window,document){
  "use strict";

  function $(id){return document.getElementById(id)}

  function agregarCss(){
    if(document.getElementById("ad-estudiantes-css"))return;
    var link=document.createElement("link");
    link.id="ad-estudiantes-css";
    link.rel="stylesheet";
    link.href="./ad-css/ad-estudiantes.css?v=1.1.0";
    document.head.appendChild(link);
  }

  function cargarScript(src,id){
    return new Promise(function(resolve,reject){
      if(id&&document.getElementById(id)){resolve();return;}
      var script=document.createElement("script");
      script.src=src;
      script.async=false;
      if(id)script.id=id;
      script.onload=function(){resolve()};
      script.onerror=function(){reject(new Error("No se pudo cargar "+src))};
      document.body.appendChild(script);
    });
  }

  function htmlEstudiantes(){
    return [
      '<div class="ad-section-head">',
      '  <div>',
      '    <p class="ad-eyebrow">Seguimiento</p>',
      '    <h3>Estudiantes</h3>',
      '    <p class="ad-muted">Selecciona un período para consultar a todos sus estudiantes y el estado de sus propuestas.</p>',
      '  </div>',
      '</div>',
      '<div class="ad-card">',
      '  <div class="ad-estudiantes-toolbar">',
      '    <label class="ad-periodo-selector">',
      '      <span>Período</span>',
      '      <select id="ad-estudiantes-periodo"><option value="">Cargando períodos...</option></select>',
      '    </label>',
      '    <div class="ad-estudiantes-resumen" aria-live="polite">',
      '      <span>Total <strong id="ad-estudiantes-total">0</strong></span>',
      '      <span>Enviaron <strong id="ad-estudiantes-enviaron">0</strong></span>',
      '      <span>No enviaron <strong id="ad-estudiantes-no-enviaron">0</strong></span>',
      '      <span>Devueltos <strong id="ad-estudiantes-devueltos">0</strong></span>',
      '    </div>',
      '  </div>',
      '  <div id="ad-estado-estudiantes" class="ad-status-box">Selecciona un período para cargar estudiantes.</div>',
      '  <div class="ad-table-wrap">',
      '    <table class="ad-table ad-tabla-estudiantes">',
      '      <thead><tr><th>Cédula</th><th>Nombre</th><th>Carrera</th><th>Estado</th><th>Ver más</th></tr></thead>',
      '      <tbody id="ad-tabla-estudiantes"><tr><td colspan="5" class="ad-empty">Sin estudiantes cargados.</td></tr></tbody>',
      '    </table>',
      '  </div>',
      '</div>'
    ].join("");
  }

  function agregarModal(){
    if($("ad-estudiante-modal"))return;
    var modal=document.createElement("section");
    modal.className="ad-modal";
    modal.id="ad-estudiante-modal";
    modal.hidden=true;
    modal.setAttribute("role","dialog");
    modal.setAttribute("aria-modal","true");
    modal.setAttribute("aria-labelledby","ad-estudiante-modal-titulo");
    modal.innerHTML=[
      '<div class="ad-modal-backdrop" data-ad-modal-cerrar></div>',
      '<div class="ad-modal-card">',
      '  <header class="ad-modal-header">',
      '    <div>',
      '      <p class="ad-eyebrow">Detalle del estudiante</p>',
      '      <h3 id="ad-estudiante-modal-titulo">Información</h3>',
      '      <p id="ad-estudiante-modal-subtitulo" class="ad-muted"></p>',
      '    </div>',
      '    <button class="ad-icon-btn" type="button" data-ad-modal-cerrar aria-label="Cerrar">×</button>',
      '  </header>',
      '  <div class="ad-modal-body" id="ad-estudiante-modal-contenido"></div>',
      '  <footer class="ad-modal-footer"><button class="ad-btn ad-btn-secondary" type="button" data-ad-modal-cerrar>Cerrar</button></footer>',
      '</div>'
    ].join("");
    document.body.appendChild(modal);
  }

  function mostrarVista(id){
    document.querySelectorAll("[data-ad-view]").forEach(function(vista){
      var activa=vista.id===id;
      vista.hidden=!activa;
      vista.classList.toggle("is-active",activa);
    });
    document.querySelectorAll("[data-ad-view-target]").forEach(function(enlace){
      var activo=enlace.getAttribute("data-ad-view-target")===id;
      enlace.classList.toggle("is-active",activo);
      if(activo)enlace.setAttribute("aria-current","page");
      else enlace.removeAttribute("aria-current");
    });
    window.dispatchEvent(new CustomEvent("ad:vista-cambiada",{detail:{id:id}}));
  }

  function instalarNavegacion(){
    document.addEventListener("click",function(evento){
      var enlace=evento.target&&evento.target.closest?evento.target.closest("[data-ad-view-target]"):null;
      if(!enlace)return;
      evento.preventDefault();
      evento.stopImmediatePropagation();
      mostrarVista(enlace.getAttribute("data-ad-view-target"));
    },true);
  }

  function transformar(){
    var enlaceTitulos=document.querySelector('[data-ad-view-target="ad-seccion-titulos"]');
    var seccionTitulos=$("ad-seccion-titulos");
    var enlaceDevolver=document.querySelector('[data-ad-view-target="ad-seccion-devolver"]');
    var seccionDevolver=$("ad-seccion-devolver");
    var tituloPrincipal=document.querySelector(".ad-header h2");
    var descripcionPrincipal=document.querySelector(".ad-header .ad-muted");

    if(enlaceTitulos){
      enlaceTitulos.textContent="Estudiantes";
      enlaceTitulos.setAttribute("href","#ad-seccion-estudiantes");
      enlaceTitulos.setAttribute("data-ad-view-target","ad-seccion-estudiantes");
    }

    if(seccionTitulos){
      seccionTitulos.id="ad-seccion-estudiantes";
      seccionTitulos.classList.remove("ad-danger-zone");
      seccionTitulos.innerHTML=htmlEstudiantes();
    }

    if(enlaceDevolver)enlaceDevolver.remove();
    if(seccionDevolver)seccionDevolver.remove();

    if(tituloPrincipal)tituloPrincipal.textContent="Administrador de titulación";
    if(descripcionPrincipal)descripcionPrincipal.textContent="Gestión de períodos, coordinadores, carreras, estudiantes y diagnóstico de conexiones.";

    var badge=$("ad-badge-version");
    var footer=$("ad-footer-version");
    if(badge)badge.textContent="v1.1.0";
    if(footer)footer.textContent="Versión 1.1.0";

    agregarCss();
    agregarModal();
    instalarNavegacion();
  }

  transformar();

  cargarScript("./ad-js/ad-estudiantes.service.js?v=1.1.0","ad-estudiantes-service-script")
    .then(function(){return cargarScript("./ad-js/ad-estudiantes.runtime.js?v=1.1.0","ad-estudiantes-runtime-script")})
    .catch(function(error){
      var estado=$("ad-estado-estudiantes");
      if(estado){
        estado.classList.add("is-error");
        estado.textContent=error.message||String(error);
      }
    });

  window.ADTitulosApp={mostrarVista:mostrarVista,transformar:transformar};
})(window,document);
