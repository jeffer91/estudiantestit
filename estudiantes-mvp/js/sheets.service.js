/* RESPALDO TITULOS APP como única base operativa del estudiante. */
(function (window) {
  'use strict';

  function cfg() { return window.EstudianteMVPConfig || null; }
  function utils() { return window.EstudianteMVPUtils || null; }
  function texto(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/\s+/g, ' ')
      .trim();
  }
  function normalizarClave(value) {
    return texto(value).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }
  function campoFlexible(object, names) {
    var data = object || {};
    var map = {};
    var i;
    Object.keys(data).forEach(function (key) { map[normalizarClave(key)] = key; });
    for (i = 0; i < names.length; i += 1) {
      var real = map[normalizarClave(names[i])];
      if (real !== undefined && data[real] !== undefined && data[real] !== null) return data[real];
    }
    return undefined;
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
  function proxyUrl() { return apiBase() + '/api/titulos'; }
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
        try { json = body ? JSON.parse(body) : {}; }
        catch (error) { throw new Error('El servicio de Títulos respondió en un formato no válido.'); }
        if (!response.ok || json.ok === false) {
          var fallo = new Error(json.mensaje || json.message || json.error || ('Error HTTP ' + response.status));
          fallo.status = response.status;
          fallo.respuesta = json;
          fallo.duplicado = json.duplicado === true;
          throw fallo;
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
  function si(value) {
    return value === true || ['SI', 'SÍ', 'TRUE', '1', 'YES'].indexOf(texto(value).toUpperCase()) >= 0;
  }
  function pareceEnvio(value) {
    return Boolean(value && typeof value === 'object' && (
      campoFlexible(value, ['titulo1', 'titulo2', 'titulo3', 'tituloAprobado', 'tituloCorregido', 'tituloElegido', 'idRegistro', 'envioId']) !== undefined
    ));
  }
  function estadoEnvio(envio) {
    return texto(campoFlexible(envio || {}, [
      'estado', 'estadoFinal', 'estadoProceso', 'estadoGoogleSheets'
    ])).toUpperCase();
  }
  function extraerEnvio(result) {
    var candidatos;
    var i;
    if (!result || typeof result !== 'object') return null;
    candidatos = [
      result.envio,
      result.registroEnvio,
      result.envioActual,
      result.data && result.data.envio,
      result.data && result.data.registroEnvio,
      result.resultado && result.resultado.envio,
      result.respuesta && result.respuesta.envio,
      result.registro
    ];
    for (i = 0; i < candidatos.length; i += 1) {
      if (pareceEnvio(candidatos[i])) return candidatos[i];
    }
    return pareceEnvio(result) ? result : null;
  }
  function permiteReenvio(result, envio) {
    var status;
    var propio;
    var valor;
    envio = envio || extraerEnvio(result) || {};
    status = estadoEnvio(envio) || texto(campoFlexible(result || {}, ['estado', 'estadoFinal'])).toUpperCase();
    propio = campoFlexible(envio, ['permitirReenvio', 'permiteReenvio']);
    valor = propio !== undefined ? propio : campoFlexible(result || {}, ['permitirReenvio', 'permiteReenvio']);
    return status === 'DEVUELTO' && (
      valor === undefined || valor === null || valor === '' || si(valor)
    );
  }
  function evidenciaEnvio(result, student, envio) {
    return Boolean(
      result && si(campoFlexible(result, ['tieneEnvio', 'encontradoEnvio', 'existeEnvio'])) ||
      envio ||
      student && (
        si(campoFlexible(student, ['tieneEnvio', 'tiene envío', 'envioRegistrado'])) ||
        texto(campoFlexible(student, ['idRegistro', 'envioId', 'tituloId']))
      )
    );
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
      var envio = extraerEnvio(result);
      var permitir = permiteReenvio(result, envio);
      var evidencia = evidenciaEnvio(result, student, envio);
      var salida = {
        ok: true,
        encontrado: result.encontrado === true || result.existe === true || si(result.encontrado) || si(result.existe) || Boolean(student),
        cedula: id,
        estudiante: student,
        registro: student,
        tieneEnvio: evidencia && !permitir,
        encontradoEnvio: evidencia,
        permiteReenvio: permitir,
        envio: envio,
        estadoEnvio: estadoEnvio(envio),
        periodoId: result.periodoId || student && campoFlexible(student, ['periodoId']) || '',
        periodoLabel: result.periodoLabel || student && campoFlexible(student, ['periodoLabel', 'periodo']) || '',
        fuente: result.fuente || 'INDICES_RESPALDO_TITULOS_APP',
        duracionMs: Number(result.duracionMs || 0),
        cache: result.cache || false,
        indices: result.indices || null,
        mensaje: result.mensaje || ''
      };

      /* Antes de permitir el avance, consultar siempre Envios cuando el
         resumen no entregó el registro completo. Así también se recuperan
         aprobaciones recientes y períodos con formatos diferentes. */
      if (!salida.envio) {
        return consultarEnvioPorCedula(id, salida.periodoLabel || salida.periodoId)
          .then(function (directo) {
            if (directo.ok && directo.existe && directo.envio) {
              salida.envio = directo.envio;
              salida.encontradoEnvio = true;
              salida.tieneEnvio = !directo.permiteReenvio;
              salida.permiteReenvio = directo.permiteReenvio;
              salida.estadoEnvio = directo.estado || estadoEnvio(directo.envio);
              salida.fuente = 'ENVÍOS_RESPALDO_TITULOS_APP';
            }
            return salida;
          });
      }
      return salida;
    });
  }

  function consultarEnvioPorCedula(value, periodo) {
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
      {
        cedula: id,
        numeroIdentificacion: id,
        periodo: texto(periodo),
        periodoLabel: texto(periodo),
        periodoId: texto(periodo)
      },
      'GET'
    ).then(function (result) {
      var envio = extraerEnvio(result);
      var encontrado = si(campoFlexible(result, ['encontrado', 'existe', 'tieneEnvio', 'encontradoEnvio'])) || Boolean(envio);
      var permite = permiteReenvio(result, envio);
      return {
        ok: true,
        encontrado: encontrado && !permite,
        existe: encontrado,
        permiteReenvio: permite,
        cedula: id,
        envio: envio,
        estado: estadoEnvio(envio) || texto(campoFlexible(result, ['estado', 'estadoFinal'])).toUpperCase(),
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
    var periodo = data.periodo || data.periodoLabel || data.periodoId;

    return consultarEnvioPorCedula(data.cedula, periodo).then(function (previo) {
      if (!previo.ok) {
        throw previo.error || new Error(
          previo.mensaje || 'No se pudo verificar si ya existe un envío.'
        );
      }
      if (previo.encontrado && !previo.permiteReenvio) {
        var duplicado = new Error(
          'Tus propuestas ya fueron enviadas y están siendo revisadas por coordinación.'
        );
        duplicado.duplicado = true;
        duplicado.envio = previo.envio;
        throw duplicado;
      }
      return enviarProxy('ENVIO_ESTUDIANTE', data, 'POST');
    }).then(function (result) {
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
