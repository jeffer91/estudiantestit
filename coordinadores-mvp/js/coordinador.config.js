/*
  Archivo: coordinador.config.js
  Ruta: coordinadores-mvp/js/coordinador.config.js

  Funciones principales:
  - Centralizar la configuración general de coordinadores-mvp.
  - Mantener la app independiente de estudiantes-mvp.
  - Definir endpoint de Google Sheets / Apps Script.
  - Definir acciones, estados, hojas, columnas y textos base.
  - Adaptarse a las hojas reales ya creadas: Envios, Coordinadores y Resoluciones.
  - No modificar ni romper la lógica actual de la app de estudiantes.
  - Exponer configuración global en window.CoordinadorMVPConfig.
*/

(function (window) {
  'use strict';

  var CONFIG = Object.freeze({
    app: Object.freeze({
      nombre: 'Coordinadores MVP',
      version: '1.0.1',
      entorno: 'pruebas',
      origen: 'coordinadores-mvp',
      modoDiagnostico: true
    }),

    sheets: Object.freeze({
      /*
        Pega aquí el endpoint del Apps Script publicado.

        Debe ser una URL tipo:
        https://script.google.com/macros/s/XXXXXXXXXXXX/exec

        IMPORTANTE:
        - Este endpoint puede ser el mismo que usa la app de estudiantes.
        - La lógica de estudiante no se daña porque coordinadores enviará acciones distintas:
          LISTAR_COORDINADORES, LISTAR_ENVIOS_COORDINADOR, APROBAR_ENVIO_COORDINADOR, etc.
      */
      endpoint: '',

      timeoutMs: 45000,

      acciones: Object.freeze({
        ping: 'PING_COORDINADORES',
        listarCoordinadores: 'LISTAR_COORDINADORES',
        listarEnvios: 'LISTAR_ENVIOS_COORDINADOR',
        aprobarEnvio: 'APROBAR_ENVIO_COORDINADOR',
        devolverEnvio: 'DEVOLVER_ENVIO_COORDINADOR',
        guardarRevision: 'GUARDAR_REVISION_COORDINADOR',

        /*
          Acción secundaria por si luego decides separar físicamente
          una hoja Devueltos. Por ahora puede apuntar a Resoluciones.
        */
        moverDevuelto: 'MOVER_DEVUELTO_COORDINADOR'
      })
    }),

    /*
      Hojas reales del archivo RESPALDO TITULOS APP.

      Nota:
      - No usamos una hoja nueva llamada Revisiones.
      - Usamos Resoluciones como historial principal.
      - devueltos también apunta a Resoluciones para evitar crear hojas extra.
    */
    hojas: Object.freeze({
      coordinadores: 'Coordinadores',
      envios: 'Envios',
      resoluciones: 'Resoluciones',
      revisiones: 'Resoluciones',
      devueltos: 'Resoluciones',
      estudiantes: 'Estudiantes',
      pendientesSync: 'PendientesSync',
      logs: 'Logs',
      ping: 'PING'
    }),

    estados: Object.freeze({
      pendiente: 'PENDIENTE_REVISION',
      aprobado: 'APROBADO',
      devuelto: 'DEVUELTO',
      reemplazado: 'REEMPLAZADO'
    }),

    vistas: Object.freeze({
      pendientes: Object.freeze({
        id: 'pendientes',
        label: 'Pendientes',
        estado: 'PENDIENTE_REVISION',
        titulo: 'Estudiantes pendientes de revisión',
        descripcion: 'Estos estudiantes tienen títulos enviados y esperan revisión del coordinador.'
      }),

      aprobados: Object.freeze({
        id: 'aprobados',
        label: 'Aprobados',
        estado: 'APROBADO',
        titulo: 'Estudiantes aprobados',
        descripcion: 'Estos estudiantes ya tienen un título aprobado por coordinación.'
      }),

      devueltos: Object.freeze({
        id: 'devueltos',
        label: 'Devueltos',
        estado: 'DEVUELTO',
        titulo: 'Estudiantes devueltos',
        descripcion: 'Estos registros fueron devueltos por el coordinador y quedan respaldados en Resoluciones.'
      })
    }),

    ui: Object.freeze({
      vistaInicial: 'pendientes',
      textoSinCoordinador: 'Selecciona un coordinador para cargar los estudiantes.',
      textoSinRegistros: 'No hay estudiantes para mostrar en esta vista.',
      textoCargandoCoordinadores: 'Cargando coordinadores...',
      textoCargandoEnvios: 'Cargando estudiantes...',
      textoGuardandoRevision: 'Guardando revisión...',
      textoConexionOk: 'Conexión correcta con Google Sheets.',
      textoConexionError: 'No se pudo conectar con Google Sheets.'
    }),

    /*
      Alias de columnas.
      Esto permite que la app funcione aunque en Google Sheets las columnas
      tengan mayúsculas, tildes, espacios o nombres parecidos.
    */
    columnas: Object.freeze({
      coordinadores: Object.freeze({
        nombre: Object.freeze([
          'nombre',
          'coordinador',
          'Nombre',
          'Coordinador'
        ]),

        carreras: Object.freeze([
          'carreras',
          'carrerasAsignadas',
          'Carreras',
          'Carreras asignadas',
          'Carreras Asignadas'
        ]),

        activo: Object.freeze([
          'activo',
          'Activo',
          'estado',
          'Estado'
        ]),

        idRegistro: Object.freeze([
          'idRegistro',
          'ID registro',
          'Id registro',
          'ID Registro'
        ])
      }),

      envios: Object.freeze({
        fechaServidor: Object.freeze([
          'Fecha servidor',
          'fechaServidor',
          'Fecha Servidor'
        ]),

        fechaEnvio: Object.freeze([
          'Fecha envío',
          'Fecha envio',
          'fechaEnvio',
          'fecha',
          'Fecha',
          'FechaEnvio'
        ]),

        cedula: Object.freeze([
          'Cédula',
          'Cedula',
          'cédula',
          'cedula',
          'identificacion',
          'Identificacion',
          'Identificación',
          'numeroIdentificacion',
          'Número identificación'
        ]),

        nombres: Object.freeze([
          'Estudiante',
          'estudiante',
          'Nombres',
          'nombres',
          'Nombre',
          'nombre',
          'nombreEstudiante',
          'Nombre estudiante'
        ]),

        carrera: Object.freeze([
          'Carrera',
          'carrera',
          'NombreCarrera',
          'nombreCarrera',
          'Nombre Carrera',
          'nombre carrera'
        ]),

        periodo: Object.freeze([
          'Periodo',
          'Período',
          'periodo',
          'período',
          'periodoId',
          'periodoLabel',
          'Periodo académico',
          'Periodo Academico'
        ]),

        telegram: Object.freeze([
          'Telegram',
          'telegram',
          'usuarioTelegram',
          'UsuarioTelegram',
          'Usuario Telegram'
        ]),

        titulo1: Object.freeze([
          'Título 1',
          'Titulo 1',
          'Título1',
          'Titulo1',
          'titulo1',
          'título1',
          'titulo_1'
        ]),

        titulo2: Object.freeze([
          'Título 2',
          'Titulo 2',
          'Título2',
          'Titulo2',
          'titulo2',
          'título2',
          'titulo_2'
        ]),

        titulo3: Object.freeze([
          'Título 3',
          'Titulo 3',
          'Título3',
          'Titulo3',
          'titulo3',
          'título3',
          'titulo_3'
        ]),

        preferido: Object.freeze([
          'Preferido',
          'preferido',
          'tituloPreferido',
          'Título preferido',
          'Titulo preferido',
          'tituloPreferidoNumero',
          'Título preferido número'
        ]),

        estadoFirebase: Object.freeze([
          'Estado Firebase',
          'estadoFirebase',
          'EstadoFirebase'
        ]),

        estadoGoogleSheets: Object.freeze([
          'Estado Google Sheets',
          'estadoGoogleSheets',
          'EstadoGoogleSheets'
        ]),

        observacion: Object.freeze([
          'Observación',
          'Observacion',
          'observacion',
          'observación',
          'observaciones',
          'Observaciones'
        ]),

        idRegistro: Object.freeze([
          'ID registro',
          'Id registro',
          'ID Registro',
          'idRegistro',
          'codigoRegistro',
          'Código registro'
        ]),

        prueba: Object.freeze([
          'Prueba',
          'prueba'
        ]),

        estado: Object.freeze([
          'Estado',
          'estado',
          'estadoFinal',
          'Estado final',
          'Estado Final',
          'estadoProceso'
        ]),

        tituloAprobado: Object.freeze([
          'tituloAprobado',
          'Título aprobado',
          'Titulo aprobado',
          'Título Aprobado',
          'Titulo Aprobado',
          'Título corregido',
          'Titulo corregido',
          'Título final',
          'Titulo final'
        ]),

        comentarioCoordinador: Object.freeze([
          'comentarioCoordinador',
          'Comentario coordinador',
          'Comentario Coordinador',
          'Observación coordinador',
          'Observacion coordinador',
          'Observación',
          'Observacion'
        ]),

        coordinador: Object.freeze([
          'coordinador',
          'Coordinador'
        ]),

        fechaRevision: Object.freeze([
          'fechaRevision',
          'Fecha revision',
          'Fecha revisión',
          'Fecha Revision',
          'Fecha Revisión'
        ])
      }),

      resoluciones: Object.freeze({
        fechaServidor: Object.freeze([
          'Fecha servidor',
          'Fecha Servidor',
          'fechaServidor'
        ]),

        fechaRevision: Object.freeze([
          'Fecha revisión',
          'Fecha revision',
          'Fecha Revisión',
          'Fecha Revision',
          'fechaRevision'
        ]),

        cedula: Object.freeze([
          'Cédula',
          'Cedula',
          'cedula',
          'cédula'
        ]),

        estudiante: Object.freeze([
          'Estudiante',
          'estudiante',
          'Nombres',
          'nombres',
          'Nombre',
          'nombre'
        ]),

        carrera: Object.freeze([
          'Carrera',
          'carrera'
        ]),

        periodo: Object.freeze([
          'Periodo',
          'Período',
          'periodo',
          'período'
        ]),

        coordinador: Object.freeze([
          'Coordinador',
          'coordinador'
        ]),

        estadoFinal: Object.freeze([
          'Estado final',
          'Estado Final',
          'estadoFinal',
          'Estado',
          'estado'
        ]),

        tituloElegido: Object.freeze([
          'Título elegido',
          'Titulo elegido',
          'Título Elegido',
          'Titulo Elegido',
          'tituloElegido'
        ]),

        tituloCorregido: Object.freeze([
          'Título corregido',
          'Titulo corregido',
          'Título Corregido',
          'Titulo Corregido',
          'tituloCorregido',
          'tituloFinal',
          'Título final',
          'Titulo final'
        ]),

        observacion: Object.freeze([
          'Observación',
          'Observacion',
          'observacion',
          'observación',
          'Comentario',
          'comentario'
        ]),

        idRegistro: Object.freeze([
          'ID registro',
          'Id registro',
          'ID Registro',
          'idRegistro'
        ])
      })
    }),

    revision: Object.freeze({
      comentarioMinimo: 4,
      tituloMinimo: 8,

      /*
        Al aprobar:
        - Puede aprobar sin comentario.
        - Puede seleccionar un título y editarlo antes de guardar.
      */
      permitirAprobarSinComentario: true,

      /*
        Al devolver:
        - No hay selector de motivo.
        - Sí debe escribir una observación.
      */
      comentarioObligatorioAlDevolver: true,

      /*
        Los títulos originales de Envios no se borran.
        Se agregan/actualizan columnas de resolución.
      */
      conservarTitulosOriginales: true,

      /*
        Como ya existe Resoluciones, usamos esa hoja para respaldos.
        No obligamos a crear una hoja Devueltos.
      */
      moverDevueltosAHojaDevueltos: false,
      guardarHistorialEnRevisiones: true
    }),

    almacenamiento: Object.freeze({
      prefijo: 'coordinadores_mvp__',
      claveUltimoCoordinador: 'coordinadores_mvp__ultimo_coordinador',
      claveUltimaVista: 'coordinadores_mvp__ultima_vista'
    }),

    textos: Object.freeze({
      tituloApp: 'Revisión de Títulos Académicos',
      subtituloApp: 'Panel independiente para coordinadores.',

      aprobarOk: 'Título aprobado correctamente.',
      devolverOk: 'Registro devuelto correctamente.',
      errorGeneral: 'No se pudo completar la acción.',

      seleccionaTitulo: 'Selecciona un título o escribe el título final.',
      comentarioDevolucion: 'Para devolver, escribe una observación para respaldo interno.',
      seleccionaCoordinador: 'Selecciona un coordinador antes de continuar.',

      endpointFaltante: 'No hay endpoint configurado. Pega la URL del Apps Script en coordinador.config.js.',
      sinCoordinadores: 'No se encontraron coordinadores activos.',
      sinEnvios: 'No hay estudiantes para mostrar en esta vista.'
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

  function obtenerAccion(nombre) {
    return obtener('sheets.acciones.' + nombre, '');
  }

  function obtenerEstado(nombre) {
    return obtener('estados.' + nombre, '');
  }

  function obtenerVista(id) {
    return obtener('vistas.' + id, null);
  }

  function obtenerEndpoint() {
    return obtener('sheets.endpoint', '');
  }

  function hayEndpointConfigurado() {
    return !!obtenerEndpoint();
  }

  function obtenerHoja(nombre) {
    return obtener('hojas.' + nombre, '');
  }

  function obtenerColumnas(tipo, campo) {
    return obtener('columnas.' + tipo + '.' + campo, []);
  }

  window.CoordinadorMVPConfig = Object.freeze({
    data: CONFIG,
    obtener: obtener,
    obtenerAccion: obtenerAccion,
    obtenerEstado: obtenerEstado,
    obtenerVista: obtenerVista,
    obtenerEndpoint: obtenerEndpoint,
    hayEndpointConfigurado: hayEndpointConfigurado,
    obtenerHoja: obtenerHoja,
    obtenerColumnas: obtenerColumnas
  });
})(window);