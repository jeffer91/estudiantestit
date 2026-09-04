/* Protección de tiempo máximo para que Coordinadores nunca quede en Cargando... indefinidamente. */
(function(window){
  'use strict';

  var TIMEOUT_MS=18000;

  function texto(v){return String(v===null||v===undefined?'':v).trim();}

  function limitar(promesa,etiqueta){
    return new Promise(function(resolve,reject){
      var terminado=false;
      var timer=window.setTimeout(function(){
        if(terminado)return;
        terminado=true;
        reject(new Error((etiqueta||'La consulta')+' tardó más de 18 segundos. Intenta Actualizar nuevamente.'));
      },TIMEOUT_MS);

      Promise.resolve(promesa).then(function(valor){
        if(terminado)return;
        terminado=true;
        window.clearTimeout(timer);
        resolve(valor);
      }).catch(function(error){
        if(terminado)return;
        terminado=true;
        window.clearTimeout(timer);
        reject(error);
      });
    });
  }

  function instalar(){
    var original=window.CoordinadorMVPSheetsPrimary;
    if(!original)return false;
    if(original.__timeoutProteccionInstalada)return true;

    var servicio=Object.assign({},original);
    var metodos={
      leerConfiguracion:'La configuración de Firebase',
      listarCoordinadores:'La lista de coordinadores',
      listarEnvios:'La consulta de títulos',
      consultarEnvioPorCedula:'El detalle del estudiante',
      diagnostico:'El diagnóstico de Firebase'
    };

    Object.keys(metodos).forEach(function(nombre){
      if(typeof original[nombre]!=='function')return;
      servicio[nombre]=function(){
        var args=Array.prototype.slice.call(arguments);
        var resultado;
        try{resultado=original[nombre].apply(original,args);}catch(error){return Promise.reject(error);}
        return limitar(resultado,metodos[nombre]);
      };
    });

    Object.defineProperty(servicio,'__timeoutProteccionInstalada',{value:true,enumerable:false});
    window.CoordinadorMVPSheetsPrimary=Object.freeze(servicio);
    return true;
  }

  if(!instalar()){
    var intentos=0;
    var timer=window.setInterval(function(){
      intentos+=1;
      if(instalar()||intentos>120)window.clearInterval(timer);
    },25);
  }

  window.CoordinadorMVPTimeout=Object.freeze({
    instalar:instalar,
    timeoutMs:TIMEOUT_MS,
    descripcion:texto('Evita que el overlay de carga permanezca abierto si una consulta de red no responde.')
  });
})(window);
