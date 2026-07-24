/*
Archivo: administrador/ad-js/ad-administracion-global.js
Función:
- Administrar todos los períodos y controlar cuáles ve Coordinadores.
- Asignar carreras a coordinadores desde la carrera.
- Mostrar la lista global del período, incluido NO_ENVIADO.
- Calcular estadísticas desde la misma lista global.
*/
(function(window,document){
  'use strict';

  var VERSION='3.3.0';
  var state={periodos:[],carreras:[],coordinadores:[],global:null,estadisticas:null,detalle:null};

  function api(){return window.ADAPIService;}
  function $(id){return document.getElementById(id);}
  function texto(value){return String(value===null||value===undefined?'':value).trim();}
  function normal(value){return texto(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function esc(value){return texto(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function cedula(value){var digits=texto(value).replace(/\D/g,'');return digits.length===9?'0'+digits:digits;}
  function message(error){return error&&error.message?error.message:texto(error)||'Error desconocido.';}
  function option(value,label,selected){return '<option value="'+esc(value)+'"'+(selected?' selected':'')+'>'+esc(label)+'</option>';}
  function setStatus(id,value,type){var el=$(id);if(!el)return;el.textContent=value||'';el.className='ad-result-box ad-status-'+(type||'info');}
  function busy(active,value){var el=$('ad-loading');if(el){el.hidden=!active;el.textContent=value||'Procesando...';}}
  function formatDate(value){if(!texto(value))return'-';var date=new Date(value);return Number.isNaN(date.getTime())?texto(value):date.toLocaleString('es-EC',{dateStyle:'medium',timeStyle:'short'});}
  function periodLabel(id){var item=state.periodos.find(function(p){return texto(p.id||p.periodoId)===texto(id);});return item&&texto(item.label||item.periodoLabel)||texto(id);}
  function selectedPeriod(id){var el=$(id);return el?texto(el.value):'';}
  function statusLabel(value){var status=texto(value).toUpperCase();if(status==='NO_ENVIADO')return'No enviado';if(status==='APROBADO')return'Aprobado';if(status==='REEMPLAZADO')return'Aprobado con corrección';if(status==='DEVUELTO')return'Devuelto';return'Pendiente de revisión';}
  function statusClass(value){var status=texto(value).toUpperCase();if(status==='NO_ENVIADO')return'ad-badge-warning';if(status==='APROBADO'||status==='REEMPLAZADO')return'ad-badge-success';if(status==='DEVUELTO')return'ad-badge-warning';return'ad-badge-info';}

  function styles(){
    if($('ad-global-v2-styles'))return;
    var style=document.createElement('style');
    style.id='ad-global-v2-styles';
    style.textContent=''+
      '.ad-v2-actions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.ad-v2-select{min-width:210px}'+
      '.ad-v2-period-actions{display:flex;gap:6px;flex-wrap:wrap}.ad-v2-inline-status{font-size:.86rem;color:#536b8b}'+
      '.ad-v2-toolbar{display:grid;grid-template-columns:1.15fr 1.35fr 1fr 1.2fr;gap:12px;align-items:end;margin-bottom:15px}'+
      '.ad-v2-toolbar--stats{grid-template-columns:1fr 1fr auto}.ad-v2-toolbar label{display:grid;gap:7px;font-weight:700}'+
      '.ad-v2-icon{width:45px;height:45px;border-radius:13px;border:1px solid #d4e1f2;background:#eef5ff;font-size:1.15rem;cursor:pointer}'+
      '.ad-v2-icon--danger{background:#fff0ee;border-color:#f3b6ad}.ad-v2-icon--wa{background:#e8f8ef;border-color:#a7dfba}.ad-v2-icon--mail{background:#eef0ff;border-color:#bfc7f3}'+
      '.ad-v2-icon:disabled{opacity:.38;cursor:not-allowed}.ad-v2-modal[hidden]{display:none}.ad-v2-modal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;padding:20px}'+
      '.ad-v2-modal__backdrop{position:absolute;inset:0;background:rgba(4,24,52,.58)}.ad-v2-modal__card{position:relative;width:min(920px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:22px;padding:24px;box-shadow:0 30px 80px rgba(7,31,65,.3)}'+
      '.ad-v2-modal__head,.ad-v2-modal__foot{display:flex;justify-content:space-between;gap:12px;align-items:center}.ad-v2-modal__foot{justify-content:flex-end;margin-top:18px}'+
      '.ad-v2-detail{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:18px 0}.ad-v2-detail div,.ad-v2-review{background:#f6f9fd;border:1px solid #dfe9f5;border-radius:14px;padding:13px}.ad-v2-detail span,.ad-v2-review span{display:block;color:#5b7190;font-size:.8rem;text-transform:uppercase}'+
      '.ad-v2-proposals{display:grid;gap:10px}.ad-v2-proposal{border:1px solid #d8e3f1;border-radius:15px;padding:14px}.ad-v2-proposal.is-favorite{border-color:#d6ac43;background:#fffaf0}.ad-v2-review{margin-top:14px}.ad-v2-review-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}'+
      '.ad-v2-return{margin-top:14px}.ad-v2-return textarea{width:100%;min-height:90px}.ad-v2-stat-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:14px;margin:16px 0}.ad-v2-stat{background:#f7f9fc;border:1px solid #dce6f2;border-radius:16px;padding:16px}.ad-v2-stat strong{display:block;font-size:2rem;margin-top:6px}'+
      '@media(max-width:900px){.ad-v2-toolbar,.ad-v2-toolbar--stats{grid-template-columns:1fr 1fr}.ad-v2-detail,.ad-v2-review-grid{grid-template-columns:1fr 1fr}.ad-v2-stat-grid{grid-template-columns:1fr 1fr}}';
    document.head.appendChild(style);
  }

  function replaceSections(){
    var nav=[].slice.call(document.querySelectorAll('[data-ad-view-target]'));
    nav.forEach(function(link){if(link.getAttribute('data-ad-view-target')==='ad-seccion-carreras')link.textContent='Carreras';});

    var periods=$('ad-seccion-periodos');
    if(periods)periods.innerHTML=''+
      '<div class="ad-section-head"><div><p class="ad-eyebrow">Firebase Títulos</p><h3>Períodos académicos</h3><p class="ad-muted">Activa o desactiva los períodos que aparecerán en Coordinadores. Solo uno puede ser principal.</p></div><button class="ad-btn ad-btn-primary" type="button" data-v2-action="reload-periods">Actualizar</button></div>'+
      '<div class="ad-card"><pre id="ad-v2-period-status" class="ad-result-box">Cargando catálogo completo...</pre><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Período</th><th>Estudiantes</th><th>Envíos</th><th>Estado</th><th>Principal</th><th>Acciones</th></tr></thead><tbody id="ad-v2-period-body"></tbody></table></div></div>';

    var careers=$('ad-seccion-carreras');
    if(careers)careers.innerHTML=''+
      '<div class="ad-section-head"><div><p class="ad-eyebrow">Firebase Títulos</p><h3>Carreras</h3><p class="ad-muted">Asigna cada carrera a un coordinador. El cambio se guarda automáticamente.</p></div><button class="ad-btn ad-btn-primary" type="button" data-v2-action="reload-careers">Actualizar</button></div>'+
      '<div class="ad-card"><pre id="ad-v2-career-status" class="ad-result-box">Cargando carreras y coordinadores...</pre><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Código</th><th>Carrera</th><th>Coordinador asignado</th><th>Estado</th></tr></thead><tbody id="ad-v2-career-body"></tbody></table></div></div>';

    var titles=$('ad-seccion-titulos');
    if(titles)titles.innerHTML=''+
      '<div class="ad-section-head"><div><p class="ad-eyebrow">UTET + Firebase Títulos</p><h3>Lista global de estudiantes</h3><p class="ad-muted">Incluye a todos los estudiantes del período y distingue quienes todavía no han enviado.</p></div></div>'+
      '<div class="ad-card"><div class="ad-v2-toolbar"><label><span>Período</span><select id="ad-v2-title-period"></select></label><label><span>Carrera</span><select id="ad-v2-title-career"><option value="">Todas</option></select></label><label><span>Estado</span><select id="ad-v2-title-state"><option value="">Todos</option><option value="NO_ENVIADO">No enviado</option><option value="PENDIENTE_REVISION">Pendiente de revisión</option><option value="APROBADO">Aprobado</option><option value="REEMPLAZADO">Aprobado con corrección</option><option value="DEVUELTO">Devuelto</option></select></label><label><span>Buscar</span><input id="ad-v2-title-search" placeholder="Cédula o nombre"></label></div><pre id="ad-v2-title-status" class="ad-result-box">Selecciona un período.</pre><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Cédula</th><th>Estudiante</th><th>Carrera</th><th>Período</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="ad-v2-title-body"></tbody></table></div></div>';

    var stats=$('ad-seccion-estadisticas');
    if(stats)stats.innerHTML=''+
      '<div class="ad-section-head"><div><p class="ad-eyebrow">Misma lista global</p><h3>Estadísticas por carrera</h3><p class="ad-muted">Esperados, enviados y faltantes se calculan desde la población del período, sin sumar registros ajenos.</p></div></div>'+
      '<div class="ad-card"><div class="ad-v2-toolbar ad-v2-toolbar--stats"><label><span>Período</span><select id="ad-v2-stat-period"></select></label><label><span>Carrera</span><select id="ad-v2-stat-career"><option value="">Todas</option></select></label><button class="ad-btn ad-btn-primary" type="button" data-v2-action="load-stats">Actualizar estadísticas</button></div><pre id="ad-v2-stat-status" class="ad-result-box">Selecciona un período.</pre><div class="ad-v2-stat-grid"><article class="ad-v2-stat"><span>Esperados</span><strong id="ad-v2-stat-expected">0</strong></article><article class="ad-v2-stat"><span>Enviados</span><strong id="ad-v2-stat-sent">0</strong></article><article class="ad-v2-stat"><span>Faltan</span><strong id="ad-v2-stat-missing">0</strong></article><article class="ad-v2-stat"><span>Aprobados</span><strong id="ad-v2-stat-approved">0</strong></article><article class="ad-v2-stat"><span>Avance</span><strong id="ad-v2-stat-progress">0 %</strong></article></div><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Carrera</th><th>Esperados</th><th>Enviados</th><th>Faltan</th><th>Pendientes</th><th>Aprobados</th><th>Devueltos</th><th>Avance</th></tr></thead><tbody id="ad-v2-stat-body"></tbody></table></div><p class="ad-v2-inline-status" id="ad-v2-outside"></p></div>';

    var coordinatorCareer=$('ad-coordinador-carreras');
    if(coordinatorCareer&&coordinatorCareer.closest('label'))coordinatorCareer.closest('label').hidden=true;
    var assignmentForm=$('ad-form-asignacion');
    if(assignmentForm&&assignmentForm.closest('.ad-card'))assignmentForm.closest('.ad-card').hidden=true;

    createModals();
  }

  function createModals(){
    var oldTitle=$('ad-modal-titulo');if(oldTitle)oldTitle.remove();
    var oldMissing=$('ad-modal-faltantes');if(oldMissing)oldMissing.remove();
    var wrapper=document.createElement('div');
    wrapper.innerHTML=''+
      '<section class="ad-v2-modal" id="ad-v2-detail-modal" hidden><div class="ad-v2-modal__backdrop" data-v2-action="close-detail"></div><div class="ad-v2-modal__card"><div class="ad-v2-modal__head"><div><p class="ad-eyebrow">Detalle del registro</p><h3 id="ad-v2-detail-name">Estudiante</h3></div><button class="ad-v2-icon" type="button" data-v2-action="close-detail">✕</button></div><div class="ad-v2-detail"><div><span>Cédula</span><strong id="ad-v2-detail-id">-</strong></div><div><span>Carrera</span><strong id="ad-v2-detail-career">-</strong></div><div><span>Período</span><strong id="ad-v2-detail-period">-</strong></div><div><span>Fecha de envío</span><strong id="ad-v2-detail-date">-</strong></div></div><div class="ad-v2-proposals" id="ad-v2-proposals"></div><div class="ad-v2-review"><h4>Revisión del coordinador</h4><div class="ad-v2-review-grid"><div><span>Estado</span><strong id="ad-v2-detail-state">-</strong></div><div><span>Coordinador</span><strong id="ad-v2-detail-coordinator">-</strong></div><div><span>Título final</span><strong id="ad-v2-detail-final">-</strong></div><div><span>Fecha de resolución</span><strong id="ad-v2-detail-resolution-date">-</strong></div><div><span>Observación</span><strong id="ad-v2-detail-observation">-</strong></div></div></div><div class="ad-v2-return"><label><strong>Motivo para devolver</strong><textarea id="ad-v2-return-reason" placeholder="Escribe una observación de al menos 4 caracteres"></textarea></label><pre id="ad-v2-detail-status" class="ad-result-box">Puedes devolver o eliminar el envío.</pre></div><div class="ad-v2-modal__foot"><button class="ad-btn ad-btn-secondary" type="button" data-v2-action="close-detail">Cerrar</button><button class="ad-btn ad-btn-danger" type="button" data-v2-action="delete-detail">🗑️ Eliminar</button><button class="ad-btn ad-btn-primary" type="button" data-v2-action="return-detail">↩️ Devolver</button></div></div></section>'+
      '<section class="ad-v2-modal" id="ad-v2-missing-modal" hidden><div class="ad-v2-modal__backdrop" data-v2-action="close-missing"></div><div class="ad-v2-modal__card"><div class="ad-v2-modal__head"><div><p class="ad-eyebrow">Estudiantes pendientes</p><h3 id="ad-v2-missing-title">No enviados</h3></div><button class="ad-v2-icon" type="button" data-v2-action="close-missing">✕</button></div><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Cédula</th><th>Estudiante</th><th>Carrera</th><th>Celular</th><th>Avisos</th></tr></thead><tbody id="ad-v2-missing-body"></tbody></table></div><div class="ad-v2-modal__foot"><button class="ad-btn ad-btn-secondary" type="button" data-v2-action="close-missing">Cerrar</button></div></div></section>';
    while(wrapper.firstChild)document.body.appendChild(wrapper.firstChild);
  }

  function openModal(id){var modal=$(id);if(modal)modal.hidden=false;document.body.classList.add('ad-modal-open');}
  function closeModal(id){var modal=$(id);if(modal)modal.hidden=true;document.body.classList.remove('ad-modal-open');}

  function renderPeriods(){
    var body=$('ad-v2-period-body');if(!body)return;
    body.innerHTML=state.periodos.map(function(period){return '<tr><td><strong>'+esc(period.label||period.periodoLabel||period.id)+'</strong><br><small>'+esc(period.id)+'</small></td><td>'+Number(period.estudiantes||0)+'</td><td>'+Number(period.envios||0)+'</td><td><span class="ad-badge '+(period.activo?'ad-badge-success':'ad-badge-warning')+'">'+(period.activo?'Activo':'Inactivo')+'</span></td><td>'+(period.principal?'<span class="ad-badge ad-badge-info">Principal</span>':'-')+'</td><td><div class="ad-v2-period-actions"><button class="ad-btn '+(period.activo?'ad-btn-danger':'ad-btn-primary')+'" type="button" data-v2-action="toggle-period" data-id="'+esc(period.id)+'">'+(period.activo?'Desactivar':'Activar')+'</button><button class="ad-btn ad-btn-secondary" type="button" data-v2-action="principal-period" data-id="'+esc(period.id)+'" '+(period.principal?'disabled':'')+'>⭐ Principal</button></div></td></tr>';}).join('')||'<tr><td colspan="6" class="ad-empty">No se encontraron períodos.</td></tr>';
    fillPeriodSelects();
  }

  function fillPeriodSelects(){
    var principal=state.periodos.find(function(p){return p.principal;})||state.periodos.find(function(p){return p.activo;})||state.periodos[0];
    ['ad-v2-title-period','ad-v2-stat-period'].forEach(function(id){var select=$(id);if(!select)return;var previous=texto(select.value);select.innerHTML=state.periodos.map(function(p){return option(p.id,p.label+(p.activo?'':' · Inactivo'),false);}).join('');if(previous&&state.periodos.some(function(p){return p.id===previous;}))select.value=previous;else if(principal)select.value=principal.id;});
  }

  function loadPeriods(){
    setStatus('ad-v2-period-status','Cargando períodos...','info');
    return api().listarPeriodosAdmin().then(function(result){state.periodos=result.periodos||result.registros||[];renderPeriods();setStatus('ad-v2-period-status','Se muestran períodos activos e inactivos. Coordinadores verá únicamente los activos.','success');return result;}).catch(function(error){setStatus('ad-v2-period-status',message(error),'danger');throw error;});
  }

  function changePeriod(id,kind){
    var period=state.periodos.find(function(item){return item.id===id;});if(!period)return;
    busy(true,'Actualizando período...');
    var payload={periodoId:period.id,documentId:period.documentId,label:period.label};
    if(kind==='principal')payload.principal=true;else payload.activo=!period.activo;
    api().guardarPeriodoAdmin(payload).then(function(result){setStatus('ad-v2-period-status',result.mensaje||'Período actualizado.','success');return loadPeriods();}).then(function(){return loadGlobal();}).catch(function(error){setStatus('ad-v2-period-status',message(error),'danger');}).finally(function(){busy(false);});
  }

  function renderCareers(){
    var body=$('ad-v2-career-body');if(!body)return;
    var activeCoordinators=state.coordinadores.filter(function(item){return item.activo!==false&&texto(item.estado||'ACTIVO').toUpperCase()!=='INACTIVO';});
    body.innerHTML=state.carreras.map(function(career){var selects='<option value="">Sin asignar</option>'+activeCoordinators.map(function(coordinator){var id=texto(coordinator.id||coordinator.coordinadorId);var name=texto(coordinator.nombre||coordinator.coordinador);return option(id,name,id===career.coordinadorId);}).join('');return '<tr><td>'+esc(career.codigo||career.id)+'</td><td><strong>'+esc(career.nombre)+'</strong></td><td><select class="ad-v2-select" data-v2-career-select="'+esc(career.id)+'">'+selects+'</select></td><td><span class="ad-badge '+(career.activo?'ad-badge-success':'ad-badge-warning')+'">'+(career.activo?'Activa':'Inactiva')+'</span></td></tr>';}).join('')||'<tr><td colspan="4" class="ad-empty">No se encontraron carreras.</td></tr>';
    fillCareerFilters();
  }

  function fillCareerFilters(){
    var names=[];(state.global&&state.global.registros||[]).forEach(function(item){if(item.carrera&&names.indexOf(item.carrera)<0)names.push(item.carrera);});if(!names.length)state.carreras.forEach(function(item){if(item.nombre&&names.indexOf(item.nombre)<0)names.push(item.nombre);});names.sort(function(a,b){return a.localeCompare(b,'es');});['ad-v2-title-career','ad-v2-stat-career'].forEach(function(id){var select=$(id);if(!select)return;var previous=texto(select.value);select.innerHTML='<option value="">Todas</option>'+names.map(function(name){return option(name,name,false);}).join('');if(previous&&names.indexOf(previous)>=0)select.value=previous;});
  }

  function loadCareers(){
    setStatus('ad-v2-career-status','Cargando carreras y coordinadores...','info');
    return Promise.all([api().listarCarrerasAdmin(),api().listarCoordinadores()]).then(function(results){state.carreras=results[0].carreras||results[0].registros||[];state.coordinadores=results[1].coordinadores||results[1].registros||[];renderCareers();setStatus('ad-v2-career-status','Selecciona un coordinador para guardar automáticamente la asignación.','success');}).catch(function(error){setStatus('ad-v2-career-status',message(error),'danger');throw error;});
  }

  function assignCareer(careerId,coordinatorId){
    busy(true,'Guardando asignación...');
    api().asignarCarreraCoordinador({carreraId:careerId,coordinadorId:coordinatorId}).then(function(result){setStatus('ad-v2-career-status',result.mensaje||'Asignación guardada.','success');return loadCareers();}).catch(function(error){setStatus('ad-v2-career-status',message(error),'danger');}).finally(function(){busy(false);});
  }

  function loadGlobal(){
    var period=selectedPeriod('ad-v2-title-period');if(!period)return Promise.resolve();
    setStatus('ad-v2-title-status','Cargando estudiantes del período...','info');busy(true,'Construyendo lista global...');
    return api().listarTitulosGlobal({periodoId:period,periodo:period}).then(function(result){state.global=result;window.ADAdminGlobalLast=result;renderGlobal();setStatus('ad-v2-title-status',result.mensaje||'Lista global cargada.','success');return result;}).catch(function(error){setStatus('ad-v2-title-status',message(error),'danger');throw error;}).finally(function(){busy(false);});
  }

  function filteredGlobal(){
    var rows=state.global&&state.global.registros||[];var career=texto($('ad-v2-title-career')&&$('ad-v2-title-career').value);var status=texto($('ad-v2-title-state')&&$('ad-v2-title-state').value);var search=normal($('ad-v2-title-search')&&$('ad-v2-title-search').value);return rows.filter(function(item){if(career&&normal(item.carrera)!==normal(career))return false;if(status&&item.estado!==status)return false;if(search&&normal([item.cedula,item.nombres,item.carrera,item.estado].join(' ')).indexOf(search)<0)return false;return true;});
  }

  function renderGlobal(){
    fillCareerFilters();var body=$('ad-v2-title-body');if(!body)return;
    body.innerHTML=filteredGlobal().map(function(item){var actions=item.estado==='NO_ENVIADO'?'<button class="ad-v2-icon ad-v2-icon--wa" type="button" data-v2-action="whatsapp" data-id="'+esc(item.cedula)+'" title="Preparar WhatsApp" '+(item.celular?'':'disabled')+'>💬</button><button class="ad-v2-icon ad-v2-icon--mail" type="button" data-v2-action="email" data-id="'+esc(item.cedula)+'" title="Preparar correo en Outlook" '+((item.correoInstitucional||item.correoPersonal)?'':'disabled')+'>✉️</button>':'<button class="ad-v2-icon" type="button" data-v2-action="detail" data-id="'+esc(item.cedula)+'" title="Ver detalles">👁️</button><button class="ad-v2-icon ad-v2-icon--danger" type="button" data-v2-action="delete" data-id="'+esc(item.cedula)+'" title="Eliminar envío">🗑️</button>';return '<tr><td>'+esc(item.cedula)+'</td><td>'+esc(item.nombres||'Sin nombre')+'</td><td>'+esc(item.carrera||'Sin carrera')+'</td><td>'+esc(periodLabel(selectedPeriod('ad-v2-title-period')))+'</td><td><span class="ad-badge '+statusClass(item.estado)+'">'+esc(statusLabel(item.estado))+'</span></td><td><div class="ad-v2-actions">'+actions+'</div></td></tr>';}).join('')||'<tr><td colspan="6" class="ad-empty">No hay estudiantes que coincidan con los filtros.</td></tr>';
  }

  function globalStudent(id){return (state.global&&state.global.registros||[]).find(function(item){return item.cedula===id;})||null;}

  function openDetail(student){
    if(!student||student.estado==='NO_ENVIADO')return;state.detalle=student;
    $('ad-v2-detail-name').textContent=student.nombres||'Estudiante';$('ad-v2-detail-id').textContent=student.cedula||'-';$('ad-v2-detail-career').textContent=student.carrera||'-';$('ad-v2-detail-period').textContent=periodLabel(selectedPeriod('ad-v2-title-period'));$('ad-v2-detail-date').textContent=formatDate(student.fechaEnvio);$('ad-v2-detail-state').textContent=statusLabel(student.estado);$('ad-v2-detail-coordinator').textContent=student.coordinador||'Sin revisión';$('ad-v2-detail-final').textContent=student.tituloFinal||'-';$('ad-v2-detail-resolution-date').textContent=formatDate(student.fechaResolucion);$('ad-v2-detail-observation').textContent=student.observacion||'-';$('ad-v2-return-reason').value='';setStatus('ad-v2-detail-status','Puedes devolver o eliminar el envío.','info');
    $('ad-v2-proposals').innerHTML=[1,2,3].map(function(number){var title=student['titulo'+number]||'-';var favorite=Number(student.tituloPreferidoNumero)===number;return '<article class="ad-v2-proposal '+(favorite?'is-favorite':'')+'"><strong>Título '+number+(favorite?' · ⭐ Favorito':'')+'</strong><p>'+esc(title)+'</p></article>';}).join('');openModal('ad-v2-detail-modal');
  }

  function deleteStudent(student,fromModal){
    if(!student||student.estado==='NO_ENVIADO')return;if(!window.confirm('¿Eliminar definitivamente el envío de '+(student.nombres||student.cedula)+' para '+periodLabel(selectedPeriod('ad-v2-title-period'))+'?'))return;busy(true,'Eliminando envío...');api().eliminarTitulo({envioId:student.envioId,cedula:student.cedula,numeroIdentificacion:student.cedula,periodoId:selectedPeriod('ad-v2-title-period'),periodo:periodLabel(selectedPeriod('ad-v2-title-period'))}).then(function(result){if(fromModal)closeModal('ad-v2-detail-modal');setStatus('ad-v2-title-status',result.mensaje||'Envío eliminado.','success');return loadGlobal();}).then(function(){return loadStats();}).catch(function(error){setStatus('ad-v2-title-status',message(error),'danger');}).finally(function(){busy(false);});
  }

  function returnStudent(){
    var student=state.detalle;if(!student)return;var reason=texto($('ad-v2-return-reason').value);if(reason.length<4){setStatus('ad-v2-detail-status','Escribe un motivo de al menos 4 caracteres.','danger');return;}var favorite=Number(student.tituloPreferidoNumero||0);var selected=favorite>=1&&favorite<=3?student['titulo'+favorite]:student.titulo1;busy(true,'Devolviendo propuestas...');api().devolverTitulo({cedula:student.cedula,numeroIdentificacion:student.cedula,periodoId:selectedPeriod('ad-v2-title-period'),periodo:periodLabel(selectedPeriod('ad-v2-title-period')),estudiante:student.nombres,nombres:student.nombres,carrera:student.carrera,coordinador:'Administrador',estado:'DEVUELTO',estadoFinal:'DEVUELTO',tituloElegido:selected,tituloCorregido:'',observacion:reason,comentario:reason,comentarioCoordinador:reason,fechaResolucion:new Date().toISOString(),permitirReenvio:true}).then(function(){closeModal('ad-v2-detail-modal');setStatus('ad-v2-title-status','Propuestas devueltas correctamente.','success');return loadGlobal();}).then(function(){return loadStats();}).catch(function(error){setStatus('ad-v2-detail-status',message(error),'danger');}).finally(function(){busy(false);});
  }

  function formalMessage(student,period){return ['Estimado/a '+(student.nombres||'estudiante')+':','','Reciba un cordial saludo.','','Por medio del presente, le recordamos que aún no registra sus tres propuestas de titulación correspondientes al período '+period+'. Agradecemos ingresar a la plataforma de titulación y completar el envío a la brevedad posible.','','Enlace de acceso:','https://titulos.pages.dev/estudiantes/estudiante','','En caso de haber realizado el registro recientemente, por favor omita este mensaje.','','Atentamente,','Coordinación de Titulación','ITSQMET'].join('\n');}
  function whatsapp(student){var phone=texto(student.celular).replace(/\D/g,'');if(phone.indexOf('593')!==0){if(phone.charAt(0)==='0')phone='593'+phone.slice(1);else if(phone.length===9)phone='593'+phone;}if(phone.length<11)return;window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(formalMessage(student,periodLabel(selectedPeriod('ad-v2-title-period')))),'_blank','noopener');}
  function email(student){var emails=[texto(student.correoInstitucional).toLowerCase(),texto(student.correoPersonal).toLowerCase()].filter(function(value,index,array){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)&&array.indexOf(value)===index;});if(!emails.length)return;var period=periodLabel(selectedPeriod('ad-v2-title-period'));var params=new URLSearchParams({to:emails.join(';'),subject:'Recordatorio de registro de propuestas de titulación – '+period,body:formalMessage(student,period)});window.open('https://outlook.office.com/mail/deeplink/compose?'+params.toString(),'_blank','noopener,noreferrer');}

  function loadStats(){
    var period=selectedPeriod('ad-v2-stat-period');if(!period)return Promise.resolve();var career=texto($('ad-v2-stat-career')&&$('ad-v2-stat-career').value);setStatus('ad-v2-stat-status','Calculando desde la lista global...','info');busy(true,'Calculando estadísticas...');return api().obtenerEstadisticas({periodoId:period,periodo:period,carrera:career}).then(function(result){state.estadisticas=result;window.ADAdminStatisticsLast=result;renderStats();setStatus('ad-v2-stat-status',result.mensaje||'Estadísticas calculadas.','success');return result;}).catch(function(error){setStatus('ad-v2-stat-status',message(error),'danger');throw error;}).finally(function(){busy(false);});
  }

  function renderStats(){
    var data=state.estadisticas||{};var summary=data.resumen||{};$('ad-v2-stat-expected').textContent=Number(summary.esperados||0);$('ad-v2-stat-sent').textContent=Number(summary.enviados||0);$('ad-v2-stat-missing').textContent=Number(summary.faltan||0);$('ad-v2-stat-approved').textContent=Number(summary.aprobados||0)+Number(summary.reemplazados||0);$('ad-v2-stat-progress').textContent=Number(summary.avance||0)+' %';
    $('ad-v2-stat-body').innerHTML=(data.carreras||[]).map(function(item){return '<tr><td>'+esc(item.carrera)+'</td><td>'+Number(item.esperados||0)+'</td><td>'+Number(item.enviados||0)+'</td><td><button class="ad-count-btn" type="button" data-v2-action="show-missing" data-career="'+esc(item.carrera)+'" '+(item.faltan?'':'disabled')+'>'+Number(item.faltan||0)+'</button></td><td>'+Number(item.pendientes||0)+'</td><td>'+(Number(item.aprobados||0)+Number(item.reemplazados||0))+'</td><td>'+Number(item.devueltos||0)+'</td><td>'+Number(item.avance||0)+' %</td></tr>';}).join('')||'<tr><td colspan="8" class="ad-empty">No hay datos para esta selección.</td></tr>';
    $('ad-v2-outside').textContent=Number((data.fueraPoblacion||[]).length||0)?'Registros fuera de la población: '+(data.fueraPoblacion||[]).length+'. No se sumaron a las estadísticas.':'';
  }

  function showMissing(career){var rows=(state.estadisticas&&state.estadisticas.faltantes||[]).filter(function(item){return !career||normal(item.carrera)===normal(career);});$('ad-v2-missing-title').textContent=career?'No enviados: '+career:'Estudiantes que no han enviado';$('ad-v2-missing-body').innerHTML=rows.map(function(item){return '<tr><td>'+esc(item.cedula)+'</td><td>'+esc(item.nombres||'Sin nombre')+'</td><td>'+esc(item.carrera||'-')+'</td><td>'+esc(item.celular||'Sin celular')+'</td><td><div class="ad-v2-actions"><button class="ad-v2-icon ad-v2-icon--wa" type="button" data-v2-action="missing-wa" data-id="'+esc(item.cedula)+'" '+(item.celular?'':'disabled')+'>💬</button><button class="ad-v2-icon ad-v2-icon--mail" type="button" data-v2-action="missing-email" data-id="'+esc(item.cedula)+'" '+((item.correoInstitucional||item.correoPersonal)?'':'disabled')+'>✉️</button></div></td></tr>';}).join('')||'<tr><td colspan="5" class="ad-empty">No hay estudiantes faltantes.</td></tr>';openModal('ad-v2-missing-modal');}
  function missingStudent(id){return (state.estadisticas&&state.estadisticas.faltantes||[]).find(function(item){return item.cedula===id;})||null;}

  function events(){
    document.addEventListener('click',function(event){var button=event.target.closest('[data-v2-action]');if(!button)return;var action=button.getAttribute('data-v2-action');var id=button.getAttribute('data-id');if(action==='reload-periods')loadPeriods();else if(action==='toggle-period')changePeriod(id,'toggle');else if(action==='principal-period')changePeriod(id,'principal');else if(action==='reload-careers')loadCareers();else if(action==='detail')openDetail(globalStudent(id));else if(action==='delete')deleteStudent(globalStudent(id),false);else if(action==='whatsapp')whatsapp(globalStudent(id));else if(action==='email')email(globalStudent(id));else if(action==='close-detail')closeModal('ad-v2-detail-modal');else if(action==='delete-detail')deleteStudent(state.detalle,true);else if(action==='return-detail')returnStudent();else if(action==='load-stats')loadStats();else if(action==='show-missing')showMissing(button.getAttribute('data-career'));else if(action==='close-missing')closeModal('ad-v2-missing-modal');else if(action==='missing-wa')whatsapp(missingStudent(id));else if(action==='missing-email')email(missingStudent(id));});
    document.addEventListener('change',function(event){var careerId=event.target.getAttribute('data-v2-career-select');if(careerId!==null){assignCareer(careerId,texto(event.target.value));return;}if(event.target.id==='ad-v2-title-period')loadGlobal();else if(event.target.id==='ad-v2-title-career'||event.target.id==='ad-v2-title-state')renderGlobal();else if(event.target.id==='ad-v2-stat-period')loadStats();});
    document.addEventListener('input',function(event){if(event.target.id==='ad-v2-title-search')renderGlobal();});
  }

  function updateVersion(){var badge=$('ad-badge-version');var footer=$('ad-footer-version');if(badge)badge.textContent='v'+VERSION;if(footer)footer.textContent='Versión '+VERSION;}

  function init(){
    if(!api())return setTimeout(init,200);styles();replaceSections();events();updateVersion();busy(true,'Cargando administración global...');Promise.allSettled([loadPeriods(),loadCareers()]).then(function(){return loadGlobal();}).then(function(){return loadStats();}).catch(function(){}).finally(function(){busy(false);});
  }

  if(document.readyState==='complete')setTimeout(init,500);else window.addEventListener('load',function(){setTimeout(init,500);},{once:true});
})(window,document);
