/*
  Archivo: estudiante.state.js
  Ruta: estudiantes-mvp/js/estudiante.state.js
  Funciones principales:
  - Guardar el estado temporal de la pantalla estudiante.
  - Mantener estudiante, Telegram, propuestas, sugerencias IA y favorito.
  - Guardar paso actual y propuesta actual para memoria del navegador.
  - Evitar variables sueltas dentro de estudiante.app.js.
  - Preparar el payload final para Google Sheets y Firebase.
  - Permitir confirmar con modal bonito cuando el estudiante ya tiene título definido.
*/
(function (window) {
  'use strict';

  var estado = crearEstadoInicial();

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function obtenerConfig() {
    return window.EstudianteMVPConfig || null;
  }

  function obtenerModales() {
    return window.EstudianteMVPModales || null;
  }

  function crearEstadoInicial() {
    return {
      pasoActual: 'consulta',
      propuestaActual: 1,
      estudiante: null,
      telegramUser: '',
      propuestas: [
        crearPropuesta(1),
        crearPropuesta(2),
        crearPropuesta(3)
      ],
      tituloPreferidoNumero: 0,
      creadoEnLocal: new Date().toISOString(),
      enviado: false,
      ultimoResultadoEnvio: null
    };
  }

  function crearPropuesta(numero) {
    return {
      numero: numero,
      tituloFinal: '',
      temaGeneral: '',
      lugarContexto: '',
      grupoEstudio: '',
      problemaNecesidad: '',
      objetivo: '',
      anioPeriodo: '',
      sugerenciasIA: [],
      proveedorIA: '',
      sugerenciaSeleccionadaNumero: 0,
      etapaIA: '',
      tituloDefinidoConfirmado: false
    };
  }

  function reiniciarTodo() {
    estado = crearEstadoInicial();
    return obtenerEstado();
  }

  function cargarEstado(snapshot) {
    var nuevo = crearEstadoInicial();

    snapshot = snapshot || {};

    nuevo.pasoActual = limpiar(snapshot.pasoActual || 'consulta');
    nuevo.propuestaActual = normalizarPropuestaActual(snapshot.propuestaActual || 1);
    nuevo.estudiante = snapshot.estudiante || null;
    nuevo.telegramUser = limpiar(snapshot.telegramUser || '');
    nuevo.tituloPreferidoNumero = Number(snapshot.tituloPreferidoNumero || 0);
    nuevo.creadoEnLocal = snapshot.creadoEnLocal || new Date().toISOString();
    nuevo.enviado = !!snapshot.enviado;
    nuevo.ultimoResultadoEnvio = snapshot.ultimoResultadoEnvio || null;

    estado = nuevo;

    if (Array.isArray(snapshot.propuestas)) {
      setPropuestas(snapshot.propuestas);
    }

    return obtenerEstado();
  }

  function obtenerEstado() {
    return clonar(estado);
  }

  function obtenerEstadoInterno() {
    return estado;
  }

  function setPasoActual(paso) {
    estado.pasoActual = limpiar(paso || 'consulta') || 'consulta';
    return estado.pasoActual;
  }

  function obtenerPasoActual() {
    return estado.pasoActual || 'consulta';
  }

  function setPropuestaActual(numero) {
    estado.propuestaActual = normalizarPropuestaActual(numero);
    return estado.propuestaActual;
  }

  function obtenerPropuestaActual() {
    return normalizarPropuestaActual(estado.propuestaActual || 1);
  }

  function setEstudiante(estudiante) {
    estado.estudiante = estudiante || null;
    return estado.estudiante;
  }

  function obtenerEstudiante() {
    return estado.estudiante;
  }

  function setTelegram(usuario) {
    var utils = obtenerUtils();

    estado.telegramUser = utils && typeof utils.normalizarTelegram === 'function'
      ? utils.normalizarTelegram(usuario)
      : String(usuario || '').trim();

    return estado.telegramUser;
  }

  function obtenerTelegram() {
    return estado.telegramUser || '';
  }

  function setPropuesta(numero, data) {
    var propuesta = obtenerPropuestaInterna(numero);
    var tituloAnterior;

    if (!propuesta) {
      return null;
    }

    data = data || {};
    tituloAnterior = propuesta.tituloFinal;

    propuesta.tituloFinal = limpiar(tomarValor(data, ['tituloFinal', 'titulo'], propuesta.tituloFinal));
    propuesta.temaGeneral = limpiar(tomarValor(data, ['temaGeneral', 'tema'], propuesta.temaGeneral));
    propuesta.lugarContexto = limpiar(tomarValor(data, ['lugarContexto', 'contexto', 'lugar'], propuesta.lugarContexto));
    propuesta.grupoEstudio = limpiar(tomarValor(data, ['grupoEstudio', 'grupo', 'poblacion'], propuesta.grupoEstudio));
    propuesta.problemaNecesidad = limpiar(tomarValor(data, ['problemaNecesidad', 'problema', 'necesidad'], propuesta.problemaNecesidad));
    propuesta.objetivo = limpiar(tomarValor(data, ['objetivo', 'objetivoGeneral'], propuesta.objetivo));
    propuesta.anioPeriodo = limpiar(tomarValor(data, ['anioPeriodo', 'periodo', 'tiempo'], propuesta.anioPeriodo));

    if (tituloAnterior && propuesta.tituloFinal && tituloAnterior !== propuesta.tituloFinal) {
      propuesta.tituloDefinidoConfirmado = false;
    }

    if (Array.isArray(data.sugerenciasIA)) {
      propuesta.sugerenciasIA = clonar(data.sugerenciasIA).slice(0, 3);
    }

    if (data.proveedorIA !== undefined) {
      propuesta.proveedorIA = limpiar(data.proveedorIA);
    }

    if (data.sugerenciaSeleccionadaNumero !== undefined) {
      propuesta.sugerenciaSeleccionadaNumero = Number(data.sugerenciaSeleccionadaNumero || 0);
    }

    if (data.etapaIA !== undefined) {
      propuesta.etapaIA = limpiar(data.etapaIA);
    }

    if (data.tituloDefinidoConfirmado !== undefined) {
      propuesta.tituloDefinidoConfirmado = data.tituloDefinidoConfirmado === true;
    }

    return clonar(propuesta);
  }

  function setPropuestas(lista) {
    lista = Array.isArray(lista) ? lista : [];

    lista.forEach(function (item, index) {
      setPropuesta(item.numero || index + 1, item);
    });

    return obtenerPropuestas();
  }

  function obtenerPropuesta(numero) {
    var propuesta = obtenerPropuestaInterna(numero);

    if (!propuesta) {
      return null;
    }

    return clonar(propuesta);
  }

  function obtenerPropuestaInterna(numero) {
    numero = Number(numero || 0);

    return estado.propuestas.find(function (item) {
      return Number(item.numero) === numero;
    }) || null;
  }

  function obtenerPropuestas() {
    return clonar(estado.propuestas);
  }

  function setSugerenciasIA(numero, sugerencias, proveedor) {
    var propuesta = obtenerPropuestaInterna(numero);

    if (!propuesta) {
      return null;
    }

    propuesta.sugerenciasIA = Array.isArray(sugerencias)
      ? clonar(sugerencias).slice(0, 3)
      : [];

    propuesta.proveedorIA = proveedor || '';
    propuesta.sugerenciaSeleccionadaNumero = 0;
    propuesta.etapaIA = propuesta.sugerenciasIA.length ? 'generado' : '';

    return clonar(propuesta.sugerenciasIA);
  }

  function seleccionarSugerencia(numeroPropuesta, numeroSugerencia) {
    var propuesta = obtenerPropuestaInterna(numeroPropuesta);
    var sugerencia;

    if (!propuesta) {
      return null;
    }

    numeroSugerencia = Number(numeroSugerencia || 0);

    sugerencia = propuesta.sugerenciasIA.find(function (item) {
      return Number(item.numero || item.id || 0) === numeroSugerencia;
    });

    if (!sugerencia && propuesta.sugerenciasIA[numeroSugerencia - 1]) {
      sugerencia = propuesta.sugerenciasIA[numeroSugerencia - 1];
    }

    if (!sugerencia) {
      return null;
    }

    propuesta.tituloFinal = limpiar(
      sugerencia.titulo ||
      sugerencia.tituloFinal ||
      sugerencia.tituloMejorado ||
      propuesta.tituloFinal
    );

    propuesta.sugerenciaSeleccionadaNumero = numeroSugerencia;
    propuesta.etapaIA = 'sugerencia_aplicada';
    propuesta.tituloDefinidoConfirmado = false;

    return clonar(propuesta);
  }

  function setTituloPreferidoNumero(numero) {
    estado.tituloPreferidoNumero = Number(numero || 0);
    return estado.tituloPreferidoNumero;
  }

  function obtenerTituloPreferidoNumero() {
    return Number(estado.tituloPreferidoNumero || 0);
  }

  function obtenerTituloPreferido() {
    var numero = obtenerTituloPreferidoNumero();

    if (!numero) {
      return null;
    }

    return obtenerPropuesta(numero);
  }

  function marcarEnviado(resultado) {
    estado.enviado = true;
    estado.ultimoResultadoEnvio = resultado || null;
    return obtenerEstado();
  }

  function validarPropuesta(numero) {
    var propuesta = obtenerPropuestaInterna(numero);
    var camposFaltantes;

    if (!propuesta) {
      return {
        ok: false,
        mensaje: 'No se encontró la propuesta ' + numero + '.',
        selector: ''
      };
    }

    if (!propuesta.tituloFinal) {
      return crearErrorCampo(numero, 'Titulo', 'Completa el título de la propuesta ' + numero + '.');
    }

    camposFaltantes = obtenerCamposFaltantesPropuesta(numero, propuesta);

    if (camposFaltantes.length) {
      if (propuesta.tituloDefinidoConfirmado === true) {
        return {
          ok: true,
          mensaje: 'Propuesta ' + numero + ' aprobada con título definido por el estudiante.'
        };
      }

      solicitarConfirmacionTituloDefinido(numero, propuesta, camposFaltantes);

      return {
        ok: false,
        mensaje: 'Confirma si deseas continuar solo con el título de la propuesta ' + numero + '.',
        selector: '',
        requiereConfirmacionTituloDefinido: true,
        numeroPropuesta: numero
      };
    }

    propuesta.tituloDefinidoConfirmado = false;

    return {
      ok: true,
      mensaje: 'Propuesta ' + numero + ' completa.'
    };
  }

  function obtenerCamposFaltantesPropuesta(numero, propuesta) {
    var faltantes = [];

    if (!propuesta.temaGeneral) {
      faltantes.push({
        campo: 'Tema',
        mensaje: 'Completa el tema general de la propuesta ' + numero + '.'
      });
    }

    if (!propuesta.lugarContexto) {
      faltantes.push({
        campo: 'Contexto',
        mensaje: 'Completa el lugar o contexto de la propuesta ' + numero + '.'
      });
    }

    if (!propuesta.grupoEstudio) {
      faltantes.push({
        campo: 'Grupo',
        mensaje: 'Completa el grupo de estudio de la propuesta ' + numero + '.'
      });
    }

    if (!propuesta.anioPeriodo) {
      faltantes.push({
        campo: 'Periodo',
        mensaje: 'Completa el año o período de la propuesta ' + numero + '.'
      });
    }

    if (!propuesta.problemaNecesidad) {
      faltantes.push({
        campo: 'Problema',
        mensaje: 'Completa el problema o necesidad de la propuesta ' + numero + '.'
      });
    }

    if (!propuesta.objetivo) {
      faltantes.push({
        campo: 'Objetivo',
        mensaje: 'Completa el objetivo de la propuesta ' + numero + '.'
      });
    }

    return faltantes;
  }

  function solicitarConfirmacionTituloDefinido(numero, propuesta, camposFaltantes) {
    var modales = obtenerModales();

    if (!modales || typeof modales.mostrarConfirmacionTituloDefinido !== 'function') {
      return;
    }

    modales.mostrarConfirmacionTituloDefinido({
      numeroPropuesta: numero,
      titulo: propuesta.tituloFinal,
      camposFaltantes: camposFaltantes,
      alConfirmar: function () {
        confirmarTituloDefinido(numero);
        continuarDespuesDeConfirmarTituloDefinido(numero);
      }
    });
  }

  function confirmarTituloDefinido(numero) {
    var propuesta = obtenerPropuestaInterna(numero);

    if (!propuesta) {
      return null;
    }

    propuesta.tituloDefinidoConfirmado = true;
    return clonar(propuesta);
  }

  function continuarDespuesDeConfirmarTituloDefinido(numero) {
    var paginacion = window.EstudianteMVPPropuestasPaginacion || null;
    var app = window.EstudianteMVPApp || null;
    var actual = paginacion && typeof paginacion.obtenerActual === 'function'
      ? Number(paginacion.obtenerActual() || numero)
      : Number(numero || 1);

    window.setTimeout(function () {
      if (
        actual >= 3 ||
        Number(numero || 1) < actual
      ) {
        if (app && typeof app.prepararResumenDesdePropuestas === 'function') {
          app.prepararResumenDesdePropuestas();
        }

        return;
      }

      if (paginacion && typeof paginacion.siguiente === 'function') {
        paginacion.siguiente();
      }
    }, 80);
  }

  function validarPropuestaParaIA(numero) {
    var propuesta = obtenerPropuestaInterna(numero);

    if (!propuesta) {
      return {
        ok: false,
        mensaje: 'No se encontró la propuesta ' + numero + '.',
        selector: ''
      };
    }

    if (!propuesta.temaGeneral) {
      return crearErrorCampo(numero, 'Tema', 'Completa el tema general de la propuesta ' + numero + '.');
    }

    if (!propuesta.lugarContexto) {
      return crearErrorCampo(numero, 'Contexto', 'Completa el lugar o contexto de la propuesta ' + numero + '.');
    }

    if (!propuesta.grupoEstudio) {
      return crearErrorCampo(numero, 'Grupo', 'Completa el grupo de estudio de la propuesta ' + numero + '.');
    }

    if (!propuesta.anioPeriodo) {
      return crearErrorCampo(numero, 'Periodo', 'Completa el año o período de la propuesta ' + numero + '.');
    }

    if (!propuesta.problemaNecesidad) {
      return crearErrorCampo(numero, 'Problema', 'Completa el problema o necesidad de la propuesta ' + numero + '.');
    }

    if (!propuesta.objetivo) {
      return crearErrorCampo(numero, 'Objetivo', 'Completa el objetivo de la propuesta ' + numero + '.');
    }

    return {
      ok: true,
      mensaje: 'Propuesta ' + numero + ' lista para generar sugerencias con IA.'
    };
  }

  function validarPropuestas() {
    var i;
    var validacion;

    for (i = 1; i <= 3; i += 1) {
      validacion = validarPropuesta(i);

      if (!validacion.ok) {
        return validacion;
      }
    }

    return {
      ok: true,
      mensaje: 'Las 3 propuestas están completas.'
    };
  }

  function validarFavorito() {
    if (!obtenerTituloPreferidoNumero()) {
      return {
        ok: false,
        mensaje: 'Selecciona tu título favorito antes de continuar.'
      };
    }

    return {
      ok: true,
      mensaje: 'Título favorito seleccionado.'
    };
  }

  function construirPayloadEnvio() {
    var utils = obtenerUtils();
    var config = obtenerConfig();
    var favorito = obtenerTituloPreferido();
    var estudiante = estado.estudiante || {};
    var propuestas = obtenerPropuestas();

    config = config || {
      obtener: function (_ruta, fallback) {
        return fallback;
      }
    };

    utils = utils || {
      fechaIso: function () {
        return new Date().toISOString();
      }
    };

    return {
      origenCaptura: config.obtener('app.origenCaptura', 'estudiantes-mvp'),
      cedula: obtenerCampoEstudiante(estudiante, ['cedula', 'numeroIdentificacion', 'identificacion', 'documento']),
      nombres: obtenerCampoEstudiante(estudiante, ['nombres', 'nombreCompleto', 'estudiante']),
      carrera: obtenerCampoEstudiante(estudiante, ['carrera', 'nombreCarrera', 'NombreCarrera']),
      codigoCarrera: obtenerCampoEstudiante(estudiante, ['codigoCarrera', 'CodigoCarrera']),
      sede: obtenerCampoEstudiante(estudiante, ['sede', 'Sede']),
      modalidad: obtenerCampoEstudiante(estudiante, ['modalidad', 'Modalidad']),
      correo: obtenerCampoEstudiante(estudiante, ['correo', 'email', 'Correo']),
      celular: obtenerCampoEstudiante(estudiante, ['celular', 'telefono', 'Celular']),
      telegram: estado.telegramUser,
      propuestas: propuestas,
      tituloPreferidoNumero: estado.tituloPreferidoNumero,
      tituloPreferido: favorito ? favorito.tituloFinal : '',
      periodoId: estudiante.periodoId || config.obtener('proceso.periodoIdFallback', ''),
      periodoLabel: estudiante.periodoLabel || config.obtener('proceso.periodoLabelFallback', ''),
      intentosUsados: 1,
      maxIntentos: config.obtener('proceso.maxIntentos', 1),
      creadoEnLocal: estado.creadoEnLocal,
      enviadoEnLocal: utils.fechaIso()
    };
  }

  function crearErrorCampo(numero, campo, mensaje) {
    return {
      ok: false,
      mensaje: mensaje,
      selector: '#p' + numero + campo
    };
  }

  function tomarValor(objeto, claves, fallback) {
    var i;
    var clave;

    for (i = 0; i < claves.length; i += 1) {
      clave = claves[i];

      if (Object.prototype.hasOwnProperty.call(objeto, clave)) {
        return objeto[clave];
      }
    }

    return fallback;
  }

  function obtenerCampoEstudiante(estudiante, claves) {
    var i;
    var clave;

    estudiante = estudiante || {};

    for (i = 0; i < claves.length; i += 1) {
      clave = claves[i];

      if (estudiante[clave] !== undefined && estudiante[clave] !== null && estudiante[clave] !== '') {
        return estudiante[clave];
      }
    }

    return '';
  }

  function normalizarPropuestaActual(numero) {
    numero = Number(numero || 1);

    if (numero < 1) {
      return 1;
    }

    if (numero > 3) {
      return 3;
    }

    return numero;
  }

  function limpiar(valor) {
    var utils = obtenerUtils();

    return utils && typeof utils.limpiarTexto === 'function'
      ? utils.limpiarTexto(valor)
      : String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  }

  function clonar(data) {
    var utils = obtenerUtils();

    if (utils && typeof utils.clonar === 'function') {
      return utils.clonar(data);
    }

    return JSON.parse(JSON.stringify(data));
  }

  window.EstudianteMVPState = Object.freeze({
    reiniciarTodo: reiniciarTodo,
    cargarEstado: cargarEstado,
    obtenerEstado: obtenerEstado,
    obtenerEstadoInterno: obtenerEstadoInterno,
    setPasoActual: setPasoActual,
    obtenerPasoActual: obtenerPasoActual,
    setPropuestaActual: setPropuestaActual,
    obtenerPropuestaActual: obtenerPropuestaActual,
    setEstudiante: setEstudiante,
    obtenerEstudiante: obtenerEstudiante,
    setTelegram: setTelegram,
    obtenerTelegram: obtenerTelegram,
    setPropuesta: setPropuesta,
    setPropuestas: setPropuestas,
    obtenerPropuesta: obtenerPropuesta,
    obtenerPropuestas: obtenerPropuestas,
    setSugerenciasIA: setSugerenciasIA,
    seleccionarSugerencia: seleccionarSugerencia,
    setTituloPreferidoNumero: setTituloPreferidoNumero,
    obtenerTituloPreferidoNumero: obtenerTituloPreferidoNumero,
    obtenerTituloPreferido: obtenerTituloPreferido,
    confirmarTituloDefinido: confirmarTituloDefinido,
    marcarEnviado: marcarEnviado,
    validarPropuesta: validarPropuesta,
    validarPropuestaParaIA: validarPropuestaParaIA,
    validarPropuestas: validarPropuestas,
    validarFavorito: validarFavorito,
    construirPayloadEnvio: construirPayloadEnvio
  });
})(window);