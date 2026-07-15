/* =========================================================
Archivo: coordinador.app.js
Ruta: /coordinadores-mvp/js/coordinador.app.js
Función:
- Inicializar Coordinadores usando Google Sheets como fuente principal.
- No bloquear la app cuando Firebase supera su cuota.
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
  function $(id){return document.getElementById(id);}

  function validarDependencias(){
    var faltantes=[];
    if(!state()) faltantes.push('CoordinadorMVPState');
    if(!ui()) faltantes.push('CoordinadorMVPUI');
    if(!modal()) faltantes.push('CoordinadorMVPModal');
    if(!sheetsService()) faltantes.push('CoordinadorMVPSheetsPrimary');
    if(faltantes.length) throw new Error('Faltan módulos: '+faltantes.join(', '));
  }

  function mostrarFuente(mensaje,tipo){
    if(ui()&&typeof ui().mostrarEstado==='function') ui().mostrarEstado('estadoPrincipal',mensaje,tipo||'info');
  }

  function cargarCatalogos(){
    state().limpiarError();
    state().setCargando(true);
    mostrarFuente('Conectando directamente con Google Sheets...','info');

    return Promise.all([
      sheetsService().listarPeriodos(),
      sheetsService().listarCoordinadores()
    ]).then(function(partes){
      var periodos=partes[0]||{periodos:[],principal:null};
      var coordinadores=partes[1]||[];
      if(!periodos.periodos||!periodos.periodos.length) throw new Error('Google Sheets no devolvió períodos.');
      if(!coordinadores.length) throw new Error('Google Sheets no devolvió coordinadores activos.');
      state().setPeriodos(periodos.periodos,periodos.principal);
      state().setCoordinadores(coordinadores);
      fuenteActual='google-sheets';
      mostrarFuente('Conexión directa con Google Sheets correcta. Firebase no es necesario para esta pantalla.','success');
      return cargarTitulos();
    }).catch(function(error){
      state().setError(error);
      mostrarFuente('No se cargaron datos porque Google Sheets respondió con error: '+(error.message||String(error)),'error');
      throw error;
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
      mostrarFuente('Datos cargados desde Google Sheets. Preferido se valida nuevamente al abrir cada estudiante.','success');
      return lista||[];
    }).catch(function(error){
      state().setEnvios([]);
      state().setError(error);
      mostrarFuente('Google Sheets no devolvió los envíos: '+(error.message||String(error)),'error');
      throw error;
    }).finally(function(){state().setCargando(false);});
  }

  function cambiarPeriodo(valor){state().setPeriodoActual(valor);return cargarTitulos().catch(function(){return [];});}
  function cambiarCoordinador(valor){state().setCoordinadorActual(valor);return cargarTitulos().catch(function(){return [];});}

  function abrirDetalle(id){
    var envio=state().seleccionarEstudiante(id);
    if(!envio){ui().mostrarEstado('estadoPrincipal','No se encontró el estudiante.','error');return;}

    state().setCargando(true);
    var periodo=envio.periodoLabel||envio.periodo||envio.periodoId||'';
    sheetsService().consultarEnvioPorCedula(envio.cedula,periodo)
      .then(function(actual){
        var combinado=Object.assign({},envio,actual,{
          id:envio.id||actual.id,
          _clave:envio._clave||actual._clave,
          fila:actual.fila||envio.fila,
          fuente:'google-sheets-consulta-directa'
        });
        state().actualizarEnvioLocal(envio.id||envio.cedula,combinado);
        state().setEstudianteSeleccionado(combinado);
        modal().abrir(combinado);
      })
      .catch(function(error){
        ui().mostrarEstado('estadoPrincipal','No se abrió el detalle porque Google Sheets no devolvió el registro actualizado: '+(error.message||String(error)),'error');
      })
      .finally(function(){state().setCargando(false);});
  }

  function aprobar(){
    var resultado=modal().obtenerResolucionAprobar();
    if(!resultado.ok) return;
    state().setCargando(true);
    sheetsService().aprobarEnvio(resultado.data.envio,resultado.data)
      .then(function(respuesta){
        modal().cerrar();
        ui().mostrarEstado('estadoPrincipal',respuesta.mensaje||'Título aprobado en Google Sheets.','success');
        return cargarTitulos();
      })
      .catch(function(error){
        modal().mostrarEstado('No se guardó la aprobación en Google Sheets: '+(error.message||String(error)),'error');
      })
      .finally(function(){state().setCargando(false);});
  }

  function devolver(){
    var resultado=modal().obtenerResolucionDevolver();
    if(!resultado.ok) return;
    if(!window.confirm('¿Confirmas que deseas devolver estas propuestas al estudiante?')) return;
    state().setCargando(true);
    sheetsService().devolverEnvio(resultado.data.envio,resultado.data)
      .then(function(respuesta){
        modal().cerrar();
        ui().mostrarEstado('estadoPrincipal',respuesta.mensaje||'Título devuelto en Google Sheets.','success');
        return cargarTitulos();
      })
      .catch(function(error){
        modal().mostrarEstado('No se realizó la devolución en Google Sheets: '+(error.message||String(error)),'error');
      })
      .finally(function(){state().setCargando(false);});
  }

  function mostrarDiagnostico(){
    ui().mostrarDiagnostico();
    ui().escribirDiagnostico({estado:'probando',fuentePrincipal:'Google Sheets',fecha:new Date().toISOString()});
    sheetsService().diagnostico().then(function(resultado){
      ui().escribirDiagnostico({ok:true,fuentePrincipal:'Google Sheets',fuenteActual:fuenteActual,googleSheets:resultado,firebaseRespaldo:{omitido:true,motivo:'No se consulta para evitar la cuota.'},fecha:new Date().toISOString()});
    }).catch(function(error){
      ui().escribirDiagnostico({ok:false,fuentePrincipal:'Google Sheets',error:error.message||String(error),fecha:new Date().toISOString()});
    });
  }

  function conectarEventos(){
    var periodo=$('periodoSelect');
    var coordinador=$('coordinadorSelect');
    var buscador=$('buscadorInput');
    if(periodo) periodo.addEventListener('change',function(){cambiarPeriodo(periodo.value);});
    if(coordinador) coordinador.addEventListener('change',function(){cambiarCoordinador(coordinador.value);});
    if(buscador) buscador.addEventListener('input',function(){state().setBusqueda(buscador.value);});

    document.addEventListener('click',function(evento){
      var boton=evento.target&&evento.target.closest?evento.target.closest('[data-accion]'):null;
      if(!boton) return;
      var accion=boton.getAttribute('data-accion');
      if(accion==='cambiar-vista'){state().setVistaActual(boton.getAttribute('data-vista'));cargarTitulos().catch(function(){});}
      else if(accion==='actualizar-datos') cargarCatalogos().catch(function(){});
      else if(accion==='ver-detalle') abrirDetalle(boton.getAttribute('data-envio-id'));
      else if(accion==='cerrar-modal') modal().cerrar();
      else if(accion==='aprobar-envio') aprobar();
      else if(accion==='devolver-envio') devolver();
      else if(accion==='mostrar-diagnostico') mostrarDiagnostico();
      else if(accion==='ocultar-diagnostico') ui().ocultarDiagnostico();
    });
    document.addEventListener('keydown',function(evento){if(evento.key==='Escape') modal().cerrar();});
  }

  function iniciar(){
    if(iniciado) return;
    iniciado=true;
    try{
      validarDependencias();
      state().iniciar();
      ui().iniciar();
      modal().iniciar();
      conectarEventos();
      cargarCatalogos().catch(function(){});
    }catch(error){
      var estado=$('estadoPrincipal');
      if(estado){estado.className='status-message is-error';estado.textContent=error.message||String(error);}
      console.error('[CoordinadorMVPApp]',error);
    }
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
  window.CoordinadorMVPApp=Object.freeze({iniciar:iniciar,cargarCatalogos:cargarCatalogos,cargarTitulos:cargarTitulos,aprobar:aprobar,devolver:devolver,obtenerFuenteActual:function(){return fuenteActual;}});
})(window,document);
