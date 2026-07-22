/* API central del Administrador v3. */
(function(window){
  'use strict';

  var API_PUBLICA='https://titulos.pages.dev';
  var API_LOCAL='http://127.0.0.1:8788';
  var DEFAULT_TIMEOUT=60000;
  var cache=new Map();
  var inflight=new Map();

  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function esLocal(){var host=texto(window.location&&window.location.hostname).toLowerCase();return ['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(host)>=0;}
  function base(){var forzada=texto(window.TITULOS_API_BASE||'');if(forzada)return forzada.replace(/\/$/,'');return esLocal()?API_LOCAL:API_PUBLICA;}
  function errorServicio(mensaje,status,respuesta){var error=new Error(mensaje||'No se pudo completar la solicitud.');error.status=status||0;error.respuesta=respuesta||null;return error;}
  function leerRespuesta(resp,nombre){return resp.text().then(function(body){var json={};try{json=body?JSON.parse(body):{};}catch(error){throw errorServicio((nombre||'El servicio')+' respondió en un formato no válido.',resp.status,{raw:body});}if(!resp.ok||json.ok===false)throw errorServicio(json.mensaje||json.message||json.error||('Error HTTP '+resp.status),resp.status,json);return json;});}
  function solicitar(ruta,accion,datos,metodo,opciones){
    opciones=opciones||{};
    var controller=typeof AbortController==='function'?new AbortController():null;
    var timeout=Number(opciones.timeoutMs||DEFAULT_TIMEOUT);
    var timer=controller?window.setTimeout(function(){controller.abort();},timeout):null;
    var request={method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify({accion:accion,action:accion,metodo:metodo||'POST',datos:datos||{}})};
    if(controller)request.signal=controller.signal;
    return fetch(base()+ruta,request).then(function(resp){return leerRespuesta(resp,opciones.nombre||'El servicio');}).catch(function(error){if(error&&error.name==='AbortError')throw errorServicio('La solicitud superó el tiempo máximo.');throw error;}).finally(function(){if(timer)window.clearTimeout(timer);});
  }
  function clavesGet(action){return fetch(base()+'/api/claves?action='+encodeURIComponent(action),{method:'GET',cache:'no-store',headers:{'X-Titulos-App':'administrador'}}).then(function(resp){return leerRespuesta(resp,'Claves');});}
  function clavesPost(action,data){return fetch(base()+'/api/claves',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify(Object.assign({action:action},data||{}))}).then(function(resp){return leerRespuesta(resp,'Claves');});}
  function iaGet(action,providerId){var url=base()+'/api/ia?action='+encodeURIComponent(action||'admin-list');if(providerId)url+='&providerId='+encodeURIComponent(providerId);return fetch(url,{method:'GET',cache:'no-store',headers:{'X-Titulos-App':'administrador'}}).then(function(resp){return leerRespuesta(resp,'IA');});}
  function iaPost(action,data){return fetch(base()+'/api/ia',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify(Object.assign({action:action},data||{}))}).then(function(resp){return leerRespuesta(resp,'IA');});}
  function titulos(accion,datos,metodo){return solicitar('/api/titulos',accion,datos,metodo,{nombre:'Títulos'});}
  function requisitos(accion,datos){return solicitar('/api/requisitos',accion,datos,'POST',{nombre:'Requisitos'});}
  function cacheKey(nombre,datos){return nombre+'|'+JSON.stringify(datos||{});}
  function leerCache(nombre,datos,ttl,cargador,forzar){var key=cacheKey(nombre,datos);var guardado=cache.get(key);if(!forzar&&guardado&&guardado.expira>Date.now())return Promise.resolve(guardado.valor);if(!forzar&&inflight.has(key))return inflight.get(key);var tarea=Promise.resolve().then(cargador).then(function(valor){cache.set(key,{valor:valor,expira:Date.now()+ttl});return valor;}).finally(function(){inflight.delete(key);});inflight.set(key,tarea);return tarea;}
  function invalidar(prefijo){Array.from(cache.keys()).forEach(function(key){if(!prefijo||key.indexOf(prefijo)===0)cache.delete(key);});Array.from(inflight.keys()).forEach(function(key){if(!prefijo||key.indexOf(prefijo)===0)inflight.delete(key);});}
  function buscarLista(valor,claves,profundidad){if(profundidad>8||valor===null||valor===undefined)return[];if(Array.isArray(valor))return valor;if(typeof valor!=='object')return[];var i;for(i=0;i<claves.length;i+=1)if(Array.isArray(valor[claves[i]]))return valor[claves[i]];var nombres=Object.keys(valor);for(i=0;i<nombres.length;i+=1){var lista=buscarLista(valor[nombres[i]],claves,profundidad+1);if(lista.length)return lista;}return[];}
  function lista(valor,claves){return buscarLista(valor,claves,0);}

  var api={
    version:'3.0.0',base:base,invalidar:invalidar,
    configTitulos:function(forzar){return leerCache('configTitulos',{},5*60*1000,function(){return titulos('CONFIGURACION_PUBLICA',{},'GET');},forzar===true);},
    configRequisitos:function(forzar){return leerCache('configRequisitos',{},5*60*1000,function(){return requisitos('CONFIGURACION_PUBLICA',{});},forzar===true);},
    pingTitulos:function(){return titulos('PING',{},'GET');},
    pingRequisitos:function(){return requisitos('PING',{});},
    resumenAdministrador:function(){return titulos('RESUMEN_ADMINISTRADOR',{},'GET');},
    listarPeriodos:function(forzar){return leerCache('periodos',{},5*60*1000,function(){return requisitos('LISTAR_PERIODOS_TITULACION',{});},forzar===true);},
    listarCarreras:function(periodoId,forzar){var datos={periodoId:periodoId||''};return leerCache('carreras',datos,5*60*1000,function(){return requisitos('LISTAR_CARRERAS_PERIODO',datos);},forzar===true);},
    consultarEstudiante:function(cedula,periodoId){return requisitos('CONSULTAR_ESTUDIANTE_TITULACION',{cedula:cedula,numeroIdentificacion:cedula,periodoId:periodoId||''});},
    listarCoordinadores:function(forzar){return leerCache('coordinadores',{},5*60*1000,function(){return titulos('LISTAR_COORDINADORES',{incluirInactivos:true},'GET');},forzar===true);},
    guardarCoordinador:function(datos){return titulos('GUARDAR_COORDINADOR',datos||{},'POST').then(function(r){invalidar('coordinadores');return r;});},
    cambiarEstadoCoordinador:function(datos){return titulos('CAMBIAR_ESTADO_COORDINADOR',datos||{},'POST').then(function(r){invalidar('coordinadores');return r;});},
    asignarCarreras:function(datos){return titulos('ASIGNAR_CARRERA',datos||{},'POST').then(function(r){invalidar('coordinadores');return r;});},
    listarTitulos:function(filtros,forzar){var datos=Object.assign({carreras:'',carrera:'',estado:'',periodo:'',todas:'true',incluirTodos:'true'},filtros||{});return leerCache('titulos',datos,60*1000,function(){return titulos('LISTAR_ENVIOS_POR_CARRERA',datos,'GET');},forzar===true);},
    consultarTitulo:function(cedula,periodo){return titulos('VERIFICAR_ENVIO',{cedula:cedula,numeroIdentificacion:cedula,periodo:periodo||''},'GET');},
    devolverTitulo:function(datos){return titulos('GUARDAR_RESOLUCION',datos||{},'POST').then(function(r){invalidar('titulos');return r;});},
    listarPendientesSync:function(forzar){return leerCache('pendientesSync',{},30*1000,function(){return titulos('LISTAR_PENDIENTES_SYNC',{},'GET');},forzar===true);},
    listarLogs:function(){return titulos('LISTAR_LOGS',{},'GET');},
    listarHistorialReparaciones:function(){return titulos('LISTAR_HISTORIAL_REPARACIONES',{},'GET');},
    analizarGoogleSheets:function(){return titulos('ANALIZAR_GOOGLE_SHEETS',{},'GET');},
    listarServicios:function(forzar){return leerCache('servicios',{},5*60*1000,function(){return clavesGet('admin-list');},forzar===true);},
    guardarServicio:function(servicio){return clavesPost('admin-save',{service:servicio||{}}).then(function(r){invalidar('servicios');return r;});},
    listarIA:function(forzar){return leerCache('ia',{},5*60*1000,function(){return iaGet('admin-list');},forzar===true);},
    guardarIA:function(proveedor){return iaPost('admin-save',{provider:proveedor||{}}).then(function(r){invalidar('ia');return r;});},
    cambiarEstadoIA:function(providerId,activo){return iaPost('admin-toggle',{providerId:providerId,activo:activo===true}).then(function(r){invalidar('ia');return r;});},
    probarIA:function(providerId,prompt){return iaPost('admin-test',{providerId:providerId,prompt:prompt||'Responde únicamente: conexión correcta.'});},
    extraerServicios:function(r){return lista(r,['servicios','registros','filas','rows','items']);},
    extraerPeriodos:function(r){return lista(r,['periodos','periods','registros','filas','rows','items']);},
    extraerCarreras:function(r){return lista(r,['carreras','registros','filas','rows','items']);},
    extraerCoordinadores:function(r){return lista(r,['coordinadores','registros','filas','rows','items']);},
    extraerTitulos:function(r){return lista(r,['envios','registros','filas','rows','items','estudiantes']);},
    extraerPendientesSync:function(r){return lista(r,['pendientes','pendientesSync','registros','filas','rows','items']);}
  };
  window.ADAPIService=Object.freeze(api);
})(window);
