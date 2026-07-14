/* =========================================================
Archivo: ad-estudiantes.actions.service.js
Ruta: /administrador/ad-js/ad-estudiantes.actions.service.js
Función:
- Devolver propuestas desde el administrador.
- Eliminar propuestas activas sin perder trazabilidad.
- Respaldar cada operación en titulos_historial.
- Registrar auditoría en titulos_logs.
- Evitar que Sheets o historial restauren visualmente títulos eliminados.
========================================================= */
(function(window){
  "use strict";

  function cfg(){ return window.AD_CONFIG || {}; }
  function fs(){
    if (!window.ADFirebaseService) throw new Error("ADFirebaseService no está disponible.");
    return window.ADFirebaseService;
  }
  function cols(){ return cfg().colecciones || {}; }
  function texto(valor){ return String(valor === null || valor === undefined ? "" : valor).trim(); }
  function limpiarCedula(valor){ return texto(valor).replace(/[^0-9A-Za-z]/g, ""); }

  function obtenerRaw(item){
    if (item && item.detalle && item.detalle.raw) return item.detalle.raw;
    if (item && item.titulo && item.titulo.raw) return item.titulo.raw;
    if (item && item.revision && item.revision.raw) return item.revision.raw;
    return {};
  }

  function obtenerDocumentoId(item){
    var raw = obtenerRaw(item);
    return texto(raw._docId || raw.documentoId || raw.idDocumento || raw.tituloId || (item && item.cedula));
  }

  function tieneDocumentoActivo(item){
    return Boolean(obtenerDocumentoId(item) && obtenerRaw(item)._docId);
  }

  function validarMotivo(motivo){
    var limpio = texto(motivo);
    if (limpio.length < 5) throw new Error("Escribe un motivo de al menos 5 caracteres.");
    return limpio;
  }

  function historialId(item, accion){
    return [
      limpiarCedula(item && item.cedula) || obtenerDocumentoId(item) || "SIN_ID",
      accion,
      new Date().toISOString().replace(/[^0-9A-Za-z]/g, ""),
      Math.floor(Math.random() * 10000)
    ].join("__");
  }

  function ejecutar(item, opciones){
    var documentoId = obtenerDocumentoId(item);
    var motivo = validarMotivo(opciones && opciones.motivo);
    var accion = texto(opciones && opciones.accion);
    var patchFactory = opciones && opciones.patchFactory;
    var db;
    var refTitulo;
    var FieldValue;

    if (!documentoId) return Promise.reject(new Error("No se encontró el documento activo de títulos en Firebase."));
    if (typeof patchFactory !== "function") return Promise.reject(new Error("La acción administrativa no está configurada correctamente."));

    return fs().inicializar().then(function(){
      db = fs().obtenerDb();
      FieldValue = window.firebase.firestore.FieldValue;
      refTitulo = db.collection(cols().titulos).doc(documentoId);
      return refTitulo.get();
    }).then(function(snapshot){
      var actual;
      var cedula;
      var periodo;
      var hid;
      var refHistorial;
      var refLog;
      var respaldo;
      var patch;
      var batch;
      var fechaLocal = new Date().toISOString();

      if (!snapshot.exists) throw new Error("El documento activo ya no existe. Actualiza la pantalla e inténtalo nuevamente.");

      actual = snapshot.data() || {};
      cedula = limpiarCedula(actual.cedula || actual.numeroIdentificacion || (item && item.cedula));
      periodo = texto(actual.periodoId || actual.periodoLabel || (item && (item.periodoId || item.periodoLabel)));
      hid = historialId(item, accion);
      refHistorial = db.collection(cols().historial).doc(hid);
      refLog = db.collection(cols().logs).doc();

      respaldo = Object.assign({}, actual, {
        _idOriginal:snapshot.id,
        accionHistorial:accion,
        motivoAdministrador:motivo,
        archivadoPor:cfg().administrador || "administrador",
        archivadoEn:FieldValue.serverTimestamp(),
        archivadoEnLocal:fechaLocal
      });

      patch = patchFactory({
        actual:actual,
        motivo:motivo,
        fechaLocal:fechaLocal,
        FieldValue:FieldValue,
        administrador:cfg().administrador || "administrador"
      });

      batch = db.batch();
      batch.set(refHistorial,respaldo,{ merge:false });
      batch.set(refTitulo,patch,{ merge:true });
      batch.set(refLog,{
        accion:accion,
        modulo:"estudiantes_administrador",
        origen:"administrador",
        estado:"OK",
        documentoId:snapshot.id,
        cedula:cedula,
        periodo:periodo,
        motivo:motivo,
        historialId:hid,
        administrador:cfg().administrador || "administrador",
        fecha:fechaLocal,
        creadoEn:FieldValue.serverTimestamp()
      });

      return batch.commit().then(function(){
        return { ok:true, accion:accion, documentoId:snapshot.id, historialId:hid, cedula:cedula };
      });
    });
  }

  function devolverTitulos(item, motivo){
    return ejecutar(item,{
      accion:"ADMIN_TITULOS_DEVUELTOS",
      motivo:motivo,
      patchFactory:function(ctx){
        return {
          estado:"DEVUELTO",
          estadoFinal:"DEVUELTO",
          permitirReenvio:true,
          titulosEliminadosPorAdmin:false,
          motivoDevolucion:ctx.motivo,
          comentarioCoordinador:ctx.motivo,
          coordinador:{ id:"administrador", nombre:"Administrador" },
          coordinadorNombre:"Administrador",
          devueltoPor:ctx.administrador,
          origenDevolucion:"administrador",
          fechaDevolucion:ctx.FieldValue.serverTimestamp(),
          fechaDevolucionLocal:ctx.fechaLocal,
          fechaRevision:ctx.FieldValue.serverTimestamp(),
          fechaRevisionLocal:ctx.fechaLocal,
          tituloAprobado:ctx.FieldValue.delete(),
          tituloaprobado:ctx.FieldValue.delete(),
          tituloFinal:ctx.FieldValue.delete(),
          tituloSeleccionadoNumero:ctx.FieldValue.delete(),
          tituloOriginalSeleccionado:ctx.FieldValue.delete(),
          actualizadoEn:ctx.FieldValue.serverTimestamp(),
          actualizadoEnLocal:ctx.fechaLocal
        };
      }
    });
  }

  function eliminarTitulos(item, motivo){
    return ejecutar(item,{
      accion:"ADMIN_TITULOS_ELIMINADOS",
      motivo:motivo,
      patchFactory:function(ctx){
        return {
          estado:"NO_ENVIO",
          estadoFinal:"NO_ENVIO",
          permitirReenvio:true,
          titulosEliminadosPorAdmin:true,
          eliminadoPor:ctx.administrador,
          motivoEliminacion:ctx.motivo,
          fechaEliminacion:ctx.FieldValue.serverTimestamp(),
          fechaEliminacionLocal:ctx.fechaLocal,
          titulo1:ctx.FieldValue.delete(),
          titulo2:ctx.FieldValue.delete(),
          titulo3:ctx.FieldValue.delete(),
          titulo:ctx.FieldValue.delete(),
          propuestas:ctx.FieldValue.delete(),
          titulosEnviados:ctx.FieldValue.delete(),
          tituloPreferido:ctx.FieldValue.delete(),
          tituloPreferidoTexto:ctx.FieldValue.delete(),
          tituloPreferidoNumero:ctx.FieldValue.delete(),
          preferido:ctx.FieldValue.delete(),
          tituloAprobado:ctx.FieldValue.delete(),
          tituloaprobado:ctx.FieldValue.delete(),
          tituloFinal:ctx.FieldValue.delete(),
          tituloSeleccionadoNumero:ctx.FieldValue.delete(),
          tituloOriginalSeleccionado:ctx.FieldValue.delete(),
          comentarioCoordinador:ctx.FieldValue.delete(),
          coordinador:ctx.FieldValue.delete(),
          coordinadorNombre:ctx.FieldValue.delete(),
          fechaEnvio:ctx.FieldValue.delete(),
          fechaenviotitulos:ctx.FieldValue.delete(),
          fechaRevision:ctx.FieldValue.delete(),
          fechaRevisionLocal:ctx.FieldValue.delete(),
          actualizadoEn:ctx.FieldValue.serverTimestamp(),
          actualizadoEnLocal:ctx.fechaLocal
        };
      }
    });
  }

  function limpiarDetalleEliminado(item){
    var raw = obtenerRaw(item);
    var eliminado = raw.titulosEliminadosPorAdmin === true || (
      String(raw.estado || "").toUpperCase() === "NO_ENVIO" &&
      raw.permitirReenvio === true &&
      Boolean(raw.motivoEliminacion)
    );
    var detalle;

    if (!eliminado) return item;

    detalle = Object.assign({},item.detalle || item.titulo || {});
    detalle.titulo1 = "";
    detalle.titulo2 = "";
    detalle.titulo3 = "";
    detalle.tituloPreferido = "";
    detalle.tituloAprobado = "";
    detalle.tituloaprobado = "";
    detalle.coordinador = "";
    detalle.coordinadorNombre = "";
    detalle.comentario = "";
    detalle.comentarioCoordinador = "";
    detalle.fechaEnvio = "";
    detalle.fechaRevision = "";
    detalle.estado = "NO_ENVIO";
    detalle.estadoNuevo = "NO_ENVIO";
    detalle.tienePropuestas = false;
    detalle.propuestasCompletas = false;
    detalle.tieneResolucion = false;
    detalle.raw = raw;

    item.estado = "NO_ENVIO";
    item.registroIncompleto = false;
    item.detalle = detalle;
    item.titulo = detalle;
    item.revision = detalle;
    return item;
  }

  function instalarProteccionConsultas(){
    var base = window.ADEstudiantesService;
    var cargarOriginal;
    if (!base || base.__accionesProtegidas || typeof base.cargar !== "function") return;

    cargarOriginal = base.cargar;
    base.cargar = function(periodo){
      return cargarOriginal.call(base,periodo).then(function(resultado){
        resultado = resultado || {};
        resultado.estudiantes = (resultado.estudiantes || []).map(limpiarDetalleEliminado);
        return resultado;
      });
    };
    base.__accionesProtegidas = true;
  }

  instalarProteccionConsultas();

  window.ADEstudiantesActionsService = {
    obtenerDocumentoId:obtenerDocumentoId,
    tieneDocumentoActivo:tieneDocumentoActivo,
    devolverTitulos:devolverTitulos,
    eliminarTitulos:eliminarTitulos,
    limpiarDetalleEliminado:limpiarDetalleEliminado
  };
})(window);
