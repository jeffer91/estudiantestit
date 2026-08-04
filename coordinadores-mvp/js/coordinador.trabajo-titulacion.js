/* Detalle académico adicional para registros antiguos de Trabajo de Titulación. */
(function(window,document){
  'use strict';

  function text(value){return String(value===null||value===undefined?'':value).trim();}
  function escapeHtml(value){return text(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function typeOf(envio){return text(envio&&envio.tipoTrabajo||envio&&envio.raw&&envio.raw.tipoTrabajo).toUpperCase();}
  function detailsOf(envio){var raw=envio&&envio.raw&&typeof envio.raw==='object'?envio.raw:{};var list=envio&&Array.isArray(envio.propuestasDetalle)?envio.propuestasDetalle:raw.propuestasDetalle;return Array.isArray(list)?list:[];}
  function hasStructure(proposal){return Boolean(proposal&&[
    proposal.accionPrincipal,proposal.accion,proposal.productoFinal,proposal.producto,
    proposal.problemaNecesidad,proposal.problema,proposal.proposito,proposal.finalidad,
    proposal.unidadEstudio,proposal.grupoEstudio,proposal.lugarContexto,proposal.contexto,
    proposal.anioPeriodo,proposal.periodo,proposal.objetivoGeneral,proposal.objetivo
  ].some(function(value){return text(value);}));}
  function item(label,value,full){return'<div class="work-detail__item'+(full?' work-detail__item--full':'')+'"><span>'+escapeHtml(label)+'</span><strong>'+escapeHtml(value||'-')+'</strong></div>';}
  function render(envio){
    var section=document.getElementById('detalleTrabajoTitulacion');
    var content=document.getElementById('detalleTrabajoContenido');
    var badge=document.getElementById('detalleTipoTrabajo');
    if(!section||!content)return;
    var isWork=typeOf(envio)==='TRABAJO_TITULACION';
    var list=detailsOf(envio);
    var structured=list.filter(hasStructure);
    if(badge)badge.textContent=isWork?'Trabajo de Titulación':'Artículo académico';
    section.hidden=!isWork||!structured.length;
    if(!isWork||!structured.length){content.innerHTML='';return;}
    content.innerHTML=structured.map(function(proposal,index){return'<article class="work-detail__proposal"><h4>Propuesta '+(index+1)+'</h4><div class="work-detail__grid">'+
      item('Acción principal',proposal.accionPrincipal||proposal.accion)+
      item('Producto final',proposal.productoFinal||proposal.producto)+
      item('Problema o necesidad',proposal.problemaNecesidad||proposal.problema,true)+
      item('Propósito',proposal.proposito||proposal.finalidad,true)+
      item('Unidad de estudio',proposal.unidadEstudio||proposal.grupoEstudio)+
      item('Lugar o contexto',proposal.lugarContexto||proposal.contexto)+
      item('Año o período',proposal.anioPeriodo||proposal.periodo)+
      item('Objetivo general',proposal.objetivoGeneral||proposal.objetivo,true)+
      '</div></article>';}).join('');
  }

  function install(){
    var original=window.CoordinadorMVPModal;
    if(!original||original.__trabajoTitulacionExtendido)return false;
    var extended=Object.assign({},original);
    var open=typeof original.abrir==='function'?original.abrir.bind(original):null;
    var close=typeof original.cerrar==='function'?original.cerrar.bind(original):null;
    if(open)extended.abrir=function(envio){var result=open(envio);render(envio);return result;};
    if(close)extended.cerrar=function(options){var result=close(options);render(null);return result;};
    Object.defineProperty(extended,'__trabajoTitulacionExtendido',{value:true});
    window.CoordinadorMVPModal=Object.freeze(extended);
    return true;
  }

  if(!install()){
    var attempts=0,timer=window.setInterval(function(){attempts+=1;if(install()||attempts>100)window.clearInterval(timer);},25);
  }
})(window,document);
