/*
  Integración directa de IA 3x3 con estudiante.html.
  - Deja un único botón al final de la propuesta 3.
  - No intercepta ni cancela el flujo antiguo: usa una acción exclusiva.
  - Genera 9 títulos para las 3 propuestas.
*/
(function (window, document) {
  'use strict';

  var instalado = false;
  var intentos = 0;
  var enCurso = false;
  var ACCION = 'generar-ia-9';
  var MENSAJE_PUBLICO =
    'No te preocupes. No fue posible generar las sugerencias en este momento. ' +
    'Puedes intentarlo nuevamente. Si el inconveniente continúa, comunícate con tu coordinador para recibir apoyo.';

  function instalar() {
    if (instalado) return;

    if (
      !window.EstudianteMVPApp ||
      !window.EstudianteMVPState ||
      !window.EstudianteMVPUI ||
      !window.EstudianteMVPIATitulacion ||
      typeof window.EstudianteMVPIATitulacion.generarNueveTitulos !== 'function'
    ) {
      intentos += 1;
      if (intentos < 240) window.setTimeout(instalar, 25);
      return;
    }

    configurarUnicoBoton();
    document.addEventListener('click', manejarClickGeneracion);
    instalado = true;
  }

  function configurarUnicoBoton() {
    var panel1 = document.querySelector('[data-propuesta-panel="1"]');
    var panel2 = document.querySelector('[data-propuesta-panel="2"]');
    var panel3 = document.querySelector('[data-propuesta-panel="3"]');
    var boton;

    retirarAccionIA(panel1);
    retirarAccionIA(panel2);

    if (!panel3) return;

    boton = panel3.querySelector('[data-accion="generar-ia"], [data-accion="' + ACCION + '"]');
    if (!boton) return;

    boton.setAttribute('data-accion', ACCION);
    boton.removeAttribute('data-propuesta');
    boton.textContent = 'Generar 9 títulos con IA (3 por sección)';
    boton.setAttribute(
      'title',
      'Genera tres alternativas para cada una de las tres propuestas completas.'
    );
  }

  function retirarAccionIA(panel) {
    var acciones;
    var diagnostico;

    if (!panel) return;

    acciones = panel.querySelector('.ai-actions');
    diagnostico = panel.querySelector('[data-ia-diagnostico]');

    if (acciones && acciones.parentNode) acciones.parentNode.removeChild(acciones);
    if (diagnostico && diagnostico.parentNode) diagnostico.parentNode.removeChild(diagnostico);
  }

  function manejarClickGeneracion(evento) {
    var boton = evento.target && evento.target.closest
      ? evento.target.closest('[data-accion="' + ACCION + '"]')
      : null;

    if (!boton) return;

    evento.preventDefault();
    if (enCurso) return;

    ejecutarGeneracion();
  }

  function ejecutarGeneracion() {
    var state = window.EstudianteMVPState;
    var ui = window.EstudianteMVPUI;
    var ia = window.EstudianteMVPIATitulacion;
    var modales = window.EstudianteMVPModales || null;
    var propuestas = guardarPropuestasDesdeFormulario();
    var validacion = validarTresPropuestas();
    var estudiante = state.obtenerEstudiante();

    if (!validacion.ok) {
      mostrarErrorValidacion(validacion);
      return;
    }

    enCurso = true;
    emitir('ia-titulacion:3x3-inicio', {
      totalEsperado: 9,
      secciones: 3
    });

    mostrarEstadoTodas('Generando 9 títulos: 3 para cada sección...', 'info');

    if (modales && typeof modales.mostrarGenerandoIA === 'function') {
      modales.mostrarGenerandoIA();
    }
    if (ui && typeof ui.setCargando === 'function') {
      ui.setCargando(true, 'Generando y revisando 9 títulos con IA...');
    }

    ia.generarNueveTitulos({
      estudiante: estudiante,
      propuestas: propuestas,
      numeroPropuestaOrigen: 3,
      maxTokens: 2800
    })
      .then(function (resultado) {
        aplicarResultado(resultado);
        emitir('ia-titulacion:3x3-exito', resultado || {});
      })
      .catch(function (error) {
        console.warn('[IA Titulación 3x3] Detalle interno:', error);
        mostrarEstadoTodas(MENSAJE_PUBLICO, 'error');
        emitir('ia-titulacion:3x3-error', {
          error: error,
          mensaje: error && error.message ? error.message : String(error || '')
        });
      })
      .then(function () {
        if (modales && typeof modales.cerrarGenerandoIA === 'function') {
          modales.cerrarGenerandoIA();
        }
        if (ui && typeof ui.setCargando === 'function') {
          ui.setCargando(false);
        }
        enCurso = false;
      });
  }

  function guardarPropuestasDesdeFormulario() {
    var state = window.EstudianteMVPState;
    var ui = window.EstudianteMVPUI;
    var propuestas = [];
    var i;

    for (i = 1; i <= 3; i += 1) {
      state.setPropuesta(i, ui.leerPropuestaDesdeFormulario(i));
      propuestas.push(state.obtenerPropuesta(i));
    }

    return propuestas;
  }

  function validarTresPropuestas() {
    var state = window.EstudianteMVPState;
    var i;
    var validacion;

    for (i = 1; i <= 3; i += 1) {
      validacion = state.validarPropuestaParaIA(i);
      if (!validacion.ok) {
        validacion.numeroPropuesta = i;
        return validacion;
      }
    }

    return { ok: true };
  }

  function mostrarErrorValidacion(validacion) {
    var ui = window.EstudianteMVPUI;
    var paginacion = window.EstudianteMVPPropuestasPaginacion || null;
    var numero = Number(validacion.numeroPropuesta || 1);

    if (paginacion && typeof paginacion.mostrar === 'function') {
      paginacion.mostrar(numero);
    }

    ui.mostrarEstado('#p' + numero + 'EstadoIA', validacion.mensaje, 'error');
    if (validacion.selector && typeof ui.marcarCampoInvalido === 'function') {
      ui.marcarCampoInvalido(validacion.selector);
    }
  }

  function aplicarResultado(resultado) {
    var state = window.EstudianteMVPState;
    var ui = window.EstudianteMVPUI;
    var recomendacion = window.EstudianteMVPIARecomendacion || null;
    var secciones = resultado && Array.isArray(resultado.secciones)
      ? resultado.secciones
      : [];
    var proveedor = resultado.proveedor || resultado.proveedorNombre || '';

    if (secciones.length !== 3) {
      throw new Error('El resultado no contiene las tres secciones esperadas.');
    }

    secciones.forEach(function (seccion) {
      var numero = Number(seccion.seccion || 0);
      var titulos = Array.isArray(seccion.titulos) ? seccion.titulos : [];

      if (!numero || titulos.length !== 3) {
        throw new Error('Una sección no contiene exactamente tres títulos.');
      }

      state.setSugerenciasIA(numero, titulos, proveedor);
      ui.pintarSugerencias(numero, titulos);
      ui.mostrarEstado(
        '#p' + numero + 'EstadoIA',
        'Se generaron 3 alternativas para ' + seccion.nombreEtapa + '. Elige una.',
        'success'
      );
    });

    if (recomendacion && typeof recomendacion.marcarPagina === 'function') {
      recomendacion.marcarPagina(secciones);
    }

    guardarAvance();

    if (recomendacion && typeof recomendacion.mostrarResultado === 'function') {
      recomendacion.mostrarResultado(resultado);
    }
  }

  function mostrarEstadoTodas(mensaje, tipo) {
    var ui = window.EstudianteMVPUI;
    [1, 2, 3].forEach(function (numero) {
      ui.mostrarEstado('#p' + numero + 'EstadoIA', mensaje, tipo);
    });
  }

  function guardarAvance() {
    var memoria = window.EstudianteMVPMemoria || null;

    if (memoria && typeof memoria.guardarDesdeState === 'function') {
      memoria.guardarDesdeState({
        pasoActual: 'propuestas',
        propuestaActual: 3
      });
    }
  }

  function emitir(nombre, detalle) {
    var evento;

    try {
      evento = new CustomEvent(nombre, { detail: detalle || {} });
      document.dispatchEvent(evento);
    } catch (error) {
      /* Navegadores antiguos: el diagnóstico no debe bloquear la generación. */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }

  window.EstudianteMVPIANueveIntegracion = Object.freeze({
    ejecutarGeneracion: ejecutarGeneracion,
    configurarUnicoBoton: configurarUnicoBoton,
    accion: ACCION
  });
})(window, document);
