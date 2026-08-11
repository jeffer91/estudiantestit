(function(window,document){
  'use strict';

  var state={step:1,student:null,telegram:'',proposals:[],favorite:0,previous:null,busy:false};

  function $(id){return document.getElementById(id);}
  function text(value){return String(value===null||value===undefined?'':value).replace(/\s+/g,' ').trim();}
  function cedula(value){var digits=String(value||'').replace(/\D/g,'');return digits.length===10?digits:'';}
  function normal(value){return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}
  function apiBase(){var origin=text(window.location&&window.location.origin);if(['http://localhost:5500','http://127.0.0.1:5500'].indexOf(origin)>=0)return'http://127.0.0.1:8788';return origin&&origin!=='null'?origin:'https://titulos.pages.dev';}
  function request(path,action,data){
    return fetch(apiBase()+path,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'estudiantes'},body:JSON.stringify({accion:action,metodo:'POST',datos:data||{}})}).then(function(response){
      return response.text().then(function(body){var json={};try{json=body?JSON.parse(body):{};}catch(error){throw new Error('El sistema respondió en un formato no válido.');}if(!response.ok||json.ok===false)throw new Error(json.mensaje||json.error||('Error HTTP '+response.status));return json;});
    });
  }
  function status(id,message,type){var el=$(id);if(!el)return;el.className='status '+(type||'info');el.textContent=message||'';}
  function busy(value){state.busy=value===true;document.querySelectorAll('button').forEach(function(button){button.disabled=state.busy;});}
  function escapeHtml(value){return text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function estadoNormal(value){return text(value).toUpperCase().replace(/[^A-Z0-9]+/g,'_');}
  function estadoLabel(value){var current=estadoNormal(value);var labels={PENDIENTE_REVISION:'Pendiente de revisión',PENDIENTE:'Pendiente de revisión',ENVIADO:'Pendiente de revisión',APROBADO:'Aprobado',REEMPLAZADO:'Aprobado con corrección',DEVUELTO:'Devuelto para corrección'};return labels[current]||text(value)||'Sin estado';}
  function cleanTitle(value){
    var output=text(value),match;
    if(!output)return'';
    match=output.match(/^(?:["']?titulo["']?)\s*:\s*["']([\s\S]*?)["']$/i);
    if(match)output=text(match[1]);
    while(output.length>=2&&((output.charAt(0)==='"'&&output.charAt(output.length-1)==='"')||(output.charAt(0)==="'"&&output.charAt(output.length-1)==="'")))output=text(output.slice(1,-1));
    return output;
  }
  function proposalTitle(value){
    if(typeof value==='string')return cleanTitle(value);
    value=value&&typeof value==='object'?value:{};
    return cleanTitle(value.tituloFinal||value.titulo||value.tituloMejorado||value.texto||value.title);
  }

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
    var root=panel(number);
    var input=root&&root.querySelector('[data-field="tituloFinal"]');
    return{numero:number,tituloFinal:text(input&&input.value)};
  }
  function setProposal(number,data){
    var root=panel(number),input=root&&root.querySelector('[data-field="tituloFinal"]');
    data=data||{};
    if(input)input.value=cleanTitle(data.tituloFinal||data.titulo||'');
  }
  function collect(){state.proposals=[1,2,3].map(proposal);return state.proposals;}

  function validateProposal(item,index){
    if(!text(item.tituloFinal))return'Escribe el título propuesto '+index+'.';
    if(text(item.tituloFinal).length<8)return'El título propuesto '+index+' es demasiado corto.';
    return'';
  }
  function validateAll(){
    var list=collect();
    for(var i=0;i<list.length;i+=1){var error=validateProposal(list[i],i+1);if(error){showProposal(i+1);return error;}}
    var titles=list.map(function(item){return normal(item.tituloFinal);});
    if(new Set(titles).size!==3)return'Los tres títulos propuestos deben ser diferentes.';
    return'';
  }

  function renderStudent(student){
    $('datoNombres').textContent=student.nombres||'-';
    $('datoCedula').textContent=student.cedula||'-';
    $('datoCarrera').textContent=student.carrera||student.nombreCarrera||'-';
    $('datoPeriodo').textContent=student.periodoLabel||student.periodoId||'-';
  }
  function normalizeStudent(raw,requested){
    raw=raw||{};
    return{
      cedula:cedula(raw.numeroIdentificacion||raw.cedula||requested),
      nombres:text(raw.Nombres||raw.nombres||raw.nombre),
      carrera:text(raw.NombreCarrera||raw.nombreCarrera||raw.carrera),
      codigoCarrera:text(raw.CodigoCarrera||raw.codigoCarrera),
      periodoId:text(raw.periodoId||raw.periodoCanonicoId||raw.periodId),
      periodoLabel:text(raw.periodoLabel||raw.periodoCanonicoLabel||raw.periodoId),
      sede:text(raw.Sede||raw.sede),
      modalidad:text(raw.Modalidad||raw.modalidad)
    };
  }
  function hideExisting(){
    var section=$('registroExistente');
    if(section)section.hidden=true;
  }
  function hideReturnedDetails(){
    var section=$('devolucionDetalle');
    if(section)section.hidden=true;
  }
  function existingProposals(envio){
    envio=envio||{};
    var slots=[cleanTitle(envio.titulo1),cleanTitle(envio.titulo2),cleanTitle(envio.titulo3)];
    var used={};
    slots.forEach(function(title){if(title)used[normal(title)]=true;});
    var candidates=[];
    function add(value){var title=cleanTitle(value),key=normal(title);if(!title||!key||used[key])return;used[key]=true;candidates.push(title);}
    var details=Array.isArray(envio.propuestasDetalle)?envio.propuestasDetalle:[];
    var proposals=Array.isArray(envio.propuestas)?envio.propuestas:[];
    var sent=Array.isArray(envio.titulosEnviados)?envio.titulosEnviados:[];
    details.forEach(function(item){add(proposalTitle(item));});
    proposals.forEach(function(item){add(proposalTitle(item));});
    sent.forEach(function(item){add(proposalTitle(item));});
    add(envio.tituloElegido);
    add(envio.tituloPreferidoTexto);
    add(envio.tituloFinal);
    add(envio.tituloAprobado);
    add(envio.tituloCorregido);
    var cursor=0;
    for(var index=0;index<3;index+=1){if(!slots[index]&&cursor<candidates.length){slots[index]=candidates[cursor];cursor+=1;}}
    return slots.map(function(title,index){return{text:title,number:index+1};}).filter(function(item){return Boolean(item.text);});
  }
  function titlesHtml(envio,favorite){
    var items=existingProposals(envio);
    if(!items.length)return'<article class="existing-title"><strong>No se encontraron títulos conservados en este registro histórico.</strong></article>';
    return items.map(function(item){
      var favoriteLabel=favorite===item.number?'<span class="favorite-chip">★ Favorito</span>':'';
      return'<article class="existing-title'+(favorite===item.number?' is-favorite':'')+'"><div><span>Título '+item.number+'</span>'+favoriteLabel+'</div><strong>'+escapeHtml(item.text)+'</strong></article>';
    }).join('');
  }
  function renderExisting(envio,statusValue){
    envio=envio||{};
    var section=$('registroExistente');
    if(!section)return;
    var favorite=Number(envio.tituloPreferidoNumero||envio.preferido||0);
    var currentStatus=estadoNormal(statusValue||envio.estado||envio.estadoFinal);
    $('existenteEstado').textContent=estadoLabel(currentStatus);
    $('existenteEstado').className='state-badge state-badge--'+currentStatus.toLowerCase();
    $('existenteNombres').textContent=text(envio.nombres||envio.estudiante||state.student&&state.student.nombres)||'-';
    $('existenteCarrera').textContent=text(envio.carrera||envio.carreraNombre||envio.nombreCarrera||state.student&&state.student.carrera)||'-';
    $('existentePeriodo').textContent=text(envio.periodoLabel||envio.periodoNombre||envio.periodoId||state.student&&state.student.periodoLabel)||'-';
    $('existenteTitulos').innerHTML=titlesHtml(envio,favorite);
    var finalTitle=cleanTitle(envio.tituloFinal||envio.tituloAprobado||envio.tituloCorregido);
    var observation=text(envio.observacion||envio.comentarioCoordinador||envio.comentario||envio.ultimoComentario);
    var resolution=$('existenteResolucion');
    resolution.hidden=!finalTitle&&!observation;
    $('existenteTituloFinal').textContent=finalTitle||'-';
    $('existenteObservacion').textContent=observation||'-';
    section.hidden=false;
  }
  function renderReturnedDetails(envio){
    envio=envio||{};
    var section=$('devolucionDetalle');
    if(!section)return;
    var favorite=Number(envio.tituloPreferidoNumero||envio.preferido||0);
    var observation=text(envio.observacion||envio.comentarioCoordinador||envio.comentario||envio.ultimoComentario);
    $('devolucionTitulos').innerHTML=titlesHtml(envio,favorite);
    $('devolucionObservacion').textContent=observation||'No consta una observación del coordinador en este registro.';
    section.hidden=false;
  }
  function preload(envio){
    if(!envio)return;
    state.previous=envio;
    if(envio.telegram)$('telegramInput').value=text(envio.telegram);
    var existing=existingProposals(envio);
    [1,2,3].forEach(function(number){
      var item=existing.find(function(candidate){return candidate.number===number;});
      setProposal(number,item?{tituloFinal:item.text}:{tituloFinal:''});
    });
    state.favorite=Number(envio.tituloPreferidoNumero||envio.preferido||0);
  }

  function consultStudent(event){
    event.preventDefault();
    var id=cedula($('cedulaInput').value);
    if(!id){status('consultaEstado','Ingresa una cédula válida de 10 dígitos.','error');return;}
    hideExisting();
    hideReturnedDetails();
    busy(true);
    status('consultaEstado','Consultando tus datos académicos...','info');
    request('/api/requisitos','CONSULTAR_ESTUDIANTE_TITULACION',{cedula:id,numeroIdentificacion:id}).then(function(result){
      var raw=result.estudiante||result.registro||result.data;
      if(!result.encontrado||!raw)throw new Error(result.mensaje||'No se encontró un estudiante habilitado.');
      state.student=normalizeStudent(raw,id);
      if(!state.student.nombres||!state.student.carrera)throw new Error('El registro académico no contiene nombre y carrera completos.');
      renderStudent(state.student);
      return request('/api/trabajo-titulacion','CONSULTAR_ENVIO_TRABAJO_TITULACION',{cedula:id,periodoId:state.student.periodoId,periodoLabel:state.student.periodoLabel});
    }).then(function(existing){
      var envio=existing.envio||existing.registro||null;
      var currentStatus=estadoNormal(existing.estado||envio&&envio.estado);
      if(existing.encontrado&&envio){
        renderExisting(envio,currentStatus);
        preload(envio);
        if(currentStatus==='DEVUELTO'){
          renderReturnedDetails(envio);
          status('consultaEstado','Tu registro fue devuelto. Revisa la observación y corrige los títulos.','info');
          status('datosEstado','Revisa los títulos enviados y la observación del coordinador antes de continuar.','info');
          showStep(2);
          return;
        }
        hideReturnedDetails();
        status('consultaEstado','Tus títulos ya están registrados. Estado: '+estadoLabel(currentStatus)+'.','success');
        showStep(1);
        return;
      }
      hideExisting();
      hideReturnedDetails();
      status('consultaEstado','Datos encontrados correctamente. Continúa con el registro.','success');
      showStep(2);
    }).catch(function(error){hideExisting();hideReturnedDetails();status('consultaEstado',error.message||'No se pudo realizar la consulta.','error');}).finally(function(){busy(false);});
  }

  function continueToProposals(){
    var telegram=text($('telegramInput').value);
    if(!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(telegram)){status('datosEstado','Ingresa un usuario de Telegram válido, por ejemplo: @usuario.','error');return;}
    state.telegram=telegram;
    status('datosEstado','','info');
    showStep(3);
  }
  function review(event){
    event.preventDefault();
    var error=validateAll();
    if(error){status('propuestasEstado',error,'error');return;}
    status('propuestasEstado','','info');
    renderSummary();
    showStep(4);
  }
  function renderSummary(){
    collect();
    $('resumenPropuestas').innerHTML=state.proposals.map(function(item,index){
      var number=index+1,checked=state.favorite===number?' checked':'';
      return'<article class="summary-item"><label><input type="radio" name="favorite" value="'+number+'"'+checked+'><span><span class="summary-title">Título '+number+': '+escapeHtml(item.tituloFinal)+'</span></span></label></article>';
    }).join('');
  }
  function selectedFavorite(){var radio=document.querySelector('input[name="favorite"]:checked');return radio?Number(radio.value):0;}
  function send(){
    if(state.busy)return;
    var favorite=selectedFavorite();
    if(!favorite){status('envioEstado','Selecciona tu título favorito.','error');return;}
    if(!$('confirmacionEnvio').checked){status('envioEstado','Confirma la declaración antes de enviar.','error');return;}
    state.favorite=favorite;
    busy(true);
    status('envioEstado','Enviando tus títulos a coordinación...','info');
    var payload={
      cedula:state.student.cedula,
      numeroIdentificacion:state.student.cedula,
      nombres:state.student.nombres,
      carrera:state.student.carrera,
      codigoCarrera:state.student.codigoCarrera,
      periodoId:state.student.periodoId,
      periodoLabel:state.student.periodoLabel,
      telegram:state.telegram,
      tipoTrabajo:'TRABAJO_TITULACION',
      propuestasDetalle:state.proposals,
      tituloPreferidoNumero:favorite
    };
    state.proposals.forEach(function(item,index){payload['titulo'+(index+1)]=item.tituloFinal;});
    request('/api/trabajo-titulacion','ENVIO_TRABAJO_TITULACION',payload).then(function(result){
      status('envioEstado',result.mensaje||'Trabajo de Titulación enviado correctamente.','success');
      $('enviarBtn').disabled=true;
      document.querySelectorAll('[data-go]').forEach(function(button){button.disabled=true;});
    }).catch(function(error){status('envioEstado',error.message||'No se pudo realizar el envío.','error');}).finally(function(){busy(false);if($('envioEstado').classList.contains('success'))$('enviarBtn').disabled=true;});
  }

  function installEvents(){
    $('consultaForm').addEventListener('submit',consultStudent);
    $('continuarPropuestas').addEventListener('click',continueToProposals);
    $('propuestasForm').addEventListener('submit',review);
    $('enviarBtn').addEventListener('click',send);
    document.addEventListener('click',function(event){
      var go=event.target.closest('[data-go]');
      if(go){showStep(Number(go.getAttribute('data-go')));return;}
      var tab=event.target.closest('[data-proposal-tab]');
      if(tab)showProposal(Number(tab.getAttribute('data-proposal-tab')));
    });
  }

  buildPanels();
  installEvents();
  showStep(1);
})(window,document);
