/*
  Integración IA por propuesta:
  - Cada propuesta conserva su propio botón.
  - Cada clic genera 9 títulos internos para esa propuesta.
  - Solo se muestran 3 opciones validadas: diagnóstico, proceso y análisis final.
  - El estudiante elige una opción y puede continuar normalmente.
*/
(function (window, document) {
  'use strict';

  var instalado = false;
  var intentos = 0;
  var enCurso = false;
  var ACCION = 'generar-ia-9';
  var MENSAJE_PUBLICO =
    'No te preocupes. No fue posible preparar las sugerencias en este momento. ' +
    'Puedes intentarlo nuevamente. Si el inconveniente continúa, comunícate con tu coordinador para recibir apoyo.';

  function instalar() {
    if (instalado) return;

    if (
      !window.EstudianteMVPApp ||
      !window.EstudianteMVPState ||
      !window.EstudianteMVPUI ||
      !window.EstudianteMVPIATitulacion ||
      typeof window.EstudianteMVPIATitulacion.generarOpcionesParaPropuesta !== 'function'
    ) {
      intentos += 1;
      if (intentos < 260) window.setTimeout(instalar, 25);
      return;
    }

    instalarValidacionSeleccion();
    configurarBotones();
    document.addEventListener('click', manejarClickGeneracion);
    instalado = true;
  }

  function instalarValidacionSeleccion() {
    var state = window.EstudianteMVPState;
    var validarOriginal;
    var reemplazo;

    if (
      !state ||
      state.__validacionIA3x3Instalada ||
      typeof state.validarPropuesta !== 'function'
    ) {
      return;
    }

    validarOriginal = state.validarPropuesta.bind(state);
    reemplazo = Object.assign({}, state, {
      validarPropuesta: function (numero) {
        var validacion = validarOriginal(numero);
        var propuesta;

        if (!validacion.ok) return validacion;

        propuesta = reemplazo.obtenerPropuesta(numero) || {};
        if (
          Array.isArray(propuesta.sugerenciasIA) &&
          propuesta.sugerenciasIA.length === 3 &&
          !Number(propuesta.sugerenciaSeleccionadaNumero || 0)
        ) {
          return {
            ok: false,
            mensaje: 'Selecciona uno de los 3 títulos sugeridos para la propuesta ' + numero + '.',
            selector: '#p' + numero + 'Sugerencias',
            numeroPropuesta: Number(numero)
          };
        }

        return validacion;
      },
      validarPropuestas: function () {
        var i;
        var validacion;

        for (i = 1; i <= 3; i += 1) {
          validacion = reemplazo.validarPropuesta(i);
          if (!validacion.ok) return validacion;
        }

        return {
          ok: true,
          mensaje: 'Las 3 propuestas están completas.'
        };
      },
      __validacionIA3x3Instalada: true
    });

    window.EstudianteMVPState = Object.freeze(reemplazo);
  }

  function configurarBotones() {
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-propuesta-panel]'),
      function (panel) {
        var numero = Number(panel.getAttribute('data-propuesta-panel') || 0);
        var boton = panel.querySelector(
          '[data-accion="generar-ia"], [data-accion="' + ACCION + '"]'
        );

        if (!numero || !boton) return;

        boton.setAttribute('data-accion', ACCION);
        boton.setAttribute('data-propuesta', String(numero));
        boton.textContent = 'Generar sugerencias con IA de Titulación';
        boton.setAttribute(
          'title',
          'Analiza 9 títulos internamente y muestra las 3 mejores opciones para esta propuesta.'
        );
      }
    );
  }

  function manejarClickGeneracion(evento) {
    var boton = evento.target && evento.target.closest
      ? evento.target.closest('[data-accion="' + ACCION + '"]')
      : null;
    var numero;

    if (!boton) return;

    evento.preventDefault();
    numero = Number(boton.getAttribute('data-propuesta') || 0);

    if (!numero || enCurso) return;
    ejecutarGeneracion(numero);
  }

  function ejecutarGeneracion(numeroPropuesta) {
    var state = window.EstudianteMVPState;
    var ui = window.EstudianteMVPUI;
    var ia = window.EstudianteMVPIATitulacion;
    var recomendacion = window.EstudianteMVPIARecomendacion || null;
    var propuesta;
    var validacion;
    var estudiante;

    numeroPropuesta = Number(numeroPropuesta || 0);
    propuesta = guardarPropuestaDesdeFormulario(numeroPropuesta);
    validacion = state.validarPropuestaParaIA(numeroPropuesta);
    estudiante = state.obtenerEstudiante();

    if (!validacion.ok) {
      mostrarErrorValidacion(numeroPropuesta, validacion);
      return;
    }

    enCurso = true;

    if (recomendacion && typeof recomendacion.mostrarProgreso === 'function') {
      recomendacion.mostrarProgreso({
        numeroPropuesta: numeroPropuesta,
        maxProcesos: 3
      });
    }

    emitir('ia-titulacion:3x3-inicio', {
      numeroPropuesta: numeroPropuesta,
      totalEsperado: 9,
      opcionesFinales: 3,
      maxProcesos: 3
    });

    ui.mostrarEstado(
      '#p' + numeroPropuesta + 'EstadoIA',
      'Analizando la propuesta y preparando las mejores opciones...',
      'info'
    );

    if (ui && typeof ui.setCargando === 'function') {
      ui.setCargando(true, 'La IA está analizando esta propuesta...');
    }

    ia.generarOpcionesParaPropuesta({
      estudiante: estudiante,
      propuesta: propuesta,
      numeroPropuesta: numeroPropuesta,
      maxProcesos: 3,
      maxTokens: 3000,
      onProgress: function (detalle) {
        var visible;

        if (recomendacion && typeof recomendacion.actualizarProgreso === 'function') {
          visible = Object.assign({}, detalle || {});
          delete visible.proveedor;
          recomendacion.actualizarProgreso(visible);
        }
      }
    })
      .then(function (resultado) {
        aplicarResultado(numeroPropuesta, resultado);
        emitir('ia-titulacion:3x3-exito', Object.assign({
          numeroPropuesta: numeroPropuesta
        }, resultado || {}));
      })
      .catch(function (error) {
        console.warn('[IA Titulación por propuesta] Detalle interno:', error);

        if (recomendacion && typeof recomendacion.cerrarProgreso === 'function') {
          recomendacion.cerrarProgreso();
        }

        ui.mostrarEstado(
          '#p' + numeroPropuesta + 'EstadoIA',
          MENSAJE_PUBLICO,
          'error'
        );

        emitir('ia-titulacion:3x3-error', {
          numeroPropuesta: numeroPropuesta,
          error: error,
          mensaje: error && error.message ? error.message : String(error || '')
        });
      })
      .then(function () {
        if (ui && typeof ui.setCargando === 'function') {
          ui.setCargando(false);
        }
        enCurso = false;
      });
  }

  function guardarPropuestaDesdeFormulario(numero) {
    var state = window.EstudianteMVPState;
    var ui = window.EstudianteMVPUI;
    var propuesta = ui.leerPropuestaDesdeFormulario(numero);

    state.setPropuesta(numero, propuesta);
    return state.obtenerPropuesta(numero);
  }

  function mostrarErrorValidacion(numero, validacion) {
    var ui = window.EstudianteMVPUI;

    ui.mostrarEstado(
      '#p' + numero + 'EstadoIA',
      validacion.mensaje,
      'error'
    );

    if (validacion.selector && typeof ui.marcarCampoInvalido === 'function') {
      ui.marcarCampoInvalido(validacion.selector);
    }
  }

  function aplicarResultado(numeroPropuesta, resultado) {
    var state = window.EstudianteMVPState;
    var ui = window.EstudianteMVPUI;
    var recomendacion = window.EstudianteMVPIARecomendacion || null;
    var opciones = resultado && Array.isArray(resultado.opcionesFinales)
      ? resultado.opcionesFinales
      : [];
    var proveedor = resultado.proveedor || resultado.proveedorNombre || '';

    if (opciones.length !== 3) {
      throw new Error('El resultado no contiene exactamente tres opciones finales.');
    }

    opciones = opciones.map(function (item, index) {
      return Object.assign({}, item, {
        numero: index + 1
      });
    });

    state.setSugerenciasIA(numeroPropuesta, opciones, proveedor);
    ui.pintarSugerencias(numeroPropuesta, opciones);

    if (recomendacion && typeof recomendacion.marcarPagina === 'function') {
      recomendacion.marcarPagina(numeroPropuesta, opciones);
    }

    ui.mostrarEstado(
      '#p' + numeroPropuesta + 'EstadoIA',
      'Se prepararon 3 opciones validadas. Elige la que más te convenga.',
      'success'
    );

    guardarAvance(numeroPropuesta);

    if (recomendacion && typeof recomendacion.cerrarProgreso === 'function') {
      recomendacion.cerrarProgreso();
    }
    if (recomendacion && typeof recomendacion.mostrarResultado === 'function') {
      recomendacion.mostrarResultado({
        numeroPropuesta: numeroPropuesta,
        opcionesFinales: opciones,
        mensaje: resultado.mensaje || '',
        procesoUsado: resultado.procesoUsado || 1,
        maxProcesos: resultado.maxProcesos || 3,
        mejorDisponible: resultado.mejorDisponible === true
      });
    }
  }

  function guardarAvance(numeroPropuesta) {
    var memoria = window.EstudianteMVPMemoria || null;

    if (memoria && typeof memoria.guardarDesdeState === 'function') {
      memoria.guardarDesdeState({
        pasoActual: 'propuestas',
        propuestaActual: Number(numeroPropuesta || 1)
      });
    }
  }

  function emitir(nombre, detalle) {
    var evento;

    try {
      evento = new CustomEvent(nombre, { detail: detalle || {} });
      document.dispatchEvent(evento);
    } catch (error) {
      /* El diagnóstico nunca debe bloquear la generación. */
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }

  window.EstudianteMVPIANueveIntegracion = Object.freeze({
    ejecutarGeneracion: ejecutarGeneracion,
    configurarBotones: configurarBotones,
    accion: ACCION,
    version: '2.0.1'
  });
})(window, document);
