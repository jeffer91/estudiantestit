/* =========================================================
Archivo: coordinador.favorito.sheets.js
Ruta: /coordinadores-mvp/js/coordinador.favorito.sheets.js
Función:
- Consultar el envío del estudiante directamente en Google Sheets.
- Leer la columna Preferido de la hoja Envios.
- Resaltar en dorado el título favorito dentro del modal coordinador.
- Mantener separada la preferencia del estudiante de la selección del coordinador.
========================================================= */

(function(window,document){
  'use strict';

  var consultaActiva = 0;
  var CONFIG_COLLECTION = 'app_config';
  var CONFIG_DOCUMENT = 'titulos_sheets';
  var TIMEOUT_MS = 45000;

  function texto(valor){
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function normal(valor){
    return texto(valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function limpiarCedula(valor){
    return texto(valor).replace(/[^0-9A-Za-z]/g,'');
  }

  function campo(objeto,nombres){
    var data = objeto || {};
    var mapa = {};
    var i;
    var clave;

    Object.keys(data).forEach(function(item){
      mapa[normal(item)] = item;
    });

    for(i = 0; i < nombres.length; i += 1){
      clave = mapa[normal(nombres[i])];
      if(clave !== undefined && data[clave] !== undefined && data[clave] !== null){
        if(typeof data[clave] === 'object') return data[clave];
        if(texto(data[clave])) return data[clave];
      }
    }

    return '';
  }

  function obtenerNumero(valor){
    var limpio = texto(valor).toLowerCase();
    var coincidencia;

    if(/^[123]$/.test(limpio)) return Number(limpio);

    coincidencia = limpio.match(/(?:^|\b)(?:titulo|título|propuesta|opcion|opción|alternativa|favorito)\s*#?\s*([123])(?:\b|$)/i);
    if(coincidencia) return Number(coincidencia[1]);

    coincidencia = limpio.match(/^([123])\s*[-:.)]/);
    return coincidencia ? Number(coincidencia[1]) : 0;
  }

  function obtenerDb(){
    if(!window.firebase || !window.firebase.firestore){
      throw new Error('Firebase no está disponible.');
    }

    if(!window.firebase.apps || !window.firebase.apps.length){
      var cfg = window.AD_CONFIG && window.AD_CONFIG.firebaseConfig || {};
      if(!cfg.apiKey || !cfg.projectId) throw new Error('No existe configuración Firebase.');
      window.firebase.initializeApp(cfg);
    }

    return window.firebase.firestore();
  }

  function leerConfiguracionSheets(){
    var endpointFallback = window.CoordinadorMVPConfig &&
      typeof window.CoordinadorMVPConfig.obtenerEndpoint === 'function'
      ? window.CoordinadorMVPConfig.obtenerEndpoint()
      : '';

    return obtenerDb().collection(CONFIG_COLLECTION).doc(CONFIG_DOCUMENT).get()
      .then(function(doc){
        var data = doc.exists ? (doc.data() || {}) : {};
        return {
          activo:data.activo !== false,
          endpoint:texto(data.endpoint || data.url || endpointFallback),
          timeoutMs:Number(data.timeoutMs || TIMEOUT_MS)
        };
      });
  }

  function enviarConsulta(endpoint,payload,timeoutMs){
    var controller = window.AbortController ? new AbortController() : null;
    var timer = null;
    var opciones = {
      method:'POST',
      mode:'cors',
      cache:'no-store',
      headers:{ 'Content-Type':'text/plain;charset=utf-8' },
      body:JSON.stringify(payload)
    };

    if(controller){
      opciones.signal = controller.signal;
      timer = window.setTimeout(function(){ controller.abort(); },Math.max(5000,Number(timeoutMs || TIMEOUT_MS)));
    }

    return fetch(endpoint,opciones)
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
          throw new Error('La consulta a Google Sheets superó el tiempo máximo.');
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
  }

  function listaRegistros(respuesta){
    var salida = [];
    var candidatos = [
      respuesta && respuesta.envio,
      respuesta && respuesta.registro,
      respuesta && respuesta.data,
      respuesta && respuesta.datos,
      respuesta && respuesta.resultado,
      respuesta && respuesta.result,
      respuesta && respuesta.data && respuesta.data.envio,
      respuesta && respuesta.data && respuesta.data.registro
    ];

    candidatos.forEach(function(item){
      if(Array.isArray(item)) salida = salida.concat(item);
      else if(item && typeof item === 'object') salida.push(item);
    });

    if(respuesta && Array.isArray(respuesta.envios)) salida = salida.concat(respuesta.envios);
    if(respuesta && Array.isArray(respuesta.registros)) salida = salida.concat(respuesta.registros);
    if(respuesta && respuesta.data && Array.isArray(respuesta.data.envios)) salida = salida.concat(respuesta.data.envios);
    if(respuesta && respuesta.data && Array.isArray(respuesta.data.registros)) salida = salida.concat(respuesta.data.registros);

    if(!salida.length && respuesta && typeof respuesta === 'object') salida.push(respuesta);
    return salida;
  }

  function periodoRegistro(registro){
    return normal(campo(registro,[
      'periodoId','PeriodoId','periodoLabel','PeriodoLabel','periodo','Periodo','Período'
    ]));
  }

  function coincidePeriodo(registro,envio){
    var periodo = periodoRegistro(registro);
    var id = normal(envio && envio.periodoId);
    var label = normal(envio && (envio.periodoLabel || envio.periodo));

    if(!id && !label) return true;
    return Boolean((id && periodo === id) || (label && periodo === label));
  }

  function fechaRegistro(registro){
    var valor = campo(registro,[
      'Fecha servidor','fechaServidor','Fecha envío','Fecha envio','fechaEnvio','fecha','Fecha'
    ]);
    var fecha = new Date(valor);
    return Number.isNaN(fecha.getTime()) ? 0 : fecha.getTime();
  }

  function elegirRegistro(respuesta,envio){
    var lista = listaRegistros(respuesta).filter(function(registro){
      return registro && typeof registro === 'object';
    });
    var mismoPeriodo = lista.filter(function(registro){
      return coincidePeriodo(registro,envio);
    });

    if(mismoPeriodo.length) lista = mismoPeriodo;
    lista.sort(function(a,b){ return fechaRegistro(b) - fechaRegistro(a); });
    return lista[0] || null;
  }

  function tituloRegistro(registro,numero){
    return texto(campo(registro,[
      'titulo' + numero,
      'Título ' + numero,
      'Titulo ' + numero,
      'Titulo' + numero,
      'Título' + numero
    ]));
  }

  function detectarFavorito(registro,envio){
    var preferido = campo(registro,[
      'Preferido','preferido','tituloPreferidoNumero','tituloPreferido',
      'tituloPreferidoTexto','tituloSeleccionado','tituloFavorito','titulofavorito'
    ]);
    var numero = obtenerNumero(preferido);
    var preferidoNormal = normal(preferido);
    var titulosRegistro = [
      tituloRegistro(registro,1),
      tituloRegistro(registro,2),
      tituloRegistro(registro,3)
    ];
    var titulosModal = [
      texto(envio && envio.titulo1),
      texto(envio && envio.titulo2),
      texto(envio && envio.titulo3)
    ];
    var i;

    if(!numero && preferidoNormal){
      for(i = 0; i < 3; i += 1){
        if(normal(titulosRegistro[i]) === preferidoNormal || normal(titulosModal[i]) === preferidoNormal){
          numero = i + 1;
          break;
        }
      }
    }

    return {
      numero:numero,
      valorOriginal:preferido,
      titulo:numero ? (titulosRegistro[numero - 1] || titulosModal[numero - 1]) : '',
      registro:registro
    };
  }

  function limpiarFavorito(){
    document.querySelectorAll('.proposal-card').forEach(function(tarjeta){
      tarjeta.classList.remove('is-favorite');
      tarjeta.removeAttribute('data-favorite-source');
      if(!tarjeta.classList.contains('is-selected')) tarjeta.removeAttribute('aria-label');
    });
    document.querySelectorAll('.favorite-badge').forEach(function(insignia){
      insignia.hidden = true;
    });
  }

  function aplicarFavorito(numero){
    limpiarFavorito();
    if(numero < 1 || numero > 3) return false;

    var tarjeta = document.querySelector('.proposal-card[data-propuesta="' + numero + '"]');
    var insignia = document.querySelector('.favorite-badge[data-favorito="' + numero + '"]');

    if(tarjeta){
      tarjeta.classList.add('is-favorite');
      tarjeta.setAttribute('data-favorite-source','google-sheets');
      tarjeta.setAttribute('aria-label','Título ' + numero + ', favorito del estudiante según Google Sheets');
    }
    if(insignia) insignia.hidden = false;
    return Boolean(tarjeta);
  }

  function consultarFavoritoModal(){
    var modal = document.getElementById('detalleModal');
    var modulo = window.CoordinadorMVPModal;
    var envio = modulo && typeof modulo.obtenerEnvioActual === 'function'
      ? modulo.obtenerEnvioActual()
      : null;
    var cedula = limpiarCedula(envio && envio.cedula);
    var token;

    if(!modal || modal.hidden || !envio || !cedula) return;

    token = ++consultaActiva;

    leerConfiguracionSheets()
      .then(function(configSheets){
        if(!configSheets.activo || !configSheets.endpoint){
          throw new Error('Google Sheets no está configurado.');
        }

        var datos = {
          cedula:cedula,
          numeroIdentificacion:cedula,
          periodoId:texto(envio.periodoId),
          periodoLabel:texto(envio.periodoLabel || envio.periodo),
          consultarEnvio:true
        };

        return enviarConsulta(configSheets.endpoint,{
          accion:'CONSULTAR_ENVIO_CEDULA',
          tipo:'CONSULTAR_ENVIO_CEDULA',
          consultarEnvio:true,
          cedula:cedula,
          numeroIdentificacion:cedula,
          periodoId:datos.periodoId,
          periodoLabel:datos.periodoLabel,
          origen:'coordinadores-mvp',
          fechaCliente:new Date().toISOString(),
          data:datos
        },configSheets.timeoutMs);
      })
      .then(function(respuesta){
        var actual;
        var registro;
        var favorito;

        if(token !== consultaActiva || modal.hidden) return;

        actual = window.CoordinadorMVPModal && window.CoordinadorMVPModal.obtenerEnvioActual
          ? window.CoordinadorMVPModal.obtenerEnvioActual()
          : null;
        if(!actual || limpiarCedula(actual.cedula) !== cedula) return;

        registro = elegirRegistro(respuesta,envio);
        if(!registro) return;

        favorito = detectarFavorito(registro,envio);
        if(aplicarFavorito(favorito.numero)){
          if(window.CoordinadorMVPModal && typeof window.CoordinadorMVPModal.mostrarEstado === 'function'){
            window.CoordinadorMVPModal.mostrarEstado(
              'El título favorito registrado en Google Sheets está resaltado en dorado. Selecciona la propuesta que aprobarás o escribe el título final.',
              'info'
            );
          }
        }
      })
      .catch(function(error){
        console.warn('No se pudo consultar el favorito en Google Sheets:',error);
      });
  }

  function observarModal(){
    var modal = document.getElementById('detalleModal');
    if(!modal) return;

    var observer = new MutationObserver(function(cambios){
      cambios.forEach(function(cambio){
        if(cambio.type === 'attributes' && cambio.attributeName === 'hidden'){
          if(modal.hidden){
            consultaActiva += 1;
          }else{
            window.setTimeout(consultarFavoritoModal,20);
          }
        }
      });
    });

    observer.observe(modal,{ attributes:true, attributeFilter:['hidden'] });

    if(!modal.hidden) window.setTimeout(consultarFavoritoModal,20);
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded',observarModal,{ once:true });
  }else{
    observarModal();
  }

  window.CoordinadorMVPFavoritoSheets = Object.freeze({
    consultarFavoritoModal:consultarFavoritoModal,
    aplicarFavorito:aplicarFavorito,
    detectarFavorito:detectarFavorito
  });
})(window,document);
