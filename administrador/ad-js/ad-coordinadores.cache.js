/* =========================================================
Archivo: ad-coordinadores.cache.js
Ruta: /administrador/ad-js/ad-coordinadores.cache.js
Función:
- Guardar en localStorage el catálogo de coordinadores que muestra Administrador.
- Permitir que la administración siga leyendo el último catálogo cuando Firebase no responda.
- Compartir nombres y carreras con Coordinadores sin consumir cuota de Firebase.
========================================================= */
(function(window){
  'use strict';

  var STORAGE_KEY='titulos_coordinadores_catalogo_v1';

  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function clonar(valor){try{return JSON.parse(JSON.stringify(valor));}catch(error){return valor;}}
  function normalizar(item,indice){
    item=item||{};
    var id=texto(item.id||item._docId||item.nombre||('coordinador_'+indice));
    var carreras=Array.isArray(item.carreras)?item.carreras.slice():[];
    var asignadas=Array.isArray(item.carrerasAsignadas)?item.carrerasAsignadas.slice():[];
    return {
      id:id,
      _docId:id,
      nombre:texto(item.nombre||item.Nombre||id),
      telegram:texto(item.telegram||item.Telegram||''),
      Telegram:texto(item.telegram||item.Telegram||''),
      activo:item.activo!==false,
      carreras:carreras,
      carrerasAsignadas:asignadas
    };
  }
  function guardar(lista){
    lista=Array.isArray(lista)?lista.map(normalizar).filter(function(item){return item.nombre;}):[];
    if(!lista.length)return false;
    var payload={
      actualizadoEn:new Date().toISOString(),
      origen:'administrador',
      total:lista.length,
      coordinadores:lista
    };
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(payload));return true;}
    catch(error){return false;}
  }
  function leer(){
    try{
      var raw=window.localStorage.getItem(STORAGE_KEY);
      if(!raw)return [];
      var data=JSON.parse(raw)||{};
      var lista=Array.isArray(data)?data:data.coordinadores;
      return Array.isArray(lista)?lista.map(normalizar).filter(function(item){return item.nombre;}):[];
    }catch(error){return [];}
  }
  function refrescarDesdeServicio(servicio){
    if(!servicio||typeof servicio.listarCoordinadores!=='function')return Promise.resolve([]);
    return servicio.listarCoordinadores(500).then(function(resultado){
      var lista=resultado&&resultado.coordinadores||[];
      guardar(lista);
      return lista;
    }).catch(function(){return leer();});
  }
  function instalar(){
    var servicio=window.ADCoordinadoresService;
    if(!servicio||servicio.__catalogoLocalInstalado)return false;

    var listarOriginal=servicio.listarCoordinadores;
    var obtenerOriginal=servicio.obtenerCoordinador;

    servicio.listarCoordinadores=function(limite){
      return listarOriginal.call(servicio,limite).then(function(resultado){
        var lista=resultado&&resultado.coordinadores||[];
        if(lista.length)guardar(lista);
        return resultado;
      }).catch(function(error){
        var lista=leer();
        if(!lista.length)throw error;
        return {ok:true,total:lista.length,coordinadores:lista,fuente:'catalogo-local',advertencia:error&&error.message||String(error)};
      });
    };

    servicio.obtenerCoordinador=function(id){
      return obtenerOriginal.call(servicio,id).catch(function(error){
        var item=leer().find(function(coordinador){return texto(coordinador.id||coordinador._docId)===texto(id);})||null;
        if(item)return clonar(item);
        throw error;
      });
    };

    servicio.guardarCatalogoLocal=guardar;
    servicio.leerCatalogoLocal=leer;
    servicio.refrescarCatalogoLocal=function(){return refrescarDesdeServicio(servicio);};
    servicio.__catalogoLocalInstalado=true;
    return true;
  }

  window.ADCoordinadoresCatalogoLocal={STORAGE_KEY:STORAGE_KEY,guardar:guardar,leer:leer,instalar:instalar};
  instalar();
})(window);
