/* =========================================================
Archivo: ad-firebase.service.js
Ruta: /administrador/ad-js/ad-firebase.service.js
Función:
- Inicializar Firebase para el panel administrador.
- Exponer funciones base de lectura, escritura, actualización,
  eliminación, consultas simples, conteos, ordenamiento y diagnóstico.
Dependencias:
- ad-config.js
- Firebase compat SDK
========================================================= */

(function(window){
  "use strict";

  var app = null;
  var db = null;
  var inicializado = false;

  function config(){
    return window.AD_CONFIG || {};
  }

  function utils(){
    return window.AD_UTILS || {};
  }

  function texto(valor){
    if (utils().normalizarTexto) return utils().normalizarTexto(valor);
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function validarSdk(){
    if (!window.firebase) {
      throw new Error("Firebase SDK no está cargado. Revisa los scripts firebase-app-compat y firebase-firestore-compat.");
    }
    if (!window.firebase.firestore) {
      throw new Error("Firestore SDK no está cargado. Revisa firebase-firestore-compat.");
    }
  }

  function validarConfig(){
    if (!window.AD_CONFIG) {
      throw new Error("AD_CONFIG no está disponible. Revisa que ad-config.js cargue antes de ad-firebase.service.js.");
    }
    if (utils().tieneFirebaseConfigCompleta && !utils().tieneFirebaseConfigCompleta()) {
      throw new Error("La configuración Firebase del administrador está incompleta.");
    }
  }

  function inicializar(){
    validarSdk();
    validarConfig();

    if (inicializado && db) {
      return Promise.resolve({ ok: true, app: app, db: db, reutilizado: true });
    }

    try {
      if (window.firebase.apps && window.firebase.apps.length) {
        app = window.firebase.apps[0];
      } else {
        app = window.firebase.initializeApp(config().firebaseConfig);
      }

      db = window.firebase.firestore();

      try {
        db.settings({ ignoreUndefinedProperties: true });
      } catch (settingsError) {
        // Firestore solo permite settings antes de usar db.
      }

      inicializado = true;
      return Promise.resolve({ ok: true, app: app, db: db, reutilizado: false });
    } catch (error) {
      inicializado = false;
      db = null;
      return Promise.reject(error);
    }
  }

  function obtenerDb(){
    if (!db) {
      throw new Error("Firebase no está inicializado. Ejecuta ADFirebaseService.inicializar primero.");
    }
    return db;
  }

  function estaListo(){
    return Boolean(inicializado && db);
  }

  function serverTimestamp(){
    validarSdk();
    return window.firebase.firestore.FieldValue.serverTimestamp();
  }

  function fechaCliente(){
    return new Date().toISOString();
  }

  function refColeccion(nombreColeccion){
    var nombre = texto(nombreColeccion);
    if (!nombre) throw new Error("Nombre de colección vacío.");
    return obtenerDb().collection(nombre);
  }

  function refDocumento(nombreColeccion, documentoId){
    var docId = texto(documentoId);
    if (!docId) throw new Error("ID de documento vacío.");
    return refColeccion(nombreColeccion).doc(docId);
  }

  function snapshotADatos(snapshot){
    var datos = [];
    snapshot.forEach(function(doc){
      datos.push(Object.assign({ _docId: doc.id }, doc.data() || {}));
    });
    return datos;
  }

  function leerDocumento(nombreColeccion, documentoId){
    return inicializar().then(function(){
      return refDocumento(nombreColeccion, documentoId).get();
    }).then(function(snapshot){
      if (!snapshot.exists) {
        return { existe: false, id: documentoId, data: null };
      }
      return {
        existe: true,
        id: snapshot.id,
        data: Object.assign({ _docId: snapshot.id }, snapshot.data() || {})
      };
    });
  }

  function guardarDocumento(nombreColeccion, documentoId, data, opciones){
    var payload = Object.assign({}, data || {}, {
      actualizadoEn: fechaCliente()
    });
    return inicializar().then(function(){
      return refDocumento(nombreColeccion, documentoId).set(payload, opciones || { merge: true });
    }).then(function(){
      return { ok: true, coleccion: nombreColeccion, id: documentoId };
    });
  }

  function actualizarDocumento(nombreColeccion, documentoId, data){
    var payload = Object.assign({}, data || {}, {
      actualizadoEn: fechaCliente()
    });
    return inicializar().then(function(){
      return refDocumento(nombreColeccion, documentoId).update(payload);
    }).then(function(){
      return { ok: true, coleccion: nombreColeccion, id: documentoId };
    });
  }

  function eliminarDocumento(nombreColeccion, documentoId){
    return inicializar().then(function(){
      return refDocumento(nombreColeccion, documentoId).delete();
    }).then(function(){
      return { ok: true, coleccion: nombreColeccion, id: documentoId };
    });
  }

  function agregarDocumento(nombreColeccion, data){
    var payload = Object.assign({}, data || {}, {
      creadoEn: fechaCliente(),
      actualizadoEn: fechaCliente()
    });
    return inicializar().then(function(){
      return refColeccion(nombreColeccion).add(payload);
    }).then(function(ref){
      return { ok: true, coleccion: nombreColeccion, id: ref.id };
    });
  }

  function listarColeccion(nombreColeccion, limite){
    var max = Number(limite || 25);
    if (!Number.isFinite(max) || max <= 0) max = 25;

    return inicializar().then(function(){
      return refColeccion(nombreColeccion).limit(max).get();
    }).then(function(snapshot){
      var datos = snapshotADatos(snapshot);
      return {
        ok: true,
        coleccion: nombreColeccion,
        limite: max,
        totalLeido: datos.length,
        datos: datos
      };
    });
  }

  function listarColeccionOrdenada(nombreColeccion, campoOrden, direccion, limite){
    var max = Number(limite || 25);
    var campo = texto(campoOrden);
    var dir = texto(direccion || "desc") || "desc";
    if (!Number.isFinite(max) || max <= 0) max = 25;

    return inicializar().then(function(){
      if (!campo) {
        return refColeccion(nombreColeccion).limit(max).get();
      }
      return refColeccion(nombreColeccion).orderBy(campo, dir).limit(max).get();
    }).then(function(snapshot){
      var datos = snapshotADatos(snapshot);
      return {
        ok: true,
        coleccion: nombreColeccion,
        limite: max,
        orden: campo,
        direccion: dir,
        totalLeido: datos.length,
        datos: datos
      };
    });
  }

  function consultarPorCampo(nombreColeccion, campo, operador, valor, limite){
    var max = Number(limite || 25);
    if (!Number.isFinite(max) || max <= 0) max = 25;

    return inicializar().then(function(){
      return refColeccion(nombreColeccion)
        .where(campo, operador || "==", valor)
        .limit(max)
        .get();
    }).then(function(snapshot){
      var datos = snapshotADatos(snapshot);
      return {
        ok: true,
        coleccion: nombreColeccion,
        campo: campo,
        operador: operador || "==",
        totalLeido: datos.length,
        datos: datos
      };
    });
  }

  function contarColeccion(nombreColeccion){
    return inicializar().then(function(){
      var ref = refColeccion(nombreColeccion);
      if (typeof ref.count === "function") {
        return ref.count().get().then(function(snapshot){
          var data = snapshot.data ? snapshot.data() : {};
          return {
            ok: true,
            coleccion: nombreColeccion,
            total: Number(data.count || 0),
            metodo: "count"
          };
        });
      }

      return ref.get().then(function(snapshot){
        return {
          ok: true,
          coleccion: nombreColeccion,
          total: snapshot.size || 0,
          metodo: "get"
        };
      });
    });
  }

  function probarConexion(){
    var colConfig = config().colecciones && config().colecciones.titulosConfig;
    var docConfig = config().documentos && config().documentos.appConfig;

    return inicializar()
      .then(function(){
        return leerDocumento(colConfig, docConfig);
      })
      .then(function(resultado){
        return {
          ok: true,
          firebaseListo: estaListo(),
          proyecto: config().firebaseConfig && config().firebaseConfig.projectId,
          configExiste: resultado.existe,
          config: resultado.data
        };
      });
  }

  window.ADFirebaseService = {
    inicializar: inicializar,
    obtenerDb: obtenerDb,
    estaListo: estaListo,
    serverTimestamp: serverTimestamp,
    fechaCliente: fechaCliente,
    leerDocumento: leerDocumento,
    guardarDocumento: guardarDocumento,
    actualizarDocumento: actualizarDocumento,
    eliminarDocumento: eliminarDocumento,
    agregarDocumento: agregarDocumento,
    listarColeccion: listarColeccion,
    listarColeccionOrdenada: listarColeccionOrdenada,
    consultarPorCampo: consultarPorCampo,
    contarColeccion: contarColeccion,
    probarConexion: probarConexion
  };
})(window);
