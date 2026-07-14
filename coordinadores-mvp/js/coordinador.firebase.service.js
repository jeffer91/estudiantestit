/* =========================================================
Archivo: coordinador.firebase.service.js
Ruta: /coordinadores-mvp/js/coordinador.firebase.service.js
Función:
- Conectar la app de coordinadores con Firebase.
- Leer períodos activos, coordinadores, estudiantes y títulos.
- Mostrar únicamente envíos con las tres propuestas registradas.
- Aprobar, reemplazar o devolver títulos.
- Registrar historial y auditoría.
Dependencias:
- Firebase compat SDK.
- /administrador/ad-js/ad-config.js
========================================================= */
(function(window){
  'use strict';

  var db = null;
  var app = null;

  function config(){ return window.AD_CONFIG || {}; }
  function colecciones(){
    var cfg = config().colecciones || {};
    return {
      config: cfg.titulosConfig || 'titulos_config',
      coordinadores: cfg.coordinadores || 'titulos_coordinadores',
      estudiantes: cfg.estudiantes || 'Estudiantes',
      titulos: cfg.titulos || 'titulos',
      historial: cfg.historial || 'titulos_historial',
      logs: cfg.logs || 'titulos_logs'
    };
  }

  function texto(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function normal(valor){
    return texto(valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function estado(valor){
    return texto(valor)
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function cedula(valor){
    return texto(valor).replace(/[^0-9A-Za-z]/g, '');
  }

  function campo(objeto, nombres){
    var data = objeto || {};
    var mapa = {};
    var claves = Object.keys(data);
    var i;
    var clave;

    claves.forEach(function(item){ mapa[normal(item)] = item; });

    for(i = 0; i < nombres.length; i += 1){
      clave = mapa[normal(nombres[i])];
      if(clave !== undefined && data[clave] !== undefined && data[clave] !== null){
        if(typeof data[clave] === 'object') return data[clave];
        if(texto(data[clave])) return data[clave];
      }
    }
    return '';
  }

  function nombreCoordinador(valor, base){
    if(valor && typeof valor === 'object'){
      return texto(valor.nombre || valor.Nombre || valor.name || valor.coordinadorNombre);
    }
    return texto(valor || campo(base || {}, ['coordinadorNombre','nombreCoordinador']));
  }

  function fechaIso(){ return new Date().toISOString(); }

  function fechaLegible(valor){
    if(!valor) return '';
    try{
      if(typeof valor.toDate === 'function') return valor.toDate().toLocaleString('es-EC');
      if(valor.seconds !== undefined) return new Date(Number(valor.seconds) * 1000).toLocaleString('es-EC');
      if(valor._seconds !== undefined) return new Date(Number(valor._seconds) * 1000).toLocaleString('es-EC');
      var fecha = new Date(valor);
      return Number.isNaN(fecha.getTime()) ? texto(valor) : fecha.toLocaleString('es-EC');
    }catch(error){
      return texto(valor);
    }
  }

  function inicializar(){
    var firebaseConfig = config().firebaseConfig || {};

    if(db) return Promise.resolve({ ok: true, db: db, reutilizado: true });
    if(!window.firebase || !window.firebase.firestore){
      return Promise.reject(new Error('Firebase SDK no está cargado.'));
    }
    if(!firebaseConfig.apiKey || !firebaseConfig.projectId){
      return Promise.reject(new Error('La configuración de Firebase no está disponible.'));
    }

    try{
      if(window.firebase.apps && window.firebase.apps.length){
        app = window.firebase.apps[0];
      }else{
        app = window.firebase.initializeApp(firebaseConfig);
      }
      db = window.firebase.firestore();
      try{ db.settings({ ignoreUndefinedProperties: true }); }catch(errorSettings){}
      return Promise.resolve({ ok: true, db: db, reutilizado: false });
    }catch(error){
      db = null;
      return Promise.reject(error);
    }
  }

  function obtenerDb(){
    if(!db) throw new Error('Firebase todavía no está inicializado.');
    return db;
  }

  function snapshotLista(snapshot){
    var salida = [];
    snapshot.forEach(function(doc){
      salida.push(Object.assign({ _docId: doc.id }, doc.data() || {}));
    });
    return salida;
  }

  function periodoDe(data){
    var objeto = data || {};
    return {
      id: texto(campo(objeto, ['periodoId','PeriodoId','ultimoPeriodoId','periodoCanonicoId','periodoActivoId'])),
      label: texto(campo(objeto, ['periodoLabel','PeriodoLabel','ultimoPeriodoLabel','periodoTexto','PeriodoTexto','periodo','Período']))
    };
  }

  function listarPeriodosActivos(){
    var cols = colecciones();
    return inicializar()
      .then(function(){ return obtenerDb().collection(cols.config).doc('app').get(); })
      .then(function(doc){
        var data = doc.exists ? (doc.data() || {}) : {};
        var ids = Array.isArray(data.periodosActivos) ? data.periodosActivos.slice() : [];
        var labels = Array.isArray(data.periodosActivosLabels) ? data.periodosActivosLabels.slice() : [];
        var principalId = texto(data.periodoActivoId || (data.periodoActivo && data.periodoActivo.id));
        var principalLabel = texto(data.periodoActivoLabel || (data.periodoActivo && data.periodoActivo.label));
        var mapa = {};
        var periodos = [];

        ids.forEach(function(id, indice){
          id = texto(id);
          if(!id || mapa[id]) return;
          mapa[id] = true;
          periodos.push({
            id: id,
            label: texto(labels[indice]) || id,
            principal: id === principalId
          });
        });

        if(principalId && !mapa[principalId]){
          periodos.unshift({ id: principalId, label: principalLabel || principalId, principal: true });
        }

        periodos.sort(function(a,b){
          if(a.principal && !b.principal) return -1;
          if(!a.principal && b.principal) return 1;
          return String(a.label).localeCompare(String(b.label), 'es');
        });

        return {
          periodos: periodos,
          principal: periodos.find(function(p){ return p.principal; }) || periodos[0] || null
        };
      });
  }

  function tokensCarrera(coordinador){
    var data = coordinador || {};
    var salida = [];
    var mapa = {};

    function agregar(valor){
      var limpio = texto(valor);
      var clave = normal(limpio);
      if(!limpio || !clave || mapa[clave]) return;
      mapa[clave] = true;
      salida.push(limpio);
    }

    (Array.isArray(data.carreras) ? data.carreras : []).forEach(function(item){
      if(typeof item === 'string') agregar(item);
      else{
        agregar(item && item.codigoCarrera);
        agregar(item && item.nombreCarrera);
        agregar(item && item.carrera);
      }
    });

    (Array.isArray(data.carrerasAsignadas) ? data.carrerasAsignadas : []).forEach(function(item){
      agregar(item && item.codigoCarrera);
      agregar(item && item.nombreCarrera);
      agregar(item && item.carrera);
    });

    return salida;
  }

  function listarCoordinadoresActivos(){
    var cols = colecciones();
    return inicializar()
      .then(function(){ return obtenerDb().collection(cols.coordinadores).get(); })
      .then(function(snapshot){
        return snapshotLista(snapshot)
          .filter(function(item){ return item.activo !== false; })
          .map(function(item){
            var carreras = tokensCarrera(item);
            return {
              id: texto(item.id || item._docId),
              nombre: texto(item.nombre || item.Nombre || item._docId),
              telegram: texto(item.telegram || item.Telegram),
              activo: item.activo !== false,
              carreras: carreras,
              carrerasTexto: carreras.length ? carreras.join(', ') : 'Sin carreras asignadas',
              raw: item
            };
          })
          .sort(function(a,b){ return String(a.nombre).localeCompare(String(b.nombre), 'es'); });
      });
  }

  function obtenerCedula(data){
    var directo = cedula(campo(data, ['cedula','Cédula','numeroIdentificacion','identificacion']));
    var id = texto(data && data._docId);
    var partes;
    if(directo) return directo;
    if(/^\d{9,10}$/.test(id)) return id;
    partes = id.split('__');
    if(partes.length && /^\d{9,10}$/.test(partes[partes.length - 1])) return partes[partes.length - 1];
    return '';
  }

  function normalizarEstudiante(data){
    var p = periodoDe(data);
    return {
      cedula: obtenerCedula(data),
      nombres: texto(campo(data, ['Nombres','nombres','Nombre','nombre','estudiante'])),
      carrera: texto(campo(data, ['NombreCarrera','nombreCarrera','Carrera','carrera'])),
      codigoCarrera: texto(campo(data, ['CodigoCarrera','codigoCarrera'])),
      periodoId: p.id,
      periodoLabel: p.label,
      raw: data || {}
    };
  }

  function normalizarTitulo(data, estudiante){
    var base = data || {};
    var persona = estudiante || {};
    var pTitulo = periodoDe(base);
    var pEstudiante = periodoDe(persona.raw || persona);
    var est = estado(campo(base, ['estado','Estado','estadoFinal','estadoProceso'])) || 'PENDIENTE_REVISION';
    var coord = campo(base, ['coordinador']);

    if(est === 'ENVIADO' || est === 'PENDIENTE_SYNC') est = 'PENDIENTE_REVISION';

    return {
      id: texto(base._docId),
      _docId: texto(base._docId),
      _clave: texto(base._docId) || obtenerCedula(base),
      cedula: obtenerCedula(base),
      nombres: texto(campo(base, ['nombres','Nombres','estudiante','Estudiante'])) || texto(persona.nombres),
      carrera: texto(campo(base, ['carrera','Carrera','NombreCarrera','nombreCarrera'])) || texto(persona.carrera),
      codigoCarrera: texto(campo(base, ['codigoCarrera','CodigoCarrera'])) || texto(persona.codigoCarrera),
      periodoId: pTitulo.id || pEstudiante.id || texto(persona.periodoId),
      periodoLabel: pTitulo.label || pEstudiante.label || texto(persona.periodoLabel),
      periodo: pTitulo.label || pEstudiante.label || pTitulo.id || pEstudiante.id,
      telegram: texto(campo(base, ['telegram','Telegram','usuarioTelegram'])),
      estado: est,
      fechaEnvio: fechaLegible(campo(base, ['fechaenviotitulos','fechaEnvioTitulos','fechaEnvio','creadoEn','createdAt'])),
      titulo1: texto(campo(base, ['titulo1','Título 1','Titulo1'])),
      titulo2: texto(campo(base, ['titulo2','Título 2','Titulo2'])),
      titulo3: texto(campo(base, ['titulo3','Título 3','Titulo3'])),
      tituloPreferido: texto(campo(base, ['tituloPreferido','tituloPreferidoTexto','preferido','tituloSeleccionado','titulofavorito'])),
      tituloAprobado: texto(campo(base, ['tituloAprobado','tituloaprobado','tituloFinal'])),
      comentarioCoordinador: texto(campo(base, ['comentarioCoordinador','comentario','observacion','motivo'])),
      coordinador: nombreCoordinador(coord, base),
      coordinadorNombre: nombreCoordinador(coord, base),
      fechaRevision: fechaLegible(campo(base, ['fechaRevision','fecharespuestaprobado','fechaRevisionLocal','actualizadoEn'])),
      raw: base
    };
  }

  function tieneTitulosEnviados(item){
    return Boolean(
      item &&
      texto(item.titulo1) &&
      texto(item.titulo2) &&
      texto(item.titulo3)
    );
  }

  function coincidePeriodo(item, periodo){
    var id = normal(periodo && periodo.id);
    var label = normal(periodo && periodo.label);
    var itemId = normal(item && item.periodoId);
    var itemLabel = normal(item && item.periodoLabel);
    if(!id && !label) return true;
    return Boolean((id && itemId === id) || (label && itemLabel === label));
  }

  function listarTitulos(periodo){
    var cols = colecciones();
    return inicializar()
      .then(function(){
        return Promise.all([
          obtenerDb().collection(cols.estudiantes).get(),
          obtenerDb().collection(cols.titulos).get()
        ]);
      })
      .then(function(partes){
        var estudiantes = snapshotLista(partes[0]);
        var titulos = snapshotLista(partes[1]);
        var mapa = {};

        estudiantes.map(normalizarEstudiante).forEach(function(item){
          if(item.cedula) mapa[item.cedula] = item;
        });

        return titulos
          .map(function(item){ return normalizarTitulo(item, mapa[obtenerCedula(item)]); })
          .filter(function(item){
            return item.cedula && coincidePeriodo(item, periodo) && tieneTitulosEnviados(item);
          })
          .sort(function(a,b){
            return String(a.nombres || a.cedula).localeCompare(String(b.nombres || b.cedula), 'es');
          });
      });
  }

  function docTitulo(envio){
    var id = texto(envio && (envio._docId || envio.id || envio._clave));
    if(!id) id = cedula(envio && envio.cedula);
    if(!id) throw new Error('No se pudo identificar el documento del título.');
    return obtenerDb().collection(colecciones().titulos).doc(id);
  }

  function registrarLog(accion, envio, resolucion, extra){
    var coordinador = resolucion && resolucion.coordinador || {};
    return obtenerDb().collection(colecciones().logs).add(Object.assign({
      accion: accion,
      modulo: 'coordinadores',
      origen: 'coordinadores-mvp',
      estado: 'OK',
      cedula: cedula(envio && envio.cedula),
      periodoId: texto(envio && envio.periodoId),
      periodoLabel: texto(envio && envio.periodoLabel),
      carrera: texto(envio && envio.carrera),
      coordinadorId: texto(coordinador.id),
      coordinadorNombre: texto(coordinador.nombre),
      fecha: fechaIso(),
      creadoEn: window.firebase.firestore.FieldValue.serverTimestamp()
    }, extra || {}));
  }

  function aprobarTitulo(envio, resolucion){
    var final = texto(resolucion && resolucion.tituloFinal);
    var original = texto(resolucion && resolucion.tituloOriginal);
    var nuevoEstado;
    var coordinador = resolucion && resolucion.coordinador || {};
    var payload;

    if(!tieneTitulosEnviados(envio)) {
      return Promise.reject(new Error('El estudiante no tiene las tres propuestas registradas.'));
    }
    if(!final || final.length < 8) return Promise.reject(new Error('Selecciona o escribe el título final.'));
    nuevoEstado = normal(final) === normal(original) ? 'APROBADO' : 'REEMPLAZADO';

    payload = {
      estado: nuevoEstado,
      estadoFinal: nuevoEstado,
      tituloAprobado: final,
      tituloaprobado: final,
      tituloSeleccionadoNumero: Number(resolucion.tituloSeleccionadoNumero || 0),
      tituloOriginalSeleccionado: original,
      comentarioCoordinador: texto(resolucion.comentarioCoordinador),
      coordinador: {
        id: texto(coordinador.id),
        nombre: texto(coordinador.nombre)
      },
      coordinadorNombre: texto(coordinador.nombre),
      fechaRevision: window.firebase.firestore.FieldValue.serverTimestamp(),
      fechaRevisionLocal: new Date().toLocaleString('es-EC'),
      actualizadoEn: fechaIso(),
      actualizadoPor: texto(coordinador.nombre) || 'coordinador'
    };

    return inicializar()
      .then(function(){ return docTitulo(envio).set(payload, { merge: true }); })
      .then(function(){
        return registrarLog('COORDINADOR_TITULO_APROBADO', envio, resolucion, {
          estadoNuevo: nuevoEstado,
          tituloFinal: final
        });
      })
      .then(function(){
        return { ok: true, estado: nuevoEstado, cambios: payload, mensaje: 'Título guardado correctamente.' };
      });
  }

  function devolverTitulo(envio, resolucion){
    var comentario = texto(resolucion && resolucion.comentarioCoordinador);
    var coordinador = resolucion && resolucion.coordinador || {};
    var historialId;
    var historial;
    var cambios;

    if(!tieneTitulosEnviados(envio)) {
      return Promise.reject(new Error('El estudiante no tiene las tres propuestas registradas.'));
    }
    if(comentario.length < 4) return Promise.reject(new Error('Escribe una observación para devolver el título.'));

    historialId = [texto(envio.periodoId || 'sin_periodo'), cedula(envio.cedula), Date.now()].join('__');
    historial = Object.assign({}, envio.raw || {}, {
      cedula: cedula(envio.cedula),
      nombres: texto(envio.nombres),
      carrera: texto(envio.carrera),
      periodoId: texto(envio.periodoId),
      periodoLabel: texto(envio.periodoLabel),
      estado: 'DEVUELTO',
      comentarioCoordinador: comentario,
      coordinador: { id: texto(coordinador.id), nombre: texto(coordinador.nombre) },
      coordinadorNombre: texto(coordinador.nombre),
      archivadoEn: window.firebase.firestore.FieldValue.serverTimestamp(),
      archivadoEnLocal: new Date().toLocaleString('es-EC'),
      origen: 'coordinadores-mvp'
    });

    cambios = {
      estado: 'DEVUELTO',
      estadoFinal: 'DEVUELTO',
      comentarioCoordinador: comentario,
      coordinador: { id: texto(coordinador.id), nombre: texto(coordinador.nombre) },
      coordinadorNombre: texto(coordinador.nombre),
      fechaRevision: window.firebase.firestore.FieldValue.serverTimestamp(),
      fechaRevisionLocal: new Date().toLocaleString('es-EC'),
      devueltoParaReenvio: true,
      actualizadoEn: fechaIso(),
      actualizadoPor: texto(coordinador.nombre) || 'coordinador'
    };

    return inicializar()
      .then(function(){
        return Promise.all([
          obtenerDb().collection(colecciones().historial).doc(historialId).set(historial),
          docTitulo(envio).set(cambios, { merge: true })
        ]);
      })
      .then(function(){
        return registrarLog('COORDINADOR_TITULO_DEVUELTO', envio, resolucion, { comentario: comentario });
      })
      .then(function(){
        return { ok: true, estado: 'DEVUELTO', cambios: cambios, mensaje: 'Título devuelto correctamente.' };
      });
  }

  function diagnostico(){
    return inicializar()
      .then(function(){
        return Promise.all([
          listarPeriodosActivos(),
          listarCoordinadoresActivos(),
          obtenerDb().collection(colecciones().titulos).get()
        ]);
      })
      .then(function(partes){
        var todos = snapshotLista(partes[2]);
        var validos = todos.filter(function(item){ return tieneTitulosEnviados(normalizarTitulo(item, null)); });
        return {
          ok: true,
          proyecto: config().firebaseConfig && config().firebaseConfig.projectId,
          periodosActivos: partes[0].periodos.length,
          coordinadoresActivos: partes[1].length,
          titulosDocumentos: partes[2].size,
          titulosValidos: validos.length,
          fecha: fechaIso()
        };
      });
  }

  window.CoordinadorMVPFirebase = Object.freeze({
    inicializar: inicializar,
    listarPeriodosActivos: listarPeriodosActivos,
    listarCoordinadoresActivos: listarCoordinadoresActivos,
    listarTitulos: listarTitulos,
    aprobarTitulo: aprobarTitulo,
    devolverTitulo: devolverTitulo,
    diagnostico: diagnostico,
    tieneTitulosEnviados: tieneTitulosEnviados,
    normalizarEstado: estado,
    normalizarTexto: normal,
    fechaLegible: fechaLegible
  });
})(window);
