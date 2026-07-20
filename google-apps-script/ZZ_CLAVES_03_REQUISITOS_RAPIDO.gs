/*
 * Consulta rápida y de solo lectura para REQUISITOS_BDLOCAL_SYNC.
 *
 * IMPORTANTE:
 * - Este bloque sustituye la función lenta clavesConsultarEstudianteRequisitos_.
 * - En Apps Script, pégalo AL FINAL de Sin título.gs para garantizar que
 *   esta asignación reemplace la implementación anterior.
 * - No escribe ni modifica REQUISITOS_BDLOCAL_SYNC.
 */
clavesConsultarEstudianteRequisitos_ = function(datos) {
  datos = datos || {};

  var inicio = new Date().getTime();
  var cedula = clavesCedulaRapida_(
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
  var cacheKey = 'req_identidad_v5_' + cedula + '_' + periodoSolicitado;
  var cacheRaw = cache.get(cacheKey);

  if (cacheRaw) {
    try {
      var cached = JSON.parse(cacheRaw);
      cached.cache = true;
      cached.duracionMs = new Date().getTime() - inicio;
      return cached;
    } catch (ignorado) {}
  }

  var ss = SpreadsheetApp.openById(spreadsheetId);

  // La matrícula contiene carrera y período. Se consulta primero porque es
  // suficiente para la pantalla inicial y evita recorrer hojas pesadas.
  var matriculas = clavesFilasRapidasPorCedula_(ss, 'MatriculasPeriodo', cedula);

  if (periodoSolicitado) {
    matriculas = matriculas.filter(function(item) {
      return clavesTexto_(item.periodoId || item.periodId || item.periodoLabel) === periodoSolicitado;
    });
  }

  var matricula = clavesElegirMatriculaRapida_(matriculas);
  var estudianteBase = null;

  // Estudiantes se consulta una sola vez y solo para completar nombres o
  // datos que no estén dentro de MatriculasPeriodo.
  if (!matricula || !clavesTexto_(matricula.Nombres || matricula.nombres)) {
    var estudiantes = clavesFilasRapidasPorCedula_(ss, 'Estudiantes', cedula);
    estudianteBase = estudiantes.length ? estudiantes[estudiantes.length - 1] : null;
  }

  if (!matricula && !estudianteBase) {
    var noEncontrado = {
      ok: true,
      encontrado: false,
      existe: false,
      cedula: cedula,
      periodoId: periodoSolicitado,
      fuente: 'REQUISITOS_BDLOCAL_SYNC',
      lecturaDirecta: true,
      modo: 'IDENTIDAD_RAPIDA',
      cache: false,
      duracionMs: new Date().getTime() - inicio,
      mensaje: 'No encontramos un estudiante con esa cédula en REQUISITOS_BDLOCAL_SYNC.'
    };
    cache.put(cacheKey, JSON.stringify(noEncontrado), 60);
    return noEncontrado;
  }

  matricula = matricula || {};
  estudianteBase = estudianteBase || {};

  var periodoId = clavesTexto_(
    matricula.periodoId || matricula.periodId || matricula.ultimoPeriodoId || periodoSolicitado
  );
  var periodoLabel = clavesTexto_(
    matricula.periodoLabel || matricula.periodoCanonicoLabel || periodoId
  );

  if (periodoId && !periodoLabel) periodoLabel = periodoId;

  var estudiante = clavesCombinarRapido_({}, estudianteBase);
  estudiante = clavesCombinarRapido_(estudiante, matricula);
  estudiante.id = clavesTexto_(
    matricula.id || matricula._id || (periodoId ? periodoId + '__' + cedula : cedula)
  );
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
    matricula.Nombres || matricula.nombres ||
    estudianteBase.Nombres || estudianteBase.nombres || estudianteBase.nombreCompleto
  );
  estudiante.CodigoCarrera = clavesTexto_(
    matricula.CodigoCarrera || matricula.codigoCarrera ||
    estudianteBase.CodigoCarrera || estudianteBase.codigoCarrera
  );
  estudiante.NombreCarrera = clavesTexto_(
    matricula.NombreCarrera || matricula.nombreCarrera ||
    estudianteBase.NombreCarrera || estudianteBase.nombreCarrera
  );
  estudiante.Sede = clavesTexto_(matricula.Sede || matricula.sede || estudianteBase.Sede || estudianteBase.sede);
  estudiante.HorarioComplexivo = clavesTexto_(
    matricula.HorarioComplexivo || matricula.horarioComplexivo
  );
  estudiante.estadoMatricula = clavesTexto_(matricula.estadoMatricula || 'ACTIVO');
  estudiante.source = 'google_sheets_identity_fast';

  var encontrado = Boolean(estudiante.Nombres && estudiante.NombreCarrera);
  var respuesta = {
    ok: true,
    encontrado: encontrado,
    existe: encontrado,
    cedula: cedula,
    estudiante: encontrado ? estudiante : null,
    registro: encontrado ? estudiante : null,
    periodoId: periodoId,
    periodoLabel: periodoLabel,
    coincidencias: matriculas.length || 1,
    fuente: 'REQUISITOS_BDLOCAL_SYNC',
    lecturaDirecta: true,
    modo: 'IDENTIDAD_RAPIDA',
    cache: false,
    duracionMs: new Date().getTime() - inicio,
    mensaje: encontrado
      ? 'Estudiante encontrado correctamente.'
      : 'El registro existe, pero no contiene nombres o carrera.'
  };

  cache.put(cacheKey, JSON.stringify(respuesta), encontrado ? 300 : 60);
  return respuesta;
};

function clavesCedulaRapida_(valor) {
  var digitos = clavesTexto_(valor).replace(/\D/g, '');
  if (digitos.length === 9) digitos = '0' + digitos;
  return digitos.length === 10 ? digitos : '';
}

function clavesVariantesCedulaRapida_(cedula) {
  var lista = [cedula];
  if (cedula.charAt(0) === '0') lista.push(cedula.slice(1));
  return lista;
}

function clavesMapaCabecerasRapido_(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return { headers: [], map: {} };

  var headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0]
    .map(function(value) { return clavesTexto_(value); });
  var map = {};
  headers.forEach(function(header, index) {
    map[header.toLowerCase()] = index;
  });
  return { headers: headers, map: map };
}

function clavesFilasRapidasPorCedula_(ss, sheetName, cedula) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  var meta = clavesMapaCabecerasRapido_(sheet);
  var cedulaIndex = meta.map.cedula;
  if (cedulaIndex === undefined) cedulaIndex = meta.map.numeroidentificacion;
  if (cedulaIndex === undefined) return [];

  var rowCount = sheet.getLastRow() - 1;
  var idValues = sheet.getRange(2, cedulaIndex + 1, rowCount, 1).getDisplayValues();
  var variantes = clavesVariantesCedulaRapida_(cedula);
  var rowNumbers = [];

  idValues.forEach(function(row, index) {
    var value = clavesTexto_(row[0]).replace(/\D/g, '');
    if (variantes.indexOf(value) >= 0) rowNumbers.push(index + 2);
  });

  return rowNumbers.map(function(rowNumber) {
    var values = sheet.getRange(rowNumber, 1, 1, meta.headers.length).getDisplayValues()[0];
    var object = {};
    meta.headers.forEach(function(header, index) {
      object[header] = values[index];
    });

    var payloadRaw = clavesTexto_(object.payloadJson);
    if (payloadRaw && payloadRaw !== '{}') {
      try {
        object = clavesCombinarRapido_(JSON.parse(payloadRaw), object);
      } catch (ignorado) {}
    }
    return object;
  });
}

function clavesElegirMatriculaRapida_(matriculas) {
  var lista = (matriculas || []).slice();
  if (!lista.length) return null;

  lista.sort(function(a, b) {
    var activoA = clavesTexto_(a.estadoMatricula || 'ACTIVO').toUpperCase() === 'ACTIVO' ? 1 : 0;
    var activoB = clavesTexto_(b.estadoMatricula || 'ACTIVO').toUpperCase() === 'ACTIVO' ? 1 : 0;
    if (activoA !== activoB) return activoB - activoA;

    var periodoA = clavesTexto_(a.periodoId || a.ultimoPeriodoId);
    var periodoB = clavesTexto_(b.periodoId || b.ultimoPeriodoId);
    return periodoB.localeCompare(periodoA);
  });

  return lista[0];
}

function clavesCombinarRapido_(destino, origen) {
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
