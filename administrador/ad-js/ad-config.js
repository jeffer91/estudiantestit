/* =========================================================
Archivo: ad-config.js
Ruta: /administrador/ad-js/ad-config.js
Función:
- Configuración central del módulo administrador.
- Define nombres de colecciones, documentos, campos y reglas base.
- La configuración Firebase queda aquí para que el administrador sea independiente.
- Redirige /api/ia al proxy local únicamente durante pruebas con Live Server.
========================================================= */

(function(window){
  "use strict";

  var AD_CONFIG = {
    nombreApp: "Administrador Titulación",
    version: "1.2.2",
    entorno: "produccion",
    administrador: "administrador",

    rutas: {
      base: "/administrador/",
      css: "./ad-css/",
      js: "./ad-js/"
    },

    firebase: {
      sdkVersion: "10.12.5"
    },

    firebaseConfig: {
      apiKey: "AIzaSyCaHf1C0BB0X_H3BDZ1o-UDAsPmLTjsZLA",
      authDomain: "utet-4387a.firebaseapp.com",
      projectId: "utet-4387a",
      storageBucket: "utet-4387a.firebasestorage.app",
      messagingSenderId: "902848131454",
      appId: "1:902848131454:web:47f515eb6480834724c32f"
    },

    colecciones: {
      estudiantes: "Estudiantes",
      titulosConfig: "titulos_config",
      coordinadores: "titulos_coordinadores",
      titulos: "titulos",
      historial: "titulos_historial",
      logs: "titulos_logs"
    },

    documentos: {
      appConfig: "app"
    },

    campos: {
      cedula: "cedula",
      numeroIdentificacion: "numeroIdentificacion",
      nombreCarrera: "NombreCarrera",
      codigoCarrera: "CodigoCarrera",
      periodoId: "periodoId",
      periodoLabel: "periodoLabel",
      estadoMatricula: "estadoMatricula"
    },

    periodos: {
      todosActivos: true,
      fallbackId: "2026-02__2026-08",
      fallbackLabel: "Febrero 2026 a Agosto 2026"
    },

    titulos: {
      idDocumentoCorrecto: "cedula",
      paginaTamano: 25,
      estados: {
        enviado: "ENVIADO",
        devuelto: "DEVUELTO",
        aprobado: "APROBADO",
        pendienteSync: "PENDIENTE_SYNC"
      }
    },

    coordinadores: {
      activoDefault: true,
      origen: "administrador"
    },

    accionesLog: {
      administradorAbierto: "ADMIN_LOGIN_ABIERTO",
      periodoAgregado: "ADMIN_PERIODO_AGREGADO",
      periodoPrincipal: "ADMIN_PERIODO_PRINCIPAL",
      coordinadorCreado: "ADMIN_COORDINADOR_CREADO",
      coordinadorActualizado: "ADMIN_COORDINADOR_ACTUALIZADO",
      coordinadorDesactivado: "ADMIN_COORDINADOR_DESACTIVADO",
      coordinadorActivado: "ADMIN_COORDINADOR_ACTIVADO",
      carreraAsignada: "ADMIN_CARRERA_ASIGNADA",
      carreraQuitada: "ADMIN_CARRERA_QUITADA",
      tituloDevuelto: "ADMIN_TITULO_DEVUELTO",
      firebaseReparado: "ADMIN_FIREBASE_REPARADO",
      diagnosticoFirebase: "ADMIN_DIAGNOSTICO_FIREBASE",
      diagnosticoSheets: "ADMIN_DIAGNOSTICO_SHEETS"
    },

    sheets: {
      tokenVisibleMax: 16,
      pingPayload: {
        accion: "PING",
        tipo: "PING",
        origen: "administrador"
      }
    },

    textos: {
      firebasePendiente: "Firebase: pendiente",
      firebaseConectado: "Firebase: conectado",
      firebaseError: "Firebase: error",
      sheetsPendiente: "Sheets: pendiente",
      sheetsActivo: "Sheets: activo",
      sheetsInactivo: "Sheets: inactivo",
      sinDatos: "Sin datos cargados.",
      accionPendiente: "Acción pendiente."
    }
  };

  function tieneFirebaseConfigCompleta(){
    var cfg = AD_CONFIG.firebaseConfig || {};
    return Boolean(
      cfg.apiKey &&
      cfg.authDomain &&
      cfg.projectId &&
      cfg.storageBucket &&
      cfg.messagingSenderId &&
      cfg.appId
    );
  }

  function normalizarTexto(valor){
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function normalizarDocId(valor){
    return normalizarTexto(valor)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function ocultarToken(valor){
    var texto = normalizarTexto(valor);
    if (!texto) return "";
    if (texto.length <= AD_CONFIG.sheets.tokenVisibleMax) {
      return texto.charAt(0) + "******";
    }
    return texto.slice(0, AD_CONFIG.sheets.tokenVisibleMax) + "******";
  }

  function fechaLocal(){
    return new Date().toLocaleString("es-EC", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
  }

  function esEntornoLocal(){
    var hostname = String(window.location && window.location.hostname || "").toLowerCase();
    return ["localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"].indexOf(hostname) >= 0;
  }

  function instalarProxyIALocal(){
    var fetchOriginal;

    if (!esEntornoLocal() || typeof window.fetch !== "function") return;
    if (window.__AD_PROXY_IA_LOCAL_INSTALADO === true) return;

    fetchOriginal = window.fetch.bind(window);

    window.fetch = function(input, init){
      var urlOriginal = typeof input === "string"
        ? input
        : input && input.url;
      var url;
      var destino;

      try {
        url = new URL(urlOriginal || "", window.location.href);

        if (url.origin === window.location.origin && url.pathname === "/api/ia") {
          destino = "http://127.0.0.1:8787/api/ia" + (url.search || "");

          if (typeof Request !== "undefined" && input instanceof Request) {
            input = new Request(destino, input);
          } else {
            input = destino;
          }
        }
      } catch(errorUrl) {
        // Si la URL no puede normalizarse, se conserva la solicitud original.
      }

      return fetchOriginal(input, init);
    };

    window.__AD_PROXY_IA_LOCAL_INSTALADO = true;
  }

  instalarProxyIALocal();

  window.AD_CONFIG = AD_CONFIG;
  window.AD_UTILS = {
    tieneFirebaseConfigCompleta: tieneFirebaseConfigCompleta,
    normalizarTexto: normalizarTexto,
    normalizarDocId: normalizarDocId,
    ocultarToken: ocultarToken,
    fechaLocal: fechaLocal
  };
})(window);
