/* Coordinadores: operación filtrada sobre artículos y Trabajos de Titulación. */
(function(window,document){
'use strict';

var iniciado=false;
var fuenteActual='FIREBASE_TITULOS';

function state(){return window.CoordinadorMVPState||null;}
function ui(){return window.CoordinadorMVPUI||null;}
function modal(){return window.CoordinadorMVPModal||null;}
function sheets(){return window.CoordinadorMVPSheetsPrimary||null;}
function $(id){return document.getElementById(id);}
function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
function normalizar(valor){return texto(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function esperar(ms){return new Promise(function(resolve){window.setTimeout(resolve,ms);});}

function textoError(error){
  if(!error)return'Error desconocido.';
  if(typeof error==='string')return textoError({message:error});
  if(error.mensaje)return textoError({message:error.mensaje});
  if(error.error)return textoError({message:error.error});
  var mensaje=texto(error.message||'');
  var firma=mensaje.toLowerCase();
  if(firma.indexOf('failed to fetch')>=0||firma.indexOf('networkerror')>=0||firma.indexOf('load failed')>=0||firma.indexOf('network request failed')>=0)return'No se pudo mantener la conexión con Firebase Títulos.';
  if(firma.indexOf('aborted')>=0||firma.indexOf('timeout')>=0||firma.indexOf('tiempo máximo')>=0)return'La operación tardó más de lo esperado.';
  if(mensaje)return mensaje;
  try{return JSON.stringify(error);}catch(x){return String(error);}
}
function esErrorConexion(error){var firma=texto(error&&error.message?error.message:error).toLowerCase();return firma.indexOf('failed to fetch')>=0||firma.indexOf('networkerror')>=0||firma.indexOf('load failed')>=0||firma.indexOf('network request failed')>=0||firma.indexOf('aborted')>=0||firma.indexOf('timeout')>=0;}
function validar(){var faltantes=[];if(!state())faltantes.push('CoordinadorMVPState');if(!ui())faltantes.push('CoordinadorMVPUI');if(!modal())faltantes.push('CoordinadorMVPModal');if(!sheets())faltantes.push('CoordinadorMVPSheetsPrimary');if(faltantes.length)throw new Error('Faltan módulos: '+faltantes.join(', '));}
function estado(mensaje,tipo){ui().mostrarEstado('estadoPrincipal',mensaje,tipo||'info');}
function resumen(){
  var filtros=state().obtenerDiagnosticoFiltros?state().obtenerDiagnosticoFiltros():{};
  var consulta=sheets().obtenerDiagnosticoConsulta?sheets().obtenerDiagnosticoConsulta():{};
  var articulos=consulta.articulos||{};
  var trabajos=consulta.trabajos||{};
  var fuentes='Artículos: '+Number(articulos.recibidos||0)+' · Trabajos de Titulación: '+Number(trabajos.recibidos||0)+' · Total recibido: '+Number(consulta.totalRecibidos||0)+'.';
  if(trabajos.ok===false&&trabajos.error){estado('No se pudieron consultar los Trabajos de Titulación. '+texto(trabajos.error)+' '+fuentes,'error');return;}
  if(articulos.ok===false&&articulos.error){estado('No se pudieron consultar los artículos académicos. '+texto(articulos.error)+' '+fuentes,'warning');return;}
  if(filtros.mostrados){estado('Mostrando '+filtros.mostrados+' título(s) de las carreras asignadas. '+fuentes,'success');return;}
  estado('No hay coincidencias para el coordinador, tipo y estado seleccionados. '+fuentes,'warning');
}

function cargarCatalogos(forzar){
  state().limpiarError();state().setCargando(true);
  estado(forzar?'Actualizando coordinadores...':'Cargando coordinadores...','info');
  if(forzar&&sheets().limpiarCache)sheets().limpiarCache();
  return sheets().listarCoordinadores(forzar===true).then(function(coordinadores){
    coordinadores=Array.isArray(coordinadores)?coordinadores:[];
    state().setCoordinadores(coordinadores);state().limpiarError();
    var actual=state().obtenerCoordinadorActual();
    if(!actual){state().setEnvios([]);estado('Coordinadores cargados. Selecciona tu nombre para consultar únicamente tus carreras.','success');return{ok:true,coordinadores:coordinadores,envios:[]};}
    return cargarTitulos(forzar===true).then(function(envios){return{ok:true,coordinadores:coordinadores,envios:envios};});
  }).catch(function(error){var mensaje=textoError(error);state().setCoordinadores([]);state().setEnvios([]);state().setError(new Error(mensaje));estado(mensaje,'error');return{ok:false,error:mensaje};}).finally(function(){state().setCargando(false);});
}

function cargarTitulos(forzar){
  var coordinador=state().obtenerCoordinadorActual();
  if(!coordinador){state().setEnvios([]);estado('Selecciona un coordinador para cargar sus carreras.','info');return Promise.resolve([]);}
  state().setCargando(true);estado('Cargando únicamente las carreras asignadas a '+coordinador.nombre+'...','info');
  return sheets().listarEnvios({forzar:forzar===true,carreras:coordinador.carreras||[]}).then(function(lista){state().setEnvios(lista||[]);resumen();return lista||[];}).catch(function(error){state().setEnvios([]);estado('No se pudieron actualizar los envíos: '+textoError(error),'error');return[];}).finally(function(){state().setCargando(false);});
}

function abrirDetalle(id){
  var envio=state().seleccionarEstudiante(id);
  if(!envio){estado('No se encontró el envío.','error');return;}
  estado('Cargando el detalle y la revisión anterior...','info');
  sheets().consultarEnvioPorCedula(envio.cedula,envio.periodoLabel||envio.periodoId||envio.periodo,envio.tipoTrabajo,envio.id||envio._clave).then(function(actual){
    var completo=Object.assign({},envio,actual||{});
    state().setEstudianteSeleccionado(completo);modal().abrir(completo);resumen();
  }).catch(function(error){
    state().setEstudianteSeleccionado(envio);modal().abrir(envio);modal().mostrarEstado('No se pudo cargar el historial anterior: '+textoError(error),'warning');
  });
}
function cerrarTrasGuardar(mensaje){modal().confirmarGuardado(mensaje);window.setTimeout(function(){modal().cerrar({forzar:true,descartar:true});cargarTitulos(true);},1100);}
function resolucionCoincide(envio,datos,tipo){envio=envio||{};datos=datos||{};var estadoActual=texto(envio.estado||envio.estadoFinal).toUpperCase();if(tipo==='devolver'){if(estadoActual!=='DEVUELTO')return false;var esperado=normalizar(datos.comentarioCoordinador);var guardado=normalizar(envio.comentarioCoordinador||envio.comentario||envio.observacion);return !esperado||!guardado||guardado===esperado||guardado.indexOf(esperado)>=0;}if(['APROBADO','REEMPLAZADO'].indexOf(estadoActual)<0)return false;var tituloEsperado=normalizar(datos.tituloFinal);var tituloGuardado=normalizar(envio.tituloAprobado||envio.tituloFinal||envio.tituloCorregido||envio.tituloElegido);return !tituloEsperado||!tituloGuardado||tituloGuardado===tituloEsperado;}
function verificarTrasFallo(error,datos,tipo){if(!esErrorConexion(error))return Promise.reject(error);modal().mostrarEstado('Se perdió la respuesta. Comprobando si la resolución se guardó...','info');return esperar(1200).then(function(){var envio=datos.envio||{};return sheets().consultarEnvioPorCedula(envio.cedula,envio.periodoLabel||envio.periodoId||envio.periodo,envio.tipoTrabajo,envio.id||envio._clave);}).then(function(actual){if(!resolucionCoincide(actual,datos,tipo))throw new Error('No fue posible confirmar el guardado.');return{ok:true,recuperado:true,mensaje:tipo==='devolver'?'La devolución sí se guardó.':'La aprobación sí se guardó.'};});}
function completarGuardado(resultado,mensajePredeterminado){var mensaje=resultado&&resultado.mensaje?resultado.mensaje:mensajePredeterminado;estado(mensaje,'success');if(sheets().invalidarCacheEnvios)sheets().invalidarCacheEnvios();cerrarTrasGuardar(mensaje);}
function aprobar(){var resolucion=modal().obtenerResolucionAprobar();if(!resolucion.ok)return;modal().establecerGuardando(true,'Guardando el título y el comentario...');sheets().aprobarEnvio(resolucion.data.envio,resolucion.data).catch(function(error){return verificarTrasFallo(error,resolucion.data,'aprobar');}).then(function(resultado){completarGuardado(resultado,'Título y comentario guardados correctamente.');}).catch(function(error){modal().errorGuardado('No se guardó la aprobación: '+textoError(error));});}
function devolver(){var resolucion=modal().obtenerResolucionDevolver();if(!resolucion.ok)return;if(!window.confirm('¿Confirmas que deseas devolver estas propuestas al estudiante?'))return;modal().establecerGuardando(true,'Guardando la devolución y el comentario...');sheets().devolverEnvio(resolucion.data.envio,resolucion.data).catch(function(error){return verificarTrasFallo(error,resolucion.data,'devolver');}).then(function(resultado){completarGuardado(resultado,'Devolución y comentario guardados correctamente.');}).catch(function(error){modal().errorGuardado('No se realizó la devolución: '+textoError(error));});}

function diagnostico(){
  var coordinador=state().obtenerCoordinadorActual();
  ui().mostrarDiagnostico();ui().escribirDiagnostico({estado:'probando',fuentePrincipal:fuenteActual,apiBase:window.TITULOS_API_BASE||''});
  Promise.allSettled([sheets().leerConfiguracion(),sheets().diagnostico(),sheets().listarCoordinadores(),coordinador?sheets().listarEnvios({forzar:true,carreras:coordinador.carreras||[]}):Promise.resolve([])]).then(function(resultados){ui().escribirDiagnostico({fuentePrincipal:fuenteActual,apiBase:window.TITULOS_API_BASE||'',configuracion:resultados[0].status==='fulfilled'?resultados[0].value:{error:textoError(resultados[0].reason)},conexion:resultados[1].status==='fulfilled'?resultados[1].value:{error:textoError(resultados[1].reason)},coordinadores:resultados[2].status==='fulfilled'?resultados[2].value.length:textoError(resultados[2].reason),enviosFirebaseTitulos:resultados[3].status==='fulfilled'?resultados[3].value.length:textoError(resultados[3].reason),consultaEnvios:sheets().obtenerDiagnosticoConsulta?sheets().obtenerDiagnosticoConsulta():{},filtros:state().obtenerDiagnosticoFiltros(),consultaFiltradaPorCoordinador:Boolean(coordinador),fecha:new Date().toISOString()});});
}

function eventos(){var coordinador=$('coordinadorSelect'),buscador=$('buscadorInput'),tipo=$('tipoTrabajoSelect');if(coordinador)coordinador.addEventListener('change',function(){state().setCoordinadorActual(coordinador.value);cargarTitulos(false);});if(buscador)buscador.addEventListener('input',function(){state().setBusqueda(buscador.value);resumen();});if(tipo)tipo.addEventListener('change',function(){state().setTipoTrabajoActual(tipo.value);resumen();});document.addEventListener('click',function(evento){var boton=evento.target&&evento.target.closest?evento.target.closest('[data-accion]'):null;if(!boton)return;var accion=boton.getAttribute('data-accion');if(accion==='cambiar-vista'){state().setVistaActual(boton.getAttribute('data-vista'));resumen();}else if(accion==='actualizar-datos')cargarCatalogos(true);else if(accion==='ver-detalle')abrirDetalle(boton.getAttribute('data-envio-id'));else if(accion==='cerrar-modal')modal().cerrar();else if(accion==='aprobar-envio')aprobar();else if(accion==='devolver-envio')devolver();else if(accion==='mostrar-diagnostico')diagnostico();else if(accion==='ocultar-diagnostico')ui().ocultarDiagnostico();});document.addEventListener('keydown',function(evento){if(evento.key==='Escape')modal().cerrar();});}
function iniciar(){if(iniciado)return;iniciado=true;try{validar();state().iniciar();ui().iniciar();modal().iniciar();eventos();cargarCatalogos(false);}catch(error){var elemento=$('estadoPrincipal');if(elemento){elemento.className='status-message is-error';elemento.textContent=textoError(error);}console.error('[CoordinadorMVPApp]',error);}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
window.CoordinadorMVPApp=Object.freeze({iniciar:iniciar,cargarCatalogos:cargarCatalogos,cargarTitulos:cargarTitulos,aprobar:aprobar,devolver:devolver,mostrarDiagnostico:diagnostico,obtenerFuenteActual:function(){return fuenteActual;}});
})(window,document);
