/* Recupera el envío y la última resolución sin depender de respuestas JSON simples. */
(function (w) {
  'use strict';

  if (w.__ESTUDIANTE_DEVOLUCION_RUNTIME__) return;
  w.__ESTUDIANTE_DEVOLUCION_RUNTIME__ = true;

  var intentos = 0;

  function texto(valor) {
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function clave(valor) {
    return texto(valor).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function campo(objeto, nombres) {
    var data = objeto && typeof objeto === 'object' ? objeto : {};
    var mapa = {};
    var i;
    var real;
    Object.keys(data).forEach(function (nombre) { mapa[clave(nombre)] = nombre; });
    for (i = 0; i < nombres.length; i += 1) {
      real = mapa[clave(nombres[i])];
      if (real !== undefined && data[real] !== undefined && data[real] !== null) {
        return data[real];
      }
    }
    return undefined;
  }

  function si(valor) {
    return valor === true || ['SI', 'SÍ', 'TRUE', '1', 'YES']
      .indexOf(texto(valor).toUpperCase()) >= 0;
  }

  function cedula(valor) {
    var salida = texto(valor).replace(/\D/g, '');
    if (salida.length === 9) salida = '0' + salida;
    return salida.length === 10 ? salida : '';
  }

  function decodificar(valor) {
    var salida = valor;
    var i;
    for (i = 0; i < 5 && typeof salida === 'string'; i += 1) {
      if (!texto(salida)) return {};
      try { salida = JSON.parse(salida); }
      catch (_error) { break; }
    }
    return salida;
  }

  function normalizar(valor) {
    var salida = decodificar(valor);
    if (!salida || typeof salida !== 'object') return salida;
    ['respuesta', 'data', 'resultado', 'result'].forEach(function (nombre) {
      if (typeof salida[nombre] === 'string') salida[nombre] = decodificar(salida[nombre]);
    });
    return salida;
  }

  function raices(valor) {
    var lista = [];
    var inicial = normalizar(valor);
    var indice = 0;

    function agregar(nodo) {
      nodo = normalizar(nodo);
      if (nodo && typeof nodo === 'object' && lista.indexOf(nodo) < 0) lista.push(nodo);
    }

    agregar(inicial);
    while (indice < lista.length && indice < 12) {
      ['respuesta', 'data', 'resultado', 'result'].forEach(function (nombre) {
        agregar(lista[indice] && lista[indice][nombre]);
      });
      indice += 1;
    }
    return lista;
  }

  function pareceEstudiante(valor) {
    return Boolean(valor && typeof valor === 'object' && campo(valor, [
      'Nombres', 'nombres', 'nombreCompleto', 'NombreCarrera', 'nombreCarrera', 'carrera'
    ]) !== undefined);
  }

  function extraerEstudiante(valor) {
    var lista = raices(valor);
    var i;
    var candidatos;
    var j;
    for (i = 0; i < lista.length; i += 1) {
      candidatos = [lista[i].estudiante, lista[i].registro, lista[i].student];
      for (j = 0; j < candidatos.length; j += 1) {
        if (pareceEstudiante(candidatos[j])) return candidatos[j];
      }
      if (pareceEstudiante(lista[i])) return lista[i];
    }
    return null;
  }

  function pareceEnvio(valor) {
    return Boolean(valor && typeof valor === 'object' && campo(valor, [
      'titulo1', 'titulo2', 'titulo3', 'propuestas', 'propuestasEnviadas',
      'tituloElegido', 'tituloCorregido', 'idRegistro', 'envioId', 'preferido'
    ]) !== undefined);
  }

  function extraerEnvio(valor) {
    var lista = raices(valor);
    var i;
    var candidatos;
    var j;
    for (i = 0; i < lista.length; i += 1) {
      candidatos = [
        lista[i].envio,
        lista[i].registroEnvio,
        lista[i].envioActual,
        lista[i].registroTitulos,
        lista[i].registro
      ];
      for (j = 0; j < candidatos.length; j += 1) {
        if (pareceEnvio(candidatos[j])) return candidatos[j];
      }
      if (pareceEnvio(lista[i])) return lista[i];
    }
    return null;
  }

  function pareceResolucion(valor) {
    return Boolean(valor && typeof valor === 'object' && campo(valor, [
      'estadoFinal', 'observacion', 'comentarioCoordinador', 'coordinador',
      'tituloElegido', 'tituloCorregido', 'fechaResolucion'
    ]) !== undefined);
  }

  function extraerResolucion(valor) {
    var lista = raices(valor);
    var i;
    var candidatos;
    var j;
    for (i = 0; i < lista.length; i += 1) {
      candidatos = [
        lista[i].ultimaResolucion,
        lista[i].resolucion,
        lista[i].resolucionActual,
        lista[i].ultimaRevision,
        lista[i].revision
      ];
      for (j = 0; j < candidatos.length; j += 1) {
        if (pareceResolucion(candidatos[j])) return candidatos[j];
      }
      if (pareceResolucion(lista[i]) && !pareceEnvio(lista[i])) return lista[i];
    }
    return null;
  }

  function copiarNoVacio(destino, origen) {
    if (!origen || typeof origen !== 'object') return destino;
    Object.keys(origen).forEach(function (nombre) {
      var valor = origen[nombre];
      if (valor !== undefined && valor !== null && texto(valor) !== '') destino[nombre] = valor;
    });
    return destino;
  }

  function copiarCamposResolucion(destino, valor) {
    var lista = raices(valor);
    var nombres = [
      'estado', 'estadoFinal', 'estadoEnvio', 'estadoProceso',
      'observacion', 'observaciones', 'comentario', 'comentarioCoordinador', 'motivo',
      'coordinador', 'tituloElegido', 'tituloCorregido', 'tituloAprobado',
      'fechaResolucion', 'fechaRevision', 'permiteReenvio', 'permitirReenvio'
    ];
    lista.forEach(function (nodo) {
      nombres.forEach(function (nombre) {
        var valorCampo = campo(nodo, [nombre]);
        if (valorCampo !== undefined && valorCampo !== null && texto(valorCampo) !== '') {
          destino[nombre] = valorCampo;
        }
      });
    });
    return destino;
  }

  function apiBase() {
    var forzada = texto(w.TITULOS_API_BASE || '');
    var host = texto(w.location && w.location.hostname).toLowerCase();
    var origen = texto(w.location && w.location.origin);
    if (forzada) return forzada.replace(/\/$/, '');
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].indexOf(host) >= 0) {
      return 'http://127.0.0.1:8788';
    }
    return origen && origen !== 'null' ? origen.replace(/\/$/, '') : 'https://titulos.pages.dev';
  }

  function post(ruta, accion, datos) {
    return fetch(apiBase() + ruta, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Titulos-App': 'estudiantes'
      },
      body: JSON.stringify({ accion: accion, metodo: 'GET', datos: datos || {} })
    }).then(function (respuesta) {
      return respuesta.text().then(function (cuerpo) {
        var salida = normalizar(cuerpo || '{}');
        if (!salida || typeof salida !== 'object') {
          throw new Error('La consulta respondió en un formato no válido.');
        }
        if (!respuesta.ok || salida.ok === false) {
          throw new Error(salida.mensaje || salida.message || salida.error || 'No se pudo consultar la información.');
        }
        return salida;
      });
    });
  }

  function consultarAcceso(id) {
    return post('/api/acceso-estudiante', 'CONSULTAR_ACCESO_ESTUDIANTE', {
      cedula: id,
      numeroIdentificacion: id
    });
  }

  function consultarTitulos(id, estudiante) {
    var periodoId = texto(campo(estudiante || {}, ['periodoId', 'periodId', 'periodoCanonicoId']));
    var periodoLabel = texto(campo(estudiante || {}, ['periodoLabel', 'periodo', 'periodoCanonicoLabel']));
    return post('/api/titulos', 'CONSULTAR_ENVIO_CEDULA', {
      cedula: id,
      numeroIdentificacion: id,
      periodo: periodoLabel || periodoId,
      periodoLabel: periodoLabel,
      periodoId: periodoId
    });
  }

  function combinar(base, directo, id) {
    base = normalizar(base) || {};
    directo = normalizar(directo) || {};

    var estudiante = extraerEstudiante(base) || extraerEstudiante(directo);
    var envioBase = extraerEnvio(base) || {};
    var envioDirecto = extraerEnvio(directo) || {};
    var resolucion = extraerResolucion(directo) || extraerResolucion(base) || {};
    var envio = {};
    var estado;
    var encontradoEnvio;
    var permite;
    var salida;

    copiarNoVacio(envio, envioBase);
    copiarNoVacio(envio, envioDirecto);
    copiarNoVacio(envio, resolucion);
    copiarCamposResolucion(envio, base);
    copiarCamposResolucion(envio, directo);

    estado = texto(campo(envio, [
      'estadoFinal', 'estadoEnvio', 'estado', 'estadoProceso', 'estadoGoogleSheets'
    ])).toUpperCase();
    if (estado) {
      envio.estado = estado;
      envio.estadoFinal = estado;
    }

    encontradoEnvio = pareceEnvio(envio);
    permite = estado === 'DEVUELTO';
    salida = Object.assign({}, base, {
      ok: true,
      encontrado: Boolean(estudiante) || base.encontrado === true || base.existe === true || si(base.encontrado) || si(base.existe),
      existe: Boolean(estudiante) || base.existe === true || si(base.existe),
      cedula: id,
      estudiante: estudiante,
      registro: estudiante,
      tieneEnvio: encontradoEnvio && !permite,
      encontradoEnvio: encontradoEnvio,
      permiteReenvio: permite,
      envio: encontradoEnvio ? envio : null,
      resolucion: resolucion,
      ultimaResolucion: resolucion,
      estadoEnvio: estado,
      consultaEnvioCompleta: true
    });

    if (permite) salida.mensaje = 'El registro fue devuelto y puede corregirse.';
    return salida;
  }

  function instalar() {
    var servicio = w.EstudianteMVPSheets;
    var original;
    var reemplazo;

    if (!servicio || typeof servicio.consultarAccesoEstudiante !== 'function') {
      intentos += 1;
      if (intentos < 150) w.setTimeout(instalar, 100);
      return;
    }
    if (w.__ESTUDIANTE_DEVOLUCION_RUNTIME_INSTALADO__) return;

    original = servicio.consultarAccesoEstudiante.bind(servicio);
    reemplazo = {};
    Object.keys(servicio).forEach(function (nombre) { reemplazo[nombre] = servicio[nombre]; });

    reemplazo.consultarAccesoEstudiante = function (identificacion) {
      var id = cedula(identificacion);
      var basePromise;
      if (!id) return Promise.reject(new Error('La cédula debe tener 10 números.'));

      basePromise = consultarAcceso(id).catch(function () {
        return original(id).then(function (resultado) { return normalizar(resultado); });
      });

      return basePromise.then(function (base) {
        var estudiante = extraerEstudiante(base);
        if (!estudiante) {
          return original(id).then(function (alterno) {
            alterno = normalizar(alterno);
            estudiante = extraerEstudiante(alterno);
            return consultarTitulos(id, estudiante)
              .then(function (directo) { return combinar(alterno, directo, id); })
              .catch(function () { return combinar(alterno, null, id); });
          });
        }

        return consultarTitulos(id, estudiante)
          .then(function (directo) { return combinar(base, directo, id); })
          .catch(function () { return combinar(base, null, id); });
      });
    };

    w.EstudianteMVPSheets = reemplazo;
    w.__ESTUDIANTE_DEVOLUCION_RUNTIME_INSTALADO__ = true;
  }

  instalar();
})(window);
