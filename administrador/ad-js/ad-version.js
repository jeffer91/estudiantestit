/* Mantiene visible la versión y corrige la apertura de correos en Outlook. */
(function(window,document){
  'use strict';

  var VERSION='3.4.1';
  var MASS_BATCH_SIZE=50;

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

  function codificarCorreos(list){
    return list.map(function(email){return encodeURIComponent(email);}).join(',');
  }

  function enlaceMailto(options){
    options=options||{};
    var to=Array.isArray(options.to)?options.to:[];
    var bcc=Array.isArray(options.bcc)?options.bcc:[];
    var query=[];
    if(bcc.length)query.push('bcc='+codificarCorreos(bcc));
    query.push('subject='+encodeURIComponent(texto(options.subject)));
    query.push('body='+encodeURIComponent(String(options.body||'')));
    return 'mailto:'+codificarCorreos(to)+'?'+query.join('&');
  }

  function abrirCorreo(options){
    window.open(enlaceMailto(options),'_blank','noopener,noreferrer');
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

  function cerrarModalMasivo(){
    var modal=document.getElementById('ad-correo-masivo-modal');
    if(modal)modal.hidden=true;
    document.body.classList.remove('ad-modal-open');
  }

  function actualizarEstadoMasivo(summary){
    var status=document.getElementById('ad-v2-title-status');
    if(!status)return;
    status.textContent='Se prepararon '+summary.lotes+' correo(s) en Outlook para '+summary.conCorreo+' estudiantes faltantes. Los correos institucionales y personales aparecen en CCO. Revisa y presiona Enviar en Outlook.'+(summary.sinCorreo?' '+summary.sinCorreo+' estudiante(s) no tenían correo válido.':'');
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
    var subject='Recordatorio de registro de propuestas de titulación – '+summary.periodo;
    var body=mensajeMasivo(summary.periodo,summary.carrera);
    dividir(summary.correos,MASS_BATCH_SIZE).forEach(function(batch){
      abrirCorreo({bcc:batch,subject:subject,body:body});
    });
    cerrarModalMasivo();
    actualizarEstadoMasivo(summary);
  }

  window.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('[data-action]'):null;
    if(!button)return;
    var action=button.getAttribute('data-action');
    if(action!=='correo-faltante'&&action!=='abrir-correo-masivo-outlook')return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(action==='correo-faltante')abrirIndividual(button);else abrirMasivo();
  },true);

  update();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});
  window.addEventListener('load',update,{once:true});
  window.setTimeout(update,500);
  window.setTimeout(update,1500);
  window.setTimeout(update,3500);
})(window,document);
