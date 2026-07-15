/* =========================================================
Archivo: coordinador.sheets.primary.js
Ruta: /coordinadores-mvp/js/coordinador.sheets.primary.js
Función:
- Usar Google Sheets como fuente principal de coordinadores y envíos.
- Leer el endpoint de Apps Script desde Firebase: app_config/titulos_sheets.
- Normalizar la hoja Envios, incluida la columna Preferido.
- Aprobar y devolver primero en Google Sheets.
- Dejar Firebase únicamente como respaldo desde coordinador.app.js.
========================================================= */

(function(window){
  'use strict';

  var endpointCache = '';
  var configCache = null;

  function config(){ return window.CoordinadorMVPConfig || null; }
  function utils(){ return window.CoordinadorMVPUtils || null; }
  function texto(valor){ return String(valor === null || valor === undefined ? '' : valor).trim(); }

  function validar(){
    if(!config()) throw new Error('CoordinadorMVPConfig no está disponible.');
    if(!utils()) throw new Error('CoordinadorMVPUtils no está disponible.');
  }

  function obtenerDb(){
    if(!window.firebase || !window.firebase.firestore){
      throw new Error('Firebase SDK no está disponible para leer la configuración de Google Sheets.');
    }

    if(!window.firebase.apps || !window.firebase.apps.length){
      var firebaseConfig = window.AD_CONFIG && window.AD_CONFIG.firebaseConfig || {};
      if(!firebaseConfig.apiKey || !firebaseConfig.projectId){
        throw new Error('No existe configuración Firebase.');
      }
      window.firebase.initializeApp(firebaseConfig);
    }

    return window.firebase.firestore();
  }

  function leerConfiguracion(forzar){
    validar();

    if(configCache && !forzar){
      return Promise.resolve(Object.assign({},configCache));
    }

    return obtenerDb().collection('app_config').doc('titulos_sheets').get()
      .then(function(doc){
        var data = doc.exists ? (doc.data() || {}) : {};
        var endpointFallback = config().obtenerEndpoint ? config().obtenerEndpoint() : '';
        var resultado = {
          activo:data.activo !== false,
          endpoint:texto(data.endpoint || data.url || endpointFallback),
          timeoutMs:Math.max(5000,Number(data.timeoutMs || config().obtener('sheets.timeoutMs',45000) || 45000)),
          nombre:texto(data.nombre || 'Google Sheets Titulación')
        };

        if(!resultado.endpoint){
          throw new Error('No existe endpoint de Apps Script en app_config/titulos_sheets.');
        }

        if(!resultado.activo){
          throw new Error('La integración principal con Google Sheets está inactiva.');
        }

        endpointCache = resultado.endpoint;
        configCache = resultado;
        return Object.assign({},resultado);
      });
  }

  function enviarAccion(accion,payload){
    validar();
    if(!accion) return Promise.reject(new Error('No se definió la acción de Google Sheets.'));

    return leerConfiguracion(false).then(function(configSheets){
      var controller = window.AbortController ? new AbortController() : null;
      var timer = null;
      var body = {
        accion:accion,
        tipo:accion,
        origen:config().obtener('app.origen','coordinadores-mvp'),
        version:config().obtener('app.version','1.0.0'),
        fechaCliente:utils().fechaIso(),
        data:payload || {}
      };
      var opciones = {
        method:'POST',
        mode:'cors',
        cache:'no-store',
        headers:{ 'Content-Type':'text/plain;charset=utf-8' },
        body:JSON.stringify(body)
      };

      if(controller){
        opciones.signal = controller.signal;
        timer = window.setTimeout(function(){ controller.abort(); },configSheets.timeoutMs);
      }

      return fetch(configSheets.endpoint,opciones)
        .then(function(respuesta){
          return respuesta.text().then(function(cuerpo){
            var data;
            try{
              data = cuerpo ? JSON.parse(cuerpo) : {};
            }catch(errorJson){
              throw new Error('Google Sheets respondió en un formato no válido.');
            }

            if(!respuesta.ok || data.ok === false){
              throw new Error(data.mensaje || data.error || ('Google Sheets respondió HTTP ' + respuesta.status));
            }

            return data;
          });
        })
        .catch(function(error){
          if(error && error.name === 'AbortError'){
            throw new Error('Google Sheets superó el tiempo máximo de respuesta.');
          }
          throw error;
        })
        .then(function(resultado){
          if(timer) window.clearTimeout(timer);
          return resultado;
        },function(error){
          if(timer) window.clearTimeout(timer);
          throw error;
        });
    });
  }

  function extraerLista(respuesta,tipo){
    var candidatos = [];
    var salida = [];

    if(Array.isArray(respuesta)) return respuesta;
    if(!respuesta || typeof respuesta !== 'object') return [];

    if(tipo === 'coordinadores'){
      candidatos = [
        respuesta.coordinadores,
        respuesta.data,
        respuesta.registros,
        respuesta.data && respuesta.data.coordinadores,
        respuesta.data && respuesta.data.registros
      ];
    }else{
      candidatos = [
        respuesta.envios,
        respuesta.data,
        respuesta.registros,
        respuesta.data && respuesta.data.envios,
        respuesta.data && respuesta.data.registros,
        respuesta.resultado,
        respuesta.result
      ];
    }

    candidatos.forEach(function(item){
      if(Array.isArray(item)) salida = salida.concat(item);
    });

    return salida;
  }

  function campoFlexible(fila,aliases,fallback){
    return utils().obtenerCampoFlexible(fila || {},aliases || [],fallback === undefined ? '' : fallback);
  }

  function numeroFavorito(valor,titulos){
    var limpio = texto(valor);
    var coincidencia;
    var normalValor;
    var i;

    if(/^[123]$/.test(limpio)) return Number(limpio);

    coincidencia = limpio.match(/(?:t[ií]tulo|propuesta|opci[oó]n|alternativa|favorito)\s*#?\s*([123])/i);
    if(coincidencia) return Number(coincidencia[1]);

    normalValor = utils().normalizarTexto ? utils().normalizarTexto(limpio) : limpio.toLowerCase();
    if(normalValor){
      for(i = 0; i < 3; i += 1){
        var normalTitulo = utils().normalizarTexto ? utils().normalizarTexto(titulos[i]) : texto(titulos[i]).toLowerCase();
        if(normalTitulo && normalTitulo === normalValor) return i + 1;
      }
    }

    return 0;
  }

  function normalizarCoordinador(fila,indice){
    var columnas = config().data.columnas.coordinadores;
    var nombre = utils().limpiarTexto(campoFlexible(fila,columnas.nombre,''));
    var carreras = utils().normalizarCarreras(campoFlexible(fila,columnas.carreras,''));
    var activo = utils().parseBoolean(campoFlexible(fila,columnas.activo,'activo'),true);

    return {
      id:utils().normalizarClave(nombre || ('coordinador_' + indice)),
      nombre:nombre,
      carreras:carreras,
      carrerasTexto:utils().carrerasComoTexto(carreras),
      activo:activo,
      fuente:'google-sheets',
      raw:fila || {}
    };
  }

  function normalizarEnvio(fila,indice){
    var columnas = config().data.columnas.envios;
    var titulos;
    var preferidoRaw;
    var preferidoNumero;
    var estadoPrincipal;
    var periodo;
    var id;

    fila = fila || {};
    titulos = [
      utils().limpiarTitulo(campoFlexible(fila,columnas.titulo1,'')),
      utils().limpiarTitulo(campoFlexible(fila,columnas.titulo2,'')),
      utils().limpiarTitulo(campoFlexible(fila,columnas.titulo3,''))
    ];
    preferidoRaw = utils().limpiarTexto(campoFlexible(fila,columnas.preferido,''));
    preferidoNumero = numeroFavorito(preferidoRaw,titulos);
    estadoPrincipal = utils().limpiarTexto(campoFlexible(fila,columnas.estado,''));

    if(!estadoPrincipal){
      estadoPrincipal = utils().limpiarTexto(campoFlexible(fila,columnas.estadoFirebase,''));
    }
    estadoPrincipal = utils().normalizarEstado(estadoPrincipal || config().obtenerEstado('pendiente'));
    if(estadoPrincipal === 'ENVIADO' || estadoPrincipal === 'PENDIENTE_SYNC'){
      estadoPrincipal = config().obtenerEstado('pendiente');
    }

    periodo = utils().limpiarTexto(campoFlexible(fila,columnas.periodo,''));
    id = utils().limpiarTexto(campoFlexible(fila,columnas.idRegistro,'')) ||
      utils().limpiarTexto(fila.id || fila.ID || fila._id || '');

    var envio = {
      id:id,
      _clave:id,
      fila:fila.fila || fila.rowNumber || fila._rowNumber || (indice + 2),
      cedula:utils().limpiarCedula(campoFlexible(fila,columnas.cedula,'')),
      nombres:utils().limpiarTexto(campoFlexible(fila,columnas.nombres,'')),
      carrera:utils().limpiarTexto(campoFlexible(fila,columnas.carrera,'')),
      codigoCarrera:utils().limpiarTexto(fila.codigoCarrera || fila.CodigoCarrera || ''),
      periodo:periodo,
      periodoLabel:periodo,
      periodoId:utils().limpiarTexto(fila.periodoId || fila.PeriodoId || ''),
      telegram:utils().limpiarTexto(campoFlexible(fila,columnas.telegram,'')),
      estado:estadoPrincipal,
      fechaEnvio:utils().limpiarTexto(campoFlexible(fila,columnas.fechaEnvio,'')),
      titulo1:titulos[0],
      titulo2:titulos[1],
      titulo3:titulos[2],
      tituloPreferido:preferidoRaw || String(preferidoNumero || ''),
      tituloPreferidoNumero:preferidoNumero,
      tituloPreferidoTexto:preferidoNumero ? titulos[preferidoNumero - 1] : preferidoRaw,
      preferido:preferidoNumero || preferidoRaw,
      tituloAprobado:utils().limpiarTitulo(campoFlexible(fila,columnas.tituloAprobado,'')),
      comentarioCoordinador:utils().limpiarTextoMultilinea(campoFlexible(fila,columnas.comentarioCoordinador,'')),
      coordinador:utils().limpiarTexto(campoFlexible(fila,columnas.coordinador,'')),
      fechaRevision:utils().limpiarTexto(campoFlexible(fila,columnas.fechaRevision,'')),
      fuente:'google-sheets',
      raw:fila
    };

    if(!envio.id){
      envio.id = utils().construirClaveEnvio ? utils().construirClaveEnvio(envio) : (envio.cedula || ('envio_' + indice));
      envio._clave = envio.id;
    }

    return envio;
  }

  function listarCoordinadores(){
    return enviarAccion(config().obtenerAccion('listarCoordinadores'),{
      hoja:config().obtener('hojas.coordinadores')
    }).then(function(respuesta){
      return extraerLista(respuesta,'coordinadores')
        .map(normalizarCoordinador)
        .filter(function(item){ return item && item.activo !== false && item.nombre; });
    });
  }

  function listarEnvios(opciones){
    opciones = opciones || {};
    var periodo = opciones.periodo || {};
    var coordinador = opciones.coordinador || null;

    return enviarAccion(config().obtenerAccion('listarEnvios'),{
      hoja:config().obtener('hojas.envios'),
      periodoId:texto(periodo.id || opciones.periodoId),
      periodoLabel:texto(periodo.label || opciones.periodoLabel),
      periodo:texto(periodo.label || periodo.id || opciones.periodo),
      coordinador:coordinador,
      carreras:opciones.carreras || (coordinador && coordinador.carreras) || [],
      estado:opciones.estado || '',
      vista:opciones.vista || ''
    }).then(function(respuesta){
      return extraerLista(respuesta,'envios')
        .map(normalizarEnvio)
        .filter(function(item){ return item && item.cedula && item.titulo1 && item.titulo2 && item.titulo3; });
    });
  }

  function aprobarEnvio(envio,resolucion){
    envio = envio || {};
    resolucion = resolucion || {};
    var tituloFinal = utils().limpiarTitulo(resolucion.tituloFinal);

    if(!tituloFinal || tituloFinal.length < config().obtener('revision.tituloMinimo',8)){
      return Promise.reject(new Error(config().obtener('textos.seleccionaTitulo')));
    }

    var payload = {
      hojaEnvios:config().obtener('hojas.envios'),
      hojaRevisiones:config().obtener('hojas.revisiones'),
      id:envio.id || envio._clave || '',
      idRegistro:envio.id || envio._clave || '',
      fila:envio.fila || '',
      cedula:envio.cedula || '',
      periodo:envio.periodoLabel || envio.periodo || '',
      carrera:envio.carrera || '',
      nombres:envio.nombres || '',
      estadoAnterior:envio.estado || '',
      estadoNuevo:tituloFinal === utils().limpiarTitulo(resolucion.tituloOriginal)
        ? config().obtenerEstado('aprobado')
        : config().obtenerEstado('reemplazado'),
      tituloSeleccionadoNumero:Number(resolucion.tituloSeleccionadoNumero || 0),
      tituloOriginal:resolucion.tituloOriginal || '',
      tituloFinal:tituloFinal,
      tituloAprobado:tituloFinal,
      comentarioCoordinador:utils().limpiarTextoMultilinea(resolucion.comentarioCoordinador),
      coordinador:resolucion.coordinador || null,
      fechaRevision:utils().fechaIso(),
      fechaRevisionLocal:utils().fechaLegible()
    };

    return enviarAccion(config().obtenerAccion('aprobarEnvio'),payload).then(function(respuesta){
      return {
        ok:true,
        estado:payload.estadoNuevo,
        mensaje:respuesta.mensaje || config().obtener('textos.aprobarOk'),
        respuesta:respuesta,
        payload:payload
      };
    });
  }

  function devolverEnvio(envio,resolucion){
    envio = envio || {};
    resolucion = resolucion || {};
    var comentario = utils().limpiarTextoMultilinea(resolucion.comentarioCoordinador);

    if(config().obtener('revision.comentarioObligatorioAlDevolver',true) &&
       comentario.length < config().obtener('revision.comentarioMinimo',4)){
      return Promise.reject(new Error(config().obtener('textos.comentarioDevolucion')));
    }

    var payload = {
      hojaEnvios:config().obtener('hojas.envios'),
      hojaDevueltos:config().obtener('hojas.devueltos'),
      hojaRevisiones:config().obtener('hojas.revisiones'),
      id:envio.id || envio._clave || '',
      idRegistro:envio.id || envio._clave || '',
      fila:envio.fila || '',
      cedula:envio.cedula || '',
      periodo:envio.periodoLabel || envio.periodo || '',
      carrera:envio.carrera || '',
      nombres:envio.nombres || '',
      telegram:envio.telegram || '',
      estadoAnterior:envio.estado || '',
      estadoNuevo:config().obtenerEstado('devuelto'),
      titulo1:envio.titulo1 || '',
      titulo2:envio.titulo2 || '',
      titulo3:envio.titulo3 || '',
      preferido:envio.tituloPreferidoNumero || envio.tituloPreferido || '',
      tituloPreferido:envio.tituloPreferidoTexto || envio.tituloPreferido || '',
      comentarioCoordinador:comentario,
      coordinador:resolucion.coordinador || null,
      fechaRevision:utils().fechaIso(),
      fechaRevisionLocal:utils().fechaLegible(),
      moverDevueltosAHojaDevueltos:config().obtener('revision.moverDevueltosAHojaDevueltos',false)
    };

    return enviarAccion(config().obtenerAccion('devolverEnvio'),payload).then(function(respuesta){
      return {
        ok:true,
        estado:config().obtenerEstado('devuelto'),
        mensaje:respuesta.mensaje || config().obtener('textos.devolverOk'),
        respuesta:respuesta,
        payload:payload
      };
    });
  }

  function diagnostico(){
    return Promise.all([
      leerConfiguracion(true),
      enviarAccion(config().obtenerAccion('ping'),{ prueba:true })
    ]).then(function(partes){
      return {
        ok:true,
        fuentePrincipal:'Google Sheets',
        endpointConfigurado:Boolean(partes[0].endpoint),
        activo:partes[0].activo,
        respuesta:partes[1],
        fecha:new Date().toISOString()
      };
    });
  }

  window.CoordinadorMVPSheetsPrimary = Object.freeze({
    leerConfiguracion:leerConfiguracion,
    enviarAccion:enviarAccion,
    listarCoordinadores:listarCoordinadores,
    listarEnvios:listarEnvios,
    aprobarEnvio:aprobarEnvio,
    devolverEnvio:devolverEnvio,
    diagnostico:diagnostico,
    normalizarCoordinador:normalizarCoordinador,
    normalizarEnvio:normalizarEnvio
  });
})(window);
