/**
 * Normalización segura de cédulas ecuatorianas.
 *
 * Objetivo:
 * - Detectar cédulas de 9 dígitos que perdieron el cero inicial en Excel.
 * - Convertirlas a texto de 10 dígitos sin perder nuevamente el cero.
 * - Evitar correcciones automáticas cuando ya existe la cédula completa.
 * - Respaldar cada fila antes de modificarla.
 *
 * Uso manual desde Apps Script:
 *   analizarCedulasNueveDigitos();
 *   corregirCedulasNueveDigitosSeguras();
 *
 * Integración opcional en doGet/doPost:
 *   var cedulas = manejarAccionNormalizacionCedulas_(accion, datos);
 *   if (cedulas !== null) return responderJson_(cedulas);
 */

var CEDULAS_HOJAS_ = [
  "BaseEstudiantes",
  "Envios",
  "PendientesSync"
];

var CEDULAS_HISTORIAL_ = "HistorialReparaciones";

function manejarAccionNormalizacionCedulas_(accion, datos) {
  var tipo = String(accion || "").trim().toUpperCase();
  var payload = datos && typeof datos === "object" ? datos : {};

  if (tipo === "ANALIZAR_CEDULAS_10_DIGITOS") {
    return analizarCedulasNueveDigitos_(payload);
  }

  if (tipo === "CORREGIR_CEDULAS_10_DIGITOS") {
    return corregirCedulasNueveDigitos_(payload);
  }

  return null;
}

function analizarCedulasNueveDigitos() {
  var resultado = analizarCedulasNueveDigitos_({});
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function corregirCedulasNueveDigitosSeguras() {
  var analisis = analizarCedulasNueveDigitos_({});
  var seguros = analisis.casos.filter(function(caso) {
    return caso.seguro === true;
  });
  var resultado = corregirCedulasNueveDigitos_({ casos: seguros });
  Logger.log(JSON.stringify(resultado, null, 2));
  return resultado;
}

function analizarCedulasNueveDigitos_(opciones) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojas = normalizarListaHojasCedulas_(opciones && opciones.hojas);
  var casos = [];
  var totalRegistros = 0;

  hojas.forEach(function(nombreHoja) {
    var hoja = ss.getSheetByName(nombreHoja);
    var info;

    if (!hoja) return;

    info = leerHojaCedulas_(hoja);
    totalRegistros += info.filas.length;
    analizarHojaCedulas_(info, casos);
  });

  casos.sort(function(a, b) {
    if (a.seguro !== b.seguro) return a.seguro ? -1 : 1;
    if (a.hoja !== b.hoja) return String(a.hoja).localeCompare(String(b.hoja));
    return Number(a.fila || 0) - Number(b.fila || 0);
  });

  return {
    ok: true,
    fuente: "google-sheets",
    tipo: "NORMALIZACION_CEDULAS",
    totalHojas: hojas.length,
    totalRegistros: totalRegistros,
    totalCasos: casos.length,
    seguros: casos.filter(function(caso) { return caso.seguro === true; }).length,
    manuales: casos.filter(function(caso) { return caso.seguro !== true; }).length,
    casos: casos,
    mensaje: casos.length
      ? "Se detectaron cédulas de 9 dígitos. El análisis no modificó datos."
      : "No se detectaron cédulas de 9 dígitos."
  };
}

function leerHojaCedulas_(hoja) {
  var ultimaFila = hoja.getLastRow();
  var ultimaColumna = hoja.getLastColumn();
  var valores;
  var encabezados;
  var columnasCedula = [];
  var columnasId = [];
  var filas = [];

  if (ultimaFila < 1 || ultimaColumna < 1) {
    return {
      hoja: hoja,
      nombre: hoja.getName(),
      encabezados: [],
      columnasCedula: [],
      columnasId: [],
      filas: []
    };
  }

  valores = hoja.getRange(1, 1, ultimaFila, ultimaColumna).getDisplayValues();
  encabezados = valores[0].map(function(valor) {
    return String(valor || "").trim();
  });

  encabezados.forEach(function(encabezado, indice) {
    var clave = normalizarClaveCedulas_(encabezado);

    if ([
      "cedula",
      "numeroidentificacion",
      "identificacion",
      "documento"
    ].indexOf(clave) !== -1) {
      columnasCedula.push(indice);
    }

    if ([
      "idregistro",
      "tituloid",
      "codigoregistro"
    ].indexOf(clave) !== -1) {
      columnasId.push(indice);
    }
  });

  for (var fila = 1; fila < valores.length; fila += 1) {
    if (!filaTieneDatosCedulas_(valores[fila])) continue;

    filas.push({
      numero: fila + 1,
      valores: valores[fila].slice()
    });
  }

  return {
    hoja: hoja,
    nombre: hoja.getName(),
    encabezados: encabezados,
    columnasCedula: columnasCedula,
    columnasId: columnasId,
    filas: filas
  };
}

function analizarHojaCedulas_(info, casos) {
  var existentes = {};

  info.filas.forEach(function(fila) {
    info.columnasCedula.forEach(function(indice) {
      var digitos = soloDigitosCedulas_(fila.valores[indice]);
      if (digitos.length === 10) existentes[digitos] = true;
    });
  });

  info.filas.forEach(function(fila) {
    var encontrada = obtenerCedulaNueveDigitosFila_(info, fila);
    var correcta;
    var conflicto;

    if (!encontrada) return;

    correcta = "0" + encontrada.valor;
    conflicto = existentes[correcta] === true;

    casos.push({
      id: info.nombre + "__" + fila.numero + "__CEDULA_9_DIGITOS",
      hoja: info.nombre,
      fila: fila.numero,
      columna: encontrada.indice + 1,
      encabezado: info.encabezados[encontrada.indice] || "Cédula",
      cedula: encontrada.valor,
      cedulaActual: encontrada.valor,
      cedulaCorrecta: correcta,
      problemas: [
        conflicto
          ? "La cédula tiene 9 dígitos y ya existe otro registro con " + correcta
          : "La cédula tiene 9 dígitos porque se perdió el cero inicial"
      ],
      acciones: [
        conflicto
          ? "Comparar manualmente ambos registros antes de modificar"
          : "Respaldar la fila y guardar la cédula como texto de 10 dígitos"
      ],
      seguro: !conflicto,
      tipo: conflicto ? "CEDULA_9_DIGITOS_CONFLICTO" : "CEDULA_9_DIGITOS",
      firmaOriginal: firmaFilaCedulas_(fila.valores),
      datos: {
        accion: "NORMALIZAR_CEDULA_10_DIGITOS",
        cedulaActual: encontrada.valor,
        cedulaCorrecta: correcta
      }
    });
  });
}

function corregirCedulasNueveDigitos_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var casos = payload && Array.isArray(payload.casos) ? payload.casos : [];
  var administrador = String(payload && payload.administrador || "administrador");
  var historial = obtenerHistorialCedulas_(ss);
  var resultados = [];

  casos.filter(function(caso) {
    return caso &&
      caso.seguro === true &&
      caso.datos &&
      caso.datos.accion === "NORMALIZAR_CEDULA_10_DIGITOS";
  }).forEach(function(caso) {
    try {
      resultados.push(
        ejecutarNormalizacionCedula_(ss, historial, caso, administrador)
      );
    } catch (error) {
      resultados.push({
        ok: false,
        id: String(caso.id || ""),
        hoja: String(caso.hoja || ""),
        fila: Number(caso.fila || 0),
        error: error && error.message ? error.message : String(error)
      });
    }
  });

  return {
    ok: resultados.every(function(item) { return item.ok === true; }),
    procesados: resultados.length,
    correctos: resultados.filter(function(item) { return item.ok === true; }).length,
    errores: resultados.filter(function(item) { return item.ok !== true; }).length,
    resultados: resultados,
    mensaje: resultados.length
      ? "Normalización terminada con respaldo previo."
      : "No se recibieron correcciones seguras."
  };
}

function ejecutarNormalizacionCedula_(ss, historial, caso, administrador) {
  var hoja = ss.getSheetByName(String(caso.hoja || ""));
  var fila = Number(caso.fila || 0);
  var ultimaColumna;
  var valores;
  var firmaActual;
  var info;
  var actual;
  var correcta;
  var existeConflicto;

  if (!hoja) throw new Error("La hoja indicada no existe.");
  if (fila < 2 || fila > hoja.getLastRow()) throw new Error("La fila indicada ya no existe.");

  ultimaColumna = hoja.getLastColumn();
  valores = hoja.getRange(fila, 1, 1, ultimaColumna).getDisplayValues()[0];
  firmaActual = firmaFilaCedulas_(valores);

  if (!caso.firmaOriginal || firmaActual !== String(caso.firmaOriginal)) {
    throw new Error("La fila cambió después del análisis. Debe analizarse nuevamente.");
  }

  info = leerHojaCedulas_(hoja);
  actual = soloDigitosCedulas_(caso.cedulaActual || caso.cedula || "");
  correcta = normalizarCedulaDiezDigitos_(caso.cedulaCorrecta || actual);

  if (actual.length !== 9 || !correcta) {
    throw new Error("La cédula ya no corresponde a un valor normalizable de 9 dígitos.");
  }

  existeConflicto = info.filas.some(function(otraFila) {
    if (otraFila.numero === fila) return false;

    return info.columnasCedula.some(function(indice) {
      return soloDigitosCedulas_(otraFila.valores[indice]) === correcta;
    });
  });

  if (existeConflicto) {
    throw new Error("Ya existe otro registro con la cédula " + correcta + ".");
  }

  registrarHistorialCedulas_(historial, {
    fecha: new Date(),
    hojaOriginal: hoja.getName(),
    filaOriginal: fila,
    idRegistro: caso.idRegistro || "",
    cedula: actual,
    periodo: caso.periodo || "",
    problema: "Cédula de 9 dígitos por pérdida del cero inicial",
    correccionAplicada: "NORMALIZAR_CEDULA_10_DIGITOS: " + actual + " -> " + correcta,
    datosAnteriores: JSON.stringify(valores),
    administrador: administrador,
    resultado: "RESPALDADO_Y_NORMALIZADO"
  });

  info.columnasCedula.forEach(function(indice) {
    var celda = hoja.getRange(fila, indice + 1);
    var valor = soloDigitosCedulas_(celda.getDisplayValue());

    if (valor === actual) {
      celda.setNumberFormat("@");
      celda.setValue(correcta);
    }
  });

  info.columnasId.forEach(function(indice) {
    var celda = hoja.getRange(fila, indice + 1);
    var valor = String(celda.getDisplayValue() || "");
    var sufijo = "__" + actual;

    if (valor.slice(-sufijo.length) === sufijo) {
      celda.setNumberFormat("@");
      celda.setValue(valor.slice(0, -actual.length) + correcta);
    }
  });

  return {
    ok: true,
    id: String(caso.id || ""),
    hoja: hoja.getName(),
    fila: fila,
    cedulaAnterior: actual,
    cedulaCorrecta: correcta,
    accion: "NORMALIZAR_CEDULA_10_DIGITOS"
  };
}

function obtenerCedulaNueveDigitosFila_(info, fila) {
  for (var i = 0; i < info.columnasCedula.length; i += 1) {
    var indice = info.columnasCedula[i];
    var valor = soloDigitosCedulas_(fila.valores[indice]);

    if (valor.length === 9) {
      return { indice: indice, valor: valor };
    }
  }

  return null;
}

function normalizarCedulaDiezDigitos_(valor) {
  var digitos = soloDigitosCedulas_(valor);

  if (digitos.length === 9) return "0" + digitos;
  if (digitos.length === 10) return digitos;
  return "";
}

function soloDigitosCedulas_(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .replace(/\D/g, "")
    .trim();
}

function normalizarListaHojasCedulas_(valor) {
  var lista = valor;

  if (typeof lista === "string") {
    try {
      lista = JSON.parse(lista);
    } catch (error) {
      lista = lista.split(",");
    }
  }

  if (!Array.isArray(lista) || !lista.length) {
    lista = CEDULAS_HOJAS_.slice();
  }

  return lista.map(function(nombre) {
    return String(nombre || "").trim();
  }).filter(function(nombre, indice, arreglo) {
    return nombre && arreglo.indexOf(nombre) === indice;
  });
}

function normalizarClaveCedulas_(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function filaTieneDatosCedulas_(fila) {
  return (fila || []).some(function(valor) {
    return String(valor === null || valor === undefined ? "" : valor).trim() !== "";
  });
}

function firmaFilaCedulas_(valores) {
  var texto = JSON.stringify((valores || []).map(function(valor) {
    return String(valor === null || valor === undefined ? "" : valor);
  }));
  var bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    texto,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64EncodeWebSafe(bytes);
}

function obtenerHistorialCedulas_(ss) {
  var hoja = ss.getSheetByName(CEDULAS_HISTORIAL_);
  var encabezados = [
    "Fecha",
    "HojaOriginal",
    "FilaOriginal",
    "IdRegistro",
    "Cedula",
    "Periodo",
    "Problema",
    "CorreccionAplicada",
    "DatosAnteriores",
    "Administrador",
    "Resultado"
  ];

  if (!hoja) hoja = ss.insertSheet(CEDULAS_HISTORIAL_);
  if (hoja.getLastRow() === 0) hoja.appendRow(encabezados);
  return hoja;
}

function registrarHistorialCedulas_(hoja, registro) {
  hoja.appendRow([
    registro.fecha || new Date(),
    registro.hojaOriginal || "",
    registro.filaOriginal || "",
    registro.idRegistro || "",
    registro.cedula || "",
    registro.periodo || "",
    registro.problema || "",
    registro.correccionAplicada || "",
    registro.datosAnteriores || "",
    registro.administrador || "",
    registro.resultado || ""
  ]);
}
