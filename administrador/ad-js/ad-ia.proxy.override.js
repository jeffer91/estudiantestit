/* Compatibilidad del módulo IA seguro. */
(function(window){
  'use strict';
  var intentos=0;
  function instalar(){
    if(!window.ADIAService){
      intentos+=1;
      if(intentos<120)window.setTimeout(instalar,100);
      return;
    }
    var base=String(window.TITULOS_API_BASE||'https://titulos.pages.dev').replace(/\/$/,'');
    window.AD_IA_PROXY_URL=base+'/api/ia';
    window.ADIAService.__proxyProduccionInstalado=true;
  }
  instalar();
})(window);
