/* Configuración Estudiantes: Requisitos consulta, Títulos operación y Claves configuración. */
(function(window,document){
'use strict';
var CONFIG=Object.freeze({
  app:Object.freeze({nombre:'Estudiantes MVP',version:'2.1.0',entorno:'produccion',origenCaptura:'estudiantes-mvp',modoDiagnostico:true}),
  fuentes:Object.freeze({requisitos:'REQUISITOS_BDLOCAL_SYNC',titulos:'RESPALDO TITULOS APP',claves:'Claves'}),
  collections:Object.freeze({estudiantes:'REQUISITOS',ia:'CLAVES_IA',titulos:'TITULOS',titulosLogs:'TITULOS_LOGS',appConfig:'CLAVES'}),
  documentos:Object.freeze({sheetsConfig:'TITULOS',iaConfig:'IA',appMvpConfig:'ESTUDIANTES_MVP'}),
  proceso:Object.freeze({periodoIdFallback:'2026-02__2026-08',periodoLabelFallback:'Febrero 2026 a Agosto 2026',maxIntentos:1,propuestasObligatorias:3,titulosPorPropuesta:3}),
  ia:Object.freeze({proveedoresOrden:Object.freeze(['gemini','groq','openrouter','cloudflare']),proveedorPrincipal:'gemini',timeoutMs:45000,temperatura:0.4,maxTokens:900}),
  sheets:Object.freeze({accionEnvio:'ENVIO_ESTUDIANTE',accionPing:'PING',timeoutMs:45000}),
  ui:Object.freeze({pasos:Object.freeze(['consulta','datos','telegram','propuestas','resumen','enviar']),pasoInicial:'consulta'}),
  textos:Object.freeze({tituloApp:'Registro de Títulos Académicos',subtituloApp:'Consulta tus datos y registra tus propuestas de titulación.',mensajeConsulta:'Ingresa tu número de cédula para consultar tus datos académicos.',mensajeNoEncontrado:'No encontramos un estudiante con esa cédula. Revisa el número e intenta nuevamente.',mensajeRequisitosListo:'REQUISITOS_BDLOCAL_SYNC conectado correctamente.',mensajeRequisitosError:'No se pudo consultar REQUISITOS_BDLOCAL_SYNC.',mensajeCargando:'Cargando información, espera un momento...',mensajeTelegram:'Ingresa tu usuario de Telegram para continuar.',mensajeEnvioOk:'Tu registro fue enviado correctamente.',mensajeEnvioPendiente:'No se pudo conectar con RESPALDO TITULOS APP. El avance permanece guardado en este navegador.'})
});
function obtener(ruta,fallback){if(!ruta)return CONFIG;var partes=String(ruta).split('.'),actual=CONFIG;for(var i=0;i<partes.length;i++){if(actual&&Object.prototype.hasOwnProperty.call(actual,partes[i]))actual=actual[partes[i]];else return fallback;}return actual;}
function cargarScript(src,alFinalizar){
  var existente=document.querySelector('script[data-estudiante-extra="'+src+'"]');
  var script;
  if(existente){if(typeof alFinalizar==='function')alFinalizar();return;}
  script=document.createElement('script');
  script.src=src;
  script.async=false;
  script.setAttribute('data-estudiante-extra',src);
  script.onload=function(){if(typeof alFinalizar==='function')alFinalizar();};
  script.onerror=function(){console.error('[Estudiantes MVP] No se pudo cargar:',src);};
  document.head.appendChild(script);
}
window.EstudianteMVPConfig=Object.freeze({data:CONFIG,obtener:obtener,obtenerColeccion:function(n){return obtener('collections.'+n,'');},obtenerDocumento:function(n){return obtener('documentos.'+n,'');},obtenerPeriodoFallback:function(){return{periodoId:CONFIG.proceso.periodoIdFallback,periodoLabel:CONFIG.proceso.periodoLabelFallback};}});
cargarScript('js/estudiante.consulta.progreso.modal.js?v=2.1.0',function(){
  cargarScript('js/estudiante.consulta.progreso.bridge.js?v=2.1.0');
});
})(window,document);
