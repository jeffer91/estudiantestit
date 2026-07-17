/**
 * Mantenimiento seguro de Google Sheets para la aplicación de Titulación.
 *
 * Integración en el Apps Script existente:
 *
 *   var mantenimiento = manejarAccionMantenimiento_(accion, datos);
 *   if (mantenimiento !== null) {
 *     return responderJson_(mantenimiento); // usa el respondedor JSON existente
 *   }
 *
 * Debe llamarse desde doGet/doPost después de validar el token y antes de
 * responder "acción desconocida".
 */

var MANTENIMIENTO_HOJAS_ = [
  "BaseEstudiantes",
  "Envios",
  "Coordinadores",
  "PendientesSync"
];

var MANTENIMIENTO_HISTORIAL_ = "HistorialReparaciones";

function manejarAccionMantenimiento_(accion, datos) {
  var tipo = String(accion || "").trim().toUpperCase();
  var payload = datos && typeof datos === "object" ? datos : {};

  if (tipo === "ANALIZAR_GOOGLE_SHEETS") {
    return analizarGoogleSheetsMantenimiento_(payload);
  }

  if (tipo === "CORREGIR_GOOGLE_SHEETS") {
    return corregirGoogleSheetsMantenimiento_(payload);
  }

  if (tipo === "LISTAR_HISTORIAL_REPARACIONES") {
    return listarHistorialReparacionesMantenimiento_(payload);
  }

  return null;
}

function analizarGoogleSheetsMantenimiento_(opciones) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var solicitadas = normalizarHojasSolicitadas_(opciones && opciones.hojas);
  var contexto = construirContextoMantenimiento_(ss, solicitadas);
  var casos = [];

  analizarEncabezadosMantenimiento_(contexto, casos);
  analizarBaseEstudiantesMantenimiento_(contexto, casos);
  analizarEnviosMantenimiento_(contexto, casos);
  analizarCoordinadoresMantenimiento_(contexto, casos);
  analizarPendientesMantenimiento_(contexto, casos);

  casos.sort(function(a, b) {
    if (a.seguro !== b.seguro) return a.seguro ? -1 : 1;
    if (a.hoja !== b.hoja) return String(a.hoja).localeCompare(String(b.hoja));
    return Number(a.fila || 0) - Number(b.fila || 0);
  });

  return {
    ok: true,
    fuente: "google-sheets",
    capacidadCorreccion: true,
    totalHojas: contexto.totalHojas,
    totalRegistros: contexto.totalRegistros,
    totalCasos: casos.length,
    seguros: casos.filter(function(caso) { return caso.seguro === true; }).length,
    manuales: casos.filter(function(caso) { return caso.seguro !== true; }).length,
    hojas: solicitadas,
    casos: casos,
    mensaje: casos.length
      ? "Análisis finalizado sin modificar datos."
      : "No se detectaron inconsistencias en las hojas analizadas."
  };
}

function construirContextoMantenimiento_(ss, nombres) {
  var hojas = {};
  var totalRegistros = 0;
  var totalHojas = 0;

  nombres.forEach(function(nombre) {
    var sheet = ss.getSheetByName(nombre);
    var info;

    if (!sheet) {
      hojas[nombre] = {
        nombre: nombre,
        existe: false,
        sheet: null,
        encabezados: [],
        mapa: {},
        filas: []
      };
      return;
    }

    info = leerHojaMantenimiento_(sheet);
    hojas[nombre] = info;
    totalHojas += 1;
    totalRegistros += info.filas.length;
  });

  return {
    ss: ss,
    hojas: hojas,
    totalHojas: totalHojas,
    totalRegistros: totalRegistros
  };
}

function leerHojaMantenimiento_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  var valores;
  var encabezados;
  var mapa = {};
  var filas = [];

  if (lastRow < 1 || lastColumn < 1) {
    return {
      nombre: sheet.getName(),
      existe: true,
      sheet: sheet,
      encabezados: [],
      mapa: {},
      filas: []
    };
  }

  valores = sheet.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  encabezados = valores[0].map(function(valor) { return String(valor || "").trim(); });

  encabezados.forEach(function(nombre, indice) {
    var clave = normalizarClaveMantenimiento_(nombre);
    if (clave && mapa[clave] === undefined) mapa[clave] = indice;
  });

  for (var i = 1; i < valores.length; i += 1) {
    if (!filaTieneDatosMantenimiento_(valores[i])) continue;
    filas.push({
      numero: i + 1,
      valores: valores[i].slice(),
      objeto: filaAObjetoMantenimiento_(encabezados, valores[i]),
      firma: firmaFilaMantenimiento_(valores[i])
    });
  }

  return {
    nombre: sheet.getName(),
    existe: true,
    sheet: sheet,
    encabezados: encabezados,
    mapa: mapa,
    filas: filas
  };
}

function analizarEncabezadosMantenimiento_(contexto, casos) {
  Object.keys(contexto.hojas).forEach(function(nombre) {
    var info = contexto.hojas[nombre];
    var vistos = {};
    var duplicados = [];

    if (!info.existe) {
      casos.push(crearCasoMantenimiento_({
        hoja: nombre,
        fila: 0,
        problema: "La hoja no existe",
        correccion: "Crear o restaurar la hoja antes de ejecutar reparaciones",
        seguro: false,
        tipo: "HOJA_AUSENTE"
      }));
      return;
    }

    info.encabezados.forEach(function(encabezado) {
      var clave = normalizarClaveMantenimiento_(encabezado);
      if (!clave) return;
      if (vistos[clave]) duplicados.push(encabezado);
      vistos[clave] = true;
    });

    if (duplicados.length) {
      casos.push(crearCasoMantenimiento_({
        hoja: nombre,
        fila: 1,
        problema: "Encabezados duplicados: " + duplicados.join(", "),
        correccion: "Revisar manualmente los nombres de columnas para evitar pérdida de datos",
        seguro: false,
        tipo: "ENCABEZADOS_DUPLICADOS"
      }));
    }
  });
}

function analizarBaseEstudiantesMantenimiento_(contexto, casos) {
  var info = contexto.hojas.BaseEstudiantes;
  var grupos = {};

  if (!info || !info.existe) return;

  info.filas.forEach(function(fila) {
    var cedula = obtenerCampoMantenimiento_(fila.objeto, [
      "numeroidentificacion", "cedula", "identificacion"
    ]);
    var clave = normalizarCedulaMantenimiento_(cedula);

    if (!clave) {
      casos.push(crearCasoDesdeFilaMantenimiento_(info, fila, {
        problema: "Estudiante sin número de identificación",
        correccion: "Completar la cédula después de verificar el registro",
        seguro: false,
        tipo: "ESTUDIANTE_SIN_CEDULA"
      }));
      return;
    }

    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(fila);
  });

  marcarDuplicadosMantenimiento_(info, grupos, casos, "Estudiante duplicado");
}

function analizarEnviosMantenimiento_(contexto, casos) {
  var info = contexto.hojas.Envios;
  var grupos = {};

  if (!info || !info.existe) return;

  info.filas.forEach(function(fila) {
    var cedula = normalizarCedulaMantenimiento_(obtenerCampoMantenimiento_(fila.objeto, [
      "cedula", "numeroidentificacion", "identificacion"
    ]));
    var periodo = normalizarTextoMantenimiento_(obtenerCampoMantenimiento_(fila.objeto, [
      "periodo", "periodoid", "periodolabel", "periodotexto"
    ]));
    var clave = cedula ? cedula + "__" + (periodo || "sin_periodo") : "";
    var titulos = [
      obtenerCampoMantenimiento_(fila.objeto, ["titulo1", "propuesta1"]),
      obtenerCampoMantenimiento_(fila.objeto, ["titulo2", "propuesta2"]),
      obtenerCampoMantenimiento_(fila.objeto, ["titulo3", "propuesta3"])
    ];
    var vistos = {};
    var repetidos = [];

    titulos.forEach(function(titulo) {
      var normal = normalizarTextoMantenimiento_(titulo);
      if (!normal) return;
      if (vistos[normal]) repetidos.push(String(titulo || "").trim());
      vistos[normal] = true;
    });

    if (repetidos.length) {
      casos.push(crearCasoDesdeFilaMantenimiento_(info, fila, {
        problema: "El envío contiene propuestas de título repetidas",
        correccion: "Revisar el envío y conservar únicamente propuestas distintas",
        seguro: false,
        tipo: "TITULOS_REPETIDOS",
        cedula: cedula,
        periodo: periodo
      }));
    }

    if (!cedula) {
      casos.push(crearCasoDesdeFilaMantenimiento_(info, fila, {
        problema: "Envío sin cédula",
        correccion: "Completar la identificación después de verificar al estudiante",
        seguro: false,
        tipo: "ENVIO_SIN_CEDULA",
        periodo: periodo
      }));
      return;
    }

    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(fila);
  });

  marcarDuplicadosMantenimiento_(info, grupos, casos, "Envío duplicado");
}

function analizarCoordinadoresMantenimiento_(contexto, casos) {
  var info = contexto.hojas.Coordinadores;
  var grupos = {};

  if (!info || !info.existe) return;

  info.filas.forEach(function(fila) {
    var id = obtenerCampoMantenimiento_(fila.objeto, [
      "id", "coordinadorid", "correo", "email", "nombre"
    ]);
    var clave = normalizarTextoMantenimiento_(id);

    if (!clave) {
      casos.push(crearCasoDesdeFilaMantenimiento_(info, fila, {
        problema: "Coordinador sin identificador",
        correccion: "Completar el identificador o correo después de verificar el registro",
        seguro: false,
        tipo: "COORDINADOR_SIN_ID"
      }));
      return;
    }

    if (!grupos[clave]) grupos[clave] = [];
    grupos[clave].push(fila);
  });

  marcarDuplicadosMantenimiento_(info, grupos, casos, "Coordinador duplicado");
}

function analizarPendientesMantenimiento_(contexto, casos) {
  var pendientes = contexto.hojas.PendientesSync;
  var envios = contexto.hojas.Envios;
  var existentes = {};

  if (!pendientes || !pendientes.existe || !envios || !envios.existe) return;

  envios.filas.forEach(function(fila) {
    var clave = claveCedulaPeriodoMantenimiento_(fila.objeto);
    if (clave) existentes[clave] = true;
  });

  pendientes.filas.forEach(function(fila) {
    var clave = claveCedulaPeriodoMantenimiento_(fila.objeto);
    if (!clave || !existentes[clave]) return;

    casos.push(crearCasoDesdeFilaMantenimiento_(pendientes, fila, {
      problema: "El registro pendiente ya existe en Envios",
      correccion: "Confirmar la sincronización y retirar el pendiente después de respaldarlo",
      seguro: false,
      tipo: "PENDIENTE_YA_SINCRONIZADO",
      cedula: obtenerCampoMantenimiento_(fila.objeto, ["cedula", "numeroidentificacion"]),
      periodo: obtenerCampoMantenimiento_(fila.objeto, ["periodo", "periodoid", "periodolabel"])
    }));
  });
}

function marcarDuplicadosMantenimiento_(info, grupos, casos, etiqueta) {
  Object.keys(grupos).forEach(function(clave) {
    var grupo = grupos[clave];
    var firmaBase;
    var exactos;

    if (grupo.length < 2) return;

    firmaBase = grupo[0].firma;
    exactos = grupo.every(function(fila) { return fila.firma === firmaBase; });

    grupo.forEach(function(fila, indice) {
      var seguro = exactos && indice > 0;
      casos.push(crearCasoDesdeFilaMantenimiento_(info, fila, {
        problema: exactos
          ? etiqueta + " exacto"
          : etiqueta + " con información diferente",
        correccion: seguro
          ? "Respaldar esta copia y eliminar la fila duplicada"
          : "Comparar manualmente los registros antes de fusionar o eliminar",
        seguro: seguro,
        tipo: exactos ? "DUPLICADO_EXACTO" : "DUPLICADO_CONFLICTO",
        datos: seguro ? { accion: "ELIMINAR_FILA_DUPLICADA" } : {}
      }));
    });
  });
}

function crearCasoDesdeFilaMantenimiento_(info, fila, opciones) {
  var opts = opciones || {};
  var objeto = fila.objeto || {};

  return crearCasoMantenimiento_({
    id: info.nombre + "__" + fila.numero + "__" + (opts.tipo || "CASO"),
    hoja: info.nombre,
    fila: fila.numero,
    idRegistro: obtenerCampoMantenimiento_(objeto, [
      "idregistro", "id", "envioid", "coordinadorid"
    ]),
    cedula: opts.cedula || obtenerCampoMantenimiento_(objeto, [
      "cedula", "numeroidentificacion", "identificacion"
    ]),
    periodo: opts.periodo || obtenerCampoMantenimiento_(objeto, [
      "periodo", "periodoid", "periodolabel", "periodotexto"
    ]),
    problema: opts.problema,
    correccion: opts.correccion,
    seguro: opts.seguro === true,
    tipo: opts.tipo,
    firmaOriginal: fila.firma,
    datos: opts.datos || {}
  });
}

function crearCasoMantenimiento_(opciones) {
  var opts = opciones || {};
  return {
    id: String(opts.id || (opts.hoja || "Hoja") + "__" + (opts.fila || 0)),
    hoja: String(opts.hoja || ""),
    fila: Number(opts.fila || 0),
    idRegistro: String(opts.idRegistro || ""),
    cedula: String(opts.cedula || ""),
    periodo: String(opts.periodo || ""),
    problemas: [String(opts.problema || "Inconsistencia")],
    acciones: [String(opts.correccion || "Revisión manual")],
    seguro: opts.seguro === true,
    tipo: String(opts.tipo || ""),
    firmaOriginal: String(opts.firmaOriginal || ""),
    datos: opts.datos && typeof opts.datos === "object" ? opts.datos : {}
  };
}

function corregirGoogleSheetsMantenimiento_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var casos = payload && Array.isArray(payload.casos) ? payload.casos : [];
  var administrador = String(payload && payload.administrador || "administrador");
  var historial = obtenerHojaHistorialMantenimiento_(ss);
  var resultados = [];
  var validos = casos.filter(function(caso) {
    return caso && caso.seguro === true &&
      caso.datos && caso.datos.accion === "ELIMINAR_FILA_DUPLICADA";
  });

  validos.sort(function(a, b) {
    if (a.hoja !== b.hoja) return String(a.hoja).localeCompare(String(b.hoja));
    return Number(b.fila || 0) - Number(a.fila || 0);
  });

  validos.forEach(function(caso) {
    var resultado;
    try {
      resultado = ejecutarCorreccionMantenimiento_(ss, historial, caso, administrador);
    } catch (error) {
      resultado = {
        ok: false,
        id: String(caso.id || ""),
        hoja: String(caso.hoja || ""),
        fila: Number(caso.fila || 0),
        error: error && error.message ? error.message : String(error)
      };
    }
    resultados.push(resultado);
  });

  return {
    ok: resultados.every(function(r) { return r.ok === true; }),
    procesados: resultados.length,
    correctos: resultados.filter(function(r) { return r.ok === true; }).length,
    errores: resultados.filter(function(r) { return r.ok !== true; }).length,
    resultados: resultados,
    mensaje: resultados.length
      ? "Correcciones procesadas con respaldo previo."
      : "No se recibieron correcciones seguras compatibles."
  };
}

function ejecutarCorreccionMantenimiento_(ss, historial, caso, administrador) {
  var hoja = ss.getSheetByName(String(caso.hoja || ""));
  var fila = Number(caso.fila || 0);
  var lastColumn;
  var valores;
  var firmaActual;

  if (!hoja) throw new Error("La hoja " + caso.hoja + " no existe.");
  if (fila < 2 || fila > hoja.getLastRow()) throw new Error("La fila indicada ya no existe.");

  lastColumn = hoja.getLastColumn();
  valores = hoja.getRange(fila, 1, 1, lastColumn).getDisplayValues()[0];
  firmaActual = firmaFilaMantenimiento_(valores);

  if (!caso.firmaOriginal || firmaActual !== String(caso.firmaOriginal)) {
    throw new Error("La fila cambió después del análisis. Debe analizarse nuevamente.");
  }

  registrarHistorialMantenimiento_(historial, {
    fecha: new Date(),
    hojaOriginal: hoja.getName(),
    filaOriginal: fila,
    idRegistro: caso.idRegistro || "",
    cedula: caso.cedula || "",
    periodo: caso.periodo || "",
    problema: Array.isArray(caso.problemas) ? caso.problemas.join("; ") : "",
    correccionAplicada: "ELIMINAR_FILA_DUPLICADA",
    datosAnteriores: JSON.stringify(valores),
    administrador: administrador,
    resultado: "RESPALDADO_Y_ELIMINADO"
  });

  hoja.deleteRow(fila);

  return {
    ok: true,
    id: String(caso.id || ""),
    hoja: hoja.getName(),
    fila: fila,
    accion: "ELIMINAR_FILA_DUPLICADA"
  };
}

function obtenerHojaHistorialMantenimiento_(ss) {
  var hoja = ss.getSheetByName(MANTENIMIENTO_HISTORIAL_);
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

  if (!hoja) hoja = ss.insertSheet(MANTENIMIENTO_HISTORIAL_);
  if (hoja.getLastRow() === 0) hoja.appendRow(encabezados);

  return hoja;
}

function registrarHistorialMantenimiento_(hoja, registro) {
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

function listarHistorialReparacionesMantenimiento_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(MANTENIMIENTO_HISTORIAL_);
  var limite = Math.max(1, Math.min(500, Number(payload && payload.limite || 100)));
  var lastRow;
  var lastColumn;
  var inicio;
  var valores;
  var encabezados;
  var registros;

  if (!hoja || hoja.getLastRow() < 2) {
    return { ok: true, total: 0, historial: [] };
  }

  lastRow = hoja.getLastRow();
  lastColumn = hoja.getLastColumn();
  inicio = Math.max(2, lastRow - limite + 1);
  valores = hoja.getRange(1, 1, lastRow, lastColumn).getDisplayValues();
  encabezados = valores[0];
  registros = valores.slice(inicio - 1).map(function(fila) {
    return filaAObjetoMantenimiento_(encabezados, fila);
  }).reverse();

  return {
    ok: true,
    total: registros.length,
    historial: registros
  };
}

function normalizarHojasSolicitadas_(valor) {
  var lista = valor;

  if (typeof lista === "string") {
    try {
      lista = JSON.parse(lista);
    } catch (error) {
      lista = lista.split(",");
    }
  }

  if (!Array.isArray(lista) || !lista.length) lista = MANTENIMIENTO_HOJAS_.slice();

  return lista.map(function(nombre) {
    return String(nombre || "").trim();
  }).filter(function(nombre, indice, arreglo) {
    return nombre && arreglo.indexOf(nombre) === indice;
  });
}

function filaAObjetoMantenimiento_(encabezados, fila) {
  var objeto = {};
  encabezados.forEach(function(encabezado, indice) {
    objeto[normalizarClaveMantenimiento_(encabezado) || ("columna_" + (indice + 1))] = fila[indice];
  });
  return objeto;
}

function obtenerCampoMantenimiento_(objeto, claves) {
  var data = objeto || {};
  for (var i = 0; i < claves.length; i += 1) {
    var clave = normalizarClaveMantenimiento_(claves[i]);
    if (data[clave] !== undefined && String(data[clave] || "").trim()) {
      return String(data[clave] || "").trim();
    }
  }
  return "";
}

function claveCedulaPeriodoMantenimiento_(objeto) {
  var cedula = normalizarCedulaMantenimiento_(obtenerCampoMantenimiento_(objeto, [
    "cedula", "numeroidentificacion", "identificacion"
  ]));
  var periodo = normalizarTextoMantenimiento_(obtenerCampoMantenimiento_(objeto, [
    "periodo", "periodoid", "periodolabel", "periodotexto"
  ]));
  return cedula ? cedula + "__" + (periodo || "sin_periodo") : "";
}

function firmaFilaMantenimiento_(valores) {
  var texto = JSON.stringify((valores || []).map(function(valor) {
    return String(valor === null || valor === undefined ? "" : valor);
  }));
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, texto, Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes);
}

function normalizarCedulaMantenimiento_(valor) {
  return String(valor || "").replace(/\D/g, "");
}

function normalizarClaveMantenimiento_(valor) {
  return normalizarTextoMantenimiento_(valor).replace(/\s+/g, "");
}

function normalizarTextoMantenimiento_(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function filaTieneDatosMantenimiento_(fila) {
  return (fila || []).some(function(valor) {
    return String(valor === null || valor === undefined ? "" : valor).trim() !== "";
  });
}
