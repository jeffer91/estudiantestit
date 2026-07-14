/* =========================================================
Archivo: ad-estadisticas.app.js
Ruta: /administrador/ad-js/ad-estadisticas.app.js
Función:
- Crear la vista Estadísticas en el menú administrador.
- Calcular totales globales y por carrera para el período seleccionado.
- Usar la misma consolidación de Estudiantes, títulos e historial.
========================================================= */
(function(window,document){
  "use strict";

  var periodos = [];
  var cargando = false;
  var iniciado = false;

  function service(){
    if (!window.ADEstudiantesService) throw new Error("ADEstudiantesService no está disponible.");
    return window.ADEstudiantesService;
  }
  function $(id){ return document.getElementById(id); }
  function texto(v){ return String(v === null || v === undefined ? "" : v).trim(); }
  function normal(v){
    return texto(v)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function esc(v){
    return texto(v)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/\"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }
  function setTexto(id,v){ var el=$(id); if(el) el.textContent=v; }
  function setHtml(id,v){ var el=$(id); if(el) el.innerHTML=v; }
  function porcentaje(valor,total){
    if (!total) return "0,0 %";
    return ((valor * 100) / total).toFixed(1).replace(".",",") + " %";
  }

  function insertarVista(){
    var nav = document.querySelector(".ad-nav");
    var enlaceReparar = document.querySelector('[data-ad-view-target="ad-seccion-reparar"]');
    var seccionReparar = $("ad-seccion-reparar");
    var enlace;
    var seccion;

    if (nav && !document.querySelector('[data-ad-view-target="ad-seccion-estadisticas"]')) {
      enlace = document.createElement("a");
      enlace.href = "#ad-seccion-estadisticas";
      enlace.setAttribute("data-ad-view-target","ad-seccion-estadisticas");
      enlace.textContent = "Estadísticas";
      if (enlaceReparar) nav.insertBefore(enlace,enlaceReparar);
      else nav.appendChild(enlace);
    }

    if (!$("ad-seccion-estadisticas")) {
      seccion = document.createElement("section");
      seccion.className = "ad-section ad-view";
      seccion.id = "ad-seccion-estadisticas";
      seccion.setAttribute("data-ad-view","");
      seccion.hidden = true;
      seccion.innerHTML = [
        '<div class="ad-section-head">',
        '  <div>',
        '    <p class="ad-eyebrow">Seguimiento cuantitativo</p>',
        '    <h3>Estadísticas</h3>',
        '    <p class="ad-muted">Consulta el cumplimiento global y por carrera para el período seleccionado.</p>',
        '  </div>',
        '</div>',
        '<div class="ad-card ad-stats-controls">',
        '  <label><span>Período</span><select id="ad-estadisticas-periodo"><option value="">Cargando períodos...</option></select></label>',
        '  <button class="ad-btn ad-btn-secondary" id="ad-btn-actualizar-estadisticas" type="button">Actualizar</button>',
        '</div>',
        '<div id="ad-estadisticas-estado" class="ad-status-box">Selecciona un período para calcular las estadísticas.</div>',
        '<div class="ad-card">',
        '  <div class="ad-section-head ad-section-head-compact"><div><p class="ad-eyebrow">Resumen</p><h3>Resultado global</h3></div></div>',
        '  <div class="ad-table-wrap">',
        '    <table class="ad-table ad-stats-global"><thead><tr><th>Período</th><th>Total estudiantes</th><th>Enviaron</th><th>Faltan</th><th>Cumplimiento</th></tr></thead>',
        '    <tbody id="ad-estadisticas-global"><tr><td colspan="5" class="ad-empty">Sin datos calculados.</td></tr></tbody></table>',
        '  </div>',
        '</div>',
        '<div class="ad-card">',
        '  <div class="ad-section-head ad-section-head-compact"><div><p class="ad-eyebrow">Detalle</p><h3>Resultados por carrera</h3></div></div>',
        '  <div class="ad-table-wrap">',
        '    <table class="ad-table ad-stats-careers"><thead><tr><th>Carrera</th><th>Total estudiantes</th><th>Enviaron</th><th>Faltan</th><th>Cumplimiento</th></tr></thead>',
        '    <tbody id="ad-estadisticas-carreras"><tr><td colspan="5" class="ad-empty">Sin datos calculados.</td></tr></tbody></table>',
        '  </div>',
        '</div>'
      ].join("");

      if (seccionReparar && seccionReparar.parentNode) {
        seccionReparar.parentNode.insertBefore(seccion,seccionReparar);
      } else {
        document.querySelector(".ad-main").appendChild(seccion);
      }
    }
  }

  function periodoSeleccionado(){
    var select = $("ad-estadisticas-periodo");
    var id = select ? texto(select.value) : "";
    return periodos.find(function(item){ return item.id === id; }) || null;
  }

  function renderPeriodos(resultado){
    var select = $("ad-estadisticas-periodo");
    var principal = resultado.principal || {};
    periodos = resultado.periodos || [];
    if (!select) return;

    select.innerHTML = periodos.map(function(item){
      return '<option value="' + esc(item.id) + '"' + (item.id === principal.id ? ' selected' : '') + '>' + esc(item.label || item.id) + '</option>';
    }).join("");

    if (!periodos.length) select.innerHTML = '<option value="">No hay períodos activos</option>';
  }

  function envioValido(item){
    var detalle = item && (item.detalle || item.titulo || item.revision) || {};
    return Boolean(
      detalle.propuestasCompletas ||
      detalle.tieneResolucion ||
      (texto(detalle.titulo1) && texto(detalle.titulo2) && texto(detalle.titulo3))
    );
  }

  function calcular(estudiantes,periodo){
    var global = {
      periodo: periodo && (periodo.label || periodo.id) || "Sin período",
      total: estudiantes.length,
      enviados: 0,
      faltan: 0
    };
    var grupos = {};

    estudiantes.forEach(function(item){
      var carrera = texto(item.carrera) || "Sin carrera";
      var clave = normal(carrera) || "sin carrera";
      var enviado = envioValido(item);

      if (!grupos[clave]) {
        grupos[clave] = { carrera:carrera, total:0, enviados:0, faltan:0 };
      }

      grupos[clave].total += 1;
      global.enviados += enviado ? 1 : 0;
      grupos[clave].enviados += enviado ? 1 : 0;
    });

    global.faltan = global.total - global.enviados;

    Object.keys(grupos).forEach(function(clave){
      grupos[clave].faltan = grupos[clave].total - grupos[clave].enviados;
    });

    return {
      global: global,
      carreras: Object.keys(grupos).map(function(clave){ return grupos[clave]; }).sort(function(a,b){
        return a.carrera.localeCompare(b.carrera,"es");
      })
    };
  }

  function render(resultado){
    var global = resultado.global;
    var filas = resultado.carreras.map(function(item){
      return '<tr>' +
        '<td><strong>' + esc(item.carrera) + '</strong></td>' +
        '<td>' + item.total + '</td>' +
        '<td>' + item.enviados + '</td>' +
        '<td>' + item.faltan + '</td>' +
        '<td><span class="ad-stats-percent">' + porcentaje(item.enviados,item.total) + '</span></td>' +
      '</tr>';
    });

    setHtml("ad-estadisticas-global",
      '<tr><td><strong>' + esc(global.periodo) + '</strong></td><td>' + global.total + '</td><td>' + global.enviados + '</td><td>' + global.faltan + '</td><td><span class="ad-stats-percent">' + porcentaje(global.enviados,global.total) + '</span></td></tr>'
    );
    setHtml("ad-estadisticas-carreras",
      filas.length ? filas.join("") : '<tr><td colspan="5" class="ad-empty">No se encontraron estudiantes para el período.</td></tr>'
    );
    setTexto("ad-estadisticas-estado",
      "Estadísticas calculadas para " + global.periodo + ". Total: " + global.total + ", enviaron: " + global.enviados + ", faltan: " + global.faltan + "."
    );
  }

  function cargarEstadisticas(){
    var periodo = periodoSeleccionado();
    var select = $("ad-estadisticas-periodo");
    var boton = $("ad-btn-actualizar-estadisticas");

    if (!periodo || cargando) return Promise.resolve();
    cargando = true;
    if (select) select.disabled = true;
    if (boton) boton.disabled = true;
    setTexto("ad-estadisticas-estado","Cargando estudiantes y títulos del período...");
    setHtml("ad-estadisticas-global",'<tr><td colspan="5" class="ad-empty">Calculando...</td></tr>');
    setHtml("ad-estadisticas-carreras",'<tr><td colspan="5" class="ad-empty">Calculando...</td></tr>');

    return service().cargar(periodo).then(function(respuesta){
      render(calcular(respuesta.estudiantes || [],periodo));
    }).catch(function(error){
      setTexto("ad-estadisticas-estado","No se pudieron calcular las estadísticas: " + (error.message || String(error)));
      setHtml("ad-estadisticas-global",'<tr><td colspan="5" class="ad-empty">Error al calcular.</td></tr>');
      setHtml("ad-estadisticas-carreras",'<tr><td colspan="5" class="ad-empty">Error al calcular.</td></tr>');
    }).then(function(){
      cargando = false;
      if (select) select.disabled = false;
      if (boton) boton.disabled = false;
    });
  }

  function cargarPeriodos(){
    setTexto("ad-estadisticas-estado","Cargando períodos activos...");
    return service().listarPeriodos().then(function(resultado){
      renderPeriodos(resultado);
      if (periodos.length) return cargarEstadisticas();
      setTexto("ad-estadisticas-estado","No hay períodos activos para calcular estadísticas.");
    }).catch(function(error){
      setTexto("ad-estadisticas-estado","No se pudieron cargar los períodos: " + (error.message || String(error)));
    });
  }

  function iniciar(){
    var select;
    var boton;
    if (iniciado) return;
    iniciado = true;
    insertarVista();
    select = $("ad-estadisticas-periodo");
    boton = $("ad-btn-actualizar-estadisticas");
    if (select) select.addEventListener("change",cargarEstadisticas);
    if (boton) boton.addEventListener("click",cargarEstadisticas);

    window.addEventListener("ad:vista-cambiada",function(evento){
      if (evento.detail && evento.detail.id === "ad-seccion-estadisticas" && !periodos.length) {
        cargarPeriodos();
      }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",iniciar);
  else iniciar();

  window.ADEstadisticasApp = {
    iniciar: iniciar,
    cargarPeriodos: cargarPeriodos,
    cargarEstadisticas: cargarEstadisticas
  };
})(window,document);
