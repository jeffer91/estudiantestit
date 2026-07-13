/*
  Archivo: estudiante.ui.js
  Ruta: estudiantes-mvp/js/estudiante.ui.js
  Funciones principales:
  - Controlar la interfaz visual de estudiante.html.
  - Mostrar pasos de paginación.
  - Pintar datos del estudiante, sugerencias IA y resumen.
  - Restaurar datos guardados desde memoria del navegador en el formulario.
  - Mostrar mensajes de error, éxito, carga y confirmación.
  - Separar la UI de la lógica principal.
*/
(function (window, document) {
  'use strict';

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function obtenerConfig() {
    return window.EstudianteMVPConfig || null;
  }

  function mostrarPaso(paso) {
    var utils = obtenerUtils();
    var config = obtenerConfig();
    var pasos = config && typeof config.obtener === 'function'
      ? config.obtener('ui.pasos', [])
      : ['consulta', 'datos', 'telegram', 'propuestas', 'resumen', 'enviar'];

    var pasoActual = paso || (
      config && typeof config.obtener === 'function'
        ? config.obtener('ui.pasoInicial', 'consulta')
        : 'consulta'
    );

    pasos.forEach(function (item) {
      var panel = document.querySelector('[data-step-panel="' + item + '"]');
      var nav = document.querySelector('[data-step-nav="' + item + '"]');

      if (panel) {
        panel.hidden = item !== pasoActual;
        panel.classList.toggle('is-active', item === pasoActual);
      }

      if (nav) {
        nav.classList.toggle('is-active', item === pasoActual);
        nav.setAttribute('aria-current', item === pasoActual ? 'step' : 'false');
      }
    });

    if (utils && utils.query) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    return pasoActual;
  }

  function mostrarEstado(selector, mensaje, tipo) {
    var utils = obtenerUtils();

    limpiarCamposInvalidos();

    if (utils && typeof utils.mostrarEstado === 'function') {
      return utils.mostrarEstado(selector, mensaje, tipo || 'info');
    }

    var elemento = document.querySelector(selector);

    if (!elemento) {
      return false;
    }

    elemento.textContent = mensaje || '';
    elemento.className = 'status-message';

    if (mensaje && tipo) {
      elemento.classList.add('is-' + tipo);
    }

    return true;
  }

  function limpiarEstadoPrincipal() {
    mostrarEstado('#estadoPrincipal', '', '');
  }

  function setCargando(activo, mensaje) {
    var loading = document.getElementById('loadingGlobal');

    if (!loading) {
      return false;
    }

    loading.hidden = !activo;
    loading.textContent = mensaje || 'Cargando...';

    return true;
  }

  function pintarEstudiante(estudiante) {
    estudiante = estudiante || {};

    setTexto('#datoNombres', obtenerCampo(estudiante, ['nombres', 'nombreCompleto', 'estudiante']) || '-');
    setTexto('#datoCedula', obtenerCampo(estudiante, ['cedula', 'numeroIdentificacion', 'identificacion', 'documento']) || '-');
    setTexto('#datoCarrera', obtenerCampo(estudiante, ['carrera', 'nombreCarrera', 'NombreCarrera']) || '-');
    setTexto('#datoCodigoCarrera', obtenerCampo(estudiante, ['codigoCarrera', 'CodigoCarrera']) || '-');
    setTexto('#datoSede', obtenerCampo(estudiante, ['sede', 'Sede']) || '-');
    setTexto('#datoModalidad', obtenerCampo(estudiante, ['modalidad', 'Modalidad']) || '-');
    setTexto('#datoPeriodo', obtenerCampo(estudiante, ['periodoLabel', 'periodo', 'Periodo']) || '-');
    setTexto('#datoCorreo', obtenerCampo(estudiante, ['correo', 'email', 'Correo']) || '-');
    setTexto('#datoCelular', obtenerCampo(estudiante, ['celular', 'telefono', 'Celular']) || '-');

    setValor('#cedulaInput', obtenerCampo(estudiante, ['cedula', 'numeroIdentificacion', 'identificacion', 'documento']) || '');

    return estudiante;
  }

  function pintarTelegram(usuario) {
    setValor('#telegramInput', usuario || '');
  }

  function leerPropuestaDesdeFormulario(numero) {
    return {
      numero: Number(numero),
      tituloFinal: valor('#p' + numero + 'Titulo'),
      temaGeneral: valor('#p' + numero + 'Tema'),
      lugarContexto: valor('#p' + numero + 'Contexto'),
      grupoEstudio: valor('#p' + numero + 'Grupo'),
      anioPeriodo: valor('#p' + numero + 'Periodo'),
      problemaNecesidad: valor('#p' + numero + 'Problema'),
      objetivo: valor('#p' + numero + 'Objetivo')
    };
  }

  function leerTodasLasPropuestasDesdeFormulario() {
    return [
      leerPropuestaDesdeFormulario(1),
      leerPropuestaDesdeFormulario(2),
      leerPropuestaDesdeFormulario(3)
    ];
  }

  function escribirPropuestaEnFormulario(propuesta) {
    if (!propuesta) {
      return false;
    }

    var numero = Number(propuesta.numero || 0);

    if (!numero) {
      return false;
    }

    setValor('#p' + numero + 'Titulo', propuesta.tituloFinal || propuesta.titulo || '');
    setValor('#p' + numero + 'Tema', propuesta.temaGeneral || propuesta.tema || '');
    setValor('#p' + numero + 'Contexto', propuesta.lugarContexto || propuesta.contexto || '');
    setValor('#p' + numero + 'Grupo', propuesta.grupoEstudio || propuesta.grupo || '');
    setValor('#p' + numero + 'Periodo', propuesta.anioPeriodo || propuesta.periodo || '');
    setValor('#p' + numero + 'Problema', propuesta.problemaNecesidad || propuesta.problema || '');
    setValor('#p' + numero + 'Objetivo', propuesta.objetivo || '');

    return true;
  }

  function escribirPropuestasEnFormulario(propuestas) {
    propuestas = Array.isArray(propuestas) ? propuestas : [];

    propuestas.forEach(function (propuesta, index) {
      if (!propuesta.numero) {
        propuesta.numero = index + 1;
      }

      escribirPropuestaEnFormulario(propuesta);
    });
  }

  function aplicarEstadoEnFormulario(estado) {
    estado = estado || {};

    if (estado.estudiante) {
      pintarEstudiante(estado.estudiante);
    }

    pintarTelegram(estado.telegramUser || '');

    if (Array.isArray(estado.propuestas)) {
      escribirPropuestasEnFormulario(estado.propuestas);

      estado.propuestas.forEach(function (propuesta) {
        if (propuesta && propuesta.numero && Array.isArray(propuesta.sugerenciasIA)) {
          pintarSugerencias(propuesta.numero, propuesta.sugerenciasIA);
          marcarSugerenciaUsada(propuesta.numero, propuesta.sugerenciaSeleccionadaNumero || 0);
        }
      });
    }

    if (estado.tituloPreferidoNumero) {
      marcarFavorito(estado.tituloPreferidoNumero);
    }

    return true;
  }

  function pintarSugerencias(numeroPropuesta, sugerencias) {
    var contenedor = document.getElementById('p' + numeroPropuesta + 'Sugerencias');

    if (!contenedor) {
      return false;
    }

    sugerencias = Array.isArray(sugerencias) ? sugerencias : [];

    if (!sugerencias.length) {
      contenedor.innerHTML = '';
      return true;
    }

    contenedor.innerHTML = sugerencias.map(function (item, index) {
      var numero = Number(item.numero || item.id || index + 1);
      var titulo = item.titulo || item.tituloFinal || item.tituloMejorado || '';
      var razon = item.razon || item.justificacion || item.porque || item.explicacion || '';

      return [
        '<article class="suggestion-card" data-sugerencia-card="' + numeroPropuesta + '-' + numero + '">',
        '  <div class="suggestion-card__head"><strong>Sugerencia ' + numero + '</strong></div>',
        '  <p class="suggestion-card__title">' + escaparHtml(titulo || '-') + '</p>',
        razon ? '  <p class="suggestion-card__why">' + escaparHtml(razon) + '</p>' : '',
        '  <button type="button" class="btn btn--secondary" data-accion="usar-sugerencia" data-propuesta="' + numeroPropuesta + '" data-sugerencia="' + numero + '">',
        '    Usar este título',
        '  </button>',
        '</article>'
      ].join('');
    }).join('');

    return true;
  }

  function limpiarSugerencias(numeroPropuesta) {
    var contenedor = document.getElementById('p' + numeroPropuesta + 'Sugerencias');

    if (contenedor) {
      contenedor.innerHTML = '';
    }
  }

  function marcarSugerenciaUsada(numeroPropuesta, numeroSugerencia) {
    var tarjetas = document.querySelectorAll('[data-sugerencia-card^="' + numeroPropuesta + '-"]');

    Array.prototype.forEach.call(tarjetas, function (tarjeta) {
      var activa = tarjeta.getAttribute('data-sugerencia-card') === numeroPropuesta + '-' + numeroSugerencia;
      var boton = tarjeta.querySelector('button');

      tarjeta.classList.toggle('is-selected', activa);

      if (boton) {
        boton.classList.toggle('is-selected', activa);
        boton.textContent = activa ? 'Título aplicado' : 'Usar este título';
      }
    });
  }

  function pintarResumen(estado) {
    var estudiante = estado && estado.estudiante ? estado.estudiante : {};
    var propuestas = estado && Array.isArray(estado.propuestas) ? estado.propuestas : [];

    pintarResumenEstudiante(estudiante);
    pintarResumenPropuestas(propuestas, estado ? estado.tituloPreferidoNumero : 0);
  }

  function pintarResumenEstudiante(estudiante) {
    var contenedor = document.getElementById('resumenEstudiante');

    if (!contenedor) {
      return;
    }

    contenedor.innerHTML = [
      '<div class="summary-grid">',
      '  <div><span>Nombres</span><strong>' + escaparHtml(obtenerCampo(estudiante, ['nombres', 'nombreCompleto', 'estudiante']) || '-') + '</strong></div>',
      '  <div><span>Cédula</span><strong>' + escaparHtml(obtenerCampo(estudiante, ['cedula', 'numeroIdentificacion', 'identificacion', 'documento']) || '-') + '</strong></div>',
      '  <div><span>Carrera</span><strong>' + escaparHtml(obtenerCampo(estudiante, ['carrera', 'nombreCarrera', 'NombreCarrera']) || '-') + '</strong></div>',
      '</div>'
    ].join('');
  }

  function pintarResumenPropuestas(propuestas, favoritoNumero) {
    var contenedor = document.getElementById('resumenPropuestas');

    if (!contenedor) {
      return;
    }

    propuestas = Array.isArray(propuestas) ? propuestas : [];

    contenedor.innerHTML = propuestas.map(function (propuesta) {
      var checked = Number(favoritoNumero || 0) === Number(propuesta.numero);
      var numero = Number(propuesta.numero || 0);
      var titulo = propuesta.tituloFinal || propuesta.titulo || '-';

      return [
        '<article class="proposal-summary">',
        '  <label class="favorite-option">',
        '    <input type="radio" name="tituloPreferido" value="' + numero + '"' + (checked ? ' checked' : '') + ' />',
        '    <span>Elegir propuesta ' + numero + ' como favorita</span>',
        '  </label>',
        '  <h3>Propuesta ' + numero + '</h3>',
        '  <p><strong>Título:</strong> ' + escaparHtml(titulo || '-') + '</p>',
        '</article>'
      ].join('');
    }).join('');
  }

  function pintarResultadoEnvio(resultado) {
    var mensaje = resultado && resultado.mensaje
      ? resultado.mensaje
      : 'Proceso finalizado.';

    mostrarEstado('#estadoEnvioFinal', mensaje, resultado && resultado.ok ? 'success' : 'warning');
  }

  function marcarFavorito(numero) {
    var radio = document.querySelector('input[name="tituloPreferido"][value="' + Number(numero || 0) + '"]');

    if (radio) {
      radio.checked = true;
    }
  }

  function marcarCampoInvalido(selector) {
    var elemento = document.querySelector(selector);

    if (!elemento) {
      return false;
    }

    elemento.classList.add('is-invalid');

    if (typeof elemento.focus === 'function') {
      elemento.focus();
    }

    return true;
  }

  function limpiarCamposInvalidos() {
    var campos = document.querySelectorAll('.is-invalid');

    Array.prototype.forEach.call(campos, function (campo) {
      campo.classList.remove('is-invalid');
    });
  }

  function enfocar(selector) {
    var elemento = document.querySelector(selector);

    if (elemento && typeof elemento.focus === 'function') {
      elemento.focus();
    }
  }

  function valor(selector) {
    var elemento = document.querySelector(selector);

    if (!elemento) {
      return '';
    }

    return String(elemento.value || '').trim();
  }

  function setTexto(selector, texto) {
    var elemento = document.querySelector(selector);

    if (elemento) {
      elemento.textContent = texto == null ? '' : String(texto);
    }
  }

  function setValor(selector, valor) {
    var elemento = document.querySelector(selector);

    if (elemento) {
      elemento.value = valor == null ? '' : String(valor);
    }
  }

  function obtenerCampo(objeto, claves) {
    var i;
    var clave;

    objeto = objeto || {};

    for (i = 0; i < claves.length; i += 1) {
      clave = claves[i];

      if (objeto[clave] !== undefined && objeto[clave] !== null && objeto[clave] !== '') {
        return objeto[clave];
      }
    }

    return '';
  }

  function escaparHtml(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  window.EstudianteMVPUI = Object.freeze({
    mostrarPaso: mostrarPaso,
    mostrarEstado: mostrarEstado,
    limpiarEstadoPrincipal: limpiarEstadoPrincipal,
    setCargando: setCargando,
    pintarEstudiante: pintarEstudiante,
    pintarTelegram: pintarTelegram,
    leerPropuestaDesdeFormulario: leerPropuestaDesdeFormulario,
    leerTodasLasPropuestasDesdeFormulario: leerTodasLasPropuestasDesdeFormulario,
    escribirPropuestaEnFormulario: escribirPropuestaEnFormulario,
    escribirPropuestasEnFormulario: escribirPropuestasEnFormulario,
    aplicarEstadoEnFormulario: aplicarEstadoEnFormulario,
    pintarSugerencias: pintarSugerencias,
    limpiarSugerencias: limpiarSugerencias,
    marcarSugerenciaUsada: marcarSugerenciaUsada,
    pintarResumen: pintarResumen,
    pintarResultadoEnvio: pintarResultadoEnvio,
    marcarFavorito: marcarFavorito,
    marcarCampoInvalido: marcarCampoInvalido,
    limpiarCamposInvalidos: limpiarCamposInvalidos,
    enfocar: enfocar,
    escaparHtml: escaparHtml
  });
})(window, document);