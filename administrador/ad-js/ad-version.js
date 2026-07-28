/* Mantiene visible la versión y prepara correos masivos sin permisos de Microsoft 365. */
(function(window,document){
  'use strict';

  var VERSION='3.4.5';
  var MASS_BATCH_SIZE=50;
  var OUTLOOK_COMPOSE='https://outlook.office.com/mail/deeplink/compose';
  var massSession=null;
  var busy=false;
  var electronBridge=window.AdminElectron&&window.AdminElectron.isElectron?window.AdminElectron:null;

  function texto(value){return String(value===null||value===undefined?'':value).trim();}
  function normal(value){return texto(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function cedula(value){var digits=texto(value).replace(/\D/g,'');return digits.length===9?'0'+digits:digits;}
  function correoValido(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(value));}
  function errorTexto(error){return texto(error&&error.message||error)||'Ocurrió un error inesperado.';}
  function agregarUnico(list,value){if(value&&list.indexOf(value)<0)list.push(value);}

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
    var institucionales=[];
    var personales=[];
    var emails=[];
    var conCorreo=0;
    var sinCorreo=0;
    students.forEach(function(student){
      var institutional=texto(student&&student.correoInstitucional).toLowerCase();
      var personal=texto(student&&student.correoPersonal).toLowerCase();
      var tieneCorreo=false;
      if(correoValido(institutional)){
        agregarUnico(institucionales,institutional);
        agregarUnico(emails,institutional);
        tieneCorreo=true;
      }
      if(correoValido(personal)){
        agregarUnico(personales,personal);
        agregarUnico(emails,personal);
        tieneCorreo=true;
      }
      if(tieneCorreo)conCorreo+=1;else sinCorreo+=1;
    });
    return{
      estudiantes:students,
      institucionales:institucionales,
      personales:personales,
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

  function enlaceOutlook(options){
    options=options||{};
    var to=Array.isArray(options.to)?options.to:[];
    var query=[];
    if(to.length)query.push('to='+encodeURIComponent(to.join(';')));
    query.push('subject='+encodeURIComponent(texto(options.subject)));
    query.push('body='+encodeURIComponent(String(options.body||'')+'\n'));
    return OUTLOOK_COMPOSE+'?'+query.join('&');
  }

  function abrirCorreo(options){
    var url=enlaceOutlook(options);
    if(electronBridge&&electronBridge.outlook&&typeof electronBridge.outlook.openCompose==='function'){
      return electronBridge.outlook.openCompose(url);
    }
    var opened=window.open(url,'_blank','noopener,noreferrer');
    if(!opened)return Promise.reject(new Error('El navegador bloqueó la ventana de Outlook. Permite ventanas emergentes y vuelve a intentarlo.'));
    return Promise.resolve({ok:true});
  }

  function copiarConTextarea(value){
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
    if(!copied)throw new Error('No se pudieron copiar los correos al portapapeles.');
    return{ok:true};
  }

  function copiarDirecciones(list){
    var value=list.join('; ');
    if(electronBridge&&electronBridge.clipboard&&typeof electronBridge.clipboard.writeText==='function'){
      return electronBridge.clipboard.writeText(value);
    }
    if(window.navigator&&window.navigator.clipboard&&typeof window.navigator.clipboard.writeText==='function'){
      return window.navigator.clipboard.writeText(value).then(function(){return{ok:true};}).catch(function(){return copiarConTextarea(value);});
    }
    return Promise.resolve().then(function(){return copiarConTextarea(value);});
  }

  function estadoModal(text,kind){
    var status=document.getElementById('ad-mail-mass-status');
    if(!status)return;
    status.textContent=text;
    status.className='ad-result-box '+(kind||'ad-status-info');
  }

  function botonMasivo(){return document.getElementById('ad-mail-mass-open');}

  function estilosManual(){
    if(document.getElementById('ad-mail-manual-styles'))return;
    var style=document.createElement('style');
    style.id='ad-mail-manual-styles';
    style.textContent=''+
      '.ad-mail-manual-panel{margin:14px 0;padding:15px;border:1px solid #cfe0f5;border-radius:16px;background:#f7fbff}'+
      '.ad-mail-manual-panel strong{display:block;margin-bottom:8px;font-size:1rem}'+
      '.ad-mail-manual-badge{display:inline-flex;margin-bottom:8px;padding:5px 9px;border-radius:999px;background:#e8f7ee;color:#17663a;font-size:.78rem;font-weight:800}'+
      '.ad-mail-privacy-warning{margin:10px 0;padding:10px 12px;border:1px solid #edc46a;border-radius:12px;background:#fff8df;color:#664c00;font-weight:700;line-height:1.4}'+
      '.ad-mail-copy-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}'+
      '.ad-mail-copy-card{padding:12px;border:1px solid #dce8f5;border-radius:12px;background:#fff}'+
      '.ad-mail-copy-card span{display:block;margin-bottom:8px;color:#526b88;font-size:.82rem;font-weight:800}'+
      '.ad-mail-copy-card button{width:100%}'+
      '.ad-mail-address-field{display:grid;gap:7px;margin-top:10px;font-weight:800}'+
      '.ad-mail-address-field textarea{width:100%;min-height:100px;box-sizing:border-box;resize:vertical;font:500 .82rem/1.4 ui-monospace,SFMono-Regular,Consolas,monospace}'+
      '.ad-mail-manual-help{margin:10px 0 0;color:#38516e;line-height:1.45}'+
      '@media(max-width:760px){.ad-mail-copy-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function asegurarPanelManual(){
    estilosManual();
    var graph=document.getElementById('ad-graph-panel');
    if(graph)graph.remove();
    var card=document.querySelector('#ad-correo-masivo-modal .ad-mail-mass-card');
    if(!card)return false;
    var intro=card.querySelector('.ad-muted');
    if(intro)intro.textContent='No requiere permisos administrativos. Outlook se abrirá con los correos institucionales y personales colocados en el campo Para.';
    if(!document.getElementById('ad-mail-manual-panel')){
      var panel=document.createElement('section');
      panel.id='ad-mail-manual-panel';
      panel.className='ad-mail-manual-panel';
      panel.innerHTML=''+
        '<span class="ad-mail-manual-badge">Sin permisos especiales</span>'+
        '<strong>Correos disponibles para copiar</strong>'+
        '<p class="ad-mail-privacy-warning">Importante: al utilizar el campo Para, los destinatarios podrán ver las demás direcciones incluidas en el mismo borrador.</p>'+
        '<div class="ad-mail-copy-grid">'+
          '<div class="ad-mail-copy-card"><span id="ad-mail-count-institutional">Institucionales: 0</span><button class="ad-btn ad-btn-secondary" type="button" data-action="copiar-correos-institucionales">Copiar institucionales</button></div>'+
          '<div class="ad-mail-copy-card"><span id="ad-mail-count-personal">Personales: 0</span><button class="ad-btn ad-btn-secondary" type="button" data-action="copiar-correos-personales">Copiar personales</button></div>'+
          '<div class="ad-mail-copy-card"><span id="ad-mail-count-all">Todos: 0</span><button class="ad-btn ad-btn-primary" type="button" data-action="copiar-todos-correos">Copiar todos</button></div>'+
        '</div>'+
        '<label class="ad-mail-address-field"><span>Vista previa de todos los correos institucionales y personales</span><textarea id="ad-mail-address-list" readonly></textarea></label>'+
        '<p class="ad-mail-manual-help">Al abrir cada borrador, Outlook intentará colocar automáticamente las direcciones del grupo en <b>Para</b>. Como respaldo, el grupo también quedará copiado; si Outlook lo omite, haz clic en Para y presiona <b>Ctrl + V</b>.</p>';
      if(intro)intro.insertAdjacentElement('afterend',panel);else card.insertBefore(panel,card.firstChild);
    }
    return true;
  }

  function actualizarPanelCorreos(summary){
    var institutional=document.getElementById('ad-mail-count-institutional');
    var personal=document.getElementById('ad-mail-count-personal');
    var all=document.getElementById('ad-mail-count-all');
    var list=document.getElementById('ad-mail-address-list');
    if(institutional)institutional.textContent='Institucionales: '+summary.institucionales.length;
    if(personal)personal.textContent='Personales: '+summary.personales.length;
    if(all)all.textContent='Todos únicos: '+summary.correos.length;
    if(list)list.value=summary.correos.join('; ');
    var actions=[
      ['copiar-correos-institucionales',summary.institucionales],
      ['copiar-correos-personales',summary.personales],
      ['copiar-todos-correos',summary.correos]
    ];
    actions.forEach(function(entry){
      var button=document.querySelector('[data-action="'+entry[0]+'"]');
      if(button)button.disabled=!entry[1].length;
    });
  }

  function copiarLista(tipo){
    var summary=resumenMasivo();
    var list=tipo==='institucionales'?summary.institucionales:(tipo==='personales'?summary.personales:summary.correos);
    var label=tipo==='institucionales'?'institucionales':(tipo==='personales'?'personales':'institucionales y personales');
    if(!list.length){estadoModal('No hay correos '+label+' válidos en la selección actual.','ad-status-error');return;}
    copiarDirecciones(list).then(function(){
      estadoModal('Se copiaron '+list.length+' correos '+label+'. Puedes pegarlos en el campo Para con Ctrl + V.','ad-status-success');
    }).catch(function(error){estadoModal(errorTexto(error),'ad-status-error');});
  }

  function firmaResumen(summary){return[summary.periodo,summary.carrera,summary.correos.join('|')].join('||');}

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

  function resetSesionMasiva(){massSession=null;busy=false;}

  function actualizarBotonSesion(session){
    var button=botonMasivo();
    if(!button)return;
    var checkbox=document.getElementById('ad-mail-mass-confirm');
    var total=session&&session.batches?session.batches.length:0;
    var current=session?session.index+1:1;
    button.textContent='✉️ Abrir borrador '+Math.min(current,Math.max(1,total))+' de '+Math.max(1,total)+' con correos en PARA';
    button.disabled=busy||!checkbox||!checkbox.checked||!total||current>total;
  }

  function actualizarEstadoPrincipal(summary){
    var status=document.getElementById('ad-v2-title-status');
    if(!status)return;
    status.textContent='Se prepararon '+summary.lotes+' borrador(es) para '+summary.conCorreo+' estudiantes y '+summary.correos.length+' direcciones. Los correos institucionales y personales se colocaron en Para y también se copiaron como respaldo.'+(summary.sinCorreo?' '+summary.sinCorreo+' estudiante(s) no tenían correo válido.':'');
    status.className='ad-result-box ad-status-success';
  }

  function abrirIndividual(button){
    var student=estudiantePorCedula(button.getAttribute('data-cedula'));
    if(!student)return;
    var emails=correosDe(student);
    if(!emails.length){window.alert('El estudiante no tiene un correo institucional ni personal válido registrado en UTET.');return;}
    var period=periodoSeleccionado();
    abrirCorreo({to:emails,subject:'Recordatorio de registro de propuestas de titulación – '+period,body:mensajeFormal(student,period)}).catch(function(error){window.alert(errorTexto(error));});
  }

  function abrirMasivoSinPermisos(){
    var checkbox=document.getElementById('ad-mail-mass-confirm');
    if(!checkbox||!checkbox.checked||busy)return;
    var summary=resumenMasivo();
    if(!summary.correos.length){estadoModal('No se encontraron correos institucionales o personales válidos.','ad-status-error');return;}
    var session=prepararSesionMasiva(summary);
    var batch=session.batches[session.index];
    if(!batch){estadoModal('Todos los grupos ya fueron preparados. Cierra esta ventana o vuelve a abrirla para comenzar de nuevo.','ad-status-success');return;}

    busy=true;
    actualizarBotonSesion(session);
    estadoModal('Copiando '+batch.length+' direcciones y abriendo Outlook con los correos en Para...','ad-status-info');
    copiarDirecciones(batch).then(function(){
      return abrirCorreo({to:batch,subject:session.subject,body:session.body});
    }).then(function(){
      session.index+=1;
      var current=session.index;
      var total=session.batches.length;
      if(session.index<total){
        estadoModal('Grupo '+current+' de '+total+' listo. Outlook se abrió con '+batch.length+' direcciones en Para. También quedaron copiadas; si el campo aparece vacío, haz clic en Para y presiona Ctrl + V. Después vuelve aquí para abrir el siguiente borrador.','ad-status-success');
      }else{
        estadoModal('Último grupo listo. Outlook se abrió con '+batch.length+' direcciones en Para. También quedaron copiadas como respaldo.','ad-status-success');
        actualizarEstadoPrincipal(summary);
      }
    }).catch(function(error){
      estadoModal(errorTexto(error),'ad-status-error');
    }).finally(function(){
      busy=false;
      var button=botonMasivo();
      if(session.index>=session.batches.length){
        if(button){button.textContent='✓ Último borrador abierto';button.disabled=true;}
      }else{
        actualizarBotonSesion(session);
      }
    });
  }

  function prepararModal(){
    resetSesionMasiva();
    asegurarPanelManual();
    var summary=resumenMasivo();
    actualizarPanelCorreos(summary);
    var session=prepararSesionMasiva(summary);
    actualizarBotonSesion(session);
    estadoModal('Hay '+summary.institucionales.length+' correos institucionales y '+summary.personales.length+' personales ('+summary.correos.length+' únicos) en '+summary.lotes+' borrador(es). Outlook los colocará en Para.','ad-status-info');
  }

  window.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('[data-action]'):null;
    if(!button)return;
    var action=button.getAttribute('data-action');

    if(action==='correo-masivo-faltantes'){
      window.setTimeout(prepararModal,0);
      return;
    }
    if(['copiar-correos-institucionales','copiar-correos-personales','copiar-todos-correos'].indexOf(action)>=0){
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      copiarLista(action==='copiar-correos-institucionales'?'institucionales':(action==='copiar-correos-personales'?'personales':'todos'));
      return;
    }
    if(action!=='correo-faltante'&&action!=='abrir-correo-masivo-outlook')return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(action==='correo-faltante')abrirIndividual(button);else abrirMasivoSinPermisos();
  },true);

  document.addEventListener('change',function(event){
    if(event.target&&event.target.id==='ad-mail-mass-confirm'&&massSession)actualizarBotonSesion(massSession);
    if(event.target&&['ad-v2-title-period','ad-v2-title-career'].indexOf(event.target.id)>=0)resetSesionMasiva();
  },true);

  update();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});
  window.addEventListener('load',update,{once:true});
  window.setTimeout(update,500);
  window.setTimeout(update,1500);
  window.setTimeout(update,3500);
})(window,document);
