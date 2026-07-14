/* =========================================================
Archivo: ad-periodos.app.js
Ruta: /administrador/ad-js/ad-periodos.app.js
Función:
- Transformar la pantalla Períodos.
- Mostrar períodos detectados en Firebase.
- Activar o desactivar períodos.
========================================================= */
(function(window, document){
  "use strict";

  var VERSION = window.AD_CONFIG && window.AD_CONFIG.version
    ? String(window.AD_CONFIG.version)
    : "1.3.0";
  var resultadoActual = null;
  var cargando = false;
  var iniciado = false;

  function $(id){
    return document.getElementById(id);
  }

  function texto(valor){
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function html(valor){
    return texto(valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function service(){
    if (!window.ADPeriodosService) {
      throw new Error("ADPeriodosService no está disponible.");
    }
    return window.ADPeriodosService;
  }

  function agregarCss(){
    if ($("ad-periodos-css")) return;

    var link = document.createElement("link");
    link.id = "ad-periodos-css";
    link.rel = "stylesheet";
    link.href = "./ad-css/ad-periodos.css?v=" + encodeURIComponent(VERSION);
    document.head.appendChild(link);
  }

  function transformarVista(){
    var seccion = $("ad-seccion-periodos");

    if (!seccion || seccion.getAttribute("data-periodos-v2") === "true") return;

    seccion.setAttribute("data-periodos-v2", "true");
    seccion.innerHTML = [
      '<div class="ad-section-head">',
      '  <div>',
      '    <p class="ad-eyebrow">Gestión de períodos</p>',
      '    <h3>Períodos</h3>',
      '    <p class="ad-muted">Selecciona un período detectado en Firebase para activarlo o desactivarlo. Desactivar no elimina estudiantes ni títulos.</p>',
      '  </div>',
      '</div>',
      '<div class="ad-card">',
      '  <div class="ad-periodos-control">',
      '    <label class="ad-periodos-selector">',
      '      <span>Período</span>',
      '      <select id="ad-periodo-selector">',
      '        <option value="">Cargando períodos...</option>',
      '      </select>',
      '    </label>',
      '    <div class="ad-periodo-estado-actual">',
      '      <span>Estado actual</span>',
      '      <strong id="ad-periodo-estado-badge" class="ad-badge ad-badge-neutral">Pendiente</strong>',
      '    </div>',
      '    <div class="ad-periodo-accion-principal">',
      '      <button id="ad-btn-periodo-estado" class="ad-btn ad-btn-primary" type="button" disabled>',
      '        Selecciona un período',
      '      </button>',
      '    </div>',
      '  </div>',
      '  <div id="ad-periodos-mensaje" class="ad-periodos-mensaje">Consultando períodos existentes en Firebase...</div>',
      '  <div class="ad-table-wrap">',
      '    <table class="ad-table ad-tabla-periodos-gestion">',
      '      <thead>',
      '        <tr>',
      '          <th>Período</th>',
      '          <th>Estado</th>',
      '          <th>Acción</th>',
      '        </tr>',
      '      </thead>',
      '      <tbody id="ad-tabla-periodos-gestion">',
      '        <tr><td colspan="3" class="ad-empty">Cargando períodos...</td></tr>',
      '      </tbody>',
      '    </table>',
      '  </div>',
      '</div>'
    ].join("");
  }

  function mostrarMensaje(mensaje, tipo){
    var el = $("ad-periodos-mensaje");
    if (!el) return;

    el.classList.remove("is-loading", "is-success", "is-error");
    if (tipo) el.classList.add("is-" + tipo);
    el.textContent = mensaje || "";
  }

  function obtenerSeleccionado(){
    var select = $("ad-periodo-selector");
    var id = select ? texto(select.value) : "";

    if (!resultadoActual || !id) return null;

    return (resultadoActual.periodos || []).find(function(item){
      return item.id === id;
    }) || null;
  }

  function renderSelector(idPreferido){
    var select = $("ad-periodo-selector");
    var periodos = resultadoActual && resultadoActual.periodos || [];
    var principal = resultadoActual && resultadoActual.principal || {};
    var idSeleccionado = idPreferido || principal.id || (periodos[0] && periodos[0].id) || "";

    if (!select) return;

    select.innerHTML = periodos.length
      ? periodos.map(function(item){
          return '<option value="' + html(item.id) + '">' +
            html(item.label) +
            (item.principal ? " · Principal" : "") +
            '</option>';
        }).join("")
      : '<option value="">No se detectaron períodos</option>';

    if (idSeleccionado && periodos.some(function(item){ return item.id === idSeleccionado; })) {
      select.value = idSeleccionado;
    }
  }

  function renderEstadoSeleccionado(){
    var item = obtenerSeleccionado();
    var badge = $("ad-periodo-estado-badge");
    var boton = $("ad-btn-periodo-estado");

    if (!badge || !boton) return;

    badge.classList.remove(
      "ad-badge-success",
      "ad-badge-warning",
      "ad-badge-neutral"
    );
    boton.classList.remove("ad-btn-primary", "ad-btn-danger");

    if (!item) {
      badge.textContent = "Sin selección";
      badge.classList.add("ad-badge-neutral");
      boton.textContent = "Selecciona un período";
      boton.classList.add("ad-btn-primary");
      boton.disabled = true;
      boton.removeAttribute("data-activar");
      return;
    }

    badge.textContent = item.activo ? "Activo" : "Inactivo";
    badge.classList.add(item.activo ? "ad-badge-success" : "ad-badge-warning");

    boton.textContent = item.activo ? "Desactivar período" : "Activar período";
    boton.classList.add(item.activo ? "ad-btn-danger" : "ad-btn-primary");
    boton.disabled = cargando;
    boton.setAttribute("data-activar", item.activo ? "0" : "1");
  }

  function renderTabla(){
    var tbody = $("ad-tabla-periodos-gestion");
    var periodos = resultadoActual && resultadoActual.periodos || [];
    var filas = [];

    if (!tbody) return;

    periodos.forEach(function(item){
      filas.push(
        '<tr>' +
          '<td>' +
            '<strong>' + html(item.label) + '</strong>' +
            (item.principal ? '<small class="ad-periodo-principal">Período principal</small>' : '') +
          '</td>' +
          '<td><span class="ad-badge ' +
            (item.activo ? 'ad-badge-success' : 'ad-badge-warning') +
            '">' + (item.activo ? 'Activo' : 'Inactivo') + '</span></td>' +
          '<td><button type="button" class="ad-btn ' +
            (item.activo ? 'ad-btn-danger' : 'ad-btn-primary') +
            ' ad-periodo-toggle" data-periodo-id="' + html(item.id) +
            '" data-activar="' + (item.activo ? '0' : '1') + '">' +
            (item.activo ? 'Desactivar' : 'Activar') +
          '</button></td>' +
        '</tr>'
      );
    });

    tbody.innerHTML = filas.length
      ? filas.join("")
      : '<tr><td colspan="3" class="ad-empty">No se encontraron períodos en Firebase.</td></tr>';
  }

  function actualizarKpi(){
    var principal = resultadoActual && resultadoActual.principal || {};
    var label = $("ad-kpi-periodo");
    var id = $("ad-kpi-periodo-id");

    if (label) label.textContent = principal.label || "Sin período activo";
    if (id) id.textContent = principal.id || "";
  }

  function notificarActualizacion(){
    var activos = {
      principal: resultadoActual && resultadoActual.principal || null,
      periodos: resultadoActual && resultadoActual.activos || [],
      configApp: resultadoActual && resultadoActual.configApp || {}
    };

    window.dispatchEvent(new CustomEvent("ad:periodos-actualizados", {
      detail: activos
    }));

    if (
      window.ADEstudiantesRuntime &&
      typeof window.ADEstudiantesRuntime.cargarPeriodos === "function"
    ) {
      window.ADEstudiantesRuntime.cargarPeriodos();
    }
  }

  function aplicarResultado(resultado, idPreferido){
    resultadoActual = resultado || {
      principal: null,
      periodos: [],
      activos: []
    };

    renderSelector(idPreferido);
    renderEstadoSeleccionado();
    renderTabla();
    actualizarKpi();
  }

  function cargarPeriodos(idPreferido){
    if (cargando) return Promise.resolve();

    cargando = true;
    mostrarMensaje("Detectando períodos en Estudiantes, títulos y configuración...", "loading");

    return service().listarTodosLosPeriodos()
      .then(function(resultado){
        aplicarResultado(resultado, idPreferido);
        mostrarMensaje(
          "Se detectaron " + (resultado.periodos || []).length +
          " períodos: " + (resultado.activos || []).length +
          " activos y " +
          ((resultado.periodos || []).length - (resultado.activos || []).length) +
          " inactivos.",
          "success"
        );
        return resultado;
      })
      .catch(function(error){
        resultadoActual = { principal: null, periodos: [], activos: [] };
        aplicarResultado(resultadoActual);
        mostrarMensaje(
          "No se pudieron cargar los períodos: " + (error.message || String(error)),
          "error"
        );
      })
      .then(function(resultado){
        cargando = false;
        renderEstadoSeleccionado();
        return resultado;
      });
  }

  function cambiarEstado(id, activar){
    if (!id || cargando) return Promise.resolve();

    cargando = true;
    renderEstadoSeleccionado();
    mostrarMensaje(
      activar ? "Activando período..." : "Desactivando período...",
      "loading"
    );

    return service().cambiarEstadoPeriodo(id, activar)
      .then(function(resultado){
        resultadoActual = resultado;
        aplicarResultado(resultado, id);
        mostrarMensaje(
          activar
            ? "Período activado correctamente."
            : "Período desactivado correctamente.",
          "success"
        );
        actualizarKpi();
        notificarActualizacion();
      })
      .catch(function(error){
        mostrarMensaje(error.message || String(error), "error");
      })
      .then(function(){
        cargando = false;
        renderEstadoSeleccionado();
      });
  }

  function conectarEventos(){
    var selector = $("ad-periodo-selector");
    var boton = $("ad-btn-periodo-estado");
    var tabla = $("ad-tabla-periodos-gestion");

    if (selector) {
      selector.addEventListener("change", renderEstadoSeleccionado);
    }

    if (boton) {
      boton.addEventListener("click", function(){
        var item = obtenerSeleccionado();
        if (!item) return;
        cambiarEstado(item.id, !item.activo);
      });
    }

    if (tabla) {
      tabla.addEventListener("click", function(evento){
        var accion = evento.target && evento.target.closest
          ? evento.target.closest(".ad-periodo-toggle")
          : null;

        if (!accion) return;

        var id = texto(accion.getAttribute("data-periodo-id"));
        var activar = accion.getAttribute("data-activar") === "1";
        var select = $("ad-periodo-selector");

        if (select) select.value = id;
        renderEstadoSeleccionado();
        cambiarEstado(id, activar);
      });
    }

    window.addEventListener("ad:vista-cambiada", function(evento){
      if (evento.detail && evento.detail.id === "ad-seccion-periodos") {
        cargarPeriodos(obtenerSeleccionado() && obtenerSeleccionado().id);
      }
    });
  }

  function iniciar(){
    if (iniciado) return;
    iniciado = true;

    agregarCss();
    transformarVista();
    conectarEventos();
    cargarPeriodos();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  window.ADPeriodosApp = {
    cargarPeriodos: cargarPeriodos,
    cambiarEstado: cambiarEstado,
    aplicarResultado: aplicarResultado
  };
})(window, document);
