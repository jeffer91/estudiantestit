/* Proveedores IA administrados mediante Firebase Functions y Secret Manager. */
(function(window){
  'use strict';
  var CATALOGO=[
    {id:'groq',nombre:'Groq',tipo:'openai-compatible',prioridad:1,endpoint:'https://api.groq.com/openai/v1/chat/completions',modelo:'openai/gpt-oss-20b'},
    {id:'gemini',nombre:'Gemini',tipo:'gemini',prioridad:2,endpoint:'',modelo:'gemini-3.5-flash'},
    {id:'openrouter',nombre:'OpenRouter Free',tipo:'openai-compatible',prioridad:3,endpoint:'https://openrouter.ai/api/v1/chat/completions',modelo:'openrouter/free'},
    {id:'mistral',nombre:'Mistral AI',tipo:'openai-compatible',prioridad:4,endpoint:'https://api.mistral.ai/v1/chat/completions',modelo:'mistral-small-latest'},
    {id:'cohere',nombre:'Cohere',tipo:'cohere',prioridad:5,endpoint:'https://api.cohere.com/v2/chat',modelo:'command-a-03-2025'}
  ];
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function numero(v,f){var n=Number(v);return Number.isFinite(n)?n:Number(f||0);}
  function base(){var f=texto(window.TITULOS_API_BASE||'');if(f)return f.replace(/\/$/,'');var h=texto(window.location&&window.location.hostname).toLowerCase();return ['localhost','127.0.0.1'].indexOf(h)>=0?'http://127.0.0.1:5001/titulos-ec2fa/us-central1':'https://us-central1-titulos-ec2fa.cloudfunctions.net';}
  function solicitar(action,payload){return fetch(base()+'/api/ia',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify(Object.assign({action:action},payload||{}))}).then(function(resp){return resp.text().then(function(body){var data={};try{data=body?JSON.parse(body):{};}catch(e){throw new Error('El servicio IA respondió en un formato no válido.');}if(!resp.ok||data.ok===false)throw new Error(data.error||data.mensaje||('Error HTTP '+resp.status));return data;});});}
  function normalizar(p){p=p||{};var id=texto(p.id||p.proveedor||p.nombre).toLowerCase().replace(/[^a-z0-9_-]/g,'');return{id:id,proveedor:id,nombre:texto(p.nombre||p.name||id),tipo:texto(p.tipo||'openai-compatible'),activo:p.activo===true,prioridad:numero(p.prioridad,999),endpoint:texto(p.endpoint),modelo:texto(p.modelo||p.model),model:texto(p.model||p.modelo),timeoutMs:Math.max(5000,numero(p.timeoutMs,45000)),maxTokens:Math.max(100,numero(p.maxTokens,3000)),temperatura:numero(p.temperatura,0.3),descripcion:texto(p.descripcion),apiKeyConfigurada:p.apiKeyConfigurada===true,ultimaPruebaOk:p.ultimaPruebaOk===true,ultimaPruebaEn:texto(p.ultimaPruebaEn),ultimaLatenciaMs:numero(p.ultimaLatenciaMs,0),ultimoError:texto(p.ultimoError)};}
  function listar(){return solicitar('admin-list',{}).then(function(r){return(r.proveedores||[]).map(normalizar).sort(function(a,b){return a.prioridad-b.prioridad;});});}
  function leer(id){return solicitar('admin-read',{providerId:id}).then(function(r){return r.proveedor?normalizar(r.proveedor):null;});}
  function guardar(datos){return solicitar('admin-save',{provider:datos||{}}).then(function(r){return{ok:true,proveedor:normalizar(r.proveedor)};});}
  function cambiarEstado(id,activo){return solicitar('admin-toggle',{providerId:id,activo:activo===true});}
  function sembrarCatalogo(){return solicitar('admin-list',{}).then(function(r){var info=r.catalogo||{};return{ok:true,totalCreados:Number(info.creados||0),totalActualizados:Number(info.actualizados||0),totalCatalogo:Number(info.total||CATALOGO.length)};});}
  function probar(id){return solicitar('admin-test',{providerId:id,prompt:'Responde únicamente JSON válido. Genera exactamente tres títulos académicos de 15 a 25 palabras sobre mejora del aprendizaje mediante tecnología.'}).then(function(r){return{ok:true,proveedor:id,nombre:id,latenciaMs:Number(r.latencyMs||0),texto:r.text};});}
  window.ADIAService={catalogo:function(){return CATALOGO.slice();},listar:listar,leer:leer,guardar:guardar,cambiarEstado:cambiarEstado,sembrarCatalogo:sembrarCatalogo,probar:probar,limpiarProveedor:normalizar,proxyUrl:function(){return base()+'/api/ia';}};
})(window);
