/* Coordinadores: operación rápida desde RESPALDO TITULOS APP. */
(function(window,document){
'use strict';

var iniciado=false;
var fuenteActual='RESPALDO TITULOS APP';

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
  if(
    firma.indexOf('failed to fetch')>=0||
    firma.indexOf('networkerror')>=0||
    firma.indexOf('load failed')>=0||
    firma.indexOf('network request failed')>=0
  ){
    return 'No se pudo mantener la conexión con el servidor. El borrador se conserva para volver a intentarlo.';
  }
  if(firma.indexOf('aborted')>=0||firma.indexOf('tiempo máximo')>=0||firma.indexOf('timeout')>=0){
    return 'La operación tardó más de lo esperado. Se verificará si alcanzó a guardarse.';
  }
  if(mensaje)return mensaje;
  try{return JSON.stringify(error);}catch(x){return String(error);}
}

function esErrorConexion(error){
  var firma=texto(error&&error.message?error.message:error).toLowerCase();
  return firma.indexOf('failed to fetch')>=0||
    firma.indexOf('networkerror')>=0||
    firma.indexOf('load failed')>=0||
    firma.indexOf('network request failed')>=0||
    firma.indexOf('aborted')>=0||
    firma.indexOf('timeout')>=0||
    firma.indexOf('tiempo máximo')>=0;
}

function validar(){
  var faltantes=[];
  if(!state())faltantes.push('CoordinadorMVPState');
  if(!ui())faltantes.push('CoordinadorMVPUI');
  if(!modal())faltantes.push('CoordinadorMVPModal');
  if(!sheets())faltantes.push('CoordinadorMVPSheetsPrimary');
  if(faltantes.length)throw new Error('Faltan módulos: '+faltantes.join(', '));
}

function estado(mensaje,tipo){ui().mostrarEstado('estadoPrincipal',mensaje,tipo||'info');}
function resumen(){
  var diagnostico=state().obtenerDiagnosticoFiltros?state().obtenerDiagnosticoFiltros():{};
  estado(
    diagnostico.mostrados
      ?'Mostrando '+diagnostico.mostrados+' estudiante(s).'
      :'No hay coincidencias para los filtros seleccionados.',
    diagnostico.mostrados?'success':'warning'
  );
}

function cargarCatalogos(forzar){
  state().limpiarError();
  state().setCargando(true);
  estado(forzar?'Actualizando RESPALDO TITULOS APP...':'Cargando períodos, coordinadores y envíos...','info');
  if(forzar&&sheets().invalidarCacheEnvios)sheets().invalidarCacheEnvios();
  if(forzar&&sheets().limpiarCache)sheets().limpiarCache();

  return Promise.all([
    sheets().listarPeriodos({forzar:forzar===true}),
    sheets().listarCoordinadores(forzar===true)
  ]).then(function(resultados){
    var periodos=resultados[0]||{};
    var coordinadores=Array.isArray(resultados[1])?resultados[1]:[];
    if(!periodos.periodos||!periodos.periodos.length){
      throw new Error('RESPALDO TITULOS APP no devolvió períodos disponibles.');
    }
    state().setPeriodos(periodos.periodos,periodos.principal||periodos.periodos[0]);
    state().setCoordinadores(coordinadores);
    state().setEnvios(Array.isArray(periodos.envios)?periodos.envios:[]);
    fuenteActual='RESPALDO TITULOS APP';
    state().limpiarError();
    if(state().obtenerCoordinadorActual())resumen();
    else estado('Datos cargados. Selecciona un coordinador.','success');
    return{ok:true,periodos:periodos.periodos,coordinadores:coordinadores,envios:periodos.envios||[]};
  }).catch(function(error){
    var mensaje=textoError(error);
    state().setPeriodos([],null);
    state().setCoordinadores([]);
    state().setEnvios([]);
    state().setError(new Error(mensaje));
    estado(mensaje,'error');
    return{ok:false,error:mensaje};
  }).finally(function(){state().setCargando(false);});
}

function cargarTitulos(forzar){
  state().setCargando(true);
  return sheets().listarEnvios({forzar:forzar===true}).then(function(lista){
    state().setEnvios(lista||[]);
    resumen();
    return lista||[];
  }).catch(function(error){
    estado('No se pudieron actualizar los envíos: '+textoError(error),'error');
    return[];
  }).finally(function(){state().setCargando(false);});
}

function abrirDetalle(id){
  var envio=state().seleccionarEstudiante(id);
  if(!envio){estado('No se encontró el estudiante.','error');return;}
  state().setEstudianteSeleccionado(envio);
  modal().abrir(envio);
}

function cerrarTrasGuardar(mensaje){
  modal().confirmarGuardado(mensaje);
  window.setTimeout(function(){
    modal().cerrar({forzar:true,descartar:true});
    cargarTitulos(true);
  },1100);
}

function resolucionCoincide(envio,datos,tipo){
  envio=envio||{};
  datos=datos||{};
  var estadoActual=texto(envio.estado||envio.estadoFinal).toUpperCase();

  if(tipo==='devolver'){
    if(estadoActual!=='DEVUELTO')return false;
    var esperado=normalizar(datos.comentarioCoordinador);
    var guardado=normalizar(envio.comentarioCoordinador||envio.comentario||envio.observacion);
    return !esperado||!guardado||guardado===esperado||guardado.indexOf(esperado)>=0;
  }

  if(['APROBADO','REEMPLAZADO'].indexOf(estadoActual)<0)return false;
  var tituloEsperado=normalizar(datos.tituloFinal);
  var tituloGuardado=normalizar(envio.tituloAprobado||envio.tituloFinal||envio.tituloCorregido||envio.tituloElegido);
  return !tituloEsperado||!tituloGuardado||tituloGuardado===tituloEsperado;
}

function verificarTrasFallo(error,datos,tipo){
  if(!esErrorConexion(error))return Promise.reject(error);

  modal().mostrarEstado(
    'Se perdió la respuesta del servidor. Estamos comprobando si la resolución alcanzó a guardarse...',
    'info'
  );

  return esperar(1200).then(function(){
    var envio=datos.envio||{};
    return sheets().consultarEnvioPorCedula(
      envio.cedula,
      envio.periodoLabel||envio.periodoId||envio.periodo
    );
  }).then(function(envioActualizado){
    if(!resolucionCoincide(envioActualizado,datos,tipo)){
      throw new Error(
        'No fue posible confirmar el guardado. Revisa tu conexión y vuelve a intentarlo; el título y el comentario permanecen en el borrador.'
      );
    }
    return{
      ok:true,
      recuperado:true,
      mensaje:tipo==='devolver'
        ?'La devolución y el comentario sí se guardaron.'
        :'El título y el comentario sí se guardaron.'
    };
  }).catch(function(errorVerificacion){
    var mensaje=textoError(errorVerificacion);
    if(mensaje.indexOf('No fue posible confirmar')>=0)throw errorVerificacion;
    throw new Error(
      'Se perdió la conexión y tampoco fue posible verificar el resultado. El borrador se conserva; no pulses varias veces seguidas.'
    );
  });
}

function completarGuardado(resultado,mensajePredeterminado){
  var mensaje=resultado&&resultado.mensaje?resultado.mensaje:mensajePredeterminado;
  estado(mensaje,'success');
  if(sheets().invalidarCacheEnvios)sheets().invalidarCacheEnvios();
  cerrarTrasGuardar(mensaje);
}

function aprobar(){
  var resolucion=modal().obtenerResolucionAprobar();
  if(!resolucion.ok)return;

  modal().establecerGuardando(true,'Guardando el título y el comentario...');
  sheets().aprobarEnvio(resolucion.data.envio,resolucion.data)
    .catch(function(error){return verificarTrasFallo(error,resolucion.data,'aprobar');})
    .then(function(resultado){
      completarGuardado(resultado,'Título y comentario guardados correctamente.');
    })
    .catch(function(error){
      modal().errorGuardado('No se guardó la aprobación: '+textoError(error));
    });
}

function devolver(){
  var resolucion=modal().obtenerResolucionDevolver();
  if(!resolucion.ok)return;
  if(!window.confirm('¿Confirmas que deseas devolver estas propuestas al estudiante?'))return;

  modal().establecerGuardando(true,'Guardando la devolución y el comentario...');
  sheets().devolverEnvio(resolucion.data.envio,resolucion.data)
    .catch(function(error){return verificarTrasFallo(error,resolucion.data,'devolver');})
    .then(function(resultado){
      completarGuardado(resultado,'Devolución y comentario guardados correctamente.');
    })
    .catch(function(error){
      modal().errorGuardado('No se realizó la devolución: '+textoError(error));
    });
}

function diagnostico(){
  ui().mostrarDiagnostico();
  ui().escribirDiagnostico({estado:'probando',fuentePrincipal:fuenteActual,apiBase:window.TITULOS_API_BASE||''});
  Promise.allSettled([
    sheets().leerConfiguracion(),
    sheets().diagnostico(),
    sheets().listarCoordinadores(),
    sheets().listarPeriodos()
  ]).then(function(resultados){
    ui().escribirDiagnostico({
      fuentePrincipal:fuenteActual,
      apiBase:window.TITULOS_API_BASE||'',
      configuracion:resultados[0].status==='fulfilled'?resultados[0].value:{error:textoError(resultados[0].reason)},
      conexion:resultados[1].status==='fulfilled'?resultados[1].value:{error:textoError(resultados[1].reason)},
      coordinadores:resultados[2].status==='fulfilled'?resultados[2].value.length:textoError(resultados[2].reason),
      periodos:resultados[3].status==='fulfilled'?resultados[3].value.periodos.length:textoError(resultados[3].reason),
      consultaEnvios:sheets().obtenerDiagnosticoConsulta?sheets().obtenerDiagnosticoConsulta():{},
      filtros:state().obtenerDiagnosticoFiltros(),
      fecha:new Date().toISOString()
    });
  });
}

function eventos(){
  var periodo=$('periodoSelect');
  var coordinador=$('coordinadorSelect');
  var buscador=$('buscadorInput');
  if(periodo)periodo.addEventListener('change',function(){state().setPeriodoActual(periodo.value);});
  if(coordinador)coordinador.addEventListener('change',function(){state().setCoordinadorActual(coordinador.value);});
  if(buscador)buscador.addEventListener('input',function(){state().setBusqueda(buscador.value);});

  document.addEventListener('click',function(evento){
    var boton=evento.target&&evento.target.closest?evento.target.closest('[data-accion]'):null;
    if(!boton)return;
    var accion=boton.getAttribute('data-accion');
    if(accion==='cambiar-vista')state().setVistaActual(boton.getAttribute('data-vista'));
    else if(accion==='actualizar-datos')cargarCatalogos(true);
    else if(accion==='ver-detalle')abrirDetalle(boton.getAttribute('data-envio-id'));
    else if(accion==='cerrar-modal')modal().cerrar();
    else if(accion==='aprobar-envio')aprobar();
    else if(accion==='devolver-envio')devolver();
    else if(accion==='mostrar-diagnostico')diagnostico();
    else if(accion==='ocultar-diagnostico')ui().ocultarDiagnostico();
  });

  document.addEventListener('keydown',function(evento){
    if(evento.key==='Escape')modal().cerrar();
  });
}

function iniciar(){
  if(iniciado)return;
  iniciado=true;
  try{
    validar();
    state().iniciar();
    ui().iniciar();
    modal().iniciar();
    eventos();
    cargarCatalogos(false);
  }catch(error){
    var elemento=$('estadoPrincipal');
    if(elemento){
      elemento.className='status-message is-error';
      elemento.textContent=textoError(error);
    }
    console.error('[CoordinadorMVPApp]',error);
  }
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);
else iniciar();

window.CoordinadorMVPApp=Object.freeze({
  iniciar:iniciar,
  cargarCatalogos:cargarCatalogos,
  cargarTitulos:cargarTitulos,
  aprobar:aprobar,
  devolver:devolver,
  mostrarDiagnostico:diagnostico,
  obtenerFuenteActual:function(){return fuenteActual;}
});
})(window,document);
