/* Proveedores IA para Estudiantes: solo metadatos públicos, nunca claves. */
(function(window){
  'use strict';
  var cache=null;
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function numero(v,f){var n=Number(v);return Number.isFinite(n)?n:Number(f||0);}
  function esLocal(){var h=texto(window.location&&window.location.hostname).toLowerCase();return ['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(h)>=0;}
  function apiBase(){
    var forzada=texto(window.TITULOS_API_BASE||'');
    if(forzada)return forzada.replace(/\/$/,'');
    if(esLocal())return 'http://127.0.0.1:8787';
    return window.location.origin;
  }
  function apiUrl(){return apiBase()+'/api/ia?action=list';}
  function normalizarProveedor(data,idForzado){
    data=data||{};
    var utils=window.EstudianteMVPUtils||null;
    var normalizar=utils&&typeof utils.normalizarClave==='function'?utils.normalizarClave:function(v){return texto(v).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');};
    var id=normalizar(idForzado||data.id||data.proveedor||data.provider||data.nombre||'');
    return {
      id:id,proveedor:id,nombre:texto(data.nombre||data.name||id),tipo:texto(data.tipo||data.protocol||'').replace(/_/g,'-'),
      activo:data.activo===true,prioridad:numero(data.prioridad||data.priority,999),modelo:texto(data.modelo||data.model||''),model:texto(data.model||data.modelo||''),
      timeoutMs:Math.max(5000,numero(data.timeoutMs,45000)),maxTokens:Math.max(100,numero(data.maxTokens,900)),temperatura:numero(data.temperatura,0.4),
      descripcion:texto(data.descripcion||''),apiKey:'',key:'',token:'',endpoint:'',raw:null
    };
  }
  function listarProveedores(forzar){
    if(cache&&!forzar)return Promise.resolve(cache.slice());
    return fetch(apiUrl(),{method:'GET',cache:'no-store'}).then(function(resp){return resp.text().then(function(body){var json={};try{json=body?JSON.parse(body):{};}catch(e){throw new Error('El servicio IA respondió en un formato no válido.');}if(!resp.ok||json.ok===false)throw new Error(json.error||json.mensaje||'No se pudieron cargar los proveedores IA.');return json;});})
      .then(function(json){cache=(Array.isArray(json.proveedores)?json.proveedores:[]).map(normalizarProveedor).filter(function(p){return p.id;}).sort(function(a,b){return a.prioridad-b.prioridad;});return cache.slice();});
  }
  function listarProveedoresActivos(){return listarProveedores(false).then(function(lista){return lista.filter(function(p){return p.activo===true;});});}
  function leerProveedor(id){id=texto(id);return listarProveedores(false).then(function(lista){return lista.find(function(p){return p.id===id||p.proveedor===id;})||null;});}
  function obtenerProveedorPreferido(lista){return (Array.isArray(lista)?lista:[]).filter(function(p){return p.activo;}).sort(function(a,b){return a.prioridad-b.prioridad;})[0]||null;}
  function probarLectura(){return listarProveedoresActivos().then(function(lista){return{ok:true,totalActivos:lista.length,proveedores:lista,mensaje:lista.length?'Proveedores IA activos encontrados.':'No hay proveedores IA activos.'};});}
  window.EstudianteMVPFirebaseIA=Object.freeze({listarProveedores:listarProveedores,listarProveedoresActivos:listarProveedoresActivos,leerProveedor:leerProveedor,normalizarProveedor:normalizarProveedor,obtenerProveedorPreferido:obtenerProveedorPreferido,probarLectura:probarLectura});
})(window);
