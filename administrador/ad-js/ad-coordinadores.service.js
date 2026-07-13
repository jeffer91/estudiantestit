/* =========================================================
Archivo: ad-coordinadores.service.js
Ruta: /administrador/ad-js/ad-coordinadores.service.js
Función:
- Lectura, creación y actualización de coordinadores.
- Cambio de estado y enlace de carreras.
========================================================= */

(function(window){
  "use strict";

  function config(){ return window.AD_CONFIG || {}; }
  function utils(){ return window.AD_UTILS || {}; }
  function firebaseService(){
    if (!window.ADFirebaseService) throw new Error("ADFirebaseService no está disponible.");
    return window.ADFirebaseService;
  }
  function texto(valor){ return String(valor === null || valor === undefined ? "" : valor).trim(); }
  function colCoordinadores(){ return config().colecciones.coordinadores; }
  function colLogs(){ return config().colecciones.logs; }
  function normalizarDocId(valor){
    if (utils().normalizarDocId) return utils().normalizarDocId(valor);
    return texto(valor).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  }
  function prepararCoordinadorId(nombre, idManual){ return normalizarDocId(idManual || nombre); }

  function registrar(accion, detalle){
    return firebaseService().agregarDocumento(colLogs(), Object.assign({
      accion: accion,
      fecha: firebaseService().fechaCliente(),
      origen: "administrador",
      administrador: config().administrador,
      modulo: "coordinadores",
      estado: "OK"
    }, detalle || {})).catch(function(){ return { ok:false }; });
  }

  function normalizar(item){
    var data = item || {};
    return Object.assign({}, data, {
      id: data.id || data._docId,
      nombre: data.nombre || data.Nombre || data._docId,
      telegram: data.telegram || data.Telegram || "",
      activo: data.activo !== false,
      carreras: Array.isArray(data.carreras) ? data.carreras : [],
      carrerasAsignadas: Array.isArray(data.carrerasAsignadas) ? data.carrerasAsignadas : []
    });
  }

  function listarCoordinadores(limite){
    var max = Number(limite || 200);
    if (!Number.isFinite(max) || max <= 0) max = 200;
    return firebaseService().listarColeccion(colCoordinadores(), max).then(function(resultado){
      var datos = (resultado.datos || []).map(normalizar);
      datos.sort(function(a,b){ return String(a.nombre).localeCompare(String(b.nombre), "es"); });
      return { ok:true, total:datos.length, coordinadores:datos };
    });
  }

  function obtenerCoordinador(id){
    return firebaseService().leerDocumento(colCoordinadores(), texto(id)).then(function(resultado){
      return resultado.existe ? normalizar(resultado.data) : null;
    });
  }

  function guardarCoordinador(datos){
    var entrada = datos || {};
    var nombre = texto(entrada.nombre);
    var telegram = texto(entrada.telegram || entrada.Telegram);
    var id = prepararCoordinadorId(nombre, entrada.id || entrada._docId);
    if (!nombre) return Promise.reject(new Error("Ingresa el nombre del coordinador."));
    if (!id) return Promise.reject(new Error("No se pudo generar el ID del coordinador."));

    return obtenerCoordinador(id).then(function(actual){
      var existe = Boolean(actual);
      var payload = {
        id: id,
        nombre: nombre,
        telegram: telegram,
        Telegram: telegram,
        activo: existe ? actual.activo !== false : true,
        carreras: existe && Array.isArray(actual.carreras) ? actual.carreras : [],
        carrerasAsignadas: existe && Array.isArray(actual.carrerasAsignadas) ? actual.carrerasAsignadas : [],
        origen: "administrador",
        actualizadoEn: firebaseService().fechaCliente(),
        actualizadoPor: config().administrador
      };
      if (!existe) payload.creadoEn = firebaseService().fechaCliente();

      return firebaseService().guardarDocumento(colCoordinadores(), id, payload, { merge:true }).then(function(){
        return registrar(existe ? config().accionesLog.coordinadorActualizado : config().accionesLog.coordinadorCreado, {
          coordinadorId: id,
          coordinadorNombre: nombre,
          detalle: existe ? "Coordinador actualizado." : "Coordinador creado."
        });
      }).then(function(){ return obtenerCoordinador(id); });
    });
  }

  function cambiarEstado(id, activo){
    var docId = texto(id);
    if (!docId) return Promise.reject(new Error("ID de coordinador vacío."));
    return firebaseService().guardarDocumento(colCoordinadores(), docId, {
      activo: activo === true,
      actualizadoEn: firebaseService().fechaCliente(),
      actualizadoPor: config().administrador
    }, { merge:true }).then(function(){
      return registrar(activo ? config().accionesLog.coordinadorActivado : config().accionesLog.coordinadorDesactivado, {
        coordinadorId: docId,
        detalle: activo ? "Coordinador activo." : "Coordinador inactivo."
      });
    }).then(function(){ return obtenerCoordinador(docId); });
  }

  function claveCarrera(carrera){
    var c = carrera || {};
    return texto(c.codigoCarrera || c.key || c.nombreCarrera);
  }

  function vincularCarrera(coordinadorId, carrera){
    var docId = texto(coordinadorId);
    var data = carrera || {};
    var key = claveCarrera(data);
    if (!docId) return Promise.reject(new Error("Selecciona un coordinador."));
    if (!key) return Promise.reject(new Error("Selecciona una carrera."));

    return obtenerCoordinador(docId).then(function(actual){
      if (!actual) throw new Error("No se encontró el coordinador seleccionado.");
      var asignadas = Array.isArray(actual.carrerasAsignadas) ? actual.carrerasAsignadas.slice() : [];
      var carreras = Array.isArray(actual.carreras) ? actual.carreras.slice() : [];
      var nombreCarrera = texto(data.nombreCarrera || data.key);
      var codigoCarrera = texto(data.codigoCarrera || data.key);
      var existe = asignadas.some(function(item){ return claveCarrera(item) === key || texto(item.nombreCarrera) === nombreCarrera; });

      if (!existe) {
        asignadas.push({
          codigoCarrera: codigoCarrera,
          nombreCarrera: nombreCarrera,
          periodoId: texto(data.periodoId || ""),
          periodoLabel: texto(data.periodoLabel || ""),
          asignadoEn: firebaseService().fechaCliente(),
          asignadoPor: config().administrador
        });
      }
      if (carreras.indexOf(nombreCarrera) < 0) carreras.push(nombreCarrera);

      return firebaseService().guardarDocumento(colCoordinadores(), docId, {
        carreras: carreras,
        carrerasAsignadas: asignadas,
        actualizadoEn: firebaseService().fechaCliente(),
        actualizadoPor: config().administrador
      }, { merge:true }).then(function(){
        return registrar(config().accionesLog.carreraAsignada, {
          coordinadorId: docId,
          codigoCarrera: codigoCarrera,
          nombreCarrera: nombreCarrera,
          detalle: "Carrera vinculada."
        });
      }).then(function(){ return obtenerCoordinador(docId); });
    });
  }

  window.ADCoordinadoresService = {
    prepararCoordinadorId: prepararCoordinadorId,
    listarCoordinadores: listarCoordinadores,
    obtenerCoordinador: obtenerCoordinador,
    guardarCoordinador: guardarCoordinador,
    cambiarEstado: cambiarEstado,
    vincularCarrera: vincularCarrera,
    asignarCarrera: vincularCarrera
  };
})(window);
