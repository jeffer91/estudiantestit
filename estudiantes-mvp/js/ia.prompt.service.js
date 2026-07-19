/*
  Archivo: ia.prompt.service.js
  Funciones vigentes:
  - Normalizar estudiante y propuesta para el motor IA 3x3.
  - Mantener las definiciones académicas de las tres etapas.
  - Usar Google Sheets como única fuente de decisión sobre envíos previos.
  - Mantener Firebase como respaldo de escritura, sin autoridad para bloquear reenvíos.
  - Impedir que una falla de Google Sheets permita continuar sin verificación.
  - Mostrar el modal de reglas después de validar la consulta en Google Sheets.

  La generación individual de tres títulos y la selección automática fueron retiradas.
*/
(function (window) {
  'use strict';

  var ETAPAS = Object.freeze([
    {
      numero: 1,
      codigo: 'diagnostico_inicial',
      nombre: 'Diagnóstico inicial',
      descripcion: 'Identificar, analizar, caracterizar o diagnosticar la situación inicial sin afirmar que una solución ya fue ejecutada.'
    },
    {
      numero: 2,
      codigo: 'propuesta_mejora',
      nombre: 'Propuesta o mejora',
      descripcion: 'Diseñar, proponer, optimizar o plantear una mejora viable sin afirmar que ya fue implementada.'
    },
    {
      numero: 3,
      codigo: 'evaluacion_resultado',
      nombre: 'Evaluación o resultado esperado',
      descripcion: 'Evaluar, valorar o analizar resultados esperados sin inventar resultados reales ni afirmar que ya fueron obtenidos.'
    }
  ]);

  var consultaSheetsOriginal = null;
  var consultaSheetsCache = null;
  var reenviandoConsulta = false;

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function limpiarDato(valor) {
    var utils = obtenerUtils();
    var limpio = utils && typeof utils.limpiarTexto === 'function'
      ? utils.limpiarTexto(valor)
      : String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();

    return limpio || 'No especificado';
  }

  function limpiarCedula(valor) {
    var utils = obtenerUtils();

    return utils && typeof utils.limpiarCedula === 'function'
      ? utils.limpiarCedula(valor)
      : String(valor || '').replace(/\D/g, '');
  }

  function obtenerEtapaPropuesta(numero) {
    numero = Number(numero || 1);
    return ETAPAS.find(function (item) {
      return Number(item.numero) === numero;
    }) || ETAPAS[0];
  }

  function normalizarContexto(params) {
    var utils = obtenerUtils();
    var estudiante;
    var propuesta;

    params = params || {};
    estudiante = params.estudiante || {};
    propuesta = params.propuesta || {};

    return {
      estudiante: {
        nombres: limpiarDato(estudiante.nombres || estudiante.nombreCompleto),
        cedula: limpiarDato(estudiante.cedula || estudiante.numeroIdentificacion),
        carrera: limpiarDato(estudiante.nombreCarrera || estudiante.carrera || estudiante.NombreCarrera),
        codigoCarrera: limpiarDato(estudiante.codigoCarrera || estudiante.CodigoCarrera),
        sede: limpiarDato(estudiante.sede || estudiante.Sede),
        modalidadDetectada: limpiarDato(estudiante.modalidadDetectada || estudiante.modalidad),
        periodoId: limpiarDato(estudiante.periodoId),
        periodoLabel: limpiarDato(estudiante.periodoLabel || estudiante.periodo)
      },
      propuesta: {
        numero: Number(propuesta.numero || params.numeroPropuesta || 1),
        tituloBase: limpiarDato(propuesta.tituloFinal || propuesta.titulo || propuesta.tituloBase),
        temaGeneral: limpiarDato(propuesta.temaGeneral || propuesta.tema),
        lugarContexto: limpiarDato(propuesta.lugarContexto || propuesta.contexto || propuesta.lugar),
        grupoEstudio: limpiarDato(propuesta.grupoEstudio || propuesta.grupo || propuesta.poblacion),
        problemaNecesidad: limpiarDato(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad),
        objetivo: limpiarDato(propuesta.objetivo || propuesta.objetivoGeneral),
        anioPeriodo: limpiarDato(propuesta.anioPeriodo || propuesta.periodo || propuesta.tiempo)
      },
      raw: utils && typeof utils.clonar === 'function'
        ? utils.clonar(params)
        : JSON.parse(JSON.stringify(params))
    };
  }

  function estadoPermiteReenvio(registro) {
    var estado;

    registro = registro || {};
    estado = String(
      registro.estado ||
      registro.estadoFinal ||
      registro.estadoGoogleSheets ||
      registro.estadoProceso ||
      ''
    ).toUpperCase().trim();

    return registro.permitirReenvio === true || [
      'DEVUELTO',
      'NO_ENVIO',
      'ELIMINADO',
      'ELIMINADO_ADMIN',
      'BORRADO'
    ].indexOf(estado) >= 0;
  }

  function normalizarDecisionSheets(resultado, cedula) {
    var salida = Object.assign({}, resultado || {});

    salida.cedula = salida.cedula || limpiarCedula(cedula);
    salida.origenDecision = 'google-sheets';

    if (
      salida.encontrado === true &&
      estadoPermiteReenvio(salida.envio || salida)
    ) {
      salida.encontrado = false;
      salida.reenvioPermitido = true;
      salida.mensaje = 'Google Sheets permite un nuevo envío.';
    }

    return salida;
  }

  function instalarSheetsComoFuentePrincipal() {
    var sheets = window.EstudianteMVPSheets || null;
    var reemplazo;

    if (
      !sheets ||
      sheets.__googleSheetsFuentePrincipal === true ||
      typeof sheets.consultarEnvioPorCedula !== 'function'
    ) {
      return;
    }

    consultaSheetsOriginal = sheets.consultarEnvioPorCedula.bind(sheets);

    reemplazo = Object.assign({}, sheets, {
      consultarEnvioPorCedula: function (cedula) {
        var cedulaLimpia = limpiarCedula(cedula);
        var resultadoCache;

        if (
          consultaSheetsCache &&
          consultaSheetsCache.cedula === cedulaLimpia
        ) {
          resultadoCache = consultaSheetsCache.resultado;
          consultaSheetsCache = null;
          return Promise.resolve(resultadoCache);
        }

        return consultaSheetsOriginal(cedulaLimpia)
          .then(function (resultado) {
            return normalizarDecisionSheets(resultado, cedulaLimpia);
          });
      }
    });

    Object.defineProperty(reemplazo, '__googleSheetsFuentePrincipal', {
      value: true,
      enumerable: false
    });

    /*
      Compatibilidad con versiones anteriores del archivo: evita que otro
      módulo vuelva a instalar el permiso de reenvío basado en Firebase.
    */
    Object.defineProperty(reemplazo, '__permisoReenvioInstalado', {
      value: true,
      enumerable: false
    });

    window.EstudianteMVPSheets = Object.freeze(reemplazo);
  }

  function obtenerColeccionTitulos() {
    var config = window.EstudianteMVPConfig || null;

    return config && typeof config.obtenerColeccion === 'function'
      ? config.obtenerColeccion('titulos') || 'titulos'
      : 'titulos';
  }

  function esColeccionTitulos(coleccion) {
    return String(coleccion || '').trim().toLowerCase() ===
      String(obtenerColeccionTitulos()).trim().toLowerCase();
  }

  function instalarFirebaseTitulosSoloRespaldo() {
    var firebase = window.EstudianteMVPFirebaseCore || null;
    var leerDocumentoOriginal;
    var consultarPorCampoOriginal;
    var reemplazo;

    if (!firebase || firebase.__titulosSoloRespaldo === true) {
      return;
    }

    leerDocumentoOriginal = typeof firebase.leerDocumento === 'function'
      ? firebase.leerDocumento.bind(firebase)
      : null;

    consultarPorCampoOriginal = typeof firebase.consultarPorCampo === 'function'
      ? firebase.consultarPorCampo.bind(firebase)
      : null;

    reemplazo = Object.assign({}, firebase);

    if (leerDocumentoOriginal) {
      reemplazo.leerDocumento = function (coleccion, documento) {
        if (esColeccionTitulos(coleccion)) {
          return Promise.resolve(null);
        }

        return leerDocumentoOriginal(coleccion, documento);
      };
    }

    if (consultarPorCampoOriginal) {
      reemplazo.consultarPorCampo = function (
        coleccion,
        campo,
        operador,
        valor,
        limite
      ) {
        if (esColeccionTitulos(coleccion)) {
          return Promise.resolve([]);
        }

        return consultarPorCampoOriginal(
          coleccion,
          campo,
          operador,
          valor,
          limite
        );
      };
    }

    Object.defineProperty(reemplazo, '__titulosSoloRespaldo', {
      value: true,
      enumerable: false
    });

    window.EstudianteMVPFirebaseCore = Object.freeze(reemplazo);
  }

  function mostrarModalConsulta() {
    var modales = window.EstudianteMVPModales || null;

    if (
      modales &&
      typeof modales.mostrarConsulta === 'function'
    ) {
      modales.mostrarConsulta();
    }
  }

  function mostrarErrorSheets(error) {
    var ui = window.EstudianteMVPUI || null;
    var mensaje =
      'No fue posible verificar tu envío en Google Sheets. ' +
      'Intenta nuevamente en unos minutos.';
    var estado;

    console.error(
      '[Estudiantes MVP] No se pudo validar el envío en Google Sheets:',
      error
    );

    if (ui && typeof ui.setCargando === 'function') {
      ui.setCargando(false);
    }

    if (ui && typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado('#estadoPrincipal', mensaje, 'error');

      if (typeof ui.enfocar === 'function') {
        ui.enfocar('#cedulaInput');
      }

      return;
    }

    estado = window.document &&
      window.document.getElementById('estadoPrincipal');

    if (estado) {
      estado.textContent = mensaje;
      estado.classList.remove('is-info', 'is-warning', 'is-success');
      estado.classList.add('is-error');
    }
  }

  function mostrarConsultandoSheets() {
    var ui = window.EstudianteMVPUI || null;

    if (!ui) return;

    if (typeof ui.setCargando === 'function') {
      ui.setCargando(true, 'Consultando estado en Google Sheets...');
    }

    if (typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado(
        '#estadoPrincipal',
        'Verificando tu registro en Google Sheets...',
        'info'
      );
    }
  }

  function instalarConsultaConAutoridadSheets() {
    var documento = window.document;

    if (
      !documento ||
      documento.__consultaConAutoridadSheetsInstalada === true
    ) {
      return;
    }

    documento.__consultaConAutoridadSheetsInstalada = true;

    documento.addEventListener(
      'submit',
      function (evento) {
        var formulario = evento.target;
        var input;
        var cedula;

        if (!formulario || formulario.id !== 'formConsulta') {
          return;
        }

        if (reenviandoConsulta) {
          reenviandoConsulta = false;
          mostrarModalConsulta();
          return;
        }

        input = documento.getElementById('cedulaInput');
        cedula = limpiarCedula(input ? input.value : '');

        /* La validación de campo vacío sigue a cargo de estudiante.app.js. */
        if (!cedula) {
          return;
        }

        evento.preventDefault();
        evento.stopImmediatePropagation();

        mostrarConsultandoSheets();

        if (typeof consultaSheetsOriginal !== 'function') {
          mostrarErrorSheets(
            new Error('La consulta de Google Sheets no está disponible.')
          );
          return;
        }

        consultaSheetsOriginal(cedula)
          .then(function (resultado) {
            resultado = normalizarDecisionSheets(resultado, cedula);

            if (resultado.ok === false) {
              throw new Error(
                resultado.mensaje ||
                'Google Sheets no pudo verificar el envío.'
              );
            }

            consultaSheetsCache = {
              cedula: cedula,
              resultado: resultado
            };

            reenviandoConsulta = true;

            formulario.dispatchEvent(
              new window.Event('submit', {
                bubbles: true,
                cancelable: true
              })
            );
          })
          .catch(function (error) {
            consultaSheetsCache = null;
            reenviandoConsulta = false;
            mostrarErrorSheets(error);
          });
      },
      true
    );
  }

  window.EstudianteMVPIAPrompt = Object.freeze({
    normalizarContexto: normalizarContexto,
    obtenerEtapas: function () {
      return ETAPAS.slice();
    },
    obtenerEtapaPropuesta: obtenerEtapaPropuesta,
    estadoPermiteReenvio: estadoPermiteReenvio,
    fuentePrincipalEnvios: 'google-sheets',
    modo: '3x3'
  });

  instalarSheetsComoFuentePrincipal();
  instalarFirebaseTitulosSoloRespaldo();
  instalarConsultaConAutoridadSheets();
})(window);
