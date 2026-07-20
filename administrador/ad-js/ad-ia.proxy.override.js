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
    window.AD_IA_PROXY_URL='https://titulos.pages.dev/api/ia';
    window.ADIAService.__proxyProduccionInstalado=true;
  }
  instalar();
})(window);
