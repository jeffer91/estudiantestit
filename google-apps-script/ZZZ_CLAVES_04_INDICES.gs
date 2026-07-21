/*
 * Índices rápidos para el ingreso de estudiantes.
 *
 * Este archivo pertenece al proyecto Apps Script "Claves Central".
 * REQUISITOS_BDLOCAL_SYNC se mantiene estrictamente en solo lectura.
 * Los índices se guardan dentro de RESPALDO TITULOS APP.
 */

var CLAVES_INDICE_ESTUDIANTES = 'IndiceEstudiantes';
var CLAVES_INDICE_ENVIOS = 'IndiceEnvios';
var CLAVES_INDICE_ESTUDIANTES_HEADERS = [
  'cedula',
  'nombres',
  'codigoCarrera',
  'nombreCarrera',
  'periodoId',
  'periodoLabel',
  'sede',
  'modalidad',
  'estadoMatricula',
  'correoInstitucional',
  'correoPersonal',
  'celular',
  'actualizadoEn',
  'fuente'
];
var CLAVES_INDICE_ENVIOS_HEADERS = [
  'cedula',
  'periodoId',
  'periodoLabel',
  'envioId',
  'estado',
  'permitirReenvio',
  'fechaEnvio',
  'actualizadoEn',
  'titulo1',
  'titulo2',
  'titulo3'
];

/*
 * Sustituye el router anterior y mantiene todas las acciones existentes.
 * El nombre ZZZ garantiza que esta asignación quede al final del proyecto.
 */
doPost = function(e) {
  try {
    var input = clavesPayload_(e);
    clavesValidarAcceso_(input.acceso || input.token || input.gatewayToken);

    var accion = clavesAccion_(input.accion || input.action || input.tipo);
    var datos = input.datos && typeof input.datos === 'object' ? input.datos : {};
    var respuesta;

    if (accion === 'LISTAR_SERVICIOS_PUBLICOS') {
      respuesta = clavesServiciosPublicos_();
    } else if (accion === 'LISTAR_SERVICIOS_ADMIN') {
      respuesta = clavesServiciosAdmin_();
    } else if (accion === 'GUARDAR_SERVICIO') {
      respuesta = clavesGuardarServicio_(datos.servicio || datos);
    } else if (accion === 'EJECUTAR_SERVICIO') {
      respuesta = clavesEjecutarServicio_(datos);
    } else if (accion === 'CONSULTAR_ESTUDIANTE_REQUISITOS') {
      respuesta = clavesConsultarEstudianteRequisitos_(datos);
    } else if (accion === 'CONSULTAR_ACCESO_ESTUDIANTE') {
      respuesta = clavesConsultarAccesoEstudianteIndice_(datos);
    } else if (accion === 'SINCRONIZAR_INDICES_TITULOS') {
      respuesta = clavesSincronizarIndicesTitulos_();
    } else if (accion === 'SINCRONIZAR_INDICE_ESTUDIANTES') {
      respuesta = clavesSincronizarIndiceEstudiantes_();
    } else if (accion === 'SINCRONIZAR_INDICE_ENVIOS') {
      respuesta = clavesSincronizarIndiceEnvios_();
    } else if (accion === 'ESTADO_INDICES_TITULOS') {
      respuesta = clavesEstadoIndicesTitulos_();
    } else if (accion === 'LISTAR_PROVEEDORES_IA_PUBLICOS') {
      respuesta = clavesListarIA_(false);
    } else if (accion === 'LISTAR_PROVEEDORES_IA_ADMIN') {
      respuesta = clavesListarIA_(true);
    } else if (accion === 'GENERAR_IA') {
      respuesta = clavesGenerarIA_(datos);
    } else if (accion === 'GUARDAR_PROVEEDOR_IA') {
      respuesta = clavesGuardarIA_(datos.proveedor || datos);
    } else if (accion === 'CAMBIAR_ESTADO_PROVEEDOR_IA') {
      respuesta = clavesCambiarEstadoIA_(datos.providerId || datos.id, datos.activo === true);
    } else {
      throw new Error('Acción no reconocida: ' + accion);
    }

    return clavesJson_(respuesta);
  } catch (error) {
    try {
      clavesLog_('ERROR', 'ERROR', error.message || String(error));
    } catch (ignorado) {}

    return clavesJson_({
      ok: false,
      mensaje: error.message || String(error),
      error: error.message || String(error),
      version: CLAVES_VERSION
    });
  }
};

/* Funciones visibles en el selector de Apps Script. */
function prepararIndicesTitulos() {
  return clavesPrepararIndicesTitulos_();
}

function sincronizarIndiceEstudiantes() {
  return clavesSincronizarIndiceEstudiantes_();
}

function sincronizarIndiceEnvios() {
  return clavesSincronizarIndiceEnvios_();
}

function sincronizarIndicesTitulos() {
  return clavesSincronizarIndicesTitulos_();
}

function instalarTriggersIndicesTitulos() {
  return clavesInstalarTriggersIndicesTitulos_();
}

function estadoIndicesTitulos() {
  return clavesEstadoIndicesTitulos_();
}

function clavesPrepararIndicesTitulos_() {
  var titulos = clavesIndiceServicioConSpreadsheet_('TITULOS');
  var ss = SpreadsheetApp.openById(titulos.spreadsheetId);

  clavesIndiceAsegurarHoja_(
    ss,
    CLAVES_INDICE_ESTUDIANTES,
    CLAVES_INDICE_ESTUDIANTES_HEADERS
  );
  clavesIndiceAsegurarHoja_(
    ss,
    CLAVES_INDICE_ENVIOS,
    CLAVES_INDICE_ENVIOS_HEADERS
  );

  clavesGuardarConfig_(
    'INDICES_TITULOS_PREPARADOS',
    'TRUE',
    'Índices rápidos creados en RESPALDO TITULOS APP.'
  );

  return {
    ok: true,
    spreadsheetId: titulos.spreadsheetId,
    hojas: [CLAVES_INDICE_ESTUDIANTES, CLAVES_INDICE_ENVIOS]
  };
}

function clavesSincronizarIndicesTitulos_() {
  var estudiantes = clavesSincronizarIndiceEstudiantes_();
  var envios = clavesSincronizarIndiceEnvios_();

  return {
    ok: true,
    estudiantes: estudiantes,
    envios: envios,
    actualizadoEn: new Date().toISOString()
  };
}

function clavesSincronizarIndiceEstudiantes_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Ya existe una sincronización de índices en ejecución.');
  }

  try {
    var requisitos = clavesIndiceServicioConSpreadsheet_('REQUISITOS');
    var titulos = clavesIndiceServicioConSpreadsheet_('TITULOS');
    var origen = SpreadsheetApp.openById(requisitos.spreadsheetId);
    var destino = SpreadsheetApp.openById(titulos.spreadsheetId);
    var estudiantes = clavesIndiceLeerHoja_(origen, 'Estudiantes');
    var matriculas = clavesIndiceLeerHoja_(origen, 'MatriculasPeriodo');
    var periodos = clavesIndiceLeerHoja_(origen, 'Periodos');
    var basePorCedula = {};
    var periodoPorId = {};
    var mejorPorCedula = {};
    var ahora = new Date().toISOString();

    estudiantes.forEach(function(item) {
      var cedula = clavesIndiceCedula_(
        item.cedula || item.numeroIdentificacion || item.NumeroIdentificacion
      );
      if (!cedula) return;
      basePorCedula[cedula] = clavesIndiceCombinar_(basePorCedula[cedula] || {}, item);
    });

    periodos.forEach(function(item) {
      var id = clavesTexto_(
        item.periodoId || item.periodoCanonicoId || item.id || item.value
      );
      if (!id) return;
      periodoPorId[id] = clavesTexto_(
        item.periodoLabel || item.periodoCanonicoLabel || item.label || item.nombre || id
      );
    });

    matriculas.forEach(function(item) {
      var cedula = clavesIndiceCedula_(
        item.cedula || item.numeroIdentificacion || item.NumeroIdentificacion
      );
      var actual;
      if (!cedula) return;

      actual = clavesIndiceCombinar_({}, basePorCedula[cedula] || {});
      actual = clavesIndiceCombinar_(actual, item);
      actual.cedula = cedula;
      actual.numeroIdentificacion = cedula;

      if (
        !mejorPorCedula[cedula] ||
        clavesIndiceCompararMatriculas_(actual, mejorPorCedula[cedula]) < 0
      ) {
        mejorPorCedula[cedula] = actual;
      }
    });

    Object.keys(basePorCedula).forEach(function(cedula) {
      if (mejorPorCedula[cedula]) return;
      var base = clavesIndiceCombinar_({}, basePorCedula[cedula]);
      base.cedula = cedula;
      base.numeroIdentificacion = cedula;
      mejorPorCedula[cedula] = base;
    });

    var filas = Object.keys(mejorPorCedula)
      .sort()
      .map(function(cedula) {
        var item = mejorPorCedula[cedula] || {};
        var periodoId = clavesTexto_(
          item.periodoId || item.periodId || item.periodoCanonicoId || item.ultimoPeriodoId
        );
        var periodoLabel = clavesTexto_(
          item.periodoLabel || item.periodoCanonicoLabel || periodoPorId[periodoId] || periodoId
        );

        return [
          cedula,
          clavesTexto_(item.Nombres || item.nombres || item.nombreCompleto || item.nombre),
          clavesTexto_(item.CodigoCarrera || item.codigoCarrera),
          clavesTexto_(item.NombreCarrera || item.nombreCarrera || item.carrera),
          periodoId,
          periodoLabel,
          clavesTexto_(item.Sede || item.sede),
          clavesTexto_(item.Modalidad || item.modalidad),
          clavesTexto_(item.estadoMatricula || item.EstadoMatricula || 'ACTIVO'),
          clavesTexto_(item.CorreoInstitucional || item.correoInstitucional),
          clavesTexto_(item.CorreoPersonal || item.correoPersonal),
          clavesTexto_(item.Celular || item.celular),
          ahora,
          'REQUISITOS_BDLOCAL_SYNC'
        ];
      })
      .filter(function(fila) {
        return fila[0] && fila[1] && fila[3];
      });

    var hoja = clavesIndiceAsegurarHoja_(
      destino,
      CLAVES_INDICE_ESTUDIANTES,
      CLAVES_INDICE_ESTUDIANTES_HEADERS
    );
    clavesIndiceReemplazarDatos_(hoja, CLAVES_INDICE_ESTUDIANTES_HEADERS, filas);

    clavesGuardarConfig_(
      'INDICE_ESTUDIANTES_ACTUALIZADO_EN',
      ahora,
      'Última sincronización del índice de estudiantes.'
    );
    clavesGuardarConfig_(
      'INDICE_ESTUDIANTES_TOTAL',
      String(filas.length),
      'Total de estudiantes indexados.'
    );
    CacheService.getScriptCache().removeAll(['indice_estado_titulos']);

    return {
      ok: true,
      hoja: CLAVES_INDICE_ESTUDIANTES,
      total: filas.length,
      actualizadoEn: ahora,
      fuente: 'REQUISITOS_BDLOCAL_SYNC',
      soloLecturaOrigen: true
    };
  } finally {
    lock.releaseLock();
  }
}

function clavesSincronizarIndiceEnvios_() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw new Error('Ya existe una sincronización de índices en ejecución.');
  }

  try {
    var titulos = clavesIndiceServicioConSpreadsheet_('TITULOS');
    var ss = SpreadsheetApp.openById(titulos.spreadsheetId);
    var envios = clavesIndiceLeerHoja_(ss, 'Envios');
    var mejorPorCedula = {};
    var ahora = new Date().toISOString();

    envios.forEach(function(item) {
      var cedula = clavesIndiceCedula_(
        item.cedula || item.numeroIdentificacion || item.NumeroIdentificacion
      );
      if (!cedula) return;

      var normalizado = clavesIndiceCombinar_({}, item);
      normalizado.cedula = cedula;

      if (
        !mejorPorCedula[cedula] ||
        clavesIndiceFechaEnvio_(normalizado) > clavesIndiceFechaEnvio_(mejorPorCedula[cedula])
      ) {
        mejorPorCedula[cedula] = normalizado;
      }
    });

    var filas = Object.keys(mejorPorCedula)
      .sort()
      .map(function(cedula) {
        var item = mejorPorCedula[cedula] || {};
        var periodoId = clavesTexto_(item.periodoId || item.periodo || item.PeriodoId);
        var estado = clavesTexto_(
          item.estado || item.estadoFinal || item.estadoProceso || item.estadoGoogleSheets
        ).toUpperCase();
        var permitirReenvio = clavesIndiceBooleano_(item.permitirReenvio);

        return [
          cedula,
          periodoId,
          clavesTexto_(item.periodoLabel || item.periodo || periodoId),
          clavesTexto_(item.envioId || item.idRegistro || item.tituloId || item.codigoRegistro || item.id),
          estado || 'PENDIENTE_REVISION',
          permitirReenvio,
          clavesTexto_(item.fechaEnvio || item.enviadoEnLocal || item.fechaCliente || item.creadoEn),
          ahora,
          clavesTexto_(item.titulo1),
          clavesTexto_(item.titulo2),
          clavesTexto_(item.titulo3)
        ];
      });

    var hoja = clavesIndiceAsegurarHoja_(
      ss,
      CLAVES_INDICE_ENVIOS,
      CLAVES_INDICE_ENVIOS_HEADERS
    );
    clavesIndiceReemplazarDatos_(hoja, CLAVES_INDICE_ENVIOS_HEADERS, filas);

    clavesGuardarConfig_(
      'INDICE_ENVIOS_ACTUALIZADO_EN',
      ahora,
      'Última sincronización del índice de envíos.'
    );
    clavesGuardarConfig_(
      'INDICE_ENVIOS_TOTAL',
      String(filas.length),
      'Total de envíos indexados.'
    );
    CacheService.getScriptCache().removeAll(['indice_estado_titulos']);

    return {
      ok: true,
      hoja: CLAVES_INDICE_ENVIOS,
      total: filas.length,
      actualizadoEn: ahora,
      fuente: 'RESPALDO TITULOS APP'
    };
  } finally {
    lock.releaseLock();
  }
}

function clavesConsultarAccesoEstudianteIndice_(datos) {
  datos = datos || {};

  var inicio = new Date().getTime();
  var cedula = clavesIndiceCedula_(
    datos.cedula || datos.numeroIdentificacion || datos.identificacion
  );
  if (!cedula) throw new Error('No se recibió una cédula válida.');

  var cache = CacheService.getScriptCache();
  var cacheKey = 'acceso_estudiante_indice_v1_' + cedula;
  var cacheRaw = cache.get(cacheKey);
  if (cacheRaw) {
    try {
      var cached = JSON.parse(cacheRaw);
      cached.cache = true;
      cached.duracionMs = new Date().getTime() - inicio;
      return cached;
    } catch (ignorado) {}
  }

  var titulos = clavesIndiceServicioConSpreadsheet_('TITULOS');
  var ss = SpreadsheetApp.openById(titulos.spreadsheetId);
  var estudiante = clavesIndiceBuscarExacto_(
    ss,
    CLAVES_INDICE_ESTUDIANTES,
    'cedula',
    cedula
  );

  if (!estudiante) {
    var noEncontrado = {
      ok: true,
      encontrado: false,
      existe: false,
      cedula: cedula,
      tieneEnvio: false,
      estudiante: null,
      envio: null,
      fuente: 'INDICE_ESTUDIANTES',
      duracionMs: new Date().getTime() - inicio,
      mensaje: 'No encontramos un estudiante con esa cédula en el índice académico.'
    };
    cache.put(cacheKey, JSON.stringify(noEncontrado), 60);
    return noEncontrado;
  }

  var envio = clavesIndiceBuscarExacto_(
    ss,
    CLAVES_INDICE_ENVIOS,
    'cedula',
    cedula
  );
  var estadoEnvio = clavesTexto_(envio && envio.estado).toUpperCase();
  var permiteReenvio = Boolean(
    envio &&
    estadoEnvio === 'DEVUELTO' &&
    clavesIndiceBooleano_(envio.permitirReenvio)
  );
  var tieneEnvio = Boolean(envio && !permiteReenvio);

  estudiante.numeroIdentificacion = estudiante.cedula;
  estudiante.Nombres = estudiante.nombres;
  estudiante.NombreCarrera = estudiante.nombreCarrera;
  estudiante.CodigoCarrera = estudiante.codigoCarrera;
  estudiante.Sede = estudiante.sede;
  estudiante.Modalidad = estudiante.modalidad;
  estudiante.CorreoInstitucional = estudiante.correoInstitucional;
  estudiante.CorreoPersonal = estudiante.correoPersonal;
  estudiante.Celular = estudiante.celular;

  var respuesta = {
    ok: true,
    encontrado: true,
    existe: true,
    cedula: cedula,
    estudiante: estudiante,
    registro: estudiante,
    tieneEnvio: tieneEnvio,
    encontradoEnvio: Boolean(envio),
    permiteReenvio: permiteReenvio,
    envio: envio || null,
    periodoId: clavesTexto_(estudiante.periodoId),
    periodoLabel: clavesTexto_(estudiante.periodoLabel),
    fuente: 'INDICES_RESPALDO_TITULOS_APP',
    duracionMs: new Date().getTime() - inicio,
    cache: false,
    indices: clavesEstadoIndicesTitulos_(),
    mensaje: tieneEnvio
      ? 'Estudiante encontrado con un envío previo.'
      : 'Estudiante encontrado y habilitado para continuar.'
  };

  cache.put(cacheKey, JSON.stringify(respuesta), 300);
  return respuesta;
}

function clavesEstadoIndicesTitulos_() {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('indice_estado_titulos');
  if (raw) {
    try { return JSON.parse(raw); } catch (ignorado) {}
  }

  var estado = {
    ok: true,
    estudiantes: {
      actualizadoEn: clavesConfigValor_('INDICE_ESTUDIANTES_ACTUALIZADO_EN'),
      total: Number(clavesConfigValor_('INDICE_ESTUDIANTES_TOTAL') || 0)
    },
    envios: {
      actualizadoEn: clavesConfigValor_('INDICE_ENVIOS_ACTUALIZADO_EN'),
      total: Number(clavesConfigValor_('INDICE_ENVIOS_TOTAL') || 0)
    },
    preparado: clavesConfigValor_('INDICES_TITULOS_PREPARADOS') === 'TRUE'
  };

  cache.put('indice_estado_titulos', JSON.stringify(estado), 60);
  return estado;
}

function clavesInstalarTriggersIndicesTitulos_() {
  var handlers = {
    sincronizarIndiceEstudiantes: true,
    sincronizarIndiceEnvios: true
  };

  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (handlers[trigger.getHandlerFunction()]) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('sincronizarIndiceEstudiantes')
    .timeBased()
    .everyHours(1)
    .create();

  ScriptApp.newTrigger('sincronizarIndiceEnvios')
    .timeBased()
    .everyMinutes(10)
    .create();

  return {
    ok: true,
    estudiantes: 'Cada 1 hora',
    envios: 'Cada 10 minutos'
  };
}

function clavesIndiceServicioConSpreadsheet_(clave) {
  var servicio = clavesServicio_(clave);
  servicio.spreadsheetId = clavesTexto_(servicio.spreadsheetId);
  if (!servicio.spreadsheetId) {
    throw new Error(clave + ' no tiene spreadsheetId configurado en Claves.');
  }
  return servicio;
}

function clavesIndiceAsegurarHoja_(ss, nombre, headers) {
  var hoja = ss.getSheetByName(nombre) || ss.insertSheet(nombre);
  var rango = hoja.getRange(1, 1, 1, headers.length);
  rango.setValues([headers]);
  rango.setFontWeight('bold');
  rango.setBackground('#0b1f3a');
  rango.setFontColor('#ffffff');
  hoja.setFrozenRows(1);
  return hoja;
}

function clavesIndiceReemplazarDatos_(hoja, headers, filas) {
  var lastRow = hoja.getLastRow();
  var lastColumn = Math.max(hoja.getLastColumn(), headers.length);

  if (lastRow > 1) {
    hoja.getRange(2, 1, lastRow - 1, lastColumn).clearContent();
  }
  if (filas.length) {
    hoja.getRange(2, 1, filas.length, headers.length).setValues(filas);
  }
  hoja.autoResizeColumns(1, headers.length);
  SpreadsheetApp.flush();
}

function clavesIndiceLeerHoja_(ss, nombre) {
  var hoja = ss.getSheetByName(nombre);
  if (!hoja || hoja.getLastRow() < 2 || hoja.getLastColumn() < 1) return [];

  var valores = hoja
    .getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn())
    .getDisplayValues();
  var headers = valores.shift().map(function(value) {
    return clavesTexto_(value);
  });

  return valores
    .filter(function(row) {
      return row.some(function(value) { return clavesTexto_(value) !== ''; });
    })
    .map(function(row) {
      var item = {};
      headers.forEach(function(header, index) {
        if (header) item[header] = row[index];
      });

      var payloadRaw = clavesTexto_(item.payloadJson);
      if (payloadRaw && payloadRaw !== '{}') {
        try {
          item = clavesIndiceCombinar_(JSON.parse(payloadRaw), item);
        } catch (ignorado) {}
      }
      return item;
    });
}

function clavesIndiceBuscarExacto_(ss, hojaNombre, headerNombre, valor) {
  var hoja = ss.getSheetByName(hojaNombre);
  if (!hoja || hoja.getLastRow() < 2) return null;

  var headers = hoja
    .getRange(1, 1, 1, hoja.getLastColumn())
    .getDisplayValues()[0]
    .map(function(value) { return clavesTexto_(value); });
  var columna = headers.map(function(value) {
    return value.toLowerCase();
  }).indexOf(clavesTexto_(headerNombre).toLowerCase());

  if (columna < 0) return null;

  var celda = hoja
    .getRange(2, columna + 1, hoja.getLastRow() - 1, 1)
    .createTextFinder(clavesTexto_(valor))
    .matchEntireCell(true)
    .useRegularExpression(false)
    .findNext();

  if (!celda) return null;

  var row = hoja
    .getRange(celda.getRow(), 1, 1, headers.length)
    .getDisplayValues()[0];
  var item = {};
  headers.forEach(function(header, index) {
    item[header] = row[index];
  });
  return item;
}

function clavesIndiceCedula_(valor) {
  var digits = clavesTexto_(valor).replace(/\D/g, '');
  if (digits.length === 9) digits = '0' + digits;
  return digits.length === 10 ? digits : '';
}

function clavesIndiceCombinar_(destino, origen) {
  var output = destino && typeof destino === 'object' ? destino : {};
  var source = origen && typeof origen === 'object' ? origen : {};

  Object.keys(source).forEach(function(key) {
    var value = source[key];
    if (value !== undefined && value !== null && clavesTexto_(value) !== '') {
      output[key] = value;
    }
  });
  return output;
}

function clavesIndiceCompararMatriculas_(a, b) {
  var activoA = clavesTexto_(a.estadoMatricula || 'ACTIVO').toUpperCase() === 'ACTIVO' ? 1 : 0;
  var activoB = clavesTexto_(b.estadoMatricula || 'ACTIVO').toUpperCase() === 'ACTIVO' ? 1 : 0;
  if (activoA !== activoB) return activoB - activoA;

  var periodoA = clavesTexto_(a.periodoId || a.periodId || a.ultimoPeriodoId);
  var periodoB = clavesTexto_(b.periodoId || b.periodId || b.ultimoPeriodoId);
  return periodoB.localeCompare(periodoA, 'es', { sensitivity: 'base' });
}

function clavesIndiceBooleano_(valor) {
  return ['TRUE', 'SI', 'SÍ', '1', 'ACTIVO'].indexOf(
    clavesTexto_(valor).toUpperCase()
  ) >= 0;
}

function clavesIndiceFechaEnvio_(item) {
  var raw = clavesTexto_(
    item.fechaEnvio || item.enviadoEnLocal || item.fechaCliente ||
    item.actualizadoEn || item.creadoEn || item.timestamp
  );
  var parsed = raw ? new Date(raw).getTime() : 0;
  return isNaN(parsed) ? 0 : parsed;
}
