/* Estado central del Administrador v3. */
(function(window){
  'use strict';
  var listeners=[];
  var state={cargando:false,vista:'ad-seccion-estado',periodosAcademicos:[],periodosOperativos:[],periodoPrincipal:null,periodoCarrerasId:'',carreras:[],coordinadores:[],titulos:[],pendientesSync:[],servicios:[],proveedores:[],estudianteConsulta:null,envioSeleccionado:null,coordinadorEdicion:null,servicioEdicion:null,proveedorEdicion:null,filtros:{busqueda:'',estado:'',periodo:'',carrera:'',pagina:1,tamano:25},errores:{}};
  function clonar(valor){try{return JSON.parse(JSON.stringify(valor));}catch(error){return valor;}}
  function emitir(tipo){var snapshot=clonar(state);listeners.forEach(function(listener){try{listener(tipo,snapshot);}catch(error){console.warn('[ADState]',error);}});}
  function escuchar(listener){if(typeof listener!=='function')return function(){};listeners.push(listener);return function(){listeners=listeners.filter(function(item){return item!==listener;});};}
  function get(){return clonar(state);}
  function set(parcial,tipo){state=Object.assign({},state,parcial||{});emitir(tipo||'actualizado');return get();}
  function setLista(nombre,lista,tipo){var parcial={};parcial[nombre]=Array.isArray(lista)?lista.slice():[];return set(parcial,tipo||nombre);}
  function setError(nombre,error){var errores=Object.assign({},state.errores);if(error)errores[nombre]=error&&error.message?error.message:String(error);else delete errores[nombre];return set({errores:errores},'error');}
  function setFiltros(parcial){var filtros=Object.assign({},state.filtros,parcial||{});if(parcial&&Object.prototype.hasOwnProperty.call(parcial,'pagina')===false)filtros.pagina=1;return set({filtros:filtros},'filtros');}
  function setVista(id){return set({vista:id},'vista');}
  function setEnvioSeleccionado(envio){return set({envioSeleccionado:envio||null},'envio');}
  function setEstudianteConsulta(estudiante){return set({estudianteConsulta:estudiante||null},'estudiante');}
  function setCoordinadorEdicion(coordinador){return set({coordinadorEdicion:coordinador||null},'coordinador-edicion');}
  function setServicioEdicion(servicio){return set({servicioEdicion:servicio||null},'servicio-edicion');}
  function setProveedorEdicion(proveedor){return set({proveedorEdicion:proveedor||null},'proveedor-edicion');}
  window.ADState=Object.freeze({get:get,set:set,setLista:setLista,setError:setError,setFiltros:setFiltros,setVista:setVista,setEnvioSeleccionado:setEnvioSeleccionado,setEstudianteConsulta:setEstudianteConsulta,setCoordinadorEdicion:setCoordinadorEdicion,setServicioEdicion:setServicioEdicion,setProveedorEdicion:setProveedorEdicion,escuchar:escuchar});
})(window);
