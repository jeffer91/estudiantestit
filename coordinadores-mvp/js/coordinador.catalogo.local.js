/* =========================================================
Archivo: coordinador.catalogo.local.js
Ruta: /coordinadores-mvp/js/coordinador.catalogo.local.js
Función:
- Usar Google Sheets como primera fuente del catálogo de coordinadores.
- Si la hoja Coordinadores está vacía, leer el último catálogo compartido por Administrador.
- Evitar consultas a Firebase cuando su cuota está agotada.
========================================================= */
(function(window){
  'use strict';

  var STORAGE_KEY='titulos_coordinadores_catalogo_v1';

  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function leerCatalogo(){
    try{
      var raw=window.localStorage.getItem(STORAGE_KEY);
      if(!raw)return [];
      var data=JSON.parse(raw)||{};
      var lista=Array.isArray(data)?data:data.coordinadores;
      return Array.isArray(lista)?lista:[];
    }catch(error){return [];}
  }
  function guardarCatalogo(lista){
    if(!Array.isArray(lista)||!lista.length)return false;
    try{
      window.localStorage.setItem(STORAGE_KEY,JSON.stringify({
        actualizadoEn:new Date().toISOString(),
        origen:'google-sheets',
        total:lista.length,
        coordinadores:lista
      }));
      return true;
    }catch(error){return false;}
  }
  function instalar(){
    var servicio=window.CoordinadorMVPSheetsPrimary;
    if(!servicio||servicio.__catalogoLocalInstalado)return false;

    var listarOriginal=servicio.listarCoordinadores;
    var normalizar=servicio.normalizarCoordinador;

    servicio.listarCoordinadores=function(){
      return listarOriginal.call(servicio).then(function(lista){
        if(Array.isArray(lista)&&lista.length){
          guardarCatalogo(lista);
          return lista;
        }
        throw new Error('La hoja Coordinadores no devolvió registros activos.');
      }).catch(function(errorSheets){
        var lista=leerCatalogo();
        if(!lista.length){
          throw new Error(
            'La hoja Coordinadores está vacía y aún no existe un catálogo local. ' +
            'Abre Administrador → Carreras una vez para compartir los coordinadores. Error Sheets: ' +
            (errorSheets&&errorSheets.message?errorSheets.message:String(errorSheets))
          );
        }
        return lista.map(function(item,indice){
          var salida=typeof normalizar==='function'?normalizar(item,indice):item;
          salida.fuente='administrador-local';
          salida.id=texto(salida.id||salida._docId||salida.nombre||('coordinador_'+indice));
          return salida;
        }).filter(function(item){return item&&item.nombre&&item.activo!==false;});
      });
    };

    servicio.leerCatalogoLocal=leerCatalogo;
    servicio.guardarCatalogoLocal=guardarCatalogo;
    servicio.__catalogoLocalInstalado=true;
    return true;
  }

  window.CoordinadorMVPCatalogoLocal={STORAGE_KEY:STORAGE_KEY,leer:leerCatalogo,guardar:guardarCatalogo,instalar:instalar};
  instalar();
})(window);
