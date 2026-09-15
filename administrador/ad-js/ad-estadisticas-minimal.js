/* Estadísticas minimalistas: General / Coordinadores / Investigadores. */
(function(window,document){
  'use strict';

  if(window.ADAdminStatsMinimal)return;
  window.ADAdminStatsMinimal=true;

  var VERSION='3.6.2';
  var JS_PDF='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
  var AUTO_TABLE='https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js';
  var state={
    tab:'general',
    periodo:'',
    carrera:'',
    tipo:'',
    buscar:'',
    detalle:'',
    periodos:[],
    carreras:[],
    general:null,
    revisiones:null,
    loading:false
  };
  var searchTimer=null;

  function $(id){return document.getElementById(id);}
  function text(value){return String(value===null||value===undefined?'':value).trim();}
  function normal(value){return text(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function esc(value){return text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function apiBase(){var service=window.ADAPIService;var base=service&&typeof service.base==='function'?text(service.base()):text(window.location&&window.location.origin);return base.replace(/\/$/,'');}
  function post(action,data){
    return fetch(apiBase()+'/api/estadisticas',{
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
    if($('ad-stats-min-style'))return;
    var style=document.createElement('style');
    style.id='ad-stats-min-style';
    style.textContent=''+
      '.adsm{display:grid;gap:1rem}.adsm-top{display:flex;justify-content:space-between;align-items:flex-start;gap:1rem;flex-wrap:wrap}.adsm-top h3{margin:.15rem 0 0}.adsm-tabs{display:inline-flex;gap:.25rem;padding:.25rem;border:1px solid var(--ad-border);border-radius:.9rem;background:var(--ad-surface-soft);overflow:auto}.adsm-tabs button{border:0;background:transparent;color:var(--ad-muted);font-weight:800;padding:.65rem 1rem;border-radius:.7rem;cursor:pointer;white-space:nowrap}.adsm-tabs button.is-on{background:#fff;color:var(--ad-primary);box-shadow:0 .2rem .8rem rgba(16,32,51,.08)}'+
      '.adsm-filters{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem;align-items:end}.adsm-filters label{display:grid;gap:.4rem;font-weight:700}.adsm-filters select,.adsm-filters input{width:100%;box-sizing:border-box}.adsm-toolbar{display:flex;justify-content:space-between;align-items:center;gap:.75rem;flex-wrap:wrap}.adsm-status{margin:0}.adsm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem}.adsm-kpi{padding:1rem;border:1px solid var(--ad-border);border-radius:1rem;background:#fff}.adsm-kpi span{display:block;color:var(--ad-muted);font-size:.82rem;font-weight:700}.adsm-kpi strong{display:block;margin-top:.35rem;font-size:1.9rem}.adsm-table-wrap{overflow:auto;border:1px solid var(--ad-border);border-radius:1rem}.adsm-table{width:100%;border-collapse:collapse;background:#fff}.adsm-table th,.adsm-table td{padding:.75rem .8rem;border-bottom:1px solid var(--ad-border);text-align:left;vertical-align:top}.adsm-table th{font-size:.8rem;color:var(--ad-muted);background:var(--ad-surface-soft);white-space:nowrap}.adsm-table tr:last-child td{border-bottom:0}.adsm-link{border:0;background:transparent;color:var(--ad-primary);font:inherit;font-weight:800;padding:0;cursor:pointer;text-align:left}.adsm-actions{display:flex;gap:.5rem;flex-wrap:wrap}.adsm-empty{padding:2rem;text-align:center;color:var(--ad-muted)}'+
      '.adsm-section-head{display:flex;justify-content:space-between;gap:1rem;align-items:center;flex-wrap:wrap;margin-bottom:.7rem}.adsm-section-head h4{margin:0}.adsm-back{display:inline-flex;align-items:center;gap:.35rem;border:0;background:transparent;color:var(--ad-primary);font-weight:800;cursor:pointer;padding:0}.adsm-meta{display:flex;gap:.55rem;flex-wrap:wrap}.adsm-pill{display:inline-flex;padding:.35rem .6rem;border-radius:999px;background:var(--ad-surface-soft);color:var(--ad-muted);font-size:.8rem;font-weight:800}.adsm-result{display:inline-flex;padding:.3rem .55rem;border-radius:999px;font-size:.75rem;font-weight:800}.adsm-result.ok{background:#e8f7ee;color:var(--ad-success)}.adsm-result.fix{background:#eef3ff;color:var(--ad-primary)}.adsm-result.return{background:#fff5e6;color:var(--ad-warning)}.adsm-title{max-width:38rem;line-height:1.35}.adsm-note{max-width:34rem;color:var(--ad-muted);font-size:.85rem;line-height:1.4}'+
      '@media(max-width:980px){.adsm-filters,.adsm-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:620px){.adsm-filters,.adsm-kpis{grid-template-columns:1fr}.adsm-top,.adsm-toolbar,.adsm-section-head{align-items:stretch;flex-direction:column}.adsm-tabs{width:100%;box-sizing:border-box}.adsm-tabs button{flex:1}}';
    document.head.appendChild(style);
  }

  function mount(){
    var section=$('ad-seccion-estadisticas');
    if(!section)return false;
    installStyles();
    section.innerHTML=''+
      '<div class="adsm" id="adsm-root">'+
        '<div class="adsm-top"><div><p class="ad-eyebrow">Control académico</p><h3>Estadísticas</h3></div><button class="ad-btn ad-btn-secondary" type="button" data-adsm="refresh">Actualizar</button></div>'+
        '<div class="adsm-tabs" role="tablist" aria-label="Vistas de estadísticas">'+
          '<button type="button" data-adsm-tab="general" class="is-on">General</button>'+
          '<button type="button" data-adsm-tab="coordinadores">Coordinadores</button>'+
          '<button type="button" data-adsm-tab="investigadores">Investigadores</button>'+
        '</div>'+
        '<section class="ad-card"><div class="adsm-filters">'+
          '<label><span>Período</span><select id="adsm-period"></select></label>'+
          '<label><span>Carrera</span><select id="adsm-career"><option value="">Todas</option></select></label>'+
          '<label><span>Tipo</span><select id="adsm-type"><option value="">Todos</option><option value="ARTICULO_ACADEMICO">Artículo académico</option><option value="TRABAJO_TITULACION">Trabajo de Titulación</option></select></label>'+
          '<label><span>Buscar</span><input id="adsm-search" placeholder="Nombre, cédula o título"></label>'+
        '</div></section>'+
        '<div class="adsm-toolbar"><div id="adsm-status" class="ad-result-box adsm-status">Cargando estadísticas…</div><div id="adsm-report-actions" class="adsm-actions"></div></div>'+
        '<div id="adsm-content"></div>'+
      '</div>';
    bind();
    return true;
  }

  function option(value,label){return '<option value="'+esc(value)+'">'+esc(label)+'</option>';}
  function periodLabel(item){return text(item.label||item.periodoLabel||item.nombre||item.id||item.periodoId);}
  function periodId(item){return text(item.id||item.periodoId||item.documentId||periodLabel(item));}
  function isActive(item){return item&&item.activo!==false&&text(item.estado||'ACTIVO').toUpperCase()!=='INACTIVO';}

  function loadCatalogs(){
    setStatus('Cargando filtros…','info');
    return Promise.all([
      post('ADMIN_LISTAR_PERIODOS',{}),
      post('ADMIN_LISTAR_CARRERAS',{})
    ]).then(function(results){
      state.periodos=results[0].periodos||results[0].registros||[];
      state.carreras=results[1].carreras||results[1].registros||[];
      renderFilters();
    });
  }

  function renderFilters(){
    var period=$('adsm-period');
    var career=$('adsm-career');
    var selected=state.periodo;
    if(!selected){
      var preferred=state.periodos.find(function(item){return item.principal===true;})||state.periodos.find(isActive)||state.periodos[0];
      selected=preferred?periodId(preferred):'';
      state.periodo=selected;
    }
    period.innerHTML=state.periodos.map(function(item){
      var label=periodLabel(item)+(isActive(item)?'':' · Inactivo');
      return option(periodId(item),label);
    }).join('');
    if(selected)period.value=selected;

    var seen={};
    var careers=state.carreras.map(function(item){return text(item.nombre||item.nombreCarrera||item.carrera||item.id);}).filter(function(name){var key=normal(name);if(!name||seen[key])return false;seen[key]=true;return true;}).sort(function(a,b){return a.localeCompare(b,'es');});
    career.innerHTML='<option value="">Todas</option>'+careers.map(function(name){return option(name,name);}).join('');
    career.value=state.carrera||'';
    $('adsm-type').value=state.tipo||'';
    $('adsm-search').value=state.buscar||'';
  }

  function setStatus(message,type){
    var el=$('adsm-status');
    if(!el)return;
    el.textContent=message||'';
    el.className='ad-result-box adsm-status ad-status-'+(type||'info');
  }

  function setBusy(active){
    state.loading=active;
    Array.from(document.querySelectorAll('#adsm-root button,#adsm-root select')).forEach(function(el){el.disabled=active;});
    var search=$('adsm-search');if(search)search.disabled=active;
  }

  function normalizeState(value){
    var v=text(value).toUpperCase().replace(/[^A-Z0-9]+/g,'_');
    if(v==='PENDIENTE_INVESTIGADOR')return'PENDIENTE_INVESTIGADOR';
    if(v==='PENDIENTE_COORDINADOR'||v==='PENDIENTE_REVISION')return'PENDIENTE_COORDINADOR';
    if(v==='NO_ENVIADO')return'NO_ENVIADO';
    if(v==='DEVUELTO')return'DEVUELTO';
    if(v.indexOf('APROBAD')>=0||v==='REEMPLAZADO')return'APROBADO';
    return v||'PENDIENTE_COORDINADOR';
  }

  function normalizeType(value){
    var v=text(value).toUpperCase().replace(/[^A-Z0-9]+/g,'_');
    if(v.indexOf('TRABAJO')>=0&&v.indexOf('TITUL')>=0)return'TRABAJO_TITULACION';
    if(v.indexOf('ARTICULO')>=0)return'ARTICULO_ACADEMICO';
    return v;
  }

  function filterGeneral(rows){
    return (rows||[]).filter(function(row){
      if(state.carrera&&normal(row.carrera)!==normal(state.carrera))return false;
      if(state.tipo&&normalizeType(row.tipoTrabajo)!==state.tipo)return false;
      if(state.buscar){
        var hay=normal([row.nombres,row.estudiante,row.cedula,row.carrera,row.titulo1,row.titulo2,row.titulo3,row.tituloFinal,row.coordinadorResponsable].join(' '));
        if(hay.indexOf(normal(state.buscar))<0)return false;
      }
      return true;
    });
  }

  function generalMetrics(rows){
    var out={esperados:rows.length,enviados:0,coord:0,inv:0,aprobados:0};
    rows.forEach(function(row){
      var s=normalizeState(row.estadoProceso||row.estado);
      if(s!=='NO_ENVIADO')out.enviados+=1;
      if(s==='PENDIENTE_COORDINADOR')out.coord+=1;
      else if(s==='PENDIENTE_INVESTIGADOR')out.inv+=1;
      else if(s==='APROBADO')out.aprobados+=1;
    });
    return out;
  }

  function groupCareers(rows){
    var map={};
    rows.forEach(function(row){
      var name=text(row.carrera)||'Sin carrera';
      var key=normal(name)||'sin-carrera';
      if(!map[key])map[key]={carrera:name,esperados:0,enviados:0,coord:0,inv:0,aprobados:0};
      var item=map[key],s=normalizeState(row.estadoProceso||row.estado);
      item.esperados+=1;
      if(s!=='NO_ENVIADO')item.enviados+=1;
      if(s==='PENDIENTE_COORDINADOR')item.coord+=1;
      else if(s==='PENDIENTE_INVESTIGADOR')item.inv+=1;
      else if(s==='APROBADO')item.aprobados+=1;
    });
    return Object.keys(map).map(function(key){var item=map[key];item.avance=item.esperados?Math.round(item.aprobados/item.esperados*100):0;return item;}).sort(function(a,b){return a.carrera.localeCompare(b.carrera,'es');});
  }

  function loadGeneral(){
    return post('ADMIN_LISTA_GLOBAL_TITULOS',{periodoId:state.periodo,periodo:state.periodo}).then(function(data){
      state.general=data;
      renderGeneral();
      setStatus('Datos actualizados.','success');
    });
  }

  function renderGeneral(){
    state.detalle='';
    var actions=$('adsm-report-actions');if(actions)actions.innerHTML='';
    var rows=filterGeneral(state.general&&state.general.registros||[]);
    var m=generalMetrics(rows),careers=groupCareers(rows);
    $('adsm-content').innerHTML=''+
      '<div class="adsm-kpis">'+
        '<article class="adsm-kpi"><span>Enviados</span><strong>'+m.enviados+'</strong></article>'+
        '<article class="adsm-kpi"><span>Pend. Coordinación</span><strong>'+m.coord+'</strong></article>'+
        '<article class="adsm-kpi"><span>Pend. Investigación</span><strong>'+m.inv+'</strong></article>'+
        '<article class="adsm-kpi"><span>Aprobados</span><strong>'+m.aprobados+'</strong></article>'+
      '</div>'+
      '<section class="ad-card"><div class="adsm-section-head"><h4>Carreras</h4><span class="adsm-pill">'+m.esperados+' estudiantes</span></div>'+
        '<div class="adsm-table-wrap"><table class="adsm-table"><thead><tr><th>Carrera</th><th>Enviados</th><th>Coord.</th><th>Inv.</th><th>Aprobados</th><th>Avance</th></tr></thead><tbody>'+
          (careers.length?careers.map(function(item){return'<tr><td><strong>'+esc(item.carrera)+'</strong></td><td>'+item.enviados+'</td><td>'+item.coord+'</td><td>'+item.inv+'</td><td>'+item.aprobados+'</td><td>'+item.avance+' %</td></tr>';}).join(''):'<tr><td colspan="6" class="adsm-empty">No hay datos con estos filtros.</td></tr>')+
        '</tbody></table></div></section>';
  }

  function roleForTab(){return state.tab==='investigadores'?'INVESTIGADOR':'COORDINADOR';}
  function roleLabel(){return state.tab==='investigadores'?'Investigadores':'Coordinadores';}

  function loadReviews(){
    return post('ADMIN_REPORTE_REVISIONES',{
      rol:roleForTab(),
      periodoId:state.periodo,
      carrera:state.carrera,
      tipoTrabajo:state.tipo,
      buscar:state.buscar
    }).then(function(data){
      state.revisiones=data;
      state.detalle='';
      renderReviewers();
      setStatus('Revisiones cargadas desde la trazabilidad real.','success');
    });
  }

  function resultBadge(row){
    if(row.clasificacion==='DEVUELTO')return'<span class="adsm-result return">Devuelto</span>';
    if(row.clasificacion==='CORREGIDO')return'<span class="adsm-result fix">Corregido</span>';
    if(row.clasificacion==='SIN_CAMBIOS')return'<span class="adsm-result ok">Aprobado</span>';
    return'<span class="adsm-pill">'+esc(row.resultado||row.accion||'Revisión')+'</span>';
  }

  function formatDate(value){
    if(!text(value))return'—';
    var d=new Date(value);
    return Number.isNaN(d.getTime())?text(value):d.toLocaleDateString('es-EC',{day:'2-digit',month:'2-digit',year:'numeric'});
  }

  function renderReviewers(){
    var data=state.revisiones||{revisores:[],resumen:{}};
    var r=data.resumen||{};
    $('adsm-report-actions').innerHTML='<button class="ad-btn ad-btn-primary" type="button" data-adsm="pdf-general">Descargar reporte general PDF</button>';
    $('adsm-content').innerHTML=''+
      '<div class="adsm-kpis">'+
        '<article class="adsm-kpi"><span>Revisiones</span><strong>'+Number(r.revisiones||0)+'</strong></article>'+
        '<article class="adsm-kpi"><span>Sin cambios</span><strong>'+Number(r.sinCambios||0)+'</strong></article>'+
        '<article class="adsm-kpi"><span>Con corrección</span><strong>'+Number(r.corregidos||0)+'</strong></article>'+
        '<article class="adsm-kpi"><span>Devueltos</span><strong>'+Number(r.devueltos||0)+'</strong></article>'+
      '</div>'+
      '<section class="ad-card"><div class="adsm-section-head"><h4>'+roleLabel()+'</h4><span class="adsm-pill">'+Number(r.estudiantesUnicos||0)+' estudiantes únicos</span></div>'+
        '<div class="adsm-table-wrap"><table class="adsm-table"><thead><tr><th>'+ (state.tab==='investigadores'?'Investigador':'Coordinador') +'</th><th>Revisiones</th><th>Sin cambios</th><th>Corregidos</th><th>Devueltos</th><th>Última revisión</th><th></th></tr></thead><tbody>'+
          ((data.revisores||[]).length?(data.revisores||[]).map(function(item){return'<tr><td><button class="adsm-link" type="button" data-adsm-reviewer="'+esc(item.revisorKey)+'">'+esc(item.revisorNombre)+'</button></td><td>'+item.revisiones+'</td><td>'+item.sinCambios+'</td><td>'+item.corregidos+'</td><td>'+item.devueltos+'</td><td>'+formatDate(item.ultimaRevision)+'</td><td><button class="ad-btn ad-btn-secondary" type="button" data-adsm-pdf-reviewer="'+esc(item.revisorKey)+'">PDF</button></td></tr>';}).join(''):'<tr><td colspan="7" class="adsm-empty">No se encontraron revisiones con estos filtros.</td></tr>')+
        '</tbody></table></div></section>';
  }

  function reviewerByKey(key){return (state.revisiones&&state.revisiones.revisores||[]).find(function(item){return item.revisorKey===key;})||null;}
  function revisionsByKey(key){return (state.revisiones&&state.revisiones.revisiones||[]).filter(function(item){return (item.revisorId||normal(item.revisorNombre)||'sin-responsable')===key;});}

  function renderReviewerDetail(key){
    var reviewer=reviewerByKey(key);
    if(!reviewer)return;
    state.detalle=key;
    var rows=revisionsByKey(key);
    $('adsm-report-actions').innerHTML='<button class="ad-btn ad-btn-primary" type="button" data-adsm-pdf-reviewer="'+esc(key)+'">Descargar PDF</button>';
    $('adsm-content').innerHTML=''+
      '<section class="ad-card"><div class="adsm-section-head"><div><button class="adsm-back" type="button" data-adsm="back">← '+roleLabel()+'</button><h4 style="margin-top:.55rem">'+esc(reviewer.revisorNombre)+'</h4></div><div class="adsm-meta"><span class="adsm-pill">'+reviewer.revisiones+' revisiones</span><span class="adsm-pill">'+reviewer.estudiantesUnicos+' estudiantes</span></div></div>'+
        '<div class="adsm-table-wrap"><table class="adsm-table"><thead><tr><th>Estudiante</th><th>Carrera</th><th>Resultado</th><th>Título revisado</th><th>Observación</th><th>Fecha</th></tr></thead><tbody>'+
          (rows.length?rows.map(function(row){var title=row.tituloDespues||row.tituloAntes||'—';return'<tr><td><strong>'+esc(row.estudiante||'Sin nombre')+'</strong><br><small>'+esc(row.cedula)+'</small></td><td>'+esc(row.carrera||'—')+'</td><td>'+resultBadge(row)+'</td><td class="adsm-title">'+esc(title)+'</td><td class="adsm-note">'+esc(row.observacion||'—')+'</td><td>'+formatDate(row.fecha)+'</td></tr>';}).join(''):'<tr><td colspan="6" class="adsm-empty">No hay revisiones para mostrar.</td></tr>')+
        '</tbody></table></div></section>';
  }

  function loadCurrent(){
    if(!state.periodo){setStatus('No hay un período disponible para consultar.','warning');return Promise.resolve();}
    setBusy(true);
    setStatus('Actualizando…','info');
    var task=state.tab==='general'?loadGeneral():loadReviews();
    return task.catch(function(error){setStatus(error&&error.message?error.message:String(error),'danger');$('adsm-content').innerHTML='<div class="ad-card adsm-empty">No se pudieron cargar los datos.</div>';}).finally(function(){setBusy(false);updateTabs();});
  }

  function updateTabs(){
    Array.from(document.querySelectorAll('[data-adsm-tab]')).forEach(function(button){button.classList.toggle('is-on',button.getAttribute('data-adsm-tab')===state.tab);});
  }

  function bind(){
    document.addEventListener('click',function(event){
      var tab=event.target&&event.target.closest?event.target.closest('[data-adsm-tab]'):null;
      if(tab&&$('adsm-root')){
        state.tab=tab.getAttribute('data-adsm-tab')||'general';state.detalle='';updateTabs();loadCurrent();return;
      }
      var action=event.target&&event.target.closest?event.target.closest('[data-adsm]'):null;
      if(action&&$('adsm-root')){
        var name=action.getAttribute('data-adsm');
        if(name==='refresh'){loadCurrent();return;}
        if(name==='back'){state.detalle='';renderReviewers();return;}
        if(name==='pdf-general'){downloadPdf(null);return;}
      }
      var reviewer=event.target&&event.target.closest?event.target.closest('[data-adsm-reviewer]'):null;
      if(reviewer&&$('adsm-root')){renderReviewerDetail(reviewer.getAttribute('data-adsm-reviewer'));return;}
      var pdf=event.target&&event.target.closest?event.target.closest('[data-adsm-pdf-reviewer]'):null;
      if(pdf&&$('adsm-root')){downloadPdf(pdf.getAttribute('data-adsm-pdf-reviewer'));}
    });
    document.addEventListener('change',function(event){
      if(!$('adsm-root'))return;
      if(event.target.id==='adsm-period'){state.periodo=text(event.target.value);state.detalle='';loadCurrent();}
      else if(event.target.id==='adsm-career'){state.carrera=text(event.target.value);state.detalle='';loadCurrent();}
      else if(event.target.id==='adsm-type'){state.tipo=text(event.target.value);state.detalle='';loadCurrent();}
    });
    document.addEventListener('input',function(event){
      if(event.target.id!=='adsm-search'||!$('adsm-root'))return;
      state.buscar=text(event.target.value);state.detalle='';
      clearTimeout(searchTimer);searchTimer=setTimeout(loadCurrent,350);
    });
  }

  function loadScript(src,attr){
    return new Promise(function(resolve,reject){
      var existing=document.querySelector('script['+attr+'="true"]');
      if(existing){if(existing.getAttribute('data-loaded')==='true')return resolve();existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',function(){reject(new Error('No se pudo cargar la librería PDF.'));},{once:true});return;}
      var script=document.createElement('script');script.src=src;script.async=true;script.setAttribute(attr,'true');script.onload=function(){script.setAttribute('data-loaded','true');resolve();};script.onerror=function(){reject(new Error('No se pudo cargar la librería PDF.'));};document.head.appendChild(script);
    });
  }

  function ensurePdf(){
    var first=window.jspdf&&window.jspdf.jsPDF?Promise.resolve():loadScript(JS_PDF,'data-jspdf-stats');
    return first.then(function(){var Doc=window.jspdf&&window.jspdf.jsPDF;if(!Doc)throw new Error('jsPDF no está disponible.');var sample=new Doc();if(typeof sample.autoTable==='function')return;return loadScript(AUTO_TABLE,'data-jspdf-autotable-stats');});
  }

  function pdfFilters(doc,y){
    doc.setFont('helvetica','normal');doc.setFontSize(8);
    var period=$('adsm-period'),periodText=period&&period.selectedIndex>=0?text(period.options[period.selectedIndex].textContent):state.periodo;
    doc.text('Período: '+(periodText||'Todos'),14,y);
    doc.text('Carrera: '+(state.carrera||'Todas'),14,y+5);
    doc.text('Tipo: '+(state.tipo==='TRABAJO_TITULACION'?'Trabajo de Titulación':state.tipo==='ARTICULO_ACADEMICO'?'Artículo académico':'Todos'),14,y+10);
    return y+16;
  }

  function safeFile(value){return normal(value).replace(/\s+/g,'_').replace(/[^a-z0-9_]+/g,'').slice(0,70)||'reporte';}

  function downloadPdf(reviewerKey){
    if(!state.revisiones){setStatus('Primero carga la pestaña de revisiones.','warning');return;}
    var reviewer=reviewerKey?reviewerByKey(reviewerKey):null;
    var rows=reviewerKey?revisionsByKey(reviewerKey):(state.revisiones.revisiones||[]);
    setStatus('Preparando PDF…','info');
    ensurePdf().then(function(){
      var jsPDF=window.jspdf.jsPDF;
      var doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
      var title=state.tab==='investigadores'?'Reporte de revisiones de Investigación':'Reporte de revisiones de Coordinación';
      doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text(title,14,16);
      doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text(reviewer?reviewer.revisorNombre:'Reporte general',14,23);
      var y=pdfFilters(doc,29);
      var summary=reviewer||state.revisiones.resumen||{};
      var metrics=reviewer?[['Revisiones',reviewer.revisiones],['Estudiantes',reviewer.estudiantesUnicos],['Sin cambios',reviewer.sinCambios],['Corregidos',reviewer.corregidos],['Devueltos',reviewer.devueltos]]:[['Revisiones',summary.revisiones||0],['Estudiantes',summary.estudiantesUnicos||0],['Sin cambios',summary.sinCambios||0],['Corregidos',summary.corregidos||0],['Devueltos',summary.devueltos||0]];
      doc.autoTable({startY:y,head:[metrics.map(function(x){return x[0];})],body:[metrics.map(function(x){return String(x[1]||0);})],theme:'grid',styles:{fontSize:8,cellPadding:2},headStyles:{fillColor:[20,70,118],textColor:255}});
      var start=(doc.lastAutoTable&&doc.lastAutoTable.finalY||y)+6;
      if(!reviewer){
        doc.autoTable({startY:start,head:[[(state.tab==='investigadores'?'Investigador':'Coordinador'),'Revisiones','Estudiantes','Sin cambios','Corregidos','Devueltos','Última revisión']],body:(state.revisiones.revisores||[]).map(function(item){return[item.revisorNombre,String(item.revisiones),String(item.estudiantesUnicos),String(item.sinCambios),String(item.corregidos),String(item.devueltos),formatDate(item.ultimaRevision)];}),theme:'grid',styles:{fontSize:7,cellPadding:1.7},headStyles:{fillColor:[43,91,132],textColor:255}});
        start=(doc.lastAutoTable&&doc.lastAutoTable.finalY||start)+7;
      }
      doc.autoTable({startY:start,head:[['Responsable','Estudiante','Cédula','Carrera','Tipo','Resultado','Título revisado','Observación','Fecha']],body:rows.map(function(row){return[row.revisorNombre,row.estudiante,row.cedula,row.carrera,row.tipoTrabajoLabel,row.clasificacion==='SIN_CAMBIOS'?'Aprobado':row.clasificacion==='CORREGIDO'?'Corregido':row.clasificacion==='DEVUELTO'?'Devuelto':row.resultado,row.tituloDespues||row.tituloAntes,row.observacion,formatDate(row.fecha)];}),theme:'grid',margin:{left:10,right:10},styles:{fontSize:5.8,cellPadding:1.2,overflow:'linebreak',valign:'top'},headStyles:{fillColor:[20,70,118],textColor:255},alternateRowStyles:{fillColor:[247,249,252]},showHead:'everyPage'});
      var pages=doc.getNumberOfPages();for(var p=1;p<=pages;p+=1){doc.setPage(p);doc.setFontSize(7);doc.text('Administrador de Titulación · Página '+p+' de '+pages,285,202,{align:'right'});}
      var roleName=state.tab==='investigadores'?'Investigacion':'Coordinacion';
      var file=reviewer?('Revisiones_'+roleName+'_'+safeFile(reviewer.revisorNombre)+'.pdf'):('Revisiones_'+roleName+'_General.pdf');
      doc.save(file);
      setStatus('PDF generado correctamente.','success');
    }).catch(function(error){setStatus(error&&error.message?error.message:String(error),'danger');});
  }

  function init(){
    if(!mount())return;
    loadCatalogs().then(loadCurrent).catch(function(error){setStatus(error&&error.message?error.message:String(error),'danger');});
    var badge=$('ad-badge-version'),footer=$('ad-footer-version');if(badge)badge.textContent='v'+VERSION;if(footer)footer.textContent='Versión '+VERSION;
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window,document);
