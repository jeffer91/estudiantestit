/* Configuración pública de IA de Titulación. Nunca expone marcas, modelos ni credenciales. */
(function(window){
  'use strict';

  var cache = null;

  function texto(v){ return String(v === null || v === undefined ? '' : v).trim(); }
  function numero(v,f){ var n = Number(v); return Number.isFinite(n) ? n : Number(f || 0); }
  function esLocal(){
    var host = texto(window.location && window.location.hostname).toLowerCase();
    return ['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(host) >= 0;
  }
  function apiBase(){
    var forzada = texto(window.TITULOS_API_BASE || '');
    if (forzada) return forzada.replace(/\/$/, '');
    if (esLocal()) return 'http://127.0.0.1:8788';
    return window.location.origin && window.location.origin !== 'null'
      ? window.location.origin
      : 'https://titulos.pages.dev';
  }
  function apiUrl(){ return apiBase() + '/api/ia?action=list'; }

  function normalizarMotor(data,index){
    data = data || {};
    index = Number(index || 0);
    var id = texto(data.id || data.motor || ('motor_' + (index + 1)));
    return {
      id: id,
      proveedor: id,
      nombre: 'Motor interno ' + (index + 1),
      tipo: 'interno',
      activo: data.activo !== false,
      prioridad: numero(data.prioridad,index + 1),
      timeoutMs: Math.max(5000,numero(data.timeoutMs,45000)),
      maxTokens: Math.max(100,numero(data.maxTokens,3000)),
      temperatura: numero(data.temperatura,0.3),
      descripcion: 'Motor interno de IA de Titulación.',
      modelo: '',
      model: '',
      apiKeyConfigurada: true,
      apiKey: '',
      key: '',
      token: '',
      endpoint: '',
      raw: null
    };
  }

  function listarProveedores(forzar){
    if (cache && !forzar) return Promise.resolve(cache.slice());

    return fetch(apiUrl(),{method:'GET',cache:'no-store'})
      .then(function(resp){
        return resp.text().then(function(body){
          var json = {};
          try { json = body ? JSON.parse(body) : {}; }
          catch (error) { throw new Error('El servicio de IA respondió en un formato no válido.'); }
          if (!resp.ok || json.ok === false) {
            throw new Error(json.error || json.mensaje || 'No se pudo iniciar la IA de Titulación.');
          }
          return json;
        });
      })
      .then(function(json){
        var lista = Array.isArray(json.proveedores) ? json.proveedores : [];
        cache = lista.map(normalizarMotor)
          .filter(function(motor){ return motor.id && motor.activo === true; })
          .sort(function(a,b){ return a.prioridad - b.prioridad; });
        return cache.slice();
      });
  }

  function listarProveedoresActivos(){
    return listarProveedores(false);
  }

  function leerProveedor(id){
    id = texto(id);
    return listarProveedores(false).then(function(lista){
      return lista.find(function(motor){ return motor.id === id; }) || null;
    });
  }

  function obtenerProveedorPreferido(lista){
    return (Array.isArray(lista) ? lista : [])
      .filter(function(motor){ return motor.activo === true; })
      .sort(function(a,b){ return a.prioridad - b.prioridad; })[0] || null;
  }

  function probarLectura(){
    return listarProveedoresActivos().then(function(lista){
      return {
        ok: lista.length > 0,
        activo: lista.length > 0,
        totalActivos: lista.length,
        motoresDisponibles: lista.length,
        proveedores: lista,
        mensaje: lista.length
          ? 'IA de Titulación disponible.'
          : 'La IA de Titulación no está disponible en este momento.'
      };
    });
  }

  var servicio = Object.freeze({
    listarProveedores: listarProveedores,
    listarProveedoresActivos: listarProveedoresActivos,
    leerProveedor: leerProveedor,
    normalizarProveedor: normalizarMotor,
    obtenerProveedorPreferido: obtenerProveedorPreferido,
    probarLectura: probarLectura
  });

  window.EstudianteMVPIAConfig = servicio;
  window.EstudianteMVPFirebaseIA = servicio;
})(window);
