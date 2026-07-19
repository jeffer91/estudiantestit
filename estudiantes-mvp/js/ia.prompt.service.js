/*
  Archivo: ia.prompt.service.js
  Funciones vigentes:
  - Normalizar estudiante y propuesta para el motor IA 3x3.
  - Mantener las definiciones académicas de las tres etapas.
  - Permitir un nuevo envío cuando Firebase marque un registro como devuelto o eliminado.
  - Mostrar inmediatamente el modal de reglas al consultar una cédula válida.

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
      registro.estadoFirebase ||
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

  function consultarPermisoFirebase(cedula) {
    var firebaseCore = window.EstudianteMVPFirebaseCore || null;
    var config = window.EstudianteMVPConfig || null;
    var coleccion = config && typeof config.obtenerColeccion === 'function'
      ? config.obtenerColeccion('titulos') || 'titulos'
      : 'titulos';
    var cedulaLimpia = String(cedula || '').replace(/\D/g, '');

    if (!firebaseCore || !cedulaLimpia) return Promise.resolve(false);

    return firebaseCore.leerDocumento(coleccion, cedulaLimpia)
      .then(function (documento) {
        if (documento && estadoPermiteReenvio(documento)) return true;
        if (documento) return false;

        return firebaseCore.consultarPorCampo(
          coleccion,
          'cedula',
          '==',
          cedulaLimpia,
          5
        ).then(function (lista) {
          return (lista || []).some(estadoPermiteReenvio);
        });
      })
      .catch(function () {
        return false;
      });
  }

  function instalarPermisoReenvio() {
    var sheets = window.EstudianteMVPSheets || null;
    var consultaOriginal;
    var reemplazo;

    if (
      !sheets ||
      sheets.__permisoReenvioInstalado ||
      typeof sheets.consultarEnvioPorCedula !== 'function'
    ) {
      return;
    }

    consultaOriginal = sheets.consultarEnvioPorCedula.bind(sheets);
    reemplazo = Object.assign({}, sheets, {
      consultarEnvioPorCedula: function (cedula) {
        return consultarPermisoFirebase(cedula).then(function (permitido) {
          if (permitido) {
            return {
              ok: true,
              encontrado: false,
              reenvioPermitido: true,
              cedula: String(cedula || '').replace(/\D/g, ''),
              mensaje: 'Firebase permite un nuevo envío.'
            };
          }

          return consultaOriginal(cedula).then(function (resultado) {
            resultado = resultado || {};

            if (
              resultado.encontrado &&
              estadoPermiteReenvio(resultado.envio || resultado)
            ) {
              resultado.encontrado = false;
              resultado.reenvioPermitido = true;
            }

            return resultado;
          });
        });
      }
    });

    Object.defineProperty(reemplazo, '__permisoReenvioInstalado', {
      value: true,
      enumerable: false
    });

    window.EstudianteMVPSheets = Object.freeze(reemplazo);
  }

  function instalarModalConsultaInmediato() {
    var documento = window.document;

    if (!documento || documento.__modalConsultaInmediatoInstalado === true) {
      return;
    }

    documento.__modalConsultaInmediatoInstalado = true;

    documento.addEventListener(
      'submit',
      function (evento) {
        var formulario = evento.target;
        var input;
        var utils;
        var cedula;
        var modales;

        if (!formulario || formulario.id !== 'formConsulta') {
          return;
        }

        input = documento.getElementById('cedulaInput');
        utils = obtenerUtils();
        cedula = utils && typeof utils.limpiarCedula === 'function'
          ? utils.limpiarCedula(input ? input.value : '')
          : String(input ? input.value : '').replace(/\D/g, '');

        if (!cedula) {
          return;
        }

        modales = window.EstudianteMVPModales || null;

        if (
          modales &&
          typeof modales.mostrarConsulta === 'function'
        ) {
          modales.mostrarConsulta();
        }
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
    modo: '3x3'
  });

  instalarPermisoReenvio();
  instalarModalConsultaInmediato();
})(window);