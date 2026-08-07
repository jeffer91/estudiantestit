/* Acciones administrativas específicas para Trabajo de Titulación. */
(function(window,document){
  'use strict';

  var TYPE='TRABAJO_TITULACION';
  var installed=false;

  function text(value){return String(value===null||value===undefined?'':value).trim();}
  function $(id){return document.getElementById(id);}
  function rows(){var data=window.ADAdminGlobalLast||{};return data.registros||data.estudiantes||[];}
  function studentById(id){id=text(id);return rows().find(function(item){return text(item&&item.cedula)===id;})||null;}
  function status(message,type){
    var el=$('ad-v2-work-admin-status');
    if(!el)return;
    el.textContent=message||'';
    el.className='ad-result-box ad-status-'+(type||'info');
  }
  function base(){
    try{
      if(window.ADAPIService&&typeof window.ADAPIService.base==='function')return text(window.ADAPIService.base()).replace(/\/$/,'');
    }catch(error){}
    return text(window.location&&window.location.origin).replace(/\/$/,'');
  }
  function currentStudent(){return studentById($('ad-v2-detail-id')&&$('ad-v2-detail-id').textContent);}
  function isWork(item){return text(item&&item.tipoTrabajo).toUpperCase()===TYPE;}
  function stateOf(item){return text(item&&item.estado).toUpperCase();}
  function isApproved(item){var value=stateOf(item);return value==='APROBADO'||value==='REEMPLAZADO';}
  function isReturned(item){return stateOf(item)==='DEVUELTO';}

  function request(action,data){
    return fetch(base()+'/api/admin-trabajo-titulacion',{
      method:'POST',
      cache:'no-store',
      headers:{'Content-Type':'application/json','X-Titulos-App':'administrador'},
      body:JSON.stringify({accion:action,action:action,datos:data||{}})
    }).then(function(response){
      return response.text().then(function(body){
        var json={};
        try{json=body?JSON.parse(body):{};}catch(error){throw new Error('El servidor respondió en un formato no válido.');}
        if(!response.ok||json.ok===false)throw new Error(json.mensaje||json.error||('Error HTTP '+response.status));
        return json;
      });
    });
  }

  function setBusy(active){
    document.querySelectorAll('[data-work-admin-action]').forEach(function(button){button.disabled=active;});
    var textarea=$('ad-v2-work-admin-comment');if(textarea)textarea.disabled=active;
    var reason=$('ad-v2-work-admin-reason');if(reason)reason.disabled=active;
  }

  function refresh(){
    var finish=function(){
      var modal=$('ad-v2-detail-modal');if(modal)modal.hidden=true;
      document.body.classList.remove('ad-modal-open');
      var period=$('ad-v2-title-period');
      if(period)period.dispatchEvent(new Event('change',{bubbles:true}));
    };
    if(window.ADAPIService&&typeof window.ADAPIService.limpiarCache==='function'){
      return Promise.resolve(window.ADAPIService.limpiarCache({forzarMs:8000})).catch(function(){}).then(finish);
    }
    finish();
    return Promise.resolve();
  }

  function ensurePanel(){
    var modal=$('ad-v2-detail-modal');
    if(!modal||$('ad-v2-work-admin'))return Boolean(modal);
    var review=modal.querySelector('.ad-v2-review');
    if(!review)return false;
    var section=document.createElement('section');
    section.id='ad-v2-work-admin';
    section.className='ad-v2-work-admin';
    section.hidden=true;
    section.innerHTML=''+
      '<h4>Trabajo de Titulación</h4>'+
      '<p class="ad-v2-work-admin__help">Acciones administrativas con historial.</p>'+
      '<label><strong>Comentario</strong><textarea id="ad-v2-work-admin-comment" rows="3" placeholder="Comentario de la revisión"></textarea></label>'+
      '<label><strong>Motivo</strong><textarea id="ad-v2-work-admin-reason" rows="2" placeholder="Solo para reabrir, devolver o quitar"></textarea></label>'+
      '<pre id="ad-v2-work-admin-status" class="ad-result-box"></pre>'+
      '<div class="ad-v2-work-admin__actions">'+
      '<button class="ad-btn ad-btn-secondary" type="button" data-work-admin-action="comment">Guardar comentario</button>'+
      '<button class="ad-btn ad-btn-warning" type="button" data-work-admin-action="reopen">Reabrir</button>'+
      '<button class="ad-btn ad-btn-primary" type="button" data-work-admin-action="return">Devolver</button>'+
      '<button class="ad-btn ad-btn-danger" type="button" data-work-admin-action="remove">Quitar envío</button>'+
      '</div>';
    review.insertAdjacentElement('afterend',section);

    var style=document.createElement('style');
    style.id='ad-v2-work-admin-style';
    style.textContent=''+
      '.ad-v2-work-admin{margin-top:14px;border:1px solid #dfe9f5;border-radius:14px;padding:14px;background:#fbfdff}'+
      '.ad-v2-work-admin label{display:grid;gap:7px;margin-top:10px}.ad-v2-work-admin textarea{width:100%;min-height:64px}'+
      '.ad-v2-work-admin__help{margin:3px 0 8px;color:#5b7190}.ad-v2-work-admin__actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}';
    document.head.appendChild(style);
    return true;
  }

  function syncTableActions(){
    var body=$('ad-v2-title-body');
    if(!body)return;
    body.querySelectorAll('[data-v2-action="delete"][data-id]').forEach(function(button){
      var item=studentById(button.getAttribute('data-id'));
      button.hidden=isWork(item);
    });
    body.querySelectorAll('[data-v2-action="detail"][data-id]').forEach(function(button){
      var item=studentById(button.getAttribute('data-id'));
      if(isWork(item))button.title='Ver y administrar Trabajo de Titulación';
    });
  }

  function watchTable(attempt){
    var body=$('ad-v2-title-body');
    if(body){
      new MutationObserver(syncTableActions).observe(body,{childList:true,subtree:true});
      syncTableActions();
      return;
    }
    if((attempt||0)<30)window.setTimeout(function(){watchTable((attempt||0)+1);},100);
  }

  function sync(){
    if(!ensurePanel())return;
    var item=currentStudent();
    var work=isWork(item);
    var panel=$('ad-v2-work-admin');
    if(panel)panel.hidden=!work;

    var oldReturn=document.querySelector('[data-v2-action="return-detail"]');
    var oldDelete=document.querySelector('[data-v2-action="delete-detail"]');
    var oldBox=$('ad-v2-return-reason')&&$('ad-v2-return-reason').closest('.ad-v2-return');
    if(oldReturn)oldReturn.hidden=work;
    if(oldDelete)oldDelete.hidden=work;
    if(oldBox)oldBox.hidden=work;
    if(!work)return;

    if($('ad-v2-work-admin-comment'))$('ad-v2-work-admin-comment').value=text(item.observacion);
    if($('ad-v2-work-admin-reason'))$('ad-v2-work-admin-reason').value='';

    var reopen=document.querySelector('[data-work-admin-action="reopen"]');
    var returnButton=document.querySelector('[data-work-admin-action="return"]');
    if(reopen){reopen.hidden=!isApproved(item);reopen.disabled=!isApproved(item);}
    if(returnButton){returnButton.hidden=isReturned(item);returnButton.disabled=isReturned(item);}

    if(isApproved(item))status('Aprobado. Usa “Reabrir” si el coordinador debe revisarlo otra vez.','info');
    else if(isReturned(item))status('Devuelto al estudiante.','info');
    else status('Pendiente de revisión.','info');
  }

  function payload(item){
    return {
      envioId:text(item&&item.envioId),
      cedula:text(item&&item.cedula),
      numeroIdentificacion:text(item&&item.cedula),
      periodoId:text(item&&item.periodoId),
      periodo:text(item&&item.periodo),
      tipoTrabajo:TYPE
    };
  }

  function run(action){
    var item=currentStudent();
    if(!item||!isWork(item)){status('No se encontró el Trabajo de Titulación.','danger');return;}
    var data=payload(item);
    var comment=text($('ad-v2-work-admin-comment')&&$('ad-v2-work-admin-comment').value);
    var reason=text($('ad-v2-work-admin-reason')&&$('ad-v2-work-admin-reason').value);
    var endpointAction='';
    var confirmation='';

    if(action==='comment'){
      if(!comment){status('Escribe el comentario que deseas guardar.','danger');return;}
      endpointAction='ADMIN_EDITAR_COMENTARIO_TRABAJO_TITULACION';
      data.comentario=comment;
      confirmation='¿Guardar este comentario?';
    }else if(action==='reopen'){
      if(!isApproved(item)){status('Solo se puede reabrir una revisión aprobada.','danger');return;}
      if(reason.length<4){status('Escribe un motivo de al menos 4 caracteres.','danger');return;}
      endpointAction='ADMIN_REABRIR_REVISION_TRABAJO_TITULACION';
      data.motivo=reason;
      confirmation='Volverá a Pendiente de revisión y el coordinador podrá revisar y comentar nuevamente. ¿Continuar?';
    }else if(action==='return'){
      if(isReturned(item)){status('Este trabajo ya está devuelto.','info');return;}
      if(reason.length<4){status('Escribe un motivo de al menos 4 caracteres.','danger');return;}
      endpointAction='ADMIN_DEVOLVER_TRABAJO_TITULACION';
      data.motivo=reason;
      confirmation='El estudiante podrá corregir y volver a enviar. ¿Continuar?';
    }else if(action==='remove'){
      if(reason.length<4){status('Escribe un motivo de al menos 4 caracteres.','danger');return;}
      endpointAction='ADMIN_QUITAR_ENVIO_TRABAJO_TITULACION';
      data.motivo=reason;
      confirmation='Se quitará el envío activo. El respaldo quedará en el historial. ¿Continuar?';
    }else{return;}

    if(!window.confirm(confirmation))return;
    setBusy(true);
    status('Guardando...','info');
    request(endpointAction,data).then(function(result){
      status(result.mensaje||'Acción completada.','success');
      return refresh();
    }).catch(function(error){
      status(error&&error.message?error.message:String(error),'danger');
      setBusy(false);
    });
  }

  function install(){
    if(installed)return;
    installed=true;
    watchTable(0);
    document.addEventListener('click',function(event){
      var actionButton=event.target&&event.target.closest?event.target.closest('[data-work-admin-action]'):null;
      if(actionButton){event.preventDefault();event.stopPropagation();run(actionButton.getAttribute('data-work-admin-action'));return;}

      var deleteButton=event.target&&event.target.closest?event.target.closest('[data-v2-action="delete"][data-id]'):null;
      if(deleteButton){
        var item=studentById(deleteButton.getAttribute('data-id'));
        if(isWork(item)){
          event.preventDefault();event.stopPropagation();
          var detailButton=document.querySelector('[data-v2-action="detail"][data-id="'+deleteButton.getAttribute('data-id')+'"]');
          if(detailButton)detailButton.click();
          return;
        }
      }

      var detail=event.target&&event.target.closest?event.target.closest('[data-v2-action="detail"]'):null;
      if(detail)window.setTimeout(sync,0);
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window,document);
