/* Compatibilidad de Coordinadores: comentarios de devolución, alias de carreras y estado consolidado. */
(function(window){
  'use strict';

  var GRUPOS_CARRERAS=[
    {
      canonica:'UNIVERSITARIA EN DESARROLLO SOFTWARE Y CIBERSEGURIDAD',
      identificadores:[
        '560613D01-P-1701',
        'carrera_a622d13fbc34'
      ],
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
  function estado(valor){return firma(valor).replace(/ /g,'_');}
  function verdadero(valor){return valor===true||['TRUE','SI','SÍ','1','YES'].indexOf(texto(valor).toUpperCase())>=0;}
  function lista(valor){
    if(Array.isArray(valor))return valor.map(texto).filter(Boolean);
    return texto(valor).split(/[,;|\n]+/).map(texto).filter(Boolean);
  }
  function grupoDe(valor){
    var objetivo=firma(valor);
    if(!objetivo)return null;
    for(var i=0;i<GRUPOS_CARRERAS.length;i+=1){
      var grupo=GRUPOS_CARRERAS[i];
      var nombres=[grupo.canonica].concat(grupo.aliases||[]).concat(grupo.identificadores||[]);
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
      if(grupo)salida=salida.concat([grupo.canonica]).concat(grupo.aliases||[]).concat(grupo.identificadores||[]);
      else salida.push(item);
    });
    return unicas(salida);
  }
  function carrerasCanonicas(valor){return unicas(lista(valor).map(canonica));}
  function evidenciaValidacionCoordinacion(envio){
    envio=envio||{};
    var raw=envio.raw&&typeof envio.raw==='object'?envio.raw:{};
    var resultado=texto(envio.resultadoCoordinador||raw.resultadoCoordinador).toUpperCase();
    var titulo=texto(envio.tituloCoordinador||raw.tituloCoordinador||raw.tituloValidadoCoordinador);
    var fecha=texto(envio.fechaValidacionCoordinador||raw.fechaValidacionCoordinador);
    return verdadero(envio.validadoCoordinador)||
      verdadero(raw.validadoCoordinador)||
      resultado.indexOf('APROBADO_')===0||
      Boolean(titulo&&fecha);
  }
  function normalizarEstadoFlujo(envio){
    var actual=estado(envio&&envio.estadoProceso||envio&&envio.estado||envio&&envio.estadoFinal);
    var previos=['PENDIENTE_REVISION','PENDIENTE_COORDINADOR','PENDIENTE_SYNC','ENVIADO','PENDIENTE','APROBADO','REEMPLAZADO'];
    if(evidenciaValidacionCoordinacion(envio)&&previos.indexOf(actual)>=0){
      envio.estado='PENDIENTE_INVESTIGADOR';
      envio.estadoProceso='PENDIENTE_INVESTIGADOR';
      envio.estadoFinal='PENDIENTE_INVESTIGADOR';
      envio.requiereAccionDe='INVESTIGACION';
      envio.puedeRevisar=false;
    }
    return envio;
  }
  function normalizarEnvio(envio){
    if(!envio||typeof envio!=='object')return envio;
    var copia=Object.assign({},envio);
    var original=texto(copia.carrera||copia.nombreCarrera||copia.carreraNombre);
    var identificador=texto(copia.codigoCarrera||copia.carreraCodigo||copia.CodigoCarrera||copia.carreraId);
    var nombre=canonica(grupoDe(identificador)?identificador:original);
    if(nombre){
      copia.carreraOriginal=original;
      copia.carrera=nombre;
      copia.nombreCarrera=nombre;
      copia.carreraNombre=nombre;
    }
    return normalizarEstadoFlujo(copia);
  }
  function comentarioResolucion(resolucion){
    resolucion=resolucion||{};
    var candidatos=[resolucion.comentarioCoordinador,resolucion.comentario,resolucion.observacion];
    for(var i=0;i<candidatos.length;i+=1){
      var valor=texto(candidatos[i]);
      if(valor)return valor;
    }
    return'';
  }
  function normalizarResolucion(res){
    var salida=Object.assign({},res||{});
    var comentario=comentarioResolucion(salida);
    /*
      El modal usa comentarioCoordinador, mientras que versiones anteriores del
      servicio esperaban comentario u observacion. Se rellenan siempre las tres
      claves para que aprobar y devolver compartan exactamente el mismo texto.
    */
    salida.comentarioCoordinador=comentario;
    salida.comentario=comentario;
    salida.observacion=comentario;
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
        var idEsperado=texto(args[3]);
        return Promise.resolve(original.consultarEnvioPorCedula.apply(original,args)).then(function(actual){
          var normalizado=normalizarEnvio(actual);
          var st=window.CoordinadorMVPState;
          var listaActual=st&&typeof st.obtenerEnvios==='function'?st.obtenerEnvios():[];
          var base=(Array.isArray(listaActual)?listaActual:[]).find(function(item){
            var id=texto(item&&item.id||item&&item._docId||item&&item._clave);
            return idEsperado&&id===idEsperado;
          });
          if(base){
            base=normalizarEnvio(base);
            /* La fila seleccionada proviene de la consulta filtrada por estado y
               es la referencia del expediente abierto. Evitamos que una lectura
               histórica por cédula vuelva a mostrarlo como "Por revisar". */
            normalizado=Object.assign({},normalizado,{
              id:base.id||normalizado.id,
              _clave:base._clave||normalizado._clave,
              estado:base.estado||normalizado.estado,
              estadoProceso:base.estadoProceso||normalizado.estadoProceso,
              estadoFinal:base.estadoFinal||normalizado.estadoFinal,
              puedeRevisar:base.puedeRevisar,
              requiereAccionDe:base.requiereAccionDe||normalizado.requiereAccionDe,
              carrera:base.carrera||normalizado.carrera,
              nombreCarrera:base.nombreCarrera||normalizado.nombreCarrera,
              carreraNombre:base.carreraNombre||normalizado.carreraNombre,
              codigoCarrera:base.codigoCarrera||normalizado.codigoCarrera
            });
          }
          return normalizarEnvio(normalizado);
        });
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
