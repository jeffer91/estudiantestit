/* Compatibilidad de Coordinadores: comentarios de devolución y alias controlados de carreras. */
(function(window){
  'use strict';

  var GRUPOS_CARRERAS=[
    {
      canonica:'UNIVERSITARIA EN DESARROLLO SOFTWARE Y CIBERSEGURIDAD',
      aliases:[
        'UNIVERSITARIA EN DESARROLLO SOFTWARE Y CIBERSEGURIDAD',
        'UNIVERSITARIA EN DESARROLLO DE SOFTWARE Y CIBERSEGURIDAD',
        'UNIVERSITARIA EN SOFTWARE Y CIBERSEGURIDAD',
        'DESARROLLO DE SOFTWARE Y CIBERSEGURIDAD',
        'DESARROLLO SOFTWARE Y CIBERSEGURIDAD'
      ]
    }
  ];

  function texto(valor){return String(valor===null||valor===undefined?'':valor).replace(/\s+/g,' ').trim();}
  function firma(valor){return texto(valor).toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function lista(valor){
    if(Array.isArray(valor))return valor.map(texto).filter(Boolean);
    return texto(valor).split(/[,;|\n]+/).map(texto).filter(Boolean);
  }
  function grupoDe(valor){
    var objetivo=firma(valor);
    if(!objetivo)return null;
    for(var i=0;i<GRUPOS_CARRERAS.length;i+=1){
      var grupo=GRUPOS_CARRERAS[i];
      var nombres=[grupo.canonica].concat(grupo.aliases||[]);
      for(var j=0;j<nombres.length;j+=1){if(firma(nombres[j])===objetivo)return grupo;}
    }
    return null;
  }
  function canonica(valor){var grupo=grupoDe(valor);return grupo?grupo.canonica:texto(valor);}
  function unicas(valores){
    var vistos={},salida=[];
    valores.forEach(function(item){var limpio=texto(item),key=firma(limpio);if(!limpio||vistos[key])return;vistos[key]=true;salida.push(limpio);});
    return salida;
  }
  function expandirCarreras(valor){
    var salida=[];
    lista(valor).forEach(function(item){
      var grupo=grupoDe(item);
      if(grupo)salida=salida.concat([grupo.canonica]).concat(grupo.aliases||[]);
      else salida.push(item);
    });
    return unicas(salida);
  }
  function carrerasCanonicas(valor){return unicas(lista(valor).map(canonica));}
  function normalizarEnvio(envio){
    if(!envio||typeof envio!=='object')return envio;
    var copia=Object.assign({},envio);
    var original=texto(copia.carrera||copia.nombreCarrera||copia.carreraNombre);
    var nombre=canonica(original);
    if(nombre){
      copia.carreraOriginal=original;
      copia.carrera=nombre;
      copia.nombreCarrera=nombre;
      copia.carreraNombre=nombre;
    }
    return copia;
  }
  function normalizarResolucion(res){
    var salida=Object.assign({},res||{});
    var comentario=texto(salida.comentarioCoordinador||salida.comentario||salida.observacion);
    if(comentario){
      salida.comentarioCoordinador=comentario;
      salida.comentario=comentario;
      salida.observacion=comentario;
    }
    return salida;
  }

  function instalar(){
    var original=window.CoordinadorMVPSheetsPrimary;
    if(!original)return false;
    if(original.__compatibilidadCoordinadoresInstalada)return true;

    var servicio=Object.assign({},original);

    if(typeof original.listarCoordinadores==='function'){
      servicio.listarCoordinadores=function(){
        var args=Array.prototype.slice.call(arguments);
        return Promise.resolve(original.listarCoordinadores.apply(original,args)).then(function(rows){
          return (Array.isArray(rows)?rows:[]).map(function(item){
            var copia=Object.assign({},item);
            copia.carreras=carrerasCanonicas(item&&item.carreras);
            copia.carrerasTexto=copia.carreras.join(', ');
            return copia;
          });
        });
      };
    }

    if(typeof original.listarEnvios==='function'){
      servicio.listarEnvios=function(opciones){
        var entrada=Object.assign({},opciones||{});
        entrada.carreras=expandirCarreras(entrada.carreras||entrada.carrera);
        return Promise.resolve(original.listarEnvios.call(original,entrada)).then(function(rows){
          return (Array.isArray(rows)?rows:[]).map(normalizarEnvio);
        });
      };
    }

    if(typeof original.consultarEnvioPorCedula==='function'){
      servicio.consultarEnvioPorCedula=function(){
        var args=Array.prototype.slice.call(arguments);
        return Promise.resolve(original.consultarEnvioPorCedula.apply(original,args)).then(normalizarEnvio);
      };
    }

    if(typeof original.aprobarEnvio==='function'){
      servicio.aprobarEnvio=function(envio,resolucion){
        return original.aprobarEnvio.call(original,normalizarEnvio(envio),normalizarResolucion(resolucion));
      };
    }

    if(typeof original.devolverEnvio==='function'){
      servicio.devolverEnvio=function(envio,resolucion){
        return original.devolverEnvio.call(original,normalizarEnvio(envio),normalizarResolucion(resolucion));
      };
    }

    Object.defineProperty(servicio,'__compatibilidadCoordinadoresInstalada',{value:true,enumerable:false});
    window.CoordinadorMVPSheetsPrimary=Object.freeze(servicio);
    window.CoordinadorMVPCarreras=Object.freeze({
      canonica:canonica,
      expandir:expandirCarreras,
      normalizarLista:carrerasCanonicas,
      grupos:GRUPOS_CARRERAS.slice()
    });
    return true;
  }

  if(!instalar()){
    var intentos=0;
    var timer=window.setInterval(function(){
      intentos+=1;
      if(instalar()||intentos>120)window.clearInterval(timer);
    },25);
  }
})(window);
