/**
 * Eliminación segura de coordinadores en la hoja Coordinadores.
 *
 * Este módulo amplía manejarAccionMantenimiento_ sin modificar el router
 * principal. Después de copiarlo al proyecto de Apps Script, vuelve a
 * implementar la aplicación web para activar ELIMINAR_COORDINADOR.
 */

var MANEJAR_ACCION_MANTENIMIENTO_COORDINADORES_BASE_ =
  typeof manejarAccionMantenimiento_ === "function"
    ? manejarAccionMantenimiento_
    : null;

manejarAccionMantenimiento_ = function(accion, datos) {
  var tipo = String(accion || "").trim().toUpperCase();

  if (tipo === "ELIMINAR_COORDINADOR") {
    return eliminarCoordinadorMantenimiento_(datos || {});
  }

  if (MANEJAR_ACCION_MANTENIMIENTO_COORDINADORES_BASE_) {
    return MANEJAR_ACCION_MANTENIMIENTO_COORDINADORES_BASE_(accion, datos);
  }

  return null;
};

function eliminarCoordinadorMantenimiento_(payload) {
  var lock = LockService.getDocumentLock();
  var id = String(
    payload && (
      payload.id ||
      payload.idRegistro ||
      payload.coordinadorId ||
      payload._docId
    ) || ""
  ).trim();
  var administrador = String(payload && payload.administrador || "administrador");
  var ss;
  var hoja;
  var valores;
  var encabezados;
  var mapa;
  var columnaId;
  var columnaCarreras;
  var columnaAsignadas;
  var filaObjetivo = 0;
  var filaAnterior;
  var carrerasLiberadas;
  var tokensLiberados;
  var historial;

  if (!id) {
    return {
      ok: false,
      codigo: "COORDINADOR_ID_VACIO",
      mensaje: "No se recibió el ID del coordinador."
    };
  }

  lock.waitLock(30000);

  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    hoja = ss.getSheetByName("Coordinadores");

    if (!hoja || hoja.getLastRow() < 2 || hoja.getLastColumn() < 1) {
      return {
        ok: false,
        codigo: "HOJA_COORDINADORES_VACIA",
        mensaje: "La hoja Coordinadores no existe o no contiene registros."
      };
    }

    valores = hoja
      .getRange(1, 1, hoja.getLastRow(), hoja.getLastColumn())
      .getDisplayValues();
    encabezados = valores[0].map(function(valor) {
      return String(valor || "").trim();
    });
    mapa = mapaEncabezadosCoordinador_(encabezados);
    columnaId = buscarColumnaCoordinador_(mapa, [
      "id",
      "idregistro",
      "coordinadorid"
    ]);
    columnaCarreras = buscarColumnaCoordinador_(mapa, ["carreras"]);
    columnaAsignadas = buscarColumnaCoordinador_(mapa, [
      "carrerasasignadas",
      "asignaciones"
    ]);

    if (columnaId < 0) {
      return {
        ok: false,
        codigo: "COLUMNA_ID_AUSENTE",
        mensaje: "La hoja Coordinadores no tiene una columna de identificación reconocida."
      };
    }

    for (var i = 1; i < valores.length; i += 1) {
      if (normalizarIdCoordinador_(valores[i][columnaId]) === normalizarIdCoordinador_(id)) {
        filaObjetivo = i + 1;
        filaAnterior = valores[i].slice();
        break;
      }
    }

    if (!filaObjetivo) {
      return {
        ok: false,
        codigo: "COORDINADOR_NO_ENCONTRADO",
        mensaje: "No se encontró el coordinador " + id + " en Google Sheets."
      };
    }

    carrerasLiberadas = obtenerCarrerasFilaCoordinador_(
      filaAnterior,
      columnaCarreras,
      columnaAsignadas
    );
    tokensLiberados = crearMapaCarrerasCoordinador_(carrerasLiberadas);

    if (Object.keys(tokensLiberados).length) {
      liberarCarrerasEnCoordinadores_(
        hoja,
        valores,
        filaObjetivo,
        columnaCarreras,
        columnaAsignadas,
        tokensLiberados
      );
    }

    if (typeof obtenerHojaHistorialMantenimiento_ === "function" &&
        typeof registrarHistorialMantenimiento_ === "function") {
      historial = obtenerHojaHistorialMantenimiento_(ss);
      registrarHistorialMantenimiento_(historial, {
        fecha: new Date(),
        hojaOriginal: "Coordinadores",
        filaOriginal: filaObjetivo,
        idRegistro: id,
        cedula: "",
        periodo: "",
        problema: "Eliminación administrativa de coordinador",
        correccionAplicada: "ELIMINAR_COORDINADOR",
        datosAnteriores: JSON.stringify(filaAnterior),
        administrador: administrador,
        resultado: "RESPALDADO_Y_ELIMINADO"
      });
    }

    hoja.deleteRow(filaObjetivo);

    return {
      ok: true,
      fuente: "google-sheets",
      coordinadorId: id,
      filaEliminada: filaObjetivo,
      carrerasLiberadas: carrerasLiberadas,
      totalCarrerasLiberadas: carrerasLiberadas.length,
      mensaje: carrerasLiberadas.length
        ? "Coordinador eliminado y carreras liberadas correctamente."
        : "Coordinador eliminado correctamente."
    };
  } catch (error) {
    return {
      ok: false,
      codigo: "ERROR_ELIMINAR_COORDINADOR",
      mensaje: error && error.message ? error.message : String(error)
    };
  } finally {
    lock.releaseLock();
  }
}

function mapaEncabezadosCoordinador_(encabezados) {
  var mapa = {};

  (encabezados || []).forEach(function(encabezado, indice) {
    var clave = normalizarClaveCoordinador_(encabezado);
    if (clave && mapa[clave] === undefined) mapa[clave] = indice;
  });

  return mapa;
}

function buscarColumnaCoordinador_(mapa, candidatos) {
  for (var i = 0; i < candidatos.length; i += 1) {
    var clave = normalizarClaveCoordinador_(candidatos[i]);
    if (mapa[clave] !== undefined) return mapa[clave];
  }
  return -1;
}

function obtenerCarrerasFilaCoordinador_(fila, columnaCarreras, columnaAsignadas) {
  var salida = [];
  var vistos = {};
  var listas = [];

  if (columnaCarreras >= 0) listas.push(parsearListaCoordinador_(fila[columnaCarreras]).lista);
  if (columnaAsignadas >= 0) listas.push(parsearListaCoordinador_(fila[columnaAsignadas]).lista);

  listas.forEach(function(lista) {
    lista.forEach(function(item) {
      var nombre = nombreCarreraCoordinador_(item);
      var clave = normalizarCarreraCoordinador_(item);
      if (!clave || vistos[clave]) return;
      vistos[clave] = true;
      salida.push(nombre || String(item || "").trim());
    });
  });

  return salida.filter(function(item) { return String(item || "").trim(); });
}

function liberarCarrerasEnCoordinadores_(
  hoja,
  valores,
  filaObjetivo,
  columnaCarreras,
  columnaAsignadas,
  tokensLiberados
) {
  for (var i = 1; i < valores.length; i += 1) {
    var numeroFila = i + 1;
    if (numeroFila === filaObjetivo) continue;

    if (columnaCarreras >= 0) {
      actualizarCeldaCarrerasCoordinador_(
        hoja,
        numeroFila,
        columnaCarreras,
        valores[i][columnaCarreras],
        tokensLiberados
      );
    }

    if (columnaAsignadas >= 0) {
      actualizarCeldaCarrerasCoordinador_(
        hoja,
        numeroFila,
        columnaAsignadas,
        valores[i][columnaAsignadas],
        tokensLiberados
      );
    }
  }
}

function actualizarCeldaCarrerasCoordinador_(
  hoja,
  numeroFila,
  indiceColumna,
  valorOriginal,
  tokensLiberados
) {
  var parseado = parsearListaCoordinador_(valorOriginal);
  var filtrado = parseado.lista.filter(function(item) {
    return !tokensLiberados[normalizarCarreraCoordinador_(item)];
  });

  if (filtrado.length === parseado.lista.length) return;

  hoja
    .getRange(numeroFila, indiceColumna + 1)
    .setValue(serializarListaCoordinador_(filtrado, parseado.formato));
}

function parsearListaCoordinador_(valor) {
  var texto = String(valor === null || valor === undefined ? "" : valor).trim();
  var data;

  if (!texto) return { lista: [], formato: "texto" };

  if ((texto.charAt(0) === "[" && texto.charAt(texto.length - 1) === "]") ||
      (texto.charAt(0) === "{" && texto.charAt(texto.length - 1) === "}")) {
    try {
      data = JSON.parse(texto);
      if (!Array.isArray(data)) data = [data];
      return { lista: data, formato: "json" };
    } catch (errorJson) {}
  }

  return {
    lista: texto.split(/[,;\n|]+/).map(function(item) {
      return String(item || "").trim();
    }).filter(function(item) { return item; }),
    formato: "texto"
  };
}

function serializarListaCoordinador_(lista, formato) {
  if (formato === "json" || (lista || []).some(function(item) {
    return item && typeof item === "object";
  })) {
    return JSON.stringify(lista || []);
  }

  return (lista || []).map(function(item) {
    return nombreCarreraCoordinador_(item);
  }).filter(function(item) { return item; }).join(", ");
}

function crearMapaCarrerasCoordinador_(carreras) {
  var mapa = {};
  (carreras || []).forEach(function(item) {
    var clave = normalizarCarreraCoordinador_(item);
    if (clave) mapa[clave] = true;
  });
  return mapa;
}

function nombreCarreraCoordinador_(item) {
  if (item && typeof item === "object") {
    return String(
      item.nombreCarrera ||
      item.NombreCarrera ||
      item.codigoCarrera ||
      item.CodigoCarrera ||
      item.key ||
      item.carrera ||
      item.nombre ||
      ""
    ).trim();
  }
  return String(item || "").trim();
}

function normalizarCarreraCoordinador_(item) {
  return normalizarTextoCoordinador_(nombreCarreraCoordinador_(item));
}

function normalizarIdCoordinador_(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .trim()
    .toLowerCase();
}

function normalizarClaveCoordinador_(valor) {
  return normalizarTextoCoordinador_(valor).replace(/\s+/g, "");
}

function normalizarTextoCoordinador_(valor) {
  return String(valor === null || valor === undefined ? "" : valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
