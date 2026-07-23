/* Consulta académica del estudiante desde REQUISITOS_BDLOCAL_SYNC. */
(function (window) {
  'use strict';

  function config() { return window.EstudianteMVPConfig || null; }
  function utils() { return window.EstudianteMVPUtils || null; }
  function texto(valor) {
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function esLocal() {
    var host = texto(window.location && window.location.hostname).toLowerCase();
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].indexOf(host) >= 0;
  }

  function esArchivo() {
    return texto(window.location && window.location.protocol).toLowerCase() === 'file:';
  }

  function apiBase() {
    var forzada = texto(window.TITULOS_API_BASE || '');
    var origin;
    if (forzada) return forzada.replace(/\/$/, '');
    if (esLocal()) return 'http://127.0.0.1:8788';
    if (esArchivo()) return 'https://titulos.pages.dev';
    origin = texto(window.location && window.location.origin);
    return origin && origin !== 'null'
      ? origin.replace(/\/$/, '')
      : 'https://titulos.pages.dev';
  }

  function solicitar(accion, datos) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller
      ? window.setTimeout(function () { controller.abort(); }, 115000)
      : null;
    var opciones = {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Titulos-App': 'estudiantes'
      },
      body: JSON.stringify({
        accion: accion,
        metodo: 'POST',
        datos: datos || {}
      })
    };

    if (controller) opciones.signal = controller.signal;

    return fetch(apiBase() + '/api/requisitos', opciones)
      .then(function (respuesta) {
        return respuesta.text().then(function (body) {
          var json = {};
          try {
            json = body ? JSON.parse(body) : {};
          } catch (_error) {
            throw new Error('REQUISITOS_BDLOCAL_SYNC respondió en un formato no válido.');
          }
          if (!respuesta.ok || json.ok === false) {
            throw new Error(json.mensaje || json.error || ('Error HTTP ' + respuesta.status));
          }
          return json;
        });
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') {
          throw new Error('La consulta académica superó el tiempo máximo. Intenta nuevamente.');
        }
        throw error;
      })
      .then(function (resultado) {
        if (timer) window.clearTimeout(timer);
        return resultado;
      }, function (error) {
        if (timer) window.clearTimeout(timer);
        throw error;
      });
  }

  function normalizarEstudiante(data, cedulaConsultada) {
    data = data || {};
    var u = utils();
    var periodo = config() && config().obtenerPeriodoFallback
      ? config().obtenerPeriodoFallback()
      : { periodoId: '', periodoLabel: '' };
    var cedula = u.limpiarCedula(
      data.numeroIdentificacion || data.cedula || data.Cedula || data['Cédula'] || cedulaConsultada
    );
    var nombres = u.limpiarTexto(data.Nombres || data.nombres || data.nombre || data.Nombre || '');
    var carrera = u.limpiarTexto(data.NombreCarrera || data.nombreCarrera || data.carrera || data.Carrera || '');
    var periodoId = u.limpiarTexto(
      data.periodoId || data.periodoCanonicoId || data.periodId || periodo.periodoId
    );
    var periodoLabel = u.limpiarTexto(
      data.periodoLabel || data.periodoCanonicoLabel || data.PeriodoLabel || periodo.periodoLabel || periodoId
    );

    return {
      id: data.id || data._id || cedula,
      cedula: cedula,
      numeroIdentificacion: cedula,
      nombres: nombres,
      Nombres: nombres,
      carrera: carrera,
      nombreCarrera: carrera,
      NombreCarrera: carrera,
      codigoCarrera: u.limpiarTexto(data.CodigoCarrera || data.codigoCarrera || ''),
      CodigoCarrera: u.limpiarTexto(data.CodigoCarrera || data.codigoCarrera || ''),
      sede: u.limpiarTexto(data.Sede || data.sede || ''),
      Sede: u.limpiarTexto(data.Sede || data.sede || ''),
      modalidadDetectada: u.limpiarTexto(data.modalidadDetectada || data.Modalidad || data.modalidad || ''),
      periodoId: periodoId,
      periodoLabel: periodoLabel,
      correoInstitucional: u.limpiarTexto(data.CorreoInstitucional || data.correoInstitucional || ''),
      correoPersonal: u.limpiarTexto(data.CorreoPersonal || data.correoPersonal || ''),
      celular: u.limpiarTexto(data.Celular || data.celular || ''),
      horarioComplexivo: u.limpiarTexto(data.HorarioComplexivo || data.horarioComplexivo || ''),
      division: u.limpiarTexto(data.division || data.Division || ''),
      estadoMatricula: u.limpiarTexto(data.estadoMatricula || data.EstadoMatricula || 'ACTIVO'),
      requisitos: {
        academico: u.limpiarTexto(data.Academico || data['Académico'] || ''),
        financiero: u.limpiarTexto(data.Financiero || ''),
        documentacion: u.limpiarTexto(data.Documentacion || data['Documentación'] || ''),
        ingles: u.limpiarTexto(data.Ingles || data['Inglés'] || ''),
        titulacion: u.limpiarTexto(data.Titulacion || data['Titulación'] || ''),
        vinculacion: u.limpiarTexto(data.Vinculacion || data['Vinculación'] || ''),
        practicasVinculacion: u.limpiarTexto(data.PracticasVinculacion || data['PrácticasVinculacion'] || ''),
        seguimientoGraduados: u.limpiarTexto(data.SeguimientoGraduados || ''),
        actualizacionDatos: u.limpiarTexto(data.ActualizacionDatos || data['ActualizaciónDatos'] || ''),
        aprobacionTitulacion: u.limpiarTexto(data.AprobacionTitulacion || data['AprobaciónTitulacion'] || ''),
        aprobacionComplexivoProyecto: u.limpiarTexto(
          data.AprobacionComplexivoProyecto || data['AprobaciónComplexivoProyecto'] || ''
        )
      },
      fuente: 'REQUISITOS_BDLOCAL_SYNC',
      raw: data
    };
  }

  function buscarPorCedula(cedula) {
    var u = utils();
    var limpia = u.limpiarCedula(cedula);
    if (!limpia) return Promise.reject(new Error('Ingresa una cédula válida.'));

    return solicitar('CONSULTAR_ESTUDIANTE_TITULACION', {
      cedula: limpia,
      numeroIdentificacion: limpia
    }).then(function (resultado) {
      var raw = resultado.estudiante || resultado.registro || resultado.data;
      if (!resultado.encontrado || !raw) {
        return {
          ok: false,
          encontrado: false,
          estudiante: null,
          mensaje: resultado.mensaje || 'No encontramos un estudiante con esa cédula.'
        };
      }
      return {
        ok: true,
        encontrado: true,
        estudiante: normalizarEstudiante(raw, limpia),
        origen: 'REQUISITOS_BDLOCAL_SYNC',
        mensaje: resultado.mensaje || 'Estudiante encontrado correctamente.'
      };
    });
  }

  function validarEstudianteParaContinuar(estudiante) {
    var u = utils();
    if (!estudiante) return u.error('No hay datos de estudiante cargados.');
    if (!estudiante.cedula) return u.error('No se pudo identificar la cédula del estudiante.');
    if (!estudiante.nombres) return u.error('El estudiante no tiene nombres registrados en REQUISITOS_BDLOCAL_SYNC.');
    if (!estudiante.nombreCarrera && !estudiante.carrera) {
      return u.error('El estudiante no tiene carrera registrada en REQUISITOS_BDLOCAL_SYNC.');
    }
    return u.ok(estudiante, 'Datos académicos válidos.');
  }

  function probarConexion() {
    return solicitar('PING', {}).then(function (respuesta) {
      return { ok: true, respuesta: respuesta };
    });
  }

  var servicio = Object.freeze({
    buscarPorCedula: buscarPorCedula,
    normalizarEstudiante: normalizarEstudiante,
    validarEstudianteParaContinuar: validarEstudianteParaContinuar,
    probarConexion: probarConexion
  });

  window.EstudianteMVPRequisitosEstudiantes = servicio;
  /* Alias conservado para no romper el controlador histórico de la app. */
  window.EstudianteMVPFirebaseEstudiantes = servicio;
})(window);
