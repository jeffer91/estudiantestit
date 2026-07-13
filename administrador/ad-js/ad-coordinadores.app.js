/* =========================================================
Archivo: ad-coordinadores.app.js
Ruta: /administrador/ad-js/ad-coordinadores.app.js
Función:
- Conectar botones de coordinadores y carreras con la pantalla.
- Trabaja como complemento del controlador principal.
========================================================= */

(function(window, document){
  "use strict";

  var coordinadores = [];
  var carreras = [];

  function $(id){ return document.getElementById(id); }
  function texto(v){ return String(v === null || v === undefined ? "" : v).trim(); }
  function html(v){ return texto(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function setTexto(id, v){ var el = $(id); if (el) el.textContent = v; }
  function setHtml(id, v){ var el = $(id); if (el) el.innerHTML = v; }
  function valor(id){ var el = $(id); return el ? texto(el.value) : ""; }
  function setValor(id, v){ var el = $(id); if (el) el.value = v || ""; }
  function diagnostico(msg){ setTexto("ad-panel-diagnostico", msg); }

  function service(){
    if (!window.ADCoordinadoresService) throw new Error("ADCoordinadoresService no está disponible.");
    return window.ADCoordinadoresService;
  }

  function titulos(){
    if (!window.ADTitulosService) throw new Error("ADTitulosService no está disponible.");
    return window.ADTitulosService;
  }

  function renderCoordinadores(){
    var filas = [];
    coordinadores.forEach(function(item){
      var id = item._docId || item.id || "";
      var activo = item.activo !== false;
      var totalCarreras = Array.isArray(item.carreras) ? item.carreras.length : 0;
      filas.push(
        "<tr>" +
          "<td><strong>" + html(item.nombre || id) + "</strong><br><small>" + html(id) + "</small></td>" +
          "<td>" + html(item.telegram || item.Telegram || "") + "</td>" +
          "<td><span class='ad-badge " + (activo ? "ad-badge-success" : "ad-badge-warning") + "'>" + (activo ? "Activo" : "Inactivo") + "</span></td>" +
          "<td>" + totalCarreras + "</td>" +
          "<td><button class='ad-btn ad-btn-secondary ad-coord-editar' type='button' data-id='" + html(id) + "'>Editar</button> <button class='ad-btn " + (activo ? "ad-btn-danger" : "ad-btn-primary") + " ad-coord-estado' type='button' data-id='" + html(id) + "' data-activo='" + (activo ? "0" : "1") + "'>" + (activo ? "Desactivar" : "Activar") + "</button></td>" +
        "</tr>"
      );
    });
    setHtml("ad-tabla-coordinadores", filas.length ? filas.join("") : '<tr><td colspan="5" class="ad-empty">No se encontraron coordinadores.</td></tr>');
    renderSelectCoordinadores();
    setTexto("ad-kpi-coordinadores", String(coordinadores.length));
  }

  function renderSelectCoordinadores(){
    var out = '<option value="">Selecciona coordinador</option>';
    coordinadores.forEach(function(item){
      if (item.activo === false) return;
      var id = item._docId || item.id || "";
      out += '<option value="' + html(id) + '">' + html(item.nombre || id) + '</option>';
    });
    setHtml("ad-asignar-coordinador", out);
  }

  function cargarCoordinadores(){
    return service().listarCoordinadores(200).then(function(resp){
      coordinadores = resp.coordinadores || [];
      renderCoordinadores();
      return resp;
    }).catch(function(error){ diagnostico("Error al cargar coordinadores:\n" + (error.message || String(error))); });
  }

  function guardarCoordinador(evento){
    if (evento) { evento.preventDefault(); evento.stopImmediatePropagation(); }
    diagnostico("Guardando coordinador...");
    return service().guardarCoordinador({
      id: valor("ad-coordinador-id"),
      nombre: valor("ad-coordinador-nombre"),
      telegram: valor("ad-coordinador-telegram")
    }).then(function(item){
      setValor("ad-coordinador-id", item && (item._docId || item.id) || "");
      diagnostico("Coordinador guardado correctamente.");
      return cargarCoordinadores();
    }).catch(function(error){ diagnostico("Error al guardar coordinador:\n" + (error.message || String(error))); });
  }

  function accionesTabla(evento){
    var editar = evento.target.closest(".ad-coord-editar");
    var estado = evento.target.closest(".ad-coord-estado");
    if (!editar && !estado) return;
    evento.preventDefault();
    evento.stopImmediatePropagation();

    if (editar) {
      var idEditar = editar.getAttribute("data-id");
      var item = coordinadores.find(function(c){ return (c._docId || c.id) === idEditar; });
      if (!item) return;
      setValor("ad-coordinador-id", item._docId || item.id || "");
      setValor("ad-coordinador-nombre", item.nombre || "");
      setValor("ad-coordinador-telegram", item.telegram || item.Telegram || "");
      diagnostico("Coordinador cargado para edición: " + (item.nombre || idEditar));
      return;
    }

    if (estado) {
      var idEstado = estado.getAttribute("data-id");
      var nuevoEstado = estado.getAttribute("data-activo") === "1";
      service().cambiarEstado(idEstado, nuevoEstado).then(function(){
        diagnostico("Estado actualizado.");
        return cargarCoordinadores();
      }).catch(function(error){ diagnostico("Error al cambiar estado:\n" + (error.message || String(error))); });
    }
  }

  function renderCarreras(resp){
    var select = '<option value="">Selecciona carrera</option>';
    var lineas = [];
    carreras.forEach(function(item){
      select += '<option value="' + html(item.key) + '">' + html(item.nombreCarrera || item.codigoCarrera || item.key) + '</option>';
      lineas.push("• " + (item.nombreCarrera || item.codigoCarrera || item.key) + " | " + (item.codigoCarrera || "sin código") + " | títulos: " + (item.cantidadTitulos || 0));
    });
    setHtml("ad-asignar-carrera", select);
    setTexto("ad-lista-carreras", lineas.length ? lineas.join("\n") : "No hay carreras detectadas.");
    setTexto("ad-kpi-carreras", String(carreras.length));
    if (resp) diagnostico("Carreras detectadas: " + resp.totalCarreras + "\nTítulos leídos: " + resp.totalTitulosLeidos + "\nCon estudiante encontrado: " + resp.totalConEstudiante + "\nSin carrera: " + resp.totalSinCarrera);
  }

  function cargarCarreras(evento){
    if (evento) { evento.preventDefault(); evento.stopImmediatePropagation(); }
    diagnostico("Detectando carreras desde títulos enviados y cruzando con Estudiantes...");
    return titulos().detectarCarrerasDesdeTitulos(300).then(function(resp){
      carreras = resp.carreras || [];
      renderCarreras(resp);
      return resp;
    }).catch(function(error){ diagnostico("Error al cargar carreras:\n" + (error.message || String(error))); });
  }

  function asignarCarrera(evento){
    if (evento) { evento.preventDefault(); evento.stopImmediatePropagation(); }
    var coordId = valor("ad-asignar-coordinador");
    var key = valor("ad-asignar-carrera");
    var carrera = carreras.find(function(c){ return c.key === key; });
    diagnostico("Asignando carrera...");
    return service().asignarCarrera(coordId, carrera).then(function(){
      diagnostico("Carrera asignada correctamente.");
      return cargarCoordinadores();
    }).catch(function(error){ diagnostico("Error al asignar carrera:\n" + (error.message || String(error))); });
  }

  function conectar(){
    var btnGuardar = $("ad-btn-coordinador-guardar");
    var tabla = $("ad-tabla-coordinadores");
    var btnCarreras = $("ad-btn-cargar-carreras");
    var btnAsignar = $("ad-btn-asignar-carrera");
    if (btnGuardar) btnGuardar.addEventListener("click", guardarCoordinador, true);
    if (tabla) tabla.addEventListener("click", accionesTabla, true);
    if (btnCarreras) btnCarreras.addEventListener("click", cargarCarreras, true);
    if (btnAsignar) btnAsignar.addEventListener("click", asignarCarrera, true);
    setTimeout(cargarCoordinadores, 800);
  }

  document.addEventListener("DOMContentLoaded", conectar);

  window.ADCoordinadoresApp = {
    cargarCoordinadores: cargarCoordinadores,
    cargarCarreras: cargarCarreras,
    asignarCarrera: asignarCarrera
  };
})(window, document);
