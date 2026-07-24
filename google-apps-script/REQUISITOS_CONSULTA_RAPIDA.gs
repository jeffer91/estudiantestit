/*
 * Parche para REQUISITOS_BDLOCAL_SYNC.
 *
 * Integra esta acción en doPost inmediatamente después de:
 *   ss = getSpreadsheet_(body);
 * y ANTES de crear el bloqueo global:
 *
 *   if (
 *     action === "consultar_estudiante_rapido" ||
 *     action === "consultar_estudiante" ||
 *     action === "buscar_estudiante"
 *   ) {
 *     return handleConsultarEstudianteRapido_(ss, body);
 *   }
 *
 * La versión completa ya preparada se entrega como:
 * REQUISITOS_BDLOCAL_SYNC_2.4.0_CONSULTA_RAPIDA.gs
 */

function handleConsultarEstudianteRapido_(ss, body) {
  validarToken_(ss, body.token);

  const cedula = normalizeCedulaScript_(
    body.cedula ||
    body.numeroIdentificacion ||
    body.identificacion ||
    ""
  );

  if (!cedula) {
    return json_({
      ok: true,
      encontrado: false,
      existe: false,
      code: "CEDULA_INVALIDA",
      message: "No se recibió una cédula válida.",
      fuente: "GOOGLE_SHEETS_ESTUDIANTES",
      at: now_()
    });
  }

  const sheet = ss.getSheetByName("Estudiantes");

  if (!sheet || sheet.getLastRow() < 2) {
    return json_({
      ok: true,
      encontrado: false,
      existe: false,
      code: "ESTUDIANTE_NO_ENCONTRADO",
      cedula: cedula,
      message: "No encontramos un estudiante con esa cédula.",
      fuente: "GOOGLE_SHEETS_ESTUDIANTES",
      at: now_()
    });
  }

  const headers = SHEET_SCHEMA.Estudiantes;
  const variants = [cedula];

  if (cedula.charAt(0) === "0") {
    variants.push(cedula.substring(1));
  }

  let rowIndex = 0;
  const searchableColumns = [2, 3];

  for (let c = 0; c < searchableColumns.length && !rowIndex; c++) {
    const range = sheet.getRange(
      2,
      searchableColumns[c],
      sheet.getLastRow() - 1,
      1
    );

    for (let v = 0; v < variants.length && !rowIndex; v++) {
      const match = range
        .createTextFinder(variants[v])
        .matchEntireCell(true)
        .useRegularExpression(false)
        .findNext();

      if (match) rowIndex = match.getRow();
    }
  }

  if (!rowIndex) {
    return json_({
      ok: true,
      encontrado: false,
      existe: false,
      code: "ESTUDIANTE_NO_ENCONTRADO",
      cedula: cedula,
      message: "No encontramos un estudiante con esa cédula.",
      fuente: "GOOGLE_SHEETS_ESTUDIANTES",
      at: now_()
    });
  }

  const values = sheet
    .getRange(rowIndex, 1, 1, headers.length)
    .getValues()[0];
  const row = {};

  headers.forEach(function(header, index) {
    row[header] = values[index];
  });

  const payload = parsePayloadJson_(row.payloadJson);
  const merged = Object.assign({}, payload || {}, row, {
    cedula: cedula,
    numeroIdentificacion: cedula,
    NumeroIdentificacion: cedula
  });

  const nombres = clean_(
    merged.Nombres ||
    merged.nombres ||
    merged.nombreCompleto ||
    ""
  );
  const carrera = clean_(
    merged.NombreCarrera ||
    merged.nombreCarrera ||
    merged.carrera ||
    ""
  );
  const periodoId = normalizePeriodIdScript_(
    merged.periodoId ||
    merged.periodId ||
    merged.periodoCanonicoId ||
    merged.ultimoPeriodoId ||
    ""
  );
  const periodoLabel = clean_(
    merged.periodoLabel ||
    merged.periodoCanonicoLabel ||
    merged.periodo ||
    periodoId
  );
  const datosCompletos = !!(nombres && carrera && periodoId);

  const estudiante = {
    id: cedula,
    _id: cedula,
    studentId: cedula,
    cedula: cedula,
    numeroIdentificacion: cedula,
    NumeroIdentificacion: cedula,
    Nombres: nombres,
    nombres: nombres,
    NombreCarrera: carrera,
    nombreCarrera: carrera,
    carrera: carrera,
    periodoId: periodoId,
    periodId: periodoId,
    periodoLabel: periodoLabel,
    periodo: periodoLabel,
    fuente: "GOOGLE_SHEETS_ESTUDIANTES"
  };

  return json_({
    ok: true,
    code: "CONSULTA_ESTUDIANTE_RAPIDA_OK",
    encontrado: true,
    existe: true,
    habilitado: datosCompletos,
    datosCompletos: datosCompletos,
    estudiante: estudiante,
    registro: estudiante,
    cedula: cedula,
    periodoId: periodoId,
    periodoLabel: periodoLabel,
    fuente: "GOOGLE_SHEETS_ESTUDIANTES",
    lecturaRapida: true,
    rowNumber: rowIndex,
    message: datosCompletos
      ? "Datos académicos recuperados desde la hoja Estudiantes."
      : "El estudiante existe, pero faltan la carrera o el período académico.",
    at: now_()
  });
}
