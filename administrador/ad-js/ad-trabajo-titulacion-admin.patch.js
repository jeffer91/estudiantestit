/* Acciones administrativas específicas para Trabajo de Titulación. */
(function(window,document){
  'use strict';

  var TYPE='TRABAJO_TITULACION';
  var installed=false;

  function text(value){return String(value===null||value===undefined?'':value).trim();}
  function $(id){return document.getElementById(id);}
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
  function currentStudent(){
    var id=text($('ad-v2-detail-id')&&$('ad-v2-detail-id').textContent);
    var data=window.ADAdminGlobalLast||{};
    var rows=data.registros||data.estudiantes||[];
    return rows.find(function(item){return text(item&&item.cedula)===id;})||null;
  }
  function isWork(item){return text(item&&item.tipoTrabajo).toUpperCase()===TYPE;}
  function isApproved(item){var value=text(item&&item.estado).toUpperCase();return value==='APROBADO'||value==='REEMPLAZADO';}

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
      '<h4>Administración · Trabajo de Titulación</h4>'+
      '<p class="ad-v2-work-admin__help">Puedes corregir el comentario, reabrir una aprobación realizada por error, devolver el trabajo o quitar el envío conservando trazabilidad.</p>'+
      '<label><strong>Comentario actual / corregido</strong><textarea id="ad-v2-work-admin-comment" rows="3" placeholder="Comentario del coordinador"></textarea></label>'+
      '<label><strong>Motivo administrativo</strong><textarea id="ad-v2-work-admin-reason" rows="3" placeholder="Obligatorio para reabrir, devolver o quitar"></textarea></label>'+
      '<pre id="ad-v2-work-admin-status" class="ad-result-box">Selecciona una acción administrativa.</pre>'+
      '<div class="ad-v2-work-admin__actions">'+
      '<button class="ad-btn ad-btn-secondary" type="button" data-work-admin-action="comment">Guardar comentario</button>'+
      '<button class="ad-btn ad-btn-warning" type="button" data-work-admin-action="reopen">Reabrir revisión</button>'+
      '<button class="ad-btn ad-btn-primary" type="button" data-work-admin-action="return">Devolver al estudiante</button>'+
      '<button class="ad-btn ad-btn-danger" type="button" data-work-admin-action="remove">Quitar envío</button>'+
      '</div>';
    review.insertAdjacentElement('afterend',section);

    var style=document.createElement('style');
    style.id='ad-v2-work-admin-style';
    style.textContent=''+
      '.ad-v2-work-admin{margin-top:14px;border:1px solid #dfe9f5;border-radius:14px;padding:14px;background:#fbfdff}'+
      '.ad-v2-work-admin label{display:grid;gap:7px;margin-top:11px}.ad-v2-work-admin textarea{width:100%;min-height:78px}'+
      '.ad-v2-work-admin__help{margin:4px 0 10px;color:#5b7190}.ad-v2-work-admin__actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}';
    document.head.appendChild(style);
    return true;
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
    if(reopen){reopen.hidden=!isApproved(item);reopen.disabled=!isApproved(item);}
    status(isApproved(item)
      ? 'Si la aprobación fue un error, usa “Reabrir revisión”. El coordinador volverá a verla como pendiente y podrá escribir comentarios.'
      : 'El Trabajo de Titulación está disponible para acciones administrativas.','info');
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
    if(!item||!isWork(item)){status('No se encontró un Trabajo de Titulación activo.','danger');return;}
    var data=payload(item);
    var comment=text($('ad-v2-work-admin-comment')&&$('ad-v2-work-admin-comment').value);
    var reason=text($('ad-v2-work-admin-reason')&&$('ad-v2-work-admin-reason').value);
    var endpointAction='';
    var confirmation='';

    if(action==='comment'){
      if(!comment){status('Escribe el comentario que deseas guardar.','danger');return;}
      endpointAction='ADMIN_EDITAR_COMENTARIO_TRABAJO_TITULACION';
      data.comentario=comment;
      confirmation='¿Guardar el comentario corregido?';
    }else if(action==='reopen'){
      if(reason.length<4){status('Escribe un motivo de al menos 4 caracteres para reabrir la revisión.','danger');return;}
      endpointAction='ADMIN_REABRIR_REVISION_TRABAJO_TITULACION';
      data.motivo=reason;
      confirmation='La aprobación actual quedará en el historial y el trabajo volverá a Pendiente de revisión. ¿Continuar?';
    }else if(action==='return'){
      if(reason.length<4){status('Escribe un motivo de al menos 4 caracteres para devolver.','danger');return;}
      endpointAction='ADMIN_DEVOLVER_TRABAJO_TITULACION';
      data.motivo=reason;
      confirmation='El estudiante podrá corregir y volver a enviar. ¿Devolver este Trabajo de Titulación?';
    }else if(action==='remove'){
      if(reason.length<4){status('Escribe un motivo de al menos 4 caracteres para quitar el envío.','danger');return;}
      endpointAction='ADMIN_QUITAR_ENVIO_TRABAJO_TITULACION';
      data.motivo=reason;
      confirmation='Se quitará el envío activo y el estudiante podrá registrar nuevamente. El respaldo quedará en el historial. ¿Continuar?';
    }else{return;}

    if(!window.confirm(confirmation))return;
    setBusy(true);
    status('Procesando acción administrativa...','info');
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
    document.addEventListener('click',function(event){
      var actionButton=event.target&&event.target.closest?event.target.closest('[data-work-admin-action]'):null;
      if(actionButton){event.preventDefault();event.stopPropagation();run(actionButton.getAttribute('data-work-admin-action'));return;}
      var detail=event.target&&event.target.closest?event.target.closest('[data-v2-action="detail"]'):null;
      if(detail)window.setTimeout(sync,0);
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})(window,document);
