/* Mantiene visible la versión y asegura la apertura de borradores en Outlook Web. */
(function(window,document){
  'use strict';

  var VERSION='3.4.2';
  var MASS_BATCH_SIZE=50;
  var OUTLOOK_COMPOSE='https://outlook.office.com/mail/deeplink/compose';
  var massSession=null;

  function texto(value){return String(value===null||value===undefined?'':value).trim();}
  function normal(value){return texto(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function cedula(value){var digits=texto(value).replace(/\D/g,'');return digits.length===9?'0'+digits:digits;}
  function correoValido(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(value));}

  function update(){
    var badge=document.getElementById('ad-badge-version');
    var footer=document.getElementById('ad-footer-version');
    if(badge)badge.textContent='v'+VERSION;
    if(footer)footer.textContent='Versión '+VERSION;
    document.documentElement.setAttribute('data-ad-version',VERSION);
  }

  function correosDe(student){
    var list=[
      texto(student&&student.correoInstitucional).toLowerCase(),
      texto(student&&student.correoPersonal).toLowerCase()
    ].filter(correoValido);
    return list.filter(function(item,index){return list.indexOf(item)===index;});
  }

  function periodoSeleccionado(){
    var select=document.getElementById('ad-v2-title-period');
    if(select&&select.selectedIndex>=0){
      var label=texto(select.options[select.selectedIndex]&&select.options[select.selectedIndex].textContent)
        .replace(/\s+·\s+Inactivo$/i,'');
      if(label)return label;
    }
    var data=window.ADAdminStatisticsLast||{};
    return texto(data.periodo)||'el período académico vigente';
  }

  function periodoIdSeleccionado(){
    var select=document.getElementById('ad-v2-title-period');
    return select?texto(select.value):'';
  }

  function carreraSeleccionada(){
    var select=document.getElementById('ad-v2-title-career');
    return select?texto(select.value):'';
  }

  function mensajeFormal(student,periodo){
    return [
      'Estimado/a '+(texto(student&&student.nombres)||'estudiante')+':',
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

  function enlaceOutlook(options){
    options=options||{};
    var to=Array.isArray(options.to)?options.to:[];
    var bcc=Array.isArray(options.bcc)?options.bcc:[];
    var query=[];
    if(to.length)query.push('to='+encodeURIComponent(to.join(';')));
    if(bcc.length)query.push('bcc='+encodeURIComponent(bcc.join(';')));
    query.push('subject='+encodeURIComponent(texto(options.subject)));
    query.push('body='+encodeURIComponent(String(options.body||'')+'\n'));
    return OUTLOOK_COMPOSE+'?'+query.join('&');
  }

  function abrirCorreo(options){
    window.open(enlaceOutlook(options),'_blank','noopener,noreferrer');
  }

  function copiarTexto(value){
    var area=document.createElement('textarea');
    area.value=String(value||'');
    area.setAttribute('readonly','');
    area.style.position='fixed';
    area.style.left='-9999px';
    area.style.top='0';
    document.body.appendChild(area);
    area.focus();
    area.select();
    var copied=false;
    try{copied=document.execCommand('copy');}catch(_error){copied=false;}
    document.body.removeChild(area);
    return copied;
  }

  function estudiantePorCedula(value){
    var target=cedula(value);
    var stats=window.ADAdminStatisticsLast||{};
    var global=window.ADAdminGlobalLast||{};
    return (stats.faltantes||[]).concat(global.registros||[]).find(function(item){
      return cedula(item&&item.cedula)===target;
    })||null;
  }

  function faltantesMasivos(){
    var data=window.ADAdminGlobalLast||{};
    var selectedPeriod=periodoIdSeleccionado();
    if(selectedPeriod&&texto(data.periodoId)&&texto(data.periodoId)!==selectedPeriod)return[];
    var career=carreraSeleccionada();
    return (data.registros||[]).filter(function(item){
      if(texto(item&&item.estado).toUpperCase()!=='NO_ENVIADO')return false;
      if(career&&normal(item&&item.carrera)!==normal(career))return false;
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
      periodo:periodoSeleccionado(),
      carrera:carreraSeleccionada(),
      lotes:Math.ceil(emails.length/MASS_BATCH_SIZE)
    };
  }

  function dividir(list,size){
    var groups=[];
    for(var index=0;index<list.length;index+=size)groups.push(list.slice(index,index+size));
    return groups;
  }

  function firmaResumen(summary){
    return [summary.periodo,summary.carrera,summary.correos.join('|')].join('||');
  }

  function prepararSesionMasiva(summary){
    var signature=firmaResumen(summary);
    if(!massSession||massSession.signature!==signature){
      massSession={
        signature:signature,
        batches:dividir(summary.correos,MASS_BATCH_SIZE),
        index:0,
        subject:'Recordatorio de registro de propuestas de titulación – '+summary.periodo,
        body:mensajeMasivo(summary.periodo,summary.carrera),
        summary:summary
      };
    }
    return massSession;
  }

  function estadoModal(text,kind){
    var status=document.getElementById('ad-mail-mass-status');
    if(!status)return;
    status.textContent=text;
    status.className='ad-result-box '+(kind||'ad-status-info');
  }

  function botonMasivo(){return document.getElementById('ad-mail-mass-open');}

  function resetSesionMasiva(){
    massSession=null;
    var button=botonMasivo();
    if(button)button.textContent='✉️ Abrir borrador 1';
  }

  function cerrarModalMasivo(){
    var modal=document.getElementById('ad-correo-masivo-modal');
    if(modal)modal.hidden=true;
    document.body.classList.remove('ad-modal-open');
  }

  function actualizarEstadoFinal(summary){
    var status=document.getElementById('ad-v2-title-status');
    if(!status)return;
    status.textContent='Se abrieron '+summary.lotes+' borrador(es) en Outlook Web para '+summary.conCorreo+' estudiantes faltantes. Los correos institucionales y personales fueron enviados a CCO.'+(summary.sinCorreo?' '+summary.sinCorreo+' estudiante(s) no tenían correo válido.':'');
    status.className='ad-result-box ad-status-success';
  }

  function abrirIndividual(button){
    var student=estudiantePorCedula(button.getAttribute('data-cedula'));
    if(!student)return;
    var emails=correosDe(student);
    if(!emails.length){
      window.alert('El estudiante no tiene un correo institucional ni personal válido registrado en UTET.');
      return;
    }
    var period=periodoSeleccionado();
    abrirCorreo({
      to:emails,
      subject:'Recordatorio de registro de propuestas de titulación – '+period,
      body:mensajeFormal(student,period)
    });
  }

  function abrirMasivo(){
    var checkbox=document.getElementById('ad-mail-mass-confirm');
    if(!checkbox||!checkbox.checked)return;
    var summary=resumenMasivo();
    if(!summary.correos.length){
      window.alert('No se encontraron correos institucionales o personales válidos para preparar el mensaje.');
      return;
    }

    var session=prepararSesionMasiva(summary);
    var batch=session.batches[session.index];
    if(!batch){
      resetSesionMasiva();
      return;
    }

    var current=session.index+1;
    var total=session.batches.length;
    var copied=copiarTexto(batch.join(';'));
    abrirCorreo({bcc:batch,subject:session.subject,body:session.body});
    session.index+=1;

    if(session.index<total){
      var button=botonMasivo();
      if(button)button.textContent='✉️ Abrir borrador '+(session.index+1)+' de '+total;
      estadoModal('Se abrió el borrador '+current+' de '+total+' en Outlook Web. Las direcciones de este lote '+(copied?'también quedaron copiadas.':'se enviaron en CCO.')+' Si Outlook no llena CCO, pega con Ctrl+V. Luego abre el siguiente borrador.','ad-status-success');
      return;
    }

    cerrarModalMasivo();
    actualizarEstadoFinal(summary);
    resetSesionMasiva();
  }

  window.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('[data-action]'):null;
    if(!button)return;
    var action=button.getAttribute('data-action');

    if(action==='correo-masivo-faltantes'){
      window.setTimeout(function(){
        resetSesionMasiva();
        var summary=resumenMasivo();
        var open=botonMasivo();
        if(open)open.textContent='✉️ Abrir borrador 1 de '+Math.max(1,summary.lotes);
        estadoModal('Se abrirá un borrador por cada grupo de hasta '+MASS_BATCH_SIZE+' direcciones. Outlook Web se abrirá en tu navegador.','ad-status-info');
      },0);
      return;
    }

    if(action!=='correo-faltante'&&action!=='abrir-correo-masivo-outlook')return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(action==='correo-faltante')abrirIndividual(button);else abrirMasivo();
  },true);

  document.addEventListener('change',function(event){
    if(event.target&&['ad-v2-title-period','ad-v2-title-career'].indexOf(event.target.id)>=0)resetSesionMasiva();
  },true);

  update();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});
  window.addEventListener('load',update,{once:true});
  window.setTimeout(update,500);
  window.setTimeout(update,1500);
  window.setTimeout(update,3500);
})(window,document);
