/* Coordinadores: compatibilidad sin lecturas globales de Firebase Títulos. */
(function(window){
  'use strict';

  var ultimoDiagnostico={consultas:0,respondidas:0,fallidas:0,filasRecibidas:0,enviosNormalizados:0,consultaFiltrada:true,fuente:'FIREBASE_TITULOS'};

  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function listaTexto(valor){if(Array.isArray(valor))return valor.map(texto).filter(Boolean);return texto(valor).split(/[,;|\n]+/).map(texto).filter(Boolean);}
  function construirPeriodos(envios){var mapa={},periodos=[];(Array.isArray(envios)?envios:[]).forEach(function(item){var id=texto(item&&item.periodoId||item&&item.periodo||item&&item.periodoLabel),label=texto(item&&item.periodoLabel||item&&item.periodo||id);if(!id||mapa[id])return;mapa[id]=true;periodos.push({id:id,label:label||id,activo:true,principal:false});});periodos.sort(function(a,b){return texto(b.id).localeCompare(texto(a.id),'es',{numeric:true});});if(periodos[0])periodos[0].principal=true;return{periodos:periodos,principal:periodos[0]||null,envios:Array.isArray(envios)?envios:[]};}

  function instalar(){
    var servicio=window.CoordinadorMVPSheetsPrimary;
    if(!servicio||servicio.__soloFirebaseTitulosInstalado)return Boolean(servicio);
    if(typeof servicio.listarEnvios!=='function')return false;
    var listarOriginal=servicio.listarEnvios.bind(servicio);
    var listarPeriodosOriginal=typeof servicio.listarPeriodos==='function'?servicio.listarPeriodos.bind(servicio):null;
    var invalidarOriginal=typeof servicio.invalidarCacheEnvios==='function'?servicio.invalidarCacheEnvios.bind(servicio):null;
    var diagnosticoOriginal=typeof servicio.obtenerDiagnosticoConsulta==='function'?servicio.obtenerDiagnosticoConsulta.bind(servicio):null;
    var servicioNuevo=Object.assign({},servicio);

    servicioNuevo.listarEnvios=function(opciones){
      opciones=opciones||{};
      var carreras=listaTexto(opciones.carreras||opciones.carrera),periodo=texto(opciones.periodoId||opciones.periodoLabel||opciones.periodo);
      if(!carreras.length&&!periodo){ultimoDiagnostico={consultas:0,respondidas:0,fallidas:0,filasRecibidas:0,enviosNormalizados:0,consultaFiltrada:true,carreras:[],periodo:'',fuente:'FIREBASE_TITULOS',mensaje:'No se realizó una lectura porque faltan carreras o período.'};return Promise.resolve([]);}
      ultimoDiagnostico={consultas:1,respondidas:0,fallidas:0,filasRecibidas:0,enviosNormalizados:0,consultaFiltrada:true,carreras:carreras.slice(),periodo:periodo,fuente:'FIREBASE_TITULOS'};
      return Promise.resolve(listarOriginal(opciones)).then(function(envios){var lista=Array.isArray(envios)?envios:[];ultimoDiagnostico.respondidas=1;ultimoDiagnostico.filasRecibidas=lista.length;ultimoDiagnostico.enviosNormalizados=lista.length;ultimoDiagnostico.fecha=new Date().toISOString();return lista;}).catch(function(error){ultimoDiagnostico.fallidas=1;ultimoDiagnostico.fecha=new Date().toISOString();throw error;});
    };
    servicioNuevo.listarPeriodos=function(opciones){opciones=opciones||{};if(listarPeriodosOriginal)return listarPeriodosOriginal(opciones);return servicioNuevo.listarEnvios(opciones).then(construirPeriodos);};
    servicioNuevo.invalidarCacheEnvios=function(){if(invalidarOriginal)invalidarOriginal();};
    servicioNuevo.obtenerDiagnosticoConsulta=function(){var anterior=diagnosticoOriginal?diagnosticoOriginal():{};return Object.assign({},anterior,ultimoDiagnostico,{consultaFiltrada:true});};
    servicioNuevo.__enviosPorCarreraInstalado=true;
    servicioNuevo.__enviosFlexiblesInstalado=true;
    servicioNuevo.__soloFirebaseTitulosInstalado=true;
    window.CoordinadorMVPSheetsPrimary=servicioNuevo;
    return true;
  }

  window.CoordinadorMVPEnviosCarreras={instalar:instalar};
  instalar();
})(window);
