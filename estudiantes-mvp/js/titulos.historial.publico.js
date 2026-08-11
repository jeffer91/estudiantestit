/* Contadores e historial de envíos para Artículo Académico y Trabajo de Titulación. */
(function(window,document){
  'use strict';

  if(window.__TITULOS_HISTORIAL_PUBLICO__)return;
  window.__TITULOS_HISTORIAL_PUBLICO__=true;

  var STYLE_ID='titulosHistorialPublicoStyles';
  var scheduled=false;
  var inFlight={};

  function text(value){return String(value===null||value===undefined?'':value).trim();}
  function escapeHtml(value){return text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function cedula(value){var digits=text(value).replace(/\D/g,'');return digits.length===10?digits:'';}
  function visible(element){return Boolean(element&&!element.hidden&&element.offsetParent!==null);}
  function apiBase(){
    var forced=text(window.TITULOS_API_BASE||'');
    var origin=text(window.location&&window.location.origin);
    var host=text(window.location&&window.location.hostname).toLowerCase();
    if(forced)return forced.replace(/\/$/,'');
    if(['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(host)>=0)return'http://127.0.0.1:8788';
    return origin&&origin!=='null'?origin.replace(/\/$/,''):'https://titulos.pages.dev';
  }
  function dateLabel(value){
    var raw=text(value),date;
    if(!raw)return'Fecha no registrada';
    date=new Date(raw);
    if(Number.isNaN(date.getTime()))return raw;
    try{return date.toLocaleString('es-EC',{dateStyle:'medium',timeStyle:'short'});}catch(_error){return raw;}
  }
  function stateLabel(value){
    var key=text(value).toUpperCase().replace(/[^A-Z0-9]+/g,'_');
    var labels={PENDIENTE_REVISION:'Pendiente de revisión',DEVUELTO:'Devuelto',APROBADO:'Aprobado',REEMPLAZADO:'Aprobado con corrección'};
    return labels[key]||text(value)||'Sin estado';
  }

  function installStyles(){
    var style;
    if(document.getElementById(STYLE_ID))return;
    style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=
      '.public-history{margin-top:18px;padding:18px;border:1px solid #d9e2ee;border-radius:16px;background:#f8fbff;color:#1e2d43}' +
      '.public-history__head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}' +
      '.public-history__head h4{margin:2px 0 0;font-size:17px;color:#102a4c}' +
      '.public-history__eyebrow{margin:0;color:#6b7e96;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}' +
      '.public-history__counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-bottom:14px}' +
      '.public-history__count{padding:11px;border:1px solid #e4eaf2;border-radius:12px;background:#fff;text-align:center}' +
      '.public-history__count strong{display:block;font-size:21px;color:#123b70}' +
      '.public-history__count span{display:block;margin-top:2px;font-size:11px;font-weight:700;color:#697a90}' +
      '.public-history details{border-top:1px solid #dde5ef;padding-top:12px}' +
      '.public-history summary{cursor:pointer;color:#123b70;font-weight:800}' +
      '.public-history__timeline{display:grid;gap:10px;margin-top:12px}' +
      '.public-history__item{padding:12px;border-left:4px solid #d6ac54;border-radius:10px;background:#fff}' +
      '.public-history__item-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}' +
      '.public-history__item strong{color:#1a304e}' +
      '.public-history__item small{color:#718097}' +
      '.public-history__item p{margin:8px 0 0;white-space:pre-wrap;line-height:1.45;color:#33455d}' +
      '.public-history__versions{margin:14px 0 0;padding-top:12px;border-top:1px dashed #d9e2ee}' +
      '.public-history__version{margin-top:9px;padding:10px;border-radius:10px;background:#fff}' +
      '.public-history__version ul{margin:8px 0 0;padding-left:20px}' +
      '.public-history__loading,.public-history__empty{margin:0;color:#65768d;font-size:13px}' +
      '.public-history__retry{margin-top:10px;padding:8px 12px;border:1px solid #123b70;border-radius:999px;background:#fff;color:#123b70;font-weight:800;cursor:pointer}' +
      '@media(max-width:640px){.public-history__counts{grid-template-columns:1fr}.public-history__head,.public-history__item-head{display:block}}';
    document.head.appendChild(style);
  }

  function requestHistory(payload,app){
    return fetch(apiBase()+'/api/historial-titulos',{
      method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json','X-Titulos-App':app||'estudiantes'},
      body:JSON.stringify({datos:payload})
    }).then(function(response){
      return response.text().then(function(body){
        var json={};
        try{json=body?JSON.parse(body):{};}catch(_error){throw new Error('El historial respondió en un formato no válido.');}
        if(!response.ok||json.ok===false)throw new Error(json.mensaje||json.error||('Error HTTP '+response.status));
        return json;
      });
    });
  }

  function revisionsHtml(history){
    var revisions=Array.isArray(history.revisiones)?history.revisiones:[];
    if(!revisions.length)return'<p class="public-history__empty">Todavía no existen comentarios de revisión anteriores.</p>';
    return'<div class="public-history__timeline">'+revisions.slice().reverse().map(function(item){
      var comment=text(item.comentario||item.observacion)||'Sin comentario registrado.';
      var coordinator=text(item.coordinador)||'Coordinador no registrado';
      return'<article class="public-history__item">'+
        '<div class="public-history__item-head"><strong>Revisión '+Number(item.numeroResolucion||1)+' · '+escapeHtml(stateLabel(item.estado))+'</strong><small>'+escapeHtml(dateLabel(item.fechaResolucion))+'</small></div>'+
        '<small>'+escapeHtml(coordinator)+'</small><p>'+escapeHtml(comment)+'</p></article>';
    }).join('')+'</div>';
  }

  function versionsHtml(history){
    var versions=Array.isArray(history.versiones)?history.versiones:[];
    if(!versions.length)return'';
    return'<div class="public-history__versions"><strong>Versiones enviadas</strong>'+versions.slice().reverse().map(function(item){
      var titles=[item.titulo1,item.titulo2,item.titulo3].filter(function(value){return text(value);});
      return'<div class="public-history__version"><div class="public-history__item-head"><strong>Envío '+Number(item.numeroVersion||1)+'</strong><small>'+escapeHtml(dateLabel(item.fechaEnvio))+'</small></div>'+
        (titles.length?'<ul>'+titles.map(function(title,index){return'<li'+(Number(item.tituloPreferidoNumero)===index+1?' class="is-favorite"':'')+'>'+escapeHtml(title)+(Number(item.tituloPreferidoNumero)===index+1?' · Favorito':'')+'</li>';}).join('')+'</ul>':'<p>Sin detalle de títulos.</p>')+'</div>';
    }).join('')+'</div>';
  }

  function render(panel,history){
    var sends=Number(history.numeroEnvios||history.versionActual||0);
    var resends=Number(history.numeroReenvios||Math.max(0,sends-1));
    var reviews=Number(history.numeroRevisiones||0);
    panel.innerHTML=
      '<div class="public-history__head"><div><p class="public-history__eyebrow">Seguimiento del proceso</p><h4>Historial de envíos y revisiones</h4></div></div>'+
      '<div class="public-history__counts">'+
        '<div class="public-history__count"><strong>'+sends+'</strong><span>Envíos</span></div>'+
        '<div class="public-history__count"><strong>'+resends+'</strong><span>Reenvíos</span></div>'+
        '<div class="public-history__count"><strong>'+reviews+'</strong><span>Revisiones</span></div>'+
      '</div>'+
      '<details'+(reviews?' open':'')+'><summary>Ver historial completo</summary>'+revisionsHtml(history)+versionsHtml(history)+'</details>';
  }

  function ensurePanel(container,id){
    var panel=document.getElementById(id);
    if(panel&&panel.parentNode!==container){panel.remove();panel=null;}
    if(!panel){
      installStyles();
      panel=document.createElement('section');
      panel.id=id;
      panel.className='public-history';
      panel.setAttribute('aria-live','polite');
      container.appendChild(panel);
    }
    return panel;
  }

  function load(mode){
    var article=mode==='article';
    var container=article?document.getElementById('estadoProcesoTitulacion'):document.getElementById('registroExistente');
    var input=document.getElementById('cedulaInput');
    var identification=cedula(input&&input.value);
    var period=article?text(document.getElementById('datoPeriodo')&&document.getElementById('datoPeriodo').textContent):text(document.getElementById('existentePeriodo')&&document.getElementById('existentePeriodo').textContent);
    var panelId=article?'historialTitulosArticulo':'historialTitulosTrabajo';
    var type=article?'ARTICULO_ACADEMICO':'TRABAJO_TITULACION';
    var key=[type,identification,period].join('|');
    var panel,loaded;

    if(!visible(container)||!identification)return;
    panel=ensurePanel(container,panelId);
    loaded=panel.getAttribute('data-history-loaded');
    if(panel.getAttribute('data-history-key')===key&&(loaded==='true'||loaded==='error'))return;
    if(inFlight[key])return;

    panel.setAttribute('data-history-key',key);
    panel.setAttribute('data-history-loaded','false');
    panel.innerHTML='<p class="public-history__loading">Consultando el historial del proceso…</p>';
    inFlight[key]=true;

    requestHistory({cedula:identification,numeroIdentificacion:identification,periodo:period,periodoLabel:period,tipoTrabajo:type},'estudiantes')
      .then(function(history){
        if(panel.getAttribute('data-history-key')!==key)return;
        render(panel,history);
        panel.setAttribute('data-history-loaded','true');
      })
      .catch(function(error){
        if(panel.getAttribute('data-history-key')!==key)return;
        panel.setAttribute('data-history-loaded','error');
        panel.innerHTML='<p class="public-history__empty">'+escapeHtml(error&&error.message||'No se pudo consultar el historial.')+'</p>'+
          '<button type="button" class="public-history__retry" data-history-retry="true">Reintentar historial</button>';
      })
      .finally(function(){delete inFlight[key];});
  }

  function inspect(){
    scheduled=false;
    if(document.getElementById('estadoProcesoTitulacion'))load('article');
    if(document.getElementById('registroExistente'))load('work');
  }
  function schedule(){
    if(scheduled)return;
    scheduled=true;
    window.setTimeout(inspect,30);
  }

  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
  document.addEventListener('submit',function(){window.setTimeout(schedule,100);},true);
  document.addEventListener('click',function(event){
    var retry=event.target&&event.target.closest?event.target.closest('[data-history-retry]'):null;
    var panel;
    if(retry){
      panel=retry.closest('.public-history');
      if(panel)panel.setAttribute('data-history-loaded','false');
    }
    window.setTimeout(schedule,100);
  },true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule);
  else schedule();
})(window,document);
