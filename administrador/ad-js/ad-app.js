/* =========================================================
Archivo: ad-app.js
Ruta: /administrador/ad-js/ad-app.js
Función:
- Controlador principal del panel administrador.
- Conecta la interfaz con Firebase y diagnóstico general.
- Muestra KPIs, colecciones principales, estado Sheets y logs.
- Conecta acciones funcionales del bloque períodos.
Dependencias:
- ad-config.js
- ad-firebase.service.js
- ad-diagnostico.service.js
- ad-periodos.service.js
========================================================= */

(function(window, document){
  "use strict";

  var estado = {
    firebaseOk: false,
    sheetsOk: false,
    configApp: null,
    periodo: null,
    periodosDetalle: [],
    sheets: null,
    colecciones: [],
    logsRecientes: []
  };

  function config(){
    return window.AD_CONFIG || {};
  }

  function utils(){
    return window.AD_UTILS || {};
  }

  function diagnostico(){
    if (!window.ADDiagnosticoService) {
      throw new Error("ADDiagnosticoService no está disponible.");
    }
    return window.ADDiagnosticoService;
  }

  function periodosService(){
    if (!window.ADPeriodosService) {
      throw new Error("ADPeriodosService no está disponible.");
    }
    return window.ADPeriodosService;
  }

  function $(id){
    return document.getElementById(id);
  }

  function texto(valor){
    if (utils().normalizarTexto) return utils().normalizarTexto(valor);
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function setTexto(id, valor){
    var el = $(id);
    if (el) el.textContent = valor;
  }

  function setHtml(id, valor){
    var el = $(id);
    if (el) el.innerHTML = valor;
  }

  function valorInput(id){
    var el = $(id);
    return el ? texto(el.value) : "";
  }

  function setValorInput(id, valor){
    var el = $(id);
    if (el) el.value = valor || "";
  }

  function claseBadge(id, tipo){
    var el = $(id);
    if (!el) return;
    el.classList.remove("ad-badge-info", "ad-badge-success", "ad-badge-warning", "ad-badge-danger");
    el.classList.add("ad-badge-" + tipo);
  }

  function mostrarDiagnostico(mensaje){
    setTexto("ad-panel-diagnostico", mensaje || "Diagnóstico pendiente.");
  }

  function escaparHtml(valor){
    return texto(valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function renderTablaVacia(id, columnas, mensaje){
    setHtml(id, '<tr><td colspan="' + columnas + '" class="ad-empty">' + escaparHtml(mensaje || config().textos.sinDatos) + '</td></tr>');
  }

  function obtenerResumenColeccion(nombre){
    var lista = estado.colecciones || [];
    var i;
    for (i = 0; i < lista.length; i += 1) {
      if (lista[i].nombre === nombre) return lista[i];
    }
    return null;
  }

  function numero(valor){
    var n = Number(valor || 0);
    if (!Number.isFinite(n)) return 0;
    return n;
  }

  function actualizarBadges(){
    if (estado.firebaseOk) {
      setTexto("ad-badge-firebase", config().textos.firebaseConectado);
      claseBadge("ad-badge-firebase", "success");
    } else {
      setTexto("ad-badge-firebase", config().textos.firebaseError);
      claseBadge("ad-badge-firebase", "danger");
    }

    if (!estado.sheets) {
      setTexto("ad-badge-sheets", config().textos.sheetsPendiente);
      claseBadge("ad-badge-sheets", "warning");
    } else if (estado.sheets.activo) {
      setTexto("ad-badge-sheets", config().textos.sheetsActivo);
      claseBadge("ad-badge-sheets", "success");
    } else {
      setTexto("ad-badge-sheets", config().textos.sheetsInactivo);
      claseBadge("ad-badge-sheets", "warning");
    }

    setTexto("ad-badge-version", "v" + config().version);
    setTexto("ad-footer-version", "Versión " + config().version);
  }

  function actualizarKpis(){
    var col = config().colecciones || {};
    var periodo = estado.periodo || {};
    var titulos = obtenerResumenColeccion(col.titulos);
    var coordinadores = obtenerResumenColeccion(col.coordinadores);
    var estudiantes = obtenerResumenColeccion(col.estudiantes);

    setTexto("ad-kpi-periodo", periodo.label || config().periodos.fallbackLabel);
    setTexto("ad-kpi-periodo-id", periodo.id || config().periodos.fallbackId);
    setTexto("ad-kpi-titulos", String(numero(titulos && titulos.total)));
    setTexto("ad-kpi-coordinadores", String(numero(coordinadores && coordinadores.total)));
    setTexto("ad-kpi-carreras", estudiantes && estudiantes.ok ? "Pendiente cruce" : "0");
  }

  function construirPeriodosDesdeEstado(){
    var periodo = estado.periodo || {};
    var ids = Array.isArray(periodo.periodosActivos) ? periodo.periodosActivos : [];
    var labels = Array.isArray(periodo.periodosActivosLabels) ? periodo.periodosActivosLabels : [];
    var lista = [];

    ids.forEach(function(id, index){
      lista.push({
        id: id,
        label: labels[index] || id,
        activo: true,
        principal: id === periodo.id
      });
    });

    if (!lista.length && periodo.id) {
      lista.push({
        id: periodo.id,
        label: periodo.label || periodo.id,
        activo: true,
        principal: true
      });
    }

    return lista;
  }

  function renderPeriodos(){
    var lista = estado.periodosDetalle && estado.periodosDetalle.length ? estado.periodosDetalle : construirPeriodosDesdeEstado();
    var filas = [];

    lista.forEach(function(item){
      var principal = item.principal || (estado.periodo && item.id === estado.periodo.id);
      filas.push(
        "<tr>" +
          "<td>" + escaparHtml(item.id) + "</td>" +
          "<td>" + escaparHtml(item.label || item.id) + "</td>" +
          "<td><span class='ad-badge ad-badge-success'>Activo</span></td>" +
          "<td>" +
            (principal ? "<span class='ad-badge ad-badge-info'>Principal</span>" : "<button class='ad-btn ad-btn-secondary ad-btn-usar-periodo' type='button' data-periodo-id='" + escaparHtml(item.id) + "' data-periodo-label='" + escaparHtml(item.label || item.id) + "'>Usar</button>") +
          "</td>" +
        "</tr>"
      );
    });

    if (!filas.length) {
      renderTablaVacia("ad-tabla-periodos", 4, "No se encontraron períodos en la configuración.");
      return;
    }

    setHtml("ad-tabla-periodos", filas.join(""));
  }

  function renderCoordinadores(){
    var col = obtenerResumenColeccion(config().colecciones.coordinadores);
    var datos = col && col.muestra ? col.muestra : [];
    var filas = [];

    datos.forEach(function(item){
      var carreras = Array.isArray(item.carreras) ? item.carreras.length : 0;
      var activo = item.activo !== false;
      filas.push(
        "<tr>" +
          "<td><strong>" + escaparHtml(item.nombre || item.id || item._docId) + "</strong><br><small>" + escaparHtml(item._docId) + "</small></td>" +
          "<td>" + escaparHtml(item.telegram || item.Telegram || "") + "</td>" +
          "<td><span class='ad-badge " + (activo ? "ad-badge-success" : "ad-badge-warning") + "'>" + (activo ? "Activo" : "Inactivo") + "</span></td>" +
          "<td>" + carreras + "</td>" +
          "<td>Disponible en bloque coordinadores</td>" +
        "</tr>"
      );
    });

    if (!filas.length) {
      renderTablaVacia("ad-tabla-coordinadores", 5, "No se encontraron coordinadores en la muestra inicial.");
      return;
    }

    setHtml("ad-tabla-coordinadores", filas.join(""));
  }

  function renderTitulos(){
    var col = obtenerResumenColeccion(config().colecciones.titulos);
    var datos = col && col.muestra ? col.muestra : [];
    var filas = [];

    datos.forEach(function(item){
      filas.push(
        "<tr>" +
          "<td>" + escaparHtml(item.cedula || item._docId) + "</td>" +
          "<td>" + escaparHtml(item.estudiante || item.Nombres || item.nombres || "Pendiente cruce Estudiantes") + "</td>" +
          "<td>" + escaparHtml(item.NombreCarrera || item.carrera || "Pendiente cruce") + "</td>" +
          "<td>" + escaparHtml(item.estado || "") + "</td>" +
          "<td>" + escaparHtml(item.fechaenviotitulos || item.fechaEnvioTitulos || item.creadoEn || "") + "</td>" +
        "</tr>"
      );
    });

    if (!filas.length) {
      renderTablaVacia("ad-tabla-titulos", 5, "No se encontraron títulos en la muestra inicial.");
      return;
    }

    setHtml("ad-tabla-titulos", filas.join(""));
  }

  function renderLogs(){
    var datos = estado.logsRecientes || [];
    var filas = [];

    datos.forEach(function(item){
      var fecha = item.fecha || item.fechaCliente || item.fechaLocal || item.creadoEn || item.actualizadoEn || "";
      var accion = item.accion || item.tipo || item.evento || item.modulo || "";
      var detalle = item.detalle || item.mensaje || item.observacion || item.cedula || item.coordinadorId || "";
      var estadoLog = item.estado || item.nivel || (item.ok === false ? "ERROR" : "OK");

      filas.push(
        "<tr>" +
          "<td>" + escaparHtml(fecha) + "</td>" +
          "<td>" + escaparHtml(accion) + "</td>" +
          "<td>" + escaparHtml(detalle) + "</td>" +
          "<td><span class='ad-badge " + (texto(estadoLog).toUpperCase().indexOf("ERROR") >= 0 ? "ad-badge-danger" : "ad-badge-info") + "'>" + escaparHtml(estadoLog) + "</span></td>" +
        "</tr>"
      );
    });

    if (!filas.length) {
      renderTablaVacia("ad-tabla-logs", 4, "No se encontraron logs recientes.");
      return;
    }

    setHtml("ad-tabla-logs", filas.join(""));
  }

  function renderListaCarrerasPlaceholder(){
    var estudiantes = obtenerResumenColeccion(config().colecciones.estudiantes);
    var titulos = obtenerResumenColeccion(config().colecciones.titulos);
    var mensaje = "Bloque 4 activo: períodos funcionales.\n";
    mensaje += "Estudiantes detectados: " + numero(estudiantes && estudiantes.total) + "\n";
    mensaje += "Títulos detectados: " + numero(titulos && titulos.total) + "\n";
    mensaje += "El cruce real de carreras se implementa en el bloque de coordinadores y carreras.";
    setTexto("ad-lista-carreras", mensaje);
  }

  function aplicarPeriodoResultado(resultado){
    estado.periodo = {
      id: resultado.principal.id,
      label: resultado.principal.label,
      periodosActivos: resultado.periodos.map(function(item){ return item.id; }),
      periodosActivosLabels: resultado.periodos.map(function(item){ return item.label; })
    };
    estado.periodosDetalle = resultado.periodos || [];
    actualizarKpis();
    renderPeriodos();
  }

  function cargarPeriodos(){
    if (!window.ADPeriodosService) return Promise.resolve();
    return periodosService().listarPeriodos()
      .then(function(resultado){
        aplicarPeriodoResultado(resultado);
        return resultado;
      })
      .catch(function(error){
        mostrarDiagnostico("No se pudieron cargar períodos:\n" + (error.message || String(error)));
      });
  }

  function renderEstadoInicial(resultado){
    estado.firebaseOk = true;
    estado.configApp = resultado.configApp || null;
    estado.periodo = resultado.periodo || null;
    estado.sheets = resultado.sheets || null;
    estado.colecciones = resultado.colecciones || [];
    estado.logsRecientes = resultado.logsRecientes || [];
    estado.periodosDetalle = [];

    actualizarBadges();
    actualizarKpis();
    renderPeriodos();
    renderCoordinadores();
    renderTitulos();
    renderLogs();
    renderListaCarrerasPlaceholder();
    mostrarDiagnostico(diagnostico().resumenTextoFirebase(resultado));
    cargarPeriodos();
  }

  function renderError(error){
    estado.firebaseOk = false;
    actualizarBadges();
    actualizarKpis();
    mostrarDiagnostico("Error al conectar Firebase:\n" + (error.message || String(error)));
  }

  function cargarDashboard(){
    mostrarDiagnostico("Conectando con Firebase y cargando diagnóstico general...");
    return diagnostico().probarFirebase()
      .then(renderEstadoInicial)
      .catch(renderError);
  }

  function probarSheets(){
    mostrarDiagnostico("Probando Google Sheets...");
    return diagnostico().probarSheets()
      .then(function(resultado){
        estado.sheetsOk = Boolean(resultado.ok);
        estado.sheets = resultado.sheets || estado.sheets;
        actualizarBadges();
        mostrarDiagnostico(
          "Google Sheets:\n" +
          "Estado: " + (resultado.ok ? "ok" : "error") + "\n" +
          "Mensaje: " + (resultado.mensaje || "Sin mensaje") + "\n" +
          "Activo: " + (resultado.sheets && resultado.sheets.activo ? "sí" : "no") + "\n" +
          "URL: " + (resultado.sheets && resultado.sheets.webAppUrl ? "configurada" : "no configurada") + "\n" +
          "Token: " + ((resultado.sheets && resultado.sheets.tokenOculto) || "no visible") + "\n" +
          "Última prueba: " + ((resultado.sheets && resultado.sheets.ultimaPrueba) || "sin dato") + "\n" +
          "Resultado anterior: " + ((resultado.sheets && resultado.sheets.ultimoResultado) || "sin dato")
        );
      })
      .catch(function(error){
        mostrarDiagnostico("Error al probar Google Sheets:\n" + (error.message || String(error)));
      });
  }

  function agregarPeriodo(){
    var id = valorInput("ad-periodo-id");
    var label = valorInput("ad-periodo-label");

    mostrarDiagnostico("Agregando período " + id + "...");
    return periodosService().agregarPeriodo(id, label)
      .then(function(resultado){
        aplicarPeriodoResultado(resultado);
        mostrarDiagnostico("Período agregado/actualizado correctamente:\n" + id + " - " + (label || id));
        return cargarDashboard();
      })
      .catch(function(error){
        mostrarDiagnostico("Error al agregar período:\n" + (error.message || String(error)));
      });
  }

  function definirPeriodoPrincipal(){
    var id = valorInput("ad-periodo-id");
    var label = valorInput("ad-periodo-label");

    mostrarDiagnostico("Definiendo período principal " + id + "...");
    return periodosService().definirPrincipal(id, label)
      .then(function(resultado){
        aplicarPeriodoResultado(resultado);
        mostrarDiagnostico("Período principal actualizado correctamente:\n" + id + " - " + (label || id));
        return cargarDashboard();
      })
      .catch(function(error){
        mostrarDiagnostico("Error al definir período principal:\n" + (error.message || String(error)));
      });
  }

  function seleccionarPeriodoDesdeTabla(evento){
    var boton = evento.target && evento.target.closest ? evento.target.closest(".ad-btn-usar-periodo") : null;
    if (!boton) return;
    setValorInput("ad-periodo-id", boton.getAttribute("data-periodo-id") || "");
    setValorInput("ad-periodo-label", boton.getAttribute("data-periodo-label") || "");
    definirPeriodoPrincipal();
  }

  function accionPendiente(nombreBloque){
    return function(){
      mostrarDiagnostico(nombreBloque + " se implementará en el siguiente bloque correspondiente. Períodos ya quedó funcional.");
    };
  }

  function conectarEventos(){
    var eventos = [
      ["ad-btn-probar-firebase", cargarDashboard],
      ["ad-btn-recargar-dashboard", cargarDashboard],
      ["ad-btn-probar-sheets", probarSheets],
      ["ad-btn-periodo-agregar", agregarPeriodo],
      ["ad-btn-periodo-principal", definirPeriodoPrincipal],
      ["ad-btn-coordinador-guardar", accionPendiente("Coordinadores")],
      ["ad-btn-asignar-carrera", accionPendiente("Asignación de carreras")],
      ["ad-btn-cargar-carreras", accionPendiente("Carreras")],
      ["ad-btn-buscar-titulo", accionPendiente("Búsqueda de títulos")],
      ["ad-btn-listar-titulos", accionPendiente("Listado de títulos")],
      ["ad-btn-devolver-titulo", accionPendiente("Devolver título")],
      ["ad-btn-detectar-reparaciones", accionPendiente("Reparar Firebase")],
      ["ad-btn-reparar-documento", accionPendiente("Reparar Firebase")]
    ];

    eventos.forEach(function(par){
      var el = $(par[0]);
      if (el) el.addEventListener("click", par[1]);
    });

    var tablaPeriodos = $("ad-tabla-periodos");
    if (tablaPeriodos) tablaPeriodos.addEventListener("click", seleccionarPeriodoDesdeTabla);
  }

  function iniciar(){
    actualizarBadges();
    actualizarKpis();
    conectarEventos();
    cargarDashboard();
  }

  document.addEventListener("DOMContentLoaded", iniciar);

  window.ADApp = {
    cargarDashboard: cargarDashboard,
    probarSheets: probarSheets,
    cargarPeriodos: cargarPeriodos,
    agregarPeriodo: agregarPeriodo,
    definirPeriodoPrincipal: definirPeriodoPrincipal,
    estado: estado
  };
})(window, document);
