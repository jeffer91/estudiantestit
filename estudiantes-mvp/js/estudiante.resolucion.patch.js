/* Completa la consulta del estudiante con Envios + última Resolución de Google Sheets. */
(function (w) {
  'use strict';

  var intentos = 0;

  function texto(valor) {
    return String(valor === null || valor === undefined ? '' : valor)
      .replace(/\s+/g, ' ')
      .trim();
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

  function apiBase() {
    var forzada = texto(w.TITULOS_API_BASE || '');
    var host = texto(w.location && w.location.hostname).toLowerCase();
    var protocolo = texto(w.location && w.location.protocol).toLowerCase();
    var origen = texto(w.location && w.location.origin);
    if (forzada) return forzada.replace(/\/$/, '');
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].indexOf(host) >= 0) {
      return 'http://127.0.0.1:8788';
    }
    if (protocolo === 'file:') return 'https://titulos.pages.dev';
    return origen && origen !== 'null' ? origen.replace(/\/$/, '') : 'https://titulos.pages.dev';
  }

  function peticion(cedula, periodo) {
    return fetch(apiBase() + '/api/titulos', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Titulos-App': 'estudiantes'
      },
      body: JSON.stringify({
        accion: 'CONSULTAR_ENVIO_CEDULA',
        metodo: 'GET',
        datos: {
          cedula: cedula,
          numeroIdentificacion: cedula,
          periodo: texto(periodo),
          periodoLabel: texto(periodo),
          periodoId: texto(periodo)
        }
      })
    }).then(function (respuesta) {
      return respuesta.text().then(function (cuerpo) {
        var json = {};
        try { json = cuerpo ? JSON.parse(cuerpo) : {}; }
        catch (_error) { throw new Error('La consulta de resoluciones respondió en un formato no válido.'); }
        if (!respuesta.ok || json.ok === false) {
          throw new Error(json.mensaje || json.message || json.error || 'No se pudo consultar la resolución.');
        }
        return json;
      });
    });
  }

  function objetosRaiz(resultado) {
    var lista = [];
    function agregar(valor) {
      if (valor && typeof valor === 'object' && lista.indexOf(valor) < 0) lista.push(valor);
    }
    agregar(resultado);
    agregar(resultado && resultado.data);
    agregar(resultado && resultado.respuesta);
    agregar(resultado && resultado.resultado);
    agregar(resultado && resultado.result);
    agregar(resultado && resultado.data && resultado.data.resultado);
    agregar(resultado && resultado.respuesta && resultado.respuesta.resultado);
    return lista;
  }

  function pareceEnvio(valor) {
    return Boolean(valor && typeof valor === 'object' && campo(valor, [
      'titulo1', 'titulo2', 'titulo3', 'propuestas', 'propuestasEnviadas',
      'idRegistro', 'envioId', 'tituloId', 'telegram', 'preferido'
    ]) !== undefined);
  }

  function extraerEnvio(resultado) {
    var raices = objetosRaiz(resultado);
    var i;
    var candidatos;
    var j;
    for (i = 0; i < raices.length; i += 1) {
      candidatos = [
        raices[i].envio,
        raices[i].registroEnvio,
        raices[i].envioActual,
        raices[i].registro
      ];
      for (j = 0; j < candidatos.length; j += 1) {
        if (pareceEnvio(candidatos[j])) return candidatos[j];
      }
      if (pareceEnvio(raices[i])) return raices[i];
    }
    return null;
  }

  function pareceResolucion(valor) {
    return Boolean(valor && typeof valor === 'object' && campo(valor, [
      'estadoFinal', 'tituloElegido', 'tituloCorregido', 'observacion',
      'comentarioCoordinador', 'coordinador', 'fechaResolucion'
    ]) !== undefined);
  }

  function extraerResolucion(resultado) {
    var raices = objetosRaiz(resultado);
    var i;
    var candidatos;
    var j;
    for (i = 0; i < raices.length; i += 1) {
      candidatos = [
        raices[i].ultimaResolucion,
        raices[i].resolucion,
        raices[i].resolucionActual,
        raices[i].revision,
        raices[i].ultimaRevision
      ];
      for (j = 0; j < candidatos.length; j += 1) {
        if (pareceResolucion(candidatos[j])) return candidatos[j];
      }
      if (pareceResolucion(raices[i])) return raices[i];
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

  function estadoDe(objeto, resultado) {
    return texto(
      campo(objeto || {}, ['estadoFinal', 'estado', 'estadoEnvio', 'estadoProceso', 'estadoGoogleSheets']) ||
      campo(resultado || {}, ['estadoFinal', 'estado', 'estadoEnvio'])
    ).toUpperCase();
  }

  function tieneDetalleDevolucion(envio) {
    return Boolean(
      texto(campo(envio || {}, ['observacion', 'comentarioCoordinador', 'comentario', 'motivo'])) &&
      (texto(campo(envio || {}, ['titulo1'])) || texto(campo(envio || {}, ['titulo2'])) ||
       texto(campo(envio || {}, ['titulo3'])) || campo(envio || {}, ['propuestas', 'propuestasEnviadas']))
    );
  }

  function completar(base, directo) {
    var envioAnterior = base && base.envio && typeof base.envio === 'object' ? base.envio : {};
    var envioDirecto = extraerEnvio(directo) || {};
    var resolucion = extraerResolucion(directo) || {};
    var combinado = {};
    var estado;
    var existe;

    copiarNoVacio(combinado, envioAnterior);
    copiarNoVacio(combinado, envioDirecto);
    copiarNoVacio(combinado, resolucion);

    estado = estadoDe(combinado, directo) || texto(base && base.estadoEnvio).toUpperCase();
    if (estado) {
      combinado.estado = estado;
      combinado.estadoFinal = estado;
    }

    existe = Boolean(
      pareceEnvio(combinado) ||
      si(campo(directo || {}, ['existe', 'encontrado', 'tieneEnvio', 'encontradoEnvio'])) ||
      (base && (base.encontradoEnvio || base.tieneEnvio))
    );

    return Object.assign({}, base || {}, {
      envio: combinado,
      resolucion: resolucion,
      ultimaResolucion: resolucion,
      estadoEnvio: estado,
      encontradoEnvio: existe,
      permiteReenvio: estado === 'DEVUELTO',
      tieneEnvio: existe && estado !== 'DEVUELTO'
    });
  }

  function instalar() {
    var sheets = w.EstudianteMVPSheets;
    var original;
    if (!sheets || typeof sheets.consultarAccesoEstudiante !== 'function') {
      intentos += 1;
      if (intentos < 150) w.setTimeout(instalar, 100);
      return;
    }
    if (sheets.__RESOLUCION_DEVUELTA_PATCH__) return;
    sheets.__RESOLUCION_DEVUELTA_PATCH__ = true;
    original = sheets.consultarAccesoEstudiante.bind(sheets);

    sheets.consultarAccesoEstudiante = function (cedula) {
      return original(cedula).then(function (base) {
        var envio = base && base.envio || {};
        var estado = texto(base && base.estadoEnvio || campo(envio, ['estadoFinal', 'estado'])).toUpperCase();
        var periodo = base && (base.periodoLabel || base.periodoId) || '';

        if (estado && estado !== 'DEVUELTO') return base;
        if (estado === 'DEVUELTO' && tieneDetalleDevolucion(envio)) {
          return Object.assign({}, base, {
            permiteReenvio: true,
            tieneEnvio: false,
            encontradoEnvio: true
          });
        }

        return peticion(cedula, periodo)
          .then(function (directo) {
            var completado = completar(base, directo);
            if (completado.estadoEnvio || completado.encontradoEnvio) return completado;
            if (!periodo) return completado;
            return peticion(cedula, '').then(function (sinPeriodo) {
              return completar(completado, sinPeriodo);
            });
          })
          .catch(function () { return base; });
      });
    };
  }

  instalar();
})(window);
