/**
 * API relay de Claves.
 * Los secretos se utilizan dentro de Apps Script y nunca se devuelven al navegador ni a Cloudflare.
 * Requiere CLAVES_01_CONFIG.gs en el mismo proyecto.
 */
function doGet() {
  return clavesJson_({
    ok: true,
    app: 'Claves',
    version: CLAVES_VERSION,
    mensaje: 'Claves activo.',
    fechaServidor: new Date().toISOString()
  });
}

function doPost(e) {
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
}

function clavesPayload_(e) {
  var raw = e && e.postData && e.postData.contents
    ? String(e.postData.contents).trim()
    : '';

  if (!raw) return e && e.parameter || {};

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error('El cuerpo recibido no es JSON válido.');
  }
}

function clavesAccion_(valor) {
  return clavesTexto_(valor).toUpperCase().replace(/[^A-Z0-9_]/g, '');
}

function clavesValidarAcceso_(recibido) {
  var esperado = clavesConfigValor_('ACCESO_PROXY');
  if (!esperado) throw new Error('Ejecuta prepararClavesCentral().');
  if (clavesTexto_(recibido) !== esperado) throw new Error('Acceso inválido.');
}

function clavesValidarAppsScript_(valor, etiqueta, permitirVacio) {
  var raw = clavesTexto_(valor);
  if (!raw && permitirVacio === true) return '';
  if (!/^https:\/\/(script\.google\.com|script\.googleusercontent\.com)\//i.test(raw) || !/\/exec(?:\?|$)/i.test(raw)) {
    throw new Error((etiqueta || 'Endpoint') + ' debe ser una URL /exec de Google Apps Script.');
  }
  return raw;
}

function clavesServicio_(clave) {
  var key = clavesTexto_(clave).toUpperCase();
  var fila = clavesBuscarFila_('Servicios', 1, key);

  if (!fila) throw new Error('No existe el servicio ' + key + '.');

  var servicio = clavesFilaObjeto_('Servicios', fila);
  if (!clavesActivo_(servicio.estado)) {
    throw new Error(servicio.mensaje || 'El servicio ' + key + ' está inactivo.');
  }

  servicio.endpoint = clavesValidarAppsScript_(servicio.endpoint, 'Endpoint de ' + key, false);
  return servicio;
}

function clavesServicioPublico_(servicio) {
  return {
    clave: servicio.clave,
    nombre: servicio.nombre,
    tipo: servicio.tipo,
    estado: servicio.estado,
    activo: clavesActivo_(servicio.estado),
    version: servicio.version,
    mensaje: servicio.mensaje,
    actualizadoEn: servicio.actualizadoEn
  };
}

function clavesServiciosPublicos_() {
  return {
    ok: true,
    servicios: clavesFilas_('Servicios').map(clavesServicioPublico_),
    configuracion: {
      estadoGeneral: clavesConfigValor_('ESTADO_GENERAL') || 'ACTIVO',
      version: clavesConfigValor_('VERSION') || CLAVES_VERSION
    },
    actualizadoEn: new Date().toISOString()
  };
}

function clavesServiciosAdmin_() {
  var servicios = clavesFilas_('Servicios').map(function(servicio) {
    var publico = clavesServicioPublico_(servicio);
    publico.endpoint = servicio.endpoint;
    publico.spreadsheetId = servicio.spreadsheetId;
    publico.timeoutMs = Number(servicio.timeoutMs || 45000);
    publico.secretoConfigurado = Boolean(clavesTexto_(servicio.secreto));
    return publico;
  });

  return {
    ok: true,
    servicios: servicios,
    total: servicios.length,
    configuracion: {
      estadoGeneral: clavesConfigValor_('ESTADO_GENERAL') || 'ACTIVO',
      version: clavesConfigValor_('VERSION') || CLAVES_VERSION
    }
  };
}

function clavesGuardarServicio_(datos) {
  datos = datos || {};

  var clave = clavesTexto_(datos.clave || datos.key).toUpperCase();
  if (!clave) throw new Error('El servicio necesita una clave.');

  var filaActual = clavesBuscarFila_('Servicios', 1, clave);
  var actual = filaActual ? clavesFilaObjeto_('Servicios', filaActual) : {};
  var endpoint = clavesValidarAppsScript_(
    datos.endpoint || datos.url || datos.webAppUrl || actual.endpoint,
    'Endpoint de ' + clave,
    true
  );

  var secreto;
  if (datos.borrarSecreto === true) {
    secreto = '';
  } else {
    secreto = clavesTexto_(
      datos.secreto || datos.token || datos.accessToken || datos.apiToken || actual.secreto
    );
  }

  var fila = [
    clave,
    clavesTexto_(datos.nombre || datos.name || actual.nombre || clave),
    clavesTexto_(datos.tipo || actual.tipo || 'apps-script'),
    endpoint,
    secreto,
    clavesTexto_(datos.spreadsheetId || datos.googleSheetsId || actual.spreadsheetId),
    clavesTexto_(
      datos.estado ||
      (datos.activo === true ? 'ACTIVO' : datos.activo === false ? 'INACTIVO' : actual.estado || 'INACTIVO')
    ).toUpperCase(),
    Number(datos.timeoutMs || actual.timeoutMs || 45000),
    clavesTexto_(datos.version || actual.version),
    clavesTexto_(datos.mensaje === undefined ? actual.mensaje : datos.mensaje),
    new Date().toISOString()
  ];

  clavesUpsert_('Servicios', 1, clave, fila);

  var guardado = clavesServiciosAdmin_().servicios.filter(function(item) {
    return item.clave === clave;
  })[0];

  return { ok: true, servicio: guardado };
}

function clavesEjecutarServicio_(datos) {
  datos = datos || {};

  var servicio = clavesServicio_(datos.servicio);
  var accion = clavesTexto_(datos.accionServicio).trim();
  var metodo = clavesTexto_(datos.metodo || 'POST').toUpperCase();
  var payload = datos.payload && typeof datos.payload === 'object' ? datos.payload : {};
  var respuesta;

  if (!accion) throw new Error('Falta la acción del servicio.');

  if (
    servicio.clave === 'REQUISITOS' &&
    ['pull_bl2', 'ping'].indexOf(accion.toLowerCase()) < 0
  ) {
    throw new Error('REQUISITOS_BDLOCAL_SYNC es de solo consulta.');
  }

  if (metodo === 'GET') {
    var query = {
      accion: accion,
      action: accion,
      origen: clavesTexto_(datos.rol || 'consulta')
    };

    if (servicio.secreto) query.token = servicio.secreto;
    if (servicio.spreadsheetId) query.spreadsheetId = servicio.spreadsheetId;

    Object.keys(payload).forEach(function(key) {
      if (
        payload[key] !== undefined &&
        payload[key] !== null &&
        typeof payload[key] !== 'object'
      ) {
        query[key] = String(payload[key]);
      }
    });

    var partes = Object.keys(query).map(function(key) {
      return encodeURIComponent(key) + '=' + encodeURIComponent(query[key]);
    });

    respuesta = UrlFetchApp.fetch(
      servicio.endpoint + (servicio.endpoint.indexOf('?') >= 0 ? '&' : '?') + partes.join('&'),
      { method: 'get', muteHttpExceptions: true }
    );
  } else {
    var body = {
      accion: accion,
      action: accion,
      tipo: accion,
      origen: clavesTexto_(datos.rol || 'consulta'),
      datos: payload
    };

    Object.keys(payload).forEach(function(key) {
      body[key] = payload[key];
    });

    if (servicio.secreto) {
      body.token = servicio.secreto;
      body.datos.token = servicio.secreto;
    }

    if (servicio.spreadsheetId) {
      body.spreadsheetId = servicio.spreadsheetId;
      body.datos.spreadsheetId = servicio.spreadsheetId;
    }

    respuesta = UrlFetchApp.fetch(servicio.endpoint, {
      method: 'post',
      contentType: 'text/plain;charset=utf-8',
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
  }

  var codigo = respuesta.getResponseCode();
  var raw = respuesta.getContentText();
  var json;

  try {
    json = raw ? JSON.parse(raw) : {};
  } catch (error) {
    throw new Error(servicio.nombre + ' respondió en un formato no válido.');
  }

  if (codigo < 200 || codigo >= 300 || json.ok === false) {
    throw new Error(
      json.mensaje || json.message || json.error || ('Error HTTP ' + codigo)
    );
  }

  clavesLog_('EJECUTAR_' + servicio.clave, 'OK', accion);
  return { ok: true, servicio: servicio.clave, respuesta: json };
}

/* =========================================================
 * Consulta directa y de solo lectura en REQUISITOS_BDLOCAL_SYNC.
 * Evita descargar toda la base mediante pull_bl2.
 * ======================================================= */
function clavesConsultarEstudianteRequisitos_(datos) {
  datos = datos || {};

  var inicio = new Date().getTime();
  var cedula = clavesCedulaCanonica_(
    datos.cedula || datos.numeroIdentificacion || datos.identificacion
  );
  var periodoSolicitado = clavesTexto_(
    datos.periodoId || datos.periodo || datos.periodoLabel
  );

  if (!cedula) throw new Error('No se recibió una cédula válida.');

  var servicio = clavesServicio_('REQUISITOS');
  var spreadsheetId = clavesTexto_(servicio.spreadsheetId);
  if (!spreadsheetId) {
    throw new Error('REQUISITOS no tiene spreadsheetId configurado en Claves.');
  }

  var cache = CacheService.getScriptCache();
  var cacheKey = 'req_est_v3_' + cedula + '_' + periodoSolicitado;
  var cacheRaw = cache.get(cacheKey);
  if (cacheRaw) {
    try {
      var cacheData = JSON.parse(cacheRaw);
      cacheData.cache = true;
      return cacheData;
    } catch (ignorado) {}
  }

  var ss = SpreadsheetApp.openById(spreadsheetId);
  var baseRows = clavesBuscarFilasPorCedula_(ss, 'Estudiantes', cedula);
  var matriculas = clavesBuscarFilasPorCedula_(ss, 'MatriculasPeriodo', cedula);

  if (periodoSolicitado) {
    matriculas = matriculas.filter(function(item) {
      return clavesTexto_(item.periodoId || item.periodoLabel) === periodoSolicitado;
    });
  }

  var matricula = clavesElegirMatricula_(matriculas);
  var base = baseRows.length ? baseRows[baseRows.length - 1] : {};

  if (!matricula && !baseRows.length) {
    var noEncontrado = {
      ok: true,
      encontrado: false,
      existe: false,
      cedula: cedula,
      periodoId: periodoSolicitado,
      fuente: 'REQUISITOS_BDLOCAL_SYNC',
      lecturaDirecta: true,
      duracionMs: new Date().getTime() - inicio,
      mensaje: 'No encontramos un estudiante con esa cédula en REQUISITOS_BDLOCAL_SYNC.'
    };
    cache.put(cacheKey, JSON.stringify(noEncontrado), 60);
    return noEncontrado;
  }

  if (!matricula) matricula = {};

  var periodoId = clavesTexto_(
    matricula.periodoId || matricula.periodId || matricula.ultimoPeriodoId || periodoSolicitado
  );
  var periodo = periodoId
    ? clavesBuscarFilaExacta_(ss, 'Periodos', 'periodoId', periodoId)
    : null;
  var periodoLabel = clavesTexto_(
    matricula.periodoLabel ||
    (periodo && (periodo.periodoLabel || periodo.label)) ||
    periodoId
  );

  var requisitos = clavesBuscarFilasPorCedula_(ss, 'Requisitos', cedula)
    .filter(function(item) {
      return !periodoId || clavesTexto_(item.periodoId) === periodoId;
    });
  var notas = clavesBuscarFilasPorCedula_(ss, 'Notas', cedula)
    .filter(function(item) {
      return !periodoId || clavesTexto_(item.periodoId) === periodoId;
    });
  var divisiones = clavesBuscarFilasPorCedula_(ss, 'DivisionesEstudiantes', cedula)
    .filter(function(item) {
      return !periodoId || clavesTexto_(item.periodoId) === periodoId;
    });

  var estudiante = clavesCombinarNoVacios_({}, base);
  estudiante = clavesCombinarNoVacios_(estudiante, matricula);
  if (notas.length) {
    estudiante = clavesCombinarNoVacios_(estudiante, notas[notas.length - 1]);
  }

  requisitos.forEach(function(item) {
    var key = clavesRequisitoCanonico_(
      item.requisitoKey || item.requisitoNombre || item.key || item.nombre
    );
    var estado = clavesTexto_(item.estado || item.valor || item.value);
    if (key && estado) estudiante[key] = estado;
  });

  var division = clavesTexto_(
    matricula.division || matricula.Division ||
    (divisiones.length && (divisiones[divisiones.length - 1].division || divisiones[divisiones.length - 1].Division))
  );

  estudiante.id = clavesTexto_(matricula.id || (periodoId ? periodoId + '__' + cedula : cedula));
  estudiante._id = estudiante.id;
  estudiante.studentId = estudiante.id;
  estudiante.cedula = cedula;
  estudiante.numeroIdentificacion = cedula;
  estudiante.NumeroIdentificacion = cedula;
  estudiante.periodoId = periodoId;
  estudiante.periodId = periodoId;
  estudiante.periodoCanonicoId = periodoId;
  estudiante.periodoLabel = periodoLabel;
  estudiante.periodoCanonicoLabel = periodoLabel;
  estudiante.Nombres = clavesTexto_(
    base.Nombres || base.nombres || base.nombreCompleto || matricula.Nombres || matricula.nombres
  );
  estudiante.CodigoCarrera = clavesTexto_(
    matricula.CodigoCarrera || matricula.codigoCarrera || base.CodigoCarrera || base.codigoCarrera
  );
  estudiante.NombreCarrera = clavesTexto_(
    matricula.NombreCarrera || matricula.nombreCarrera || base.NombreCarrera || base.nombreCarrera
  );
  estudiante.Sede = clavesTexto_(matricula.Sede || matricula.sede);
  estudiante.HorarioComplexivo = clavesTexto_(
    matricula.HorarioComplexivo || matricula.horarioComplexivo
  );
  estudiante.estadoMatricula = clavesTexto_(matricula.estadoMatricula || 'ACTIVO');
  estudiante.division = division;
  estudiante.source = 'google_sheets_direct';

  var encontrado = Boolean(estudiante.Nombres || estudiante.NombreCarrera || baseRows.length || matriculas.length);
  var respuesta = {
    ok: true,
    encontrado: encontrado,
    existe: encontrado,
    cedula: cedula,
    estudiante: encontrado ? estudiante : null,
    registro: encontrado ? estudiante : null,
    periodoId: periodoId,
    periodoLabel: periodoLabel,
    coincidencias: matriculas.length || baseRows.length,
    fuente: 'REQUISITOS_BDLOCAL_SYNC',
    lecturaDirecta: true,
    cache: false,
    duracionMs: new Date().getTime() - inicio,
    mensaje: encontrado
      ? 'Estudiante encontrado correctamente.'
      : 'No encontramos un estudiante con esa cédula en REQUISITOS_BDLOCAL_SYNC.'
  };

  cache.put(cacheKey, JSON.stringify(respuesta), encontrado ? 300 : 60);
  return respuesta;
}

function clavesCedulaCanonica_(valor) {
  var digitos = clavesTexto_(valor).replace(/\D/g, '');
  if (digitos.length === 9) digitos = '0' + digitos;
  return digitos.length === 10 ? digitos : '';
}

function clavesVariantesCedula_(cedula) {
  var lista = [cedula];
  if (cedula && cedula.charAt(0) === '0') lista.push(cedula.slice(1));
  return lista.filter(function(item, index, todos) {
    return item && todos.indexOf(item) === index;
  });
}

function clavesMapaCabeceras_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return { lista: [], mapa: {} };

  var lista = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(function(item) { return clavesTexto_(item); });
  var mapa = {};
  lista.forEach(function(item, index) {
    mapa[item.toLowerCase()] = index + 1;
  });
  return { lista: lista, mapa: mapa };
}

function clavesFilaHojaObjeto_(sheet, numeroFila, cabeceras) {
  var valores = sheet.getRange(numeroFila, 1, 1, cabeceras.lista.length).getDisplayValues()[0];
  var objeto = {};

  cabeceras.lista.forEach(function(header, index) {
    objeto[header] = valores[index];
  });

  var payload = {};
  var rawPayload = clavesTexto_(objeto.payloadJson);
  if (rawPayload && rawPayload !== '{}') {
    try { payload = JSON.parse(rawPayload); } catch (ignorado) {}
  }

  return clavesCombinarNoVacios_(payload, objeto);
}

function clavesBuscarFilasPorCedula_(ss, sheetName, cedula) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var cabeceras = clavesMapaCabeceras_(sheet);
  var columnas = ['cedula', 'numeroidentificacion'];
  var filas = {};
  var variantes = clavesVariantesCedula_(cedula);

  columnas.forEach(function(nombre) {
    var columna = cabeceras.mapa[nombre];
    if (!columna) return;

    variantes.forEach(function(valor) {
      var encontrados = sheet
        .getRange(2, columna, sheet.getLastRow() - 1, 1)
        .createTextFinder(valor)
        .matchEntireCell(true)
        .findAll();

      encontrados.forEach(function(celda) {
        filas[celda.getRow()] = true;
      });
    });
  });

  return Object.keys(filas)
    .map(Number)
    .sort(function(a, b) { return a - b; })
    .map(function(numeroFila) {
      return clavesFilaHojaObjeto_(sheet, numeroFila, cabeceras);
    });
}

function clavesBuscarFilaExacta_(ss, sheetName, header, valor) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return null;

  var cabeceras = clavesMapaCabeceras_(sheet);
  var columna = cabeceras.mapa[clavesTexto_(header).toLowerCase()];
  if (!columna) return null;

  var celda = sheet
    .getRange(2, columna, sheet.getLastRow() - 1, 1)
    .createTextFinder(clavesTexto_(valor))
    .matchEntireCell(true)
    .findNext();

  return celda ? clavesFilaHojaObjeto_(sheet, celda.getRow(), cabeceras) : null;
}

function clavesElegirMatricula_(matriculas) {
  var lista = (matriculas || []).slice();
  if (!lista.length) return null;

  lista.sort(function(a, b) {
    var activoA = clavesTexto_(a.estadoMatricula || 'ACTIVO').toUpperCase() === 'ACTIVO' ? 1 : 0;
    var activoB = clavesTexto_(b.estadoMatricula || 'ACTIVO').toUpperCase() === 'ACTIVO' ? 1 : 0;
    if (activoA !== activoB) return activoB - activoA;

    var periodoA = clavesTexto_(a.periodoId || a.ultimoPeriodoId);
    var periodoB = clavesTexto_(b.periodoId || b.ultimoPeriodoId);
    return periodoB.localeCompare(periodoA, 'es', { sensitivity: 'base' });
  });

  return lista[0];
}

function clavesCombinarNoVacios_(destino, origen) {
  var salida = destino && typeof destino === 'object' ? destino : {};
  var fuente = origen && typeof origen === 'object' ? origen : {};

  Object.keys(fuente).forEach(function(key) {
    var valor = fuente[key];
    if (valor !== undefined && valor !== null && clavesTexto_(valor) !== '') {
      salida[key] = valor;
    }
  });

  return salida;
}

function clavesSinAcentos_(valor) {
  return clavesTexto_(valor)
    .toLowerCase()
    .replace(/[áàäâ]/g, 'a')
    .replace(/[éèëê]/g, 'e')
    .replace(/[íìïî]/g, 'i')
    .replace(/[óòöô]/g, 'o')
    .replace(/[úùüû]/g, 'u')
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]/g, '');
}

function clavesRequisitoCanonico_(valor) {
  var mapa = {
    academico: 'Academico',
    actualizaciondatos: 'ActualizacionDatos',
    aprobacioncomplexivoproyecto: 'AprobacionComplexivoProyecto',
    aprobaciontitulacion: 'AprobacionTitulacion',
    documentacion: 'Documentacion',
    financiero: 'Financiero',
    ingles: 'Ingles',
    practicasvinculacion: 'PracticasVinculacion',
    seguimientograduados: 'SeguimientoGraduados',
    titulacion: 'Titulacion',
    vinculacion: 'Vinculacion'
  };
  return mapa[clavesSinAcentos_(valor)] || '';
}

function clavesListarIA_(incluirInactivos) {
  var lista = clavesFilas_('IA')
    .filter(function(item) {
      return incluirInactivos || clavesActivo_(item.estado);
    })
    .map(function(item) {
      return {
        id: item.id,
        proveedor: item.id,
        nombre: item.nombre,
        tipo: item.tipo,
        activo: clavesActivo_(item.estado),
        prioridad: Number(item.prioridad || 999),
        endpointConfigurado: Boolean(clavesTexto_(item.endpoint)),
        modelo: item.modelo,
        model: item.modelo,
        timeoutMs: Number(item.timeoutMs || 45000),
        maxTokens: Number(item.maxTokens || 3000),
        temperatura: Number(item.temperatura || 0.3),
        descripcion: item.descripcion,
        apiKeyConfigurada: Boolean(clavesTexto_(item.credencial)),
        ultimaPruebaOk: String(item.ultimaPruebaOk).toUpperCase() === 'TRUE',
        ultimaPruebaEn: item.ultimaPruebaEn,
        ultimaLatenciaMs: Number(item.ultimaLatenciaMs || 0),
        ultimoError: item.ultimoError
      };
    });

  lista.sort(function(a, b) {
    return a.prioridad - b.prioridad;
  });

  return { ok: true, proveedores: lista, total: lista.length };
}

function clavesProveedor_(id) {
  var key = clavesId_(id);
  var fila = clavesBuscarFila_('IA', 1, key);

  if (!fila) throw new Error('No existe el proveedor ' + key + '.');

  var proveedor = clavesFilaObjeto_('IA', fila);
  if (!clavesActivo_(proveedor.estado)) {
    throw new Error('El proveedor ' + key + ' está inactivo.');
  }
  if (!clavesTexto_(proveedor.credencial)) {
    throw new Error('El proveedor ' + key + ' no tiene credencial.');
  }

  return proveedor;
}

function clavesHostIAValido_(url) {
  return /^https:\/\/(generativelanguage\.googleapis\.com|api\.groq\.com|api\.cerebras\.ai|integrate\.api\.nvidia\.com|models\.github\.ai|openrouter\.ai|router\.huggingface\.co|api\.cloudflare\.com)\//i.test(url);
}

function clavesGenerarIA_(datos) {
  datos = datos || {};

  var proveedor = clavesProveedor_(datos.providerId || datos.provider);
  var prompt = clavesTexto_(datos.prompt);
  var opciones = datos.options || {};
  var tipo = clavesTexto_(proveedor.tipo).toLowerCase();
  var url;
  var body;
  var headers = { 'Content-Type': 'application/json' };
  var inicio = new Date().getTime();

  if (!prompt) throw new Error('El prompt está vacío.');

  try {
    if (tipo === 'gemini' || proveedor.id === 'gemini') {
      url = 'https://generativelanguage.googleapis.com/v1beta/models/' +
        encodeURIComponent(proveedor.modelo || 'gemini-2.0-flash') +
        ':generateContent?key=' + encodeURIComponent(proveedor.credencial);

      body = {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: Number(
            opciones.temperatura === undefined
              ? proveedor.temperatura || 0.3
              : opciones.temperatura
          ),
          maxOutputTokens: Number(opciones.maxTokens || proveedor.maxTokens || 3000)
        }
      };
    } else {
      url = clavesTexto_(proveedor.endpoint);
      if (!url) throw new Error('El proveedor no tiene endpoint.');
      if (!clavesHostIAValido_(url)) throw new Error('El endpoint IA no está permitido.');

      headers.Authorization = 'Bearer ' + proveedor.credencial;
      body = {
        model: proveedor.modelo,
        messages: [{ role: 'user', content: prompt }],
        temperature: Number(
          opciones.temperatura === undefined
            ? proveedor.temperatura || 0.3
            : opciones.temperatura
        ),
        max_tokens: Number(opciones.maxTokens || proveedor.maxTokens || 3000)
      };
    }

    var respuesta = UrlFetchApp.fetch(url, {
      method: 'post',
      headers: headers,
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });

    var codigo = respuesta.getResponseCode();
    var json;

    try {
      json = JSON.parse(respuesta.getContentText() || '{}');
    } catch (errorJson) {
      throw new Error('El proveedor IA respondió en un formato no válido.');
    }

    if (codigo < 200 || codigo >= 300) {
      throw new Error(
        json.error && json.error.message ||
        json.message ||
        ('Error IA HTTP ' + codigo)
      );
    }

    var salida = tipo === 'gemini'
      ? json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text
      : json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;

    if (!salida) throw new Error('La IA respondió sin texto.');

    var latencia = new Date().getTime() - inicio;
    clavesActualizarPrueba_(proveedor.id, true, latencia, '');

    return {
      ok: true,
      provider: proveedor.id,
      text: String(salida),
      latencyMs: latencia
    };
  } catch (error) {
    clavesActualizarPrueba_(
      proveedor.id,
      false,
      new Date().getTime() - inicio,
      error.message || String(error)
    );
    throw error;
  }
}

function clavesGuardarIA_(datos) {
  datos = datos || {};

  var id = clavesId_(datos.id || datos.proveedor || datos.providerId || datos.nombre);
  if (!id) throw new Error('Falta el ID del proveedor.');

  var filaActual = clavesBuscarFila_('IA', 1, id);
  var actual = filaActual ? clavesFilaObjeto_('IA', filaActual) : {};
  var credencial;

  if (datos.borrarCredencial === true) {
    credencial = '';
  } else {
    credencial = clavesTexto_(
      datos.credencial || datos.apiKey || datos.key || datos.token || actual.credencial
    );
  }

  var fila = [
    id,
    clavesTexto_(datos.nombre || datos.name || actual.nombre || id),
    clavesTexto_(datos.tipo || actual.tipo || 'openai-compatible'),
    clavesTexto_(datos.endpoint || actual.endpoint),
    clavesTexto_(datos.modelo || datos.model || actual.modelo),
    credencial,
    clavesTexto_(
      datos.estado ||
      (datos.activo === true ? 'ACTIVO' : datos.activo === false ? 'INACTIVO' : actual.estado || 'INACTIVO')
    ).toUpperCase(),
    Number(datos.prioridad || actual.prioridad || 999),
    Number(datos.timeoutMs || actual.timeoutMs || 45000),
    Number(datos.maxTokens || actual.maxTokens || 3000),
    Number(
      datos.temperatura === undefined
        ? actual.temperatura || 0.3
        : datos.temperatura
    ),
    clavesTexto_(datos.descripcion || actual.descripcion),
    actual.ultimaPruebaOk || false,
    actual.ultimaPruebaEn || '',
    Number(actual.ultimaLatenciaMs || 0),
    actual.ultimoError || '',
    new Date().toISOString()
  ];

  clavesUpsert_('IA', 1, id, fila);

  return {
    ok: true,
    proveedor: clavesListarIA_(true).proveedores.filter(function(item) {
      return item.id === id;
    })[0]
  };
}

function clavesCambiarEstadoIA_(id, activo) {
  var key = clavesId_(id);
  var fila = clavesBuscarFila_('IA', 1, key);
  if (!fila) throw new Error('Proveedor no encontrado.');

  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('IA')
    .getRange(fila, 7)
    .setValue(activo ? 'ACTIVO' : 'INACTIVO');

  return { ok: true, providerId: key, activo: activo };
}

function clavesActualizarPrueba_(id, ok, latenciaMs, error) {
  var fila = clavesBuscarFila_('IA', 1, clavesId_(id));
  if (!fila) return;

  SpreadsheetApp.getActiveSpreadsheet()
    .getSheetByName('IA')
    .getRange(fila, 13, 1, 5)
    .setValues([[
      ok,
      new Date().toISOString(),
      Number(latenciaMs || 0),
      clavesTexto_(error),
      new Date().toISOString()
    ]]);
}
