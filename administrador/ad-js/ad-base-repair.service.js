/* =========================================================
Archivo: ad-base-repair.service.js
Ruta: /administrador/ad-js/ad-base-repair.service.js
Función:
- Analizar la colección titulos sin modificarla.
- Detectar campo genérico titulo, propuestas repetidas y documentos duplicados.
- Ejecutar únicamente correcciones seguras seleccionadas.
- Respaldar cada documento antes de modificarlo y registrar auditoría.
========================================================= */
(function(window){
  "use strict";

  var LIMITE = 6000;

  function cfg(){ return window.AD_CONFIG || {}; }
  function fs(){
    if (!window.ADFirebaseService) throw new Error("ADFirebaseService no está disponible.");
    return window.ADFirebaseService;
  }
  function cols(){ return cfg().colecciones || {}; }
  function texto(v){ return String(v === null || v === undefined ? "" : v).trim(); }
  function normal(v){
    return texto(v)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function cedula(v){ return texto(v).replace(/[^0-9A-Za-z]/g, ""); }

  function obtenerCedula(doc){
    var data = doc || {};
    var directo = cedula(data.cedula || data.numeroIdentificacion || data.identificacion);
    var id = texto(data._docId);
    var partes;
    if (directo) return directo;
    if (/^\d{9,10}$/.test(id)) return id;
    partes = id.split("__");
    if (partes.length && /^\d{9,10}$/.test(partes[partes.length - 1])) {
      return partes[partes.length - 1];
    }
    return "";
  }

  function obtenerPeriodo(doc){
    var data = doc || {};
    return texto(
      data.periodoId ||
      data.ultimoPeriodoId ||
      data.periodoLabel ||
      data.periodoTexto ||
      data.periodo ||
      "SIN_PERIODO"
    );
  }

  function buscarCampoGenerico(doc){
    var data = doc || {};
    var claves = Object.keys(data);
    var i;
    for (i = 0; i < claves.length; i += 1) {
      if (normal(claves[i]) === "titulo") return claves[i];
    }
    return "";
  }

  function titulosOrdenados(doc, patch){
    var data = doc || {};
    var cambios = patch || {};
    return [
      texto(Object.prototype.hasOwnProperty.call(cambios,"titulo1") ? cambios.titulo1 : data.titulo1),
      texto(Object.prototype.hasOwnProperty.call(cambios,"titulo2") ? cambios.titulo2 : data.titulo2),
      texto(Object.prototype.hasOwnProperty.call(cambios,"titulo3") ? cambios.titulo3 : data.titulo3)
    ];
  }

  function unificarTitulos(lista){
    var mapa = {};
    var unicos = [];
    (lista || []).forEach(function(titulo){
      var limpio = texto(titulo);
      var clave = normal(limpio);
      if (!limpio || !clave || mapa[clave]) return;
      mapa[clave] = true;
      unicos.push(limpio);
    });
    while (unicos.length < 3) unicos.push("");
    return unicos.slice(0,3);
  }

  function analizarDocumento(doc){
    var data = doc || {};
    var id = texto(data._docId);
    var campoGenerico = buscarCampoGenerico(data);
    var tituloGenerico = campoGenerico ? texto(data[campoGenerico]) : "";
    var patch = {};
    var eliminar = [];
    var problemas = [];
    var acciones = [];
    var seguro = true;
    var actuales;
    var unicos;

    if (campoGenerico && tituloGenerico) {
      if (!texto(data.titulo1)) {
        patch.titulo1 = tituloGenerico;
        eliminar.push(campoGenerico);
        problemas.push("Campo genérico titulo");
        acciones.push("Mover el contenido a titulo1 y retirar el campo genérico");
      } else if (normal(data.titulo1) === normal(tituloGenerico)) {
        eliminar.push(campoGenerico);
        problemas.push("Campo titulo redundante");
        acciones.push("Retirar el campo genérico porque ya existe en titulo1");
      } else {
        problemas.push("Conflicto entre titulo y titulo1");
        acciones.push("Revisión manual: ambos campos contienen textos diferentes");
        seguro = false;
      }
    } else if (campoGenerico) {
      eliminar.push(campoGenerico);
      problemas.push("Campo titulo vacío");
      acciones.push("Retirar el campo genérico vacío");
    }

    actuales = titulosOrdenados(data, patch);
    unicos = unificarTitulos(actuales);

    if (
      normal(actuales[0]) !== normal(unicos[0]) ||
      normal(actuales[1]) !== normal(unicos[1]) ||
      normal(actuales[2]) !== normal(unicos[2])
    ) {
      patch.titulo1 = unicos[0];
      patch.titulo2 = unicos[1];
      patch.titulo3 = unicos[2];
      problemas.push("Propuestas repetidas");
      acciones.push("Conservar títulos únicos, mantener el orden y dejar vacíos los espacios sobrantes");
    }

    return {
      id: id,
      cedula: obtenerCedula(data),
      periodo: obtenerPeriodo(data),
      problemas: problemas,
      acciones: acciones,
      patch: patch,
      eliminarCampos: eliminar,
      seguro: seguro && (Object.keys(patch).length > 0 || eliminar.length > 0),
      raw: data
    };
  }

  function marcarDocumentosDuplicados(casos, documentos){
    var grupos = {};
    var mapaCasos = {};

    casos.forEach(function(caso){ mapaCasos[caso.id] = caso; });

    documentos.forEach(function(doc){
      var c = obtenerCedula(doc);
      var p = normal(obtenerPeriodo(doc));
      var clave;
      if (!c) return;
      clave = c + "__" + p;
      if (!grupos[clave]) grupos[clave] = [];
      grupos[clave].push(doc);
    });

    Object.keys(grupos).forEach(function(clave){
      var grupo = grupos[clave];
      if (grupo.length < 2) return;

      grupo.forEach(function(doc){
        var id = texto(doc._docId);
        var caso = mapaCasos[id];
        if (!caso) {
          caso = analizarDocumento(doc);
          casos.push(caso);
          mapaCasos[id] = caso;
        }
        caso.problemas.push("Documento duplicado para la misma cédula y período");
        caso.acciones.push("Revisión manual requerida antes de fusionar o eliminar documentos");
        caso.seguro = false;
        caso.duplicados = grupo.map(function(item){ return texto(item._docId); });
      });
    });
  }

  function analizarBase(){
    return fs().listarColeccion(cols().titulos, LIMITE).then(function(resultado){
      var documentos = resultado.datos || [];
      var casos = documentos
        .map(analizarDocumento)
        .filter(function(caso){ return caso.problemas.length > 0; });

      marcarDocumentosDuplicados(casos, documentos);
      casos.sort(function(a,b){
        if (a.seguro !== b.seguro) return a.seguro ? -1 : 1;
        return String(a.cedula || a.id).localeCompare(String(b.cedula || b.id), "es");
      });

      return {
        ok: true,
        totalDocumentos: documentos.length,
        totalCasos: casos.length,
        seguros: casos.filter(function(c){ return c.seguro; }).length,
        manuales: casos.filter(function(c){ return !c.seguro; }).length,
        casos: casos
      };
    });
  }

  function respaldoId(caso){
    return [
      caso.cedula || caso.id || "SIN_ID",
      "NORMALIZACION_TITULOS",
      Date.now(),
      Math.floor(Math.random() * 10000)
    ].join("__");
  }

  function ejecutarCaso(caso){
    var db;
    var tituloRef;
    var historialRef;
    var logRef;
    var payload;
    var backup;
    var batch;
    var FieldValue;

    if (!caso || !caso.seguro) {
      return Promise.reject(new Error("La corrección seleccionada requiere revisión manual."));
    }

    return fs().inicializar().then(function(){
      db = fs().obtenerDb();
      FieldValue = window.firebase.firestore.FieldValue;
      tituloRef = db.collection(cols().titulos).doc(caso.id);
      return tituloRef.get();
    }).then(function(snapshot){
      var actual;
      var analisisActual;
      var hid;

      if (!snapshot.exists) throw new Error("El documento " + caso.id + " ya no existe.");
      actual = Object.assign({ _docId: snapshot.id }, snapshot.data() || {});
      analisisActual = analizarDocumento(actual);

      if (!analisisActual.seguro) {
        throw new Error("El documento cambió o ahora requiere revisión manual.");
      }

      hid = respaldoId(analisisActual);
      historialRef = db.collection(cols().historial).doc(hid);
      logRef = db.collection(cols().logs).doc();
      payload = Object.assign({}, analisisActual.patch, {
        normalizadoEn: new Date().toISOString(),
        normalizadoPor: cfg().administrador || "administrador"
      });

      analisisActual.eliminarCampos.forEach(function(nombre){
        payload[nombre] = FieldValue.delete();
      });

      backup = Object.assign({}, snapshot.data() || {}, {
        _idOriginal: snapshot.id,
        accionHistorial: "NORMALIZACION_TITULOS",
        problemasDetectados: analisisActual.problemas,
        correccionesAplicadas: analisisActual.acciones,
        archivadoEn: FieldValue.serverTimestamp(),
        archivadoEnLocal: new Date().toISOString(),
        archivadoPor: cfg().administrador || "administrador"
      });

      batch = db.batch();
      batch.set(historialRef, backup, { merge: false });
      batch.set(tituloRef, payload, { merge: true });
      batch.set(logRef, {
        accion: "ADMIN_TITULO_NORMALIZADO",
        modulo: "reparar_firebase",
        origen: "administrador",
        estado: "OK",
        documentoId: snapshot.id,
        cedula: analisisActual.cedula,
        periodo: analisisActual.periodo,
        historialId: hid,
        problemas: analisisActual.problemas,
        acciones: analisisActual.acciones,
        fecha: new Date().toISOString(),
        creadoEn: FieldValue.serverTimestamp()
      });

      return batch.commit().then(function(){
        return {
          ok: true,
          id: snapshot.id,
          historialId: hid,
          problemas: analisisActual.problemas,
          acciones: analisisActual.acciones
        };
      });
    });
  }

  function ejecutarSeleccionados(casos){
    var seleccionados = (casos || []).filter(function(caso){ return caso && caso.seguro; });
    var resultados = [];
    var cadena = Promise.resolve();

    seleccionados.forEach(function(caso){
      cadena = cadena.then(function(){
        return ejecutarCaso(caso)
          .then(function(resultado){ resultados.push(resultado); })
          .catch(function(error){
            resultados.push({ ok:false, id:caso.id, error:error.message || String(error) });
          });
      });
    });

    return cadena.then(function(){
      return {
        ok: resultados.every(function(r){ return r.ok; }),
        procesados: resultados.length,
        correctos: resultados.filter(function(r){ return r.ok; }).length,
        errores: resultados.filter(function(r){ return !r.ok; }).length,
        resultados: resultados
      };
    });
  }

  window.ADBaseRepairService = {
    analizarBase: analizarBase,
    analizarDocumento: analizarDocumento,
    ejecutarCaso: ejecutarCaso,
    ejecutarSeleccionados: ejecutarSeleccionados,
    normalizarTitulo: normal
  };
})(window);
