/* =========================================================
Archivo: ad-coordinadores.eliminar.patch.js
Ruta: /administrador/ad-js/ad-coordinadores.eliminar.patch.js
Función:
- Agregar la opción Eliminar en la tabla de coordinadores.
- Confirmar la eliminación e informar sobre carreras asignadas.
- Eliminar el coordinador de Google Sheets y de Firebase.
========================================================= */
(function(window, document){
  "use strict";

  var instalado = false;
  var observador = null;
  var reintentos = 0;
  var MAX_REINTENTOS = 100;

  function texto(valor){
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function config(){
    return window.AD_CONFIG || {};
  }

  function firebase(){
    if (!window.ADFirebaseService) {
      throw new Error("ADFirebaseService no está disponible.");
    }
    return window.ADFirebaseService;
  }

  function service(){
    if (!window.ADCoordinadoresService) {
      throw new Error("ADCoordinadoresService no está disponible.");
    }
    return window.ADCoordinadoresService;
  }

  function diagnostico(mensaje){
    var panel = document.getElementById("ad-panel-diagnostico");
    if (panel) panel.textContent = mensaje || "";
  }

  function obtenerId(item){
    return texto(item && (item._docId || item.id));
  }

  function totalCarreras(item){
    var nombres = Array.isArray(item && item.carreras) ? item.carreras : [];
    var detalle = Array.isArray(item && item.carrerasAsignadas) ? item.carrerasAsignadas : [];
    var claves = {};

    nombres.forEach(function(carrera){
      var clave = texto(carrera && (
        carrera.codigoCarrera ||
        carrera.nombreCarrera ||
        carrera.key ||
        carrera
      )).toLowerCase();
      if (clave) claves[clave] = true;
    });

    detalle.forEach(function(carrera){
      var clave = texto(carrera && (
        carrera.codigoCarrera ||
        carrera.nombreCarrera ||
        carrera.key ||
        carrera
      )).toLowerCase();
      if (clave) claves[clave] = true;
    });

    return Object.keys(claves).length;
  }

  function registrarLog(item){
    var cfg = config();
    var colecciones = cfg.colecciones || {};

    if (!colecciones.logs) return Promise.resolve({ ok: false });

    return firebase().agregarDocumento(colecciones.logs, {
      accion: "ADMIN_COORDINADOR_ELIMINADO",
      coordinadorId: obtenerId(item),
      coordinadorNombre: texto(item && item.nombre),
      totalCarreras: totalCarreras(item),
      administrador: cfg.administrador || "administrador",
      origen: "administrador",
      modulo: "coordinadores",
      estado: "OK",
      detalle: "Coordinador eliminado de Google Sheets y Firebase.",
      fecha: firebase().fechaCliente()
    }).catch(function(){
      return { ok: false };
    });
  }

  function eliminarCoordinador(id){
    var docId = texto(id);
    var coordinadorActual = null;
    var restantes = [];

    if (!docId) {
      return Promise.reject(new Error("ID de coordinador vacío."));
    }

    return service().listarCoordinadores(1000)
      .then(function(resultado){
        var lista = Array.isArray(resultado && resultado.coordinadores)
          ? resultado.coordinadores
          : [];

        coordinadorActual = lista.find(function(item){
          return obtenerId(item) === docId;
        }) || null;

        if (!coordinadorActual) {
          throw new Error("No se encontró el coordinador.");
        }

        restantes = lista.filter(function(item){
          return obtenerId(item) !== docId;
        });

        if (!restantes.length) {
          throw new Error("No se puede eliminar el último coordinador del catálogo.");
        }

        return service().sincronizarCatalogo(
          restantes,
          "administrador-eliminacion-coordinador"
        );
      })
      .then(function(){
        var coleccion = config().colecciones && config().colecciones.coordinadores;
        if (!coleccion) {
          throw new Error("No está configurada la colección de coordinadores.");
        }
        return firebase().eliminarDocumento(coleccion, docId);
      })
      .then(function(){
        return registrarLog(coordinadorActual);
      })
      .then(function(){
        return {
          ok: true,
          id: docId,
          coordinador: coordinadorActual,
          totalRestantes: restantes.length,
          mensaje: "Coordinador eliminado correctamente."
        };
      });
  }

  function instalarServicio(){
    if (!window.ADCoordinadoresService) return false;
    if (typeof window.ADCoordinadoresService.eliminarCoordinador !== "function") {
      window.ADCoordinadoresService.eliminarCoordinador = eliminarCoordinador;
    }
    return true;
  }

  function agregarBotones(){
    var tabla = document.getElementById("ad-tabla-coordinadores");
    if (!tabla) return false;

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

  function observarTabla(){
    var tabla = document.getElementById("ad-tabla-coordinadores");
    if (!tabla) return false;

    if (!observador) {
      observador = new MutationObserver(function(){
        agregarBotones();
      });
      observador.observe(tabla, { childList: true, subtree: true });
    }

    agregarBotones();
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
        ". Al eliminarlo, esas carreras quedarán sin coordinador.";
    }

    mensaje += "\n\nEsta acción eliminará el registro de Google Sheets y Firebase.";
    return window.confirm(mensaje);
  }

  function manejarClick(evento){
    var boton = evento.target && evento.target.closest
      ? evento.target.closest(".ad-coord-eliminar")
      : null;
    var id;
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
    diagnostico("Revisando coordinador antes de eliminar...");

    service().obtenerCoordinador(id)
      .then(function(item){
        if (!item) throw new Error("No se encontró el coordinador.");

        if (!confirmarEliminacion(item)) {
          boton.disabled = false;
          boton.textContent = textoOriginal;
          diagnostico("Eliminación cancelada.");
          return null;
        }

        boton.textContent = "Eliminando...";
        diagnostico("Eliminando coordinador de Google Sheets y Firebase...");
        return service().eliminarCoordinador(id);
      })
      .then(function(resultado){
        if (!resultado) return;
        diagnostico("Coordinador eliminado correctamente.");
        window.alert("Coordinador eliminado correctamente.");
        window.location.reload();
      })
      .catch(function(error){
        boton.disabled = false;
        boton.textContent = textoOriginal;
        diagnostico("Error al eliminar coordinador:\n" + (error.message || String(error)));
      });
  }

  function instalar(){
    if (instalado) return;

    if (!instalarServicio() || !observarTabla()) {
      reintentos += 1;
      if (reintentos < MAX_REINTENTOS) {
        window.setTimeout(instalar, 200);
      }
      return;
    }

    instalado = true;
    document.addEventListener("click", manejarClick, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", instalar);
  } else {
    instalar();
  }
})(window, document);
