(function(window,document){
  'use strict';

  if(window.ADAdminFlowControls)return;
  window.ADAdminFlowControls=true;

  var saving=false;
  var lastCedula='';

  function $(id){return document.getElementById(id);}
  function text(value){return String(value===null||value===undefined?'':value).trim();}
  function normal(value){return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ').trim();}
  function esc(value){return text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function state(value){return text(value).toUpperCase();}

  function currentStudent(){
    var id=text($('ad-v2-detail-id')&&$('ad-v2-detail-id').textContent).replace(/\D/g,'');
    var data=window.ADAdminGlobalLast||{};
    return (data.registros||[]).find(function(item){return text(item&&item.cedula).replace(/\D/g,'')===id;})||null;
  }

  function selectedPeriod(){
    var select=$('ad-v2-title-period');
    if(!select)return{id:'',label:''};
    var option=select.selectedIndex>=0?select.options[select.selectedIndex]:null;
    return{id:text(select.value),label:text(option&&option.textContent).replace(/\s+·\s+Inactivo$/i,'')};
  }

  function endpoint(){
    var service=window.ADAPIService;
    var base=service&&typeof service.base==='function'?text(service.base()):text(window.location&&window.location.origin);
    return base.replace(/\/$/,'')+'/api/admin-flujo';
  }

  function request(action,data){
    return fetch(endpoint(),{
      method:'POST',
      cache:'no-store',
      headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},
      body:JSON.stringify({accion:action,datos:data||{}})
    }).then(function(response){
      return response.text().then(function(body){
        var json={};
        try{json=body?JSON.parse(body):{};}catch(_error){throw new Error('El servidor respondió en un formato no válido.');}
        if(!response.ok||json.ok===false)throw new Error(json.mensaje||json.message||('Error HTTP '+response.status));
        return json;
      });
    });
  }

  function installStyles(){
    if($('ad-admin-flow-styles'))return;
    var style=document.createElement('style');
    style.id='ad-admin-flow-styles';
    style.textContent=''+
      '.ad-admin-flow{margin-top:14px;padding:16px;border:1px solid #cdddef;border-radius:16px;background:#f7fbff}'+
      '.ad-admin-flow h4{margin:0 0 5px}.ad-admin-flow__help{margin:0 0 13px;color:#526b88;line-height:1.45}'+
      '.ad-admin-flow__reason{display:grid;gap:7px;margin:12px 0;font-weight:800}.ad-admin-flow__reason textarea{width:100%;min-height:78px;box-sizing:border-box;resize:vertical;font:inherit}'+
      '.ad-admin-flow__buttons{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 14px}'+
      '.ad-admin-flow__approve{padding-top:12px;border-top:1px solid #d7e4f2}.ad-admin-flow__approve>strong{display:block;margin-bottom:8px}'+
      '.ad-admin-flow__titles{display:grid;gap:8px;margin-bottom:10px}.ad-admin-flow__title{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:start;padding:10px;border:1px solid #dbe6f2;border-radius:12px;background:#fff;cursor:pointer}'+
      '.ad-admin-flow__title input{margin-top:3px}.ad-admin-flow__title span{line-height:1.35}.ad-admin-flow__title small{display:block;color:#627894;margin-bottom:3px;font-weight:800}'+
      '.ad-admin-flow__status{margin-top:10px;white-space:pre-wrap}.ad-admin-flow button:disabled{opacity:.45;cursor:not-allowed}';
    document.head.appendChild(style);
  }

  function installPanel(){
    installStyles();
    var modal=$('ad-v2-detail-modal');
    if(!modal)return false;
    var card=modal.querySelector('.ad-v2-modal__card');
    var oldReturn=modal.querySelector('.ad-v2-return');
    if(!card||!oldReturn)return false;

    if(!$('ad-admin-flow')){
      var panel=document.createElement('section');
      panel.id='ad-admin-flow';
      panel.className='ad-admin-flow';
      panel.hidden=true;
      panel.innerHTML=''+
        '<h4>Control administrativo del flujo</h4>'+
        '<p class="ad-admin-flow__help">Puedes regresar el caso a Coordinación o Investigación, o aprobar directamente una de las propuestas. Ninguna acción borra el historial anterior.</p>'+
        '<label class="ad-admin-flow__reason"><span>Motivo de la acción</span><textarea id="ad-admin-flow-reason" placeholder="Escribe una justificación de al menos 4 caracteres"></textarea></label>'+
        '<div class="ad-admin-flow__buttons">'+
          '<button class="ad-btn ad-btn-secondary" type="button" data-admin-flow-action="coordinador">↩ Devolver a Coordinador</button>'+
          '<button class="ad-btn ad-btn-secondary" type="button" data-admin-flow-action="investigador">↩ Devolver a Investigador</button>'+
        '</div>'+
        '<div class="ad-admin-flow__approve"><strong>Aprobación directa</strong><div id="ad-admin-flow-titles" class="ad-admin-flow__titles"></div><button class="ad-btn ad-btn-primary" type="button" data-admin-flow-action="aprobar">✓ Aprobar título seleccionado</button></div>'+
        '<pre id="ad-admin-flow-status" class="ad-result-box ad-admin-flow__status">Selecciona una acción administrativa.</pre>';
      card.insertBefore(panel,oldReturn);
    }

    var oldButton=modal.querySelector('[data-v2-action="return-detail"]');
    if(oldButton)oldButton.textContent='↩️ Devolver al estudiante';
    var oldLabel=oldReturn.querySelector('label strong');
    if(oldLabel)oldLabel.textContent='Motivo para devolver al estudiante';
    return true;
  }

  function status(message,type){
    var box=$('ad-admin-flow-status');
    if(!box)return;
    box.textContent=message||'';
    box.className='ad-result-box ad-admin-flow__status ad-status-'+(type||'info');
  }

  function chooseDefault(student){
    var reference=normal(student&&student.tituloFinal||student&&student.tituloCoordinador||'');
    var found=0;
    [1,2,3].some(function(n){
      if(reference&&normal(student&&student['titulo'+n])===reference){found=n;return true;}
      return false;
    });
    if(found)return found;
    var favorite=Number(student&&student.tituloPreferidoNumero||0);
    if([1,2,3].includes(favorite)&&text(student&&student['titulo'+favorite]))return favorite;
    return [1,2,3].find(function(n){return text(student&&student['titulo'+n]);})||0;
  }

  function renderTitles(student){
    var target=$('ad-admin-flow-titles');
    if(!target)return;
    var selected=chooseDefault(student);
    target.innerHTML=[1,2,3].map(function(n){
      var title=text(student&&student['titulo'+n]);
      return '<label class="ad-admin-flow__title"><input type="radio" name="ad-admin-flow-title" value="'+n+'" '+(selected===n?'checked ':'')+(title?'':'disabled ')+'><span><small>Título '+n+'</small>'+esc(title||'No registrado')+'</span></label>';
    }).join('');
  }

  function sync(){
    if(!installPanel())return;
    var modal=$('ad-v2-detail-modal');
    var panel=$('ad-admin-flow');
    if(!modal||!panel)return;
    if(modal.hidden){if(!panel.hidden)panel.hidden=true;return;}
    var student=currentStudent();
    if(!student||!text(student.envioId)){if(!panel.hidden)panel.hidden=true;return;}
    if(panel.hidden)panel.hidden=false;

    var cedula=text(student.cedula);
    if(lastCedula!==cedula){
      lastCedula=cedula;
      var reason=$('ad-admin-flow-reason');if(reason)reason.value='';
      renderTitles(student);
      status('Selecciona una acción administrativa.','info');
    }

    var current=state(student.estado);
    var toCoordinator=document.querySelector('[data-admin-flow-action="coordinador"]');
    var toInvestigator=document.querySelector('[data-admin-flow-action="investigador"]');
    var approve=document.querySelector('[data-admin-flow-action="aprobar"]');
    var alreadyCoordinator=current==='PENDIENTE_COORDINADOR'||current==='PENDIENTE_REVISION';
    var alreadyInvestigator=current==='PENDIENTE_INVESTIGADOR';
    var alreadyApproved=current==='APROBADO_FINAL';
    var hasCoordinatorTitle=Boolean(text(student.tituloCoordinador));
    if(toCoordinator){toCoordinator.disabled=saving||alreadyCoordinator;toCoordinator.title=alreadyCoordinator?'El caso ya está en Coordinación.':'';}
    if(toInvestigator){toInvestigator.disabled=saving||alreadyCoordinator||alreadyInvestigator||!hasCoordinatorTitle;toInvestigator.title=alreadyCoordinator?'El caso espera una nueva revisión de Coordinación.':(!hasCoordinatorTitle?'No existe un título validado por Coordinación.':(alreadyInvestigator?'El caso ya está en Investigación.':''));}
    if(approve){approve.disabled=saving||alreadyApproved;approve.title=alreadyApproved?'El caso ya tiene aprobación final.':'';}
  }

  function selectedTitleNumber(){
    var checked=document.querySelector('input[name="ad-admin-flow-title"]:checked');
    return checked?Number(checked.value||0):0;
  }

  function setButtonsDisabled(value){
    document.querySelectorAll('[data-admin-flow-action]').forEach(function(button){button.disabled=value;});
  }

  function refresh(result){
    var service=window.ADAPIService;
    var clear=service&&typeof service.limpiarCache==='function'
      ? service.limpiarCache({forzarMs:8000,forzarVistaAdmin:true})
      : Promise.resolve();
    return Promise.resolve(clear).catch(function(){}).then(function(){
      var modal=$('ad-v2-detail-modal');if(modal)modal.hidden=true;
      document.body.classList.remove('ad-modal-open');
      var top=$('ad-v2-title-status');
      if(top){top.textContent=result&&result.mensaje||'Acción administrativa completada.';top.className='ad-result-box ad-status-success';}
      var period=$('ad-v2-title-period');
      if(period)period.dispatchEvent(new Event('change',{bubbles:true}));
      window.setTimeout(function(){var stats=$('ad-v2-stat-period');if(stats)stats.dispatchEvent(new Event('change',{bubbles:true}));},650);
    });
  }

  function run(actionName){
    if(saving)return;
    var student=currentStudent();
    if(!student||!text(student.envioId)){status('No se identificó el envío seleccionado. Actualiza la lista.','danger');return;}
    var reason=text($('ad-admin-flow-reason')&&$('ad-admin-flow-reason').value).replace(/\s+/g,' ');
    if(reason.length<4){status('Escribe un motivo de al menos 4 caracteres.','danger');$('ad-admin-flow-reason').focus();return;}

    var action='';
    var confirmation='';
    var titleNumber=0;
    if(actionName==='coordinador'){
      action='ADMIN_DEVOLVER_COORDINADOR';
      confirmation='¿Devolver este caso a Coordinación? Las revisiones anteriores se conservarán en el historial.';
    }else if(actionName==='investigador'){
      action='ADMIN_DEVOLVER_INVESTIGADOR';
      confirmation='¿Devolver este caso a Investigación? Quedará disponible para una nueva revisión y se conservará el historial.';
    }else if(actionName==='aprobar'){
      action='ADMIN_APROBAR_DIRECTO';
      titleNumber=selectedTitleNumber();
      if(!titleNumber){status('Selecciona uno de los tres títulos antes de aprobar.','danger');return;}
      confirmation='¿Aprobar directamente el Título '+titleNumber+'? La aprobación quedará atribuida a Administración, no a Coordinación ni a Investigación.';
    }else return;

    if(!window.confirm(confirmation))return;
    var period=selectedPeriod();
    saving=true;
    setButtonsDisabled(true);
    status('Guardando acción administrativa...','info');
    request(action,{
      envioId:student.envioId,
      cedula:student.cedula,
      numeroIdentificacion:student.cedula,
      periodoId:period.id,
      periodoLabel:period.label,
      motivo:reason,
      observacion:reason,
      tituloNumero:titleNumber||undefined
    }).then(function(result){
      status(result.mensaje||'Acción completada.','success');
      return refresh(result);
    }).catch(function(error){
      status(text(error&&error.message||error)||'No se pudo completar la acción.','danger');
    }).finally(function(){
      saving=false;
      sync();
    });
  }

  document.addEventListener('click',function(event){
    var adminButton=event.target&&event.target.closest?event.target.closest('[data-admin-flow-action]'):null;
    if(adminButton){event.preventDefault();run(adminButton.getAttribute('data-admin-flow-action'));return;}
    var detail=event.target&&event.target.closest?event.target.closest('[data-v2-action="detail"]'):null;
    if(detail)window.setTimeout(sync,0);
  },true);

  var observer=new MutationObserver(function(){window.setTimeout(sync,0);});
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){window.setTimeout(sync,0);},{once:true});
  else window.setTimeout(sync,0);
})(window,document);
