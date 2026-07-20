/* Resuelve la API central para el Administrador. */
(function(window){
  'use strict';
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  var host=texto(window.location&&window.location.hostname).toLowerCase();
  var local=['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(host)>=0;
  if(!texto(window.TITULOS_API_BASE)){
    window.TITULOS_API_BASE=local?'http://127.0.0.1:8788':'https://titulos.pages.dev';
  }
})(window);
