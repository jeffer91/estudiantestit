/* =========================================================
Archivo: ad-estudiantes.runtime.js
Ruta: /administrador/ad-js/ad-estudiantes.runtime.js
Función:
- Controlar la pantalla Estudiantes.
- Filtrar por período, carrera y estado.
- Abrir el detalle de cada estudiante.
- Enviar recordatorios individuales por WhatsApp.
========================================================= */
(function(window,document){
  "use strict";

  var URL_ESTUDIANTES = "https://titulos.pages.dev/estudiantes/estudiante";
  var periodos = [];
  var estudiantesTodos = [];
  var estudiantesFiltrados = [];
  var cargando = false;
  var iniciado = false;
  var sheetsDisponible = false;

  function service(){
    if (!window.ADEstudiantesService) {
      throw new Error("ADEstudiantesService no está disponible.");
    }
    return window.ADEstudiantesService;
  }

  function $(id){ return document.getElementById(id); }
  function texto(v){ return String(v === null || v === undefined ? "" : v).trim(); }
  function esc(v){
    return texto(v)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/\"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }
  function normal(v){
    return texto(v)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }
  function setTexto(id,v){ var el=$(id); if(el) el.textContent=v; }
  function setHtml(id,v){ var el=$(id); if(el) el.innerHTML=v; }

  function mostrarEstado(mensaje,tipo){
    var el = $("ad-estado-estudiantes");
    if (!el) return;

    el.classList.remove("is-loading","is-success","is-error");
    if (tipo) el.classList.add("is-" + tipo);
    el.textContent = mensaje || "";
  }

  function etiquetaEstado(estado){
    if (estado === "NO_ENVIO") {
      return { texto:"No envió", clase:"ad-badge-neutral", filtro:"NO_ENVIO" };
    }
    if (estado === "DEVUELTO") {
      return { texto:"Devuelto", clase:"ad-badge-danger", filtro:"DEVUELTO" };
    }
    if (estado === "APROBADO" || estado === "REEMPLAZADO") {
      return { texto:"Aprobado", clase:"ad-badge-success", filtro:"APROBADO" };
    }
    return { texto:"Envió", clase:"ad-badge-info", filtro:"ENVIADO" };
  }

  function renderResumen(){
    var enviaron = 0;
    var noEnviaron = 0;
    var devueltos = 0;

    estudiantesTodos.forEach(function(item){
      if (item.estado === "NO_ENVIO") noEnviaron += 1;
      else if (item.estado === "DEVUELTO") devueltos += 1;
      else enviaron += 1;
    });

    setTexto("ad-estudiantes-total", String(estudiantesTodos.length));
    setTexto("ad-estudiantes-enviaron", String(enviaron));
    setTexto("ad-estudiantes-no-enviaron", String(noEnviaron));
    setTexto("ad-estudiantes-devueltos", String(devueltos));
  }

  function periodoSeleccionado(){
    var select = $("ad-estudiantes-periodo");
    var id = select ? texto(select.value) : "";
    return periodos.find(function(item){ return item.id === id; }) || null;
  }

  function crearMensajeWhatsApp(item){
    var periodo = item.periodoLabel || item.periodoId || "el período seleccionado";
    var nombre = item.nombre || "estudiante";

    return [
      "Hola, " + nombre + ".",
      "Te recordamos que debes registrar tus propuestas de títulos correspondientes al período " + periodo + ".",
      "Puedes realizar el envío en el siguiente enlace:",
      URL_ESTUDIANTES
    ].join("\n\n");
  }

  function enlaceWhatsApp(item){
    if (!item || !item.celular) return "";
    return "https://wa.me/" + item.celular + "?text=" + encodeURIComponent(crearMensajeWhatsApp(item));
  }

  function puedeEnviarWhatsApp(item){
    return item && (item.estado === "NO_ENVIO" || item.estado === "DEVUELTO");
  }

  function celdaWhatsApp(item){
    var url;

    if (!puedeEnviarWhatsApp(item)) {
      return '<span class="ad-whatsapp-disabled">No aplica</span>';
    }

    if (!item.celular) {
      return '<span class="ad-whatsapp-disabled ad-whatsapp-sin-numero">Sin número</span>';
    }

    url = enlaceWhatsApp(item);
    return (
      '<a class="ad-btn ad-btn-whatsapp" href="' + esc(url) + '" ' +
      'target="_blank" rel="noopener noreferrer" ' +
      'aria-label="Enviar recordatorio por WhatsApp a ' + esc(item.nombre || item.cedula) + '">' +
      'WhatsApp</a>'
    );
  }

  function renderTabla(){
    var filas = [];

    estudiantesFiltrados.forEach(function(item){
      var indiceReal = estudiantesTodos.indexOf(item);
      var estado = etiquetaEstado(item.estado);

      filas.push(
        "<tr>" +
          "<td>" + esc(item.cedula) + "</td>" +
          "<td class='ad-estudiante-nombre'>" + esc(item.nombre || "Sin nombre") + "</td>" +
          "<td>" + esc(item.carrera || "Sin carrera") + "</td>" +
          "<td><span class='ad-badge " + estado.clase + "'>" + estado.texto + "</span></td>" +
          "<td class='ad-whatsapp-cell'>" + celdaWhatsApp(item) + "</td>" +
          "<td><button class='ad-btn ad-btn-secondary ad-btn-ver-mas' type='button' data-estudiante-index='" + indiceReal + "'>Ver más</button></td>" +
        "</tr>"
      );
    });

    setHtml(
      "ad-tabla-estudiantes",
      filas.length
        ? filas.join("")
        : '<tr><td colspan="6" class="ad-empty">No hay estudiantes que coincidan con los filtros seleccionados.</td></tr>'
    );
  }

  function actualizarMensajeResultados(){
    var carrera = texto($("ad-estudiantes-carrera") && $("ad-estudiantes-carrera").value);
    var estado = texto($("ad-estudiantes-estado") && $("ad-estudiantes-estado").value);
    var filtrosActivos = Boolean(carrera || estado);
    var periodo = periodoSeleccionado();
    var mensaje = "Mostrando " + estudiantesFiltrados.length + " de " + estudiantesTodos.length + " estudiantes";

    if (periodo) mensaje += " del período " + (periodo.label || periodo.id);
    mensaje += ".";

    if (filtrosActivos) {
      mensaje += " Se aplicaron los filtros seleccionados.";
    }

    mensaje += sheetsDisponible
      ? " Se cruzaron las revisiones disponibles en Google Sheets."
      : " Se usó la información disponible en Firebase; no se recibieron revisiones desde Google Sheets.";

    mostrarEstado(mensaje, "success");
  }

  function aplicarFiltros(){
    var carrera = normal($("ad-estudiantes-carrera") && $("ad-estudiantes-carrera").value);
    var estado = texto($("ad-estudiantes-estado") && $("ad-estudiantes-estado").value);

    estudiantesFiltrados = estudiantesTodos.filter(function(item){
      var coincideCarrera = !carrera || normal(item.carrera) === carrera;
      var coincideEstado = !estado || etiquetaEstado(item.estado).filtro === estado;
      return coincideCarrera && coincideEstado;
    });

    renderTabla();
    actualizarMensajeResultados();
  }

  function cargarFiltroCarreras(){
    var select = $("ad-estudiantes-carrera");
    var mapa = {};
    var carreras = [];

    if (!select) return;

    estudiantesTodos.forEach(function(item){
      var nombre = texto(item.carrera);
      var clave = normal(nombre);
      if (!nombre || mapa[clave]) return;
      mapa[clave] = true;
      carreras.push(nombre);
    });

    carreras.sort(function(a,b){ return a.localeCompare(b,"es"); });

    select.innerHTML = '<option value="">Todas las carreras</option>' + carreras.map(function(nombre){
      return '<option value="' + esc(nombre) + '">' + esc(nombre) + '</option>';
    }).join("");
    select.value = "";
  }

  function reiniciarFiltroEstado(){
    var select = $("ad-estudiantes-estado");
    if (select) select.value = "";
  }

  function renderPeriodos(resultado){
    var select = $("ad-estudiantes-periodo");
    var principal = resultado.principal || {};

    periodos = resultado.periodos || [];
    if (!select) return;

    select.innerHTML = periodos.map(function(item){
      return (
        '<option value="' + esc(item.id) + '"' +
        (item.id === principal.id ? ' selected' : '') +
        '>' + esc(item.label || item.id) + '</option>'
      );
    }).join("");

    if (!periodos.length) {
      select.innerHTML = '<option value="">No hay períodos configurados</option>';
    }
  }

  function cargarEstudiantes(){
    var periodo = periodoSeleccionado();
    var select = $("ad-estudiantes-periodo");

    if (!periodo || cargando) return Promise.resolve();

    cargando = true;
    if (select) select.disabled = true;
    mostrarEstado("Cargando todos los estudiantes del período...", "loading");
    setHtml(
      "ad-tabla-estudiantes",
      '<tr><td colspan="6" class="ad-empty">Cargando estudiantes...</td></tr>'
    );

    return service().cargar(periodo)
      .then(function(resultado){
        estudiantesTodos = resultado.estudiantes || [];
        estudiantesFiltrados = estudiantesTodos.slice();
        sheetsDisponible = Boolean(resultado.sheetsDisponible);
        cargarFiltroCarreras();
        reiniciarFiltroEstado();
        renderResumen();
        renderTabla();
        actualizarMensajeResultados();
      })
      .catch(function(error){
        estudiantesTodos = [];
        estudiantesFiltrados = [];
        sheetsDisponible = false;
        cargarFiltroCarreras();
        reiniciarFiltroEstado();
        renderResumen();
        renderTabla();
        mostrarEstado(
          "No se pudieron cargar los estudiantes: " + (error.message || String(error)),
          "error"
        );
      })
      .then(function(){
        cargando = false;
        if (select) select.disabled = false;
      });
  }

  function valorDetalle(item,claves){
    var fuentes = [item.revision,item.titulo,item.historial];
    var i;
    var j;
    var fuente;

    for (i = 0; i < fuentes.length; i += 1) {
      fuente = fuentes[i] || {};
      for (j = 0; j < claves.length; j += 1) {
        if (texto(fuente[claves[j]])) return fuente[claves[j]];
        if (fuente.raw && texto(fuente.raw[claves[j]])) {
          return fuente.raw[claves[j]];
        }
      }
    }
    return "";
  }

  function tarjetaDato(etiqueta,valor){
    return (
      '<div class="ad-detail-item"><span>' + esc(etiqueta) + '</span>' +
      '<strong>' + esc(valor || "Sin dato") + '</strong></div>'
    );
  }

  function renderDetalle(item){
    var estado = etiquetaEstado(item.estado);
    var t1 = valorDetalle(item,["titulo1","Titulo1","Título 1"]);
    var t2 = valorDetalle(item,["titulo2","Titulo2","Título 2"]);
    var t3 = valorDetalle(item,["titulo3","Titulo3","Título 3"]);
    var preferido = valorDetalle(item,["tituloPreferido","preferido","tituloSeleccionado"]);
    var tituloFinal = valorDetalle(item,["tituloAprobado","tituloaprobado","tituloFinal"]);
    var coordinador = valorDetalle(item,["coordinador","coordinadorNombre"]);
    var comentario = valorDetalle(item,["comentario","comentarioCoordinador","observacion","motivoArchivo","motivo"]);
    var fechaEnvio = valorDetalle(item,["fechaEnvio"]);
    var fechaRevision = valorDetalle(item,["fechaRevision"]);
    var decision = valorDetalle(item,["estado","estadoNuevo"]);
    var celularMostrar = item.celularOriginal || item.celular || "";
    var out = [];

    out.push('<div class="ad-detail-grid">');
    out.push(tarjetaDato("Cédula",item.cedula));
    out.push(tarjetaDato("Estado",estado.texto));
    out.push(tarjetaDato("Carrera",item.carrera));
    out.push(tarjetaDato("Período",item.periodoLabel || item.periodoId));
    out.push(tarjetaDato("Celular",celularMostrar));
    out.push(tarjetaDato("Fecha de envío",fechaEnvio));
    out.push(tarjetaDato("Fecha de revisión",fechaRevision));
    out.push('</div>');

    out.push('<section class="ad-detail-section"><h4>Propuestas enviadas</h4>');
    if (t1 || t2 || t3) {
      out.push('<div class="ad-title-card"><strong>Título 1</strong>' + esc(t1 || "Sin dato") + '</div>');
      out.push('<div class="ad-title-card"><strong>Título 2</strong>' + esc(t2 || "Sin dato") + '</div>');
      out.push('<div class="ad-title-card"><strong>Título 3</strong>' + esc(t3 || "Sin dato") + '</div>');
      if (preferido) {
        out.push('<div class="ad-title-card"><strong>Título preferido</strong>' + esc(preferido) + '</div>');
      }
    } else {
      out.push('<div class="ad-no-data">Este estudiante todavía no ha enviado propuestas.</div>');
    }
    out.push('</section>');

    out.push('<section class="ad-detail-section"><h4>Revisión del coordinador</h4>');
    if (
      coordinador ||
      comentario ||
      tituloFinal ||
      decision ||
      item.estado === "DEVUELTO" ||
      item.estado === "APROBADO" ||
      item.estado === "REEMPLAZADO"
    ) {
      out.push('<div class="ad-detail-grid">');
      out.push(tarjetaDato("Coordinador",coordinador));
      out.push(tarjetaDato("Decisión",decision || estado.texto));
      out.push(tarjetaDato("Título final",tituloFinal));
      out.push(tarjetaDato("Fecha",fechaRevision));
      out.push('</div>');
      out.push(
        '<div class="ad-observation"><strong>Comentario u observación</strong><br>' +
        esc(comentario || "Sin comentario registrado.") + '</div>'
      );
    } else {
      out.push('<div class="ad-no-data">El coordinador todavía no ha registrado una revisión.</div>');
    }
    out.push('</section>');

    if (puedeEnviarWhatsApp(item)) {
      out.push('<section class="ad-detail-section"><h4>Recordatorio</h4>');
      if (item.celular) {
        out.push(
          '<a class="ad-btn ad-btn-whatsapp ad-modal-whatsapp" href="' +
          esc(enlaceWhatsApp(item)) + '" target="_blank" rel="noopener noreferrer">' +
          'Enviar recordatorio por WhatsApp</a>'
        );
      } else {
        out.push('<div class="ad-no-data">No existe un número celular válido para enviar el recordatorio.</div>');
      }
      out.push('</section>');
    }

    return out.join("");
  }

  function abrirModal(indice){
    var item = estudiantesTodos[indice];
    var modal = $("ad-estudiante-modal");

    if (!item || !modal) return;

    setTexto("ad-estudiante-modal-titulo", item.nombre || "Estudiante");
    setTexto(
      "ad-estudiante-modal-subtitulo",
      item.cedula + " · " + (item.carrera || "Sin carrera")
    );
    setHtml("ad-estudiante-modal-contenido", renderDetalle(item));
    modal.hidden = false;
    document.body.classList.add("ad-modal-open");
  }

  function cerrarModal(){
    var modal = $("ad-estudiante-modal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("ad-modal-open");
  }

  function cargarPeriodos(){
    mostrarEstado("Cargando períodos...", "loading");

    return service().listarPeriodos()
      .then(function(resultado){
        renderPeriodos(resultado);
        if (periodos.length) return cargarEstudiantes();
        mostrarEstado("No hay períodos configurados.", "error");
      })
      .catch(function(error){
        mostrarEstado(
          "No se pudieron cargar los períodos: " + (error.message || String(error)),
          "error"
        );
      });
  }

  function iniciar(){
    var selectPeriodo;
    var selectCarrera;
    var selectEstado;
    var tabla;
    var modal;
    var vista;

    if (iniciado) return;
    iniciado = true;

    selectPeriodo = $("ad-estudiantes-periodo");
    selectCarrera = $("ad-estudiantes-carrera");
    selectEstado = $("ad-estudiantes-estado");
    tabla = $("ad-tabla-estudiantes");
    modal = $("ad-estudiante-modal");
    vista = $("ad-seccion-estudiantes");

    if (selectPeriodo) selectPeriodo.addEventListener("change", cargarEstudiantes);
    if (selectCarrera) selectCarrera.addEventListener("change", aplicarFiltros);
    if (selectEstado) selectEstado.addEventListener("change", aplicarFiltros);

    if (tabla) {
      tabla.addEventListener("click",function(evento){
        var boton = evento.target && evento.target.closest
          ? evento.target.closest(".ad-btn-ver-mas")
          : null;
        if (boton) {
          abrirModal(Number(boton.getAttribute("data-estudiante-index")));
        }
      });
    }

    if (modal) {
      modal.addEventListener("click",function(evento){
        if (
          evento.target &&
          evento.target.closest &&
          evento.target.closest("[data-ad-modal-cerrar]")
        ) {
          cerrarModal();
        }
      });
    }

    document.addEventListener("keydown",function(evento){
      if (evento.key === "Escape") cerrarModal();
    });

    window.addEventListener("ad:vista-cambiada",function(evento){
      if (
        evento.detail &&
        evento.detail.id === "ad-seccion-estudiantes" &&
        !periodos.length
      ) {
        cargarPeriodos();
      }
    });

    if (vista && !vista.hidden) cargarPeriodos();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }

  window.ADEstudiantesRuntime = {
    iniciar: iniciar,
    cargarPeriodos: cargarPeriodos,
    cargarEstudiantes: cargarEstudiantes,
    aplicarFiltros: aplicarFiltros,
    abrirModal: abrirModal
  };
})(window,document);
