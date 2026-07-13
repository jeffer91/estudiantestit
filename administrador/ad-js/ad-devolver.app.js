/* =========================================================
Archivo: ad-devolver.app.js
Ruta: /administrador/ad-js/ad-devolver.app.js
Función:
- Devolver título enviado para que el estudiante pueda enviar nuevamente.
- Copia el documento a historial, registra log y elimina el original.
========================================================= */
(function(window, document){
  "use strict";

  function cfg(){ return window.AD_CONFIG || {}; }
  function fs(){ if (!window.ADFirebaseService) throw new Error("ADFirebaseService no está disponible."); return window.ADFirebaseService; }
  function ts(){ if (!window.ADTitulosService) throw new Error("ADTitulosService no está disponible."); return window.ADTitulosService; }
  function el(id){ return document.getElementById(id); }
  function txt(v){ return String(v === null || v === undefined ? "" : v).trim(); }
  function val(id){ var x = el(id); return x ? txt(x.value) : ""; }
  function setText(id,v){ var x = el(id); if (x) x.textContent = v; }
  function clean(v){ return ts().limpiarCedula ? ts().limpiarCedula(v) : txt(v).replace(/[^0-9A-Za-z]/g, ""); }
  function cols(){ return cfg().colecciones || {}; }
  function accion(){ return (cfg().accionesLog || {}).tituloDevuelto || "ADMIN_TITULO_DEVUELTO"; }

  function detener(ev){
    if (!ev) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
  }

  function buscarTitulo(cedula){
    var id = clean(cedula);
    if (!id) return Promise.reject(new Error("Ingresa la cédula."));
    return fs().leerDocumento(cols().titulos, id).then(function(resp){
      if (resp.existe) return { id: resp.id, data: resp.data };
      return fs().consultarPorCampo(cols().titulos, "cedula", "==", id, 1).then(function(q){
        if (q.datos && q.datos.length) return { id: q.datos[0]._docId, data: q.datos[0] };
        return null;
      });
    });
  }

  function crearHistorialId(cedula){
    return clean(cedula) + "__" + new Date().toISOString().replace(/[^0-9A-Za-z]/g, "");
  }

  function registrarLog(cedula, motivo, originalId, historialId){
    return fs().agregarDocumento(cols().logs, {
      accion: accion(),
      cedula: clean(cedula),
      motivo: motivo || "Reinicio de intento desde administración",
      idOriginal: originalId,
      historialId: historialId,
      administrador: cfg().administrador || "administrador",
      origen: "administrador",
      modulo: "devolver_titulo",
      estado: "OK",
      fecha: fs().fechaCliente()
    }).catch(function(){ return { ok:false }; });
  }

  function devolverTitulo(cedulaValor, motivoValor){
    var cedula = clean(cedulaValor);
    var motivo = txt(motivoValor) || "Reinicio de intento desde administración";
    if (!cedula) return Promise.reject(new Error("Ingresa la cédula."));

    return buscarTitulo(cedula).then(function(encontrado){
      if (!encontrado) throw new Error("No existe título enviado para esa cédula.");
      var historialId = crearHistorialId(cedula);
      var copia = Object.assign({}, encontrado.data || {}, {
        _idOriginal: encontrado.id,
        accionHistorial: "DEVOLUCION_TITULO",
        motivoArchivo: motivo,
        archivadoEn: fs().fechaCliente(),
        archivadoPor: cfg().administrador || "administrador",
        cedula: cedula
      });
      return fs().guardarDocumento(cols().historial, historialId, copia, { merge:false }).then(function(){
        return registrarLog(cedula, motivo, encontrado.id, historialId);
      }).then(function(){
        return fs().eliminarDocumento(cols().titulos, encontrado.id);
      }).then(function(){
        return { ok:true, cedula:cedula, historialId:historialId, originalId:encontrado.id };
      });
    });
  }

  function ejecutar(ev){
    detener(ev);
    setText("ad-resultado-devolver", "Procesando devolución...");
    return devolverTitulo(val("ad-devolver-cedula"), val("ad-devolver-motivo")).then(function(r){
      setText("ad-resultado-devolver", "Título devuelto correctamente.\nCédula: " + r.cedula + "\nHistorial: " + r.historialId + "\nDocumento eliminado de titulos: " + r.originalId);
      setText("ad-panel-diagnostico", "Devolución completada. El estudiante ya puede enviar nuevamente.");
    }).catch(function(error){
      setText("ad-resultado-devolver", "Error al devolver título:\n" + (error.message || String(error)));
      setText("ad-panel-diagnostico", "Error al devolver título.");
    });
  }

  function conectar(){
    var b = el("ad-btn-devolver-titulo");
    if (b) b.addEventListener("click", ejecutar, true);
  }

  document.addEventListener("DOMContentLoaded", conectar);
  window.ADDevolverApp = { devolverTitulo: devolverTitulo, ejecutar: ejecutar };
})(window, document);
