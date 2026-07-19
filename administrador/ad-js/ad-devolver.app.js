/* =========================================================
Archivo: ad-devolver.app.js
Ruta: /administrador/ad-js/ad-devolver.app.js
Función:
- Ejecutar devoluciones primero en Google Sheets.
- Actualizar Firebase únicamente como respaldo posterior.
- Cargar las correcciones administrativas complementarias.
========================================================= */
(function(window,document){
"use strict";
function cfg(){return window.AD_CONFIG||{};}
function fs(){return window.ADFirebaseService||null;}
function ts(){return window.ADTitulosService||null;}
function el(id){return document.getElementById(id);}
function txt(v){return String(v==null?"":v).trim();}
function val(id){var x=el(id);return x?txt(x.value):"";}
function setText(id,v){var x=el(id);if(x)x.textContent=v;}
function clean(v){return ts()&&ts().limpiarCedula?ts().limpiarCedula(v):txt(v).replace(/\D/g,"");}
function cols(){return cfg().colecciones||{};}
function detener(ev){if(!ev)return;ev.preventDefault();ev.stopPropagation();if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();}

function cargarScript(id,ruta){
  return new Promise(function(resolve,reject){
    var existente=document.getElementById(id);
    var inicio=Date.now();
    var timer;
    function comprobar(){
      if(id==="ad-sheets-service-script"&&window.ADSheetsService){if(timer)clearInterval(timer);resolve(window.ADSheetsService);return true;}
      if(existente&&existente.getAttribute("data-loaded")==="1"){if(timer)clearInterval(timer);resolve(existente);return true;}
      if(Date.now()-inicio>10000){if(timer)clearInterval(timer);reject(new Error("No se pudo cargar "+ruta));return true;}
      return false;
    }
    if(!existente){
      existente=document.createElement("script");
      existente.id=id;
      existente.src=ruta;
      existente.async=false;
      existente.onload=function(){existente.setAttribute("data-loaded","1");comprobar();};
      existente.onerror=function(){reject(new Error("No se pudo cargar "+ruta));};
      document.body.appendChild(existente);
    }
    timer=setInterval(comprobar,100);
    comprobar();
  });
}

function asegurarSheets(){
  if(window.ADSheetsService)return Promise.resolve(window.ADSheetsService);
  return cargarScript("ad-sheets-service-script","./ad-js/ad-sheets.service.js?v=1.11.0");
}

function buscarTituloRespaldo(cedula){
  var servicio=fs(),id=clean(cedula);
  if(!servicio||!id)return Promise.resolve(null);
  return servicio.leerDocumento(cols().titulos,id).then(function(resp){
    if(resp.existe)return{id:resp.id,data:resp.data};
    return servicio.consultarPorCampo(cols().titulos,"cedula","==",id,1).then(function(q){
      return q.datos&&q.datos.length?{id:q.datos[0]._docId,data:q.datos[0]}:null;
    });
  }).catch(function(){return null;});
}

function respaldarDevolucion(cedula,motivo){
  var servicio=fs();
  if(!servicio)return Promise.resolve({ok:false,motivo:"Firebase no disponible."});
  return buscarTituloRespaldo(cedula).then(function(encontrado){
    if(!encontrado)return{ok:false,motivo:"No existe copia para actualizar."};
    var hid=clean(cedula)+"__DEVOLUCION__"+new Date().toISOString().replace(/[^0-9A-Za-z]/g,"");
    var copia=Object.assign({},encontrado.data||{}, {
      _idOriginal:encontrado.id,
      accionHistorial:"DEVOLUCION_TITULO",
      motivoArchivo:motivo,
      archivadoEn:servicio.fechaCliente(),
      archivadoPor:cfg().administrador||"administrador",
      cedula:clean(cedula)
    });
    return servicio.guardarDocumento(cols().historial,hid,copia,{merge:false})
      .then(function(){
        return servicio.guardarDocumento(cols().titulos,encontrado.id,{
          estado:"DEVUELTO",
          estadoFinal:"DEVUELTO",
          permitirReenvio:true,
          motivoDevolucion:motivo,
          comentarioCoordinador:motivo,
          coordinadorNombre:"Administrador",
          actualizadoEn:servicio.fechaCliente()
        },{merge:true});
      })
      .then(function(){return{ok:true,historialId:hid,originalId:encontrado.id};})
      .catch(function(error){return{ok:false,motivo:error.message||String(error)};});
  });
}

function devolverTitulo(cedulaValor,motivoValor){
  var cedula=clean(cedulaValor);
  var motivo=txt(motivoValor)||"Reinicio de intento desde administración";
  if(!cedula)return Promise.reject(new Error("Ingresa la cédula."));

  return asegurarSheets()
    .then(function(sheets){
      return sheets.enviarPost("ADMIN_DEVOLVER_TITULOS",{
        cedula:cedula,
        numeroIdentificacion:cedula,
        motivo:motivo,
        observacion:motivo,
        administrador:cfg().administrador||"administrador",
        origen:"administrador"
      });
    })
    .then(function(principal){
      return respaldarDevolucion(cedula,motivo).then(function(respaldo){
        return{ok:true,cedula:cedula,principal:principal,respaldo:respaldo};
      });
    });
}

function ejecutar(ev){
  detener(ev);
  setText("ad-resultado-devolver","Procesando devolución...");
  return devolverTitulo(val("ad-devolver-cedula"),val("ad-devolver-motivo"))
    .then(function(r){
      setText("ad-resultado-devolver","Título devuelto correctamente.\nCédula: "+r.cedula);
      setText("ad-panel-diagnostico","Devolución completada. El estudiante puede realizar un nuevo envío.");
    })
    .catch(function(error){
      setText("ad-resultado-devolver","Error al devolver título:\n"+(error.message||String(error)));
      setText("ad-panel-diagnostico","No se modificó el respaldo porque falló la operación principal.");
    });
}

function conectar(){var b=el("ad-btn-devolver-titulo");if(b)b.addEventListener("click",ejecutar,true);}
function cargarComplementos(){
  cargarScript("ad-ia-proxy-override-script","./ad-js/ad-ia.proxy.override.js?v=1.7.2").catch(function(){});
  cargarScript("ad-coordinadores-eliminar-script","./ad-js/ad-coordinadores.eliminar.patch.js?v=1.2.0").catch(function(){});
  cargarScript("ad-fuente-principal-script","./ad-js/ad-fuente-principal.patch.js?v=1.0.0").catch(function(error){console.error(error);});
}
document.addEventListener("DOMContentLoaded",conectar);
cargarComplementos();
window.ADDevolverApp={devolverTitulo:devolverTitulo,ejecutar:ejecutar};
})(window,document);
