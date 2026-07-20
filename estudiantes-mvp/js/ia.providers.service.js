/* Cliente IA seguro: envía solo providerId, prompt y opciones. */
(function(window,document){
  'use strict';
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function numero(v,f){var n=Number(typeof v==='string'?v.replace(',','.'):v);return Number.isFinite(n)?n:Number(f||0);}
  function esLocal(){var h=texto(window.location&&window.location.hostname).toLowerCase();return ['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(h)>=0;}
  function esArchivo(){return texto(window.location&&window.location.protocol).toLowerCase()==='file:';}
  function proxyUrl(){
    var f=texto(window.ESTUDIANTE_IA_PROXY_URL||'');
    var origen;
    if(f)return f;
    if(esLocal())return 'http://127.0.0.1:8787/api/ia';
    if(esArchivo())return 'https://titulos.pages.dev/api/ia';
    origen=texto(window.location&&window.location.origin);
    return (origen&&origen!=='null'?origen.replace(/\/$/,''):'https://titulos.pages.dev')+'/api/ia';
  }
  function normalizarProveedorRuntime(p){p=p||{};var u=window.EstudianteMVPUtils||null;var normalizar=u&&typeof u.normalizarClave==='function'?u.normalizarClave:function(v){return texto(v).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');};var id=normalizar(p.id||p.proveedor||p.provider||'');return{id:id,proveedor:id,nombre:texto(p.nombre||p.name||id),tipo:texto(p.tipo||''),activo:p.activo===true,prioridad:numero(p.prioridad,999),modelo:texto(p.modelo||p.model||''),model:texto(p.model||p.modelo||''),timeoutMs:Math.max(5000,numero(p.timeoutMs,45000)),maxTokens:Math.max(100,numero(p.maxTokens,3000)),temperatura:numero(p.temperatura,0.3)};}
  function generarTexto(proveedor,prompt,opciones){var p=normalizarProveedorRuntime(proveedor);opciones=opciones||{};if(!p.id)return Promise.reject(new Error('Proveedor IA sin identificador.'));if(!texto(prompt))return Promise.reject(new Error('No se recibió prompt para generar con IA.'));return fetch(proxyUrl(),{method:'POST',headers:{'Content-Type':'application/json','X-Titulos-App':'estudiantes'},body:JSON.stringify({providerId:p.id,prompt:prompt,options:{timeoutMs:numero(opciones.timeoutMs||p.timeoutMs,45000),temperatura:opciones.temperatura!==undefined?numero(opciones.temperatura,p.temperatura):p.temperatura,maxTokens:numero(opciones.maxTokens||p.maxTokens,3000)}})}).then(function(resp){return resp.text().then(function(body){var json={};try{json=body?JSON.parse(body):{};}catch(e){throw new Error('El servicio IA respondió en un formato no válido.');}if(!resp.ok||json.ok===false)throw new Error(json.error||json.message||('El servicio IA respondió HTTP '+resp.status));if(!texto(json.text))throw new Error('El proveedor IA respondió sin texto utilizable.');return json.text;});});}
  function cargar(src){if(document.readyState==='loading'){document.write('<script src="'+src+'"><\/script>');return;}var s=document.createElement('script');s.src=src;s.async=false;document.head.appendChild(s);}
  function asegurarBase(){if(window.EstudianteMVPIATitulacion)return;function desactivado(){return Promise.reject(new Error('Utiliza la generación IA por propuesta.'));}window.EstudianteMVPIATitulacion=Object.freeze({generarTitulosPorPropuesta:desactivado,generarTresTitulos:desactivado,modo:'esperando_motor_por_propuesta',version:'5.0.0'});}
  asegurarBase();
  cargar('js/ia.diagnostico.service.js?v=3.0.0');
  cargar('js/ia.nueve.core.js?v=1.1.0');
  cargar('js/ia.nueve.ajustes.js?v=1.1.0');
  cargar('js/ia.titulacion.robusto.service.js?v=4.0.0');
  cargar('js/ia.recomendacion.ui.js?v=3.0.0');
  cargar('js/ia.nueve.integracion.js?v=2.0.0');
  cargar('js/estudiante.arquitectura.v2.js?v=2.1.0');
  cargar('js/estudiante.envio.modal.js?v=1.0.1');
  window.EstudianteMVPIAProviders=Object.freeze({generarTexto:generarTexto,normalizarProveedorRuntime:normalizarProveedorRuntime,proxyUrl:proxyUrl});
})(window,document);
