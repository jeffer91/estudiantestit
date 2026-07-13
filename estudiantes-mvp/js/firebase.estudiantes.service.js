/*
  Archivo: firebase.estudiantes.service.js
  Ruta: estudiantes-mvp/js/firebase.estudiantes.service.js
  Funciones principales:
  - Consultar estudiantes en Firebase.
  - Buscar primero en la colección Estudiantes usando la cédula como ID del documento.
  - Normalizar datos académicos para la pantalla del estudiante.
  - Dejar lista la información para el flujo de paginación.
*/
(function (window) {
  'use strict';

  function obtenerConfig() {
    return window.EstudianteMVPConfig || null;
  }

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function obtenerFirebase() {
    return window.EstudianteMVPFirebaseCore || null;
  }

  function buscarPorCedula(cedula) {
    var utils = obtenerUtils();
    var firebase = obtenerFirebase();
    var config = obtenerConfig();
    var cedulaLimpia;
    var coleccion;

    if (!utils || !firebase || !config) {
      return Promise.reject(new Error('Faltan módulos base para consultar estudiantes.'));
    }

    cedulaLimpia = utils.limpiarCedula(cedula);
    coleccion = config.obtenerColeccion('estudiantes') || 'Estudiantes';

    if (!cedulaLimpia) {
      return Promise.reject(new Error('Ingresa una cédula válida.'));
    }

    return firebase.leerDocumento(coleccion, cedulaLimpia)
      .then(function (data) {
        if (data) {
          return construirResultadoEstudiante(data, cedulaLimpia, 'documento_id');
        }

        return buscarPorCampoCedula(coleccion, cedulaLimpia);
      });
  }

  function buscarPorCampoCedula(coleccion, cedula) {
    var firebase = obtenerFirebase();

    return firebase.consultarPorCampo(coleccion, 'numeroIdentificacion', '==', cedula, 1)
      .then(function (resultados) {
        if (resultados && resultados.length) {
          return construirResultadoEstudiante(resultados[0], cedula, 'campo_numeroIdentificacion');
        }

        return firebase.consultarPorCampo(coleccion, 'cedula', '==', cedula, 1);
      })
      .then(function (resultadoOColeccion) {
        if (resultadoOColeccion && resultadoOColeccion.ok !== undefined) {
          return resultadoOColeccion;
        }

        if (resultadoOColeccion && resultadoOColeccion.length) {
          return construirResultadoEstudiante(resultadoOColeccion[0], cedula, 'campo_cedula');
        }

        return {
          ok: false,
          encontrado: false,
          estudiante: null,
          mensaje: 'No encontramos un estudiante con esa cédula.'
        };
      });
  }

  function construirResultadoEstudiante(data, cedulaConsultada, origen) {
    var estudiante = normalizarEstudiante(data, cedulaConsultada);

    return {
      ok: true,
      encontrado: true,
      estudiante: estudiante,
      origen: origen || 'firebase',
      mensaje: 'Estudiante encontrado correctamente.'
    };
  }

  function normalizarEstudiante(data, cedulaConsultada) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var periodoFallback = config.obtenerPeriodoFallback();
    var cedula = utils.limpiarCedula(
      data.numeroIdentificacion ||
      data.cedula ||
      data.Cedula ||
      data.Cédula ||
      cedulaConsultada
    );

    var nombres = utils.limpiarTexto(
      data.Nombres ||
      data.nombres ||
      data.nombre ||
      data.Nombre ||
      ''
    );

    var nombreCarrera = utils.limpiarTexto(
      data.NombreCarrera ||
      data.nombreCarrera ||
      data.carrera ||
      data.Carrera ||
      ''
    );

    var codigoCarrera = utils.limpiarTexto(
      data.CodigoCarrera ||
      data.codigoCarrera ||
      ''
    );

    var sede = utils.limpiarTexto(
      data.Sede ||
      data.sede ||
      ''
    );

    var modalidad = utils.limpiarTexto(
      data.modalidadDetectada ||
      data.Modalidad ||
      data.modalidad ||
      ''
    );

    var periodoId = utils.limpiarTexto(
      data.periodoId ||
      data.PeriodoId ||
      data.periodo ||
      data.Periodo ||
      periodoFallback.periodoId
    );

    var periodoLabel = utils.limpiarTexto(
      data.periodoLabel ||
      data.PeriodoLabel ||
      data.periodoTexto ||
      data.PeriodoTexto ||
      periodoFallback.periodoLabel
    );

    return {
      id: data._id || data.id || cedula,
      cedula: cedula,
      numeroIdentificacion: cedula,
      nombres: nombres,
      carrera: nombreCarrera,
      nombreCarrera: nombreCarrera,
      codigoCarrera: codigoCarrera,
      sede: sede,
      modalidadDetectada: modalidad,
      periodoId: periodoId,
      periodoLabel: periodoLabel,
      correoInstitucional: utils.limpiarTexto(data.CorreoInstitucional || data.correoInstitucional || ''),
      correoPersonal: utils.limpiarTexto(data.CorreoPersonal || data.correoPersonal || ''),
      celular: utils.limpiarTexto(data.Celular || data.celular || ''),
      horarioComplexivo: utils.limpiarTexto(data.HorarioComplexivo || data.horarioComplexivo || ''),
      requisitos: {
        academico: utils.limpiarTexto(data.Academico || ''),
        financiero: utils.limpiarTexto(data.Financiero || ''),
        documentacion: utils.limpiarTexto(data.Documentacion || ''),
        ingles: utils.limpiarTexto(data.Ingles || ''),
        titulacion: utils.limpiarTexto(data.Titulacion || ''),
        vinculacion: utils.limpiarTexto(data.Vinculacion || ''),
        practicasVinculacion: utils.limpiarTexto(data.PrácticasVinculacion || data.PracticasVinculacion || '')
      },
      raw: data || {}
    };
  }

  function validarEstudianteParaContinuar(estudiante) {
    var utils = obtenerUtils();

    if (!estudiante) {
      return utils.error('No hay datos de estudiante cargados.');
    }

    if (!estudiante.cedula) {
      return utils.error('No se pudo identificar la cédula del estudiante.');
    }

    if (!estudiante.nombres) {
      return utils.error('El estudiante no tiene nombres registrados en Firebase.');
    }

    if (!estudiante.nombreCarrera && !estudiante.carrera) {
      return utils.error('El estudiante no tiene carrera registrada en Firebase.');
    }

    return utils.ok(estudiante, 'Datos académicos válidos.');
  }

  window.EstudianteMVPFirebaseEstudiantes = Object.freeze({
    buscarPorCedula: buscarPorCedula,
    normalizarEstudiante: normalizarEstudiante,
    validarEstudianteParaContinuar: validarEstudianteParaContinuar
  });
})(window);
