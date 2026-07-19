/* =========================================================
Archivo: ad-coordinadores.eliminar.patch.js
Ruta: /administrador/ad-js/ad-coordinadores.eliminar.patch.js
Función:
- Agregar la acción Eliminar en la tabla moderna de coordinadores.
- Eliminar el registro mediante la acción ELIMINAR_COORDINADOR de Apps Script.
- Liberar sus carreras en Google Sheets y limpiar el respaldo de Firebase.
- Mantener abierta la vista actual y restaurar la tabla moderna si el
  controlador antiguo intenta reemplazarla.
========================================================= */
(function(window, document){
  "use strict";

  var instalado = false;
  var observador = null;
  var restaurandoTabla = false;
  var restauracionPendiente = null;
  var reintentos = 0;
  var MAX_REINTENTOS = 100;

  function texto(valor){
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function config(){
    return window.AD_CONFIG || {};
  }

  function service(){
    if (!window.ADCoordinadoresService) {
      throw new Error("ADCoordinadoresService no está disponible.");
    }
    return window.ADCoordinadoresService;
  }

  function firebase(){
    if (!window.ADFirebaseService) {
      throw new Error("ADFirebaseService no está disponible.");
    }
    return window.ADFirebaseService;
  }

  function obtenerId(item){
    return texto(item && (item._docId || item.id));
  }

  function totalCarreras(item){
    var mapa = {};
    var listas = [
      Array.isArray(item && item.carreras) ? item.carreras : [],
      Array.isArray(item && item.carrerasAsignadas) ? item.carrerasAsignadas : []
    ];

    listas.forEach(function(lista){
      lista.forEach(function(carrera){
        var nombre = texto(
          carrera && typeof carrera === "object"
            ? carrera.nombreCarrera || carrera.NombreCarrera || carrera.codigoCarrera || carrera.CodigoCarrera || carrera.key || carrera.carrera || carrera.nombre
            : carrera
        );
        var clave = nombre.toLowerCase();
        if (clave) mapa[clave] = true;
      });
    });

    return Object.keys(mapa).length;
  }

  function diagnostico(mensaje){
    var panel = document.getElementById("ad-panel-diagnostico");
    if (panel) panel.textContent = mensaje || "";
  }

  function asegurarMensaje(){
    var existente = document.getElementById("ad-coordinadores-mensaje-accion");
    var seccion;
    var card;
    var tabla;
    var mensaje;

    if (existente) return existente;

    seccion = document.getElementById("ad-seccion-coordinadores");
    card = seccion && seccion.querySelector(".ad-card");
    tabla = card && card.querySelector(".ad-table-wrap");
    if (!card || !tabla) return null;

    mensaje = document.createElement("div");
    mensaje.id = "ad-coordinadores-mensaje-accion";
    mensaje.setAttribute("role", "status");
    mensaje.style.display = "none";
    mensaje.style.margin = "12px 0";
    mensaje.style.padding = "11px 14px";
    mensaje.style.borderRadius = "10px";
    mensaje.style.fontWeight = "700";
    mensaje.style.lineHeight = "1.4";
    card.insertBefore(mensaje, tabla);
    return mensaje;
  }

  function mostrarMensaje(mensaje, tipo){
    var el = asegurarMensaje();
    diagnostico(mensaje);
    if (!el) return;

    el.style.display = "block";
    el.textContent = mensaje || "";

    if (tipo === "error") {
      el.style.background = "#fff1f0";
      el.style.border = "1px solid #f0cbc7";
      el.style.color = "#9f1d16";
      return;
    }

    if (tipo === "warning") {
      el.style.background = "#fff8e7";
      el.style.border = "1px solid #ead39b";
      el.style.color = "#765714";
      return;
    }

    el.style.background = "#e8f7ee";
    el.style.border = "1px solid #ccebd7";
    el.style.color = "#14783d";
  }

  function asegurarSheetsService(){
    var servicio = service();

    if (typeof servicio.asegurarSheetsService === "function") {
      return servicio.asegurarSheetsService();
    }

    if (window.ADSheetsService) {
      return Promise.resolve(window.ADSheetsService);
    }

    return Promise.reject(new Error("ADSheetsService no está disponible."));
  }

  function extraerData(respuesta){
    var data = respuesta && respuesta.data !== undefined ? respuesta.data : respuesta;
    if (data && data.data !== undefined && data.ok === undefined) data = data.data;
    return data || {};
  }

  function eliminarRespaldoFirebase(docId){
    var coleccion = config().colecciones && config().colecciones.coordinadores;

    if (!coleccion) {
      return Promise.resolve({ eliminado: false, error: "Colección Firebase no configurada." });
    }

    return firebase().eliminarDocumento(coleccion, docId)
      .then(function(){
        return { eliminado: true, error: "" };
      })
      .catch(function(error){
        return {
          eliminado: false,
          error: error && error.message ? error.message : String(error)
        };
      });
  }

  function registrarLog(item, respuestaSheets, firebaseEliminado){
    var cfg = config();
    var colecciones = cfg.colecciones || {};
    var carreras = Array.isArray(respuestaSheets.carrerasLiberadas)
      ? respuestaSheets.carrerasLiberadas
      : [];

    if (!colecciones.logs) return Promise.resolve({ ok: false });

    return firebase().agregarDocumento(colecciones.logs, {
      accion: "ADMIN_COORDINADOR_ELIMINADO",
      coordinadorId: obtenerId(item),
      coordinadorNombre: texto(item && item.nombre),
      totalCarrerasLiberadas: Number(respuestaSheets.totalCarrerasLiberadas || carreras.length || 0),
      carrerasLiberadas: carreras,
      firebaseEliminado: firebaseEliminado === true,
      administrador: cfg.administrador || "administrador",
      origen: "administrador",
      modulo: "coordinadores",
      estado: "OK",
      detalle: "Coordinador eliminado de Google Sheets y carreras liberadas.",
      fecha: firebase().fechaCliente()
    }).catch(function(){
      return { ok: false };
    });
  }

  function eliminarCoordinador(id){
    var docId = texto(id);
    var coordinadorActual = null;
    var respuestaSheets = null;

    if (!docId) return Promise.reject(new Error("ID de coordinador vacío."));

    return service().obtenerCoordinador(docId)
      .then(function(item){
        if (!item) throw new Error("No se encontró el coordinador.");
        coordinadorActual = item;
        return asegurarSheetsService();
      })
      .then(function(sheets){
        return sheets.enviarPost("ELIMINAR_COORDINADOR", {
          id: docId,
          idRegistro: docId,
          coordinadorId: docId,
          nombre: texto(coordinadorActual && coordinadorActual.nombre),
          administrador: config().administrador || "administrador",
          origen: "administrador"
        });
      })
      .then(function(respuesta){
        respuestaSheets = extraerData(respuesta);
        if (respuestaSheets.ok === false) {
          throw new Error(
            respuestaSheets.mensaje ||
            respuestaSheets.error ||
            "Google Sheets no pudo eliminar el coordinador."
          );
        }
        return eliminarRespaldoFirebase(docId);
      })
      .then(function(resultadoFirebase){
        return registrarLog(
          coordinadorActual,
          respuestaSheets,
          resultadoFirebase.eliminado
        ).then(function(){
          return {
            ok: true,
            id: docId,
            coordinador: coordinadorActual,
            carrerasLiberadas: Array.isArray(respuestaSheets.carrerasLiberadas)
              ? respuestaSheets.carrerasLiberadas
              : [],
            totalCarrerasLiberadas: Number(
              respuestaSheets.totalCarrerasLiberadas ||
              (respuestaSheets.carrerasLiberadas && respuestaSheets.carrerasLiberadas.length) ||
              0
            ),
            firebaseEliminado: resultadoFirebase.eliminado,
            advertenciaFirebase: resultadoFirebase.error || ""
          };
        });
      });
  }

  function instalarServicio(){
    if (!window.ADCoordinadoresService) return false;
    window.ADCoordinadoresService.eliminarCoordinador = eliminarCoordinador;
    return true;
  }

  function tablaEsAntigua(tabla){
    if (!tabla) return false;
    return texto(tabla.textContent).indexOf("Disponible en bloque coordinadores") >= 0;
  }

  function agregarBotones(){
    var tabla = document.getElementById("ad-tabla-coordinadores");
    if (!tabla || tablaEsAntigua(tabla)) return false;

    Array.prototype.forEach.call(tabla.querySelectorAll("tr"), function(fila){
      var botonEstado = fila.querySelector(".ad-coord-estado");
      var celda;
      var boton;
      var id;

      if (!botonEstado || fila.querySelector(".ad-coord-eliminar")) return;

      id = texto(botonEstado.getAttribute("data-id"));
      celda = botonEstado.parentNode;
      if (!id || !celda) return;

      boton = document.createElement("button");
      boton.type = "button";
      boton.className = "ad-btn ad-btn-danger ad-coord-eliminar";
      boton.setAttribute("data-id", id);
      boton.textContent = "Eliminar";
      boton.style.marginLeft = "6px";
      celda.appendChild(boton);
    });

    return true;
  }

  function restaurarTablaModerna(){
    var app = window.ADCoordinadoresApp;

    if (restaurandoTabla || !app || typeof app.cargarCoordinadores !== "function") {
      return Promise.resolve();
    }

    restaurandoTabla = true;
    return app.cargarCoordinadores()
      .then(function(){
        agregarBotones();
      })
      .catch(function(error){
        mostrarMensaje(
          "No se pudo restaurar la tabla de coordinadores: " +
          (error && error.message ? error.message : String(error)),
          "error"
        );
      })
      .then(function(){
        restaurandoTabla = false;
      });
  }

  function programarRestauracion(){
    if (restauracionPendiente) window.clearTimeout(restauracionPendiente);
    restauracionPendiente = window.setTimeout(function(){
      restauracionPendiente = null;
      var tabla = document.getElementById("ad-tabla-coordinadores");
      if (tablaEsAntigua(tabla)) restaurarTablaModerna();
      else agregarBotones();
    }, 30);
  }

  function observarTabla(){
    var tabla = document.getElementById("ad-tabla-coordinadores");
    if (!tabla) return false;

    if (!observador) {
      observador = new MutationObserver(programarRestauracion);
      observador.observe(tabla, { childList: true, subtree: true });
    }

    programarRestauracion();
    return true;
  }

  function confirmarEliminacion(item){
    var cantidad = totalCarreras(item);
    var nombre = texto(item && item.nombre) || obtenerId(item);
    var mensaje = "¿Seguro que deseas eliminar al coordinador " + nombre + "?";

    if (cantidad > 0) {
      mensaje += "\n\nTiene " + cantidad + " carrera" +
        (cantidad === 1 ? "" : "s") +
        " asignada" + (cantidad === 1 ? "" : "s") +
        ". Al eliminarlo, quedará" + (cantidad === 1 ? "" : "n") +
        " libre" + (cantidad === 1 ? "" : "s") + ".";
    }

    mensaje += "\n\nEsta acción eliminará el registro de Google Sheets y su respaldo de Firebase.";
    return window.confirm(mensaje);
  }

  function actualizarVistaActual(){
    var app = window.ADCoordinadoresApp;
    var promesa = Promise.resolve();

    if (app && typeof app.cargarCoordinadores === "function") {
      promesa = app.cargarCoordinadores();
    }

    return promesa
      .then(function(){
        agregarBotones();
        if (app && typeof app.cargarCarreras === "function") {
          return app.cargarCarreras(true).catch(function(){ return null; });
        }
        return null;
      });
  }

  function manejarClick(evento){
    var boton = evento.target && evento.target.closest
      ? evento.target.closest(".ad-coord-eliminar")
      : null;
    var id;
    var item;
    var textoOriginal;

    if (!boton) return;

    evento.preventDefault();
    evento.stopPropagation();
    if (evento.stopImmediatePropagation) evento.stopImmediatePropagation();

    id = texto(boton.getAttribute("data-id"));
    if (!id || boton.disabled) return;

    textoOriginal = boton.textContent;
    boton.disabled = true;
    boton.textContent = "Revisando...";
    mostrarMensaje("Revisando coordinador antes de eliminar...", "warning");

    service().obtenerCoordinador(id)
      .then(function(encontrado){
        item = encontrado;
        if (!item) throw new Error("No se encontró el coordinador.");

        if (!confirmarEliminacion(item)) {
          boton.disabled = false;
          boton.textContent = textoOriginal;
          mostrarMensaje("Eliminación cancelada.", "warning");
          return null;
        }

        boton.textContent = "Eliminando...";
        mostrarMensaje("Eliminando coordinador y liberando sus carreras...", "warning");
        return service().eliminarCoordinador(id);
      })
      .then(function(resultado){
        if (!resultado) return null;

        return actualizarVistaActual().then(function(){
          var total = Number(resultado.totalCarrerasLiberadas || 0);
          var mensaje = "Coordinador eliminado correctamente.";

          if (total > 0) {
            mensaje += " " + total + " carrera" +
              (total === 1 ? " quedó" : "s quedaron") +
              " libre" + (total === 1 ? "." : "s.");
          }

          if (!resultado.firebaseEliminado) {
            mensaje += " Google Sheets quedó actualizado, pero no se pudo limpiar el respaldo de Firebase.";
            mostrarMensaje(mensaje, "warning");
          } else {
            mostrarMensaje(mensaje, "success");
          }

          return resultado;
        });
      })
      .catch(function(error){
        boton.disabled = false;
        boton.textContent = textoOriginal;
        mostrarMensaje(
          "Error al eliminar coordinador: " +
          (error && error.message ? error.message : String(error)),
          "error"
        );
      });
  }

  function instalar(){
    if (instalado) return;

    if (!instalarServicio() || !observarTabla()) {
      reintentos += 1;
      if (reintentos < MAX_REINTENTOS) window.setTimeout(instalar, 200);
      return;
    }

    instalado = true;
    asegurarMensaje();
    document.addEventListener("click", manejarClick, true);
    window.addEventListener("ad:vista-cambiada", function(evento){
      if (evento.detail && evento.detail.id === "ad-seccion-coordinadores") {
        window.setTimeout(restaurarTablaModerna, 0);
      }
    });
    programarRestauracion();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", instalar);
  } else {
    instalar();
  }
})(window, document);
