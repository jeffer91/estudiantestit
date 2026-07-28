(function(window){
  'use strict';
  var API_LOCAL='http://127.0.0.1:8788';
  var API_ADMIN='https://titulos-administrador.pages.dev';
  var CACHE_PREFIX='admin-api:v1:';
  var memoria=new Map();
  var enCurso=new Map();
  var cacheGeneration=0;
  var forzarHasta=0;
  var respaldoBloqueadoGeneracion=-1;
  var limpiezaEnCurso=Promise.resolve({ok:true});
  var TTL={
    ping:30*1000,
    configuracion:5*60*1000,
    servicios:5*60*1000,
    periodos:30*60*1000,
    carreras:30*60*1000,
    coordinadores:10*60*1000,
    titulos:2*60*1000,
    global:3*60*1000,
    estadisticas:3*60*1000,
    ia:2*60*1000,
    titulo:60*1000
  };

  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function esLocal(){var h=texto(window.location&&window.location.hostname).toLowerCase();return['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(h)>=0;}
  function base(){var f=texto(window.TITULOS_API_BASE||'');if(f)return f.replace(/\/$/,'');if(esLocal())return API_LOCAL;var o=texto(window.location&&window.location.origin);return/^https?:\/\//i.test(o)?o.replace(/\/$/,''):API_ADMIN;}
  function leerRespuesta(resp,nombre){return resp.text().then(function(body){var json={};try{json=body?JSON.parse(body):{};}catch(error){throw new Error((nombre||'El servicio')+' respondió en un formato no válido.');}if(!resp.ok||json.ok===false)throw new Error(json.mensaje||json.message||json.error||('Error HTTP '+resp.status));return json;});}
  function solicitar(ruta,accion,datos,metodo){return fetch(base()+ruta,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify({accion:accion,action:accion,metodo:metodo||'POST',datos:datos||{}})}).then(function(resp){return leerRespuesta(resp,'El servicio');});}
  function clavesGetRed(action){return fetch(base()+'/api/claves?action='+encodeURIComponent(action),{method:'GET',cache:'no-store',headers:{'X-Titulos-App':'administrador'}}).then(function(resp){return leerRespuesta(resp,'Configuración');});}
  function clavesPost(action,data){return fetch(base()+'/api/claves',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify(Object.assign({action:action},data||{}))}).then(function(resp){return leerRespuesta(resp,'Configuración');});}
  function iaGetRed(action,providerId){var url=base()+'/api/ia?action='+encodeURIComponent(action||'admin-list');if(providerId)url+='&providerId='+encodeURIComponent(providerId);return fetch(url,{method:'GET',cache:'no-store',headers:{'X-Titulos-App':'administrador'}}).then(function(resp){return leerRespuesta(resp,'IA');});}
  function iaPost(action,data){return fetch(base()+'/api/ia',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify(Object.assign({action:action},data||{}))}).then(function(resp){return leerRespuesta(resp,'IA');});}

  function estable(value){
    if(Array.isArray(value))return value.map(estable);
    if(value&&typeof value==='object')return Object.keys(value).sort().reduce(function(out,key){out[key]=estable(value[key]);return out;},{});
    return value;
  }
  function claveCache(ruta,accion,datos){return CACHE_PREFIX+ruta+'|'+accion+'|'+JSON.stringify(estable(datos||{}));}
  function puente(){return window.AdminElectron&&window.AdminElectron.isElectron&&window.AdminElectron.cache?window.AdminElectron.cache:null;}
  function clonar(value){try{return JSON.parse(JSON.stringify(value));}catch(_error){return value;}}

  function mostrarAvisoCache(item){
    if(!window.document)return;
    var el=window.document.getElementById('ad-cache-warning');
    if(!el){
      el=window.document.createElement('div');
      el.id='ad-cache-warning';
      el.setAttribute('role','status');
      el.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:12000;max-width:min(760px,calc(100vw - 32px));padding:11px 16px;border:1px solid #d6ac43;border-radius:12px;background:#fff8df;color:#624800;box-shadow:0 12px 30px rgba(20,35,55,.18);font:600 14px/1.35 system-ui,sans-serif;text-align:center;';
      window.document.body.appendChild(el);
    }
    var saved=Number(item&&item.savedAt||0);
    var when=saved?new Date(saved).toLocaleString('es-EC',{dateStyle:'medium',timeStyle:'short'}):'una consulta anterior';
    el.textContent='Sin conexión con el servidor. Se muestran datos guardados desde '+when+'.';
    el.hidden=false;
  }
  function ocultarAvisoCache(){var el=window.document&&window.document.getElementById('ad-cache-warning');if(el)el.hidden=true;}

  function leerMemoria(key){
    var item=memoria.get(key);
    if(!item)return null;
    return{hit:true,stale:Number(item.expiresAt||0)<=Date.now(),value:clonar(item.value),savedAt:item.savedAt,expiresAt:item.expiresAt};
  }
  function guardarMemoria(key,value,ttlMs,savedAt,expiresAt){
    var now=Date.now();
    memoria.set(key,{value:clonar(value),savedAt:Number(savedAt||now),expiresAt:Number(expiresAt||now+ttlMs)});
    if(memoria.size>200)memoria.delete(memoria.keys().next().value);
  }
  function leerCache(key){
    var local=leerMemoria(key);
    if(local)return Promise.resolve(local);
    var bridge=puente();
    if(!bridge)return Promise.resolve({hit:false,stale:false});
    return bridge.get(key).then(function(item){
      item=item||{hit:false,stale:false};
      if(item.hit)guardarMemoria(key,item.value,Math.max(1000,Number(item.expiresAt||0)-Number(item.savedAt||0)),item.savedAt,item.expiresAt);
      return item;
    }).catch(function(){return{hit:false,stale:false};});
  }
  function guardarCache(key,value,ttlMs){
    guardarMemoria(key,value,ttlMs);
    var bridge=puente();
    if(!bridge)return Promise.resolve(value);
    return bridge.set(key,value,ttlMs).catch(function(){return null;}).then(function(){return value;});
  }
  function forzarRed(options){
    options=options||{};
    cacheGeneration+=1;
    memoria.clear();enCurso.clear();
    forzarHasta=Date.now()+Math.max(0,Number(options.forzarMs===undefined?10000:options.forzarMs));
    respaldoBloqueadoGeneracion=options.permitirRespaldo===false?cacheGeneration:-1;
    return Promise.resolve({ok:true});
  }
  function limpiarCache(options){
    options=options||{};
    cacheGeneration+=1;
    memoria.clear();enCurso.clear();
    forzarHasta=Date.now()+Math.max(0,Number(options.forzarMs===undefined?8000:options.forzarMs));
    respaldoBloqueadoGeneracion=-1;
    var bridge=puente();
    limpiezaEnCurso=limpiezaEnCurso.catch(function(){return{ok:false};}).then(function(){
      return bridge?bridge.clearPrefix(CACHE_PREFIX).catch(function(){return{ok:false};}):{ok:true};
    });
    return limpiezaEnCurso;
  }
  function solicitarConCache(ruta,accion,datos,ttlMs,cargador){
    var key=claveCache(ruta,accion,datos);
    if(enCurso.has(key))return enCurso.get(key);
    var generation=cacheGeneration;
    var task=limpiezaEnCurso.catch(function(){return{ok:false};}).then(function(){
      if(generation!==cacheGeneration)return solicitarConCache(ruta,accion,datos,ttlMs,cargador);
      return leerCache(key).then(function(cached){
        if(generation!==cacheGeneration)return solicitarConCache(ruta,accion,datos,ttlMs,cargador);
        if(Date.now()>=forzarHasta&&cached.hit&&!cached.stale){ocultarAvisoCache();return cached.value;}
        return Promise.resolve().then(cargador).then(function(result){
          if(generation!==cacheGeneration)return solicitarConCache(ruta,accion,datos,ttlMs,cargador);
          ocultarAvisoCache();
          return guardarCache(key,result,ttlMs);
        }).catch(function(error){
          if(generation!==cacheGeneration)return solicitarConCache(ruta,accion,datos,ttlMs,cargador);
          if(cached.hit&&respaldoBloqueadoGeneracion!==generation){mostrarAvisoCache(cached);return cached.value;}
          throw error;
        });
      });
    });
    enCurso.set(key,task);
    return task.finally(function(){if(enCurso.get(key)===task)enCurso.delete(key);});
  }
  function escritura(promesa){return Promise.resolve(promesa).then(function(result){return limpiarCache({forzarMs:5000}).then(function(){return result;});});}
  function titulosLectura(a,d,m,ttl){return solicitarConCache('/api/titulos',a,d||{},ttl,function(){return solicitar('/api/titulos',a,d,m);});}
  function requisitosLectura(a,d,ttl){return solicitarConCache('/api/requisitos',a,d||{},ttl,function(){return solicitar('/api/requisitos',a,d,'POST');});}
  function adminGlobalLectura(a,d,ttl){return solicitarConCache('/api/estadisticas',a,d||{},ttl,function(){return solicitar('/api/estadisticas',a,d||{},'POST');});}
  function clavesGet(action){return solicitarConCache('/api/claves',action,{},TTL.servicios,function(){return clavesGetRed(action);});}
  function iaGet(action,providerId){return solicitarConCache('/api/ia',action,{providerId:providerId||''},TTL.ia,function(){return iaGetRed(action,providerId);});}
  function lista(r,claves){if(Array.isArray(r))return r;r=r||{};for(var i=0;i<claves.length;i++)if(Array.isArray(r[claves[i]]))return r[claves[i]];if(r.data&&typeof r.data==='object')return lista(r.data,claves);if(r.resultado&&typeof r.resultado==='object')return lista(r.resultado,claves);return[];}

  var api={
    version:'3.3.9-electron.2',
    base:base,
    esElectron:function(){return Boolean(puente());},
    limpiarCache:limpiarCache,
    forzarActualizacion:forzarRed,
    cacheEstado:function(){var bridge=puente();return bridge?bridge.stats():Promise.resolve({entries:memoria.size,persistent:false});},
    configTitulos:function(){return titulosLectura('CONFIGURACION_PUBLICA',{},'GET',TTL.configuracion);},
    configRequisitos:function(){return requisitosLectura('CONFIGURACION_PUBLICA',{},TTL.configuracion);},
    pingTitulos:function(){return titulosLectura('PING',{},'GET',TTL.ping);},
    pingRequisitos:function(){return requisitosLectura('PING',{},TTL.ping);},
    listarServicios:function(){return clavesGet('admin-list');},
    guardarServicio:function(servicio){return escritura(clavesPost('admin-save',{service:servicio||{}}));},
    listarPeriodos:function(){return requisitosLectura('LISTAR_PERIODOS_TITULACION',{},TTL.periodos);},
    listarPeriodosAdmin:function(){return adminGlobalLectura('ADMIN_LISTAR_PERIODOS',{},TTL.periodos);},
    guardarPeriodoAdmin:function(datos){return escritura(solicitar('/api/estadisticas','ADMIN_GUARDAR_PERIODO',datos||{},'POST'));},
    listarCarreras:function(periodoId){return requisitosLectura('LISTAR_CARRERAS_PERIODO',{periodoId:periodoId||''},TTL.carreras);},
    listarCarrerasAdmin:function(){return adminGlobalLectura('ADMIN_LISTAR_CARRERAS',{},TTL.carreras);},
    asignarCarreraCoordinador:function(datos){return escritura(solicitar('/api/estadisticas','ADMIN_ASIGNAR_CARRERA_COORDINADOR',datos||{},'POST'));},
    consultarEstudiante:function(cedula,periodoId){return solicitar('/api/titulos','CONSULTAR_ESTUDIANTE',{cedula:cedula,numeroIdentificacion:cedula,periodoId:periodoId||''},'GET');},
    listarCoordinadores:function(){return titulosLectura('LISTAR_COORDINADORES',{incluirInactivos:true},'GET',TTL.coordinadores);},
    guardarCoordinador:function(datos){return escritura(solicitar('/api/titulos','GUARDAR_COORDINADOR',datos||{},'POST'));},
    cambiarEstadoCoordinador:function(datos){return escritura(solicitar('/api/titulos','CAMBIAR_ESTADO_COORDINADOR',datos||{},'POST'));},
    asignarCarreras:function(datos){return escritura(solicitar('/api/titulos','ASIGNAR_CARRERA',datos||{},'POST'));},
    listarTitulos:function(filtros){return titulosLectura('LISTAR_ENVIOS_POR_CARRERA',filtros||{carreras:'',carrera:'',estado:'',periodo:''},'GET',TTL.titulos);},
    listarTitulosGlobal:function(filtros){return adminGlobalLectura('ADMIN_LISTA_GLOBAL_TITULOS',filtros||{},TTL.global).then(function(result){window.ADAdminGlobalLast=result;return result;});},
    consultarTitulo:function(cedula,periodo){return titulosLectura('VERIFICAR_ENVIO',{cedula:cedula,numeroIdentificacion:cedula,periodo:periodo||''},'GET',TTL.titulo);},
    devolverTitulo:function(datos){return escritura(solicitar('/api/titulos','GUARDAR_RESOLUCION',datos||{},'POST'));},
    eliminarTitulo:function(datos){return escritura(solicitar('/api/titulos','ADMIN_ELIMINAR_TITULOS',datos||{},'POST'));},
    obtenerEstadisticas:function(filtros){return adminGlobalLectura('ADMIN_ESTADISTICAS_TITULOS',filtros||{},TTL.estadisticas).then(function(result){window.ADAdminStatisticsLast=result;return result;});},
    exportarFirebaseTitulos:function(){return solicitar('/api/estadisticas','ADMIN_REPORTE_FIREBASE_TITULOS',{},'POST');},
    listarIA:function(){return iaGet('admin-list');},
    guardarIA:function(proveedor){return escritura(iaPost('admin-save',{provider:proveedor||{}}));},
    cambiarEstadoIA:function(providerId,activo){return escritura(iaPost('admin-toggle',{providerId:providerId,activo:activo===true}));},
    probarIA:function(providerId,prompt){return iaPost('admin-test',{providerId:providerId,prompt:prompt||'Responde únicamente: conexión correcta.'});},
    extraerServicios:function(r){return lista(r,['servicios','registros']);},
    extraerPeriodos:function(r){return lista(r,['periodos','periods','registros']);},
    extraerCarreras:function(r){return lista(r,['carreras','registros']);},
    extraerCoordinadores:function(r){return lista(r,['coordinadores','registros']);},
    extraerTitulos:function(r){return lista(r,['estudiantes','envios','registros']);}
  };
  window.ADAPIService=Object.freeze(api);

  if(window.document){
    window.document.addEventListener('click',function(event){
      var button=event.target&&event.target.closest?event.target.closest('[data-action],[data-v2-action]'):null;
      if(!button)return;
      var action=button.getAttribute('data-action')||button.getAttribute('data-v2-action')||'';
      if(action==='diagnosticar')forzarRed({forzarMs:10000,permitirRespaldo:false});
      else if(['refrescar','reload-periods','reload-careers','load-stats','actualizar-datos'].indexOf(action)>=0)forzarRed({forzarMs:10000,permitirRespaldo:true});
    },true);
  }

  function cargarComplemento(ruta,atributo){if(!window.document||window.document.querySelector('script['+atributo+'="true"]'))return;var script=window.document.createElement('script');script.src=ruta;script.async=false;script.setAttribute(atributo,'true');window.document.head.appendChild(script);}
  cargarComplemento('./ad-js/ad-servicios.app.js?v=3.3.3','data-ad-servicios');
  cargarComplemento('./ad-js/ad-correo-outlook.js?v=3.3.3','data-ad-correo-outlook');
  cargarComplemento('./ad-js/ad-administracion-global.js?v=3.3.3','data-ad-administracion-global');
  cargarComplemento('./ad-js/ad-pdf-firebase.js?v=3.3.3','data-ad-pdf-firebase');
  cargarComplemento('./ad-js/ad-version.js?v=3.3.3','data-ad-version');
})(window);
