/* Proveedores IA administrados mediante la función segura de Cloudflare. */
(function(window){
  'use strict';
  var CATALOGO=[
    {id:'cerebras',nombre:'Cerebras',tipo:'openai-compatible',prioridad:1,endpoint:'https://api.cerebras.ai/v1/chat/completions',modelo:'gpt-oss-120b'},
    {id:'groq',nombre:'Groq',tipo:'openai-compatible',prioridad:2,endpoint:'https://api.groq.com/openai/v1/chat/completions',modelo:'openai/gpt-oss-20b'},
    {id:'mistral',nombre:'Mistral AI',tipo:'openai-compatible',prioridad:3,endpoint:'https://api.mistral.ai/v1/chat/completions',modelo:'mistral-small-latest'},
    {id:'gemini',nombre:'Gemini',tipo:'gemini',prioridad:4,modelo:'gemini-3.5-flash'},
    {id:'cohere',nombre:'Cohere',tipo:'openai-compatible',prioridad:5,endpoint:'https://api.cohere.ai/compatibility/v1/chat/completions',modelo:'command-a-plus-05-2026'},
    {id:'cloudflare',nombre:'Cloudflare Workers AI',tipo:'openai-compatible',prioridad:6,modelo:'@cf/meta/llama-3.2-3b-instruct'},
    {id:'scaleway',nombre:'Scaleway Generative APIs',tipo:'openai-compatible',prioridad:7,endpoint:'https://api.scaleway.ai/v1/chat/completions',modelo:'gpt-oss-120b'},
    {id:'openrouter',nombre:'OpenRouter',tipo:'openai-compatible',prioridad:8,endpoint:'https://openrouter.ai/api/v1/chat/completions',modelo:'openrouter/free'},
    {id:'nvidia',nombre:'NVIDIA NIM',tipo:'openai-compatible',prioridad:9,endpoint:'https://integrate.api.nvidia.com/v1/chat/completions',modelo:'meta/llama-3.3-70b-instruct'},
    {id:'sambanova',nombre:'SambaNova Cloud',tipo:'openai-compatible',prioridad:10,endpoint:'https://api.sambanova.ai/v1/chat/completions',modelo:'Meta-Llama-3.3-70B-Instruct'},
    {id:'ovhcloud',nombre:'OVHcloud AI Endpoints',tipo:'openai-compatible',prioridad:11,endpoint:'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions',modelo:'gpt-oss-20b'},
    {id:'fireworks',nombre:'Fireworks AI',tipo:'openai-compatible',prioridad:12,endpoint:'https://api.fireworks.ai/inference/v1/chat/completions',modelo:'accounts/fireworks/models/gpt-oss-120b'},
    {id:'hyperbolic',nombre:'Hyperbolic',tipo:'openai-compatible',prioridad:13,endpoint:'https://api.hyperbolic.xyz/v1/chat/completions',modelo:'meta-llama/Meta-Llama-3.1-70B-Instruct'},
    {id:'baseten',nombre:'Baseten',tipo:'openai-compatible',prioridad:14,endpoint:'https://inference.baseten.co/v1/chat/completions',modelo:'zai-org/GLM-5'},
    {id:'huggingface',nombre:'Hugging Face',tipo:'openai-compatible',prioridad:15,endpoint:'https://router.huggingface.co/v1/chat/completions',modelo:'openai/gpt-oss-120b:cheapest'}
  ];
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function numero(v,f){var n=Number(v);return Number.isFinite(n)?n:Number(f||0);}
  function base(){var f=texto(window.TITULOS_API_BASE||'');if(f)return f.replace(/\/$/,'');var h=texto(window.location&&window.location.hostname).toLowerCase();return ['localhost','127.0.0.1'].indexOf(h)>=0?'http://127.0.0.1:8787':'https://titulos.pages.dev';}
  function solicitar(action,payload){return fetch(base()+'/api/ia',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},body:JSON.stringify(Object.assign({action:action},payload||{}))}).then(function(resp){return resp.text().then(function(body){var data={};try{data=body?JSON.parse(body):{};}catch(e){throw new Error('El servicio IA respondió en un formato no válido.');}if(!resp.ok||data.ok===false)throw new Error(data.error||data.mensaje||('Error HTTP '+resp.status));return data;});});}
  function normalizar(p){p=p||{};var id=texto(p.id||p.proveedor||p.nombre).toLowerCase().replace(/[^a-z0-9_-]/g,'');return{id:id,proveedor:id,nombre:texto(p.nombre||p.name||id),tipo:texto(p.tipo||'openai-compatible'),activo:p.activo===true,prioridad:numero(p.prioridad,999),endpoint:texto(p.endpoint),modelo:texto(p.modelo||p.model),model:texto(p.model||p.modelo),timeoutMs:Math.max(5000,numero(p.timeoutMs,45000)),maxTokens:Math.max(100,numero(p.maxTokens,3000)),temperatura:numero(p.temperatura,0.3),descripcion:texto(p.descripcion),apiKeyConfigurada:p.apiKeyConfigurada===true,ultimaPruebaOk:p.ultimaPruebaOk===true,ultimaPruebaEn:texto(p.ultimaPruebaEn),ultimaLatenciaMs:numero(p.ultimaLatenciaMs,0),ultimoError:texto(p.ultimoError)};}
  function listar(){return solicitar('admin-list',{}).then(function(r){return(r.proveedores||[]).map(normalizar).sort(function(a,b){return a.prioridad-b.prioridad;});});}
  function leer(id){return solicitar('admin-read',{providerId:id}).then(function(r){return r.proveedor?normalizar(r.proveedor):null;});}
  function guardar(datos){return solicitar('admin-save',{provider:datos||{}}).then(function(r){return{ok:true,proveedor:normalizar(r.proveedor)};});}
  function cambiarEstado(id,activo){return solicitar('admin-toggle',{providerId:id,activo:activo===true});}
  function sembrarCatalogo(){return listar().then(function(actuales){var mapa={};(actuales||[]).forEach(function(p){mapa[p.id]=p;});var creados=0;var actualizados=0;var cadena=Promise.resolve();CATALOGO.forEach(function(item){cadena=cadena.then(function(){var actual=mapa[item.id]||null;var payload=Object.assign({},item,{activo:actual?actual.activo:false,timeoutMs:actual?actual.timeoutMs:45000,maxTokens:actual?actual.maxTokens:3000,temperatura:actual?actual.temperatura:0.3});return guardar(payload).then(function(){if(actual)actualizados+=1;else creados+=1;}).catch(function(){return null;});});});return cadena.then(function(){return{ok:true,totalCreados:creados,totalActualizados:actualizados,totalCatalogo:CATALOGO.length};});});}
  function probar(id){return solicitar('admin-test',{providerId:id,prompt:'Responde únicamente JSON válido. Genera exactamente tres títulos académicos de 15 a 25 palabras sobre mejora del aprendizaje mediante tecnología.'}).then(function(r){return{ok:true,proveedor:id,nombre:id,latenciaMs:Number(r.latencyMs||0),texto:r.text};});}
  window.ADIAService={catalogo:function(){return CATALOGO.slice();},listar:listar,leer:leer,guardar:guardar,cambiarEstado:cambiarEstado,sembrarCatalogo:sembrarCatalogo,probar:probar,limpiarProveedor:normalizar,proxyUrl:function(){return base()+'/api/ia';}};
})(window);
