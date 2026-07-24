(function(window){
  'use strict';
  var API_LOCAL='http://127.0.0.1:8788';
  var API_ADMIN='https://titulos-administrador.pages.dev';
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function esLocal(){var h=texto(window.location&&window.location.hostname).toLowerCase();return['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(h)>=0;}
  function base(){var f=texto(window.TITULOS_API_BASE||'');if(f)return f.replace(/\/$/,'');if(esLocal())return API_LOCAL;var o=texto(window.location&&window.location.origin);return/^https?:\/\//i.test(o)?o.replace(/\/$/,''):API_ADMIN;}
  function leerRespuesta(resp,nombre){return resp.text().then(function(body){var json={};try{json=body?JSON.parse(body):{};}catch(error){throw new Error((nombre||'El servicio')+' respondió en un formato no válido.');}if(!resp.ok||json.ok===false)throw new Error(json.mensaje||json.message||json.error||('Error HTTP '+resp.status));return json;});}
  function solicitar(ruta,accion,datos,metodo){return fetch(base()+ruta,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify({accion:accion,action:accion,metodo:metodo||'POST',datos:datos||{}})}).then(function(resp){return leerRespuesta(resp,'El servicio');});}
  function titulos(a,d,m){return solicitar('/api/titulos',a,d,m);}
  function requisitos(a,d){return solicitar('/api/requisitos',a,d,'POST');}
  function estadisticas(d){return solicitar('/api/estadisticas','ADMIN_ESTADISTICAS_TITULOS',d||{},'POST').then(function(result){window.ADAdminStatisticsLast=result;return result;});}
  function clavesGet(action){return fetch(base()+'/api/claves?action='+encodeURIComponent(action),{method:'GET',cache:'no-store',headers:{'X-Titulos-App':'administrador'}}).then(function(resp){return leerRespuesta(resp,'Configuración');});}
  function clavesPost(action,data){return fetch(base()+'/api/claves',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify(Object.assign({action:action},data||{}))}).then(function(resp){return leerRespuesta(resp,'Configuración');});}
  function iaGet(action,providerId){var url=base()+'/api/ia?action='+encodeURIComponent(action||'admin-list');if(providerId)url+='&providerId='+encodeURIComponent(providerId);return fetch(url,{method:'GET',cache:'no-store',headers:{'X-Titulos-App':'administrador'}}).then(function(resp){return leerRespuesta(resp,'IA');});}
  function iaPost(action,data){return fetch(base()+'/api/ia',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify(Object.assign({action:action},data||{}))}).then(function(resp){return leerRespuesta(resp,'IA');});}
  function lista(r,claves){if(Array.isArray(r))return r;r=r||{};for(var i=0;i<claves.length;i++)if(Array.isArray(r[claves[i]]))return r[claves[i]];if(r.data&&typeof r.data==='object')return lista(r.data,claves);if(r.resultado&&typeof r.resultado==='object')return lista(r.resultado,claves);return[];}
  var api={
    base:base,
    configTitulos:function(){return titulos('CONFIGURACION_PUBLICA',{},'GET');},
    configRequisitos:function(){return requisitos('CONFIGURACION_PUBLICA',{});},
    pingTitulos:function(){return titulos('PING',{},'GET');},
    pingRequisitos:function(){return requisitos('PING',{});},
    listarServicios:function(){return clavesGet('admin-list');},
    guardarServicio:function(servicio){return clavesPost('admin-save',{service:servicio||{}});},
    listarPeriodos:function(){return requisitos('LISTAR_PERIODOS_TITULACION',{});},
    listarCarreras:function(periodoId){return requisitos('LISTAR_CARRERAS_PERIODO',{periodoId:periodoId||''});},
    consultarEstudiante:function(cedula,periodoId){return titulos('CONSULTAR_ESTUDIANTE',{cedula:cedula,numeroIdentificacion:cedula,periodoId:periodoId||''},'GET');},
    listarCoordinadores:function(){return titulos('LISTAR_COORDINADORES',{incluirInactivos:true},'GET');},
    guardarCoordinador:function(datos){return titulos('GUARDAR_COORDINADOR',datos||{},'POST');},
    cambiarEstadoCoordinador:function(datos){return titulos('CAMBIAR_ESTADO_COORDINADOR',datos||{},'POST');},
    asignarCarreras:function(datos){return titulos('ASIGNAR_CARRERA',datos||{},'POST');},
    listarTitulos:function(filtros){return titulos('LISTAR_ENVIOS_POR_CARRERA',filtros||{carreras:'',carrera:'',estado:'',periodo:''},'GET');},
    consultarTitulo:function(cedula,periodo){return titulos('VERIFICAR_ENVIO',{cedula:cedula,numeroIdentificacion:cedula,periodo:periodo||''},'GET');},
    devolverTitulo:function(datos){return titulos('GUARDAR_RESOLUCION',datos||{},'POST');},
    eliminarTitulo:function(datos){return titulos('ADMIN_ELIMINAR_TITULOS',datos||{},'POST');},
    obtenerEstadisticas:function(filtros){return estadisticas(filtros||{});},
    listarIA:function(){return iaGet('admin-list');},
    guardarIA:function(proveedor){return iaPost('admin-save',{provider:proveedor||{}});},
    cambiarEstadoIA:function(providerId,activo){return iaPost('admin-toggle',{providerId:providerId,activo:activo===true});},
    probarIA:function(providerId,prompt){return iaPost('admin-test',{providerId:providerId,prompt:prompt||'Responde únicamente: conexión correcta.'});},
    extraerServicios:function(r){return lista(r,['servicios','registros']);},
    extraerPeriodos:function(r){return lista(r,['periodos','periods','registros']);},
    extraerCarreras:function(r){return lista(r,['carreras','registros']);},
    extraerCoordinadores:function(r){return lista(r,['coordinadores','registros']);},
    extraerTitulos:function(r){return lista(r,['envios','registros']);}
  };
  window.ADAPIService=Object.freeze(api);
  function cargarComplemento(ruta,atributo){if(!window.document||window.document.querySelector('script['+atributo+'="true"]'))return;var script=window.document.createElement('script');script.src=ruta;script.async=false;script.setAttribute(atributo,'true');window.document.head.appendChild(script);}
  cargarComplemento('./ad-js/ad-servicios.app.js?v=3.2.1','data-ad-servicios');
  cargarComplemento('./ad-js/ad-correo-outlook.js?v=3.2.1','data-ad-correo-outlook');
})(window);
