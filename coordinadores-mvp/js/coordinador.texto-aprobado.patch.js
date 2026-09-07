/* Mantiene el texto visible del botón de aprobación solicitado para Coordinadores. */
(function(window,document){
  'use strict';

  var TEXTO='Aprobado';
  var TEXTO_CARGANDO='Guardando...';
  var observer=null;

  function boton(){return document.getElementById('btnAprobarEnvio');}

  function aplicar(){
    var el=boton();
    if(!el)return false;
    var actual=String(el.textContent||'').trim();
    if(actual&&actual!==TEXTO_CARGANDO&&actual!==TEXTO)el.textContent=TEXTO;
    return true;
  }

  function iniciar(){
    var el=boton();
    aplicar();
    if(!el||typeof MutationObserver!=='function')return;
    if(observer)observer.disconnect();
    observer=new MutationObserver(function(){aplicar();});
    observer.observe(el,{childList:true,characterData:true,subtree:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);
  else iniciar();

  window.CoordinadorMVPTextoAprobadoPatch=Object.freeze({aplicar:aplicar});
})(window,document);
