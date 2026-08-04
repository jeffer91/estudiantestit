(function(window,document){
  'use strict';

  var state={step:1,student:null,telegram:'',proposals:[],favorite:0,previous:null,busy:false};
  var fields=['tituloFinal','accionPrincipal','productoFinal','problemaNecesidad','proposito','unidadEstudio','lugarContexto','anioPeriodo','objetivoGeneral'];
  var risky={
    impacto:'Requiere datos que permitan demostrar un efecto atribuible.',
    optimizacion:'Requiere indicadores previos y posteriores que demuestren una mejora medible.',
    validacion:'Requiere criterios, procedimiento y resultados de validación.',
    implementacion:'Implica aplicación real y evidencias de ejecución.',
    automatizacion:'Requiere un proceso funcional que reduzca o sustituya tareas manuales.',
    eficacia:'Requiere criterios e indicadores para comprobar el resultado.',
    comparativo:'Requiere dos o más elementos y criterios comunes de comparación.',
    'solucion definitiva':'Es una promesa absoluta que normalmente no puede demostrarse.'
  };

  function $(id){return document.getElementById(id);}
  function text(value){return String(value===null||value===undefined?'':value).replace(/\s+/g,' ').trim();}
  function cedula(value){var digits=String(value||'').replace(/\D/g,'');return digits.length===9?'0'+digits:digits.length===10?digits:'';}
  function normal(value){return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
  function apiBase(){var origin=text(window.location&&window.location.origin);if(['http://localhost:5500','http://127.0.0.1:5500'].indexOf(origin)>=0)return'http://127.0.0.1:8788';return origin&&origin!=='null'?origin:'https://titulos.pages.dev';}
  function request(path,action,data){
    return fetch(apiBase()+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'estudiantes'},body:JSON.stringify({accion:action,metodo:'POST',datos:data||{}})}).then(function(response){
      return response.text().then(function(body){var json={};try{json=body?JSON.parse(body):{};}catch(error){throw new Error('El sistema respondió en un formato no válido.');}if(!response.ok||json.ok===false)throw new Error(json.mensaje||json.error||('Error HTTP '+response.status));return json;});
    });
  }
  function status(id,message,type){var el=$(id);if(!el)return;el.className='status '+(type||'info');el.textContent=message||'';}
  function busy(value){state.busy=value===true;document.querySelectorAll('button').forEach(function(button){button.disabled=state.busy;});}

  function buildPanels(){
    var template=$('proposalTemplate').innerHTML;
    $('proposalPanels').innerHTML=[1,2,3].map(function(number){return template.replace(/__N__/g,String(number));}).join('');
    showProposal(1);
  }
  function showStep(number){
    state.step=number;
    document.querySelectorAll('[data-step]').forEach(function(section){section.hidden=Number(section.getAttribute('data-step'))!==number;});
    document.querySelectorAll('[data-step-indicator]').forEach(function(item){item.classList.toggle('active',Number(item.getAttribute('data-step-indicator'))===number);});
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function showProposal(number){
    document.querySelectorAll('[data-proposal-panel]').forEach(function(panel){panel.hidden=Number(panel.getAttribute('data-proposal-panel'))!==number;});
    document.querySelectorAll('[data-proposal-tab]').forEach(function(tab){tab.classList.toggle('active',Number(tab.getAttribute('data-proposal-tab'))===number);});
  }
  function panel(number){return document.querySelector('[data-proposal-panel="'+number+'"]');}
  function proposal(number){
    var root=panel(number),out={numero:number};
    fields.forEach(function(field){var input=root&&root.querySelector('[data-field="'+field+'"]');out[field]=text(input&&input.value);});
    return out;
  }
  function setProposal(number,data){
    var root=panel(number);data=data||{};
    fields.forEach(function(field){var input=root&&root.querySelector('[data-field="'+field+'"]');if(input)input.value=text(data[field]||data[field==='objetivoGeneral'?'objetivo':'']);});
    updateRisk(number);
  }
  function collect(){state.proposals=[1,2,3].map(proposal);return state.proposals;}

  function titleFromFormula(item){
    var action=text(item.accionPrincipal),product=text(item.productoFinal),purpose=text(item.proposito),unit=text(item.unidadEstudio),place=text(item.lugarContexto),period=text(item.anioPeriodo);
    if(!action||!product||!purpose||!unit||!place||!period)return'';
    var first=action;
    if(!/\b(de|del|de la|de un|de una)\b/i.test(first))first=first+' de';
    var title=[first,product,purpose,unit,'de',place+',',period].join(' ').replace(/\s+,/g,',').replace(/\s+/g,' ').trim();
    title=title.charAt(0).toUpperCase()+title.slice(1);
    return title.replace(/[.]+$/,'')+'.';
  }
  function updateRisk(number){
    var item=proposal(number),base=normal(item.tituloFinal+' '+item.accionPrincipal+' '+item.proposito),warnings=[];
    Object.keys(risky).forEach(function(term){if(base.indexOf(normal(term))>=0)warnings.push('<strong>'+term.charAt(0).toUpperCase()+term.slice(1)+':</strong> '+risky[term]);});
    var box=document.querySelector('[data-risk="'+number+'"]');
    if(!box)return;
    box.innerHTML=warnings.join('<br>');box.classList.toggle('show',warnings.length>0);
  }
  function validateProposal(item,index){
    for(var i=0;i<fields.length;i+=1){if(!text(item[fields[i]]))return'Completa todos los campos de la propuesta '+index+'.';}
    if(/\btesis\b/i.test(item.tituloFinal))return'En la propuesta '+index+' utiliza la denominación institucional “Trabajo de Titulación”, no “tesis”.';
    if(text(item.tituloFinal).split(/\s+/).length<10)return'El título de la propuesta '+index+' es demasiado corto para identificar acción, producto, propósito y contexto.';
    return'';
  }
  function validateAll(){
    var list=collect();
    for(var i=0;i<list.length;i+=1){var error=validateProposal(list[i],i+1);if(error){showProposal(i+1);return error;}}
    var titles=list.map(function(item){return normal(item.tituloFinal);});
    if(new Set(titles).size!==3)return'Las tres propuestas deben tener títulos diferentes.';
    return'';
  }

  function renderStudent(student){
    $('datoNombres').textContent=student.nombres||'-';$('datoCedula').textContent=student.cedula||'-';$('datoCarrera').textContent=student.carrera||student.nombreCarrera||'-';$('datoPeriodo').textContent=student.periodoLabel||student.periodoId||'-';
  }
  function normalizeStudent(raw,requested){
    raw=raw||{};return{cedula:cedula(raw.numeroIdentificacion||raw.cedula||requested),nombres:text(raw.Nombres||raw.nombres||raw.nombre),carrera:text(raw.NombreCarrera||raw.nombreCarrera||raw.carrera),codigoCarrera:text(raw.CodigoCarrera||raw.codigoCarrera),periodoId:text(raw.periodoId||raw.periodoCanonicoId||raw.periodId),periodoLabel:text(raw.periodoLabel||raw.periodoCanonicoLabel||raw.periodoId),sede:text(raw.Sede||raw.sede),modalidad:text(raw.Modalidad||raw.modalidad)};
  }
  function preload(envio){
    if(!envio)return;
    state.previous=envio;
    if(envio.telegram)$('telegramInput').value=text(envio.telegram);
    var details=Array.isArray(envio.propuestasDetalle)?envio.propuestasDetalle:[];
    [1,2,3].forEach(function(number){setProposal(number,details[number-1]||{tituloFinal:envio['titulo'+number]});});
    state.favorite=Number(envio.tituloPreferidoNumero||envio.preferido||0);
  }

  function consultStudent(event){
    event.preventDefault();var id=cedula($('cedulaInput').value);if(!id){status('consultaEstado','Ingresa una cédula válida de 10 dígitos.','error');return;}
    busy(true);status('consultaEstado','Consultando tus datos académicos...','info');
    request('/api/requisitos','CONSULTAR_ESTUDIANTE_TITULACION',{cedula:id,numeroIdentificacion:id}).then(function(result){
      var raw=result.estudiante||result.registro||result.data;if(!result.encontrado||!raw)throw new Error(result.mensaje||'No se encontró un estudiante habilitado.');
      state.student=normalizeStudent(raw,id);if(!state.student.nombres||!state.student.carrera)throw new Error('El registro académico no contiene nombre y carrera completos.');
      return request('/api/trabajo-titulacion','CONSULTAR_ENVIO_TRABAJO_TITULACION',{cedula:id,periodoId:state.student.periodoId,periodoLabel:state.student.periodoLabel});
    }).then(function(existing){
      if(existing.encontrado&&existing.estado!=='DEVUELTO')throw new Error('Ya registraste tus propuestas de Trabajo de Titulación. Estado: '+text(existing.estado)+'.');
      renderStudent(state.student);if(existing.encontrado&&existing.envio){preload(existing.envio);status('datosEstado','El registro fue devuelto. Corrige las propuestas según las observaciones del coordinador.','info');}
      status('consultaEstado','Datos encontrados correctamente.','success');showStep(2);
    }).catch(function(error){status('consultaEstado',error.message||'No se pudo realizar la consulta.','error');}).finally(function(){busy(false);});
  }

  function continueToProposals(){
    var telegram=text($('telegramInput').value);if(!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram)){status('datosEstado','Ingresa un usuario de Telegram válido, por ejemplo: @usuario.','error');return;}state.telegram=telegram;status('datosEstado','', 'info');showStep(3);
  }
  function review(event){
    event.preventDefault();var error=validateAll();if(error){status('propuestasEstado',error,'error');return;}status('propuestasEstado','','info');renderSummary();showStep(4);
  }
  function renderSummary(){
    collect();$('resumenPropuestas').innerHTML=state.proposals.map(function(item,index){var number=index+1,checked=state.favorite===number?' checked':'';return'<article class="summary-item"><label><input type="radio" name="favorite" value="'+number+'"'+checked+'><span><span class="summary-title">Propuesta '+number+': '+escapeHtml(item.tituloFinal)+'</span><span class="summary-meta">'+escapeHtml(item.accionPrincipal)+' · Producto: '+escapeHtml(item.productoFinal)+' · '+escapeHtml(item.lugarContexto)+'</span></span></label></article>';}).join('');
  }
  function escapeHtml(value){return text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function selectedFavorite(){var radio=document.querySelector('input[name="favorite"]:checked');return radio?Number(radio.value):0;}
  function send(){
    if(state.busy)return;var favorite=selectedFavorite();if(!favorite){status('envioEstado','Selecciona tu propuesta favorita.','error');return;}if(!$('confirmacionEnvio').checked){status('envioEstado','Confirma la declaración antes de enviar.','error');return;}
    state.favorite=favorite;busy(true);status('envioEstado','Enviando tus propuestas a coordinación...','info');
    var payload={cedula:state.student.cedula,numeroIdentificacion:state.student.cedula,nombres:state.student.nombres,carrera:state.student.carrera,codigoCarrera:state.student.codigoCarrera,periodoId:state.student.periodoId,periodoLabel:state.student.periodoLabel,telegram:state.telegram,tipoTrabajo:'TRABAJO_TITULACION',propuestasDetalle:state.proposals,tituloPreferidoNumero:favorite};
    state.proposals.forEach(function(item,index){payload['titulo'+(index+1)]=item.tituloFinal;});
    request('/api/trabajo-titulacion','ENVIO_TRABAJO_TITULACION',payload).then(function(result){status('envioEstado',result.mensaje||'Trabajo de Titulación enviado correctamente.','success');$('enviarBtn').disabled=true;document.querySelectorAll('[data-go]').forEach(function(button){button.disabled=true;});}).catch(function(error){status('envioEstado',error.message||'No se pudo realizar el envío.','error');}).finally(function(){busy(false);if($('envioEstado').classList.contains('success'))$('enviarBtn').disabled=true;});
  }

  function installEvents(){
    $('consultaForm').addEventListener('submit',consultStudent);$('continuarPropuestas').addEventListener('click',continueToProposals);$('propuestasForm').addEventListener('submit',review);$('enviarBtn').addEventListener('click',send);
    document.addEventListener('click',function(event){var go=event.target.closest('[data-go]');if(go){showStep(Number(go.getAttribute('data-go')));return;}var tab=event.target.closest('[data-proposal-tab]');if(tab){showProposal(Number(tab.getAttribute('data-proposal-tab')));return;}var build=event.target.closest('[data-build-title]');if(build){var number=Number(build.getAttribute('data-build-title')),item=proposal(number),title=titleFromFormula(item);if(!title){status('propuestasEstado','Completa acción, producto, propósito, unidad de estudio, contexto y período para construir el título.','error');return;}var input=panel(number).querySelector('[data-field="tituloFinal"]');input.value=title;updateRisk(number);status('propuestasEstado','Se construyó una redacción base. Revísala y ajústala antes de continuar.','success');}});
    document.addEventListener('input',function(event){var root=event.target.closest('[data-proposal-panel]');if(root)updateRisk(Number(root.getAttribute('data-proposal-panel')));});
  }

  buildPanels();installEvents();showStep(1);
})(window,document);
