/* =========================================================
Archivo: ad-reparar.app.js
Ruta: /administrador/ad-js/ad-reparar.app.js
Función:
- Reparar documentos de titulos con ID incorrecto.
- Analizar campos titulo, propuestas repetidas y documentos duplicados.
- Ejecutar solamente correcciones seguras seleccionadas, con respaldo y log.
========================================================= */
(function(window, document){
  "use strict";

  var casosAnalizados = [];

  function cfg(){ return window.AD_CONFIG || {}; }
  function fs(){
    if (!window.ADFirebaseService) throw new Error("ADFirebaseService no está disponible.");
    return window.ADFirebaseService;
  }
  function ts(){
    if (!window.ADTitulosService) throw new Error("ADTitulosService no está disponible.");
    return window.ADTitulosService;
  }
  function baseRepair(){
    if (!window.ADBaseRepairService) throw new Error("ADBaseRepairService todavía no está disponible.");
    return window.ADBaseRepairService;
  }
  function el(id){ return document.getElementById(id); }
  function txt(v){ return String(v === null || v === undefined ? "" : v).trim(); }
  function val(id){ var x = el(id); return x ? txt(x.value) : ""; }
  function setText(id,v){ var x = el(id); if (x) x.textContent = v; }
  function setHtml(id,v){ var x = el(id); if (x) x.innerHTML = v; }
  function clean(v){ return ts().limpiarCedula ? ts().limpiarCedula(v) : txt(v).replace(/[^0-9A-Za-z]/g, ""); }
  function cols(){ return cfg().colecciones || {}; }
  function esc(v){
    return txt(v)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/\"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }

  function detener(ev){
    if (!ev) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
  }

  function extraerCedula(docId, data){
    var directo = clean((data || {}).cedula || (data || {}).numeroIdentificacion || "");
    var partes;
    if (directo) return directo;
    partes = txt(docId).split("__");
    return clean(partes[partes.length - 1] || docId);
  }

  function historialId(cedula){
    return clean(cedula) + "__REPARACION__" + new Date().toISOString().replace(/[^0-9A-Za-z]/g, "");
  }

  function leerIncorrecto(idViejo){
    var id = txt(idViejo);
    if (!id) return Promise.reject(new Error("Ingresa el ID incorrecto."));
    return fs().leerDocumento(cols().titulos, id).then(function(resp){
      if (!resp.existe) throw new Error("No existe ese documento en titulos.");
      return { id: resp.id, data: resp.data || {} };
    });
  }

  function construirCorrecto(viejo){
    var cedula = extraerCedula(viejo.id, viejo.data);
    if (!cedula) return Promise.reject(new Error("No se pudo extraer la cédula."));
    return ts().buscarEstudiantePorCedula(cedula).then(function(est){
      var nuevo = Object.assign({}, viejo.data || {});
      nuevo.cedula = cedula;
      nuevo.numeroIdentificacion = nuevo.numeroIdentificacion || cedula;
      if (est) {
        nuevo.NombreCarrera = est.NombreCarrera || nuevo.NombreCarrera || "";
        nuevo.CodigoCarrera = est.CodigoCarrera || nuevo.CodigoCarrera || "";
        nuevo.periodoId = est.periodoId || est.ultimoPeriodoId || nuevo.periodoId || "";
        nuevo.periodoLabel = est.periodoLabel || nuevo.periodoLabel || "";
        nuevo.Nombres = est.Nombres || nuevo.Nombres || nuevo.nombres || "";
      }
      nuevo._reparadoDesde = viejo.id;
      nuevo.reparadoEn = fs().fechaCliente();
      nuevo.reparadoPor = cfg().administrador || "administrador";
      return { cedula: cedula, data: nuevo, estudiante: est || null };
    });
  }

  function logReparacion(idViejo, cedula, hid){
    return fs().agregarDocumento(cols().logs, {
      accion: (cfg().accionesLog || {}).firebaseReparado || "ADMIN_FIREBASE_REPARADO",
      idOriginal: idViejo,
      cedula: cedula,
      historialId: hid,
      administrador: cfg().administrador || "administrador",
      origen: "administrador",
      modulo: "reparar_firebase",
      estado: "OK",
      fecha: fs().fechaCliente()
    }).catch(function(){ return { ok:false }; });
  }

  function reparar(idViejo){
    return leerIncorrecto(idViejo).then(function(viejo){
      return construirCorrecto(viejo).then(function(nuevo){
        var hid = historialId(nuevo.cedula);
        var respaldo = Object.assign({}, viejo.data || {}, {
          _idOriginal: viejo.id,
          accionHistorial: "REPARACION_FIREBASE",
          archivadoEn: fs().fechaCliente(),
          archivadoPor: cfg().administrador || "administrador"
        });
        return fs().guardarDocumento(cols().historial, hid, respaldo, { merge:false }).then(function(){
          return fs().guardarDocumento(cols().titulos, nuevo.cedula, nuevo.data, { merge:true });
        }).then(function(){
          return logReparacion(viejo.id, nuevo.cedula, hid);
        }).then(function(){
          return fs().eliminarDocumento(cols().titulos, viejo.id);
        }).then(function(){
          return { ok:true, idViejo: viejo.id, cedula: nuevo.cedula, historialId: hid };
        });
      });
    });
  }

  function detectar(ev){
    detener(ev);
    var id = val("ad-reparar-doc-id");
    setText("ad-resultado-reparar", "Revisando documento...");
    return leerIncorrecto(id).then(function(viejo){
      var ced = extraerCedula(viejo.id, viejo.data);
      setText("ad-resultado-reparar", "Documento encontrado.\nID actual: " + viejo.id + "\nCédula detectada: " + ced + "\nID correcto esperado: " + ced);
    }).catch(function(error){
      setText("ad-resultado-reparar", "Error al detectar:\n" + (error.message || String(error)));
    });
  }

  function ejecutar(ev){
    detener(ev);
    setText("ad-resultado-reparar", "Reparando documento...");
    return reparar(val("ad-reparar-doc-id")).then(function(r){
      setText("ad-resultado-reparar", "Documento reparado correctamente.\nID anterior: " + r.idViejo + "\nID correcto: " + r.cedula + "\nHistorial: " + r.historialId);
      setText("ad-panel-diagnostico", "Reparación completada. Firebase queda con titulos / cedula.");
    }).catch(function(error){
      setText("ad-resultado-reparar", "Error en reparación:\n" + (error.message || String(error)));
      setText("ad-panel-diagnostico", "Error en reparación Firebase.");
    });
  }

  function htmlNormalizador(){
    return [
      '<div class="ad-card ad-base-repair-card" id="ad-base-repair-card">',
      '  <div class="ad-section-head ad-section-head-compact">',
      '    <div>',
      '      <p class="ad-eyebrow">Normalización segura</p>',
      '      <h3>Títulos y documentos duplicados</h3>',
      '      <p class="ad-muted">Primero analiza la colección. Solo las correcciones seguras pueden seleccionarse; los casos ambiguos quedan marcados para revisión manual.</p>',
      '    </div>',
      '    <div class="ad-base-repair-actions">',
      '      <button class="ad-btn ad-btn-secondary" id="ad-btn-analizar-base" type="button">Analizar base</button>',
      '      <button class="ad-btn ad-btn-primary" id="ad-btn-corregir-seleccionados" type="button" disabled>Corregir seleccionados</button>',
      '    </div>',
      '  </div>',
      '  <div id="ad-base-repair-status" class="ad-status-box">Todavía no se ha analizado la colección titulos.</div>',
      '  <div class="ad-table-wrap">',
      '    <table class="ad-table ad-base-repair-table">',
      '      <thead><tr><th>Seleccionar</th><th>Documento</th><th>Cédula</th><th>Período</th><th>Problema</th><th>Corrección propuesta</th><th>Estado</th></tr></thead>',
      '      <tbody id="ad-base-repair-body"><tr><td colspan="7" class="ad-empty">Pulsa Analizar base para buscar inconsistencias.</td></tr></tbody>',
      '    </table>',
      '  </div>',
      '</div>'
    ].join("");
  }

  function instalarNormalizador(){
    var seccion = el("ad-seccion-reparar");
    var tarjetaExistente = el("ad-base-repair-card");
    if (!seccion || tarjetaExistente) return;
    seccion.insertAdjacentHTML("beforeend", htmlNormalizador());

    var analizar = el("ad-btn-analizar-base");
    var corregir = el("ad-btn-corregir-seleccionados");
    var cuerpo = el("ad-base-repair-body");

    if (analizar) analizar.addEventListener("click", analizarBase);
    if (corregir) corregir.addEventListener("click", corregirSeleccionados);
    if (cuerpo) cuerpo.addEventListener("change", actualizarSeleccionados);
  }

  function renderCasos(resultado){
    var filas = [];
    casosAnalizados = resultado.casos || [];

    casosAnalizados.forEach(function(caso, indice){
      filas.push(
        '<tr class="' + (caso.seguro ? 'is-safe' : 'is-manual') + '">' +
          '<td><input class="ad-base-case-check" type="checkbox" data-index="' + indice + '" ' + (caso.seguro ? '' : 'disabled') + ' aria-label="Seleccionar corrección"></td>' +
          '<td><code>' + esc(caso.id) + '</code></td>' +
          '<td>' + esc(caso.cedula || 'Sin cédula') + '</td>' +
          '<td>' + esc(caso.periodo || 'Sin período') + '</td>' +
          '<td>' + esc(caso.problemas.join('; ')) + '</td>' +
          '<td>' + esc(caso.acciones.join('; ')) + '</td>' +
          '<td><span class="ad-badge ' + (caso.seguro ? 'ad-badge-success' : 'ad-badge-warning') + '">' + (caso.seguro ? 'Corrección segura' : 'Revisión manual') + '</span></td>' +
        '</tr>'
      );
    });

    setHtml(
      "ad-base-repair-body",
      filas.length ? filas.join("") : '<tr><td colspan="7" class="ad-empty">No se detectaron inconsistencias en los títulos.</td></tr>'
    );
    setText(
      "ad-base-repair-status",
      "Documentos analizados: " + resultado.totalDocumentos +
      ". Casos detectados: " + resultado.totalCasos +
      ". Seguros: " + resultado.seguros +
      ". Revisión manual: " + resultado.manuales + "."
    );
    actualizarSeleccionados();
  }

  function analizarBase(){
    var boton = el("ad-btn-analizar-base");
    if (boton) boton.disabled = true;
    setText("ad-base-repair-status", "Analizando la colección titulos sin modificar datos...");
    setHtml("ad-base-repair-body", '<tr><td colspan="7" class="ad-empty">Analizando documentos...</td></tr>');

    return Promise.resolve().then(function(){
      return baseRepair().analizarBase();
    }).then(renderCasos).catch(function(error){
      casosAnalizados = [];
      setText("ad-base-repair-status", "No se pudo analizar la base: " + (error.message || String(error)));
      setHtml("ad-base-repair-body", '<tr><td colspan="7" class="ad-empty">Error durante el análisis.</td></tr>');
    }).then(function(){
      if (boton) boton.disabled = false;
    });
  }

  function indicesSeleccionados(){
    return Array.prototype.slice.call(document.querySelectorAll(".ad-base-case-check:checked"))
      .map(function(check){ return Number(check.getAttribute("data-index")); })
      .filter(function(indice){ return Number.isInteger(indice) && casosAnalizados[indice] && casosAnalizados[indice].seguro; });
  }

  function actualizarSeleccionados(){
    var total = indicesSeleccionados().length;
    var boton = el("ad-btn-corregir-seleccionados");
    if (boton) {
      boton.disabled = total === 0;
      boton.textContent = total ? "Corregir seleccionados (" + total + ")" : "Corregir seleccionados";
    }
  }

  function corregirSeleccionados(){
    var indices = indicesSeleccionados();
    var seleccionados = indices.map(function(indice){ return casosAnalizados[indice]; });
    var boton = el("ad-btn-corregir-seleccionados");

    if (!seleccionados.length) return;
    if (!window.confirm("Se respaldará cada documento antes de aplicar " + seleccionados.length + " corrección(es). ¿Continuar?")) return;

    if (boton) boton.disabled = true;
    setText("ad-base-repair-status", "Respaldando y corrigiendo los documentos seleccionados...");

    return baseRepair().ejecutarSeleccionados(seleccionados).then(function(resultado){
      setText(
        "ad-base-repair-status",
        "Proceso terminado. Correctos: " + resultado.correctos +
        ". Errores: " + resultado.errores +
        ". Todos los documentos procesados fueron respaldados en titulos_historial."
      );
      return analizarBase();
    }).catch(function(error){
      setText("ad-base-repair-status", "No se pudieron aplicar las correcciones: " + (error.message || String(error)));
      actualizarSeleccionados();
    });
  }

  function conectar(){
    var b1 = el("ad-btn-detectar-reparaciones");
    var b2 = el("ad-btn-reparar-documento");
    if (b1) b1.addEventListener("click", detectar, true);
    if (b2) b2.addEventListener("click", ejecutar, true);
    instalarNormalizador();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", conectar);
  else conectar();

  window.ADRepararApp = {
    detectar: detectar,
    reparar: reparar,
    ejecutar: ejecutar,
    analizarBase: analizarBase,
    corregirSeleccionados: corregirSeleccionados,
    instalarNormalizador: instalarNormalizador
  };
})(window, document);
