/* =========================================================
Archivo: coordinador.catalogo.local.js
Ruta: /coordinadores-mvp/js/coordinador.catalogo.local.js
Función:
- Usar Firebase Títulos como primera fuente del catálogo de coordinadores.
- Guardar el último catálogo válido en este navegador.
- Usar ese catálogo local únicamente si Firebase no responde.
========================================================= */
(function(window){
  'use strict';
  var STORAGE_KEY='titulos_coordinadores_catalogo_v1';
  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function leerCatalogo(){try{var raw=window.localStorage.getItem(STORAGE_KEY);if(!raw)return[];var data=JSON.parse(raw)||{};var lista=Array.isArray(data)?data:data.coordinadores;return Array.isArray(lista)?lista:[];}catch(error){return[];}}
  function guardarCatalogo(lista){if(!Array.isArray(lista)||!lista.length)return false;try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify({actualizadoEn:new Date().toISOString(),origen:'firebase-titulos',total:lista.length,coordinadores:lista}));return true;}catch(error){return false;}}
  function normalizarListaLocal(lista,normalizar){return(Array.isArray(lista)?lista:[]).map(function(item,indice){var salida=typeof normalizar==='function'?normalizar(item,indice):Object.assign({},item||{});if(!salida)return null;salida.fuente='catalogo-local';salida.id=texto(salida.id||salida._docId||salida.nombre||('coordinador_'+indice));return salida;}).filter(function(item){return item&&item.nombre&&item.activo!==false;});}
  function crearServicioConFallback(servicioOriginal){
    var listarOriginal=servicioOriginal&&servicioOriginal.listarCoordinadores;
    var normalizar=servicioOriginal&&servicioOriginal.normalizarCoordinador;
    if(typeof listarOriginal!=='function')return null;
    var servicio=Object.assign({},servicioOriginal);
    servicio.listarCoordinadores=function(forzar){return Promise.resolve().then(function(){return listarOriginal.call(servicioOriginal,forzar===true);}).then(function(lista){if(Array.isArray(lista)&&lista.length){guardarCatalogo(lista);return lista;}throw new Error('Firebase Títulos no devolvió coordinadores activos.');}).catch(function(errorFirebase){var listaLocal=normalizarListaLocal(leerCatalogo(),normalizar);if(listaLocal.length)return listaLocal;throw new Error('Firebase Títulos no respondió y todavía no existe un catálogo local en este navegador. Error: '+(errorFirebase&&errorFirebase.message?errorFirebase.message:String(errorFirebase)));});};
    servicio.leerCatalogoLocal=leerCatalogo;servicio.guardarCatalogoLocal=guardarCatalogo;servicio.__catalogoLocalInstalado=true;return servicio;
  }
  function instalar(){var servicioOriginal=window.CoordinadorMVPSheetsPrimary;if(!servicioOriginal)return false;if(servicioOriginal.__catalogoLocalInstalado)return true;var servicio=crearServicioConFallback(servicioOriginal);if(!servicio)return false;window.CoordinadorMVPSheetsPrimary=servicio;return true;}
  window.CoordinadorMVPCatalogoLocal={STORAGE_KEY:STORAGE_KEY,leer:leerCatalogo,guardar:guardarCatalogo,instalar:instalar};
  instalar();
})(window);
