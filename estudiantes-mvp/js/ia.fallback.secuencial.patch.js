/*
  Fallback secuencial para IA de Titulación.
  - Respeta la prioridad configurada en Firebase.
  - Prueba un solo motor a la vez.
  - Se detiene en cuanto obtiene tres opciones válidas.
  - Si un motor falla o devuelve un resultado incompleto, continúa con el siguiente.
  - Cada motor se consulta como máximo una vez por generación.
  - Nunca revela proveedor, marca, modelo ni credencial al estudiante.
*/
(function(window){
  'use strict';

  var instalado=false;
  var intentos=0;

  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function numero(v,f){var n=Number(v);return Number.isFinite(n)?n:Number(f||0);}

  function instalar(){
    var servicio=window.EstudianteMVPIATitulacion;
    var config=window.EstudianteMVPFirebaseIA;

    if(instalado)return;
    if(!servicio||!config||typeof servicio.generarOpcionesParaPropuesta!=='function'||typeof config.listarProveedoresActivos!=='function'){
      intentos+=1;
      if(intentos<240)window.setTimeout(instalar,25);
      return;
    }
    if(servicio.__fallbackSecuencial===true){instalado=true;return;}

    var original=servicio.generarOpcionesParaPropuesta;

    function generarSecuencial(params){
      params=params||{};

      return config.listarProveedoresActivos().then(function(motores){
        motores=Array.isArray(motores)?motores.slice():[];
        motores=motores.filter(function(m){return m&&m.activo!==false;}).sort(function(a,b){
          return numero(a.prioridad,999)-numero(b.prioridad,999);
        });

        if(!motores.length)throw new Error('La IA de Titulación no está disponible en este momento.');

        var mejor=null;
        var errores=[];

        function intentar(indice){
          if(indice>=motores.length){
            if(mejor){
              mejor.mejorDisponible=true;
              mejor.motoresUtilizados=Math.min(motores.length,indice);
              mejor.mensaje=mejor.mensaje||'Se conservaron las mejores opciones disponibles.';
              return Promise.resolve(mejor);
            }
            throw new Error('No fue posible completar la generación en este momento. Intenta nuevamente.');
          }

          var motor=motores[indice];
          var configReal=window.EstudianteMVPFirebaseIA;
          var configUnMotor=Object.assign({},configReal,{
            listarProveedoresActivos:function(){return Promise.resolve([motor]);},
            listarProveedores:function(){return Promise.resolve([motor]);},
            obtenerProveedorPreferido:function(){return motor;}
          });
          var paramsUnMotor=Object.assign({},params,{maxProcesos:1});
          var callbackOriginal=params.onProgress;

          paramsUnMotor.onProgress=function(detalle){
            detalle=Object.assign({},detalle||{});
            detalle.proceso=indice+1;
            detalle.maxProcesos=motores.length;
            detalle.motorActual=indice+1;
            detalle.motoresDisponibles=motores.length;
            detalle.mensaje=texto(detalle.mensaje)
              .replace(/Los motores internos están generando alternativas en paralelo\.?/i,'La IA de Titulación está generando alternativas.')
              .replace(/Completando en paralelo/ig,'Completando opciones');
            delete detalle.proveedor;
            delete detalle.provider;
            delete detalle.modelo;
            if(typeof callbackOriginal==='function'){
              try{callbackOriginal(detalle);}catch(_errorCallback){}
            }
          };

          var promesa;
          try{
            window.EstudianteMVPFirebaseIA=configUnMotor;
            promesa=Promise.resolve(original(paramsUnMotor));
          }catch(errorSincrono){
            promesa=Promise.reject(errorSincrono);
          }finally{
            window.EstudianteMVPFirebaseIA=configReal;
          }

          return promesa.then(function(resultado){
            var cantidad=numero(resultado&&resultado.cantidadOpciones,0);
            if(!cantidad&&resultado&&Array.isArray(resultado.opcionesFinales))cantidad=resultado.opcionesFinales.length;

            if(resultado&&typeof resultado==='object'){
              resultado.motoresUtilizados=indice+1;
              resultado.motoresDisponibles=motores.length;
              resultado.fallbackSecuencial=true;
            }

            if(cantidad>=3)return resultado;

            if(cantidad>0&&(!mejor||cantidad>numero(mejor.cantidadOpciones,0))){
              mejor=resultado;
            }
            return intentar(indice+1);
          }).catch(function(error){
            errores.push(texto(error&&error.message||error).slice(0,220));
            return intentar(indice+1);
          });
        }

        return intentar(0).catch(function(errorFinal){
          if(mejor)return mejor;
          void errores;
          throw errorFinal;
        });
      });
    }

    window.EstudianteMVPIATitulacion=Object.freeze(Object.assign({},servicio,{
      generarOpcionesParaPropuesta:generarSecuencial,
      generarNueveTitulos:generarSecuencial,
      generarTitulos3x3:generarSecuencial,
      __fallbackSecuencial:true,
      modo:'motores-internos-fallback-secuencial',
      version:'7.0.0'
    }));

    instalado=true;
  }

  instalar();
})(window);
