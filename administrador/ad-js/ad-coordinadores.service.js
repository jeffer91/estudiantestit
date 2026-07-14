/* =========================================================
Archivo: ad-coordinadores.service.js
Ruta: /administrador/ad-js/ad-coordinadores.service.js
Función:
- Lectura, creación y actualización de coordinadores.
- Cambio de estado y enlace de carreras.
- Garantizar que cada carrera quede asignada a un solo coordinador.
========================================================= */

(function(window){
  "use strict";

  function config(){ return window.AD_CONFIG || {}; }
  function utils(){ return window.AD_UTILS || {}; }

  function firebaseService(){
    if (!window.ADFirebaseService) {
      throw new Error("ADFirebaseService no está disponible.");
    }
    return window.ADFirebaseService;
  }

  function texto(valor){
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function colCoordinadores(){ return config().colecciones.coordinadores; }
  function colLogs(){ return config().colecciones.logs; }

  function normalizarDocId(valor){
    if (utils().normalizarDocId) return utils().normalizarDocId(valor);
    return texto(valor)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function prepararCoordinadorId(nombre, idManual){
    return normalizarDocId(idManual || nombre);
  }

  function registrar(accion, detalle){
    return firebaseService().agregarDocumento(colLogs(), Object.assign({
      accion: accion,
      fecha: firebaseService().fechaCliente(),
      origen: "administrador",
      administrador: config().administrador,
      modulo: "coordinadores",
      estado: "OK"
    }, detalle || {})).catch(function(){
      return { ok: false };
    });
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
      datos.sort(function(a, b){
        return String(a.nombre).localeCompare(String(b.nombre), "es");
      });
      return {
        ok: true,
        total: datos.length,
        coordinadores: datos
      };
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

      return firebaseService()
        .guardarDocumento(colCoordinadores(), id, payload, { merge: true })
        .then(function(){
          return registrar(
            existe ? config().accionesLog.coordinadorActualizado : config().accionesLog.coordinadorCreado,
            {
              coordinadorId: id,
              coordinadorNombre: nombre,
              detalle: existe ? "Coordinador actualizado." : "Coordinador creado."
            }
          );
        })
        .then(function(){
          return obtenerCoordinador(id);
        });
    });
  }

  function cambiarEstado(id, activo){
    var docId = texto(id);
    if (!docId) return Promise.reject(new Error("ID de coordinador vacío."));

    return firebaseService()
      .guardarDocumento(colCoordinadores(), docId, {
        activo: activo === true,
        actualizadoEn: firebaseService().fechaCliente(),
        actualizadoPor: config().administrador
      }, { merge: true })
      .then(function(){
        return registrar(
          activo ? config().accionesLog.coordinadorActivado : config().accionesLog.coordinadorDesactivado,
          {
            coordinadorId: docId,
            detalle: activo ? "Coordinador activo." : "Coordinador inactivo."
          }
        );
      })
      .then(function(){
        return obtenerCoordinador(docId);
      });
  }

  function normalizarClaveCarrera(valor){
    return texto(valor)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokensCarrera(carrera){
    var item = carrera || {};
    var valores;
    var mapa = {};
    var salida = [];

    if (typeof item === "string") {
      valores = [item];
    } else {
      valores = [
        item.key,
        item.codigoCarrera,
        item.CodigoCarrera,
        item.nombreCarrera,
        item.NombreCarrera,
        item.carrera,
        item.nombre
      ];
    }

    valores.forEach(function(valor){
      var token = normalizarClaveCarrera(valor);
      if (!token || mapa[token]) return;
      mapa[token] = true;
      salida.push(token);
    });

    return salida;
  }

  function coincideCarrera(itemAsignado, carreraObjetivo){
    var origen = tokensCarrera(itemAsignado);
    var objetivo = tokensCarrera(carreraObjetivo);

    if (!origen.length || !objetivo.length) return false;

    return origen.some(function(token){
      return objetivo.indexOf(token) >= 0;
    });
  }

  function claveCarrera(carrera){
    var c = carrera || {};
    return texto(c.codigoCarrera || c.CodigoCarrera || c.key || c.nombreCarrera || c.NombreCarrera);
  }

  function nombreCarrera(carrera){
    var c = carrera || {};
    return texto(c.nombreCarrera || c.NombreCarrera || c.carrera || c.codigoCarrera || c.key);
  }

  function filtrarCarrera(lista, carrera){
    return (Array.isArray(lista) ? lista : []).filter(function(item){
      return !coincideCarrera(item, carrera);
    });
  }

  function construirAsignacion(carrera){
    var data = carrera || {};
    return {
      codigoCarrera: texto(data.codigoCarrera || data.CodigoCarrera || data.key),
      nombreCarrera: nombreCarrera(data),
      periodoId: texto(data.periodoId || ""),
      periodoLabel: texto(data.periodoLabel || ""),
      asignadoEn: firebaseService().fechaCliente(),
      asignadoPor: config().administrador
    };
  }

  function guardarAsignacionCarrera(coordinadorId, carrera){
    var docId = texto(coordinadorId);
    var data = carrera || {};
    var key = claveCarrera(data);
    var nombre = nombreCarrera(data);

    if (!docId) return Promise.reject(new Error("Selecciona un coordinador."));
    if (!key && !nombre) return Promise.reject(new Error("No se pudo identificar la carrera."));

    return listarCoordinadores(500).then(function(resultado){
      var lista = resultado.coordinadores || [];
      var seleccionado = lista.find(function(item){
        return texto(item._docId || item.id) === docId;
      });
      var anteriores = [];
      var operaciones = [];

      if (!seleccionado) {
        throw new Error("No se encontró el coordinador seleccionado.");
      }

      lista.forEach(function(item){
        var idActual = texto(item._docId || item.id);
        var carrerasActuales = Array.isArray(item.carreras) ? item.carreras : [];
        var asignadasActuales = Array.isArray(item.carrerasAsignadas) ? item.carrerasAsignadas : [];
        var teniaCarrera = carrerasActuales.some(function(valor){
          return coincideCarrera(valor, data);
        }) || asignadasActuales.some(function(valor){
          return coincideCarrera(valor, data);
        });
        var nuevasCarreras = filtrarCarrera(carrerasActuales, data);
        var nuevasAsignadas = filtrarCarrera(asignadasActuales, data);

        if (idActual === docId) {
          nuevasCarreras.push(nombre || key);
          nuevasAsignadas.push(construirAsignacion(data));
        } else if (teniaCarrera) {
          anteriores.push(idActual);
        }

        if (teniaCarrera || idActual === docId) {
          operaciones.push(
            firebaseService().guardarDocumento(colCoordinadores(), idActual, {
              carreras: nuevasCarreras,
              carrerasAsignadas: nuevasAsignadas,
              actualizadoEn: firebaseService().fechaCliente(),
              actualizadoPor: config().administrador
            }, { merge: true })
          );
        }
      });

      return Promise.all(operaciones)
        .then(function(){
          return registrar(config().accionesLog.carreraAsignada, {
            coordinadorId: docId,
            coordinadorNombre: seleccionado.nombre || docId,
            codigoCarrera: texto(data.codigoCarrera || data.CodigoCarrera || data.key),
            nombreCarrera: nombre,
            coordinadoresAnteriores: anteriores,
            detalle: anteriores.length
              ? "Carrera reasignada de forma exclusiva."
              : "Carrera asignada de forma exclusiva."
          });
        })
        .then(function(){
          return obtenerCoordinador(docId);
        })
        .then(function(coordinadorActualizado){
          return {
            ok: true,
            carrera: data,
            coordinador: coordinadorActualizado,
            coordinadoresAnteriores: anteriores,
            mensaje: "Asignación guardada correctamente."
          };
        });
    });
  }

  function vincularCarrera(coordinadorId, carrera){
    return guardarAsignacionCarrera(coordinadorId, carrera);
  }

  window.ADCoordinadoresService = {
    prepararCoordinadorId: prepararCoordinadorId,
    listarCoordinadores: listarCoordinadores,
    obtenerCoordinador: obtenerCoordinador,
    guardarCoordinador: guardarCoordinador,
    cambiarEstado: cambiarEstado,
    coincideCarrera: coincideCarrera,
    guardarAsignacionCarrera: guardarAsignacionCarrera,
    vincularCarrera: vincularCarrera,
    asignarCarrera: guardarAsignacionCarrera
  };
})(window);
