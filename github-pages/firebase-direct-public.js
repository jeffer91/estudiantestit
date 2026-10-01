(function(window){
  'use strict';
  if(window.TitulosFirebaseDirectPublic)return;

  var PROJECTS=Object.freeze({
    UTET:Object.freeze({projectId:'utet-4387a',apiKey:'AIzaSyCaHf1C0BB0X_H3BDZ1o-UDAsPmLTjsZLA'}),
    TITULOS:Object.freeze({projectId:'titulos-ec2fa',apiKey:'AIzaSyDkSOhJ552LwxQtt8GhP5iDJk49y0t4mOg'})
  });
  var FALLBACK_PERIOD={id:'2026-02__2026-08',label:'Febrero 2026 a Agosto 2026'};

  function text(value){return String(value===null||value===undefined?'':value).trim();}
  function cedula(value){var out=text(value).replace(/\D/g,'');if(out.length===9)out='0'+out;return out.length===10?out:'';}
  function config(project){var key=text(project).toUpperCase(),value=PROJECTS[key];if(!value)throw new Error('Proyecto Firebase no configurado: '+key);return value;}
  function base(project){var c=config(project);return'https://firestore.googleapis.com/v1/projects/'+encodeURIComponent(c.projectId)+'/databases/(default)/documents';}
  function url(project,collection,id){var c=config(project);return base(project)+'/'+encodeURIComponent(collection)+'/'+encodeURIComponent(id)+'?key='+encodeURIComponent(c.apiKey);}

  function decode(value){
    var fields,values;
    if(!value||typeof value!=='object')return null;
    if(Object.prototype.hasOwnProperty.call(value,'stringValue'))return value.stringValue;
    if(Object.prototype.hasOwnProperty.call(value,'booleanValue'))return value.booleanValue;
    if(Object.prototype.hasOwnProperty.call(value,'integerValue'))return Number(value.integerValue);
    if(Object.prototype.hasOwnProperty.call(value,'doubleValue'))return Number(value.doubleValue);
    if(Object.prototype.hasOwnProperty.call(value,'timestampValue'))return value.timestampValue;
    if(Object.prototype.hasOwnProperty.call(value,'nullValue'))return null;
    if(value.mapValue){fields=value.mapValue.fields||{};return decodeFields(fields);}
    if(value.arrayValue){values=value.arrayValue.values||[];return values.map(decode);}
    return null;
  }
  function decodeFields(fields){var out={};Object.keys(fields||{}).forEach(function(key){out[key]=decode(fields[key]);});return out;}
  function encode(value){
    var out;
    if(value===null||value===undefined)return{nullValue:'NULL_VALUE'};
    if(typeof value==='boolean')return{booleanValue:value};
    if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
    if(typeof value==='string')return{stringValue:value};
    if(Array.isArray(value))return{arrayValue:{values:value.map(encode)}};
    if(typeof value==='object'){
      out={};
      Object.keys(value).forEach(function(key){if(value[key]!==undefined)out[key]=encode(value[key]);});
      return{mapValue:{fields:out}};
    }
    return{stringValue:String(value)};
  }
  function encodeFields(data){var out={};Object.keys(data||{}).forEach(function(key){if(data[key]!==undefined)out[key]=encode(data[key]);});return out;}

  function readDocument(project,collection,id){
    return fetch(url(project,collection,id),{method:'GET',cache:'no-store'}).then(function(response){
      if(response.status===404)return null;
      return response.text().then(function(body){
        var json={};
        try{json=body?JSON.parse(body):{};}catch(_error){throw new Error('Firebase respondio en un formato no valido.');}
        if(!response.ok)throw new Error(json&&json.error&&json.error.message||('Firebase HTTP '+response.status));
        return Object.assign({_docId:id,_createTime:json.createTime||'',_updateTime:json.updateTime||''},decodeFields(json.fields||{}));
      });
    });
  }
  function writeDocument(project,collection,id,data){
    return fetch(url(project,collection,id),{method:'PATCH',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({fields:encodeFields(data)})}).then(function(response){
      return response.text().then(function(body){
        var json={};
        try{json=body?JSON.parse(body):{};}catch(_error){throw new Error('Firebase respondio en un formato no valido.');}
        if(!response.ok)throw new Error(json&&json.error&&json.error.message||('Firebase HTTP '+response.status));
        return Object.assign({_docId:id,_createTime:json.createTime||'',_updateTime:json.updateTime||''},decodeFields(json.fields||{}));
      });
    });
  }
  function periodSignature(value){
    var valueBase=text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,''),found=[],pairs=[],seen={},match;
    var months={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
    Object.keys(months).forEach(function(month){valueBase=valueBase.replace(new RegExp('\\b'+month+'\\b','g'),months[month]);});
    function add(index,year,month){var normalized=String(Number(month)).padStart(2,'0');if(Number(normalized)>=1&&Number(normalized)<=12)found.push({index:index,pair:year+'-'+normalized});}
    var yearMonth=/\b(20\d{2})\s*(?:[-_/.]|\s)\s*(0?[1-9]|1[0-2])\b/g;while((match=yearMonth.exec(valueBase)))add(match.index,match[1],match[2]);
    var monthYear=/\b(0?[1-9]|1[0-2])\s+(20\d{2})\b/g;while((match=monthYear.exec(valueBase)))add(match.index,match[2],match[1]);
    found.sort(function(a,b){return a.index-b.index;});
    found.forEach(function(item){if(!seen[item.pair]){seen[item.pair]=true;pairs.push(item.pair);}});
    if(pairs.length>=2)return pairs[0]+'__'+pairs[pairs.length-1];
    return pairs[0]||text(value).replace(/\//g,'-');
  }
  function field(data,names){for(var i=0;i<names.length;i+=1){if(data&&data[names[i]]!==undefined&&data[names[i]]!==null)return data[names[i]];}return'';}
  function resolvePeriod(configData){
    configData=configData||{};
    var nested=field(configData,['periodoActivo','periodoPrincipal','periodoActual']);
    nested=nested&&typeof nested==='object'?nested:{};
    var id=text(field(configData,['periodoActivoId','periodoPrincipalId','periodoActualId','periodoId','periodId'])||field(nested,['id','periodoId','periodId','codigo'])||FALLBACK_PERIOD.id);
    var label=text(field(configData,['periodoActivoLabel','periodoPrincipalLabel','periodoActualLabel','periodoLabel','periodoNombre','periodo'])||field(nested,['label','nombre','periodoLabel','periodoNombre'])||FALLBACK_PERIOD.label||id);
    return{id:id,label:label||id};
  }
  function normalizeStudent(row,id,period){
    var names=text(field(row,['nombres','Nombres','nombreCompleto','nombre']));
    var career=text(field(row,['nombreCarreraActual','NombreCarreraActual','nombreCarrera','NombreCarrera','carrera','Carrera']));
    var code=text(field(row,['codigoCarreraActual','CodigoCarreraActual','codigoCarrera','CodigoCarrera']));
    return{cedula:id,numeroIdentificacion:id,nombres:names,Nombres:names,carrera:career,nombreCarrera:career,NombreCarrera:career,codigoCarrera:code,CodigoCarrera:code,periodoId:text(period&&period.id),periodId:text(period&&period.id),periodoLabel:text(period&&period.label),periodo:text(period&&period.label),sede:text(field(row,['sede','Sede'])),Sede:text(field(row,['sede','Sede'])),correoInstitucional:text(field(row,['correoInstitucional','CorreoInstitucional'])),correoPersonal:text(field(row,['correoPersonal','CorreoPersonal'])),celular:text(field(row,['celular','Celular'])),fuente:'FIREBASE_UTET_DIRECTO'};
  }
  function getStudent(id){
    id=cedula(id);
    if(!id)return Promise.reject(new Error('La cedula debe tener 10 numeros.'));
    return readDocument('UTET','Estudiante',id).then(function(row){
      if(row)return row;
      if(id.charAt(0)==='0')return readDocument('UTET','Estudiante',id.slice(1));
      return null;
    }).then(function(row){
      if(!row||row.eliminado===true)throw new Error('No encontramos un estudiante activo con esa cedula en Firebase UTET.');
      return readDocument('UTET','titulos_config','app').catch(function(){return null;}).then(function(cfg){
        var period=resolvePeriod(cfg),student=normalizeStudent(row,id,period);
        if(!student.nombres||!student.carrera)throw new Error('El registro academico esta incompleto.');
        return student;
      });
    });
  }
  function state(row){return text(row&&(row.estadoProceso||row.estado||row.estadoFinal)).toUpperCase().replace(/[^A-Z0-9]+/g,'_')||'PENDIENTE_REVISION';}
  function articleId(cedulaValue,period){return periodSignature(period||FALLBACK_PERIOD.id)+'__'+cedula(cedulaValue);}
  function workId(cedulaValue,period){return periodSignature(period||FALLBACK_PERIOD.id)+'__'+cedula(cedulaValue)+'__trabajo_titulacion';}
  function getArticle(cedulaValue,period){return readDocument('TITULOS','envios',articleId(cedulaValue,period));}
  function getWork(cedulaValue,period){return readDocument('TITULOS','envios',workId(cedulaValue,period));}
  function save(id,data,type){
    return readDocument('TITULOS','envios',id).then(function(previous){
      if(previous&&state(previous)!=='DEVUELTO'){
        var duplicate=new Error('Tus propuestas ya fueron enviadas y estan siendo revisadas.');
        duplicate.duplicado=true;
        throw duplicate;
      }
      var now=new Date().toISOString();
      var merged=Object.assign({},previous||{},data||{},{tipoTrabajo:type,fechaEnvio:now,actualizadoEn:now,estado:'PENDIENTE_REVISION',estadoFinal:'PENDIENTE_REVISION',estadoProceso:type==='TRABAJO_TITULACION'?'PENDIENTE_COORDINADOR':'PENDIENTE_REVISION',permitirReenvio:false});
      delete merged._docId;delete merged._createTime;delete merged._updateTime;
      return writeDocument('TITULOS','envios',id,merged).then(function(saved){
        return{ok:true,encontrado:true,existe:true,idRegistro:id,envioId:id,estado:'PENDIENTE_REVISION',envio:saved,registro:saved,mensaje:previous?'Correcciones reenviadas correctamente.':'Propuestas enviadas correctamente para revision.'};
      });
    });
  }
  function saveArticle(data){data=data||{};return save(articleId(data.cedula||data.numeroIdentificacion,data.periodoId||data.periodoLabel||data.periodo),data,'ARTICULO_ACADEMICO');}
  function saveWork(data){data=data||{};return save(workId(data.cedula||data.numeroIdentificacion,data.periodoId||data.periodoLabel||data.periodo),data,'TRABAJO_TITULACION');}

  window.TitulosFirebaseDirectPublic=Object.freeze({
    readDocument:readDocument,
    periodSignature:periodSignature,
    getStudent:getStudent,
    getArticleEnvio:getArticle,
    getWorkEnvio:getWork,
    saveArticleEnvio:saveArticle,
    saveWorkEnvio:saveWork,
    state:state,
    articleId:articleId,
    workId:workId
  });
})(window);
