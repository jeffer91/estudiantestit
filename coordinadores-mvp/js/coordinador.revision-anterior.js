/* Historial de envíos y revisiones bajo demanda para Coordinadores. */
(function(window,document){
  'use strict';

  var original=window.CoordinadorMVPModal;
  var PANEL_ID='revisionAnteriorPanel';
  var STYLE_ID='revisionAnteriorStyles';
  var requestToken=0;

  if(!original||window.__COORDINADOR_REVISION_ANTERIOR_INSTALADA__)return;
  window.__COORDINADOR_REVISION_ANTERIOR_INSTALADA__=true;

  function text(value){return String(value===null||value===undefined?'':value).trim();}
  function object(value){return value&&typeof value==='object'?value:{};}
  function escapeHtml(value){return text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function apiBase(){
    var forced=text(window.TITULOS_API_BASE||'');
    var origin=text(window.location&&window.location.origin);
    if(forced)return forced.replace(/\/$/,'');
    return origin&&origin!=='null'?origin.replace(/\/$/,''):'https://titulos-coordinadores.pages.dev';
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
  function envioId(envio){
    envio=object(envio);
    var raw=object(envio.raw);
    return text(envio.id||envio._clave||envio.envioId||raw.id||raw._id||raw._docId||raw.envioId);
  }

  function installStyles(){
    var style;
    if(document.getElementById(STYLE_ID))return;
    style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=
      '.previous-review{margin:18px 0;padding:18px;border:1px solid #d8e1ec;border-radius:16px;background:#f8fbff;color:#22334a}' +
      '.previous-review[hidden]{display:none!important}' +
      '.previous-review__head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}' +
      '.previous-review__head h3{margin:2px 0 0;color:#14213d;font-size:18px}' +
      '.previous-review__eyebrow{margin:0;color:#6f7f93;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}' +
      '.previous-review__badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#e5eef9;color:#123b70;font-size:11px;font-weight:800;white-space:nowrap}' +
      '.previous-review__counts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:14px}' +
      '.previous-review__count{padding:11px;border-radius:11px;background:#fff;border:1px solid #e1e8f1;text-align:center}' +
      '.previous-review__count strong{display:block;color:#123b70;font-size:22px}' +
      '.previous-review__count span{display:block;color:#6a7b91;font-size:11px;font-weight:800}' +
      '.previous-review__timeline{display:grid;gap:10px}' +
      '.previous-review__item{padding:12px;border-left:4px solid #c79b25;border-radius:10px;background:#fff}' +
      '.previous-review__item-head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}' +
      '.previous-review__item strong{color:#25364d}' +
      '.previous-review__item small{color:#718097}' +
      '.previous-review__item p{margin:8px 0 0;white-space:pre-wrap;line-height:1.5;color:#33455d}' +
      '.previous-review__versions{margin-top:14px;padding-top:12px;border-top:1px dashed #d7e0eb}' +
      '.previous-review__version{margin-top:9px;padding:10px;border-radius:10px;background:#fff}' +
      '.previous-review__version ul{margin:8px 0 0;padding-left:20px}' +
      '.previous-review__notice{margin:11px 0 0;color:#655928;font-size:12px;line-height:1.45}' +
      '@media(max-width:640px){.previous-review__counts{grid-template-columns:1fr}.previous-review__head,.previous-review__item-head{display:block}}';
    document.head.appendChild(style);
  }

  function ensurePanel(){
    var panel=document.getElementById(PANEL_ID);
    var modal=document.getElementById('detalleModal');
    var body=modal&&modal.querySelector('.modal__body');
    var resolution=body&&body.querySelector('.resolution-box');
    if(panel)return panel;
    if(!body)return null;

    installStyles();
    panel=document.createElement('section');
    panel.id=PANEL_ID;
    panel.className='previous-review';
    panel.hidden=true;
    panel.setAttribute('aria-live','polite');
    if(resolution)body.insertBefore(panel,resolution);
    else body.appendChild(panel);
    return panel;
  }

  function localPrevious(envio){
    envio=object(envio);
    var raw=object(envio.raw);
    var revision=object(envio.revisionAnterior);
    if(!Object.keys(revision).length)revision=object(raw.revisionAnterior);
    var item={
      numeroResolucion:Number(revision.numeroResolucion||envio.numeroRevisionAnterior||raw.numeroRevisionAnterior||1),
      estado:text(revision.estado||envio.estadoRevisionAnterior||raw.estadoRevisionAnterior),
      coordinador:text(revision.coordinador||envio.coordinadorRevisionAnterior||raw.coordinadorRevisionAnterior),
      fechaResolucion:text(revision.fechaResolucion||envio.fechaRevisionAnterior||raw.fechaRevisionAnterior),
      comentario:text(revision.observacion||revision.comentarioCoordinador||envio.comentarioRevisionAnterior||raw.comentarioRevisionAnterior)
    };
    return item.comentario||item.coordinador||item.fechaResolucion?item:null;
  }

  function requestHistory(envio){
    var raw=object(envio&&envio.raw);
    var payload={
      envioId:envioId(envio),
      cedula:text(envio&&envio.cedula||raw.cedula||raw.numeroIdentificacion),
      numeroIdentificacion:text(envio&&envio.cedula||raw.cedula||raw.numeroIdentificacion),
      periodo:text(envio&&envio.periodoLabel||envio&&envio.periodo||raw.periodoLabel||raw.periodo),
      periodoId:text(envio&&envio.periodoId||raw.periodoId),
      tipoTrabajo:text(envio&&envio.tipoTrabajo||raw.tipoTrabajo)
    };
    return fetch(apiBase()+'/api/historial-titulos',{
      method:'POST',cache:'no-store',
      headers:{'Content-Type':'application/json','X-Titulos-App':'coordinadores'},
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
    if(!revisions.length)return'<p class="previous-review__notice">Todavía no existen comentarios de revisiones anteriores.</p>';
    return'<div class="previous-review__timeline">'+revisions.slice().reverse().map(function(item){
      return'<article class="previous-review__item"><div class="previous-review__item-head"><strong>Revisión '+Number(item.numeroResolucion||1)+' · '+escapeHtml(stateLabel(item.estado))+'</strong><small>'+escapeHtml(dateLabel(item.fechaResolucion))+'</small></div><small>'+escapeHtml(text(item.coordinador)||'Coordinador no registrado')+'</small><p>'+escapeHtml(text(item.comentario||item.observacion)||'Sin comentario registrado.')+'</p></article>';
    }).join('')+'</div>';
  }

  function versionsHtml(history){
    var versions=Array.isArray(history.versiones)?history.versiones:[];
    if(!versions.length)return'';
    return'<div class="previous-review__versions"><strong>Versiones enviadas</strong>'+versions.slice().reverse().map(function(item){
      var titles=[item.titulo1,item.titulo2,item.titulo3].filter(function(value){return text(value);});
      return'<div class="previous-review__version"><div class="previous-review__item-head"><strong>Envío '+Number(item.numeroVersion||1)+'</strong><small>'+escapeHtml(dateLabel(item.fechaEnvio))+'</small></div>'+(titles.length?'<ul>'+titles.map(function(title,index){return'<li>'+escapeHtml(title)+(Number(item.tituloPreferidoNumero)===index+1?' · Favorito':'')+'</li>';}).join('')+'</ul>':'<p>Sin detalle de títulos.</p>')+'</div>';
    }).join('')+'</div>';
  }

  function render(history,envio){
    var panel=ensurePanel();
    var sends=Number(history.numeroEnvios||history.versionActual||envio&&envio.versionActual||1);
    var resends=Number(history.numeroReenvios||Math.max(0,sends-1));
    var reviews=Number(history.numeroRevisiones||0);
    if(!panel)return;
    panel.hidden=false;
    panel.innerHTML=
      '<div class="previous-review__head"><div><p class="previous-review__eyebrow">Historial del proceso</p><h3>Envíos y revisiones anteriores</h3></div><span class="previous-review__badge">VERSIÓN '+sends+'</span></div>'+
      '<div class="previous-review__counts"><div class="previous-review__count"><strong>'+sends+'</strong><span>Envíos</span></div><div class="previous-review__count"><strong>'+resends+'</strong><span>Reenvíos</span></div><div class="previous-review__count"><strong>'+reviews+'</strong><span>Revisiones</span></div></div>'+
      revisionsHtml(history)+versionsHtml(history)+
      '<p class="previous-review__notice">El campo inferior registra una nueva decisión. Los comentarios anteriores no se reemplazan.</p>';
  }

  function renderLoading(envio){
    var panel=ensurePanel();
    var previous=localPrevious(envio);
    if(!panel)return;
    panel.hidden=false;
    panel.innerHTML='<div class="previous-review__head"><div><p class="previous-review__eyebrow">Historial del proceso</p><h3>Consultando envíos y revisiones…</h3></div></div>';
    if(previous){
      render({numeroEnvios:Number(envio.versionActual||2),numeroReenvios:Math.max(1,Number(envio.versionActual||2)-1),numeroRevisiones:Number(previous.numeroResolucion||1),revisiones:[previous],versiones:[]},envio);
    }
  }

  function open(envio){
    var result=original.abrir(envio);
    var token=++requestToken;
    renderLoading(envio);
    requestHistory(envio).then(function(history){
      if(token!==requestToken)return;
      render(history,envio);
    }).catch(function(error){
      var panel=ensurePanel();
      if(token!==requestToken||!panel)return;
      if(!localPrevious(envio))panel.innerHTML='<p class="previous-review__notice">'+escapeHtml(error&&error.message||'No se pudo consultar el historial.')+'</p>';
    });
    return result;
  }

  function close(options){
    requestToken+=1;
    var result=original.cerrar(options);
    var panel=document.getElementById(PANEL_ID);
    if(panel)panel.hidden=true;
    return result;
  }

  window.CoordinadorMVPModal=Object.freeze(Object.assign({},original,{
    abrir:open,
    cerrar:close,
    pintarRevisionAnterior:function(envio){renderLoading(envio);},
    revisionAnteriorInstalada:true,
    historialRevisionesInstalado:true
  }));
})(window,document);
