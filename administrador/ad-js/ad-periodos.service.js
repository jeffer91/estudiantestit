/* =========================================================
Archivo: ad-periodos.service.js
Ruta: /administrador/ad-js/ad-periodos.service.js
Función:
- Detectar períodos existentes en Firebase.
- Mantener un catálogo de períodos activos e inactivos.
- Activar o desactivar períodos sin eliminar información.
- Mantener siempre un período principal activo.
Dependencias:
- ad-config.js
- ad-firebase.service.js
========================================================= */
(function(window){
  "use strict";

  var LIMITE_DETECCION = 6000;

  function config(){
    return window.AD_CONFIG || {};
  }

  function utils(){
    return window.AD_UTILS || {};
  }

  function firebaseService(){
    if (!window.ADFirebaseService) {
      throw new Error("ADFirebaseService no está disponible.");
    }
    return window.ADFirebaseService;
  }

  function texto(valor){
    if (utils().normalizarTexto) return utils().normalizarTexto(valor);
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function normalizarComparacion(valor){
    return texto(valor)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function fechaLocal(){
    if (utils().fechaLocal) return utils().fechaLocal();
    return new Date().toLocaleString("es-EC");
  }

  function coleccionConfig(){
    return config().colecciones.titulosConfig;
  }

  function documentoConfig(){
    return config().documentos.appConfig;
  }

  function coleccionLogs(){
    return config().colecciones.logs;
  }

  function normalizarPeriodoId(valor){
    return texto(valor)
      .replace(/\s+/g, "")
      .replace(/[^0-9A-Za-z_\-]/g, "");
  }

  function idDesdeLabel(label){
    if (utils().normalizarDocId) return utils().normalizarDocId(label);
    return normalizarComparacion(label).replace(/\s+/g, "_");
  }

  function normalizarLabel(valor, id){
    return texto(valor) || id;
  }

  function campo(obj, nombres){
    var data = obj || {};
    var claves = Object.keys(data);
    var mapa = {};
    var i;
    var key;

    claves.forEach(function(nombre){
      mapa[normalizarComparacion(nombre)] = nombre;
    });

    for (i = 0; i < nombres.length; i += 1) {
      key = mapa[normalizarComparacion(nombres[i])];
      if (
        key !== undefined &&
        data[key] !== undefined &&
        data[key] !== null &&
        texto(data[key])
      ) {
        return data[key];
      }
    }

    return "";
  }

  function leerConfig(){
    return firebaseService()
      .leerDocumento(coleccionConfig(), documentoConfig())
      .then(function(resultado){
        return resultado.data || {};
      });
  }

  function extraerPeriodoPrincipal(configApp){
    var data = configApp || {};
    var periodoActivo = data.periodoActivo || {};
    var id = normalizarPeriodoId(
      data.periodoActivoId ||
      periodoActivo.id ||
      data.periodoId ||
      config().periodos.fallbackId
    );
    var label = normalizarLabel(
      data.periodoActivoLabel ||
      periodoActivo.label ||
      data.periodoLabel ||
      config().periodos.fallbackLabel,
      id
    );

    return { id: id, label: label };
  }

  function extraerPeriodoDocumento(documento){
    var data = documento || {};
    var id = normalizarPeriodoId(campo(data, [
      "periodoId",
      "PeriodoId",
      "ultimoPeriodoId",
      "periodoCanonicoId",
      "periodoActivoId"
    ]));
    var label = texto(campo(data, [
      "periodoLabel",
      "PeriodoLabel",
      "ultimoPeriodoLabel",
      "periodoTexto",
      "PeriodoTexto",
      "periodo",
      "Período"
    ]));

    if (!id && label) id = normalizarPeriodoId(idDesdeLabel(label));
    if (!label && id) label = id;

    return { id: id, label: label };
  }

  function detectarColeccion(nombreColeccion){
    if (!nombreColeccion) return Promise.resolve([]);

    return firebaseService()
      .listarColeccion(nombreColeccion, LIMITE_DETECCION)
      .then(function(resultado){
        return (resultado.datos || [])
          .map(extraerPeriodoDocumento)
          .filter(function(item){ return item.id; });
      })
      .catch(function(){
        return [];
      });
  }

  function construirCatalogo(configApp, detectados){
    var data = configApp || {};
    var principal = extraerPeriodoPrincipal(data);
    var idsActivos = Array.isArray(data.periodosActivos)
      ? data.periodosActivos.map(normalizarPeriodoId).filter(Boolean)
      : [];
    var labelsActivos = Array.isArray(data.periodosActivosLabels)
      ? data.periodosActivosLabels.slice()
      : [];
    var catalogoGuardado = Array.isArray(data.periodosCatalogo)
      ? data.periodosCatalogo
      : [];
    var mapaId = {};
    var mapaLabel = {};
    var lista = [];

    if (!idsActivos.length && principal.id) idsActivos.push(principal.id);

    function agregar(idValor, labelValor, origen){
      var id = normalizarPeriodoId(idValor);
      var label = normalizarLabel(labelValor, id);
      var claveLabel = normalizarComparacion(label);
      var existente;

      if (!id && label) id = normalizarPeriodoId(idDesdeLabel(label));
      if (!id) return;

      existente = mapaId[id] || (claveLabel ? mapaLabel[claveLabel] : null);
      if (existente) {
        if ((!existente.label || existente.label === existente.id) && label) {
          existente.label = label;
        }
        return;
      }

      existente = {
        id: id,
        label: label || id,
        activo: idsActivos.indexOf(id) >= 0,
        principal: id === principal.id,
        origen: origen || "firebase"
      };

      mapaId[id] = existente;
      if (claveLabel) mapaLabel[claveLabel] = existente;
      lista.push(existente);
    }

    catalogoGuardado.forEach(function(item){
      if (typeof item === "string") agregar(item, item, "config");
      else agregar(item && item.id, item && item.label, "config");
    });

    idsActivos.forEach(function(id, indice){
      agregar(id, labelsActivos[indice] || id, "config-activo");
    });

    agregar(principal.id, principal.label, "principal");

    (detectados || []).forEach(function(item){
      agregar(item.id, item.label, item.origen || "base");
    });

    lista.forEach(function(item){
      item.activo = idsActivos.indexOf(item.id) >= 0;
      item.principal = item.id === principal.id;
    });

    lista.sort(function(a, b){
      if (a.principal && !b.principal) return -1;
      if (!a.principal && b.principal) return 1;
      return String(a.label).localeCompare(String(b.label), "es");
    });

    return {
      principal: principal,
      periodos: lista,
      activos: lista.filter(function(item){ return item.activo; }),
      configApp: data
    };
  }

  function listarTodosLosPeriodos(){
    var colecciones = config().colecciones || {};

    return Promise.all([
      leerConfig(),
      detectarColeccion(colecciones.estudiantes),
      detectarColeccion(colecciones.titulos)
    ]).then(function(partes){
      var detectados = [];

      (partes[1] || []).forEach(function(item){
        detectados.push(Object.assign({}, item, { origen: "Estudiantes" }));
      });
      (partes[2] || []).forEach(function(item){
        detectados.push(Object.assign({}, item, { origen: "titulos" }));
      });

      return construirCatalogo(partes[0] || {}, detectados);
    });
  }

  function listarPeriodos(){
    return listarTodosLosPeriodos().then(function(resultado){
      return {
        principal: resultado.principal,
        periodos: resultado.activos,
        configApp: resultado.configApp
      };
    });
  }

  function construirArrays(periodosActivos){
    var ids = [];
    var labels = [];
    var mapa = {};

    (periodosActivos || []).forEach(function(item){
      var id = normalizarPeriodoId(item.id);
      var label = normalizarLabel(item.label, id);
      if (!id || mapa[id]) return;
      mapa[id] = true;
      ids.push(id);
      labels.push(label);
    });

    return { ids: ids, labels: labels };
  }

  function registrarLog(accion, detalle){
    var payload = Object.assign({
      accion: accion,
      fecha: firebaseService().fechaCliente(),
      fechaLocal: fechaLocal(),
      origen: "administrador",
      administrador: config().administrador,
      modulo: "periodos",
      estado: "OK"
    }, detalle || {});

    return firebaseService()
      .agregarDocumento(coleccionLogs(), payload)
      .catch(function(){ return { ok: false }; });
  }

  function cambiarEstadoPeriodo(periodoId, activoDeseado){
    var id = normalizarPeriodoId(periodoId);
    var activar = activoDeseado === true;

    if (!id) {
      return Promise.reject(new Error("Selecciona un período."));
    }

    return listarTodosLosPeriodos().then(function(resultado){
      var seleccionado = resultado.periodos.find(function(item){
        return item.id === id;
      });
      var activosActuales = resultado.periodos.filter(function(item){
        return item.activo;
      });
      var nuevosActivos;
      var principal = resultado.principal;
      var arrays;
      var catalogo;
      var actualizacion;
      var accion;
      var detalleLog;

      if (!seleccionado) {
        throw new Error("El período seleccionado no existe en la base.");
      }

      if (seleccionado.activo === activar) {
        return resultado;
      }

      if (!activar && seleccionado.activo && activosActuales.length <= 1) {
        throw new Error("Debe existir al menos un período activo. Activa otro período antes de desactivar este.");
      }

      nuevosActivos = resultado.periodos.filter(function(item){
        if (item.id === id) return activar;
        return item.activo;
      });

      if (!principal.id || !nuevosActivos.some(function(item){ return item.id === principal.id; })) {
        principal = nuevosActivos[0] || seleccionado;
      }

      arrays = construirArrays(nuevosActivos);
      catalogo = resultado.periodos.map(function(item){
        return { id: item.id, label: item.label };
      });

      actualizacion = {
        periodosCatalogo: catalogo,
        periodosActivos: arrays.ids,
        periodosActivosLabels: arrays.labels,
        periodoActivo: {
          id: principal.id,
          label: principal.label
        },
        periodoActivoId: principal.id,
        periodoActivoLabel: principal.label,
        periodoActivoDesactivado: false,
        periodosActualizadosEn: firebaseService().fechaCliente(),
        periodosActualizadosPor: config().administrador
      };

      accion = activar
        ? config().accionesLog.periodoActivado
        : config().accionesLog.periodoDesactivado;

      detalleLog = {
        periodoId: seleccionado.id,
        periodoLabel: seleccionado.label,
        activo: activar,
        detalle: activar
          ? "Período activado desde administrador."
          : "Período desactivado desde administrador."
      };

      return firebaseService()
        .guardarDocumento(coleccionConfig(), documentoConfig(), actualizacion, { merge: true })
        .then(function(){ return registrarLog(accion, detalleLog); })
        .then(function(){ return listarTodosLosPeriodos(); });
    });
  }

  window.ADPeriodosService = {
    listarPeriodos: listarPeriodos,
    listarTodosLosPeriodos: listarTodosLosPeriodos,
    cambiarEstadoPeriodo: cambiarEstadoPeriodo,
    extraerPeriodoPrincipal: extraerPeriodoPrincipal,
    extraerPeriodoDocumento: extraerPeriodoDocumento,
    construirCatalogo: construirCatalogo
  };
})(window);
