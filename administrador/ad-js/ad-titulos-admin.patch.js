/* Ajustes de Títulos del Administrador:
 * - "Aprobados" agrupa APROBADO + REEMPLAZADO, igual que Coordinadores.
 * - Permite corregir el título final desde Administrador conservando historial.
 */
(function(window,document){
  'use strict';

  if(window.ADAdminTitlesPatchV1)return;
  window.ADAdminTitlesPatchV1=true;

  var syncPending=false;
  var observer=null;
  var saving=false;

  function $(id){return document.getElementById(id);}
  function text(value){return String(value===null||value===undefined?'':value).trim();}
  function normal(value){return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function esc(value){return text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function status(value){return text(value).toUpperCase();}
  function isApproved(value){var current=status(value);return current==='APROBADO'||current==='REEMPLAZADO';}
  function statusLabel(value){var current=status(value);if(current==='REEMPLAZADO')return'Aprobado con corrección';if(current==='APROBADO')return'Aprobado';if(current==='DEVUELTO')return'Devuelto';if(current==='NO_ENVIADO')return'No enviado';return'Pendiente de revisión';}
  function statusClass(value){var current=status(value);if(current==='APROBADO'||current==='REEMPLAZADO')return'ad-badge-success';if(current==='NO_ENVIADO'||current==='DEVUELTO')return'ad-badge-warning';return'ad-badge-info';}
  function selectedPeriodLabel(){var select=$('ad-v2-title-period');if(!select||select.selectedIndex<0)return'';return text(select.options[select.selectedIndex]&&select.options[select.selectedIndex].textContent).replace(/\s+·\s+Inactivo$/i,'');}
  function selectedPeriodId(){var select=$('ad-v2-title-period');return select?text(select.value):'';}
  function selectedCareer(){var select=$('ad-v2-title-career');return select?text(select.value):'';}
  function selectedSearch(){var input=$('ad-v2-title-search');return input?normal(input.value):'';}
  function globalRows(){var data=window.ADAdminGlobalLast||{};return Array.isArray(data.registros)?data.registros:[];}
  function studentByCedula(value){var target=text(value).replace(/\D/g,'');return globalRows().find(function(item){return text(item&&item.cedula).replace(/\D/g,'')===target;})||null;}
  function currentTitle(student){
    if(!student)return'';
    var finalTitle=text(student.tituloFinal);
    if(finalTitle)return finalTitle;
    var preferred=Number(student.tituloPreferidoNumero||0);
    if(preferred>=1&&preferred<=3&&text(student['titulo'+preferred]))return text(student['titulo'+preferred]);
    return text(student.tituloPreferidoTexto||student.titulo1||student.titulo2||student.titulo3);
  }

  function installStyles(){
    if($('ad-admin-title-patch-styles'))return;
    var style=document.createElement('style');
    style.id='ad-admin-title-patch-styles';
    style.textContent=''+
      '.ad-admin-title-correction{margin-top:14px;padding:15px;border:1px solid #cfe0f5;border-radius:14px;background:#f7fbff}'+
      '.ad-admin-title-correction[hidden]{display:none}.ad-admin-title-correction label{display:grid;gap:7px;font-weight:800}'+
      '.ad-admin-title-correction textarea{width:100%;min-height:96px;box-sizing:border-box;resize:vertical;font:inherit}'+
      '.ad-admin-title-correction small{display:block;margin:8px 0 12px;color:#526b88;line-height:1.4}'+
      '.ad-admin-title-current{margin:0 0 10px;padding:10px 12px;border-radius:10px;background:#fff;border:1px solid #dce8f5;line-height:1.4}';
    document.head.appendChild(style);
  }

  function configureStatusFilter(){
    var select=$('ad-v2-title-state');
    if(!select)return false;
    var approved=select.querySelector('option[value="APROBADO"]');
    var corrected=select.querySelector('option[value="REEMPLAZADO"]');
    var correctedSelected=corrected&&corrected.selected;
    if(approved)approved.textContent='Aprobados';
    if(corrected)corrected.remove();
    if(correctedSelected&&approved)select.value='APROBADO';
    return true;
  }

  function approvedRows(){
    var career=selectedCareer();
    var search=selectedSearch();
    return globalRows().filter(function(item){
      if(!isApproved(item&&item.estado))return false;
      if(career&&normal(item&&item.carrera)!==normal(career))return false;
      if(search&&normal([item&&item.cedula,item&&item.nombres,item&&item.carrera,statusLabel(item&&item.estado)].join(' ')).indexOf(search)<0)return false;
      return true;
    });
  }

  function rowHtml(item){
    var id=esc(item&&item.cedula);
    var actions='<button class="ad-v2-icon" type="button" data-v2-action="detail" data-id="'+id+'" title="Ver detalles">👁️</button>'+
      '<button class="ad-v2-icon ad-v2-icon--danger" type="button" data-v2-action="delete" data-id="'+id+'" title="Eliminar envío">🗑️</button>';
    return '<tr><td>'+id+'</td><td>'+esc(item&&item.nombres||'Sin nombre')+'</td><td>'+esc(item&&item.carrera||'Sin carrera')+'</td><td>'+esc(selectedPeriodLabel())+'</td><td><span class="ad-badge '+statusClass(item&&item.estado)+'">'+esc(statusLabel(item&&item.estado))+'</span></td><td><div class="ad-v2-actions">'+actions+'</div></td></tr>';
  }

  function renderApprovedGroup(){
    var select=$('ad-v2-title-state');
    var body=$('ad-v2-title-body');
    if(!select||!body||select.value!=='APROBADO')return;
    var rows=approvedRows();
    var html=rows.map(rowHtml).join('')||'<tr><td colspan="6" class="ad-empty">No hay estudiantes aprobados que coincidan con los filtros.</td></tr>';
    if(body.innerHTML!==html)body.innerHTML=html;
  }

  function installCorrectionUi(){
    var modal=$('ad-v2-detail-modal');
    if(!modal)return false;
    var card=modal.querySelector('.ad-v2-modal__card');
    var returnBlock=modal.querySelector('.ad-v2-return');
    var footer=modal.querySelector('.ad-v2-modal__foot');
    if(!card||!returnBlock||!footer)return false;

    if(!$('ad-admin-title-correction')){
      var panel=document.createElement('section');
      panel.id='ad-admin-title-correction';
      panel.className='ad-admin-title-correction';
      panel.hidden=true;
      panel.innerHTML=''+
        '<strong>Corrección administrativa del título</strong>'+
        '<p class="ad-admin-title-current"><span>Título actual:</span><br><strong id="ad-admin-title-current">-</strong></p>'+
        '<label><span>Nuevo título final</span><textarea id="ad-admin-title-corrected" maxlength="600" placeholder="Escribe el título corregido"></textarea></label>'+
        '<small>Al guardar, el título anterior no se elimina: quedará registrado en el historial de resoluciones y el estado pasará a “Aprobado con corrección”.</small>'+
        '<button class="ad-btn ad-btn-primary" type="button" data-admin-title-action="save-correction">Guardar corrección</button>';
      card.insertBefore(panel,returnBlock);
    }

    if(!$('ad-admin-title-toggle')){
      var button=document.createElement('button');
      button.id='ad-admin-title-toggle';
      button.className='ad-btn ad-btn-secondary';
      button.type='button';
      button.setAttribute('data-admin-title-action','toggle-correction');
      button.textContent='✏️ Corregir título';
      var deleteButton=footer.querySelector('[data-v2-action="delete-detail"]');
      footer.insertBefore(button,deleteButton||footer.firstChild);
    }
    return true;
  }

  function syncCorrectionModal(){
    if(!installCorrectionUi())return;
    var modal=$('ad-v2-detail-modal');
    var button=$('ad-admin-title-toggle');
    var panel=$('ad-admin-title-correction');
    if(!modal||!button||!panel||modal.hidden)return;
    var student=studentByCedula(text($('ad-v2-detail-id')&&$('ad-v2-detail-id').textContent));
    var allowed=Boolean(student&&isApproved(student.estado)&&currentTitle(student));
    button.hidden=!allowed;
    if(!allowed){panel.hidden=true;panel.removeAttribute('data-cedula');return;}

    var current=currentTitle(student);
    var cedula=text(student.cedula);
    var currentLabel=$('ad-admin-title-current');
    var input=$('ad-admin-title-corrected');
    if(currentLabel)currentLabel.textContent=current;
    if(panel.getAttribute('data-cedula')!==cedula){
      panel.setAttribute('data-cedula',cedula);
      panel.hidden=true;
      if(input)input.value=current;
    }
  }

  function toggleCorrection(){
    syncCorrectionModal();
    var panel=$('ad-admin-title-correction');
    var input=$('ad-admin-title-corrected');
    if(!panel)return;
    panel.hidden=!panel.hidden;
    if(!panel.hidden&&input){input.focus();input.setSelectionRange(input.value.length,input.value.length);}
  }

  function setDetailStatus(message,type){
    var box=$('ad-v2-detail-status');
    if(!box)return;
    box.textContent=message;
    box.className='ad-result-box ad-status-'+(type||'info');
  }

  function refreshAfterCorrection(cedula,corrected){
    var titlePeriod=$('ad-v2-title-period');
    if(titlePeriod)titlePeriod.dispatchEvent(new Event('change',{bubbles:true}));
    var attempts=0;
    var timer=window.setInterval(function(){
      attempts+=1;
      var updated=studentByCedula(cedula);
      var ready=updated&&status(updated.estado)==='REEMPLAZADO'&&normal(currentTitle(updated))===normal(corrected);
      if(!ready&&attempts<24)return;
      window.clearInterval(timer);
      renderApprovedGroup();
      var statPeriod=$('ad-v2-stat-period');
      if(statPeriod){
        var period=selectedPeriodId();
        if(period)statPeriod.value=period;
        statPeriod.dispatchEvent(new Event('change',{bubbles:true}));
      }
    },250);
  }

  function saveCorrection(){
    if(saving)return;
    var cedula=text($('ad-v2-detail-id')&&$('ad-v2-detail-id').textContent);
    var student=studentByCedula(cedula);
    if(!student||!isApproved(student.estado)){
      setDetailStatus('Solo se puede corregir un título que ya esté aprobado.','danger');
      return;
    }
    var current=currentTitle(student);
    var input=$('ad-admin-title-corrected');
    var corrected=text(input&&input.value).replace(/\s+/g,' ');
    if(corrected.length<10){setDetailStatus('Escribe un título corregido válido.','danger');return;}
    if(normal(corrected)===normal(current)){setDetailStatus('El título corregido es igual al título actual. No hay cambios para guardar.','danger');return;}
    if(!window.confirm('¿Guardar la corrección del título de '+(student.nombres||student.cedula)+'? El título anterior quedará en el historial.'))return;

    var api=window.ADAPIService;
    if(!api||typeof api.devolverTitulo!=='function'){
      setDetailStatus('No está disponible el servicio para guardar la corrección.','danger');
      return;
    }

    saving=true;
    var saveButton=document.querySelector('[data-admin-title-action="save-correction"]');
    if(saveButton)saveButton.disabled=true;
    setDetailStatus('Guardando corrección del título...','info');
    var periodId=selectedPeriodId();
    var periodLabel=selectedPeriodLabel();
    Promise.resolve(api.devolverTitulo({
      envioId:student.envioId,
      cedula:student.cedula,
      numeroIdentificacion:student.cedula,
      periodoId:periodId,
      periodoLabel:periodLabel,
      periodo:periodLabel||periodId,
      tipoTrabajo:student.tipoTrabajo,
      estudiante:student.nombres,
      nombres:student.nombres,
      carrera:student.carrera,
      coordinador:'Administrador de Titulación',
      nombreCoordinador:'Administrador de Titulación',
      estado:'REEMPLAZADO',
      estadoFinal:'REEMPLAZADO',
      tituloElegido:current,
      tituloCorregido:corrected,
      observacion:'Corrección del título final realizada desde Administrador.',
      comentario:'Corrección del título final realizada desde Administrador.',
      comentarioCoordinador:'Corrección del título final realizada desde Administrador.',
      fechaResolucion:new Date().toISOString()
    })).then(function(result){
      var close=($('ad-v2-detail-modal')||document).querySelector('[data-v2-action="close-detail"]');
      if(close)close.click();
      var titleStatus=$('ad-v2-title-status');
      if(titleStatus){titleStatus.textContent=result&&result.mensaje||'Título corregido correctamente.';titleStatus.className='ad-result-box ad-status-success';}
      refreshAfterCorrection(student.cedula,corrected);
    }).catch(function(error){
      setDetailStatus(text(error&&error.message||error)||'No se pudo guardar la corrección del título.','danger');
    }).finally(function(){
      saving=false;
      if(saveButton)saveButton.disabled=false;
    });
  }

  function sync(){
    syncPending=false;
    installStyles();
    configureStatusFilter();
    installCorrectionUi();
    renderApprovedGroup();
    syncCorrectionModal();
  }

  function scheduleSync(){
    if(syncPending)return;
    syncPending=true;
    window.setTimeout(sync,0);
  }

  document.addEventListener('click',function(event){
    var actionButton=event.target&&event.target.closest?event.target.closest('[data-admin-title-action]'):null;
    if(actionButton){
      var action=actionButton.getAttribute('data-admin-title-action');
      if(action==='toggle-correction'){event.preventDefault();toggleCorrection();return;}
      if(action==='save-correction'){event.preventDefault();saveCorrection();return;}
    }
    var detailButton=event.target&&event.target.closest?event.target.closest('[data-v2-action="detail"]'):null;
    if(detailButton)window.setTimeout(syncCorrectionModal,0);
  },true);

  document.addEventListener('change',function(event){
    if(event.target&&['ad-v2-title-state','ad-v2-title-career'].indexOf(event.target.id)>=0)window.setTimeout(renderApprovedGroup,0);
  },true);
  document.addEventListener('input',function(event){
    if(event.target&&event.target.id==='ad-v2-title-search')window.setTimeout(renderApprovedGroup,0);
  },true);

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scheduleSync,{once:true});else scheduleSync();
  window.addEventListener('load',scheduleSync,{once:true});
  observer=new MutationObserver(scheduleSync);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
  [100,300,600,1000,1800,3000].forEach(function(delay){window.setTimeout(scheduleSync,delay);});
})(window,document);
