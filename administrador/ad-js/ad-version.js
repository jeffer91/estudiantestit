/* Mantiene visible la versión y crea borradores reales mediante Microsoft Graph. */
(function(window,document){
  'use strict';

  var VERSION='3.4.3';
  var MASS_BATCH_SIZE=50;
  var OUTLOOK_COMPOSE='https://outlook.office.com/mail/deeplink/compose';
  var TENANT_STORAGE='ad-msgraph-tenant-id';
  var CLIENT_STORAGE='ad-msgraph-client-id';
  var massSession=null;
  var graphBusy=false;
  var graphBridge=window.AdminElectron&&window.AdminElectron.graph?window.AdminElectron.graph:null;

  function texto(value){return String(value===null||value===undefined?'':value).trim();}
  function normal(value){return texto(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function cedula(value){var digits=texto(value).replace(/\D/g,'');return digits.length===9?'0'+digits:digits;}
  function correoValido(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(value));}
  function errorTexto(error){return texto(error&&error.message||error)||'Ocurrió un error inesperado.';}

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

  function leerStorage(key){try{return texto(window.localStorage.getItem(key));}catch(_error){return'';}}
  function guardarStorage(key,value){try{window.localStorage.setItem(key,texto(value));}catch(_error){}}

  function configGraph(){
    var tenant=document.getElementById('ad-graph-tenant-id');
    var client=document.getElementById('ad-graph-client-id');
    return{
      tenantId:texto(tenant?tenant.value:leerStorage(TENANT_STORAGE)),
      clientId:texto(client?client.value:leerStorage(CLIENT_STORAGE))
    };
  }

  function guardarConfigGraph(){
    var config=configGraph();
    guardarStorage(TENANT_STORAGE,config.tenantId);
    guardarStorage(CLIENT_STORAGE,config.clientId);
    return config;
  }

  function configGraphCompleta(config){return Boolean(texto(config&&config.tenantId)&&texto(config&&config.clientId));}

  function estilosGraph(){
    if(document.getElementById('ad-graph-styles'))return;
    var style=document.createElement('style');
    style.id='ad-graph-styles';
    style.textContent=''+
      '.ad-graph-panel{margin:14px 0;padding:15px;border:1px solid #cfe0f5;border-radius:16px;background:#f7fbff}'+
      '.ad-graph-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}'+
      '.ad-graph-head strong{display:block;font-size:1rem}'+
      '.ad-graph-badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#e7eef8;color:#29486c;font-size:.78rem;font-weight:800}'+
      '.ad-graph-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0}'+
      '.ad-graph-grid label{display:grid;gap:6px;font-weight:700}'+
      '.ad-graph-grid input{width:100%;box-sizing:border-box}'+
      '.ad-graph-actions{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}'+
      '.ad-graph-code{font-size:1.15rem;letter-spacing:.08em;font-weight:900}'+
      '@media(max-width:760px){.ad-graph-grid{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function estadoGraph(text,kind){
    var status=document.getElementById('ad-graph-status');
    if(status){
      status.textContent=text;
      status.className='ad-result-box '+(kind||'ad-status-info');
    }
  }

  function badgeGraph(text){var badge=document.getElementById('ad-graph-badge');if(badge)badge.textContent=text;}

  function estadoModal(text,kind){
    var status=document.getElementById('ad-mail-mass-status');
    if(!status)return;
    status.textContent=text;
    status.className='ad-result-box '+(kind||'ad-status-info');
  }

  function botonMasivo(){return document.getElementById('ad-mail-mass-open');}

  function asegurarPanelGraph(){
    estilosGraph();
    var card=document.querySelector('#ad-correo-masivo-modal .ad-mail-mass-card');
    if(!card)return false;
    var intro=card.querySelector('.ad-muted');
    if(intro&&graphBridge)intro.textContent='La aplicación creará borradores reales en Outlook. Los correos institucionales y personales quedarán en CCO y ningún mensaje se enviará automáticamente.';
    if(!document.getElementById('ad-graph-panel')){
      var panel=document.createElement('section');
      panel.id='ad-graph-panel';
      panel.className='ad-graph-panel';
      panel.innerHTML=''+
        '<div class="ad-graph-head"><div><span class="ad-eyebrow">Conexión segura</span><strong>Microsoft 365 / Outlook</strong></div><span class="ad-graph-badge" id="ad-graph-badge">Sin configurar</span></div>'+
        '<p class="ad-muted">Ingresa una sola vez los identificadores de la aplicación institucional. No se solicita contraseña ni Client Secret.</p>'+
        '<div class="ad-graph-grid">'+
          '<label><span>Tenant ID</span><input id="ad-graph-tenant-id" autocomplete="off" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></label>'+
          '<label><span>Client ID</span><input id="ad-graph-client-id" autocomplete="off" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"></label>'+
        '</div>'+
        '<div class="ad-graph-actions">'+
          '<button class="ad-btn ad-btn-primary" type="button" data-action="graph-conectar">Conectar Microsoft 365</button>'+
          '<button class="ad-btn ad-btn-secondary" type="button" data-action="graph-desconectar">Cerrar sesión</button>'+
        '</div>'+
        '<pre id="ad-graph-status" class="ad-result-box ad-status-info">Configuración pendiente.</pre>';
      if(intro)intro.insertAdjacentElement('afterend',panel);else card.insertBefore(panel,card.firstChild);
      document.getElementById('ad-graph-tenant-id').value=leerStorage(TENANT_STORAGE);
      document.getElementById('ad-graph-client-id').value=leerStorage(CLIENT_STORAGE);
    }
    var button=botonMasivo();
    if(button)button.textContent=graphBridge?'✉️ Crear borradores en Outlook':'✉️ Abrir borrador en Outlook Web';
    return true;
  }

  function actualizarEstadoPrincipal(summary,result){
    var status=document.getElementById('ad-v2-title-status');
    if(!status)return;
    status.textContent='Se crearon '+result.totalDrafts+' borrador(es) reales en Outlook para '+summary.conCorreo+' estudiantes faltantes y '+result.totalRecipients+' direcciones en CCO.'+(summary.sinCorreo?' '+summary.sinCorreo+' estudiante(s) no tenían correo válido.':'');
    status.className='ad-result-box ad-status-success';
  }

  function refrescarEstadoGraph(){
    asegurarPanelGraph();
    if(!graphBridge){
      badgeGraph('Solo Electron');
      estadoGraph('La creación segura mediante Microsoft Graph está disponible al abrir el Administrador con npm start.','ad-status-info');
      return Promise.resolve();
    }
    var config=guardarConfigGraph();
    if(!configGraphCompleta(config)){
      badgeGraph('Sin configurar');
      estadoGraph('Ingresa el Tenant ID y el Client ID proporcionados por el administrador de Microsoft 365.','ad-status-info');
      return Promise.resolve();
    }
    badgeGraph('Comprobando');
    return graphBridge.status(config).then(function(result){
      if(result&&result.connected){
        badgeGraph('Conectado');
        estadoGraph('Cuenta conectada: '+(texto(result.account&&result.account.username)||texto(result.account&&result.account.name)||'Microsoft 365')+'.','ad-status-success');
      }else{
        badgeGraph('Configurado');
        estadoGraph('Configuración guardada. Pulsa “Conectar Microsoft 365” para autorizar Mail.ReadWrite.','ad-status-info');
      }
    }).catch(function(error){
      badgeGraph('Revisar datos');
      estadoGraph(errorTexto(error),'ad-status-error');
    });
  }

  function conectarGraph(){
    if(!graphBridge)return refrescarEstadoGraph();
    var config=guardarConfigGraph();
    if(!configGraphCompleta(config)){
      badgeGraph('Sin configurar');
      estadoGraph('Completa Tenant ID y Client ID antes de conectar.','ad-status-error');
      return Promise.resolve();
    }
    badgeGraph('Conectando');
    estadoGraph('Se abrirá la página oficial de Microsoft. Inicia sesión y autoriza el acceso al correo.','ad-status-info');
    return graphBridge.connect(config).then(function(result){
      badgeGraph('Conectado');
      estadoGraph('Cuenta conectada: '+(texto(result.account&&result.account.username)||texto(result.account&&result.account.name)||'Microsoft 365')+'.','ad-status-success');
    }).catch(function(error){
      badgeGraph('Error');
      estadoGraph(errorTexto(error),'ad-status-error');
    });
  }

  function desconectarGraph(){
    if(!graphBridge)return Promise.resolve();
    var config=guardarConfigGraph();
    if(!configGraphCompleta(config))return Promise.resolve();
    badgeGraph('Desconectando');
    return graphBridge.signOut(config).then(function(){
      badgeGraph('Configurado');
      estadoGraph('Sesión cerrada. Los identificadores permanecen guardados en este equipo.','ad-status-success');
    }).catch(function(error){estadoGraph(errorTexto(error),'ad-status-error');});
  }

  function crearBorradoresGraph(){
    var checkbox=document.getElementById('ad-mail-mass-confirm');
    if(!checkbox||!checkbox.checked)return Promise.resolve();
    var summary=resumenMasivo();
    if(!summary.correos.length){
      estadoModal('No se encontraron correos institucionales o personales válidos.','ad-status-error');
      return Promise.resolve();
    }
    var config=guardarConfigGraph();
    if(!configGraphCompleta(config)){
      estadoGraph('Completa Tenant ID y Client ID para crear los borradores reales.','ad-status-error');
      return Promise.resolve();
    }
    if(graphBusy)return Promise.resolve();
    graphBusy=true;
    var button=botonMasivo();
    if(button){button.disabled=true;button.textContent='Creando borradores...';}
    estadoModal('Conectando con Microsoft 365 y preparando '+summary.lotes+' borrador(es).','ad-status-info');
    var subject='Recordatorio de registro de propuestas de titulación – '+summary.periodo;
    var body=mensajeMasivo(summary.periodo,summary.carrera);
    return graphBridge.createDrafts(config,{subject:subject,body:body,batches:dividir(summary.correos,MASS_BATCH_SIZE)}).then(function(result){
      cerrarModalMasivo();
      actualizarEstadoPrincipal(summary,result);
      badgeGraph('Conectado');
    }).catch(function(error){
      estadoModal(errorTexto(error),'ad-status-error');
      estadoGraph(errorTexto(error),'ad-status-error');
    }).finally(function(){
      graphBusy=false;
      if(button){button.disabled=!(checkbox&&checkbox.checked);button.textContent='✉️ Crear borradores en Outlook';}
    });
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

  function abrirCorreo(options){window.open(enlaceOutlook(options),'_blank','noopener,noreferrer');}

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

  function resetSesionMasiva(){massSession=null;}

  function cerrarModalMasivo(){
    var modal=document.getElementById('ad-correo-masivo-modal');
    if(modal)modal.hidden=true;
    document.body.classList.remove('ad-modal-open');
  }

  function abrirIndividual(button){
    var student=estudiantePorCedula(button.getAttribute('data-cedula'));
    if(!student)return;
    var emails=correosDe(student);
    if(!emails.length){window.alert('El estudiante no tiene un correo institucional ni personal válido registrado en UTET.');return;}
    var period=periodoSeleccionado();
    abrirCorreo({to:emails,subject:'Recordatorio de registro de propuestas de titulación – '+period,body:mensajeFormal(student,period)});
  }

  function abrirMasivoWeb(){
    var checkbox=document.getElementById('ad-mail-mass-confirm');
    if(!checkbox||!checkbox.checked)return;
    var summary=resumenMasivo();
    if(!summary.correos.length)return;
    var session=prepararSesionMasiva(summary);
    var batch=session.batches[session.index];
    if(!batch){resetSesionMasiva();return;}
    copiarTexto(batch.join(';'));
    abrirCorreo({bcc:batch,subject:session.subject,body:session.body});
    session.index+=1;
    if(session.index<session.batches.length){
      var button=botonMasivo();
      if(button)button.textContent='✉️ Abrir borrador '+(session.index+1)+' de '+session.batches.length;
      estadoModal('Las direcciones del lote quedaron copiadas. Si Outlook no llena CCO, pega con Ctrl+V.','ad-status-info');
    }else{
      cerrarModalMasivo();
      resetSesionMasiva();
    }
  }

  function prepararModal(){
    resetSesionMasiva();
    asegurarPanelGraph();
    var summary=resumenMasivo();
    var open=botonMasivo();
    if(open)open.textContent=graphBridge?'✉️ Crear '+Math.max(1,summary.lotes)+' borrador(es) en Outlook':'✉️ Abrir borrador 1 de '+Math.max(1,summary.lotes);
    estadoModal(graphBridge?'Microsoft Graph guardará los borradores directamente en la carpeta Borradores de Outlook.':'Outlook Web se abrirá en tu navegador.','ad-status-info');
    refrescarEstadoGraph();
  }

  if(graphBridge&&typeof graphBridge.onDeviceCode==='function'){
    graphBridge.onDeviceCode(function(details){
      var code=texto(details&&details.userCode);
      if(code)copiarTexto(code);
      badgeGraph('Autoriza en Microsoft');
      estadoGraph((texto(details&&details.message)||'Completa el inicio de sesión en Microsoft.')+(code?' Código copiado: '+code:''),'ad-status-info');
    });
  }
  if(graphBridge&&typeof graphBridge.onProgress==='function'){
    graphBridge.onProgress(function(details){
      estadoModal('Creando borrador '+Number(details&&details.current||0)+' de '+Number(details&&details.total||0)+' con '+Number(details&&details.recipients||0)+' direcciones en CCO.','ad-status-info');
    });
  }

  window.addEventListener('click',function(event){
    var button=event.target&&event.target.closest?event.target.closest('[data-action]'):null;
    if(!button)return;
    var action=button.getAttribute('data-action');

    if(action==='correo-masivo-faltantes'){
      window.setTimeout(prepararModal,0);
      return;
    }
    if(action==='graph-conectar'||action==='graph-desconectar'){
      event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();
      if(action==='graph-conectar')conectarGraph();else desconectarGraph();
      return;
    }
    if(action!=='correo-faltante'&&action!=='abrir-correo-masivo-outlook')return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    if(action==='correo-faltante')abrirIndividual(button);
    else if(graphBridge)crearBorradoresGraph();
    else abrirMasivoWeb();
  },true);

  document.addEventListener('input',function(event){
    if(event.target&&['ad-graph-tenant-id','ad-graph-client-id'].indexOf(event.target.id)>=0){
      guardarConfigGraph();
      badgeGraph(configGraphCompleta(configGraph())?'Configurado':'Sin configurar');
    }
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
