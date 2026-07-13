/*
  Archivo: sheets.service.js
  Ruta: estudiantes-mvp/js/sheets.service.js
  Funciones principales:
  - Leer configuración de Google Sheets / Apps Script desde Firebase.
  - Consultar si una cédula ya tiene envío registrado en Google Sheets.
  - Enviar el registro principal del estudiante a Google Sheets.
  - Probar conexión con Apps Script desde config.html.
  - Guardar o actualizar el endpoint de Apps Script en Firebase.
  - Entregar resultado claro para decidir si Firebase guarda ENVIADO o PENDIENTE_SYNC.
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

  function obtenerFirebaseEnvios() {
    return window.EstudianteMVPFirebaseEnvios || null;
  }

  function leerConfiguracion() {
    var config = obtenerConfig();
    var firebase = obtenerFirebase();
    var coleccion;
    var documento;

    if (!config || !firebase) {
      return Promise.reject(new Error('Faltan módulos base para leer configuración de Sheets.'));
    }

    coleccion = config.obtenerColeccion('appConfig') || 'app_config';
    documento = config.obtenerDocumento('sheetsConfig') || 'titulos_sheets';

    return firebase.leerDocumento(coleccion, documento)
      .then(function (data) {
        data = data || {};

        return normalizarConfiguracionSheets(data);
      });
  }

  function guardarConfiguracion(endpoint, opciones) {
    var config = obtenerConfig();
    var firebase = obtenerFirebase();
    var utils = obtenerUtils();
    var coleccion;
    var documento;
    var endpointLimpio;
    var data;

    opciones = opciones || {};

    if (!config || !firebase || !utils) {
      return Promise.reject(new Error('Faltan módulos base para guardar configuración de Sheets.'));
    }

    endpointLimpio = utils.limpiarTexto(endpoint);

    if (!endpointLimpio) {
      return Promise.reject(new Error('Ingresa el endpoint de Apps Script.'));
    }

    coleccion = config.obtenerColeccion('appConfig') || 'app_config';
    documento = config.obtenerDocumento('sheetsConfig') || 'titulos_sheets';

    data = {
      endpoint: endpointLimpio,
      url: endpointLimpio,
      activo: opciones.activo !== false,
      nombre: opciones.nombre || 'Google Sheets Titulación',
      actualizadoEnLocal: utils.fechaIso(),
      actualizadoEn: firebase.serverTimestamp()
    };

    return firebase.guardarDocumento(coleccion, documento, data, { merge: true })
      .then(function (resultado) {
        resultado.configuracion = normalizarConfiguracionSheets(data);
        return resultado;
      });
  }

  function consultarEnvioPorCedula(cedula) {
    var utils = obtenerUtils();
    var cedulaLimpia = limpiarCedulaLocal(cedula);

    if (!cedulaLimpia) {
      return Promise.resolve({
        ok: false,
        encontrado: false,
        mensaje: 'No se recibió una cédula válida.'
      });
    }

    return leerConfiguracion()
      .then(function (configSheets) {
        if (!configSheets.activo || !configSheets.endpoint) {
          return {
            ok: false,
            encontrado: false,
            mensaje: 'Consulta externa no disponible.'
          };
        }

        return enviarPost(configSheets.endpoint, {
          accion: 'CONSULTAR_ENVIO_CEDULA',
          tipo: 'CONSULTAR_ENVIO_CEDULA',
          consultarEnvio: true,
          cedula: cedulaLimpia,
          numeroIdentificacion: cedulaLimpia,
          fechaCliente: utils && typeof utils.fechaIso === 'function'
            ? utils.fechaIso()
            : new Date().toISOString()
        });
      })
      .then(function (respuesta) {
        respuesta = respuesta || {};

        return {
          ok: respuesta.ok !== false,
          encontrado: respuesta.encontrado === true,
          cedula: respuesta.cedula || cedulaLimpia,
          envio: respuesta.envio || null,
          mensaje: respuesta.mensaje || ''
        };
      })
      .catch(function (error) {
        return {
          ok: false,
          encontrado: false,
          cedula: cedulaLimpia,
          error: error,
          mensaje: error && error.message ? error.message : 'No se pudo consultar el envío previo.'
        };
      });
  }

  function enviarEnvio(payload) {
    return leerConfiguracion()
      .then(function (configSheets) {
        if (!configSheets.activo) {
          throw new Error('La integración con Google Sheets está inactiva.');
        }

        if (!configSheets.endpoint) {
          throw new Error('No existe endpoint de Apps Script configurado.');
        }

        return enviarPost(configSheets.endpoint, construirPayloadSheets(payload));
      })
      .then(function (respuesta) {
        return normalizarRespuestaSheets(respuesta, payload);
      });
  }

  function probarConexion() {
    var config = obtenerConfig();

    return leerConfiguracion()
      .then(function (configSheets) {
        if (!configSheets.endpoint) {
          throw new Error('No existe endpoint de Apps Script configurado.');
        }

        return enviarPost(configSheets.endpoint, {
          accion: config.obtener('sheets.accionPing', 'PING'),
          tipo: 'PING',
          origenCaptura: config.obtener('app.origenCaptura', 'estudiantes-mvp'),
          fechaLocal: new Date().toISOString()
        });
      })
      .then(function (respuesta) {
        return {
          ok: true,
          respuesta: respuesta,
          mensaje: respuesta && respuesta.mensaje
            ? respuesta.mensaje
            : 'Apps Script respondió correctamente.'
        };
      });
  }

  function construirPayloadSheets(payload) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var firebaseEnvios = obtenerFirebaseEnvios();
    var estudiante;
    var titulosEnviados;
    var periodoId;
    var periodoLabel;
    var cedula;
    var nombres;
    var carrera;
    var codigoCarrera;
    var sede;
    var modalidad;
    var telegram;
    var favorito;
    var tituloPreferidoNumero;
    var tituloPreferidoTexto;
    var fechaCliente;
    var tituloId;
    var datos;

    payload = payload || {};
    estudiante = payload.estudiante || {};

    if (firebaseEnvios && typeof firebaseEnvios.normalizarTitulosEnviados === 'function') {
      titulosEnviados = firebaseEnvios.normalizarTitulosEnviados(payload);
    } else {
      titulosEnviados = payload.titulosEnviados || payload.propuestas || [];
    }

    titulosEnviados = Array.isArray(titulosEnviados) ? titulosEnviados : [];

    periodoId = limpiarTextoLocal(
      payload.periodoId ||
      estudiante.periodoId ||
      config.obtener('proceso.periodoIdFallback', '')
    );

    periodoLabel = limpiarTextoLocal(
      payload.periodoLabel ||
      estudiante.periodoLabel ||
      payload.periodo ||
      estudiante.periodo ||
      config.obtener('proceso.periodoLabelFallback', '')
    );

    cedula = limpiarCedulaLocal(
      estudiante.cedula ||
      estudiante.numeroIdentificacion ||
      estudiante.identificacion ||
      estudiante.documento ||
      payload.cedula ||
      payload.numeroIdentificacion ||
      payload.identificacion ||
      payload.documento ||
      ''
    );

    nombres = limpiarTextoLocal(
      estudiante.nombres ||
      estudiante.nombreCompleto ||
      estudiante.estudiante ||
      payload.nombres ||
      payload.nombreCompleto ||
      payload.estudiante ||
      ''
    );

    carrera = limpiarTextoLocal(
      estudiante.carrera ||
      estudiante.nombreCarrera ||
      estudiante.NombreCarrera ||
      payload.carrera ||
      payload.nombreCarrera ||
      payload.NombreCarrera ||
      ''
    );

    codigoCarrera = limpiarTextoLocal(
      estudiante.codigoCarrera ||
      estudiante.CodigoCarrera ||
      payload.codigoCarrera ||
      payload.CodigoCarrera ||
      ''
    );

    sede = limpiarTextoLocal(
      estudiante.sede ||
      estudiante.Sede ||
      payload.sede ||
      payload.Sede ||
      ''
    );

    modalidad = limpiarTextoLocal(
      estudiante.modalidad ||
      estudiante.Modalidad ||
      estudiante.modalidadDetectada ||
      payload.modalidad ||
      payload.Modalidad ||
      payload.modalidadDetectada ||
      ''
    );

    telegram = limpiarTextoLocal(
      payload.telegramUser ||
      payload.telegram ||
      estudiante.telegram ||
      estudiante.telegramUser ||
      ''
    );

    favorito = obtenerTituloPreferidoLocal(titulosEnviados, payload.tituloPreferidoNumero);
    tituloPreferidoNumero = Number(favorito.numero || payload.tituloPreferidoNumero || 0);
    tituloPreferidoTexto = obtenerTextoTitulo(favorito) || limpiarTextoLocal(payload.tituloPreferido || payload.tituloPreferidoTexto || '');

    fechaCliente = utils && typeof utils.fechaIso === 'function'
      ? utils.fechaIso()
      : new Date().toISOString();

    tituloId = utils && typeof utils.construirTituloId === 'function'
      ? utils.construirTituloId(periodoId, cedula)
      : construirTituloIdLocal(periodoId, cedula);

    datos = {
      fechaEnvio: fechaCliente,
      fechaCliente: fechaCliente,

      idRegistro: tituloId,
      tituloId: tituloId,
      codigoRegistro: tituloId,

      cedula: cedula,
      numeroIdentificacion: cedula,
      identificacion: cedula,
      documento: cedula,

      nombres: nombres,
      estudiante: nombres,
      nombreEstudiante: nombres,

      carrera: carrera,
      nombreCarrera: carrera,
      NombreCarrera: carrera,
      codigoCarrera: codigoCarrera,

      sede: sede,
      modalidad: modalidad,
      modalidadDetectada: modalidad,

      periodo: periodoLabel || periodoId,
      periodoId: periodoId,
      periodoLabel: periodoLabel,
      periodoActivo: periodoLabel || periodoId,

      telegram: telegram,
      telegramUser: telegram,

      titulo1: obtenerTituloPorNumero(titulosEnviados, 1),
      titulo2: obtenerTituloPorNumero(titulosEnviados, 2),
      titulo3: obtenerTituloPorNumero(titulosEnviados, 3),

      preferido: tituloPreferidoNumero,
      tituloPreferidoNumero: tituloPreferidoNumero,
      tituloPreferido: tituloPreferidoTexto,
      tituloPreferidoTexto: tituloPreferidoTexto,

      propuestas: titulosEnviados,
      titulosEnviados: titulosEnviados,
      titulos: titulosEnviados,

      estadoFirebase: 'ENVIADO',
      estadoGoogleSheets: 'RESPALDADO',
      estadoFinal: 'PENDIENTE_REVISION',
      estadoProceso: 'PENDIENTE_REVISION',
      observacion: '',

      origenCaptura: config.obtener('app.origenCaptura', 'estudiantes-mvp'),
      creadoEnLocal: payload.creadoEnLocal || '',
      enviadoEnLocal: payload.enviadoEnLocal || fechaCliente,
      prueba: false
    };

    return {
      accion: config.obtener('sheets.accionEnvio', 'ENVIO_ESTUDIANTE'),
      tipo: 'ENVIO',
      fechaCliente: fechaCliente,
      origenCaptura: config.obtener('app.origenCaptura', 'estudiantes-mvp'),

      idRegistro: tituloId,
      tituloId: tituloId,

      datos: datos,

      cedula: datos.cedula,
      numeroIdentificacion: datos.numeroIdentificacion,
      nombres: datos.nombres,
      estudiante: datos.estudiante,
      carrera: datos.carrera,
      nombreCarrera: datos.nombreCarrera,
      periodo: datos.periodo,
      periodoId: datos.periodoId,
      periodoLabel: datos.periodoLabel,
      telegram: datos.telegram,
      telegramUser: datos.telegramUser,
      titulo1: datos.titulo1,
      titulo2: datos.titulo2,
      titulo3: datos.titulo3,
      preferido: datos.preferido,
      tituloPreferidoNumero: datos.tituloPreferidoNumero,
      tituloPreferidoTexto: datos.tituloPreferidoTexto,
      propuestas: datos.propuestas,
      titulosEnviados: datos.titulosEnviados
    };
  }

  function obtenerTituloPorNumero(titulosEnviados, numero) {
    var lista = Array.isArray(titulosEnviados) ? titulosEnviados : [];
    var encontrado;

    encontrado = lista.find(function (item, index) {
      return Number(item.numero || item.id || index + 1) === Number(numero);
    });

    return obtenerTextoTitulo(encontrado || lista[numero - 1] || {});
  }

  function obtenerTextoTitulo(item) {
    if (typeof item === 'string') {
      return limpiarTextoLocal(item);
    }

    item = item || {};

    return limpiarTextoLocal(
      item.tituloFinal ||
      item.titulo ||
      item.tituloMejorado ||
      item.texto ||
      item.tituloGenerado ||
      item.title ||
      ''
    );
  }

  function enviarPost(endpoint, data) {
    var config = obtenerConfig();
    var timeoutMs = Number(config.obtener('sheets.timeoutMs', 45000));
    var controller = null;
    var timer = null;
    var opciones;

    if (window.AbortController) {
      controller = new AbortController();
      timer = setTimeout(function () {
        controller.abort();
      }, timeoutMs);
    }

    opciones = {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(data || {})
    };

    if (controller) {
      opciones.signal = controller.signal;
    }

    return fetch(endpoint, opciones)
      .then(function (response) {
        if (timer) {
          clearTimeout(timer);
        }

        return response.text()
          .then(function (texto) {
            var json = intentarParsearJson(texto);

            if (!response.ok) {
              throw new Error(
                json && json.mensaje
                  ? json.mensaje
                  : 'Apps Script respondió con error HTTP ' + response.status + '.'
              );
            }

            return json || {
              ok: true,
              mensaje: texto || 'Respuesta recibida desde Apps Script.',
              rawText: texto
            };
          });
      })
      .catch(function (error) {
        if (timer) {
          clearTimeout(timer);
        }

        throw error;
      });
  }

  function normalizarConfiguracionSheets(data) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var endpointFallback = config.obtener('sheets.endpointFallback', '');

    data = data || {};

    return {
      activo: normalizarBooleano(data.activo !== undefined ? data.activo : data.active !== undefined ? data.active : true),
      endpoint: utils.limpiarTexto(data.endpoint || data.url || data.webAppUrl || data.appsScriptUrl || endpointFallback),
      nombre: utils.limpiarTexto(data.nombre || data.name || 'Google Sheets Titulación'),
      raw: data
    };
  }

  function normalizarRespuestaSheets(respuesta, payload) {
    var firebaseEnvios = obtenerFirebaseEnvios();
    var tituloId = firebaseEnvios && typeof firebaseEnvios.obtenerTituloId === 'function'
      ? firebaseEnvios.obtenerTituloId(payload || {})
      : '';

    respuesta = respuesta || {};

    return {
      ok: respuesta.ok !== false,
      idRegistro: respuesta.idRegistro || respuesta.tituloId || tituloId,
      mensaje: respuesta.mensaje || respuesta.message || 'Envío guardado correctamente.',
      respuesta: respuesta,
      raw: respuesta
    };
  }

  function intentarParsearJson(texto) {
    try {
      return JSON.parse(texto);
    } catch (error) {
      return null;
    }
  }

  function normalizarBooleano(valor) {
    if (valor === true) return true;
    if (valor === false) return false;

    if (typeof valor === 'number') {
      return valor === 1;
    }

    valor = String(valor == null ? '' : valor).toLowerCase().trim();

    if (valor === 'false' || valor === 'inactivo' || valor === '0' || valor === 'no') {
      return false;
    }

    return true;
  }

  function obtenerTituloPreferidoLocal(titulosEnviados, preferidoNumero) {
    var numero = Number(preferidoNumero || 0);
    var encontrado;

    titulosEnviados = Array.isArray(titulosEnviados) ? titulosEnviados : [];

    encontrado = titulosEnviados.find(function (item) {
      return Number(item.numero) === numero;
    });

    return encontrado || titulosEnviados[0] || {};
  }

  function limpiarTextoLocal(valor) {
    var utils = obtenerUtils();

    if (utils && typeof utils.limpiarTexto === 'function') {
      return utils.limpiarTexto(valor);
    }

    return String(valor == null ? '' : valor)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function limpiarCedulaLocal(valor) {
    var utils = obtenerUtils();

    if (utils && typeof utils.limpiarCedula === 'function') {
      return utils.limpiarCedula(valor);
    }

    return String(valor == null ? '' : valor)
      .replace(/[^\d]/g, '')
      .trim();
  }

  function construirTituloIdLocal(periodoId, cedula) {
    periodoId = limpiarTextoLocal(periodoId) || 'sin_periodo';
    cedula = limpiarCedulaLocal(cedula) || 'sin_cedula';

    return periodoId + '__' + cedula;
  }

  window.EstudianteMVPSheets = Object.freeze({
    leerConfiguracion: leerConfiguracion,
    guardarConfiguracion: guardarConfiguracion,
    consultarEnvioPorCedula: consultarEnvioPorCedula,
    enviarEnvio: enviarEnvio,
    probarConexion: probarConexion,
    construirPayloadSheets: construirPayloadSheets
  });
})(window);