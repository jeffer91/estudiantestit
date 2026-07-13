/* =========================================================
Archivo: ad-periodos.service.js
Ruta: /administrador/ad-js/ad-periodos.service.js
Función:
- Manejar períodos desde titulos_config/app.
- Todos los períodos se consideran activos.
- Permite agregar período y definir período principal.
Dependencias:
- ad-config.js
- ad-firebase.service.js
========================================================= */

(function(window){
  "use strict";

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

  function normalizarLabel(valor, id){
    var label = texto(valor);
    return label || id;
  }

  function leerConfig(){
    return firebaseService().leerDocumento(coleccionConfig(), documentoConfig())
      .then(function(resultado){
        return resultado.data || {};
      });
  }

  function extraerPeriodoPrincipal(configApp){
    var data = configApp || {};
    var periodoActivo = data.periodoActivo || {};
    var id = texto(data.periodoActivoId || periodoActivo.id || data.periodoId || config().periodos.fallbackId);
    var label = texto(data.periodoActivoLabel || periodoActivo.label || data.periodoLabel || config().periodos.fallbackLabel);
    return { id: id, label: label };
  }

  function listarDesdeConfig(configApp){
    var data = configApp || {};
    var principal = extraerPeriodoPrincipal(data);
    var ids = Array.isArray(data.periodosActivos) ? data.periodosActivos.slice() : [];
    var labels = Array.isArray(data.periodosActivosLabels) ? data.periodosActivosLabels.slice() : [];
    var mapa = {};
    var lista = [];

    function agregar(idValor, labelValor){
      var id = normalizarPeriodoId(idValor);
      var label = normalizarLabel(labelValor, id);
      if (!id || mapa[id]) return;
      mapa[id] = true;
      lista.push({
        id: id,
        label: label,
        activo: true,
        principal: id === principal.id
      });
    }

    ids.forEach(function(id, index){
      agregar(id, labels[index] || id);
    });

    agregar(principal.id, principal.label);

    lista.sort(function(a, b){
      if (a.principal && !b.principal) return -1;
      if (!a.principal && b.principal) return 1;
      return String(a.label).localeCompare(String(b.label), "es");
    });

    return {
      principal: principal,
      periodos: lista,
      configApp: data
    };
  }

  function listarPeriodos(){
    return leerConfig().then(listarDesdeConfig);
  }

  function construirArrays(periodos){
    var ids = [];
    var labels = [];
    var mapa = {};

    (periodos || []).forEach(function(item){
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

    return firebaseService().agregarDocumento(coleccionLogs(), payload).catch(function(){
      return { ok: false };
    });
  }

  function agregarPeriodo(periodoId, periodoLabel){
    var id = normalizarPeriodoId(periodoId);
    var label = normalizarLabel(periodoLabel, id);

    if (!id) {
      return Promise.reject(new Error("Ingresa el ID del período."));
    }

    return leerConfig().then(function(configApp){
      var datos = listarDesdeConfig(configApp);
      var periodos = datos.periodos.slice();
      var existe = periodos.some(function(item){ return item.id === id; });
      var arrays;
      var actualizacion;

      if (!existe) {
        periodos.push({ id: id, label: label, activo: true, principal: false });
      } else {
        periodos = periodos.map(function(item){
          if (item.id !== id) return item;
          return Object.assign({}, item, { label: label, activo: true });
        });
      }

      arrays = construirArrays(periodos);
      actualizacion = {
        periodosActivos: arrays.ids,
        periodosActivosLabels: arrays.labels,
        periodoActivoDesactivado: false,
        periodosActualizadosEn: firebaseService().fechaCliente(),
        periodosActualizadosPor: config().administrador
      };

      return firebaseService().guardarDocumento(coleccionConfig(), documentoConfig(), actualizacion, { merge: true })
        .then(function(){
          return registrarLog(config().accionesLog.periodoAgregado, {
            periodoId: id,
            periodoLabel: label,
            detalle: existe ? "Período actualizado en lista activa." : "Período agregado a lista activa."
          });
        })
        .then(function(){
          return listarPeriodos();
        });
    });
  }

  function definirPrincipal(periodoId, periodoLabel){
    var id = normalizarPeriodoId(periodoId);
    var label = normalizarLabel(periodoLabel, id);

    if (!id) {
      return Promise.reject(new Error("Ingresa el ID del período principal."));
    }

    return leerConfig().then(function(configApp){
      var datos = listarDesdeConfig(configApp);
      var periodos = datos.periodos.slice();
      var existe = periodos.some(function(item){ return item.id === id; });
      var arrays;
      var actualizacion;

      if (!existe) {
        periodos.push({ id: id, label: label, activo: true, principal: true });
      } else {
        periodos = periodos.map(function(item){
          if (item.id !== id) return item;
          return Object.assign({}, item, { label: label, activo: true, principal: true });
        });
      }

      arrays = construirArrays(periodos);
      actualizacion = {
        periodoActivo: {
          id: id,
          label: label
        },
        periodoActivoId: id,
        periodoActivoLabel: label,
        periodosActivos: arrays.ids,
        periodosActivosLabels: arrays.labels,
        periodoActivoDesactivado: false,
        periodoPrincipalActualizadoEn: firebaseService().fechaCliente(),
        periodoPrincipalActualizadoPor: config().administrador
      };

      return firebaseService().guardarDocumento(coleccionConfig(), documentoConfig(), actualizacion, { merge: true })
        .then(function(){
          return registrarLog(config().accionesLog.periodoPrincipal, {
            periodoId: id,
            periodoLabel: label,
            detalle: "Período definido como principal desde administrador."
          });
        })
        .then(function(){
          return listarPeriodos();
        });
    });
  }

  window.ADPeriodosService = {
    listarPeriodos: listarPeriodos,
    agregarPeriodo: agregarPeriodo,
    definirPrincipal: definirPrincipal,
    listarDesdeConfig: listarDesdeConfig,
    extraerPeriodoPrincipal: extraerPeriodoPrincipal
  };
})(window);
