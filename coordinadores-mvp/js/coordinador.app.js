/* =========================================================
Nombre completo: carga.app.js
Ruta o ubicación: /Requisitos/Carga/carga.app.js
Función o funciones:
- Orquestar lectura, normalización, validación y guardado de Carga.
- Trabajar siempre con período seleccionado antes de guardar.
- Mantener estado centralizado en CargaState.
- No mostrar vista previa obligatoria; solo prepara datos para resumen.
Con qué se conecta:
- carga.state.js
- carga.config.js
- readers/carga.reader.file.js
- readers/carga.reader.clipboard.js
- process/carga.normalizer.js
- process/carga.validator.js
- process/carga.preview.js
- process/carga.report.js
- process/carga.save.js
========================================================= */
(function(window){
  "use strict";

  var cfg = window.CargaConfig;
  var state = window.CargaState;

  if(!cfg || !state){
    throw new Error("CargaConfig y CargaState deben cargarse antes de CargaApp.");
  }

  function text(value){
    return String(value == null ? "" : value).trim();
  }

  function clone(value){
    if(value === undefined){ return undefined; }
    try{ return JSON.parse(JSON.stringify(value)); }
    catch(error){ return value; }
  }

  function emit(name, detail){
    try{
      window.dispatchEvent(new CustomEvent(name, { detail: detail || {} }));
    }catch(error){}
  }

  function localPeriod(){
    var id = "";
    var label = "";

    try{
      id = text(localStorage.getItem("carga.periodoSeleccionado"));
      label = text(localStorage.getItem("carga.periodoSeleccionadoLabel"));
    }catch(error){}

    return {
      periodoId: id,
      periodoLabel: label || id,
      periodoCanonicoId: id,
      periodoCanonicoLabel: label || id
    };
  }

  function mergeOptions(base, extra){
    base = base || {};
    extra = extra || {};

    var period = localPeriod();
    var merged = Object.assign({}, period, base, extra);

    merged.periodoId = text(merged.periodoCanonicoId || merged.periodoId || merged.id || period.periodoId);
    merged.periodoLabel = text(merged.periodoCanonicoLabel || merged.periodoLabel || merged.label || period.periodoLabel || merged.periodoId);
    merged.periodoCanonicoId = merged.periodoId;
    merged.periodoCanonicoLabel = merged.periodoLabel;

    return merged;
  }

  function requireModule(name, method){
    var mod = window[name];
    if(!mod){
      throw new Error(name + " no está disponible.");
    }
    if(method && typeof mod[method] !== "function"){
      throw new Error(name + "." + method + " no está disponible.");
    }
    return mod;
  }

  function normalizeRows(rows, options){
    var normalizer = requireModule("CargaNormalizer", "normalizeRows");
    return normalizer.normalizeRows(rows, options || {});
  }

  function validate(normalized){
    var validator = requireModule("CargaValidator", "validate");
    return validator.validate(normalized || {});
  }

  function buildPreview(normalized, validation){
    if(window.CargaPreview && typeof window.CargaPreview.build === "function"){
      try{
        return window.CargaPreview.build(normalized || {}, validation || {});
      }catch(error){
        console.warn("[CargaApp] No se pudo construir preview interno", error);
      }
    }
    return { rows: [] };
  }

  function processRows(rows, options){
    options = mergeOptions(options || {});
    rows = Array.isArray(rows) ? rows : [];

    state.setStatus(cfg.estados.mapping, "Normalizando datos");

    var normalized = normalizeRows(rows, options);
    normalized.periodoDetectado = normalized.periodoDetectado || {};
    normalized.periodoDetectado.periodoId = text(normalized.periodoDetectado.periodoId || options.periodoId);
    normalized.periodoDetectado.periodoLabel = text(normalized.periodoDetectado.periodoLabel || options.periodoLabel || options.periodoId);
    normalized.periodoDetectado.periodoCanonicoId = normalized.periodoDetectado.periodoId;
    normalized.periodoDetectado.periodoCanonicoLabel = normalized.periodoDetectado.periodoLabel;
    normalized.fileName = text(normalized.fileName || options.fileName || "");
    normalized.origen = text(normalized.origen || options.origen || "");

    state.patch({
      rows: rows,
      normalized: normalized,
      origen: normalized.origen,
      fileName: normalized.fileName
    });

    state.setStatus(cfg.estados.validating, "Validando datos");

    var validation = validate(normalized);
    validation = validation || { ok: false, errors: [], warnings: [] };
    validation.errors = Array.isArray(validation.errors) ? validation.errors : [];
    validation.warnings = Array.isArray(validation.warnings) ? validation.warnings : [];

    var preview = buildPreview(normalized, validation);

    state.patch({
      preview: preview && Array.isArray(preview.rows) ? preview.rows : [],
      errors: validation.errors,
      warnings: validation.warnings
    });

    state.setStatus(
      validation.ok ? cfg.estados.ready : cfg.estados.error,
      validation.ok ? "Carga lista" : "Carga con errores"
    );

    emit("carga:processed", {
      total: rows.length,
      ok: !!validation.ok,
      errors: validation.errors.length,
      warnings: validation.warnings.length,
      periodoId: normalized.periodoDetectado.periodoId,
      periodoLabel: normalized.periodoDetectado.periodoLabel,
      fileName: normalized.fileName
    });

    return {
      normalized: normalized,
      validation: validation,
      preview: preview
    };
  }

  function readFile(file, options){
    options = mergeOptions(options || {}, {
      fileName: file && file.name ? file.name : ""
    });

    state.reset();
    state.setStatus(cfg.estados.reading, "Leyendo archivo");

    return requireModule("CargaReaderFile", "read").read(file).then(function(result){
      result = result || {};

      var meta = mergeOptions(options, {
        origen: result.origen || "archivo",
        fileName: result.fileName || options.fileName,
        detectedType: result.detectedType || result.tipo || "",
        encoding: result.encoding || "",
        sheetName: result.sheetName || "",
        warnings: result.warnings || []
      });

      state.patch({
        origen: meta.origen,
        fileName: meta.fileName,
        rows: Array.isArray(result.rows) ? result.rows : []
      });

      if(Array.isArray(result.warnings) && result.warnings.length){
        state.patch({ warnings: result.warnings.slice() });
      }

      return processRows(result.rows || [], meta);
    }).catch(function(error){
      state.setStatus(cfg.estados.error, error && error.message ? error.message : "No se pudo leer el archivo");
      throw error;
    });
  }

  function readClipboard(value, options){
    options = mergeOptions(options || {}, {
      origen: "clipboard",
      fileName: "pegado_manual"
    });

    state.reset();
    state.setStatus(cfg.estados.reading, "Leyendo datos pegados");

    return requireModule("CargaReaderClipboard", "read").read(value).then(function(result){
      result = result || {};
      var meta = mergeOptions(options, result);

      state.patch({
        origen: result.origen || "clipboard",
        fileName: result.fileName || "pegado_manual",
        rows: Array.isArray(result.rows) ? result.rows : []
      });

      return processRows(result.rows || [], meta);
    }).catch(function(error){
      state.setStatus(cfg.estados.error, error && error.message ? error.message : "No se pudo leer el pegado");
      throw error;
    });
  }

  function buildReport(result, current){
    current = current || state.get();
    result = result || {};

    var validation = {
      ok: current.errors.length === 0,
      errors: current.errors || [],
      warnings: current.warnings || [],
      total: current.rows.length
    };

    if(window.CargaReport && typeof window.CargaReport.build === "function"){
      try{
        return window.CargaReport.build(result, validation, current);
      }catch(error){
        console.warn("[CargaApp] No se pudo construir reporte con CargaReport", error);
      }
    }

    return Object.assign({
      ok: result.ok !== false,
      total: result.total || result.totalEntrada || current.rows.length,
      saved: result.saved || result.guardados || 0,
      updated: result.updated || result.actualizados || 0,
      merged: result.merged || result.duplicados || 0,
      warnings: result.warnings || result.advertencias || validation.warnings,
      errors: result.errors || result.errores || validation.errors,
      periodoId: result.periodoId || (current.normalized && current.normalized.periodoDetectado && current.normalized.periodoDetectado.periodoId) || "",
      periodoLabel: result.periodoLabel || (current.normalized && current.normalized.periodoDetectado && current.normalized.periodoDetectado.periodoLabel) || ""
    }, result);
  }

  function save(options){
    options = mergeOptions(options || {});

    var current = state.get();

    if(!current.normalized){
      return Promise.resolve({
        ok: false,
        total: 0,
        saved: 0,
        updated: 0,
        merged: 0,
        errors: 1,
        warnings: 0,
        message: "Primero lee un archivo antes de guardar."
      });
    }

    state.setStatus(cfg.estados.committing, "Guardando en BDLocal");

    return requireModule("CargaSave", "save").save(
      clone(current.normalized),
      {
        errors: current.errors || [],
        warnings: current.warnings || [],
        ok: !current.errors || current.errors.length === 0
      },
      options
    ).then(function(result){
      var latest = state.get();
      var report = buildReport(result, latest);

      state.patch({ lastResult: report });
      state.setStatus(
        report.ok ? cfg.estados.done : cfg.estados.error,
        report.ok ? "Carga guardada" : (report.message || "Carga no guardada")
      );

      emit("carga:saved", report);
      return report;
    }).catch(function(error){
      state.setStatus(cfg.estados.error, error && error.message ? error.message : "No se pudo guardar");
      emit("carga:save-error", { error: error && error.message ? error.message : String(error) });
      throw error;
    });
  }

  window.CargaApp = {
    processRows: processRows,
    readFile: readFile,
    readClipboard: readClipboard,
    save: save,
    state: state.get
  };
})(window);