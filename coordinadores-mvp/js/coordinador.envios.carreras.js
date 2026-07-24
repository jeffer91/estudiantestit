/* =========================================================
Archivo: coordinador.envios.carreras.js
Ruta: /coordinadores-mvp/js/coordinador.envios.carreras.js
Función:
- Leer únicamente la colección envios de Firebase Títulos.
- Construir los períodos a partir de los envíos existentes.
- Reutilizar la lectura durante 60 segundos.
========================================================= */
(function(window){
  'use strict';

  var CACHE_MS=60*1000;
  var cache={envios:null,periodos:null,expira:0,promesa:null};
  var ultimoDiagnostico={consultas:0,respondidas:0,fallidas:0,filasRecibidas:0,enviosNormalizados:0,cache:false,fuente:'FIREBASE_TITULOS'};

  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function normal(valor){return texto(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function firmaPeriodo(valor){
    var base=normal(valor);if(!base)return'';
    var meses={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
    Object.keys(meses).forEach(function(mes){base=base.replace(new RegExp('\\b'+mes+'\\b','g'),meses[mes]);});
    var pares=[],vistos={},match;
    function add(anio,mes){mes=String(Number(mes)).padStart(2,'0');var par=anio+'-'+mes;if(Number(mes)>=1&&Number(mes)<=12&&!vistos[par]){vistos[par]=true;pares.push(par);}}
    var ym=/\b(20\d{2})\s+(\d{1,2})\b/g;while((match=ym.exec(base)))add(match[1],match[2]);
    var my=/\b(\d{1,2})\s+(20\d{2})\b/g;while((match=my.exec(base)))add(match[2],match[1]);
    if(pares.length>=2)return pares[0]+'__'+pares[pares.length-1];
    return pares[0]||base;
  }
  function extraerLista(valor,profundidad){
    if(profundidad>8||valor===null||valor===undefined)return[];
    if(Array.isArray(valor))return valor;
    if(typeof valor!=='object')return[];
    var claves=['envios','registros','filas','rows','items','resultados','resultado','result','data'];
    for(var i=0;i<claves.length;i+=1)if(Array.isArray(valor[claves[i]]))return valor[claves[i]];
    var nombres=Object.keys(valor);
    for(var j=0;j<nombres.length;j+=1){var encontrada=extraerLista(valor[nombres[j]],profundidad+1);if(encontrada.length)return encontrada;}
    return[];
  }
  function claveEnvio(envio,indice){envio=envio||{};return texto(envio.id||envio._clave||envio.envioId||[envio.cedula,envio.periodoId||envio.periodoLabel||envio.periodo,envio.carrera,indice].join('|'));}
  function tieneTitulos(envio){return Boolean(envio&&(envio.titulo1||envio.titulo2||envio.titulo3));}
  function normalizarFilas(filas,normalizarEnvio){
    var mapa={},envios=[];
    (Array.isArray(filas)?filas:[]).map(normalizarEnvio).forEach(function(envio,indice){
      if(!envio||!envio.cedula||!tieneTitulos(envio))return;
      var clave=claveEnvio(envio,indice);if(mapa[clave])return;mapa[clave]=true;envios.push(envio);
    });
    return envios;
  }
  function construirPeriodos(envios){
    var mapa={},periodos=[];
    (Array.isArray(envios)?envios:[]).forEach(function(item){
      var id=texto(item.periodoId||item.periodo||item.periodoLabel);
      var label=texto(item.periodoLabel||item.periodo||item.periodoId);
      var firma=firmaPeriodo(label)||firmaPeriodo(id)||id;
      if(!firma||mapa[firma])return;
      mapa[firma]=true;
      periodos.push({id:id||firma,label:label||id||firma,activo:true,principal:false,firma:firma});
    });
    periodos.sort(function(a,b){var finA=(a.firma||'').split('__').pop(),finB=(b.firma||'').split('__').pop();if(finA!==finB)return finB.localeCompare(finA,'es',{numeric:true});return (b.firma||'').localeCompare(a.firma||'','es',{numeric:true});});
    if(periodos[0])periodos[0].principal=true;
    periodos.forEach(function(item){delete item.firma;});
    return{periodos:periodos,principal:periodos[0]||null,envios:envios};
  }
  function invalidar(){cache={envios:null,periodos:null,expira:0,promesa:null};}

  function instalar(){
    var servicio=window.CoordinadorMVPSheetsPrimary;
    if(!servicio||servicio.__soloFirebaseTitulosInstalado)return false;
    if(typeof servicio.enviarGet!=='function'||typeof servicio.normalizarEnvio!=='function')return false;
    var enviarGet=servicio.enviarGet,normalizarEnvio=servicio.normalizarEnvio;

    function cargarTodos(forzar){
      if(!forzar&&Array.isArray(cache.envios)&&cache.expira>Date.now()){ultimoDiagnostico.cache=true;return Promise.resolve(cache.envios);}
      if(!forzar&&cache.promesa)return cache.promesa;
      ultimoDiagnostico={consultas:1,respondidas:0,fallidas:0,filasRecibidas:0,enviosNormalizados:0,cache:false,fuente:'FIREBASE_TITULOS'};
      cache.promesa=enviarGet('LISTAR_ENVIOS_POR_CARRERA',{estado:'',todas:'true',incluirTodos:'true'}).then(function(respuesta){
        ultimoDiagnostico.respondidas=1;
        var filas=extraerLista(respuesta,0);ultimoDiagnostico.filasRecibidas=filas.length;
        var envios=normalizarFilas(filas,normalizarEnvio);ultimoDiagnostico.enviosNormalizados=envios.length;
        cache.envios=envios;cache.periodos=construirPeriodos(envios);cache.expira=Date.now()+CACHE_MS;
        return envios;
      }).catch(function(error){ultimoDiagnostico.fallidas=1;throw error;}).finally(function(){cache.promesa=null;});
      return cache.promesa;
    }

    var servicioNuevo=Object.assign({},servicio);
    servicioNuevo.listarEnvios=function(opciones){opciones=opciones||{};return cargarTodos(opciones.forzar===true||opciones.force===true);};
    servicioNuevo.listarPeriodos=function(opciones){opciones=opciones||{};return cargarTodos(opciones.forzar===true||opciones.force===true).then(function(envios){var result=cache.periodos||construirPeriodos(envios);if(result.periodos.length)return result;throw new Error('Firebase Títulos no contiene envíos con períodos disponibles.');});};
    servicioNuevo.invalidarCacheEnvios=invalidar;
    servicioNuevo.obtenerDiagnosticoConsulta=function(){return Object.assign({},ultimoDiagnostico,{cacheVigente:Array.isArray(cache.envios)&&cache.expira>Date.now(),periodosDisponibles:cache.periodos&&cache.periodos.periodos?cache.periodos.periodos.length:0});};
    servicioNuevo.__enviosPorCarreraInstalado=true;
    servicioNuevo.__enviosFlexiblesInstalado=true;
    servicioNuevo.__soloFirebaseTitulosInstalado=true;
    window.CoordinadorMVPSheetsPrimary=servicioNuevo;
    return true;
  }

  window.CoordinadorMVPEnviosCarreras={instalar:instalar,invalidar:invalidar};
  instalar();
})(window);
