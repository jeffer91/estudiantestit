/*
  Archivo: firebase.envios.service.js
  Ruta: estudiantes-mvp/js/firebase.envios.service.js
  Funciones principales:
  - Construir el registro final de titulación.
  - Guardar respaldo del envío en Firebase, colección titulos.
  - Usar como ID del documento únicamente la cédula del estudiante.
  - Guardar solo los campos requeridos para titulos.
  - Guardar logs del envío en Firebase, colección titulos_logs.
  - Marcar el envío como ENVIADO si el respaldo externo respondió OK.
  - Marcar el envío como PENDIENTE_SYNC si el respaldo externo falló.
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

  function guardarRespaldoEnviado(payload, resultadoSheets) {
    return guardarRespaldo(payload, resultadoSheets, 'ENVIADO');
  }

  function guardarPendienteSync(payload, errorSheets) {
    return guardarRespaldo(payload, {
      ok: false,
      mensaje: obtenerMensajeErrorSheets(errorSheets),
      error: obtenerMensajeErrorSheets(errorSheets)
    }, 'PENDIENTE_SYNC');
  }

  function guardarRespaldo(payload, resultadoSheets, estado) {
    var config = obtenerConfig();
    var firebase = obtenerFirebase();
    var utils = obtenerUtils();
    var coleccion;
    var tituloId;
    var data;

    if (!config || !firebase || !utils) {
      return Promise.reject(new Error('Faltan módulos base para guardar respaldo de envío.'));
    }

    payload = payload || {};
    resultadoSheets = resultadoSheets || {};
    estado = estado || (resultadoSheets.ok ? 'ENVIADO' : 'PENDIENTE_SYNC');

    tituloId = obtenerTituloId(payload);

    if (!tituloId) {
      return Promise.reject(new Error('No se pudo guardar el título porque falta la cédula del estudiante.'));
    }

    coleccion = config.obtenerColeccion('titulos') || 'titulos';
    data = construirDocumentoTitulo(payload, resultadoSheets, estado);

    return firebase.guardarDocumento(coleccion, tituloId, data, { merge: false })
      .then(function (resultadoFirebase) {
        return guardarLogEnvio(payload, resultadoSheets, estado)
          .then(function (resultadoLog) {
            return {
              ok: true,
              estado: estado,
              tituloId: tituloId,
              respaldoFirebase: resultadoFirebase,
              log: resultadoLog,
              mensaje: estado === 'ENVIADO'
                ? 'Envío respaldado correctamente en Firebase.'
                : 'El envío quedó pendiente de sincronización en Firebase.'
            };
          });
      });
  }

  function guardarLogEnvio(payload, resultadoSheets, estado) {
    var config = obtenerConfig();
    var firebase = obtenerFirebase();
    var coleccion;
    var data;

    if (!config || !firebase) {
      return Promise.reject(new Error('Faltan módulos base para guardar log del envío.'));
    }

    coleccion = config.obtenerColeccion('titulosLogs') || 'titulos_logs';
    data = construirDocumentoLog(payload, resultadoSheets, estado);

    return firebase.agregarDocumento(coleccion, data);
  }

  function construirDocumentoTitulo(payload, resultadoSheets, estado) {
    var firebase = obtenerFirebase();
    var utils = obtenerUtils();
    var datos = obtenerDatosPayload(payload);
    var estudiante = obtenerEstudiantePayload(payload);
    var titulosEnviados = normalizarTitulosEnviados(payload);
    var cedula;
    var estadoFinal;

    function obtenerTitulo(numero) {
      var encontrado = titulosEnviados.find(function (item) {
        return Number(item.numero) === Number(numero);
      });

      encontrado = encontrado || {};

      return utils.limpiarTitulo(primeroNoVacio([
        encontrado.tituloFinal,
        encontrado.titulo,
        encontrado.tituloSeleccionado,
        encontrado.tituloMejorado,
        datos['titulo' + numero],
        payload['titulo' + numero],
        datos['titulo_' + numero],
        payload['titulo_' + numero],
        datos['tituloFinal' + numero],
        payload['tituloFinal' + numero],
        datos['tituloFinal_' + numero],
        payload['tituloFinal_' + numero]
      ]));
    }

    cedula = utils.limpiarCedula(primeroNoVacio([
      estudiante.cedula,
      estudiante.numeroIdentificacion,
      estudiante.identificacion,
      estudiante.documento,
      datos.cedula,
      datos.numeroIdentificacion,
      datos.identificacion,
      datos.documento,
      payload.cedula,
      payload.numeroIdentificacion,
      payload.identificacion,
      payload.documento
    ]));

    estadoFinal = utils.limpiarTexto(estado || datos.estado || payload.estado || 'ENVIADO');

    return {
      cedula: cedula,
      titulo1: obtenerTitulo(1),
      titulo2: obtenerTitulo(2),
      titulo3: obtenerTitulo(3),
      fechaenviotitulos: firebase.serverTimestamp(),
      tituloaprobado: '',
      fecharespuestaprobado: '',
      estado: estadoFinal
    };
  }

  function construirDocumentoLog(payload, resultadoSheets, estado) {
    var config = obtenerConfig();
    var firebase = obtenerFirebase();
    var utils = obtenerUtils();
    var datos = obtenerDatosPayload(payload);
    var estudiante = obtenerEstudiantePayload(payload);
    var titulosEnviados = normalizarTitulosEnviados(payload);
    var preferidoNumero = obtenerPreferidoNumero(payload);
    var favorito = obtenerTituloPreferido(titulosEnviados, preferidoNumero);
    var tituloId = obtenerTituloId(payload);
    var cedula = utils.limpiarCedula(primeroNoVacio([
      estudiante.cedula,
      estudiante.numeroIdentificacion,
      datos.cedula,
      datos.numeroIdentificacion,
      payload.cedula,
      payload.numeroIdentificacion
    ]));

    return {
      accion: config.obtener('sheets.accionEnvio', 'ENVIO_ESTUDIANTE'),
      estado: estado || 'ENVIADO',

      cedula: cedula,
      nombres: utils.limpiarTexto(primeroNoVacio([
        estudiante.nombres,
        estudiante.nombreCompleto,
        datos.nombres,
        datos.estudiante,
        payload.nombres,
        payload.estudiante
      ])),
      carrera: utils.limpiarTexto(primeroNoVacio([
        estudiante.carrera,
        estudiante.nombreCarrera,
        datos.carrera,
        datos.nombreCarrera,
        payload.carrera,
        payload.nombreCarrera
      ])),

      periodoId: obtenerPeriodoId(payload),
      telegramUser: utils.limpiarTexto(primeroNoVacio([
        payload.telegramUser,
        payload.telegram,
        datos.telegramUser,
        datos.telegram,
        estudiante.contacto && estudiante.contacto.telegram
      ])),

      tituloId: tituloId,
      tituloPreferidoNumero: Number(favorito.numero || preferidoNumero || 0),
      tituloPreferidoTexto: favorito.tituloFinal || '',

      intentosUsados: Number(primeroNoVacio([
        payload.intentosUsados,
        datos.intentosUsados,
        1
      ])) || 1,

      maxIntentos: Number(primeroNoVacio([
        payload.maxIntentos,
        datos.maxIntentos,
        config.obtener('proceso.maxIntentos', 1)
      ])) || 1,

      sheetsOk: resultadoSheets && resultadoSheets.ok === true,
      sheetsMensaje: resultadoSheets ? resultadoSheets.mensaje || '' : '',
      sheetsError: resultadoSheets ? resultadoSheets.error || '' : '',

      origenCaptura: config.obtener('app.origenCaptura', 'estudiantes-mvp'),

      creadoEn: firebase.serverTimestamp(),
      actualizadoEn: firebase.serverTimestamp(),
      actualizadoEnLocal: utils.fechaIso()
    };
  }

  function normalizarTitulosEnviados(payload) {
    var utils = obtenerUtils();
    var datos = obtenerDatosPayload(payload);
    var propuestas = primeroNoVacio([
      payload.titulosEnviados,
      datos.titulosEnviados,
      payload.propuestas,
      datos.propuestas,
      payload.titulos,
      datos.titulos
    ]);
    var favoritoNumero = obtenerPreferidoNumero(payload);

    if (!Array.isArray(propuestas)) {
      propuestas = construirPropuestasDesdeTitulosPlanos(payload, datos);
    }

    if (!Array.isArray(propuestas)) {
      propuestas = [];
    }

    return propuestas.slice(0, 3).map(function (item, index) {
      var numero;
      var tituloFinal;

      item = item || {};

      if (typeof item === 'string') {
        item = {
          numero: index + 1,
          tituloFinal: item
        };
      }

      numero = Number(item.numero || item.id || index + 1);
      tituloFinal = utils.limpiarTitulo(primeroNoVacio([
        item.tituloFinal,
        item.titulo,
        item.tituloSeleccionado,
        item.tituloMejorado,
        item.texto,
        item.tituloGenerado,
        item.title
      ]));

      return {
        numero: numero,
        preferido: numero === favoritoNumero,

        tituloFinal: tituloFinal,
        temaGeneral: utils.limpiarTexto(primeroNoVacio([
          item.temaGeneral,
          item.tema
        ])),
        lugarContexto: utils.limpiarTexto(primeroNoVacio([
          item.lugarContexto,
          item.contexto,
          item.lugar
        ])),
        grupoEstudio: utils.limpiarTexto(primeroNoVacio([
          item.grupoEstudio,
          item.grupo,
          item.poblacion
        ])),
        problemaNecesidad: utils.limpiarTexto(primeroNoVacio([
          item.problemaNecesidad,
          item.problema,
          item.necesidad
        ])),
        objetivo: utils.limpiarTexto(primeroNoVacio([
          item.objetivo,
          item.objetivoGeneral
        ])),
        anioPeriodo: utils.limpiarTexto(primeroNoVacio([
          item.anioPeriodo,
          item.periodo,
          item.tiempo
        ])),

        sugerenciasIA: Array.isArray(item.sugerenciasIA) ? item.sugerenciasIA.slice(0, 3) : [],
        proveedorIA: utils.limpiarTexto(item.proveedorIA || ''),
        sugerenciaSeleccionadaNumero: Number(item.sugerenciaSeleccionadaNumero || 0),
        etapaIA: utils.limpiarTexto(item.etapaIA || '')
      };
    });
  }

  function construirPropuestasDesdeTitulosPlanos(payload, datos) {
    var lista = [];
    var i;
    var titulo;

    for (i = 1; i <= 3; i += 1) {
      titulo = primeroNoVacio([
        payload['titulo' + i],
        datos['titulo' + i],
        payload['titulo_' + i],
        datos['titulo_' + i],
        payload['tituloFinal' + i],
        datos['tituloFinal' + i],
        payload['tituloFinal_' + i],
        datos['tituloFinal_' + i]
      ]);

      if (titulo) {
        lista.push({
          numero: i,
          tituloFinal: titulo
        });
      }
    }

    return lista;
  }

  function obtenerTituloPreferido(titulosEnviados, preferidoNumero) {
    var numero = Number(preferidoNumero || 0);
    var encontrado;

    titulosEnviados = Array.isArray(titulosEnviados) ? titulosEnviados : [];

    encontrado = titulosEnviados.find(function (item) {
      return Number(item.numero) === numero;
    });

    if (encontrado) {
      return encontrado;
    }

    encontrado = titulosEnviados.find(function (item) {
      return item.preferido === true;
    });

    return encontrado || titulosEnviados[0] || {};
  }

  function obtenerTituloId(payload) {
    var utils = obtenerUtils();
    var datos = obtenerDatosPayload(payload);
    var estudiante = obtenerEstudiantePayload(payload);

    return utils.limpiarCedula(primeroNoVacio([
      estudiante.cedula,
      estudiante.numeroIdentificacion,
      estudiante.identificacion,
      estudiante.documento,
      datos.cedula,
      datos.numeroIdentificacion,
      datos.identificacion,
      datos.documento,
      payload.cedula,
      payload.numeroIdentificacion,
      payload.identificacion,
      payload.documento
    ]));
  }

  function obtenerPeriodoId(payload) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var datos = obtenerDatosPayload(payload);
    var estudiante = obtenerEstudiantePayload(payload);
    var fallback = config.obtenerPeriodoFallback();

    return utils.limpiarTexto(primeroNoVacio([
      payload.periodoId,
      datos.periodoId,
      estudiante.periodoId,
      fallback.periodoId
    ]));
  }

  function obtenerPeriodoLabel(payload) {
    var config = obtenerConfig();
    var utils = obtenerUtils();
    var datos = obtenerDatosPayload(payload);
    var estudiante = obtenerEstudiantePayload(payload);
    var fallback = config.obtenerPeriodoFallback();

    return utils.limpiarTexto(primeroNoVacio([
      payload.periodoLabel,
      datos.periodoLabel,
      payload.periodo,
      datos.periodo,
      estudiante.periodoLabel,
      estudiante.periodo,
      fallback.periodoLabel
    ]));
  }

  function obtenerPreferidoNumero(payload) {
    var datos = obtenerDatosPayload(payload);

    return Number(primeroNoVacio([
      payload.tituloPreferidoNumero,
      datos.tituloPreferidoNumero,
      payload.preferido,
      datos.preferido,
      payload.tituloPreferido,
      datos.tituloPreferido,
      0
    ])) || 0;
  }

  function obtenerDatosPayload(payload) {
    payload = payload || {};

    if (payload.datos && typeof payload.datos === 'object') {
      return payload.datos;
    }

    if (payload.data && typeof payload.data === 'object') {
      return payload.data;
    }

    if (payload.envio && typeof payload.envio === 'object') {
      return payload.envio;
    }

    return payload;
  }

  function obtenerEstudiantePayload(payload) {
    var datos = obtenerDatosPayload(payload);

    if (payload && payload.estudiante && typeof payload.estudiante === 'object') {
      return payload.estudiante;
    }

    if (datos && datos.estudianteData && typeof datos.estudianteData === 'object') {
      return datos.estudianteData;
    }

    if (datos && datos.estudianteObjeto && typeof datos.estudianteObjeto === 'object') {
      return datos.estudianteObjeto;
    }

    return {};
  }

  function primeroNoVacio(lista) {
    var i;
    var valor;

    lista = Array.isArray(lista) ? lista : [];

    for (i = 0; i < lista.length; i += 1) {
      valor = lista[i];

      if (valor === undefined || valor === null) {
        continue;
      }

      if (Array.isArray(valor)) {
        if (valor.length) {
          return valor;
        }

        continue;
      }

      if (typeof valor === 'object') {
        return valor;
      }

      if (String(valor).trim() !== '') {
        return valor;
      }
    }

    return '';
  }

  function obtenerMensajeErrorSheets(errorSheets) {
    var utils = obtenerUtils();

    if (!utils) {
      return String(errorSheets || 'No se pudo completar el respaldo externo.');
    }

    return utils.obtenerMensajeError(errorSheets, 'No se pudo completar el respaldo externo.');
  }

  window.EstudianteMVPFirebaseEnvios = Object.freeze({
    guardarRespaldoEnviado: guardarRespaldoEnviado,
    guardarPendienteSync: guardarPendienteSync,
    guardarRespaldo: guardarRespaldo,
    guardarLogEnvio: guardarLogEnvio,
    construirDocumentoTitulo: construirDocumentoTitulo,
    construirDocumentoLog: construirDocumentoLog,
    normalizarTitulosEnviados: normalizarTitulosEnviados,
    obtenerTituloId: obtenerTituloId
  });
})(window);