/* =========================================================
Archivo: coordinador.app.js
Ruta: /coordinadores-mvp/js/coordinador.app.js
Función:
- Inicializar la app de coordinadores.
- Cargar períodos, coordinadores y títulos desde Firebase.
- Conectar filtros, modal, aprobación y devolución.
========================================================= */
(function(window,document){
  'use strict';

  var iniciado = false;

  function state(){ return window.CoordinadorMVPState || null; }
  function ui(){ return window.CoordinadorMVPUI || null; }
  function modal(){ return window.CoordinadorMVPModal || null; }
  function firebaseService(){ return window.CoordinadorMVPFirebase || null; }
  function $(id){ return document.getElementById(id); }

  function validarDependencias(){
    var faltantes = [];
    if(!state()) faltantes.push('CoordinadorMVPState');
    if(!ui()) faltantes.push('CoordinadorMVPUI');
    if(!modal()) faltantes.push('CoordinadorMVPModal');
    if(!firebaseService()) faltantes.push('CoordinadorMVPFirebase');
    if(faltantes.length) throw new Error('Faltan módulos: ' + faltantes.join(', '));
  }

  function cargarCatalogos(){
    state().limpiarError();
    state().setCargando(true);

    return Promise.all([
      firebaseService().listarPeriodosActivos(),
      firebaseService().listarCoordinadoresActivos()
    ])
      .then(function(partes){
        var periodos = partes[0] || { periodos:[], principal:null };
        state().setPeriodos(periodos.periodos || [], periodos.principal || null);
        state().setCoordinadores(partes[1] || []);

        if(!periodos.periodos || !periodos.periodos.length){
          throw new Error('No existen períodos activos en el administrador.');
        }

        return cargarTitulos();
      })
      .catch(function(error){
        state().setError(error);
        throw error;
      })
      .finally(function(){ state().setCargando(false); });
  }

  function cargarTitulos(){
    var periodo = state().obtenerPeriodoActual();
    if(!periodo){
      state().setEnvios([]);
      return Promise.resolve([]);
    }

    state().limpiarError();
    state().setCargando(true);

    return firebaseService().listarTitulos(periodo)
      .then(function(lista){
        state().setEnvios(lista || []);
        return lista || [];
      })
      .catch(function(error){
        state().setEnvios([]);
        state().setError(error);
        throw error;
      })
      .finally(function(){ state().setCargando(false); });
  }

  function cambiarPeriodo(valor){
    state().setPeriodoActual(valor);
    return cargarTitulos().catch(function(){ return []; });
  }

  function cambiarCoordinador(valor){
    state().setCoordinadorActual(valor);
  }

  function abrirDetalle(id){
    var envio = state().seleccionarEstudiante(id);
    if(!envio){
      ui().mostrarEstado('estadoPrincipal','No se encontró el estudiante.','error');
      return;
    }
    modal().abrir(envio);
  }

  function aprobar(){
    var resultado = modal().obtenerResolucionAprobar();
    if(!resultado.ok) return;

    state().setCargando(true);
    firebaseService().aprobarTitulo(resultado.data.envio, resultado.data)
      .then(function(respuesta){
        modal().cerrar();
        ui().mostrarEstado('estadoPrincipal',respuesta.mensaje || 'Título aprobado.','success');
        return cargarTitulos();
      })
      .catch(function(error){
        modal().mostrarEstado(error.message || String(error),'error');
      })
      .finally(function(){ state().setCargando(false); });
  }

  function devolver(){
    var resultado = modal().obtenerResolucionDevolver();
    if(!resultado.ok) return;
    if(!window.confirm('¿Confirmas que deseas devolver estas propuestas al estudiante?')) return;

    state().setCargando(true);
    firebaseService().devolverTitulo(resultado.data.envio, resultado.data)
      .then(function(respuesta){
        modal().cerrar();
        ui().mostrarEstado('estadoPrincipal',respuesta.mensaje || 'Título devuelto.','success');
        return cargarTitulos();
      })
      .catch(function(error){
        modal().mostrarEstado(error.message || String(error),'error');
      })
      .finally(function(){ state().setCargando(false); });
  }

  function mostrarDiagnostico(){
    ui().mostrarDiagnostico();
    ui().escribirDiagnostico({ estado:'probando', fecha:new Date().toISOString() });
    firebaseService().diagnostico()
      .then(function(resultado){ ui().escribirDiagnostico(resultado); })
      .catch(function(error){ ui().escribirDiagnostico({ ok:false, error:error.message || String(error) }); });
  }

  function conectarEventos(){
    var periodo = $('periodoSelect');
    var coordinador = $('coordinadorSelect');
    var buscador = $('buscadorInput');

    if(periodo){
      periodo.addEventListener('change',function(){ cambiarPeriodo(periodo.value); });
    }
    if(coordinador){
      coordinador.addEventListener('change',function(){ cambiarCoordinador(coordinador.value); });
    }
    if(buscador){
      buscador.addEventListener('input',function(){ state().setBusqueda(buscador.value); });
    }

    document.addEventListener('click',function(evento){
      var boton = evento.target && evento.target.closest ? evento.target.closest('[data-accion]') : null;
      if(!boton) return;
      var accion = boton.getAttribute('data-accion');

      if(accion === 'cambiar-vista') state().setVistaActual(boton.getAttribute('data-vista'));
      else if(accion === 'actualizar-datos') cargarCatalogos().catch(function(){});
      else if(accion === 'ver-detalle') abrirDetalle(boton.getAttribute('data-envio-id'));
      else if(accion === 'cerrar-modal') modal().cerrar();
      else if(accion === 'aprobar-envio') aprobar();
      else if(accion === 'devolver-envio') devolver();
      else if(accion === 'mostrar-diagnostico') mostrarDiagnostico();
      else if(accion === 'ocultar-diagnostico') ui().ocultarDiagnostico();
    });

    document.addEventListener('keydown',function(evento){
      if(evento.key === 'Escape') modal().cerrar();
    });
  }

  function iniciar(){
    if(iniciado) return;
    iniciado = true;

    try{
      validarDependencias();
      state().iniciar();
      ui().iniciar();
      modal().iniciar();
      conectarEventos();
      firebaseService().inicializar()
        .then(cargarCatalogos)
        .catch(function(error){
          state().setError(error);
          ui().mostrarEstado('estadoPrincipal',error.message || String(error),'error');
        });
    }catch(error){
      var estado = $('estadoPrincipal');
      if(estado){
        estado.className = 'status-message is-error';
        estado.textContent = error.message || String(error);
      }
      console.error('[CoordinadorMVPApp]',error);
    }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded',iniciar);
  else iniciar();

  window.CoordinadorMVPApp = Object.freeze({
    iniciar:iniciar,
    cargarCatalogos:cargarCatalogos,
    cargarTitulos:cargarTitulos,
    aprobar:aprobar,
    devolver:devolver
  });
})(window,document);
