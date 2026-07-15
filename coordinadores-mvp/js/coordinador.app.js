/* =========================================================
Archivo: coordinador.app.js
Ruta: /coordinadores-mvp/js/coordinador.app.js
Función:
- Inicializar la app de coordinadores.
- Usar Google Sheets como fuente principal de coordinadores y envíos.
- Usar Firebase para períodos, respaldo y contingencia visible.
- Aprobar y devolver primero en Google Sheets y luego respaldar en Firebase.
========================================================= */
(function(window,document){
  'use strict';

  var iniciado = false;
  var fuenteActual = 'google-sheets';

  function state(){ return window.CoordinadorMVPState || null; }
  function ui(){ return window.CoordinadorMVPUI || null; }
  function modal(){ return window.CoordinadorMVPModal || null; }
  function firebaseService(){ return window.CoordinadorMVPFirebase || null; }
  function sheetsService(){ return window.CoordinadorMVPSheetsPrimary || null; }
  function $(id){ return document.getElementById(id); }

  function validarDependencias(){
    var faltantes = [];
    if(!state()) faltantes.push('CoordinadorMVPState');
    if(!ui()) faltantes.push('CoordinadorMVPUI');
    if(!modal()) faltantes.push('CoordinadorMVPModal');
    if(!firebaseService()) faltantes.push('CoordinadorMVPFirebase');
    if(!sheetsService()) faltantes.push('CoordinadorMVPSheetsPrimary');
    if(faltantes.length) throw new Error('Faltan módulos: ' + faltantes.join(', '));
  }

  function mostrarFuente(mensaje,tipo){
    if(ui() && typeof ui().mostrarEstado === 'function'){
      ui().mostrarEstado('estadoPrincipal',mensaje,tipo || 'info');
    }
  }

  function cargarCoordinadoresPrincipal(){
    return sheetsService().listarCoordinadores()
      .then(function(lista){
        if(!lista || !lista.length){
          throw new Error('Google Sheets no devolvió coordinadores activos.');
        }
        fuenteActual = 'google-sheets';
        return lista;
      })
      .catch(function(errorSheets){
        console.warn('[Coordinadores] No se pudieron leer coordinadores desde Sheets:',errorSheets);
        return firebaseService().listarCoordinadoresActivos().then(function(listaFirebase){
          fuenteActual = 'firebase-fallback';
          mostrarFuente(
            'Advertencia: los coordinadores se cargaron desde Firebase porque Google Sheets no respondió: ' +
            (errorSheets.message || String(errorSheets)),
            'warning'
          );
          return listaFirebase || [];
        });
      });
  }

  function cargarCatalogos(){
    state().limpiarError();
    state().setCargando(true);

    return Promise.all([
      firebaseService().listarPeriodosActivos(),
      cargarCoordinadoresPrincipal()
    ])
      .then(function(partes){
        var periodos = partes[0] || { periodos:[], principal:null };
        state().setPeriodos(periodos.periodos || [],periodos.principal || null);
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

  function cargarTitulosDesdeSheets(periodo){
    var coordinador = state().obtenerCoordinadorActual();

    return sheetsService().listarEnvios({
      periodo:periodo,
      coordinador:coordinador,
      carreras:coordinador && coordinador.carreras || [],
      vista:state().obtenerVistaActual()
    }).then(function(lista){
      fuenteActual = 'google-sheets';
      mostrarFuente(
        'Datos cargados desde Google Sheets. La columna Preferido controla el título favorito del estudiante.',
        'success'
      );
      return lista || [];
    });
  }

  function cargarTitulos(){
    var periodo = state().obtenerPeriodoActual();
    if(!periodo){
      state().setEnvios([]);
      return Promise.resolve([]);
    }

    state().limpiarError();
    state().setCargando(true);

    return cargarTitulosDesdeSheets(periodo)
      .catch(function(errorSheets){
        console.error('[Coordinadores] Google Sheets no respondió. Se activa respaldo Firebase:',errorSheets);
        fuenteActual = 'firebase-fallback';
        mostrarFuente(
          'Google Sheets no respondió. Se muestran datos de respaldo de Firebase; el favorito puede no estar disponible. Error: ' +
          (errorSheets.message || String(errorSheets)),
          'warning'
        );
        return firebaseService().listarTitulos(periodo);
      })
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
    return cargarTitulos().catch(function(){ return []; });
  }

  function abrirDetalle(id){
    var envio = state().seleccionarEstudiante(id);
    if(!envio){
      ui().mostrarEstado('estadoPrincipal','No se encontró el estudiante.','error');
      return;
    }
    modal().abrir(envio);
  }

  function respaldarAprobacionFirebase(envio,resolucion){
    return firebaseService().aprobarTitulo(envio,resolucion)
      .then(function(){ return { ok:true }; })
      .catch(function(error){
        console.warn('[Coordinadores] Sheets fue actualizado, pero falló el respaldo Firebase:',error);
        return { ok:false, error:error };
      });
  }

  function respaldarDevolucionFirebase(envio,resolucion){
    return firebaseService().devolverTitulo(envio,resolucion)
      .then(function(){ return { ok:true }; })
      .catch(function(error){
        console.warn('[Coordinadores] Sheets fue actualizado, pero falló el respaldo Firebase:',error);
        return { ok:false, error:error };
      });
  }

  function aprobar(){
    var resultado = modal().obtenerResolucionAprobar();
    if(!resultado.ok) return;

    state().setCargando(true);
    sheetsService().aprobarEnvio(resultado.data.envio,resultado.data)
      .then(function(respuestaSheets){
        return respaldarAprobacionFirebase(resultado.data.envio,resultado.data)
          .then(function(respaldo){
            modal().cerrar();
            ui().mostrarEstado(
              'estadoPrincipal',
              respaldo.ok
                ? (respuestaSheets.mensaje || 'Título aprobado en Google Sheets y respaldado en Firebase.')
                : (respuestaSheets.mensaje || 'Título aprobado en Google Sheets.') + ' El respaldo Firebase quedó pendiente.',
              respaldo.ok ? 'success' : 'warning'
            );
            return cargarTitulos();
          });
      })
      .catch(function(error){
        modal().mostrarEstado(
          'No se guardó la aprobación porque Google Sheets, la base principal, respondió con error: ' +
          (error.message || String(error)),
          'error'
        );
      })
      .finally(function(){ state().setCargando(false); });
  }

  function devolver(){
    var resultado = modal().obtenerResolucionDevolver();
    if(!resultado.ok) return;
    if(!window.confirm('¿Confirmas que deseas devolver estas propuestas al estudiante?')) return;

    state().setCargando(true);
    sheetsService().devolverEnvio(resultado.data.envio,resultado.data)
      .then(function(respuestaSheets){
        return respaldarDevolucionFirebase(resultado.data.envio,resultado.data)
          .then(function(respaldo){
            modal().cerrar();
            ui().mostrarEstado(
              'estadoPrincipal',
              respaldo.ok
                ? (respuestaSheets.mensaje || 'Título devuelto en Google Sheets y respaldado en Firebase.')
                : (respuestaSheets.mensaje || 'Título devuelto en Google Sheets.') + ' El respaldo Firebase quedó pendiente.',
              respaldo.ok ? 'success' : 'warning'
            );
            return cargarTitulos();
          });
      })
      .catch(function(error){
        modal().mostrarEstado(
          'No se realizó la devolución porque Google Sheets, la base principal, respondió con error: ' +
          (error.message || String(error)),
          'error'
        );
      })
      .finally(function(){ state().setCargando(false); });
  }

  function mostrarDiagnostico(){
    ui().mostrarDiagnostico();
    ui().escribirDiagnostico({ estado:'probando', fuentePrincipal:'Google Sheets', fecha:new Date().toISOString() });

    Promise.allSettled([
      sheetsService().diagnostico(),
      firebaseService().diagnostico()
    ]).then(function(resultados){
      ui().escribirDiagnostico({
        ok:resultados[0].status === 'fulfilled',
        fuentePrincipal:'Google Sheets',
        fuenteActual:fuenteActual,
        googleSheets:resultados[0].status === 'fulfilled'
          ? resultados[0].value
          : { ok:false, error:resultados[0].reason && resultados[0].reason.message },
        firebaseRespaldo:resultados[1].status === 'fulfilled'
          ? resultados[1].value
          : { ok:false, error:resultados[1].reason && resultados[1].reason.message },
        fecha:new Date().toISOString()
      });
    });
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

      if(accion === 'cambiar-vista'){
        state().setVistaActual(boton.getAttribute('data-vista'));
        cargarTitulos().catch(function(){});
      }
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
    devolver:devolver,
    obtenerFuenteActual:function(){ return fuenteActual; }
  });
})(window,document);
