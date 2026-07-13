/*
  Archivo: coordinador.sheets.service.js
  Ruta: coordinadores-mvp/js/coordinador.sheets.service.js

  Funciones principales:
  - Comunicarse con Google Sheets mediante Apps Script.
  - Listar coordinadores desde la hoja Coordinadores.
  - Listar envíos desde la hoja Envios.
  - Aprobar títulos y guardar resolución.
  - Devolver registros y respaldarlos en Devueltos.
  - Normalizar respuestas para que la UI no dependa de nombres exactos de columnas.
*/

(function (window) {
  'use strict';

  function obtenerConfig() {
    return window.CoordinadorMVPConfig || null;
  }

  function obtenerUtils() {
    return window.CoordinadorMVPUtils || null;
  }

  function validarDependencias() {
    return !!(obtenerConfig() && obtenerUtils());
  }

  function obtenerEndpoint() {
    var config = obtenerConfig();

    return config ? config.obtenerEndpoint() : '';
  }

  function enviarAccion(accion, payload) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var endpoint;
    var controller;
    var timeoutId;
    var body;

    if (!validarDependencias()) {
      return Promise.reject(new Error('Faltan módulos internos de configuración o utilidades.'));
    }

    endpoint = obtenerEndpoint();

    if (!endpoint) {
      return Promise.reject(new Error('No hay endpoint de Google Sheets configurado en coordinador.config.js.'));
    }

    body = {
      accion: accion,
      origen: config.obtener('app.origen', 'coordinadores-mvp'),
      version: config.obtener('app.version', '1.0.0'),
      fechaCliente: utils.fechaIso(),
      data: payload || {}
    };

    controller = crearAbortController();

    if (controller) {
      timeoutId = window.setTimeout(function () {
        controller.abort();
      }, config.obtener('sheets.timeoutMs', 45000));
    }

    return fetch(endpoint, {
      method: 'POST',
      mode: 'cors',
      cache: 'no-store',
      headers: {
        /*
          text/plain evita preflight en muchos escenarios de Apps Script.
          El Apps Script debe hacer JSON.parse(e.postData.contents).
        */
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    })
      .then(function (respuesta) {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        return leerRespuestaFetch(respuesta);
      })
      .catch(function (errorPost) {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        /*
          Fallback GET para pruebas simples.
          Es útil cuando el Apps Script está preparado para recibir parámetros por URL.
          Para acciones con datos largos puede no servir, pero ayuda en diagnóstico.
        */
        return enviarAccionGet(endpoint, body).catch(function () {
          throw errorPost;
        });
      });
  }

  function enviarAccionGet(endpoint, body) {
    var config = obtenerConfig();
    var controller;
    var timeoutId;
    var url;

    controller = crearAbortController();

    if (controller) {
      timeoutId = window.setTimeout(function () {
        controller.abort();
      }, config.obtener('sheets.timeoutMs', 45000));
    }

    url = endpoint +
      '?accion=' + encodeURIComponent(body.accion) +
      '&origen=' + encodeURIComponent(body.origen) +
      '&payload=' + encodeURIComponent(JSON.stringify(body.data || {})) +
      '&_t=' + encodeURIComponent(String(Date.now()));

    return fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    })
      .then(function (respuesta) {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        return leerRespuestaFetch(respuesta);
      })
      .catch(function (errorGet) {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }

        throw errorGet;
      });
  }

  function crearAbortController() {
    if (typeof window.AbortController !== 'function') {
      return null;
    }

    return new window.AbortController();
  }

  function leerRespuestaFetch(respuesta) {
    return respuesta.text().then(function (texto) {
      var data;

      if (!respuesta.ok) {
        throw new Error('Google Sheets respondió con estado HTTP ' + respuesta.status + '.');
      }

      if (!texto) {
        return {
          ok: true,
          mensaje: 'Respuesta vacía recibida.',
          data: null
        };
      }

      try {
        data = JSON.parse(texto);
      } catch (errorJson) {
        throw new Error('La respuesta de Google Sheets no es JSON válido: ' + texto.slice(0, 180));
      }

      if (data && data.ok === false) {
        throw new Error(data.mensaje || data.error || 'Apps Script devolvió error.');
      }

      return data;
    });
  }

  function probarConexion() {
    var config = obtenerConfig();

    return enviarAccion(config.obtenerAccion('ping'), {
      prueba: true
    }).then(function (respuesta) {
      return {
        ok: true,
        mensaje: respuesta.mensaje || 'Conexión correcta con Google Sheets.',
        respuesta: respuesta
      };
    });
  }

  function listarCoordinadores() {
    var config = obtenerConfig();

    return enviarAccion(config.obtenerAccion('listarCoordinadores'), {
      hoja: config.obtener('hojas.coordinadores')
    }).then(function (respuesta) {
      var lista = extraerLista(respuesta);
      var coordinadores = lista
        .map(normalizarCoordinador)
        .filter(function (coordinador) {
          return coordinador && coordinador.activo !== false && coordinador.nombre;
        });

      return coordinadores;
    });
  }

  function listarEnvios(opciones) {
    var config = obtenerConfig();

    opciones = opciones || {};

    return enviarAccion(config.obtenerAccion('listarEnvios'), {
      hoja: config.obtener('hojas.envios'),
      coordinador: opciones.coordinador || null,
      carreras: opciones.carreras || [],
      estado: opciones.estado || '',
      vista: opciones.vista || ''
    }).then(function (respuesta) {
      var lista = extraerLista(respuesta);

      return lista
        .map(normalizarEnvio)
        .filter(function (envio) {
          return envio && envio.cedula;
        });
    });
  }

  function aprobarEnvio(envio, resolucion) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var tituloFinal;
    var payload;

    envio = envio || {};
    resolucion = resolucion || {};

    tituloFinal = utils.limpiarTitulo(resolucion.tituloFinal);

    if (!tituloFinal || tituloFinal.length < config.obtener('revision.tituloMinimo', 8)) {
      return Promise.reject(new Error(config.obtener('textos.seleccionaTitulo')));
    }

    payload = {
      hojaEnvios: config.obtener('hojas.envios'),
      hojaRevisiones: config.obtener('hojas.revisiones'),
      id: envio.id || envio._clave || '',
      fila: envio.fila || envio.rowNumber || '',
      cedula: envio.cedula || '',
      periodo: envio.periodo || '',
      carrera: envio.carrera || '',
      nombres: envio.nombres || '',
      estadoAnterior: envio.estado || '',
      estadoNuevo: tituloFinal === utils.limpiarTitulo(resolucion.tituloOriginal)
        ? config.obtenerEstado('aprobado')
        : config.obtenerEstado('reemplazado'),
      tituloSeleccionadoNumero: resolucion.tituloSeleccionadoNumero || '',
      tituloOriginal: resolucion.tituloOriginal || '',
      tituloFinal: tituloFinal,
      comentarioCoordinador: utils.limpiarTextoMultilinea(resolucion.comentarioCoordinador),
      coordinador: resolucion.coordinador || null,
      fechaRevision: utils.fechaIso(),
      fechaRevisionLocal: utils.fechaLegible()
    };

    return enviarAccion(config.obtenerAccion('aprobarEnvio'), payload)
      .then(function (respuesta) {
        return {
          ok: true,
          mensaje: respuesta.mensaje || config.obtener('textos.aprobarOk'),
          respuesta: respuesta,
          payload: payload
        };
      });
  }

  function devolverEnvio(envio, resolucion) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var comentario;
    var payload;

    envio = envio || {};
    resolucion = resolucion || {};
    comentario = utils.limpiarTextoMultilinea(resolucion.comentarioCoordinador);

    if (
      config.obtener('revision.comentarioObligatorioAlDevolver', true) &&
      comentario.length < config.obtener('revision.comentarioMinimo', 4)
    ) {
      return Promise.reject(new Error(config.obtener('textos.comentarioDevolucion')));
    }

    payload = {
      hojaEnvios: config.obtener('hojas.envios'),
      hojaDevueltos: config.obtener('hojas.devueltos'),
      hojaRevisiones: config.obtener('hojas.revisiones'),
      id: envio.id || envio._clave || '',
      fila: envio.fila || envio.rowNumber || '',
      cedula: envio.cedula || '',
      periodo: envio.periodo || '',
      carrera: envio.carrera || '',
      nombres: envio.nombres || '',
      telegram: envio.telegram || '',
      estadoAnterior: envio.estado || '',
      estadoNuevo: config.obtenerEstado('devuelto'),
      titulo1: envio.titulo1 || '',
      titulo2: envio.titulo2 || '',
      titulo3: envio.titulo3 || '',
      tituloPreferido: envio.tituloPreferido || '',
      comentarioCoordinador: comentario,
      coordinador: resolucion.coordinador || null,
      fechaRevision: utils.fechaIso(),
      fechaRevisionLocal: utils.fechaLegible(),
      moverDevueltosAHojaDevueltos: config.obtener('revision.moverDevueltosAHojaDevueltos', true)
    };

    return enviarAccion(config.obtenerAccion('devolverEnvio'), payload)
      .then(function (respuesta) {
        return {
          ok: true,
          mensaje: respuesta.mensaje || config.obtener('textos.devolverOk'),
          respuesta: respuesta,
          payload: payload
        };
      });
  }

  function extraerLista(respuesta) {
    if (Array.isArray(respuesta)) {
      return respuesta;
    }

    if (!respuesta) {
      return [];
    }

    if (Array.isArray(respuesta.data)) {
      return respuesta.data;
    }

    if (Array.isArray(respuesta.registros)) {
      return respuesta.registros;
    }

    if (Array.isArray(respuesta.envios)) {
      return respuesta.envios;
    }

    if (Array.isArray(respuesta.coordinadores)) {
      return respuesta.coordinadores;
    }

    if (respuesta.data && Array.isArray(respuesta.data.registros)) {
      return respuesta.data.registros;
    }

    if (respuesta.data && Array.isArray(respuesta.data.envios)) {
      return respuesta.data.envios;
    }

    if (respuesta.data && Array.isArray(respuesta.data.coordinadores)) {
      return respuesta.data.coordinadores;
    }

    return [];
  }

  function normalizarCoordinador(fila, indice) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var nombre;
    var carreras;
    var activo;
    var id;

    fila = fila || {};

    nombre = utils.limpiarTexto(
      utils.obtenerCampoFlexible(fila, config.obtenerColumnas('coordinadores', 'nombre'), '')
    );

    carreras = utils.normalizarCarreras(
      utils.obtenerCampoFlexible(fila, config.obtenerColumnas('coordinadores', 'carreras'), '')
    );

    activo = utils.parseBoolean(
      utils.obtenerCampoFlexible(fila, config.obtenerColumnas('coordinadores', 'activo'), 'activo'),
      true
    );

    id = utils.normalizarClave(nombre || ('coordinador_' + indice));

    return {
      id: id,
      nombre: nombre,
      carreras: carreras,
      carrerasTexto: utils.carrerasComoTexto(carreras),
      activo: activo,
      raw: fila
    };
  }

  function normalizarEnvio(fila, indice) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var columnas = config.data.columnas.envios;
    var envio;
    var estado;

    fila = fila || {};

    estado = utils.normalizarEstado(
      utils.obtenerCampoFlexible(fila, columnas.estado, config.obtenerEstado('pendiente'))
    );

    envio = {
      id: utils.limpiarTexto(fila.id || fila.ID || fila._id || ''),
      fila: fila.fila || fila.rowNumber || fila._rowNumber || '',
      cedula: utils.limpiarCedula(utils.obtenerCampoFlexible(fila, columnas.cedula, '')),
      nombres: utils.limpiarTexto(utils.obtenerCampoFlexible(fila, columnas.nombres, '')),
      carrera: utils.limpiarTexto(utils.obtenerCampoFlexible(fila, columnas.carrera, '')),
      periodo: utils.limpiarTexto(utils.obtenerCampoFlexible(fila, columnas.periodo, '')),
      telegram: utils.limpiarTexto(utils.obtenerCampoFlexible(fila, columnas.telegram, '')),
      estado: estado || config.obtenerEstado('pendiente'),
      fechaEnvio: utils.limpiarTexto(utils.obtenerCampoFlexible(fila, columnas.fechaEnvio, '')),
      titulo1: utils.limpiarTitulo(utils.obtenerCampoFlexible(fila, columnas.titulo1, '')),
      titulo2: utils.limpiarTitulo(utils.obtenerCampoFlexible(fila, columnas.titulo2, '')),
      titulo3: utils.limpiarTitulo(utils.obtenerCampoFlexible(fila, columnas.titulo3, '')),
      tituloPreferido: utils.limpiarTexto(utils.obtenerCampoFlexible(fila, columnas.preferido, '')),
      tituloAprobado: utils.limpiarTitulo(utils.obtenerCampoFlexible(fila, columnas.tituloAprobado, '')),
      comentarioCoordinador: utils.limpiarTextoMultilinea(utils.obtenerCampoFlexible(fila, columnas.comentarioCoordinador, '')),
      coordinador: utils.limpiarTexto(utils.obtenerCampoFlexible(fila, columnas.coordinador, '')),
      fechaRevision: utils.limpiarTexto(utils.obtenerCampoFlexible(fila, columnas.fechaRevision, '')),
      raw: fila
    };

    envio._clave = envio.id || utils.construirClaveEnvio(envio) || ('envio_' + indice);

    if (!envio.id) {
      envio.id = envio._clave;
    }

    return envio;
  }

  window.CoordinadorMVPSheets = Object.freeze({
    enviarAccion: enviarAccion,
    probarConexion: probarConexion,
    listarCoordinadores: listarCoordinadores,
    listarEnvios: listarEnvios,
    aprobarEnvio: aprobarEnvio,
    devolverEnvio: devolverEnvio,
    normalizarCoordinador: normalizarCoordinador,
    normalizarEnvio: normalizarEnvio
  });
})(window);