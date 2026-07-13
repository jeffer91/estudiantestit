/*
  Archivo: coordinador.modal.js
  Ruta: coordinadores-mvp/js/coordinador.modal.js

  Funciones principales:
  - Abrir y cerrar el modal grande de revisión.
  - Mostrar datos del estudiante seleccionado.
  - Mostrar las 3 tarjetas de títulos.
  - Permitir seleccionar un título y copiarlo al campo de título final.
  - Validar datos para aprobar o devolver.
  - Entregar la resolución al controlador principal.
*/

(function (window, document) {
  'use strict';

  var envioActual = null;

  function obtenerConfig() {
    return window.CoordinadorMVPConfig || null;
  }

  function obtenerUtils() {
    return window.CoordinadorMVPUtils || null;
  }

  function obtenerState() {
    return window.CoordinadorMVPState || null;
  }

  function obtenerUI() {
    return window.CoordinadorMVPUI || null;
  }

  function validarDependencias() {
    return !!(obtenerConfig() && obtenerUtils() && obtenerState());
  }

  function iniciar() {
    if (!validarDependencias()) {
      return false;
    }

    conectarEventos();
    return true;
  }

  function conectarEventos() {
    document.addEventListener('change', function (evento) {
      var target = evento.target;

      if (!target || target.name !== 'tituloSeleccionado') {
        return;
      }

      seleccionarTitulo(Number(target.value || 0));
    });
  }

  function abrir(envio) {
    if (!validarDependencias()) {
      return;
    }

    envioActual = envio || null;

    if (!envioActual) {
      mostrarEstado('No se encontró el estudiante seleccionado.', 'error');
      return;
    }

    limpiarFormulario();
    pintarDatosEstudiante(envioActual);
    pintarTitulos(envioActual);
    mostrarModal();

    mostrarEstado('Selecciona un título o escribe el título final corregido.', 'info');
  }

  function cerrar() {
    var modal = document.getElementById('detalleModal');

    if (!modal) {
      return;
    }

    modal.hidden = true;
    envioActual = null;
    limpiarFormulario();
  }

  function mostrarModal() {
    var modal = document.getElementById('detalleModal');

    if (!modal) {
      return;
    }

    modal.hidden = false;
  }

  function pintarDatosEstudiante(envio) {
    setTexto('#modalTitulo', envio.nombres || 'Revisión de títulos');
    setTexto('#modalSubtitulo', 'Cédula: ' + (envio.cedula || '-') + ' | Carrera: ' + (envio.carrera || '-'));

    setTexto('#detalleCedula', envio.cedula || '-');
    setTexto('#detalleNombre', envio.nombres || '-');
    setTexto('#detalleCarrera', envio.carrera || '-');
    setTexto('#detallePeriodo', envio.periodo || '-');
    setTexto('#detalleTelegram', envio.telegram || '-');
    setTexto('#detalleEstado', envio.estado || '-');
  }

  function pintarTitulos(envio) {
    setTexto('#detalleTitulo1', envio.titulo1 || 'Sin título registrado.');
    setTexto('#detalleTitulo2', envio.titulo2 || 'Sin título registrado.');
    setTexto('#detalleTitulo3', envio.titulo3 || 'Sin título registrado.');

    marcarPreferido(envio.tituloPreferido);
  }

  function marcarPreferido(preferido) {
    var numero = Number(String(preferido || '').replace(/[^\d]/g, ''));
    var radio;

    if (!numero || numero < 1 || numero > 3) {
      return;
    }

    radio = document.querySelector('input[name="tituloSeleccionado"][value="' + numero + '"]');

    if (radio) {
      radio.checked = true;
      seleccionarTitulo(numero);
    }
  }

  function seleccionarTitulo(numero) {
    var titulo = obtenerTituloPorNumero(numero);

    limpiarSeleccionTarjetas();

    if (numero >= 1 && numero <= 3) {
      var tarjeta = document.querySelector('.proposal-card[data-propuesta="' + numero + '"]');

      if (tarjeta) {
        tarjeta.classList.add('is-selected');
      }
    }

    if (titulo) {
      setValor('#tituloFinalInput', titulo);
      mostrarEstado('Título ' + numero + ' seleccionado. Puedes editarlo antes de aprobar.', 'info');
    }
  }

  function limpiarSeleccionTarjetas() {
    var tarjetas = document.querySelectorAll('.proposal-card');

    Array.prototype.forEach.call(tarjetas, function (tarjeta) {
      tarjeta.classList.remove('is-selected');
    });
  }

  function obtenerTituloPorNumero(numero) {
    if (!envioActual) {
      return '';
    }

    if (numero === 1) return envioActual.titulo1 || '';
    if (numero === 2) return envioActual.titulo2 || '';
    if (numero === 3) return envioActual.titulo3 || '';

    return '';
  }

  function obtenerNumeroTituloSeleccionado() {
    var radio = document.querySelector('input[name="tituloSeleccionado"]:checked');

    if (!radio) {
      return 0;
    }

    return Number(radio.value || 0);
  }

  function obtenerResolucion(tipo) {
    var utils = obtenerUtils();
    var state = obtenerState();
    var config = obtenerConfig();
    var coordinador = state.obtenerCoordinadorActual();
    var numeroTitulo = obtenerNumeroTituloSeleccionado();
    var tituloOriginal = obtenerTituloPorNumero(numeroTitulo);
    var tituloFinal = utils.limpiarTitulo(utils.valorMultilinea('#tituloFinalInput'));
    var comentario = utils.limpiarTextoMultilinea(utils.valorMultilinea('#comentarioCoordinadorInput'));

    if (!envioActual) {
      return utils.error('No hay estudiante seleccionado.');
    }

    if (!coordinador) {
      return utils.error(config.obtener('textos.seleccionaCoordinador'));
    }

    if (tipo === 'aprobar') {
      if (!tituloFinal || tituloFinal.length < config.obtener('revision.tituloMinimo', 8)) {
        return utils.error(config.obtener('textos.seleccionaTitulo'), '#tituloFinalInput');
      }
    }

    if (tipo === 'devolver') {
      if (
        config.obtener('revision.comentarioObligatorioAlDevolver', true) &&
        comentario.length < config.obtener('revision.comentarioMinimo', 4)
      ) {
        return utils.error(config.obtener('textos.comentarioDevolucion'), '#comentarioCoordinadorInput');
      }
    }

    return utils.ok({
      tipo: tipo,
      envio: utils.clonar(envioActual),
      tituloSeleccionadoNumero: numeroTitulo,
      tituloOriginal: tituloOriginal,
      tituloFinal: tituloFinal,
      comentarioCoordinador: comentario,
      coordinador: {
        id: coordinador.id,
        nombre: coordinador.nombre,
        carreras: coordinador.carreras
      }
    });
  }

  function obtenerResolucionAprobar() {
    var resultado = obtenerResolucion('aprobar');

    if (!resultado.ok) {
      mostrarEstado(resultado.mensaje, 'error');
      enfocar(resultado.selector);
    }

    return resultado;
  }

  function obtenerResolucionDevolver() {
    var resultado = obtenerResolucion('devolver');

    if (!resultado.ok) {
      mostrarEstado(resultado.mensaje, 'error');
      enfocar(resultado.selector);
    }

    return resultado;
  }

  function limpiarFormulario() {
    var radios = document.querySelectorAll('input[name="tituloSeleccionado"]');

    Array.prototype.forEach.call(radios, function (radio) {
      radio.checked = false;
    });

    limpiarSeleccionTarjetas();

    setValor('#tituloFinalInput', '');
    setValor('#comentarioCoordinadorInput', '');
    mostrarEstado('', '');
  }

  function mostrarEstado(mensaje, tipo) {
    var utils = obtenerUtils();

    if (utils) {
      utils.mostrarEstado('#estadoModal', mensaje || '', tipo || 'info');
    }
  }

  function setTexto(selector, texto) {
    var utils = obtenerUtils();

    if (utils) {
      utils.setTexto(selector, texto);
    }
  }

  function setValor(selector, texto) {
    var utils = obtenerUtils();

    if (utils) {
      utils.setValor(selector, texto);
    }
  }

  function enfocar(selector) {
    var ui = obtenerUI();

    if (ui && selector) {
      ui.enfocar(selector);
    }
  }

  function obtenerEnvioActual() {
    return envioActual ? obtenerUtils().clonar(envioActual) : null;
  }

  window.CoordinadorMVPModal = Object.freeze({
    iniciar: iniciar,
    abrir: abrir,
    cerrar: cerrar,
    pintarDatosEstudiante: pintarDatosEstudiante,
    pintarTitulos: pintarTitulos,
    seleccionarTitulo: seleccionarTitulo,
    obtenerNumeroTituloSeleccionado: obtenerNumeroTituloSeleccionado,
    obtenerTituloPorNumero: obtenerTituloPorNumero,
    obtenerResolucion: obtenerResolucion,
    obtenerResolucionAprobar: obtenerResolucionAprobar,
    obtenerResolucionDevolver: obtenerResolucionDevolver,
    limpiarFormulario: limpiarFormulario,
    mostrarEstado: mostrarEstado,
    obtenerEnvioActual: obtenerEnvioActual
  });
})(window, document);