/* =========================================================
Archivo: coordinador.envios.carreras.js
Ruta: /coordinadores-mvp/js/coordinador.envios.carreras.js
Función:
- Consultar Google Sheets por cada carrera asignada al coordinador.
- Evitar enviar varias carreras como una sola cadena.
- Unificar y eliminar registros duplicados.
- Mantener Google Sheets como fuente principal.
========================================================= */
(function(window){
  'use strict';

  function texto(valor){
    return String(valor===null||valor===undefined?'':valor).trim();
  }

  function normal(valor){
    return texto(valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function obtenerNombreCarrera(item){
    if(typeof item==='string')return texto(item);
    item=item||{};
    return texto(
      item.nombreCarrera||
      item.NombreCarrera||
      item.carrera||
      item.Carrera||
      item.codigoCarrera||
      item.CodigoCarrera||
      item.key||
      item.id||
      ''
    );
  }

  function obtenerCarreras(opciones){
    opciones=opciones||{};
    var origen=opciones.carreras||(opciones.coordinador&&opciones.coordinador.carreras)||[];

    if(!Array.isArray(origen)){
      origen=texto(origen).split(/[,;\n]+/);
    }

    var mapa={};
    var salida=[];

    origen.forEach(function(item){
      var carrera=obtenerNombreCarrera(item);
      var clave=normal(carrera);
      if(!clave||mapa[clave])return;
      mapa[clave]=true;
      salida.push(carrera);
    });

    return salida;
  }

  function obtenerPeriodo(opciones){
    opciones=opciones||{};
    var periodo=opciones.periodo||{};

    if(typeof periodo==='string'){
      return {id:texto(periodo),label:texto(periodo)};
    }

    return {
      id:texto(periodo.id||periodo.periodoId||''),
      label:texto(periodo.label||periodo.periodoLabel||periodo.periodo||periodo.id||'')
    };
  }

  function extraerLista(valor,profundidad){
    if(profundidad>7||valor===null||valor===undefined)return [];
    if(Array.isArray(valor))return valor;
    if(typeof valor!=='object')return [];

    var claves=['envios','estudiantes','registros','filas','rows','items','resultados','resultado','result','data'];
    var i;

    for(i=0;i<claves.length;i+=1){
      if(Array.isArray(valor[claves[i]]))return valor[claves[i]];
    }

    var nombres=Object.keys(valor);
    for(i=0;i<nombres.length;i+=1){
      var encontrada=extraerLista(valor[nombres[i]],profundidad+1);
      if(encontrada.length)return encontrada;
    }

    return [];
  }

  function claveEnvio(envio,indice){
    envio=envio||{};
    return texto(
      envio.id||
      envio._clave||
      [envio.cedula,envio.periodoId||envio.periodoLabel||envio.periodo,envio.carrera,envio.fila||indice].join('|')
    );
  }

  function instalar(){
    var servicio=window.CoordinadorMVPSheetsPrimary;
    if(!servicio||servicio.__enviosPorCarreraInstalado)return false;
    if(typeof servicio.enviarGet!=='function'||typeof servicio.normalizarEnvio!=='function')return false;

    var enviarGet=servicio.enviarGet;
    var normalizarEnvio=servicio.normalizarEnvio;

    servicio.listarEnvios=function(opciones){
      opciones=opciones||{};
      var carreras=obtenerCarreras(opciones);
      var periodo=obtenerPeriodo(opciones);
      var consultas=carreras.length?carreras:[''];

      return Promise.allSettled(consultas.map(function(carrera){
        var payload={
          hoja:'Envios',
          estado:''
        };

        if(carrera){
          payload.carrera=carrera;
          payload.carreras=carrera;
        }
        if(periodo.label)payload.periodo=periodo.label;
        if(periodo.id)payload.periodoId=periodo.id;

        return enviarGet('LISTAR_ENVIOS_POR_CARRERA',payload).then(function(respuesta){
          return extraerLista(respuesta,0);
        });
      })).then(function(resultados){
        var filas=[];
        var errores=[];

        resultados.forEach(function(resultado){
          if(resultado.status==='fulfilled'){
            filas=filas.concat(resultado.value||[]);
          }else{
            errores.push(resultado.reason);
          }
        });

        if(!filas.length&&errores.length===resultados.length){
          throw errores[0];
        }

        var mapa={};
        var envios=[];

        filas.map(normalizarEnvio).forEach(function(envio,indice){
          if(!envio||!envio.cedula)return;
          if(!envio.titulo1&&!envio.titulo2&&!envio.titulo3)return;

          var clave=claveEnvio(envio,indice);
          if(mapa[clave])return;
          mapa[clave]=true;
          envios.push(envio);
        });

        return envios;
      });
    };

    servicio.__enviosPorCarreraInstalado=true;
    return true;
  }

  window.CoordinadorMVPEnviosCarreras={instalar:instalar};
  instalar();
})(window);
