/* Muestra al coordinador el comentario de la revisión anterior tras un reenvío. */
(function(window,document){
  'use strict';

  var original=window.CoordinadorMVPModal;
  var PANEL_ID='revisionAnteriorPanel';
  var STYLE_ID='revisionAnteriorStyles';

  if(!original||window.__COORDINADOR_REVISION_ANTERIOR_INSTALADA__)return;
  window.__COORDINADOR_REVISION_ANTERIOR_INSTALADA__=true;

  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function objeto(valor){return valor&&typeof valor==='object'?valor:{};}
  function normalizarEstado(valor){return texto(valor).toUpperCase().replace(/[^A-Z0-9]+/g,'_');}

  function revisionAnterior(envio){
    envio=objeto(envio);
    var raw=objeto(envio.raw);
    var revision=objeto(envio.revisionAnterior);
    if(!Object.keys(revision).length)revision=objeto(raw.revisionAnterior);

    return{
      numero:Number(
        revision.numeroResolucion||
        envio.numeroRevisionAnterior||
        raw.numeroRevisionAnterior||0
      ),
      estado:normalizarEstado(
        revision.estado||
        envio.estadoRevisionAnterior||
        raw.estadoRevisionAnterior
      ),
      coordinador:texto(
        revision.coordinador||revision.nombreCoordinador||
        envio.coordinadorRevisionAnterior||raw.coordinadorRevisionAnterior
      ),
      fecha:texto(
        revision.fechaResolucion||revision.fechaRevision||
        envio.fechaRevisionAnterior||raw.fechaRevisionAnterior
      ),
      comentario:texto(
        revision.observacion||revision.comentarioCoordinador||revision.comentario||revision.motivo||
        envio.comentarioRevisionAnterior||raw.comentarioRevisionAnterior
      )
    };
  }

  function instalarEstilos(){
    var style;
    if(document.getElementById(STYLE_ID))return;
    style=document.createElement('style');
    style.id=STYLE_ID;
    style.textContent=
      '.previous-review{margin:18px 0;padding:18px;border:1px solid #e2c36d;border-radius:16px;background:#fff9e8}' +
      '.previous-review[hidden]{display:none!important}' +
      '.previous-review__head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}' +
      '.previous-review__head h3{margin:2px 0 0;color:#14213d;font-size:17px}' +
      '.previous-review__eyebrow{margin:0;color:#80620e;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}' +
      '.previous-review__badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:#f2df9c;color:#594300;font-size:11px;font-weight:800;white-space:nowrap}' +
      '.previous-review__meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}' +
      '.previous-review__meta div{padding:10px;border-radius:10px;background:rgba(255,255,255,.76)}' +
      '.previous-review__meta span,.previous-review__comment span{display:block;margin-bottom:3px;color:#74652f;font-size:11px;font-weight:800;text-transform:uppercase}' +
      '.previous-review__meta strong{display:block;color:#26354d;font-size:13px;overflow-wrap:anywhere}' +
      '.previous-review__comment{padding:13px;border-left:4px solid #c79b25;border-radius:9px;background:#fff;color:#283548}' +
      '.previous-review__comment p{margin:0;white-space:pre-wrap;line-height:1.5}' +
      '.previous-review__notice{margin:11px 0 0;color:#655928;font-size:12px;line-height:1.45}' +
      '@media(max-width:640px){.previous-review__meta{grid-template-columns:1fr}.previous-review__head{display:block}.previous-review__badge{margin-top:8px}}';
    document.head.appendChild(style);
  }

  function asegurarPanel(){
    var panel=document.getElementById(PANEL_ID);
    var modal=document.getElementById('detalleModal');
    var body=modal&&modal.querySelector('.modal__body');
    var resolution=body&&body.querySelector('.resolution-box');
    if(panel)return panel;
    if(!body)return null;

    instalarEstilos();
    panel=document.createElement('section');
    panel.id=PANEL_ID;
    panel.className='previous-review';
    panel.hidden=true;
    panel.setAttribute('aria-labelledby',PANEL_ID+'Titulo');
    panel.innerHTML=
      '<div class="previous-review__head">' +
        '<div><p class="previous-review__eyebrow">Historial del proceso</p><h3 id="'+PANEL_ID+'Titulo">Comentario de la revisión anterior</h3></div>' +
        '<span class="previous-review__badge" id="revisionAnteriorBadge">REVISIÓN ANTERIOR</span>' +
      '</div>' +
      '<div class="previous-review__meta">' +
        '<div><span>Coordinador</span><strong id="revisionAnteriorCoordinador">-</strong></div>' +
        '<div><span>Fecha</span><strong id="revisionAnteriorFecha">-</strong></div>' +
        '<div><span>Número de revisión</span><strong id="revisionAnteriorNumero">-</strong></div>' +
      '</div>' +
      '<div class="previous-review__comment"><span>Comentario dejado al estudiante</span><p id="revisionAnteriorComentario">-</p></div>' +
      '<p class="previous-review__notice">Este comentario pertenece a la devolución anterior. El campo inferior queda disponible para registrar la nueva decisión.</p>';

    if(resolution)body.insertBefore(panel,resolution);
    else body.appendChild(panel);
    return panel;
  }

  function poner(id,valor,fallback){
    var elemento=document.getElementById(id);
    if(elemento)elemento.textContent=texto(valor)||fallback||'-';
  }

  function fechaLegible(valor){
    var raw=texto(valor);
    var date;
    if(!raw)return'';
    date=new Date(raw);
    if(Number.isNaN(date.getTime()))return raw;
    try{return date.toLocaleString('es-EC',{dateStyle:'medium',timeStyle:'short'});}
    catch(_error){return raw;}
  }

  function pintar(envio){
    var panel=asegurarPanel();
    var revision=revisionAnterior(envio);
    var visible=Boolean(revision.comentario||revision.coordinador||revision.fecha);
    if(!panel)return;

    panel.hidden=!visible;
    if(!visible)return;

    poner('revisionAnteriorBadge',revision.estado||'REVISIÓN ANTERIOR');
    poner('revisionAnteriorCoordinador',revision.coordinador,'No registrado');
    poner('revisionAnteriorFecha',fechaLegible(revision.fecha),'No registrada');
    poner('revisionAnteriorNumero',revision.numero?String(revision.numero):'No registrada');
    poner('revisionAnteriorComentario',revision.comentario,'Sin comentario registrado');
  }

  function abrir(envio){
    var resultado=original.abrir(envio);
    pintar(envio);
    return resultado;
  }

  function cerrar(opciones){
    var resultado=original.cerrar(opciones);
    var panel=document.getElementById(PANEL_ID);
    if(panel)panel.hidden=true;
    return resultado;
  }

  window.CoordinadorMVPModal=Object.freeze(Object.assign({},original,{
    abrir:abrir,
    cerrar:cerrar,
    pintarRevisionAnterior:pintar,
    revisionAnteriorInstalada:true
  }));
})(window,document);
