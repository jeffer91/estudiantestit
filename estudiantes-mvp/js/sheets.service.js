/* RESPALDO TITULOS APP como única base operativa del estudiante. */
(function (window) {
  'use strict';

  function cfg() {
    return window.EstudianteMVPConfig || null;
  }

  function utils() {
    return window.EstudianteMVPUtils || null;
  }

  function texto(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cedula(value) {
    var helper = utils();
    var digits = helper && helper.limpiarCedula
      ? helper.limpiarCedula(value)
      : String(value || '').replace(/\D/g, '');
    if (digits.length === 9) digits = '0' + digits;
    return digits.length === 10 ? digits : '';
  }

  function esLocal() {
    var host = texto(window.location && window.location.hostname).toLowerCase();
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].indexOf(host) >= 0;
  }

  function esArchivo() {
    return texto(window.location && window.location.protocol).toLowerCase() === 'file:';
  }

  function apiBase() {
    var forced = texto(window.TITULOS_API_BASE || '');
    var origin;
    if (forced) return forced.replace(/\/$/, '');
    if (esLocal()) return 'http://127.0.0.1:8788';
    if (esArchivo()) return 'https://titulos.pages.dev';
    origin = texto(window.location && window.location.origin);
    return origin && origin !== 'null'
      ? origin.replace(/\/$/, '')
      : 'https://titulos.pages.dev';
  }

  function proxyUrl() {
    return apiBase() + '/api/titulos';
  }

  function enviarProxy(action, data, method) {
    return fetch(proxyUrl(), {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Titulos-App': 'estudiantes'
      },
      body: JSON.stringify({
        accion: action,
        metodo: method || 'POST',
        datos: data || {}
      })
    }).then(function (response) {
      return response.text().then(function (body) {
        var json = {};
        try {
          json = body ? JSON.parse(body) : {};
        } catch (error) {
          throw new Error('El servicio de Títulos respondió en un formato no válido.');
        }

        if (!response.ok || json.ok === false) {
          throw new Error(
            json.mensaje || json.message || json.error || ('Error HTTP ' + response.status)
          );
        }
        return json;
      });
    });
  }

  function leerConfiguracion() {
    return enviarProxy('CONFIGURACION_PUBLICA', {}, 'GET').then(function (result) {
      return {
        activo: result.activo !== false,
        nombre: result.nombre || 'RESPALDO TITULOS APP',
        timeoutMs: Number(result.timeoutMs || 45000),
        version: result.version || '',
        estado: result.estado || '',
        origen: 'claves',
        raw: result
      };
    });
  }

  function guardarConfiguracion() {
    return Promise.reject(new Error('La configuración se administra en la hoja Claves.'));
  }

  function estadoEnvio(envio) {
    return texto(
      envio && (envio.estado || envio.estadoFinal || envio.estadoProceso || envio.estadoGoogleSheets)
    ).toUpperCase();
  }

  function extraerEnvio(result) {
    return result && (
      result.envio ||
      result.registro ||
      result.data && (result.data.envio || result.data.registro)
    ) || null;
  }

  function consultarAccesoEstudiante(value) {
    var id = cedula(value);
    if (!id) {
      return Promise.resolve({
        ok: false,
        encontrado: false,
        cedula: '',
        mensaje: 'No se recibió una cédula válida.'
      });
    }

    return enviarProxy(
      'CONSULTAR_ACCESO_ESTUDIANTE',
      { cedula: id, numeroIdentificacion: id },
      'GET'
    ).then(function (result) {
      var student = result.estudiante || result.registro || null;
      var envio = result.envio || null;
      var status = estadoEnvio(envio);
      var permiteReenvio = result.permiteReenvio === true || (
        status === 'DEVUELTO' && (!envio || String(envio.permitirReenvio).toUpperCase() !== 'FALSE')
      );

      return {
        ok: true,
        encontrado: result.encontrado === true || result.existe === true || Boolean(student),
        cedula: id,
        estudiante: student,
        registro: student,
        tieneEnvio: result.tieneEnvio === true && !permiteReenvio,
        encontradoEnvio: result.encontradoEnvio === true || Boolean(envio),
        permiteReenvio: permiteReenvio,
        envio: envio,
        periodoId: result.periodoId || student && student.periodoId || '',
        periodoLabel: result.periodoLabel || student && student.periodoLabel || '',
        fuente: result.fuente || 'INDICES_RESPALDO_TITULOS_APP',
        duracionMs: Number(result.duracionMs || 0),
        cache: result.cache || false,
        indices: result.indices || null,
        mensaje: result.mensaje || ''
      };
    });
  }

  function consultarEnvioPorCedula(value) {
    var id = cedula(value);
    if (!id) {
      return Promise.resolve({
        ok: false,
        encontrado: false,
        mensaje: 'No se recibió una cédula válida.'
      });
    }

    return enviarProxy(
      'CONSULTAR_ENVIO_CEDULA',
      { cedula: id, numeroIdentificacion: id },
      'GET'
    ).then(function (result) {
      var envio = extraerEnvio(result);
      var encontrado = result.encontrado === true || result.existe === true || Boolean(envio);
      var status = estadoEnvio(envio);
      var permite = status === 'DEVUELTO' && (!envio || envio.permitirReenvio !== false);

      return {
        ok: true,
        encontrado: encontrado && !permite,
        permiteReenvio: permite,
        cedula: id,
        envio: envio,
        mensaje: result.mensaje || ''
      };
    }).catch(function (error) {
      return {
        ok: false,
        encontrado: false,
        cedula: id,
        error: error,
        mensaje: error.message || 'No se pudo consultar el envío previo.'
      };
    });
  }

  function tituloTexto(item) {
    if (typeof item === 'string') return texto(item);
    item = item || {};
    return texto(
      item.tituloFinal || item.titulo || item.tituloMejorado || item.texto || item.title || ''
    );
  }

  function normalizarPropuestas(payload) {
    var list = payload && (payload.titulosEnviados || payload.propuestas) || [];
    return (Array.isArray(list) ? list : []).map(function (item, index) {
      var output = typeof item === 'string'
        ? { tituloFinal: item }
        : Object.assign({}, item || {});
      output.numero = Number(output.numero || index + 1);
      output.tituloFinal = tituloTexto(output);
      return output;
    });
  }

  function construirPayloadSheets(payload) {
    payload = payload || {};
    var student = payload.estudiante || {};
    var proposals = normalizarPropuestas(payload);
    var periodId = texto(
      payload.periodoId ||
      student.periodoId ||
      (cfg() && cfg().obtener ? cfg().obtener('proceso.periodoIdFallback', '') : '')
    );
    var periodLabel = texto(
      payload.periodoLabel || student.periodoLabel || payload.periodo || periodId
    );
    var id = cedula(
      payload.cedula || payload.numeroIdentificacion || student.cedula || student.numeroIdentificacion
    );
    var names = texto(payload.nombres || student.nombres || student.nombreCompleto);
    var career = texto(
      payload.carrera || payload.nombreCarrera || student.carrera || student.nombreCarrera
    );
    var careerCode = texto(
      payload.codigoCarrera || student.codigoCarrera || student.CodigoCarrera
    );
    var favoriteNumber = Number(payload.tituloPreferidoNumero || 1);
    var favorite = proposals.find(function (item) {
      return Number(item.numero) === favoriteNumber;
    }) || proposals[0] || {};
    var date = utils() && utils().fechaIso ? utils().fechaIso() : new Date().toISOString();
    var recordId = (periodId || 'sin_periodo') + '__' + (id || 'sin_cedula');
    var data = {
      fechaEnvio: date,
      fechaCliente: date,
      idRegistro: recordId,
      tituloId: recordId,
      codigoRegistro: recordId,
      cedula: id,
      numeroIdentificacion: id,
      nombres: names,
      estudiante: names,
      carrera: career,
      nombreCarrera: career,
      codigoCarrera: careerCode,
      sede: texto(payload.sede || student.sede || student.Sede),
      modalidad: texto(payload.modalidad || student.modalidad || student.Modalidad),
      periodo: periodLabel || periodId,
      periodoId: periodId,
      periodoLabel: periodLabel,
      telegram: texto(payload.telegram || payload.telegramUser),
      telegramUser: texto(payload.telegram || payload.telegramUser),
      titulo1: tituloTexto(proposals[0]),
      titulo2: tituloTexto(proposals[1]),
      titulo3: tituloTexto(proposals[2]),
      preferido: favoriteNumber,
      tituloPreferidoNumero: favoriteNumber,
      tituloPreferido: tituloTexto(favorite),
      tituloPreferidoTexto: tituloTexto(favorite),
      propuestas: proposals,
      titulosEnviados: proposals,
      estado: 'PENDIENTE_REVISION',
      estadoFinal: 'PENDIENTE_REVISION',
      estadoProceso: 'PENDIENTE_REVISION',
      permitirReenvio: false,
      origenCaptura: 'estudiantes-mvp',
      creadoEnLocal: payload.creadoEnLocal || '',
      enviadoEnLocal: payload.enviadoEnLocal || date
    };

    return Object.assign({ accion: 'ENVIO_ESTUDIANTE', tipo: 'ENVIO', datos: data }, data);
  }

  function enviarEnvio(payload) {
    var data = construirPayloadSheets(payload);
    return enviarProxy('ENVIO_ESTUDIANTE', data, 'POST').then(function (result) {
      return {
        ok: true,
        estado: 'PENDIENTE_REVISION',
        idRegistro: result.idRegistro || result.tituloId || data.idRegistro,
        mensaje: result.mensaje || 'Envío guardado correctamente.',
        respuesta: result,
        raw: result
      };
    });
  }

  function probarConexion() {
    return enviarProxy('PING', {}, 'GET').then(function (result) {
      return {
        ok: true,
        respuesta: result,
        mensaje: result.mensaje || 'Conexión correcta.'
      };
    });
  }

  window.EstudianteMVPSheets = Object.freeze({
    leerConfiguracion: leerConfiguracion,
    guardarConfiguracion: guardarConfiguracion,
    consultarAccesoEstudiante: consultarAccesoEstudiante,
    consultarEnvioPorCedula: consultarEnvioPorCedula,
    enviarEnvio: enviarEnvio,
    probarConexion: probarConexion,
    construirPayloadSheets: construirPayloadSheets,
    proxyUrl: proxyUrl
  });
})(window);
