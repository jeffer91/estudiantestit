/* Arquitectura v2: Firebase solo para identidad; Sheets para el proceso. */
(function(window,document){
  'use strict';
  function instalarBloqueoTitulosFirebase(){
    var core=window.EstudianteMVPFirebaseCore;
    if(core&&typeof core.consultarPorCampo==='function'&&!core.__soloIdentidad){
      var original=core.consultarPorCampo.bind(core);
      window.EstudianteMVPFirebaseCore=Object.freeze(Object.assign({},core,{
        consultarPorCampo:function(coleccion,campo,operador,valor,limite){
          if(String(coleccion||'').toLowerCase()==='titulos')return Promise.resolve([]);
          return original(coleccion,campo,operador,valor,limite);
        },
        __soloIdentidad:true
      }));
    }
    var envios=window.EstudianteMVPFirebaseEnvios;
    if(envios&&!envios.__soloSheets){
      window.EstudianteMVPFirebaseEnvios=Object.freeze(Object.assign({},envios,{
        consultarUltimoEnvio:function(){return Promise.resolve({ok:true,encontrado:false,envio:null,mensaje:'El proceso se consulta en Google Sheets.'});},
        consultarEnvioPorCedula:function(){return Promise.resolve({ok:true,encontrado:false,envio:null,mensaje:'El proceso se consulta en Google Sheets.'});},
        guardarEnvio:function(){return Promise.reject(new Error('Los envíos se guardan únicamente en Google Sheets.'));},
        guardarPendienteSync:function(){return Promise.reject(new Error('Los pendientes se registran únicamente en Google Sheets.'));},
        __soloSheets:true
      }));
    }
  }
  function mensajeError(error,fallback){return error&&error.message?error.message:fallback;}
  function manejarEnvio(evento){var form=evento.target;if(!form||form.id!=='formEnvio')return;evento.preventDefault();evento.stopImmediatePropagation();var state=window.EstudianteMVPState;var ui=window.EstudianteMVPUI;var sheets=window.EstudianteMVPSheets;var memoria=window.EstudianteMVPMemoria;var acepto=document.getElementById('confirmacionEnvio');if(!state||!ui||!sheets)return;var vp=state.validarPropuestas();var vf=state.validarFavorito();if(!vp.ok){ui.mostrarEstado('#estadoEnvioFinal',vp.mensaje,'error');ui.mostrarPaso('propuestas');return;}if(!vf.ok){ui.mostrarEstado('#estadoEnvioFinal',vf.mensaje,'error');ui.mostrarPaso('resumen');return;}if(!acepto||!acepto.checked){ui.mostrarEstado('#estadoEnvioFinal','Confirma que deseas enviar tus propuestas.','error');return;}var payload=state.construirPayloadEnvio();ui.setCargando(true,'Enviando registro...');ui.mostrarEstado('#estadoEnvioFinal','Enviando registro...','info');sheets.enviarEnvio(payload).then(function(resultado){var final={ok:true,estado:'PENDIENTE_REVISION',sheets:resultado,mensaje:'Tu registro fue enviado correctamente.'};state.marcarEnviado(final);if(memoria&&memoria.borrar)memoria.borrar();ui.pintarResultadoEnvio(final);ui.mostrarPaso('enviar');}).catch(function(error){ui.mostrarEstado('#estadoEnvioFinal',mensajeError(error,'No se pudo completar el envío. Revisa tu conexión e intenta nuevamente.'),'error');}).then(function(){ui.setCargando(false);});}
  function limpiarTextos(){var p=document.querySelector('[data-step-panel="consulta"] .section-heading p:last-child');if(p)p.textContent='Ingresa solo tu número de cédula para consultar tus datos académicos.';}
  instalarBloqueoTitulosFirebase();
  document.addEventListener('submit',manejarEnvio,true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){instalarBloqueoTitulosFirebase();limpiarTextos();});else limpiarTextos();
  window.EstudianteMVPArquitecturaV2=Object.freeze({version:'2.1.0',fuenteProceso:'google-sheets',fuenteIdentidad:'firebase'});
})(window,document);
