/* =========================================================
Archivo: coordinador.envios.carreras.js
Ruta: /coordinadores-mvp/js/coordinador.envios.carreras.js
Función:
- Leer todos los envíos una sola vez desde Firebase Títulos.
- Leer los períodos activos desde la colección periodos.
- Ocultar en Coordinadores los períodos desactivados por Administrador.
- Reutilizar las lecturas durante 60 segundos.
========================================================= */
(function(window){
  'use strict';

  var CACHE_MS=60*1000;
  var cache={envios:null,periodos:null,expiraEnvios:0,expiraPeriodos:0,promesaEnvios:null,promesaPeriodos:null};
  var ultimoDiagnostico={consultas:0,respondidas:0,fallidas:0,filasRecibidas:0,enviosNormalizados:0,cache:false};

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
    return pares[0]||'';
  }
  function extraerLista(valor,profundidad){
    if(profundidad>8||valor===null||valor===undefined)return[];
    if(Array.isArray(valor))return valor;
    if(typeof valor!=='object')return[];
    var claves=['envios','periodos','periods','registros','filas','rows','items','resultados','resultado','result','data'];
    for(var i=0;i<claves.length;i+=1)if(Array.isArray(valor[claves[i]]))return valor[claves[i]];
    var nombres=Object.keys(valor);
    for(var j=0;j<nombres.length;j+=1){var encontrada=extraerLista(valor[nombres[j]],profundidad+1);if(encontrada.length)return encontrada;}
    return[];
  }
  function claveEnvio(envio,indice){envio=envio||{};return texto(envio.id||envio._clave||[envio.cedula,envio.periodoId||envio.periodoLabel||envio.periodo,envio.carrera,envio.fila||indice].join('|'));}
  function normalizarFilas(filas,normalizarEnvio){
    var mapa={},envios=[];
    (Array.isArray(filas)?filas:[]).map(normalizarEnvio).forEach(function(envio,indice){
      if(!envio||!envio.cedula||(!envio.titulo1&&!envio.titulo2&&!envio.titulo3))return;
      var clave=claveEnvio(envio,indice);if(mapa[clave])return;mapa[clave]=true;envios.push(envio);
    });
    return envios;
  }
  function normalizarPeriodos(respuesta){
    var lista=extraerLista(respuesta,0),mapa={},periodos=[];
    lista.forEach(function(item){item=item||{};if(item.activo===false||texto(item.estado).toUpperCase()==='INACTIVO')return;var id=texto(item.id||item.periodoId||item.value);var label=texto(item.label||item.periodoLabel||item.nombre||id);var firma=firmaPeriodo(label)||firmaPeriodo(id)||id;if(!firma||mapa[firma])return;mapa[firma]=true;periodos.push({id:id||firma,label:label||id||firma,activo:true,principal:item.principal===true,firma:firma});});
    periodos.sort(function(a,b){var finA=(a.firma||'').split('__').pop(),finB=(b.firma||'').split('__').pop();if(finA!==finB)return finB.localeCompare(finA,'es',{numeric:true});return (b.firma||'').localeCompare(a.firma||'','es',{numeric:true});});
    var principal=periodos.find(function(item){return item.principal;})||periodos[0]||null;
    periodos.forEach(function(item){item.principal=principal&&item.id===principal.id;delete item.firma;});
    return{periodos:periodos,principal:principal};
  }
  function apiBase(){return texto(window.TITULOS_API_BASE||'http://127.0.0.1:8788').replace(/\/$/,'');}
  function cargarPeriodosActivos(forzar){
    if(!forzar&&Array.isArray(cache.periodos)&&cache.expiraPeriodos>Date.now())return Promise.resolve(cache.periodos);
    if(!forzar&&cache.promesaPeriodos)return cache.promesaPeriodos;
    cache.promesaPeriodos=fetch(apiBase()+'/api/requisitos',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'coordinadores'},body:JSON.stringify({accion:'LISTAR_PERIODOS_PUBLICOS',action:'LISTAR_PERIODOS_PUBLICOS',datos:{}})}).then(function(response){return response.text().then(function(body){var json={};try{json=body?JSON.parse(body):{};}catch(error){throw new Error('La lista de períodos respondió en formato no válido.');}if(!response.ok||json.ok===false)throw new Error(json.mensaje||json.error||('Error HTTP '+response.status));return json;});}).then(function(result){var normalized=normalizarPeriodos(result);cache.periodos=normalized;cache.expiraPeriodos=Date.now()+CACHE_MS;return normalized;}).finally(function(){cache.promesaPeriodos=null;});
    return cache.promesaPeriodos;
  }
  function invalidar(){cache={envios:null,periodos:null,expiraEnvios:0,expiraPeriodos:0,promesaEnvios:null,promesaPeriodos:null};}

  function instalar(){
    var servicio=window.CoordinadorMVPSheetsPrimary;
    if(!servicio||servicio.__enviosFlexiblesInstalado)return false;
    if(typeof servicio.enviarGet!=='function'||typeof servicio.normalizarEnvio!=='function')return false;
    var enviarGet=servicio.enviarGet,normalizarEnvio=servicio.normalizarEnvio;

    function cargarTodos(forzar){
      var vigente=Array.isArray(cache.envios)&&cache.expiraEnvios>Date.now();
      if(!forzar&&vigente){ultimoDiagnostico.cache=true;return Promise.resolve(cache.envios);}
      if(!forzar&&cache.promesaEnvios)return cache.promesaEnvios;
      ultimoDiagnostico={consultas:1,respondidas:0,fallidas:0,filasRecibidas:0,enviosNormalizados:0,cache:false};
      cache.promesaEnvios=enviarGet('LISTAR_ENVIOS_POR_CARRERA',{hoja:'Envios',estado:'',todas:'true',incluirTodos:'true'}).then(function(respuesta){ultimoDiagnostico.respondidas=1;var filas=extraerLista(respuesta,0);ultimoDiagnostico.filasRecibidas=filas.length;var envios=normalizarFilas(filas,normalizarEnvio);ultimoDiagnostico.enviosNormalizados=envios.length;cache.envios=envios;cache.expiraEnvios=Date.now()+CACHE_MS;return envios;}).catch(function(error){ultimoDiagnostico.fallidas=1;throw error;}).finally(function(){cache.promesaEnvios=null;});
      return cache.promesaEnvios;
    }

    servicio.listarEnvios=function(opciones){opciones=opciones||{};return cargarTodos(opciones.forzar===true||opciones.force===true);};
    servicio.listarPeriodos=function(opciones){opciones=opciones||{};return cargarPeriodosActivos(opciones.forzar===true||opciones.force===true).then(function(result){if(result.periodos.length)return result;throw new Error('No existen períodos activos. Activa uno desde Administrador.');});};
    servicio.invalidarCacheEnvios=invalidar;
    servicio.obtenerDiagnosticoConsulta=function(){return Object.assign({},ultimoDiagnostico,{cacheVigente:Array.isArray(cache.envios)&&cache.expiraEnvios>Date.now(),periodosActivos:cache.periodos&&cache.periodos.periodos?cache.periodos.periodos.length:0});};
    servicio.__enviosPorCarreraInstalado=true;
    servicio.__enviosFlexiblesInstalado=true;
    return true;
  }

  window.CoordinadorMVPEnviosCarreras={instalar:instalar,invalidar:invalidar};
  instalar();
})(window);
