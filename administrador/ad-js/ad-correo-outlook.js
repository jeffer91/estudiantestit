/* Recordatorios formales por Outlook para estudiantes que no han enviado títulos. */
(function(window,document){
  'use strict';

  var VERSION='3.4.0';
  var MASS_BATCH_SIZE=50;
  var massObserver=null;
  var massRefreshScheduled=false;

  function texto(value){return String(value===null||value===undefined?'':value).trim();}
  function normal(value){return texto(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function esc(value){return texto(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function cedula(value){var digits=texto(value).replace(/\D/g,'');return digits.length===9?'0'+digits:digits;}
  function correoValido(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(value));}

  function estadisticas(){return window.ADAdminStatisticsLast||{};}
  function globalTitulos(){return window.ADAdminGlobalLast||{};}
  function estudiantePorCedula(value){
    var target=cedula(value);
    return (estadisticas().faltantes||[]).find(function(item){return cedula(item.cedula)===target;})||null;
  }

  function correosDe(student){
    var list=[texto(student&&student.correoInstitucional).toLowerCase(),texto(student&&student.correoPersonal).toLowerCase()]
      .filter(correoValido);
    return list.filter(function(item,index){return list.indexOf(item)===index;});
  }

  function periodoActual(){
    var data=estadisticas();
    var select=document.getElementById('ad-estadisticas-periodo');
    if(select&&select.selectedIndex>=0){
      var label=texto(select.options[select.selectedIndex]&&select.options[select.selectedIndex].textContent);
      if(label)return label;
    }
    return texto(data.periodo)||'el período académico vigente';
  }

  function periodoTitulos(){
    var select=document.getElementById('ad-v2-title-period');
    if(select&&select.selectedIndex>=0){
      var label=texto(select.options[select.selectedIndex]&&select.options[select.selectedIndex].textContent).replace(/\s+·\s+Inactivo$/i,'');
      if(label)return label;
    }
    return 'el período académico vigente';
  }

  function periodoIdTitulos(){
    var select=document.getElementById('ad-v2-title-period');
    return select?texto(select.value):'';
  }

  function carreraTitulos(){
    var select=document.getElementById('ad-v2-title-career');
    return select?texto(select.value):'';
  }

  function mensajeFormal(student,periodo){
    return [
      'Estimado/a '+(texto(student.nombres)||'estudiante')+':',
      '',
      'Reciba un cordial saludo.',
      '',
      'Por medio del presente, le recordamos que aún no registra sus tres propuestas de titulación correspondientes al período '+periodo+'. Agradecemos ingresar a la plataforma de titulación y completar el envío a la brevedad posible.',
      '',
      'Enlace de acceso:',
      'https://titulos.pages.dev/estudiantes/estudiante',
      '',
      'En caso de haber realizado el registro recientemente, por favor omita este mensaje.',
      '',
      'Atentamente,',
      'Coordinación de Titulación',
      'ITSQMET'
    ].join('\n');
  }

  function mensajeMasivo(periodo,carrera){
    var alcance=carrera?' de la carrera '+carrera:'';
    return [
      'Estimado/a estudiante:',
      '',
      'Reciba un cordial saludo.',
      '',
      'Le recordamos que, hasta el momento, no consta el registro de sus tres propuestas de titulación correspondientes al período '+periodo+alcance+'. Solicitamos completar el envío a la brevedad posible mediante la plataforma de titulación.',
      '',
      'Enlace de acceso:',
      'https://titulos.pages.dev/estudiantes/estudiante',
      '',
      'En caso de haber realizado el registro recientemente, por favor omita este mensaje.',
      '',
      'Atentamente,',
      'Coordinación de Titulación',
      'ITSQMET'
    ].join('\n');
  }

  function abrirOutlook(student){
    var emails=correosDe(student);
    if(!emails.length){
      window.alert('El estudiante no tiene un correo institucional ni personal válido registrado en UTET.');
      return;
    }
    var period=periodoActual();
    var subject='Recordatorio de registro de propuestas de titulación – '+period;
    var body=mensajeFormal(student,period);
    var params=new URLSearchParams({to:emails.join(';'),subject:subject,body:body});
    window.open('https://outlook.office.com/mail/deeplink/compose?'+params.toString(),'_blank','noopener,noreferrer');
  }

  function faltantesMasivos(){
    var data=globalTitulos();
    var selectedPeriod=periodoIdTitulos();
    if(selectedPeriod&&texto(data.periodoId)&&texto(data.periodoId)!==selectedPeriod)return[];
    var rows=data.registros||[];
    var career=carreraTitulos();
    return rows.filter(function(item){
      if(texto(item.estado).toUpperCase()!=='NO_ENVIADO')return false;
      if(career&&normal(item.carrera)!==normal(career))return false;
      return true;
    });
  }

  function resumenMasivo(){
    var students=faltantesMasivos();
    var emails=[];
    var conCorreo=0;
    var sinCorreo=0;
    students.forEach(function(student){
      var list=correosDe(student);
      if(list.length)conCorreo+=1;else sinCorreo+=1;
      list.forEach(function(email){if(emails.indexOf(email)<0)emails.push(email);});
    });
    return{
      estudiantes:students,
      correos:emails,
      conCorreo:conCorreo,
      sinCorreo:sinCorreo,
      lotes:Math.ceil(emails.length/MASS_BATCH_SIZE),
      periodo:periodoTitulos(),
      carrera:carreraTitulos()
    };
  }

  function dividir(list,size){
    var groups=[];
    for(var index=0;index<list.length;index+=size)groups.push(list.slice(index,index+size));
    return groups;
  }

  function crearModalMasivo(){
    if(document.getElementById('ad-correo-masivo-modal'))return;
    var modal=document.createElement('section');
    modal.className='ad-v2-modal';
    modal.id='ad-correo-masivo-modal';
    modal.hidden=true;
    modal.innerHTML=''+
      '<div class="ad-v2-modal__backdrop" data-action="cerrar-correo-masivo"></div>'+
      '<div class="ad-v2-modal__card ad-mail-mass-card">'+
        '<div class="ad-v2-modal__head"><div><p class="ad-eyebrow">Recordatorio por Outlook</p><h3>Correo a estudiantes que no han enviado</h3></div><button class="ad-v2-icon" type="button" data-action="cerrar-correo-masivo" aria-label="Cerrar">✕</button></div>'+
        '<p class="ad-muted">Se prepararán borradores en Outlook. Los destinatarios irán en CCO para proteger su privacidad y ningún correo se enviará automáticamente.</p>'+
        '<div class="ad-mail-mass-grid">'+
          '<div><span>Período</span><strong id="ad-mail-mass-period">-</strong></div>'+
          '<div><span>Carrera</span><strong id="ad-mail-mass-career">Todas</strong></div>'+
          '<div><span>Estudiantes faltantes</span><strong id="ad-mail-mass-students">0</strong></div>'+
          '<div><span>Con correo válido</span><strong id="ad-mail-mass-valid">0</strong></div>'+
          '<div><span>Sin correo</span><strong id="ad-mail-mass-invalid">0</strong></div>'+
          '<div><span>Borradores</span><strong id="ad-mail-mass-batches">0</strong></div>'+
        '</div>'+
        '<label class="ad-mail-mass-field"><span>Asunto</span><input id="ad-mail-mass-subject" readonly></label>'+
        '<label class="ad-mail-mass-field"><span>Mensaje</span><textarea id="ad-mail-mass-body" readonly></textarea></label>'+
        '<label class="ad-mail-mass-confirm"><input id="ad-mail-mass-confirm" type="checkbox"> <span>Confirmo que deseo preparar los correos para todos los estudiantes faltantes de esta selección.</span></label>'+
        '<pre id="ad-mail-mass-status" class="ad-result-box">Revisa la información antes de continuar.</pre>'+
        '<div class="ad-v2-modal__foot"><button class="ad-btn ad-btn-secondary" type="button" data-action="cerrar-correo-masivo">Cancelar</button><button class="ad-btn ad-btn-primary" id="ad-mail-mass-open" type="button" data-action="abrir-correo-masivo-outlook" disabled>✉️ Abrir borradores en Outlook</button></div>'+
      '</div>';
    document.body.appendChild(modal);
  }

  function actualizarBotonMasivo(){
    var button=document.getElementById('ad-correo-masivo-btn');
    if(!button)return;
    var summary=resumenMasivo();
    var label='✉️ Correo a faltantes ('+summary.estudiantes.length+')';
    if(button.textContent!==label)button.textContent=label;
    button.disabled=!summary.estudiantes.length||!summary.correos.length;
    button.title=!summary.estudiantes.length?'No hay estudiantes con estado No enviado en esta selección.':(!summary.correos.length?'Los estudiantes faltantes no tienen correos válidos.':'Preparar recordatorio para '+summary.estudiantes.length+' estudiantes faltantes.');
  }

  function inyectarBotonMasivo(){
    var section=document.getElementById('ad-seccion-titulos');
    var head=section&&section.querySelector('.ad-section-head');
    if(!head)return false;
    var button=document.getElementById('ad-correo-masivo-btn');
    if(!button){
      button=document.createElement('button');
      button.id='ad-correo-masivo-btn';
      button.type='button';
      button.className='ad-btn ad-btn-primary';
      button.setAttribute('data-action','correo-masivo-faltantes');
      head.appendChild(button);
    }
    crearModalMasivo();
    actualizarBotonMasivo();
    return true;
  }

  function abrirModalMasivo(){
    var summary=resumenMasivo();
    if(!summary.estudiantes.length){window.alert('No hay estudiantes con estado No enviado en la selección actual.');return;}
    if(!summary.correos.length){window.alert('Los estudiantes faltantes no tienen correos válidos registrados.');return;}
    crearModalMasivo();
    document.getElementById('ad-mail-mass-period').textContent=summary.periodo;
    document.getElementById('ad-mail-mass-career').textContent=summary.carrera||'Todas';
    document.getElementById('ad-mail-mass-students').textContent=summary.estudiantes.length;
    document.getElementById('ad-mail-mass-valid').textContent=summary.conCorreo+' estudiantes · '+summary.correos.length+' direcciones únicas';
    document.getElementById('ad-mail-mass-invalid').textContent=summary.sinCorreo;
    document.getElementById('ad-mail-mass-batches').textContent=summary.lotes;
    document.getElementById('ad-mail-mass-subject').value='Recordatorio de registro de propuestas de titulación – '+summary.periodo;
    document.getElementById('ad-mail-mass-body').value=mensajeMasivo(summary.periodo,summary.carrera);
    document.getElementById('ad-mail-mass-confirm').checked=false;
    document.getElementById('ad-mail-mass-open').disabled=true;
    var status=document.getElementById('ad-mail-mass-status');
    status.textContent='Se abrirá un borrador por cada grupo de hasta '+MASS_BATCH_SIZE+' direcciones. Revisa cada borrador antes de enviarlo.';
    status.className='ad-result-box ad-status-info';
    document.getElementById('ad-correo-masivo-modal').hidden=false;
    document.body.classList.add('ad-modal-open');
  }

  function cerrarModalMasivo(){
    var modal=document.getElementById('ad-correo-masivo-modal');
    if(modal)modal.hidden=true;
    document.body.classList.remove('ad-modal-open');
  }

  function abrirBorradoresMasivos(){
    var checkbox=document.getElementById('ad-mail-mass-confirm');
    if(!checkbox||!checkbox.checked)return;
    var summary=resumenMasivo();
    if(!summary.correos.length){window.alert('No se encontraron correos válidos para preparar los borradores.');return;}
    var subject='Recordatorio de registro de propuestas de titulación – '+summary.periodo;
    var body=mensajeMasivo(summary.periodo,summary.carrera);
    dividir(summary.correos,MASS_BATCH_SIZE).forEach(function(batch){
      var params=new URLSearchParams({bcc:batch.join(';'),subject:subject,body:body});
      window.open('https://outlook.office.com/mail/deeplink/compose?'+params.toString(),'_blank','noopener,noreferrer');
    });
    cerrarModalMasivo();
    var status=document.getElementById('ad-v2-title-status');
    if(status){
      status.textContent='Se prepararon '+summary.lotes+' borrador(es) en Outlook para '+summary.conCorreo+' estudiantes faltantes. Revisa y presiona Enviar en Outlook.'+(summary.sinCorreo?' '+summary.sinCorreo+' estudiante(s) no tenían correo válido.':'');
      status.className='ad-result-box ad-status-success';
    }
  }

  function programarActualizacionMasiva(){
    if(massRefreshScheduled)return;
    massRefreshScheduled=true;
    window.setTimeout(function(){massRefreshScheduled=false;inyectarBotonMasivo();},80);
  }

  function observarInterfazMasiva(){
    if(massObserver)return;
    massObserver=new MutationObserver(programarActualizacionMasiva);
    massObserver.observe(document.body,{childList:true,subtree:true});
    programarActualizacionMasiva();
  }

  function cabecera(){
    var tbody=document.getElementById('ad-tabla-faltantes');
    var row=tbody&&tbody.closest('table')&&tbody.closest('table').querySelector('thead tr');
    if(!row)return;
    var expected='Cédula|Estudiante|Carrera|Celular|Correos|Avisos';
    if(row.getAttribute('data-ad-header')===expected)return;
    row.innerHTML='<th>Cédula</th><th>Estudiante</th><th>Carrera</th><th>Celular</th><th>Correos</th><th>Avisos</th>';
    row.setAttribute('data-ad-header',expected);
  }

  function contenidoCorreos(student){
    var institutional=texto(student&&student.correoInstitucional);
    var personal=texto(student&&student.correoPersonal);
    if(!institutional&&!personal)return '<span class="ad-muted">Sin correo</span>';
    var output=[];
    if(institutional)output.push('<small><strong>Institucional:</strong><br>'+esc(institutional)+'</small>');
    if(personal)output.push('<small><strong>Personal:</strong><br>'+esc(personal)+'</small>');
    return output.join('<br>');
  }

  function decorarFilas(){
    cabecera();
    var tbody=document.getElementById('ad-tabla-faltantes');
    if(!tbody)return;
    Array.prototype.forEach.call(tbody.querySelectorAll('tr'),function(row){
      var cells=row.querySelectorAll('td');
      if(cells.length===1){if(cells[0].getAttribute('colspan')!=='6')cells[0].setAttribute('colspan','6');return;}
      if(cells.length<5)return;
      var id=cedula(cells[0].textContent);
      var student=estudiantePorCedula(id);
      if(!student)return;

      var mailCell=row.querySelector('[data-ad-correos]');
      if(!mailCell){
        mailCell=document.createElement('td');
        mailCell.setAttribute('data-ad-correos','true');
        row.insertBefore(mailCell,cells[cells.length-1]);
      }
      var emailSignature=[texto(student.correoInstitucional),texto(student.correoPersonal)].join('|');
      if(mailCell.getAttribute('data-email-signature')!==emailSignature){
        mailCell.innerHTML=contenidoCorreos(student);
        mailCell.setAttribute('data-email-signature',emailSignature);
      }

      var actions=row.lastElementChild;
      actions.classList.add('ad-icon-actions');
      var button=actions.querySelector('[data-action="correo-faltante"]');
      if(!button){
        button=document.createElement('button');
        button.type='button';
        button.className='ad-icon-btn ad-icon-btn--email';
        button.setAttribute('data-action','correo-faltante');
        button.setAttribute('data-cedula',student.cedula);
        button.setAttribute('title','Preparar correo formal en Outlook');
        button.setAttribute('aria-label','Preparar correo formal en Outlook');
        button.textContent='✉️';
        actions.appendChild(button);
      }
      button.disabled=correosDe(student).length===0;
    });
  }

  function estilos(){
    if(document.getElementById('ad-correo-outlook-estilos'))return;
    var style=document.createElement('style');
    style.id='ad-correo-outlook-estilos';
    style.textContent=''+
      '.ad-icon-btn--email{background:#eef2ff;color:#243b8f;border-color:rgba(36,59,143,.2)}'+
      '#ad-tabla-faltantes td[data-ad-correos]{min-width:220px;line-height:1.35}'+
      '#ad-tabla-faltantes td.ad-icon-actions{display:flex;gap:7px;align-items:center}'+
      '#ad-correo-masivo-btn{white-space:nowrap}'+
      '.ad-mail-mass-card{width:min(840px,96vw)}'+
      '.ad-mail-mass-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:16px 0}'+
      '.ad-mail-mass-grid>div{background:#f6f9fd;border:1px solid #dfe9f5;border-radius:14px;padding:13px}'+
      '.ad-mail-mass-grid span{display:block;color:#5b7190;font-size:.78rem;text-transform:uppercase;margin-bottom:4px}'+
      '.ad-mail-mass-field{display:grid;gap:7px;margin-top:12px;font-weight:700}'+
      '.ad-mail-mass-field input,.ad-mail-mass-field textarea{width:100%;box-sizing:border-box}'+
      '.ad-mail-mass-field textarea{min-height:230px;resize:vertical;white-space:pre-wrap}'+
      '.ad-mail-mass-confirm{display:flex;gap:10px;align-items:flex-start;margin:16px 0;font-weight:700}'+
      '@media(max-width:760px){.ad-mail-mass-grid{grid-template-columns:1fr 1fr}}';
    document.head.appendChild(style);
  }

  function actualizarVersion(){
    var badge=document.getElementById('ad-badge-version');
    var footer=document.getElementById('ad-footer-version');
    if(badge)badge.textContent='v'+VERSION;
    if(footer)footer.textContent='Versión '+VERSION;
  }

  function iniciar(){
    estilos();
    setTimeout(actualizarVersion,0);
    setTimeout(actualizarVersion,150);
    var tbody=document.getElementById('ad-tabla-faltantes');
    if(tbody){
      new MutationObserver(decorarFilas).observe(tbody,{childList:true,subtree:true});
      decorarFilas();
    }
    observarInterfazMasiva();
    document.addEventListener('click',function(event){
      var button=event.target&&event.target.closest?event.target.closest('[data-action]'):null;
      if(!button)return;
      var action=button.getAttribute('data-action');
      if(action==='correo-faltante'){
        event.preventDefault();
        event.stopPropagation();
        var student=estudiantePorCedula(button.getAttribute('data-cedula'));
        if(student)abrirOutlook(student);
      }else if(action==='correo-masivo-faltantes'){
        event.preventDefault();
        event.stopPropagation();
        abrirModalMasivo();
      }else if(action==='cerrar-correo-masivo'){
        event.preventDefault();
        event.stopPropagation();
        cerrarModalMasivo();
      }else if(action==='abrir-correo-masivo-outlook'){
        event.preventDefault();
        event.stopPropagation();
        abrirBorradoresMasivos();
      }
    },true);
    document.addEventListener('change',function(event){
      if(event.target&&event.target.id==='ad-mail-mass-confirm'){
        var open=document.getElementById('ad-mail-mass-open');
        if(open)open.disabled=!event.target.checked;
      }
      if(event.target&&['ad-v2-title-period','ad-v2-title-career'].indexOf(event.target.id)>=0)programarActualizacionMasiva();
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})(window,document);
