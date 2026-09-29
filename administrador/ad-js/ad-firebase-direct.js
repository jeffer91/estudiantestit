(function(window){
'use strict';

var P={
  TITULOS:{id:'titulos-ec2fa',key:'AIzaSyDkSOhJ552LwxQtt8GhP5iDJk49y0t4mOg'},
  UTET:{id:'utet-4387a',key:'AIzaSyCaHf1C0BB0X_H3BDZ1o-UDAsPmLTjsZLA'}
};
var IA_OK={groq:true,gemini:true,openrouter:true,mistral:true,cohere:true};
var IA_CATALOGO={
  groq:{id:'groq',nombre:'Groq',tipo:'openai-compatible',prioridad:1,endpoint:'https://api.groq.com/openai/v1/chat/completions',modelo:'openai/gpt-oss-20b'},
  gemini:{id:'gemini',nombre:'Gemini',tipo:'gemini',prioridad:2,endpoint:'',modelo:'gemini-2.5-flash-lite'},
  openrouter:{id:'openrouter',nombre:'OpenRouter Free',tipo:'openai-compatible',prioridad:3,endpoint:'https://openrouter.ai/api/v1/chat/completions',modelo:'openrouter/free'},
  mistral:{id:'mistral',nombre:'Mistral AI',tipo:'openai-compatible',prioridad:4,endpoint:'https://api.mistral.ai/v1/chat/completions',modelo:'mistral-small-latest'},
  cohere:{id:'cohere',nombre:'Cohere',tipo:'cohere',prioridad:5,endpoint:'https://api.cohere.com/v2/chat',modelo:'command-a-03-2025'}
};

function t(v){return String(v===null||v===undefined?'':v).trim();}
function n(v){return t(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
function cfg(project){var c=P[String(project||'').toUpperCase()];if(!c)throw new Error('Firebase no configurado: '+project);return c;}
function dv(v){
  if(!v||typeof v!=='object')return null;
  if('nullValue' in v)return null;
  if('stringValue' in v)return v.stringValue;
  if('booleanValue' in v)return v.booleanValue;
  if('integerValue' in v)return Number(v.integerValue);
  if('doubleValue' in v)return Number(v.doubleValue);
  if('timestampValue' in v)return v.timestampValue;
  if(v.arrayValue)return (v.arrayValue.values||[]).map(dv);
  if(v.mapValue)return df(v.mapValue.fields||{});
  return null;
}
function df(fields){var out={};Object.keys(fields||{}).forEach(function(k){out[k]=dv(fields[k]);});return out;}
function dd(doc){
  if(!doc||!doc.name)return null;
  var id=doc.name.split('/').pop();
  return Object.assign({id:id,_id:id,_docId:id},df(doc.fields||{}));
}
function mask(fields){return (fields||[]).map(function(f){return 'mask.fieldPaths='+encodeURIComponent(f);}).join('&');}
function parse(resp){
  return resp.text().then(function(raw){
    var data={};
    try{data=raw?JSON.parse(raw):{};}catch(_e){throw new Error('Firebase respondió en un formato no válido.');}
    if(!resp.ok){
      var m=data&&data.error&&(data.error.message||data.error.status)||data&&data.message||('HTTP '+resp.status);
      throw new Error('Firebase: '+m);
    }
    return data;
  });
}
function list(project,collection,fields,max){
  var c=cfg(project),rows=[],token='',limit=Math.max(1,Number(max||5000));
  function page(){
    var q=['key='+encodeURIComponent(c.key),'pageSize=1000'];
    if(token)q.push('pageToken='+encodeURIComponent(token));
    var m=mask(fields);if(m)q.push(m);
    var url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(c.id)+'/databases/(default)/documents/'+encodeURIComponent(collection)+'?'+q.join('&');
    return fetch(url,{cache:'no-store'}).then(parse).then(function(data){
      (data.documents||[]).forEach(function(doc){if(rows.length<limit){var r=dd(doc);if(r)rows.push(r);}});
      token=t(data.nextPageToken);
      return token&&rows.length<limit?page():rows;
    });
  }
  return page();
}
function get(project,collection,id,fields){
  var c=cfg(project),q=['key='+encodeURIComponent(c.key)],m=mask(fields);
  if(m)q.push(m);
  var url='https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(c.id)+'/databases/(default)/documents/'+encodeURIComponent(collection)+'/'+encodeURIComponent(id)+'?'+q.join('&');
  return fetch(url,{cache:'no-store'}).then(function(resp){
    if(resp.status===404)return null;
    return parse(resp).then(dd);
  });
}
function active(r){return r&&r.activo!==false&&t(r.estado||'ACTIVO').toUpperCase()!=='INACTIVO';}
function pid(r){return t(r&&(r.periodoId||r.periodId||r.periodoCanonicoId||r.periodo||r.periodoLabel||r.periodoNombre));}
function plabel(r){return t(r&&(r.periodoLabel||r.periodoNombre||r.periodo||r.label||r.nombre||pid(r)));}
function samePeriod(a,b){a=n(a);b=n(b);return Boolean(a&&b&&(a===b||a.indexOf(b)>=0||b.indexOf(a)>=0));}

function configTitulos(){
  return Promise.all([
    get('TITULOS','titulos_config','app',['periodoPrincipalId','periodoPrincipalLabel','periodoId','periodoLabel']).catch(function(){return null;}),
    list('TITULOS','envios',['cedula'],1)
  ]).then(function(x){return{ok:true,configuracion:x[0]||{},fuente:'FIREBASE_DIRECTO'};});
}
function configRequisitos(){return list('UTET','Estudiante',['cedula'],1).then(function(){return{ok:true,fuente:'FIREBASE_UTET_DIRECTO'};});}
function pingTitulos(){return list('TITULOS','envios',['cedula'],1).then(function(){return{ok:true};});}
function pingRequisitos(){return list('UTET','Estudiante',['cedula'],1).then(function(){return{ok:true};});}

function listarPeriodos(){
  return Promise.all([
    list('TITULOS','periodos',['nombre','label','periodoId','periodoLabel','activo','estado','principal'],1000).catch(function(){return[];}),
    list('TITULOS','envios',['periodoId','periodId','periodo','periodoLabel','periodoNombre'],10000).catch(function(){return[];})
  ]).then(function(parts){
    var map={};
    function ensure(id,label){
      id=t(id);label=t(label)||id;if(!id)return null;
      if(!map[id])map[id]={id:id,periodoId:id,label:label,periodoLabel:label,activo:true,principal:false};
      return map[id];
    }
    parts[0].forEach(function(r){var id=t(r.periodoId||r.id),x=ensure(id,r.periodoLabel||r.label||r.nombre||id);if(x){x.activo=active(r);x.principal=r.principal===true;}});
    parts[1].forEach(function(r){ensure(pid(r),plabel(r));});
    var rows=Object.keys(map).map(function(k){return map[k];});
    rows.sort(function(a,b){return t(b.id).localeCompare(t(a.id));});
    var principal=rows.find(function(r){return r.principal;})||rows[0]||null;
    if(principal)principal.principal=true;
    return{ok:true,periodos:rows,registros:rows,principal:principal};
  });
}
function listarCarreras(){
  var fields=['codigo','codigoCarrera','CodigoCarrera','nombre','nombreCarrera','NombreCarrera','carrera','activo','estado'];
  return list('TITULOS','carreras',fields,3000).then(function(rows){
    if(rows.length)return rows;
    return list('UTET','carreras',fields,3000).catch(function(){return[];});
  }).then(function(rows){
    var carreras=rows.map(function(r){return Object.assign({},r,{
      codigo:t(r.codigo||r.codigoCarrera||r.CodigoCarrera||r.id),
      nombre:t(r.nombre||r.nombreCarrera||r.NombreCarrera||r.carrera||r.id)
    });}).filter(function(r){return r.nombre;});
    return{ok:true,carreras:carreras,registros:carreras};
  });
}
function listarCoordinadores(){
  return list('TITULOS','coordinadores',['nombre','Nombre','coordinador','telegram','Telegram','activo','estado','carreras','carrerasAsignadas','carrerasNombres'],2000)
    .then(function(rows){return{ok:true,coordinadores:rows,registros:rows};});
}
function listarInvestigadores(){
  return list('TITULOS','investigadores',['cedula','nombre','activo','estado'],1000).then(function(rows){
    return{ok:true,investigadores:rows.map(function(r){return{cedula:t(r.cedula||r.id),nombre:t(r.nombre||r.id),activo:active(r),tienePin:false};})};
  });
}
function resumenInvestigacion(){return Promise.resolve({ok:true,ultimoPorEnvio:{},bloqueos:[],revisiones:[]});}
function listarTitulos(f){
  f=f||{};
  return list('TITULOS','envios',[
    'cedula','numeroIdentificacion','estudiante','nombres','Nombres','carrera','carreraNombre','NombreCarrera','nombreCarrera',
    'periodoId','periodId','periodo','periodoLabel','periodoNombre','estadoProceso','estado','estadoFinal','fechaEnvio','fechaServidor',
    'titulo1','titulo2','titulo3','tituloPreferidoNumero','preferido','tituloPreferidoTexto','tituloCoordinador','tituloValidadoCoordinador',
    'tituloFinalInvestigacion','tituloFinal','tituloAprobado','tituloCorregido','coordinador','nombreCoordinador','ultimoCoordinador',
    'comentarioCoordinador','observacion','comentario','fechaValidacionCoordinador','fechaResolucion','fechaRevision'
  ],10000).then(function(rows){
    var wanted=t(f.periodoId||f.periodo);
    if(wanted)rows=rows.filter(function(r){return samePeriod(pid(r)||plabel(r),wanted);});
    return{ok:true,envios:rows,estudiantes:rows,registros:rows};
  });
}
function listarIA(){
  return list('TITULOS','ia',['nombre','tipo','activo','estado','prioridad','modelo','model','endpoint','timeoutMs','maxTokens','temperatura','descripcion','ultimaPruebaOk','ultimaPruebaEn','ultimaLatenciaMs','ultimoError'],100)
    .catch(function(){return[];})
    .then(function(rows){
      var byId={};
      rows.forEach(function(r){
        var id=t(r.id).toLowerCase();
        if(IA_OK[id])byId[id]=r;
      });
      var proveedores=Object.keys(IA_CATALOGO).map(function(id){
        var base=IA_CATALOGO[id],r=byId[id]||{};
        return Object.assign({},base,r,{
          id:id,
          proveedor:id,
          nombre:t(r.nombre||base.nombre),
          tipo:t(r.tipo||base.tipo),
          endpoint:t(r.endpoint||base.endpoint),
          modelo:t(r.modelo||r.model||base.modelo),
          prioridad:Number(r.prioridad||base.prioridad),
          activo:byId[id]?active(r):false,
          apiKeyConfigurada:false,
          gratis:true
        });
      });
      return{ok:true,proveedores:proveedores};
    });
}

function leerRespuestaProveedor(resp,nombre){
  return resp.text().then(function(raw){
    var data={};
    try{data=raw?JSON.parse(raw):{};}catch(_e){throw new Error(nombre+' respondió en un formato no válido.');}
    if(!resp.ok){
      var msg=data&&data.error&&(data.error.message||data.error.status)||data&&data.message||('HTTP '+resp.status);
      throw new Error(nombre+': '+msg);
    }
    return data;
  });
}

function probarIA(providerId,prompt,credencial){
  var id=t(providerId).toLowerCase();
  var base=IA_CATALOGO[id];
  var key=t(credencial);
  var inicio=Date.now();
  if(!base||!IA_OK[id])return Promise.reject(new Error('Proveedor no permitido.'));
  if(!key)return Promise.reject(new Error('Para probar '+base.nombre+' en GitHub Pages, ingresa una API key temporal. La clave se enviará solo al proveedor y no se guardará.'));

  if(id==='gemini'){
    var model=encodeURIComponent(base.modelo);
    var url='https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent?key='+encodeURIComponent(key);
    return fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents:[{role:'user',parts:[{text:t(prompt)||'Responde únicamente: conexión correcta.'}]}],generationConfig:{maxOutputTokens:64,temperature:0}})
    }).then(function(resp){return leerRespuestaProveedor(resp,base.nombre);}).then(function(data){
      var salida=t(data&&data.candidates&&data.candidates[0]&&data.candidates[0].content&&data.candidates[0].content.parts&&data.candidates[0].content.parts.map(function(p){return p.text||'';}).join('\n'));
      if(!salida)throw new Error(base.nombre+' respondió sin texto.');
      return{ok:true,provider:id,text:salida,latencyMs:Date.now()-inicio};
    });
  }

  if(id==='cohere'){
    return fetch(base.endpoint,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:base.modelo,messages:[{role:'user',content:t(prompt)||'Responde únicamente: conexión correcta.'}],max_tokens:64,temperature:0})
    }).then(function(resp){return leerRespuestaProveedor(resp,base.nombre);}).then(function(data){
      var salida=t(data&&data.message&&data.message.content&&data.message.content.map(function(p){return p.text||'';}).join('\n'));
      if(!salida)throw new Error(base.nombre+' respondió sin texto.');
      return{ok:true,provider:id,text:salida,latencyMs:Date.now()-inicio};
    });
  }

  return fetch(base.endpoint,{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization':'Bearer '+key,
      ...(id==='openrouter'?{'HTTP-Referer':window.location.origin,'X-Title':'Administrador Titulación'}:{})
    },
    body:JSON.stringify({
      model:base.modelo,
      messages:[{role:'user',content:t(prompt)||'Responde únicamente: conexión correcta.'}],
      max_tokens:64,
      temperature:0
    })
  }).then(function(resp){return leerRespuestaProveedor(resp,base.nombre);}).then(function(data){
    var salida=t(data&&data.choices&&data.choices[0]&&data.choices[0].message&&data.choices[0].message.content);
    if(!salida)throw new Error(base.nombre+' respondió sin texto.');
    return{ok:true,provider:id,text:salida,latencyMs:Date.now()-inicio};
  });
}

function listarTitulosGlobal(f){
  return listarTitulos(f||{}).then(function(r){
    var registros=(r.envios||[]).map(function(x){
      return Object.assign({},x,{
        envioId:t(x.id||x._docId||x._id),
        cedula:t(x.cedula||x.numeroIdentificacion),
        nombres:t(x.estudiante||x.nombres||x.Nombres),
        carrera:t(x.carrera||x.carreraNombre||x.NombreCarrera||x.nombreCarrera),
        estado:t(x.estadoProceso||x.estado||x.estadoFinal||'PENDIENTE_REVISION').toUpperCase()
      });
    });
    return{ok:true,registros:registros,envios:registros,estudiantes:registros,total:registros.length,mensaje:'Lista cargada directamente desde Firebase Títulos.'};
  });
}
function obtenerEstadisticas(f){
  return listarTitulos(f).then(function(r){
    var rows=r.envios||[],counts={};
    rows.forEach(function(x){var s=t(x.estadoProceso||x.estado||x.estadoFinal||'PENDIENTE').toUpperCase();counts[s]=(counts[s]||0)+1;});
    return{ok:true,total:rows.length,totalEnvios:rows.length,porEstado:counts,registros:rows};
  });
}
function consultarEstudiante(cedula){
  return get('UTET','Estudiante',t(cedula),['cedula','nombres','nombreCarreraActual','codigoCarreraActual','sede','correoInstitucional','correoPersonal','celular'])
    .then(function(r){return r?{ok:true,encontrado:true,estudiante:r,registro:r}:{ok:true,encontrado:false};});
}

window.ADFirebaseDirect=Object.freeze({
  configTitulos:configTitulos,configRequisitos:configRequisitos,pingTitulos:pingTitulos,pingRequisitos:pingRequisitos,
  listarPeriodos:listarPeriodos,listarCarreras:listarCarreras,listarCoordinadores:listarCoordinadores,
  listarInvestigadores:listarInvestigadores,resumenInvestigacion:resumenInvestigacion,listarTitulos:listarTitulos,listarTitulosGlobal:listarTitulosGlobal,
  listarIA:listarIA,probarIA:probarIA,obtenerEstadisticas:obtenerEstadisticas,consultarEstudiante:consultarEstudiante
});
})(window);
