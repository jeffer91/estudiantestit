/*
  Integración de IA 3x3 con estudiante.html.
  Intercepta los botones actuales de IA y genera 9 títulos para las 3 propuestas.
*/
(function (window, document) {
  'use strict';

  var instalado = false;
  var intentos = 0;
  var enCurso = false;
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
      if (intentos < 200) window.setTimeout(instalar, 25);
      return;
    }

    document.addEventListener('click', interceptarGeneracion, true);
    actualizarBotones();
    instalado = true;
  }

  function actualizarBotones() {
    Array.prototype.forEach.call(
      document.querySelectorAll('[data-accion="generar-ia"]'),
      function (boton) {
        boton.textContent = 'Generar 9 títulos con IA (3 por sección)';
        boton.setAttribute('title', 'Genera tres alternativas para cada una de las tres propuestas.');
      }
    );
  }

  function interceptarGeneracion(evento) {
    var boton = evento.target && evento.target.closest
      ? evento.target.closest('[data-accion="generar-ia"]')
      : null;

    if (!boton) return;

    evento.preventDefault();
    evento.stopPropagation();
    evento.stopImmediatePropagation();

    if (enCurso) return;
    ejecutarGeneracion(Number(boton.getAttribute('data-propuesta') || 1));
  }

  function ejecutarGeneracion(numeroOrigen) {
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
      numeroPropuestaOrigen: numeroOrigen,
      maxTokens: 2800
    })
      .then(function (resultado) {
        aplicarResultado(resultado);
      })
      .catch(function (error) {
        console.warn('[IA Titulación 3x3] Detalle interno:', error);
        mostrarEstadoTodas(MENSAJE_PUBLICO, 'error');
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
        propuestaActual: 1
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }

  window.EstudianteMVPIANueveIntegracion = Object.freeze({
    ejecutarGeneracion: ejecutarGeneracion,
    actualizarBotones: actualizarBotones
  });
})(window, document);
