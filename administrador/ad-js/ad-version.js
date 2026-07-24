/* Mantiene visible la versión publicada más reciente. */
(function(window,document){
  'use strict';
  var VERSION='3.3.3';
  function update(){
    var badge=document.getElementById('ad-badge-version');
    var footer=document.getElementById('ad-footer-version');
    if(badge)badge.textContent='v'+VERSION;
    if(footer)footer.textContent='Versión '+VERSION;
    document.documentElement.setAttribute('data-ad-version',VERSION);
  }
  update();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',update,{once:true});
  window.addEventListener('load',update,{once:true});
  window.setTimeout(update,500);
  window.setTimeout(update,1500);
  window.setTimeout(update,3500);
})(window,document);
