/* =========================================================
Archivo: ad-coordinadores.eliminar.patch.js
Ruta: /administrador/ad-js/ad-coordinadores.eliminar.patch.js
Función:
- Agregar la opción Eliminar en la tabla vigente de coordinadores.
- Eliminar primero del catálogo principal de Google Sheets.
- Liberar todas las carreras vinculadas al coordinador eliminado.
- Limpiar el respaldo de Firebase sin bloquear el resultado principal.
- Actualizar la vista actual sin recargar ni volver a la pantalla antigua.
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

  function obtenerNombreCarrera(item){
    if (typeof item === "string") return texto(item);

    return texto(item && (
      item.nombreCarrera ||
      item.NombreCarrera ||
      item.codigoCarrera ||
      item.CodigoCarrera ||
      item.key ||
      item.carrera ||
      item.nombre
    ));
  }

  function claveCarrera(item){
    return obtenerNombreCarrera(item)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function carrerasDelCoordinador(item){
    var lista = [];
    var vistos = {};
    var nombres = Array.isArray(item && item.carreras) ? item.carreras : [];
    var detalle = Array.isArray(item && item.carrerasAsignadas) ? item.carrerasAsignadas : [];

    nombres.concat(detalle).forEach(function(carrera){
      var clave = claveCarrera(carrera);
      if (!clave || vistos[clave]) return;
      vistos[clave] = true;
      lista.push(carrera);
    });

    return lista;
  }

  function totalCarreras(item){
    return carrerasDelCoordinador(item).length;
  }

  function carreraCoincide(origen, objetivo){
    if (service().coincideCarrera) {
      return service().coincideCarrera(origen, objetivo);
    }

    return claveCarrera(origen) === claveCarrera(objetivo);
  }

  function liberarCarreras(lista, coordinadorEliminado){
    var carrerasLiberadas = carrerasDelCoordinador(coordinadorEliminado);

    if (!carrerasLiberadas.length) {
      return {
        coordinadores: lista.slice(),
        carrerasLiberadas: []
      };
    }

    return {
      coordinadores: lista.map(function(item){
        var carreras = Array.isArray(item.carreras) ? item.carreras : [];
        var asignadas = Array.isArray(item.carrerasAsignadas) ? item.carrerasAsignadas : [];

        carreras = carreras.filter(function(carrera){
          return !carrerasLiberadas.some(function(liberada){
            return carreraCoincide(carrera, liberada);
          });
        });

        asignadas = asignadas.filter(function(carrera){
          return !carrerasLiberadas.some(function(liberada){
            return carreraCoincide(carrera, liberada);
          });
        });

        return Object.assign({}, item, {
          carreras: carreras,
          carrerasAsignadas: asignadas
        });
      }),
      carrerasLiberadas: carrerasLiberadas
    };
  }

  function asegurarMensajeVisible(){
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
    var el = asegurarMensajeVisible();

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

  function registrarLog(item, carrerasLiberadas, firebaseEliminado){
    var cfg = config();
    var colecciones = cfg.colecciones || {};

    if (!colecciones.logs) return Promise.resolve({ ok: false });

    return firebase().agregarDocumento(colecciones.logs, {
      accion: "ADMIN_COORDINADOR_ELIMINADO",
      coordinadorId: obtenerId(item),
      coordinadorNombre: texto(item && item.nombre),
      totalCarrerasLiberadas: carrerasLiberadas.length,
      carrerasLiberadas: carrerasLiberadas.map(obtenerNombreCarrera),
      firebaseEliminado: firebaseEliminado === true,
      administrador: cfg.administrador || "administrador",
      origen: "administrador",
      modulo: "coordinadores",
      estado: "OK",
      detalle: "Coordinador eliminado del catálogo principal y carreras liberadas.",
      fecha: firebase().fechaCliente()
    }).catch(function(){
      return { ok: false };
    });
  }

  function eliminarRespaldoFirebase(docId){
    var coleccion = config().colecciones && config().colecciones.coordinadores;

    if (!coleccion) {
      return Promise.resolve({
        eliminado: false,
        error: "No está configurada la colección de coordinadores."
      });
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

  function eliminarCoordinador(id){
    var docId = texto(id);
    var coordinadorActual = null;
    var restantes = [];
    var carrerasLiberadas = [];

    if (!docId) {
      return Promise.reject(new Error("ID de coordinador vacío."));
    }

    return service().listarCoordinadores(1000)
      .then(function(resultado){
        var lista = Array.isArray(resultado && resultado.coordinadores)
          ? resultado.coordinadores
          : [];
        var liberacion;

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

        liberacion = liberarCarreras(restantes, coordinadorActual);
        restantes = liberacion.coordinadores;
        carrerasLiberadas = liberacion.carrerasLiberadas;

        /*
          Google Sheets es la fuente principal. La operación se considera
          completada únicamente después de reemplazar allí el catálogo.
        */
        return service().sincronizarCatalogo(
          restantes,
          "administrador-eliminacion-coordinador"
        );
      })
      .then(function(){
        /*
          Firebase es respaldo. Su limpieza se intenta después y un fallo
          no revierte la eliminación ya realizada en Google Sheets.
        */
        return eliminarRespaldoFirebase(docId);
      })
      .then(function(resultadoFirebase){
        return registrarLog(
          coordinadorActual,
          carrerasLiberadas,
          resultadoFirebase.eliminado
        ).then(function(){
          return {
            ok: true,
            id: docId,
            coordinador: coordinadorActual,
            carrerasLiberadas: carrerasLiberadas,
            totalRestantes: restantes.length,
            firebaseEliminado: resultadoFirebase.eliminado,
            advertenciaFirebase: resultadoFirebase.error || "",
            mensaje: "Coordinador eliminado y carreras liberadas correctamente."
          };
        });
      });
  }

  function instalarServicio(){
    if (!window.ADCoordinadoresService) return false;
    window.ADCoordinadoresService.eliminarCoordinador = eliminarCoordinador;
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
        ". Al eliminarlo, quedará" + (cantidad === 1 ? "" : "n") +
        " libre" + (cantidad === 1 ? "" : "s") + ".";
    }

    mensaje += "\n\nEsta acción eliminará el registro principal de Google Sheets y limpiará su respaldo de Firebase.";
    return window.confirm(mensaje);
  }

  function actualizarVistaActual(){
    var app = window.ADCoordinadoresApp || null;
    var promesa = Promise.resolve();

    if (app && typeof app.cargarCoordinadores === "function") {
      promesa = app.cargarCoordinadores();
    }

    return promesa.then(function(){
      if (app && typeof app.cargarDatosCarreras === "function") {
        return app.cargarDatosCarreras(true).catch(function(){ return null; });
      }
      return null;
    }).then(function(){
      if (
        window.ADTitulosApp &&
        typeof window.ADTitulosApp.mostrarVista === "function"
      ) {
        window.ADTitulosApp.mostrarVista("ad-seccion-coordinadores");
      }
    });
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
    mostrarMensaje("Revisando coordinador antes de eliminar...", "warning");

    service().obtenerCoordinador(id)
      .then(function(item){
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
          var total = resultado.carrerasLiberadas.length;
          var mensaje = "Coordinador eliminado correctamente.";

          if (total) {
            mensaje += " " + total + " carrera" +
              (total === 1 ? " quedó" : "s quedaron") +
              " libre" + (total === 1 ? "." : "s.");
          }

          if (!resultado.firebaseEliminado) {
            mensaje += " La eliminación principal quedó guardada en Google Sheets, pero no se pudo limpiar el respaldo de Firebase.";
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
      if (reintentos < MAX_REINTENTOS) {
        window.setTimeout(instalar, 200);
      }
      return;
    }

    instalado = true;
    asegurarMensajeVisible();
    document.addEventListener("click", manejarClick, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", instalar);
  } else {
    instalar();
  }
})(window, document);
