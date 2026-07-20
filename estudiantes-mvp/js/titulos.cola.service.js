/* Cola local de contingencia. RESPALDO TITULOS APP es la única base remota. */
(function(window){
  'use strict';
  var STORAGE_KEY = 'titulos_envios_pendientes_v2';

  function texto(v){ return String(v === null || v === undefined ? '' : v).trim(); }
  function fecha(){ return new Date().toISOString(); }
  function mensajeError(error){ return error && error.message ? error.message : texto(error) || 'Error de conexión.'; }
  function leer(){
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var lista = raw ? JSON.parse(raw) : [];
      return Array.isArray(lista) ? lista : [];
    } catch (error) {
      return [];
    }
  }
  function guardar(lista){
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.isArray(lista) ? lista : []));
      return true;
    } catch (error) {
      return false;
    }
  }
  function idPayload(payload){
    payload = payload || {};
    var estudiante = payload.estudiante || {};
    var cedula = texto(payload.cedula || payload.numeroIdentificacion || estudiante.cedula || estudiante.numeroIdentificacion).replace(/\D/g,'');
    var periodo = texto(payload.periodoId || estudiante.periodoId || payload.periodo || estudiante.periodoLabel || 'sin_periodo');
    return periodo + '__' + cedula;
  }
  function guardarRespaldoEnviado(payload, resultadoSheets){
    var id = idPayload(payload);
    var lista = leer().filter(function(item){ return item.id !== id; });
    guardar(lista);
    return Promise.resolve({
      ok: true,
      estado: 'PENDIENTE_REVISION',
      origen: 'RESPALDO TITULOS APP',
      idRegistro: resultadoSheets && resultadoSheets.idRegistro || id,
      mensaje: 'El envío ya quedó guardado en RESPALDO TITULOS APP.'
    });
  }
  function guardarPendienteSync(payload, errorSheets){
    var id = idPayload(payload);
    var lista = leer().filter(function(item){ return item.id !== id; });
    var item = {
      id: id,
      payload: payload || {},
      estado: 'PENDIENTE_LOCAL',
      intentos: 0,
      creadoEn: fecha(),
      actualizadoEn: fecha(),
      ultimoError: mensajeError(errorSheets)
    };
    lista.push(item);
    if (!guardar(lista)) {
      return Promise.reject(new Error('No se pudo guardar la contingencia local en este navegador.'));
    }
    return Promise.resolve({
      ok: true,
      estado: 'PENDIENTE_LOCAL',
      idRegistro: id,
      origen: 'localStorage',
      mensaje: 'El envío quedó en la cola local de este navegador.'
    });
  }
  function listarPendientes(){ return leer(); }
  function eliminar(id){
    var lista = leer().filter(function(item){ return item.id !== texto(id); });
    guardar(lista);
    return lista;
  }
  function reintentarTodos(){
    var sheets = window.EstudianteMVPSheets;
    var pendientes = leer();
    if (!sheets || typeof sheets.enviarEnvio !== 'function') {
      return Promise.reject(new Error('El servicio de Títulos no está disponible.'));
    }
    return pendientes.reduce(function(promesa,item){
      return promesa.then(function(resultados){
        return sheets.enviarEnvio(item.payload).then(function(resultado){
          eliminar(item.id);
          resultados.push({ id: item.id, ok: true, resultado: resultado });
          return resultados;
        }).catch(function(error){
          var lista = leer();
          lista.forEach(function(registro){
            if (registro.id === item.id) {
              registro.intentos = Number(registro.intentos || 0) + 1;
              registro.actualizadoEn = fecha();
              registro.ultimoError = mensajeError(error);
            }
          });
          guardar(lista);
          resultados.push({ id: item.id, ok: false, error: mensajeError(error) });
          return resultados;
        });
      });
    }, Promise.resolve([]));
  }

  var servicio = Object.freeze({
    guardarRespaldoEnviado: guardarRespaldoEnviado,
    guardarPendienteSync: guardarPendienteSync,
    listarPendientes: listarPendientes,
    eliminar: eliminar,
    reintentarTodos: reintentarTodos
  });
  window.EstudianteMVPColaEnvios = servicio;
  window.EstudianteMVPFirebaseEnvios = servicio;
})(window);
