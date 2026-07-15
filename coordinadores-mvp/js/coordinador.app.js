/* =========================================================
Archivo: coordinador.app.js
Ruta: /coordinadores-mvp/js/coordinador.app.js
Función:
- Inicializar Coordinadores usando Google Sheets como fuente principal.
- No bloquear toda la pantalla si falla solo un catálogo.
- Mostrar el error real de configuración o de Apps Script.
- Consultar el envío por cédula antes de abrir el modal para recuperar Preferido.
- Aprobar y devolver directamente en Google Sheets.
========================================================= */
(function(window,document){
  'use strict';

  var iniciado=false;
  var fuenteActual='google-sheets';

  function state(){return window.CoordinadorMVPState||null;}
  function ui(){return window.CoordinadorMVPUI||null;}
  function modal(){return window.CoordinadorMVPModal||null;}
  function sheetsService(){return window.CoordinadorMVPSheetsPrimary||null;}
  function config(){return window.CoordinadorMVPConfig||null;}
  function $(id){return document.getElementById(id);}
  function textoError(error){
    if(!error)return 'Error desconocido.';
    if(typeof error==='string')return error;
    if(error.message)return textoError(error.message);
    if(error.mensaje)return textoError(error.mensaje);
    if(error.error)return textoError(error.error);
    try{return JSON.stringify(error);}catch(errorJson){return String(error);}
  }

  function validarDependencias(){
    var faltantes=[];
    if(!state())faltantes.push('CoordinadorMVPState');
    if(!ui())faltantes.push('CoordinadorMVPUI');
    if(!modal())faltantes.push('CoordinadorMVPModal');
    if(!sheetsService())faltantes.push('CoordinadorMVPSheetsPrimary');
    if(faltantes.length)throw new Error('Faltan módulos: '+faltantes.join(', '));
  }
  function mostrarFuente(mensaje,tipo){if(ui()&&typeof ui().mostrarEstado==='function')ui().mostrarEstado('estadoPrincipal',mensaje,tipo||'info');}
  function periodoFallback(){
    var id='2026-02__2026-08';var label='Febrero 2026 a Agosto 2026';
    if(config()&&typeof config().obtener==='function'){
      id=config().obtener('periodos.fallbackId',id);
      label=config().obtener('periodos.fallbackLabel',label);
    }
    return {id:id,label:label,activo:true,fallback:true};
  }

  function cargarCatalogos(){
    state().limpiarError();
    state().setCargando(true);
    mostrarFuente('Validando la configuración directa de Google Sheets...','info');

    return sheetsService().leerConfiguracion(true).then(function(cfg){
      if(!cfg||!cfg.endpoint)throw new Error('No hay una URL de Apps Script guardada para Coordinadores. Abre Administrador → Google Sheets, guarda la URL y vuelve a esta pantalla.');
      if(cfg.activo===false)throw new Error('Google Sheets está desactivado en Administrador → Google Sheets.');

      mostrarFuente('Conectando con Google Sheets mediante '+cfg.origen+'...','info');
      return Promise.allSettled([
        sheetsService().listarPeriodos(),
        sheetsService().listarCoordinadores()
      ]).then(function(resultados){
        var resultadoPeriodos=resultados[0];
        var resultadoCoordinadores=resultados[1];
        var errores=[];
        var periodos={periodos:[],principal:null};
        var coordinadores=[];

        if(resultadoPeriodos.status==='fulfilled'){
          periodos=resultadoPeriodos.value||periodos;
        }else{
          errores.push('Períodos: '+textoError(resultadoPeriodos.reason));
          var fb=periodoFallback();
          periodos={periodos:[fb],principal:fb};
        }

        if(resultadoCoordinadores.status==='fulfilled'){
          coordinadores=resultadoCoordinadores.value||[];
        }else{
          errores.push('Coordinadores: '+textoError(resultadoCoordinadores.reason));
        }

        state().setPeriodos(periodos.periodos||[],periodos.principal||null);
        state().setCoordinadores(coordinadores);
        fuenteActual='google-sheets';

        if(errores.length){
          var errorCombinado=new Error(errores.join(' | '));
          state().setError(errorCombinado);
          mostrarFuente(errores.join(' | '),'error');
          return {ok:false,errores:errores,periodos:periodos,coordinadores:coordinadores};
        }

        state().limpiarError();
        mostrarFuente('Google Sheets conectado. Períodos y coordinadores cargados correctamente.','success');
        return cargarTitulos().then(function(){return {ok:true,periodos:periodos,coordinadores:coordinadores};});
      });
    }).catch(function(error){
      var mensaje=textoError(error);
      state().setPeriodos([],null);
      state().setCoordinadores([]);
      state().setEnvios([]);
      state().setError(new Error(mensaje));
      mostrarFuente(mensaje,'error');
      return {ok:false,error:mensaje};
    }).finally(function(){state().setCargando(false);});
  }

  function cargarTitulos(){
    var periodo=state().obtenerPeriodoActual();
    var coordinador=state().obtenerCoordinadorActual();
    if(!periodo){state().setEnvios([]);return Promise.resolve([]);}

    state().limpiarError();
    state().setCargando(true);
    return sheetsService().listarEnvios({
      periodo:periodo,
      coordinador:coordinador,
      carreras:coordinador&&coordinador.carreras||[],
      vista:state().obtenerVistaActual()
    }).then(function(lista){
      fuenteActual='google-sheets';
      state().setEnvios(lista||[]);
      if(coordinador){
        mostrarFuente('Datos cargados desde Google Sheets. Preferido se valida al abrir cada estudiante.','success');
      }else{
        mostrarFuente('Google Sheets conectado. Selecciona un coordinador para filtrar sus carreras.','info');
      }
      return lista||[];
    }).catch(function(error){
      var mensaje=textoError(error);
      state().setEnvios([]);
      state().setError(new Error(mensaje));
      mostrarFuente('No se pudieron cargar los envíos: '+mensaje,'error');
      return [];
    }).finally(function(){state().setCargando(false);});
  }

  function cambiarPeriodo(valor){state().setPeriodoActual(valor);return cargarTitulos();}
  function cambiarCoordinador(valor){state().setCoordinadorActual(valor);return cargarTitulos();}

  function abrirDetalle(id){
    var envio=state().seleccionarEstudiante(id);
    if(!envio){ui().mostrarEstado('estadoPrincipal','No se encontró el estudiante.','error');return;}
    state().setCargando(true);
    var periodo=envio.periodoLabel||envio.periodo||envio.periodoId||'';
    sheetsService().consultarEnvioPorCedula(envio.cedula,periodo)
      .then(function(actual){
        var combinado=Object.assign({},envio,actual,{id:envio.id||actual.id,_clave:envio._clave||actual._clave,fila:actual.fila||envio.fila,fuente:'google-sheets-consulta-directa'});
        state().actualizarEnvioLocal(envio.id||envio.cedula,combinado);
        state().setEstudianteSeleccionado(combinado);
        modal().abrir(combinado);
      })
      .catch(function(error){ui().mostrarEstado('estadoPrincipal','No se abrió el detalle: '+textoError(error),'error');})
      .finally(function(){state().setCargando(false);});
  }

  function aprobar(){
    var resultado=modal().obtenerResolucionAprobar();if(!resultado.ok)return;
    state().setCargando(true);
    sheetsService().aprobarEnvio(resultado.data.envio,resultado.data)
      .then(function(respuesta){modal().cerrar();ui().mostrarEstado('estadoPrincipal',respuesta.mensaje||'Título aprobado en Google Sheets.','success');return cargarTitulos();})
      .catch(function(error){modal().mostrarEstado('No se guardó la aprobación en Google Sheets: '+textoError(error),'error');})
      .finally(function(){state().setCargando(false);});
  }
  function devolver(){
    var resultado=modal().obtenerResolucionDevolver();if(!resultado.ok)return;
    if(!window.confirm('¿Confirmas que deseas devolver estas propuestas al estudiante?'))return;
    state().setCargando(true);
    sheetsService().devolverEnvio(resultado.data.envio,resultado.data)
      .then(function(respuesta){modal().cerrar();ui().mostrarEstado('estadoPrincipal',respuesta.mensaje||'Título devuelto en Google Sheets.','success');return cargarTitulos();})
      .catch(function(error){modal().mostrarEstado('No se realizó la devolución en Google Sheets: '+textoError(error),'error');})
      .finally(function(){state().setCargando(false);});
  }

  function mostrarDiagnostico(){
    ui().mostrarDiagnostico();
    ui().escribirDiagnostico({estado:'probando',fuentePrincipal:'Google Sheets',fecha:new Date().toISOString()});
    Promise.allSettled([
      sheetsService().leerConfiguracion(true),
      sheetsService().diagnostico(),
      sheetsService().listarCoordinadores(),
      sheetsService().listarPeriodos()
    ]).then(function(partes){
      ui().escribirDiagnostico({
        fuentePrincipal:'Google Sheets',
        fuenteActual:fuenteActual,
        configuracion:partes[0].status==='fulfilled'?partes[0].value:{error:textoError(partes[0].reason)},
        ping:partes[1].status==='fulfilled'?partes[1].value:{error:textoError(partes[1].reason)},
        coordinadores:partes[2].status==='fulfilled'?{ok:true,total:partes[2].value.length}:{ok:false,error:textoError(partes[2].reason)},
        periodos:partes[3].status==='fulfilled'?{ok:true,total:partes[3].value.periodos.length,datos:partes[3].value.periodos}:{ok:false,error:textoError(partes[3].reason)},
        firebaseRespaldo:{omitido:true,motivo:'No se consulta para evitar la cuota.'},
        fecha:new Date().toISOString()
      });
    });
  }

  function conectarEventos(){
    var periodo=$('periodoSelect');var coordinador=$('coordinadorSelect');var buscador=$('buscadorInput');
    if(periodo)periodo.addEventListener('change',function(){cambiarPeriodo(periodo.value);});
    if(coordinador)coordinador.addEventListener('change',function(){cambiarCoordinador(coordinador.value);});
    if(buscador)buscador.addEventListener('input',function(){state().setBusqueda(buscador.value);});
    document.addEventListener('click',function(evento){
      var boton=evento.target&&evento.target.closest?evento.target.closest('[data-accion]'):null;if(!boton)return;
      var accion=boton.getAttribute('data-accion');
      if(accion==='cambiar-vista'){state().setVistaActual(boton.getAttribute('data-vista'));cargarTitulos();}
      else if(accion==='actualizar-datos')cargarCatalogos();
      else if(accion==='ver-detalle')abrirDetalle(boton.getAttribute('data-envio-id'));
      else if(accion==='cerrar-modal')modal().cerrar();
      else if(accion==='aprobar-envio')aprobar();
      else if(accion==='devolver-envio')devolver();
      else if(accion==='mostrar-diagnostico')mostrarDiagnostico();
      else if(accion==='ocultar-diagnostico')ui().ocultarDiagnostico();
    });
    document.addEventListener('keydown',function(evento){if(evento.key==='Escape')modal().cerrar();});
  }
  function iniciar(){
    if(iniciado)return;iniciado=true;
    try{validarDependencias();state().iniciar();ui().iniciar();modal().iniciar();conectarEventos();cargarCatalogos();}
    catch(error){var estado=$('estadoPrincipal');if(estado){estado.className='status-message is-error';estado.textContent=textoError(error);}console.error('[CoordinadorMVPApp]',error);}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
  window.CoordinadorMVPApp=Object.freeze({iniciar:iniciar,cargarCatalogos:cargarCatalogos,cargarTitulos:cargarTitulos,aprobar:aprobar,devolver:devolver,mostrarDiagnostico:mostrarDiagnostico,obtenerFuenteActual:function(){return fuenteActual;}});
})(window,document);
