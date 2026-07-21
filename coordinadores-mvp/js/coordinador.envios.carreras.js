/* =========================================================
Archivo: coordinador.envios.carreras.js
Ruta: /coordinadores-mvp/js/coordinador.envios.carreras.js
Función:
- Leer todos los envíos una sola vez desde RESPALDO TITULOS APP.
- Construir los períodos desde esos mismos envíos.
- Reutilizar la lectura durante 60 segundos.
- Evitar una consulta adicional por cada carrera del coordinador.
========================================================= */
(function(window){
  'use strict';

  var CACHE_MS=60*1000;
  var cache={envios:null,expira:0,promesa:null};
  var ultimoDiagnostico={consultas:0,respondidas:0,fallidas:0,filasRecibidas:0,enviosNormalizados:0,cache:false};

  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function normal(valor){return texto(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function extraerLista(valor,profundidad){
    if(profundidad>8||valor===null||valor===undefined)return[];
    if(Array.isArray(valor))return valor;
    if(typeof valor!=='object')return[];
    var claves=['envios','estudiantes','registros','filas','rows','items','resultados','resultado','result','data'];
    var i;
    for(i=0;i<claves.length;i+=1)if(Array.isArray(valor[claves[i]]))return valor[claves[i]];
    var nombres=Object.keys(valor);
    for(i=0;i<nombres.length;i+=1){var encontrada=extraerLista(valor[nombres[i]],profundidad+1);if(encontrada.length)return encontrada;}
    return[];
  }
  function claveEnvio(envio,indice){envio=envio||{};return texto(envio.id||envio._clave||[envio.cedula,envio.periodoId||envio.periodoLabel||envio.periodo,envio.carrera,envio.fila||indice].join('|'));}
  function normalizarFilas(filas,normalizarEnvio){
    var mapa={};var envios=[];
    (Array.isArray(filas)?filas:[]).map(normalizarEnvio).forEach(function(envio,indice){
      if(!envio||!envio.cedula)return;
      if(!envio.titulo1&&!envio.titulo2&&!envio.titulo3)return;
      var clave=claveEnvio(envio,indice);
      if(mapa[clave])return;
      mapa[clave]=true;envios.push(envio);
    });
    return envios;
  }
  function construirPeriodosDesdeEnvios(lista){
    var mapa={};var periodos=[];
    (Array.isArray(lista)?lista:[]).forEach(function(item){
      item=item||{};
      var id=texto(item.periodoId||item.periodoLabel||item.periodo);
      var label=texto(item.periodoLabel||item.periodo||item.periodoId);
      var clave=normal(id||label);
      if(!clave||mapa[clave])return;
      mapa[clave]=true;periodos.push({id:id||label,label:label||id,activo:true});
    });
    periodos.sort(function(a,b){return texto(b.label).localeCompare(texto(a.label),'es',{numeric:true});});
    if(periodos.length)periodos[0].principal=true;
    return{periodos:periodos,principal:periodos[0]||null,envios:Array.isArray(lista)?lista:[]};
  }
  function invalidar(){cache={envios:null,expira:0,promesa:null};}

  function instalar(){
    var servicio=window.CoordinadorMVPSheetsPrimary;
    if(!servicio||servicio.__enviosFlexiblesInstalado)return false;
    if(typeof servicio.enviarGet!=='function'||typeof servicio.normalizarEnvio!=='function')return false;

    var enviarGet=servicio.enviarGet;
    var normalizarEnvio=servicio.normalizarEnvio;

    function cargarTodos(forzar){
      var vigente=Array.isArray(cache.envios)&&cache.expira>Date.now();
      if(!forzar&&vigente){ultimoDiagnostico.cache=true;return Promise.resolve(cache.envios);}
      if(!forzar&&cache.promesa)return cache.promesa;

      ultimoDiagnostico={consultas:1,respondidas:0,fallidas:0,filasRecibidas:0,enviosNormalizados:0,cache:false};
      cache.promesa=enviarGet('LISTAR_ENVIOS_POR_CARRERA',{
        hoja:'Envios',estado:'',todas:'true',incluirTodos:'true'
      }).then(function(respuesta){
        ultimoDiagnostico.respondidas=1;
        var filas=extraerLista(respuesta,0);
        ultimoDiagnostico.filasRecibidas=filas.length;
        var envios=normalizarFilas(filas,normalizarEnvio);
        ultimoDiagnostico.enviosNormalizados=envios.length;
        cache.envios=envios;cache.expira=Date.now()+CACHE_MS;
        return envios;
      }).catch(function(error){
        ultimoDiagnostico.fallidas=1;
        throw error;
      }).finally(function(){cache.promesa=null;});
      return cache.promesa;
    }

    servicio.listarEnvios=function(opciones){opciones=opciones||{};return cargarTodos(opciones.forzar===true||opciones.force===true);};
    servicio.listarPeriodos=function(opciones){opciones=opciones||{};return cargarTodos(opciones.forzar===true||opciones.force===true).then(function(lista){
      var resultado=construirPeriodosDesdeEnvios(lista);
      if(resultado.periodos.length)return resultado;
      var cfg=window.CoordinadorMVPConfig;
      var id=cfg&&cfg.obtener?cfg.obtener('periodos.fallbackId','2026-02__2026-08'):'2026-02__2026-08';
      var label=cfg&&cfg.obtener?cfg.obtener('periodos.fallbackLabel','Febrero 2026 a Agosto 2026'):'Febrero 2026 a Agosto 2026';
      var fallback={id:id,label:label,activo:true,principal:true,fallback:true};
      return{periodos:[fallback],principal:fallback,envios:lista};
    });};
    servicio.invalidarCacheEnvios=invalidar;
    servicio.construirPeriodosDesdeEnvios=construirPeriodosDesdeEnvios;
    servicio.obtenerDiagnosticoConsulta=function(){return Object.assign({},ultimoDiagnostico,{cacheVigente:Array.isArray(cache.envios)&&cache.expira>Date.now()});};
    servicio.__enviosPorCarreraInstalado=true;
    servicio.__enviosFlexiblesInstalado=true;
    return true;
  }

  window.CoordinadorMVPEnviosCarreras={instalar:instalar,invalidar:invalidar};
  instalar();
})(window);
