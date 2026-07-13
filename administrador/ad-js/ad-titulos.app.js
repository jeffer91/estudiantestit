/* =========================================================
Archivo: ad-titulos.app.js
Ruta: /administrador/ad-js/ad-titulos.app.js
Función:
- Complemento visual para búsqueda y listado de títulos.
========================================================= */
(function(window, document){
  "use strict";

  var cacheTitulos = [];

  function cfg(){ return window.AD_CONFIG || {}; }
  function fs(){ if (!window.ADFirebaseService) throw new Error("ADFirebaseService no está disponible."); return window.ADFirebaseService; }
  function ts(){ if (!window.ADTitulosService) throw new Error("ADTitulosService no está disponible."); return window.ADTitulosService; }
  function el(id){ return document.getElementById(id); }
  function txt(v){ return String(v === null || v === undefined ? "" : v).trim(); }
  function val(id){ var x = el(id); return x ? txt(x.value) : ""; }
  function setText(id, v){ var x = el(id); if (x) x.textContent = v; }
  function setHTML(id, v){ var x = el(id); if (x) x.innerHTML = v; }
  function esc(v){ return txt(v).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;").replace(/'/g,"&#039;"); }
  function diag(v){ setText("ad-panel-diagnostico", v); }
  function colTitulos(){ return (cfg().colecciones || {}).titulos; }
  function clean(v){ return ts().limpiarCedula ? ts().limpiarCedula(v) : txt(v).replace(/[^0-9A-Za-z]/g, ""); }

  function detener(ev){
    if (!ev) return;
    ev.preventDefault();
    ev.stopPropagation();
    if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
  }

  function buscarDoc(id){
    var ced = clean(id);
    if (!ced) return Promise.reject(new Error("Ingresa una identificación."));
    return fs().leerDocumento(colTitulos(), ced).then(function(resp){
      if (resp.existe) return resp.data;
      return fs().consultarPorCampo(colTitulos(), "cedula", "==", ced, 1).then(function(q){ return q.datos && q.datos.length ? q.datos[0] : null; });
    });
  }

  function cruzar(doc){
    if (!doc) return Promise.resolve(null);
    var ced = clean(doc.cedula || doc.numeroIdentificacion || doc._docId || "");
    return ts().buscarEstudiantePorCedula(ced).then(function(est){
      return {
        doc: doc,
        cedula: ced,
        nombre: txt((est && (est.Nombres || est.nombres)) || doc.Nombres || doc.nombres || doc.estudiante || ""),
        carrera: txt((est && (est.NombreCarrera || est.nombreCarrera)) || doc.NombreCarrera || doc.carrera || ""),
        periodo: txt((est && est.periodoLabel) || doc.periodoLabel || doc.periodoId || ""),
        estado: txt(doc.estado || ""),
        fecha: txt(doc.fechaenviotitulos || doc.fechaEnvioTitulos || doc.creadoEn || doc.createdAt || "")
      };
    });
  }

  function renderDetalle(item){
    if (!item) { setText("ad-resultado-titulo", "No se encontró registro enviado para esa identificación."); return; }
    var d = item.doc || {};
    setText("ad-resultado-titulo", [
      "Identificación: " + item.cedula,
      "Estudiante: " + (item.nombre || "Pendiente cruce Estudiantes"),
      "Carrera: " + (item.carrera || "Pendiente cruce"),
      "Período: " + (item.periodo || "sin dato"),
      "Estado: " + (item.estado || "sin dato"),
      "Fecha envío: " + (item.fecha || "sin dato"),
      "",
      "Título 1: " + (d.titulo1 || d.Titulo1 || "sin dato"),
      "Título 2: " + (d.titulo2 || d.Titulo2 || "sin dato"),
      "Título 3: " + (d.titulo3 || d.Titulo3 || "sin dato")
    ].join("\n"));
  }

  function fila(item){
    return "<tr><td>" + esc(item.cedula) + "</td><td>" + esc(item.nombre || "Pendiente cruce Estudiantes") + "</td><td>" + esc(item.carrera || "Pendiente cruce") + "</td><td>" + esc(item.estado) + "</td><td>" + esc(item.fecha) + "</td></tr>";
  }

  function renderTabla(items){
    var filas = [];
    (items || []).forEach(function(item){ if (item) filas.push(fila(item)); });
    setHTML("ad-tabla-titulos", filas.length ? filas.join("") : '<tr><td colspan="5" class="ad-empty">No hay resultados.</td></tr>');
  }

  function buscar(ev){
    detener(ev);
    diag("Buscando registro...");
    return buscarDoc(val("ad-buscar-cedula")).then(cruzar).then(function(item){
      renderDetalle(item);
      renderTabla(item ? [item] : []);
      diag(item ? "Registro encontrado." : "No se encontró registro.");
    }).catch(function(error){ diag("Error en búsqueda:\n" + (error.message || String(error))); });
  }

  function listar(ev){
    detener(ev);
    var limite = Number((cfg().titulos && cfg().titulos.paginaTamano) || 25);
    if (!Number.isFinite(limite) || limite <= 0) limite = 25;
    diag("Cargando registros enviados...");
    return ts().listarTitulosBasico(limite).then(function(lista){
      cacheTitulos = lista || [];
      return Promise.all(cacheTitulos.map(cruzar));
    }).then(function(items){
      renderTabla(items.filter(Boolean));
      setText("ad-resultado-titulo", "Listado cargado. Mostrando hasta " + limite + " registros.");
      diag("Listado cargado: " + items.filter(Boolean).length + " registros visibles.");
    }).catch(function(error){
      diag("Error al listar registros:\n" + (error.message || String(error)));
    });
  }

  function conectar(){
    var b = el("ad-btn-buscar-titulo");
    var l = el("ad-btn-listar-titulos");
    if (b) b.addEventListener("click", buscar, true);
    if (l) l.addEventListener("click", listar, true);
  }

  document.addEventListener("DOMContentLoaded", conectar);
  window.ADTitulosApp = { buscarTitulo: buscar, listarTitulos: listar };
})(window, document);
