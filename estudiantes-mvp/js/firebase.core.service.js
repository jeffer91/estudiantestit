/*
  Archivo: firebase.core.service.js
  Ruta: estudiantes-mvp/js/firebase.core.service.js
  Funciones principales:
  - Cargar Firebase compat desde CDN.
  - Inicializar Firebase y Firestore.
  - Exponer funciones generales para leer, guardar, actualizar y consultar documentos.
  - Servir como base para los otros servicios Firebase del MVP.
*/
(function (window, document) {
  'use strict';

  var app = null;
  var db = null;
  var inicializado = false;
  var inicializandoPromise = null;
  var cargandoSdkPromise = null;

  function obtenerConfig() {
    return window.EstudianteMVPConfig ? window.EstudianteMVPConfig.data : null;
  }

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function inicializar() {
    var config = obtenerConfig();
    var utils = obtenerUtils();

    if (inicializado && db) {
      return Promise.resolve({
        ok: true,
        app: app,
        db: db,
        mensaje: 'Firebase ya estaba conectado.'
      });
    }

    if (inicializandoPromise) {
      return inicializandoPromise;
    }

    inicializandoPromise = cargarSdk()
      .then(function () {
        var firebaseConfig = config && config.firebase ? config.firebase.config : null;

        if (!firebaseConfigValido(firebaseConfig)) {
          throw new Error('La configuración de Firebase está incompleta.');
        }

        app = obtenerAppFirebase(firebaseConfig);
        db = window.firebase.firestore(app);

        inicializado = true;

        return {
          ok: true,
          app: app,
          db: db,
          mensaje: 'Firebase conectado correctamente.'
        };
      })
      .catch(function (error) {
        inicializado = false;
        inicializandoPromise = null;

        if (utils) {
          utils.errorConsola('[Firebase MVP] Error al inicializar Firebase:', error);
        }

        throw error;
      });

    return inicializandoPromise;
  }

  function cargarSdk() {
    var config = obtenerConfig();
    var version = config && config.firebase ? config.firebase.sdkVersion : '10.12.5';
    var appUrl = 'https://www.gstatic.com/firebasejs/' + version + '/firebase-app-compat.js';
    var firestoreUrl = 'https://www.gstatic.com/firebasejs/' + version + '/firebase-firestore-compat.js';

    if (window.firebase && window.firebase.firestore) {
      return Promise.resolve(true);
    }

    if (cargandoSdkPromise) {
      return cargandoSdkPromise;
    }

    cargandoSdkPromise = cargarScript(appUrl)
      .then(function () {
        return cargarScript(firestoreUrl);
      })
      .then(function () {
        if (!window.firebase || !window.firebase.firestore) {
          throw new Error('Firebase SDK no quedó disponible en el navegador.');
        }

        return true;
      });

    return cargandoSdkPromise;
  }

  function cargarScript(src) {
    return new Promise(function (resolve, reject) {
      var existente;

      if (!src) {
        reject(new Error('No se recibió la URL del script Firebase.'));
        return;
      }

      existente = document.querySelector('script[src="' + src + '"]');

      if (existente && existente.getAttribute('data-loaded') === 'true') {
        resolve(true);
        return;
      }

      if (existente) {
        existente.addEventListener('load', function () {
          resolve(true);
        });

        existente.addEventListener('error', function () {
          reject(new Error('No se pudo cargar ' + src));
        });

        return;
      }

      existente = document.createElement('script');
      existente.src = src;
      existente.async = true;

      existente.onload = function () {
        existente.setAttribute('data-loaded', 'true');
        resolve(true);
      };

      existente.onerror = function () {
        reject(new Error('No se pudo cargar ' + src));
      };

      document.head.appendChild(existente);
    });
  }

  function obtenerAppFirebase(firebaseConfig) {
    var apps;

    if (!window.firebase) {
      throw new Error('Firebase SDK no está cargado.');
    }

    apps = window.firebase.apps || [];

    if (apps.length) {
      return apps[0];
    }

    return window.firebase.initializeApp(firebaseConfig);
  }

  function firebaseConfigValido(firebaseConfig) {
    return !!(
      firebaseConfig &&
      firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId
    );
  }

  function obtenerDb() {
    if (!inicializado || !db) {
      throw new Error('Firebase todavía no está inicializado. Llama primero a inicializar().');
    }

    return db;
  }

  function leerDocumento(coleccion, documentoId) {
    return inicializar().then(function () {
      if (!coleccion || !documentoId) {
        throw new Error('Faltan colección o documento para leer en Firebase.');
      }

      return obtenerDb().collection(coleccion).doc(String(documentoId)).get();
    }).then(function (snapshot) {
      if (!snapshot.exists) {
        return null;
      }

      return normalizarSnapshotDocumento(snapshot);
    });
  }

  function guardarDocumento(coleccion, documentoId, data, opciones) {
    opciones = opciones || {};

    return inicializar().then(function () {
      if (!coleccion || !documentoId) {
        throw new Error('Faltan colección o documento para guardar en Firebase.');
      }

      return obtenerDb()
        .collection(coleccion)
        .doc(String(documentoId))
        .set(data || {}, {
          merge: opciones.merge !== false
        });
    }).then(function () {
      return {
        ok: true,
        coleccion: coleccion,
        id: String(documentoId),
        mensaje: 'Documento guardado correctamente.'
      };
    });
  }

  function actualizarDocumento(coleccion, documentoId, data) {
    return inicializar().then(function () {
      if (!coleccion || !documentoId) {
        throw new Error('Faltan colección o documento para actualizar en Firebase.');
      }

      return obtenerDb()
        .collection(coleccion)
        .doc(String(documentoId))
        .update(data || {});
    }).then(function () {
      return {
        ok: true,
        coleccion: coleccion,
        id: String(documentoId),
        mensaje: 'Documento actualizado correctamente.'
      };
    });
  }

  function agregarDocumento(coleccion, data) {
    return inicializar().then(function () {
      if (!coleccion) {
        throw new Error('Falta colección para agregar documento en Firebase.');
      }

      return obtenerDb().collection(coleccion).add(data || {});
    }).then(function (docRef) {
      return {
        ok: true,
        coleccion: coleccion,
        id: docRef.id,
        mensaje: 'Documento agregado correctamente.'
      };
    });
  }

  function consultarPorCampo(coleccion, campo, operador, valor, limite) {
    operador = operador || '==';
    limite = Number(limite || 20);

    return inicializar().then(function () {
      if (!coleccion || !campo) {
        throw new Error('Faltan datos para consultar en Firebase.');
      }

      return obtenerDb()
        .collection(coleccion)
        .where(campo, operador, valor)
        .limit(limite)
        .get();
    }).then(function (querySnapshot) {
      var resultados = [];

      querySnapshot.forEach(function (doc) {
        resultados.push(normalizarSnapshotDocumento(doc));
      });

      return resultados;
    });
  }

  function consultarTodos(coleccion, limite) {
    limite = Number(limite || 50);

    return inicializar().then(function () {
      if (!coleccion) {
        throw new Error('Falta colección para consultar en Firebase.');
      }

      return obtenerDb().collection(coleccion).limit(limite).get();
    }).then(function (querySnapshot) {
      var resultados = [];

      querySnapshot.forEach(function (doc) {
        resultados.push(normalizarSnapshotDocumento(doc));
      });

      return resultados;
    });
  }

  function serverTimestamp() {
    if (window.firebase && window.firebase.firestore && window.firebase.firestore.FieldValue) {
      return window.firebase.firestore.FieldValue.serverTimestamp();
    }

    return new Date().toISOString();
  }

  function normalizarSnapshotDocumento(snapshot) {
    var data = snapshot.data() || {};

    data.id = data.id || snapshot.id;
    data._id = snapshot.id;

    return data;
  }

  function estaListo() {
    return !!(inicializado && db);
  }

  window.EstudianteMVPFirebaseCore = Object.freeze({
    inicializar: inicializar,
    cargarSdk: cargarSdk,
    obtenerDb: obtenerDb,
    leerDocumento: leerDocumento,
    guardarDocumento: guardarDocumento,
    actualizarDocumento: actualizarDocumento,
    agregarDocumento: agregarDocumento,
    consultarPorCampo: consultarPorCampo,
    consultarTodos: consultarTodos,
    serverTimestamp: serverTimestamp,
    estaListo: estaListo
  });
})(window, document);
