/* =========================================================
Archivo: ad-estudiantes.service.js
Ruta: /administrador/ad-js/ad-estudiantes.service.js
Función:
- Cargar estudiantes por período.
- Cruzar Estudiantes, titulos, historial y Google Sheets.
- Consolidar propuestas y resolución del coordinador.
- Determinar el estado real de cada estudiante.
- Normalizar teléfonos ecuatorianos para WhatsApp.
========================================================= */
(function(window){
  "use strict";

  var LIMITE = 6000;

  function cfg(){ return window.AD_CONFIG || {}; }
  function fs(){
    if (!window.ADFirebaseService) throw new Error("ADFirebaseService no está disponible.");
    return window.ADFirebaseService;
  }
  function ps(){
    if (!window.ADPeriodosService) throw new Error("ADPeriodosService no está disponible.");
    return window.ADPeriodosService;
  }
  function texto(v){ return String(v === null || v === undefined ? "" : v).trim(); }
  function cedula(v){ return texto(v).replace(/[^0-9A-Za-z]/g, ""); }
  function normal(v){
    return texto(v)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function primero(lista){
    var i;
    for (i = 0; i < lista.length; i += 1) {
      if (lista[i] !== undefined && lista[i] !== null && texto(lista[i])) return lista[i];
    }
    return "";
  }
  function campo(obj, nombres){
    var data = obj || {};
    var claves = Object.keys(data);
    var mapa = {};
    var i;
    var key;

    claves.forEach(function(k){ mapa[normal(k)] = k; });

    for (i = 0; i < nombres.length; i += 1) {
      key = mapa[normal(nombres[i])];
      if (key !== undefined && data[key] !== undefined && data[key] !== null) {
        if (typeof data[key] === "object") return data[key];
        if (texto(data[key])) return data[key];
      }
    }
    return "";
  }

  function nombreCoordinador(valor, raw){
    var objeto = valor;
    if (objeto && typeof objeto === "object") {
      return texto(primero([
        objeto.nombre,
        objeto.Nombre,
        objeto.name,
        objeto.coordinadorNombre
      ]));
    }
    return texto(primero([
      valor,
      campo(raw || {}, ["coordinadorNombre","nombreCoordinador","Coordinador"])
    ]));
  }

  function normalizarCelular(valor){
    var numero = texto(valor).replace(/\D/g, "");
    if (!numero) return "";
    if (numero.indexOf("00593") === 0) numero = numero.slice(2);
    if (numero.indexOf("5930") === 0 && numero.length === 13) numero = "593" + numero.slice(4);
    if (numero.charAt(0) === "0" && numero.length === 10) numero = "593" + numero.slice(1);
    else if (numero.charAt(0) === "9" && numero.length === 9) numero = "593" + numero;
    return /^5939\d{8}$/.test(numero) ? numero : "";
  }

  function fecha(valor){
    if (!valor) return "";
    try {
      if (typeof valor.toDate === "function") return valor.toDate().toLocaleString("es-EC");
      if (valor.seconds !== undefined) return new Date(Number(valor.seconds) * 1000).toLocaleString("es-EC");
      if (valor._seconds !== undefined) return new Date(Number(valor._seconds) * 1000).toLocaleString("es-EC");

      var s = texto(valor);
      var match = s.match(/seconds\s*=\s*(\d+)/i);
      var d;
      if (match) return new Date(Number(match[1]) * 1000).toLocaleString("es-EC");
      d = new Date(s);
      return Number.isNaN(d.getTime()) ? s : d.toLocaleString("es-EC");
    } catch(error) {
      return texto(valor);
    }
  }

  function obtenerPeriodo(obj){
    var data = obj || {};
    return {
      id: texto(primero([
        campo(data,["periodoId","PeriodoId","ultimoPeriodoId","periodoCanonicoId"]),
        data.periodoId,
        data.ultimoPeriodoId
      ])),
      label: texto(primero([
        campo(data,["periodoLabel","PeriodoLabel","periodoTexto","PeriodoTexto","periodo","Período"]),
        data.periodoLabel,
        data.periodo
      ]))
    };
  }

  function coincidePeriodo(obj, periodo){
    var p = obtenerPeriodo(obj);
    var id = normal(periodo && periodo.id);
    var label = normal(periodo && periodo.label);
    var valores = [normal(p.id), normal(p.label)].filter(Boolean);
    if (!id && !label) return true;
    if (!valores.length) return false;
    return valores.some(function(v){ return (id && v === id) || (label && v === label); });
  }

  function normalizarEstudiante(raw){
    var c = cedula(primero([
      campo(raw,["numeroIdentificacion","cedula","Cédula","identificacion"]),
      raw && raw._docId
    ]));
    var p = obtenerPeriodo(raw);
    var celularOriginal = texto(campo(raw,[
      "Celular","celular","CelularPersonal","celularPersonal",
      "Telefono","Teléfono","telefono","teléfono",
      "WhatsApp","Whatsapp","whatsapp","numeroCelular","Número celular"
    ]));

    return {
      cedula: c,
      nombre: texto(campo(raw,["Nombres","nombres","Nombre","nombre","estudiante"])),
      carrera: texto(campo(raw,["NombreCarrera","nombreCarrera","Carrera","carrera"])),
      codigoCarrera: texto(campo(raw,["CodigoCarrera","codigoCarrera"])),
      celular: normalizarCelular(celularOriginal),
      celularOriginal: celularOriginal,
      periodoId: p.id,
      periodoLabel: p.label,
      raw: raw || {}
    };
  }

  function normalizarTitulo(raw){
    var data = raw || {};
    var p = obtenerPeriodo(data);
    var coord = campo(data,["coordinador"]);

    return {
      cedula: cedula(primero([
        campo(data,["cedula","numeroIdentificacion","identificacion"]),
        data._docId
      ])),
      periodoId: p.id,
      periodoLabel: p.label,
      estado: texto(campo(data,["estado","estadoFinal","estadoProceso","estadoNuevo"])),
      titulo1: texto(campo(data,["titulo1","Título 1","Titulo1"])),
      titulo2: texto(campo(data,["titulo2","Título 2","Titulo2"])),
      titulo3: texto(campo(data,["titulo3","Título 3","Titulo3"])),
      tituloPreferido: texto(primero([
        campo(data,["tituloPreferidoTexto","tituloPreferido","preferido","tituloSeleccionado","titulofavorito"]),
        campo(data,["tituloOriginalSeleccionado"])
      ])),
      tituloAprobado: texto(campo(data,["tituloaprobado","tituloAprobado","tituloFinal"])),
      coordinador: nombreCoordinador(coord, data),
      coordinadorNombre: nombreCoordinador(coord, data),
      comentario: texto(campo(data,["comentarioCoordinador","comentario","observacion","motivo"])),
      comentarioCoordinador: texto(campo(data,["comentarioCoordinador","comentario","observacion","motivo"])),
      fechaEnvio: fecha(campo(data,["fechaenviotitulos","fechaEnvioTitulos","fechaEnvio","creadoEn","createdAt"])),
      fechaRevision: fecha(primero([
        campo(data,["fechaRevision","fecharespuestaprobado"]),
        campo(data,["fechaRevisionLocal","actualizadoEn"])
      ])),
      tituloSeleccionadoNumero: Number(campo(data,["tituloSeleccionadoNumero","tituloPreferidoNumero"]) || 0),
      raw: data
    };
  }

  function normalizarHistorial(raw){
    var t = normalizarTitulo(raw);
    t.estado = texto(primero([t.estado, campo(raw,["accionHistorial"]), "DEVUELTO"]));
    t.comentario = texto(primero([t.comentario, campo(raw,["motivoArchivo","motivo"])]));
    t.comentarioCoordinador = t.comentario;
    t.fechaRevision = texto(primero([t.fechaRevision, fecha(campo(raw,["archivadoEn"]))]));
    t.raw = raw || {};
    return t;
  }

  function extraerLista(respuesta){
    if (Array.isArray(respuesta)) return respuesta;
    if (!respuesta) return [];
    if (Array.isArray(respuesta.data)) return respuesta.data;
    if (Array.isArray(respuesta.registros)) return respuesta.registros;
    if (Array.isArray(respuesta.envios)) return respuesta.envios;
    if (respuesta.data && Array.isArray(respuesta.data.registros)) return respuesta.data.registros;
    if (respuesta.data && Array.isArray(respuesta.data.envios)) return respuesta.data.envios;
    return [];
  }

  function leerConfigApp(){
    var colecciones = cfg().colecciones || {};
    var documentos = cfg().documentos || {};
    return fs().leerDocumento(colecciones.titulosConfig, documentos.appConfig)
      .then(function(resp){ return resp.data || {}; });
  }

  function listarSheets(periodo){
    return leerConfigApp().then(function(app){
      var url = texto(app.sheetsWebAppUrl || app.sheetsUrl || app.sheetsEndpoint);
      var token = texto(app.sheetsToken || "");
      if (!url || app.sheetsActivo === false || texto(app.sheetsActivo).toLowerCase() === "false") return [];

      function consultarHoja(hoja){
        var payload = {
          accion: "LISTAR_ENVIOS_COORDINADOR",
          origen: "administrador",
          version: "1.4.0",
          token: token,
          fechaCliente: new Date().toISOString(),
          data: {
            hoja: hoja,
            coordinador: null,
            carreras: [],
            estado: "",
            vista: "",
            periodo: periodo && (periodo.id || periodo.label) || "",
            token: token
          }
        };

        return fetch(url, {
          method: "POST",
          mode: "cors",
          cache: "no-store",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(payload)
        }).then(function(resp){
          if (!resp.ok) throw new Error("Sheets respondió HTTP " + resp.status);
          return resp.text();
        }).then(function(body){
          var json = body ? JSON.parse(body) : {};
          if (json && json.ok === false) throw new Error(json.mensaje || json.error || "Error en Google Sheets");
          return extraerLista(json).map(normalizarTitulo).filter(function(item){ return item.cedula; });
        });
      }

      return Promise.all([
        consultarHoja("Envios").catch(function(){ return []; }),
        consultarHoja("Resoluciones").catch(function(){ return []; })
      ]).then(function(partes){ return (partes[0] || []).concat(partes[1] || []); });
    }).catch(function(){ return []; });
  }

  function indexar(lista){
    var mapa = {};
    (lista || []).forEach(function(item){
      if (!item || !item.cedula) return;
      if (!mapa[item.cedula]) mapa[item.cedula] = [];
      mapa[item.cedula].push(item);
    });
    return mapa;
  }

  function escoger(lista, periodo){
    var items = Array.isArray(lista) ? lista : [];
    var coincidentes = items.filter(function(item){ return coincidePeriodo(item, periodo); });
    if (coincidentes.length) return coincidentes[coincidentes.length - 1];
    return items.length ? items[items.length - 1] : null;
  }

  function estadoCanonico(valor){
    var v = normal(valor).replace(/ /g,"_").toUpperCase();
    if (v.indexOf("DEVUEL") >= 0 || v.indexOf("DEVOLUC") >= 0) return "DEVUELTO";
    if (v.indexOf("REEMPLAZ") >= 0) return "REEMPLAZADO";
    if (v.indexOf("APROBAD") >= 0) return "APROBADO";
    if (v.indexOf("PENDIENTE") >= 0 || v.indexOf("ENVIAD") >= 0 || v.indexOf("SYNC") >= 0) return "ENVIADO";
    return v;
  }

  function valorFuentes(fuentes, clave){
    var i;
    for (i = 0; i < fuentes.length; i += 1) {
      if (fuentes[i] && texto(fuentes[i][clave])) return fuentes[i][clave];
    }
    return "";
  }

  function fusionarDetalle(titulo, sheets, historial){
    var fuentesPrincipales = [titulo, sheets, historial].filter(Boolean);
    var fuentesRevision = [titulo, sheets, historial].filter(Boolean);
    var detalle = {
      titulo1: texto(valorFuentes(fuentesPrincipales,"titulo1")),
      titulo2: texto(valorFuentes(fuentesPrincipales,"titulo2")),
      titulo3: texto(valorFuentes(fuentesPrincipales,"titulo3")),
      tituloPreferido: texto(valorFuentes(fuentesPrincipales,"tituloPreferido")),
      tituloAprobado: texto(valorFuentes(fuentesRevision,"tituloAprobado")),
      tituloaprobado: texto(valorFuentes(fuentesRevision,"tituloAprobado")),
      coordinador: texto(valorFuentes(fuentesRevision,"coordinador")),
      coordinadorNombre: texto(valorFuentes(fuentesRevision,"coordinadorNombre")),
      comentario: texto(valorFuentes(fuentesRevision,"comentario")),
      comentarioCoordinador: texto(valorFuentes(fuentesRevision,"comentarioCoordinador")),
      fechaEnvio: texto(valorFuentes(fuentesPrincipales,"fechaEnvio")),
      fechaRevision: texto(valorFuentes(fuentesRevision,"fechaRevision")),
      estado: texto(valorFuentes(fuentesRevision,"estado")),
      estadoNuevo: texto(valorFuentes(fuentesRevision,"estado")),
      tituloSeleccionadoNumero: Number(valorFuentes(fuentesRevision,"tituloSeleccionadoNumero") || 0),
      raw: titulo && titulo.raw ? titulo.raw : (sheets && sheets.raw ? sheets.raw : (historial && historial.raw ? historial.raw : {}))
    };

    detalle.tienePropuestas = Boolean(detalle.titulo1 || detalle.titulo2 || detalle.titulo3);
    detalle.propuestasCompletas = Boolean(detalle.titulo1 && detalle.titulo2 && detalle.titulo3);
    detalle.tieneResolucion = Boolean(
      detalle.tituloAprobado || detalle.coordinador || detalle.comentario || detalle.fechaRevision ||
      ["APROBADO","REEMPLAZADO","DEVUELTO"].indexOf(estadoCanonico(detalle.estado)) >= 0
    );
    return detalle;
  }

  function combinar(estudiante, titulo, historial, sheets){
    var detalle = fusionarDetalle(titulo, sheets, historial);
    var estado = estadoCanonico(detalle.estado);

    if (!titulo && !sheets && historial) estado = "DEVUELTO";
    if (!detalle.tienePropuestas && !detalle.tieneResolucion) estado = "NO_ENVIO";
    if (detalle.tienePropuestas && !estado) estado = "ENVIADO";
    if (detalle.tituloAprobado && estado !== "DEVUELTO") {
      estado = estado === "REEMPLAZADO" ? "REEMPLAZADO" : "APROBADO";
    }

    detalle.estado = estado;
    detalle.estadoNuevo = estado;

    return {
      cedula: estudiante.cedula,
      nombre: estudiante.nombre,
      carrera: estudiante.carrera,
      codigoCarrera: estudiante.codigoCarrera,
      celular: estudiante.celular,
      celularOriginal: estudiante.celularOriginal,
      periodoId: estudiante.periodoId,
      periodoLabel: estudiante.periodoLabel,
      estado: estado,
      registroIncompleto: Boolean((titulo || sheets) && !detalle.propuestasCompletas && !detalle.tieneResolucion),
      titulo: detalle,
      historial: historial,
      revision: detalle,
      detalle: detalle,
      rawEstudiante: estudiante.raw
    };
  }

  function cargar(periodo){
    var colecciones = cfg().colecciones || {};

    return Promise.all([
      fs().listarColeccion(colecciones.estudiantes, LIMITE),
      fs().listarColeccion(colecciones.titulos, LIMITE).catch(function(){ return { datos: [] }; }),
      fs().listarColeccion(colecciones.historial, LIMITE).catch(function(){ return { datos: [] }; }),
      listarSheets(periodo)
    ]).then(function(partes){
      var mapaEstudiantes = {};
      var estudiantes = [];
      var titulos;
      var historial;
      var sheets;
      var idxTitulos;
      var idxHistorial;
      var idxSheets;
      var filas;

      (partes[0].datos || []).map(normalizarEstudiante).forEach(function(item){
        if (!item.cedula || !coincidePeriodo(item, periodo)) return;
        mapaEstudiantes[item.cedula] = item;
      });

      Object.keys(mapaEstudiantes).forEach(function(key){ estudiantes.push(mapaEstudiantes[key]); });
      titulos = (partes[1].datos || []).map(normalizarTitulo).filter(function(item){ return item.cedula; });
      historial = (partes[2].datos || []).map(normalizarHistorial).filter(function(item){ return item.cedula; });
      sheets = partes[3] || [];
      idxTitulos = indexar(titulos);
      idxHistorial = indexar(historial);
      idxSheets = indexar(sheets);

      filas = estudiantes.map(function(estudiante){
        return combinar(
          estudiante,
          escoger(idxTitulos[estudiante.cedula], periodo),
          escoger(idxHistorial[estudiante.cedula], periodo),
          escoger(idxSheets[estudiante.cedula], periodo)
        );
      });

      filas.sort(function(a,b){
        return String(a.nombre || a.cedula).localeCompare(String(b.nombre || b.cedula), "es");
      });

      return {
        ok: true,
        periodo: periodo,
        estudiantes: filas,
        total: filas.length,
        sheetsDisponible: sheets.length > 0
      };
    });
  }

  window.ADEstudiantesService = {
    listarPeriodos: function(){ return ps().listarPeriodos(); },
    cargar: cargar,
    fecha: fecha,
    estadoCanonico: estadoCanonico,
    normalizarCelular: normalizarCelular
  };
})(window);
