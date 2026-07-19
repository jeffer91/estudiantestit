/**
 * Fuente principal administrativa para Google Sheets.
 *
 * Copia este archivo al proyecto de Apps Script y vuelve a implementar la
 * aplicación web. Amplía manejarAccionMantenimiento_ sin cambiar el router.
 */
var MANEJAR_ACCION_MANTENIMIENTO_FUENTE_PRINCIPAL_BASE_ =
  typeof manejarAccionMantenimiento_ === "function"
    ? manejarAccionMantenimiento_
    : null;

manejarAccionMantenimiento_ = function(accion, datos) {
  var tipo = String(accion || "").trim().toUpperCase();
  var payload = datos && typeof datos === "object" ? datos : {};

  if (tipo === "LISTAR_BASE_ESTUDIANTES") {
    return listarBaseEstudiantesPrincipal_(payload);
  }
  if (tipo === "LISTAR_PERIODOS_TITULACION") {
    return listarPeriodosTitulacionPrincipal_(payload);
  }
  if (tipo === "GUARDAR_PERIODOS_TITULACION") {
    return guardarPeriodosTitulacionPrincipal_(payload);
  }
  if (tipo === "ADMIN_DEVOLVER_TITULOS") {
    return devolverTitulosPrincipal_(payload);
  }
  if (tipo === "ADMIN_ELIMINAR_TITULOS") {
    return eliminarTitulosPrincipal_(payload);
  }

  if (MANEJAR_ACCION_MANTENIMIENTO_FUENTE_PRINCIPAL_BASE_) {
    return MANEJAR_ACCION_MANTENIMIENTO_FUENTE_PRINCIPAL_BASE_(accion, datos);
  }
  return null;
};

var FP_HOJA_CONFIG_ = "Configuracion";
var FP_CLAVE_PERIODOS_ = "periodos_titulacion";
var FP_HOJA_HISTORIAL_ = "HistorialReparaciones";

function listarBaseEstudiantesPrincipal_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var info = leerHojaPrincipal_(ss, "BaseEstudiantes");
  var periodo = normalizarTextoPrincipal_(
    payload && (payload.periodo || payload.periodoId || payload.periodoLabel)
  );
  var estudiantes;

  if (!info.existe) {
    return {
      ok: false,
      codigo: "BASE_ESTUDIANTES_AUSENTE",
      mensaje: "La hoja BaseEstudiantes no existe."
    };
  }

  estudiantes = info.filas.map(function(fila) {
    var objeto = Object.assign({}, fila.objeto);
    objeto.__fila = fila.numero;
    return objeto;
  }).filter(function(item) {
    if (!periodo) return true;
    return periodosCoincidenPrincipal_(
      obtenerCampoPrincipal_(item, [
        "periodoid", "periodolabel", "periodo", "periodotexto",
        "ultimoperiodoid", "ultimoperiodolabel"
      ]),
      periodo
    );
  });

  return {
    ok: true,
    fuente: "google-sheets",
    total: estudiantes.length,
    estudiantes: estudiantes
  };
}

function listarPeriodosTitulacionPrincipal_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var guardado = leerConfiguracionPeriodosPrincipal_(ss);
  var detectados = detectarPeriodosPrincipal_(ss);
  var mapa = {};
  var periodos = [];

  (guardado.periodos || []).forEach(function(item) {
    agregarPeriodoPrincipal_(periodos, mapa, item, "configuracion");
  });
  detectados.forEach(function(item) {
    agregarPeriodoPrincipal_(periodos, mapa, item, item.origen || "detectado");
  });

  if (!periodos.length) {
    periodos.push({
      id: "2026-02__2026-08",
      label: "Febrero 2026 a Agosto 2026",
      activo: true,
      principal: true,
      origen: "fallback"
    });
  }

  var principal = guardado.principal || {};
  if (!principal.id) {
    principal = periodos.find(function(item) {
      return item.principal === true;
    }) || periodos[0];
  }

  periodos.forEach(function(item) {
    item.principal =
      normalizarTextoPrincipal_(item.id) ===
      normalizarTextoPrincipal_(principal.id);
    if (item.activo === undefined) item.activo = true;
  });

  return {
    ok: true,
    fuente: "google-sheets",
    principal: {
      id: String(principal.id || periodos[0].id),
      label: String(principal.label || periodos[0].label || periodos[0].id)
    },
    periodos: periodos,
    total: periodos.length
  };
}

function guardarPeriodosTitulacionPrincipal_(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var periodos = payload && Array.isArray(payload.periodos)
    ? payload.periodos
    : [];
  var principal = payload && payload.principal || {};
  var activos;
  var hoja;
  var fila;
  var registro;

  if (!periodos.length) {
    return {
      ok: false,
      codigo: "PERIODOS_VACIOS",
      mensaje: "No se recibieron períodos."
    };
  }

  activos = periodos.filter(function(item) {
    return item && item.activo !== false;
  });
  if (!activos.length) {
    return {
      ok: false,
      codigo: "SIN_PERIODOS_ACTIVOS",
      mensaje: "Debe existir al menos un período activo."
    };
  }

  if (!principal.id || !activos.some(function(item) {
    return String(item.id || "") === String(principal.id || "");
  })) {
    principal = activos[0];
  }

  registro = {
    periodos: periodos.map(function(item) {
      return {
        id: String(item.id || ""),
        label: String(item.label || item.id || ""),
        activo: item.activo !== false,
        principal: String(item.id || "") === String(principal.id || "")
      };
    }),
    principal: {
      id: String(principal.id || ""),
      label: String(principal.label || principal.id || "")
    },
    actualizadoEn: new Date().toISOString(),
    administrador: String(payload.administrador || "administrador")
  };

  hoja = obtenerHojaConfiguracionPrincipal_(ss);
  fila = buscarFilaConfiguracionPrincipal_(hoja, FP_CLAVE_PERIODOS_);

  if (fila) {
    hoja.getRange(fila, 2, 1, 3).setValues([[
      JSON.stringify(registro),
      new Date(),
      registro.administrador
    ]]);
  } else {
    hoja.appendRow([
      FP_CLAVE_PERIODOS_,
      JSON.stringify(registro),
      new Date(),
      registro.administrador
    ]);
  }

  return {
    ok: true,
    fuente: "google-sheets",
    principal: registro.principal,
    periodos: registro.periodos,
    mensaje: "Períodos guardados correctamente."
  };
}

function devolverTitulosPrincipal_(payload) {
  var lock = LockService.getDocumentLock();
  var cedula = normalizarCedulaPrincipal_(
    payload && (payload.cedula || payload.numeroIdentificacion)
  );
  var periodo = normalizarTextoPrincipal_(
    payload && (payload.periodo || payload.periodoId || payload.periodoLabel)
  );
  var administrador = String(payload && payload.administrador || "administrador");
  var motivo = String(payload && (payload.motivo || payload.observacion || payload.comentario) || "Devolución administrativa");
  var ss;
  var info;
  var filas;
  var historial;
  var columnas;
  var actualizados = [];

  if (!cedula) {
    return {
      ok: false,
      codigo: "CEDULA_VACIA",
      mensaje: "No se recibió una cédula válida."
    };
  }

  lock.waitLock(30000);
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    info = leerHojaPrincipal_(ss, "Envios");

    if (!info.existe) {
      return {
        ok: false,
        codigo: "HOJA_ENVIOS_AUSENTE",
        mensaje: "La hoja Envios no existe."
      };
    }

    filas = info.filas.filter(function(fila) {
      var cedulaFila = normalizarCedulaPrincipal_(
        obtenerCampoPrincipal_(fila.objeto, [
          "cedula", "numeroidentificacion", "identificacion"
        ])
      );
      var periodoFila = obtenerCampoPrincipal_(fila.objeto, [
        "periodo", "periodoid", "periodolabel", "periodotexto"
      ]);

      return cedulaFila === cedula &&
        (!periodo || periodosCoincidenPrincipal_(periodoFila, periodo));
    });

    if (!filas.length) {
      return {
        ok: false,
        codigo: "ENVIO_NO_ENCONTRADO",
        mensaje: "No se encontró un envío activo para devolver."
      };
    }

    historial = obtenerHistorialPrincipal_(ss);
    columnas = asegurarColumnasDevolucionPrincipal_(info.sheet);

    filas.forEach(function(fila) {
      registrarHistorialPrincipal_(historial, {
        fecha: new Date(),
        hojaOriginal: "Envios",
        filaOriginal: fila.numero,
        idRegistro: obtenerCampoPrincipal_(fila.objeto, [
          "idregistro", "id", "envioid", "tituloid"
        ]),
        cedula: cedula,
        periodo: periodo || obtenerCampoPrincipal_(fila.objeto, [
          "periodo", "periodoid", "periodolabel"
        ]),
        problema: "Devolución administrativa de títulos",
        correccionAplicada: "ADMIN_DEVOLVER_TITULOS",
        datosAnteriores: JSON.stringify(fila.objeto),
        administrador: administrador,
        resultado: "RESPALDADO_Y_DEVUELTO",
        motivo: motivo
      });

      info.sheet.getRange(fila.numero, columnas.estado).setValue("DEVUELTO");
      info.sheet.getRange(fila.numero, columnas.estadoFinal).setValue("DEVUELTO");
      info.sheet.getRange(fila.numero, columnas.permitirReenvio).setValue(true);
      info.sheet.getRange(fila.numero, columnas.motivo).setValue(motivo);
      info.sheet.getRange(fila.numero, columnas.comentario).setValue(motivo);
      info.sheet.getRange(fila.numero, columnas.coordinador).setValue("Administrador");
      info.sheet.getRange(fila.numero, columnas.fechaRevision).setValue(new Date());
      actualizados.push(fila.numero);
    });

    return {
      ok: true,
      fuente: "google-sheets",
      cedula: cedula,
      periodo: periodo,
      totalActualizados: actualizados.length,
      filasActualizadas: actualizados,
      mensaje: "Las propuestas fueron devueltas correctamente."
    };
  } catch (error) {
    return {
      ok: false,
      codigo: "ERROR_DEVOLVER_TITULOS",
      mensaje: error && error.message ? error.message : String(error)
    };
  } finally {
    lock.releaseLock();
  }
}

function asegurarColumnasDevolucionPrincipal_(hoja) {
  var encabezados = hoja
    .getRange(1, 1, 1, hoja.getLastColumn())
    .getDisplayValues()[0]
    .map(function(valor) { return String(valor || "").trim(); });
  var mapa = {};

  encabezados.forEach(function(nombre, indice) {
    mapa[normalizarClavePrincipal_(nombre)] = indice + 1;
  });

  function columna(nombre, aliases) {
    for (var i = 0; i < aliases.length; i += 1) {
      var existente = mapa[normalizarClavePrincipal_(aliases[i])];
      if (existente) return existente;
    }
    var nueva = hoja.getLastColumn() + 1;
    hoja.getRange(1, nueva).setValue(nombre);
    mapa[normalizarClavePrincipal_(nombre)] = nueva;
    return nueva;
  }

  return {
    estado: columna("estado", ["estado"]),
    estadoFinal: columna("estadoFinal", ["estadofinal"]),
    permitirReenvio: columna("permitirReenvio", ["permitirreenvio"]),
    motivo: columna("motivoDevolucion", ["motivodevolucion", "motivo"]),
    comentario: columna("comentarioCoordinador", ["comentariocoordinador", "comentario", "observacion"]),
    coordinador: columna("coordinador", ["coordinador", "coordinadornombre"]),
    fechaRevision: columna("fechaRevision", ["fecharevision", "fecharesolucion"])
  };
}

function eliminarTitulosPrincipal_(payload) {
  var lock = LockService.getDocumentLock();
  var cedula = normalizarCedulaPrincipal_(
    payload && (payload.cedula || payload.numeroIdentificacion)
  );
  var periodo = normalizarTextoPrincipal_(
    payload && (payload.periodo || payload.periodoId || payload.periodoLabel)
  );
  var administrador = String(payload && payload.administrador || "administrador");
  var motivo = String(payload && (payload.motivo || payload.observacion) || "Eliminación administrativa");
  var ss;
  var hojas = ["Envios", "Resoluciones", "PendientesSync"];
  var eliminados = [];
  var historial;

  if (!cedula) {
    return {
      ok: false,
      codigo: "CEDULA_VACIA",
      mensaje: "No se recibió una cédula válida."
    };
  }

  lock.waitLock(30000);
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    historial = obtenerHistorialPrincipal_(ss);

    hojas.forEach(function(nombreHoja) {
      var info = leerHojaPrincipal_(ss, nombreHoja);
      var filas;

      if (!info.existe) return;

      filas = info.filas.filter(function(fila) {
        var cedulaFila = normalizarCedulaPrincipal_(
          obtenerCampoPrincipal_(fila.objeto, [
            "cedula", "numeroidentificacion", "identificacion"
          ])
        );
        var periodoFila = obtenerCampoPrincipal_(fila.objeto, [
          "periodo", "periodoid", "periodolabel", "periodotexto"
        ]);

        return cedulaFila === cedula &&
          (!periodo || periodosCoincidenPrincipal_(periodoFila, periodo));
      });

      filas.sort(function(a, b) {
        return b.numero - a.numero;
      }).forEach(function(fila) {
        registrarHistorialPrincipal_(historial, {
          fecha: new Date(),
          hojaOriginal: nombreHoja,
          filaOriginal: fila.numero,
          idRegistro: obtenerCampoPrincipal_(fila.objeto, [
            "idregistro", "id", "envioid", "tituloid"
          ]),
          cedula: cedula,
          periodo: periodo || obtenerCampoPrincipal_(fila.objeto, [
            "periodo", "periodoid", "periodolabel"
          ]),
          problema: "Eliminación administrativa de títulos",
          correccionAplicada: "ADMIN_ELIMINAR_TITULOS",
          datosAnteriores: JSON.stringify(fila.objeto),
          administrador: administrador,
          resultado: "RESPALDADO_Y_ELIMINADO",
          motivo: motivo
        });

        info.sheet.deleteRow(fila.numero);
        eliminados.push({
          hoja: nombreHoja,
          fila: fila.numero
        });
      });
    });

    return {
      ok: true,
      fuente: "google-sheets",
      cedula: cedula,
      periodo: periodo,
      totalEliminados: eliminados.length,
      eliminados: eliminados,
      mensaje: eliminados.length
        ? "Los registros fueron respaldados y eliminados."
        : "No se encontraron registros activos para eliminar."
    };
  } catch (error) {
    return {
      ok: false,
      codigo: "ERROR_ELIMINAR_TITULOS",
      mensaje: error && error.message ? error.message : String(error)
    };
  } finally {
    lock.releaseLock();
  }
}

function detectarPeriodosPrincipal_(ss) {
  var salida = [];
  var mapa = {};

  ["BaseEstudiantes", "Envios"].forEach(function(nombreHoja) {
    var info = leerHojaPrincipal_(ss, nombreHoja);
    if (!info.existe) return;

    info.filas.forEach(function(fila) {
      var id = String(obtenerCampoPrincipal_(fila.objeto, [
        "periodoid", "ultimoperiodoid", "periodo", "periodolabel"
      ]) || "").trim();
      var label = String(obtenerCampoPrincipal_(fila.objeto, [
        "periodolabel", "ultimoperiodolabel", "periodotexto", "periodo", "periodoid"
      ]) || id).trim();
      var clave = normalizarTextoPrincipal_(id || label);

      if (!clave || mapa[clave]) return;
      mapa[clave] = true;
      salida.push({
        id: id || label,
        label: label || id,
        activo: true,
        principal: false,
        origen: nombreHoja
      });
    });
  });

  salida.sort(function(a, b) {
    return String(b.label || b.id).localeCompare(
      String(a.label || a.id),
      "es",
      { numeric: true }
    );
  });
  return salida;
}

function agregarPeriodoPrincipal_(lista, mapa, item, origen) {
  var id = String(item && (item.id || item.periodoId || item.periodo || item.label) || "").trim();
  var label = String(item && (item.label || item.periodoLabel || item.periodo || item.id) || id).trim();
  var clave = normalizarTextoPrincipal_(id || label);

  if (!clave || mapa[clave]) return;
  mapa[clave] = true;
  lista.push({
    id: id || label,
    label: label || id,
    activo: item && item.activo !== false,
    principal: item && item.principal === true,
    origen: origen || "google-sheets"
  });
}

function leerConfiguracionPeriodosPrincipal_(ss) {
  var hoja = ss.getSheetByName(FP_HOJA_CONFIG_);
  var fila;
  var raw;
  var json;

  if (!hoja || hoja.getLastRow() < 2) return { periodos: [], principal: null };
  fila = buscarFilaConfiguracionPrincipal_(hoja, FP_CLAVE_PERIODOS_);
  if (!fila) return { periodos: [], principal: null };

  raw = String(hoja.getRange(fila, 2).getDisplayValue() || "").trim();
  if (!raw) return { periodos: [], principal: null };

  try {
    json = JSON.parse(raw);
    return {
      periodos: Array.isArray(json.periodos) ? json.periodos : [],
      principal: json.principal || null
    };
  } catch (errorJson) {
    return { periodos: [], principal: null };
  }
}

function obtenerHojaConfiguracionPrincipal_(ss) {
  var hoja = ss.getSheetByName(FP_HOJA_CONFIG_);
  if (!hoja) {
    hoja = ss.insertSheet(FP_HOJA_CONFIG_);
    hoja.appendRow(["clave", "valor", "actualizadoEn", "administrador"]);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function buscarFilaConfiguracionPrincipal_(hoja, clave) {
  var valores;
  if (!hoja || hoja.getLastRow() < 2) return 0;
  valores = hoja.getRange(2, 1, hoja.getLastRow() - 1, 1).getDisplayValues();
  for (var i = 0; i < valores.length; i += 1) {
    if (String(valores[i][0] || "").trim() === clave) return i + 2;
  }
  return 0;
}

function leerHojaPrincipal_(ss, nombre) {
  var sheet = ss.getSheetByName(nombre);
  var valores;
  var encabezados;
  var filas = [];

  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) {
    return {
      existe: false,
      sheet: sheet || null,
      encabezados: [],
      filas: []
    };
  }

  valores = sheet.getRange(
    1,
    1,
    sheet.getLastRow(),
    sheet.getLastColumn()
  ).getDisplayValues();
  encabezados = valores[0].map(function(valor) {
    return String(valor || "").trim();
  });

  for (var i = 1; i < valores.length; i += 1) {
    if (!valores[i].some(function(valor) {
      return String(valor || "").trim();
    })) continue;

    filas.push({
      numero: i + 1,
      objeto: filaAObjetoPrincipal_(encabezados, valores[i])
    });
  }

  return {
    existe: true,
    sheet: sheet,
    encabezados: encabezados,
    filas: filas
  };
}

function filaAObjetoPrincipal_(encabezados, valores) {
  var objeto = {};
  (encabezados || []).forEach(function(encabezado, indice) {
    if (!encabezado) return;
    objeto[encabezado] = valores[indice];
  });
  return objeto;
}

function obtenerCampoPrincipal_(objeto, aliases) {
  var data = objeto || {};
  var mapa = {};
  Object.keys(data).forEach(function(nombre) {
    mapa[normalizarClavePrincipal_(nombre)] = nombre;
  });

  for (var i = 0; i < aliases.length; i += 1) {
    var clave = mapa[normalizarClavePrincipal_(aliases[i])];
    if (
      clave !== undefined &&
      data[clave] !== undefined &&
      data[clave] !== null &&
      String(data[clave]).trim()
    ) {
      return data[clave];
    }
  }
  return "";
}

function obtenerHistorialPrincipal_(ss) {
  if (typeof obtenerHojaHistorialMantenimiento_ === "function") {
    return obtenerHojaHistorialMantenimiento_(ss);
  }

  var hoja = ss.getSheetByName(FP_HOJA_HISTORIAL_);
  if (!hoja) {
    hoja = ss.insertSheet(FP_HOJA_HISTORIAL_);
    hoja.appendRow([
      "fecha", "hojaOriginal", "filaOriginal", "idRegistro", "cedula",
      "periodo", "problema", "correccionAplicada", "datosAnteriores",
      "administrador", "resultado", "motivo"
    ]);
    hoja.setFrozenRows(1);
  }
  return hoja;
}

function registrarHistorialPrincipal_(hoja, item) {
  if (typeof registrarHistorialMantenimiento_ === "function") {
    registrarHistorialMantenimiento_(hoja, item);
    return;
  }

  hoja.appendRow([
    item.fecha || new Date(),
    item.hojaOriginal || "",
    item.filaOriginal || "",
    item.idRegistro || "",
    item.cedula || "",
    item.periodo || "",
    item.problema || "",
    item.correccionAplicada || "",
    item.datosAnteriores || "",
    item.administrador || "",
    item.resultado || "",
    item.motivo || ""
  ]);
}

function periodosCoincidenPrincipal_(a, b) {
  return normalizarTextoPrincipal_(a) === normalizarTextoPrincipal_(b);
}

function normalizarCedulaPrincipal_(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .replace(/\D/g, "");
}

function normalizarClavePrincipal_(valor) {
  return normalizarTextoPrincipal_(valor).replace(/\s+/g, "");
}

function normalizarTextoPrincipal_(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
