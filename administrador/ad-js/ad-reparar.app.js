/* =========================================================
Archivo: ad-reparar.app.js
Ruta: /administrador/ad-js/ad-reparar.app.js
Función:
- Reparar documentos de titulos con ID incorrecto.
- Crea documento correcto con ID cédula, respalda el viejo y registra log.
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

  function detener(ev){
    if (!ev) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
  }

  function extraerCedula(docId, data){
    var directo = clean((data || {}).cedula || (data || {}).numeroIdentificacion || "");
    if (directo) return directo;
    var partes = txt(docId).split("__");
    return clean(partes[partes.length - 1] || docId);
  }

  function historialId(cedula){
    return clean(cedula) + "__REPARACION__" + new Date().toISOString().replace(/[^0-9A-Za-z]/g, "");
  }

  function leerIncorrecto(idViejo){
    var id = txt(idViejo);
    if (!id) return Promise.reject(new Error("Ingresa el ID incorrecto."));
    return fs().leerDocumento(cols().titulos, id).then(function(resp){
      if (!resp.existe) throw new Error("No existe ese documento en titulos.");
      return { id: resp.id, data: resp.data || {} };
    });
  }

  function construirCorrecto(viejo){
    var cedula = extraerCedula(viejo.id, viejo.data);
    if (!cedula) return Promise.reject(new Error("No se pudo extraer la cédula."));
    return ts().buscarEstudiantePorCedula(cedula).then(function(est){
      var nuevo = Object.assign({}, viejo.data || {});
      nuevo.cedula = cedula;
      nuevo.numeroIdentificacion = nuevo.numeroIdentificacion || cedula;
      if (est) {
        nuevo.NombreCarrera = est.NombreCarrera || nuevo.NombreCarrera || "";
        nuevo.CodigoCarrera = est.CodigoCarrera || nuevo.CodigoCarrera || "";
        nuevo.periodoId = est.periodoId || est.ultimoPeriodoId || nuevo.periodoId || "";
        nuevo.periodoLabel = est.periodoLabel || nuevo.periodoLabel || "";
        nuevo.Nombres = est.Nombres || nuevo.Nombres || nuevo.nombres || "";
      }
      nuevo._reparadoDesde = viejo.id;
      nuevo.reparadoEn = fs().fechaCliente();
      nuevo.reparadoPor = cfg().administrador || "administrador";
      return { cedula: cedula, data: nuevo, estudiante: est || null };
    });
  }

  function logReparacion(idViejo, cedula, hid){
    return fs().agregarDocumento(cols().logs, {
      accion: (cfg().accionesLog || {}).firebaseReparado || "ADMIN_FIREBASE_REPARADO",
      idOriginal: idViejo,
      cedula: cedula,
      historialId: hid,
      administrador: cfg().administrador || "administrador",
      origen: "administrador",
      modulo: "reparar_firebase",
      estado: "OK",
      fecha: fs().fechaCliente()
    }).catch(function(){ return { ok:false }; });
  }

  function reparar(idViejo){
    return leerIncorrecto(idViejo).then(function(viejo){
      return construirCorrecto(viejo).then(function(nuevo){
        var hid = historialId(nuevo.cedula);
        var respaldo = Object.assign({}, viejo.data || {}, {
          _idOriginal: viejo.id,
          accionHistorial: "REPARACION_FIREBASE",
          archivadoEn: fs().fechaCliente(),
          archivadoPor: cfg().administrador || "administrador"
        });
        return fs().guardarDocumento(cols().historial, hid, respaldo, { merge:false }).then(function(){
          return fs().guardarDocumento(cols().titulos, nuevo.cedula, nuevo.data, { merge:true });
        }).then(function(){
          return logReparacion(viejo.id, nuevo.cedula, hid);
        }).then(function(){
          return fs().eliminarDocumento(cols().titulos, viejo.id);
        }).then(function(){
          return { ok:true, idViejo: viejo.id, cedula: nuevo.cedula, historialId: hid };
        });
      });
    });
  }

  function detectar(ev){
    detener(ev);
    var id = val("ad-reparar-doc-id");
    setText("ad-resultado-reparar", "Revisando documento...");
    return leerIncorrecto(id).then(function(viejo){
      var ced = extraerCedula(viejo.id, viejo.data);
      setText("ad-resultado-reparar", "Documento encontrado.\nID actual: " + viejo.id + "\nCédula detectada: " + ced + "\nID correcto esperado: " + ced);
    }).catch(function(error){ setText("ad-resultado-reparar", "Error al detectar:\n" + (error.message || String(error))); });
  }

  function ejecutar(ev){
    detener(ev);
    setText("ad-resultado-reparar", "Reparando documento...");
    return reparar(val("ad-reparar-doc-id")).then(function(r){
      setText("ad-resultado-reparar", "Documento reparado correctamente.\nID anterior: " + r.idViejo + "\nID correcto: " + r.cedula + "\nHistorial: " + r.historialId);
      setText("ad-panel-diagnostico", "Reparación completada. Firebase queda con titulos / cedula.");
    }).catch(function(error){
      setText("ad-resultado-reparar", "Error al reparar:\n" + (error.message || String(error)));
      setText("ad-panel-diagnostico", "Error en reparación Firebase.");
    });
  }

  function conectar(){
    var b1 = el("ad-btn-detectar-reparaciones");
    var b2 = el("ad-btn-reparar-documento");
    if (b1) b1.addEventListener("click", detectar, true);
    if (b2) b2.addEventListener("click", ejecutar, true);
  }

  document.addEventListener("DOMContentLoaded", conectar);
  window.ADRepararApp = { detectar: detectar, reparar: reparar, ejecutar: ejecutar };
})(window, document);
