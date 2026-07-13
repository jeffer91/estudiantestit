/*
  Archivo: app.config.js
  Ruta: estudiantes-mvp/js/app.config.js
  Funciones principales:
  - Definir la configuración general de estudiantes-mvp.
  - Centralizar Firebase, colecciones, período, IA, Sheets y textos base.
  - Evitar valores repetidos en otros archivos.
  - Exponer configuración global en window.EstudianteMVPConfig.
*/
(function (window) {
  'use strict';

  var FIREBASE_CONFIG = Object.freeze({
    apiKey: 'AIzaSyCaHf1C0BB0X_H3BDZ1o-UDAsPmLTjsZLA',
    authDomain: 'utet-4387a.firebaseapp.com',
    projectId: 'utet-4387a',
    storageBucket: 'utet-4387a.firebasestorage.app',
    messagingSenderId: '902848131454',
    appId: '1:902848131454:web:47f515eb6480834724c32f'
  });

  var CONFIG = Object.freeze({
    app: Object.freeze({
      nombre: 'Estudiantes MVP',
      version: '1.0.0',
      entorno: 'pruebas',
      origenCaptura: 'estudiantes-mvp',
      modoDiagnostico: true
    }),

    firebase: Object.freeze({
      sdkVersion: '10.12.5',
      config: FIREBASE_CONFIG
    }),

    collections: Object.freeze({
      estudiantes: 'Estudiantes',
      ia: 'IA',
      titulos: 'titulos',
      titulosLogs: 'titulos_logs',
      appConfig: 'app_config'
    }),

    documentos: Object.freeze({
      sheetsConfig: 'titulos_sheets',
      iaConfig: 'titulos_ia',
      appMvpConfig: 'estudiantes_mvp'
    }),

    proceso: Object.freeze({
      periodoIdFallback: '2026-02__2026-08',
      periodoLabelFallback: 'Febrero 2026 a Agosto 2026',
      maxIntentos: 1,
      propuestasObligatorias: 3,
      titulosPorPropuesta: 3
    }),

    ia: Object.freeze({
      proveedoresOrden: Object.freeze(['gemini', 'groq', 'cloudflare']),
      proveedorPrincipal: 'gemini',
      timeoutMs: 45000,
      temperatura: 0.4,
      maxTokens: 900
    }),

    sheets: Object.freeze({
      endpointFallback: '',
      accionEnvio: 'ENVIO_ESTUDIANTE',
      accionPing: 'PING',
      timeoutMs: 45000
    }),

    ui: Object.freeze({
      pasos: Object.freeze([
        'consulta',
        'datos',
        'telegram',
        'propuestas',
        'resumen',
        'enviar'
      ]),
      pasoInicial: 'consulta'
    }),

    textos: Object.freeze({
      tituloApp: 'Registro de Títulos Académicos',
      subtituloApp: 'Consulta tus datos y registra tus propuestas de titulación.',
      mensajeConsulta: 'Ingresa tu número de cédula para consultar tus datos académicos.',
      mensajeNoEncontrado: 'No encontramos un estudiante con esa cédula. Revisa el número e intenta nuevamente.',
      mensajeFirebaseListo: 'Firebase conectado correctamente.',
      mensajeFirebaseError: 'No se pudo conectar con Firebase.',
      mensajeCargando: 'Cargando información, espera un momento...',
      mensajeTelegram: 'Ingresa tu usuario de Telegram para continuar.',
      mensajeEnvioOk: 'Tu registro fue enviado correctamente.',
      mensajeEnvioPendiente: 'No se pudo respaldar en Google Sheets, pero quedó guardado en Firebase como pendiente.'
    })
  });

  function obtener(ruta, fallback) {
    var partes;
    var actual;
    var i;

    if (!ruta) {
      return CONFIG;
    }

    partes = String(ruta).split('.');
    actual = CONFIG;

    for (i = 0; i < partes.length; i += 1) {
      if (actual && Object.prototype.hasOwnProperty.call(actual, partes[i])) {
        actual = actual[partes[i]];
      } else {
        return fallback;
      }
    }

    return actual;
  }

  function obtenerColeccion(nombre) {
    return obtener('collections.' + nombre, '');
  }

  function obtenerDocumento(nombre) {
    return obtener('documentos.' + nombre, '');
  }

  function obtenerPeriodoFallback() {
    return {
      periodoId: CONFIG.proceso.periodoIdFallback,
      periodoLabel: CONFIG.proceso.periodoLabelFallback
    };
  }

  window.EstudianteMVPConfig = Object.freeze({
    data: CONFIG,
    obtener: obtener,
    obtenerColeccion: obtenerColeccion,
    obtenerDocumento: obtenerDocumento,
    obtenerPeriodoFallback: obtenerPeriodoFallback
  });
})(window);
