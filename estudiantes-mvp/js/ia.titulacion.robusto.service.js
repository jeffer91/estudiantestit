/* Flujo IA: 3 títulos, corrección cruzada y elección del estudiante. */
(function (window) {
  'use strict';

  window.__ESTUDIANTE_IA_SELECCION_INSTALADA__ = true;

  var instalado = false;
  var intentos = 0;

  function limpiar(v) {
    return String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  }

  function normalizar(v) {
    return limpiar(v).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function contar(v) {
    var t = limpiar(v).replace(/[.,;:¿?¡!()[\]{}“”"']/g, ' ');
    return t ? t.split(/\s+/).filter(Boolean).length : 0;
  }

  function instalar() {
    var original = window.EstudianteMVPIATitulacion;

    if (instalado) return;
    if (!original) {
      intentos += 1;
      if (intentos < 100) window.setTimeout(instalar, 25);
      return;
    }

    window.EstudianteMVPIATitulacion = Object.freeze(Object.assign({}, original, {
      generarTitulosPorPropuesta: generar,
      generarTresTitulos: generar,
      convertirTextoEnSugerencias: convertir,
      __correccionCruzada: true
    }));
    instalado = true;
  }

  function generar(params) {
    var firebase = window.EstudianteMVPFirebaseIA;
    var promptService = window.EstudianteMVPIAPrompt;
    var providers = window.EstudianteMVPIAProviders;
    var error = validar(params, firebase, promptService, providers);
    var prompt;

    if (error) return Promise.reject(new Error(error));

    prompt = fortalecer(promptService.construirPromptTitulos(params));

    return firebase.listarProveedoresActivos().then(function (lista) {
      if (!Array.isArray(lista) || !lista.length) {
        throw new Error('No hay proveedores IA activos.');
      }

      return intentar({
        lista: lista.slice(),
        params: params,
        prompt: prompt,
        pendientes: null,
        mejorPendiente: null,
        errores: [],
        providers: providers
      });
    });
  }

  function intentar(ctx) {
    var proveedor;
    var promptActual;

    if (!ctx.lista.length) {
      /* No se inventan títulos localmente. Se conservan 3 resultados de IA
         solo cuando no tienen fallos críticos. */
      if (ctx.mejorPendiente && !ctx.mejorPendiente.criticos.length) {
        return resultado(
          ctx.mejorPendiente.proveedor,
          ctx.mejorPendiente.sugerencias,
          'Se conservaron 3 títulos generados por IA. Revisa la recomendada y elige una.'
        );
      }
      throw errorFinal(ctx.errores);
    }

    proveedor = ctx.lista.shift();
    promptActual = ctx.pendientes ? promptCorreccion(ctx) : ctx.prompt;

    return ctx.providers.generarTexto(proveedor, promptActual, {
      timeoutMs: ctx.params.timeoutMs,
      temperatura: ctx.pendientes ? 0.2 : ctx.params.temperatura,
      maxTokens: Math.max(Number(ctx.params.maxTokens || 0), 1100)
    }).then(function (respuesta) {
      var titulos = convertir(respuesta);
      var revision;

      if (titulos.length !== 3) {
        ctx.errores.push({
          proveedor: id(proveedor),
          mensaje: 'No devolvió exactamente 3 títulos.'
        });
        /* Si ya había 3 pendientes, la siguiente IA corrige los mismos. */
        return intentar(ctx);
      }

      revision = revisar(titulos, ctx.params);
      if (revision.ok) {
        return resultado(
          proveedor,
          revision.sugerencias,
          ctx.pendientes
            ? 'Otra IA corrigió los 3 títulos. Revisa la recomendada y elige una.'
            : 'Se generaron 3 títulos. Revisa la recomendada y elige una.'
        );
      }

      ctx.errores.push({
        proveedor: id(proveedor),
        mensaje: revision.motivos.join(' ')
      });
      ctx.pendientes = {
        sugerencias: revision.sugerencias,
        motivos: revision.motivos,
        proveedor: id(proveedor)
      };

      if (!ctx.mejorPendiente || revision.total > ctx.mejorPendiente.total) {
        ctx.mejorPendiente = {
          proveedor: proveedor,
          sugerencias: revision.sugerencias,
          motivos: revision.motivos,
          criticos: revision.criticos,
          total: revision.total
        };
      }

      return intentar(ctx);
    }, function (errorProveedor) {
      ctx.errores.push({
        proveedor: id(proveedor),
        mensaje: mensajeSeguro(errorProveedor)
      });
      /* Un fallo de conexión no elimina los 3 títulos pendientes. */
      return intentar(ctx);
    });
  }

  function promptCorreccion(ctx) {
    var lista = ctx.pendientes.sugerencias.map(function (item, index) {
      return (index + 1) + '. ' + item.titulo;
    }).join('\n');

    return [
      'Actúa como revisor académico final.',
      'Otra IA generó exactamente 3 títulos, pero necesitan corrección.',
      'Corrige esos mismos 3 títulos sin cambiar tema, grupo, lugar, período ni problema.',
      'No inventes datos, instituciones, poblaciones, resultados ni fechas.',
      '',
      'Motivos detectados:',
      ctx.pendientes.motivos.join('\n'),
      '',
      'Títulos recibidos:',
      lista,
      '',
      'Contexto original:',
      ctx.prompt,
      '',
      'Devuelve únicamente JSON válido con exactamente esta estructura:',
      '{"sugerencias":[',
      '{"numero":1,"titulo":"Título corregido 1","justificacion":"Motivo breve"},',
      '{"numero":2,"titulo":"Título corregido 2","justificacion":"Motivo breve"},',
      '{"numero":3,"titulo":"Título corregido 3","justificacion":"Motivo breve"}',
      ']}',
      'Cada título debe tener idealmente entre 20 y 30 palabras.'
    ].join('\n');
  }

  function fortalecer(prompt) {
    return [
      prompt,
      '',
      'CONTROL FINAL:',
      '- Entrega exactamente 3 títulos distintos.',
      '- Usa únicamente los datos del estudiante.',
      '- No inventes información faltante.',
      '- Cada título debe tener idealmente entre 20 y 30 palabras.',
      '- Responde solamente JSON válido con la propiedad sugerencias.'
    ].join('\n');
  }

  function convertir(respuesta) {
    var json = extraerJson(respuesta);
    var lista = buscarLista(json);
    var usadas = {};
    var salida = [];

    if (!lista.length) lista = textoPlano(respuesta);

    lista.forEach(function (item) {
      var titulo;
      var key;

      item = typeof item === 'string' ? { titulo: item } : item || {};
      titulo = limpiar(
        item.titulo || item.título || item.title || item.tituloFinal ||
        item.texto || item.text || item.propuesta || ''
      ).replace(/^[“”"']+|[“”"']+$/g, '');
      key = normalizar(titulo);

      if (!titulo || titulo.length < 20 || usadas[key] || salida.length >= 3) return;
      usadas[key] = true;
      salida.push({
        numero: salida.length + 1,
        titulo: titulo,
        justificacion: limpiar(
          item.justificacion || item.razon || item.explicacion || item.motivo || ''
        )
      });
    });

    return salida;
  }

  function extraerJson(respuesta) {
    var t = String(respuesta || '').replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    var inicio;
    var fin;

    try { return JSON.parse(t); } catch (e1) {}

    inicio = t.indexOf('{');
    fin = t.lastIndexOf('}');
    if (inicio >= 0 && fin > inicio) {
      try { return JSON.parse(t.slice(inicio, fin + 1)); } catch (e2) {}
    }

    inicio = t.indexOf('[');
    fin = t.lastIndexOf(']');
    if (inicio >= 0 && fin > inicio) {
      try { return JSON.parse(t.slice(inicio, fin + 1)); } catch (e3) {}
    }
    return null;
  }

  function buscarLista(obj) {
    var claves = ['sugerencias', 'titulos', 'títulos', 'titles', 'opciones', 'propuestas', 'alternativas'];
    var encontrada = [];

    if (Array.isArray(obj)) return obj;
    if (!obj || typeof obj !== 'object') return [];

    claves.some(function (k) {
      if (Array.isArray(obj[k])) {
        encontrada = obj[k];
        return true;
      }
      return false;
    });
    if (encontrada.length) return encontrada;

    Object.keys(obj).some(function (k) {
      if (obj[k] && typeof obj[k] === 'object') {
        encontrada = buscarLista(obj[k]);
        return encontrada.length > 0;
      }
      return false;
    });
    return encontrada;
  }

  function textoPlano(respuesta) {
    var salida = [];
    String(respuesta || '').split(/\n+/).forEach(function (linea) {
      var t = limpiar(linea).replace(/^[-*•]\s*/, '')
        .replace(/^\d+\s*[).:-]\s*/, '')
        .replace(/^t[ií]tulo\s*\d*\s*[:.-]\s*/i, '');
      if (t.length >= 25 && salida.length < 3) salida.push({ titulo: t });
    });
    return salida;
  }

  function revisar(sugerencias, params) {
    var motivos = [];
    var criticos = [];
    var total = 0;
    var evaluadas = sugerencias.map(function (item, index) {
      var ev = evaluarTitulo(item.titulo, params);
      total += ev.puntaje;
      ev.motivos.forEach(function (m) {
        motivos.push('Título ' + (index + 1) + ': ' + m);
      });
      ev.criticos.forEach(function (c) { criticos.push(c); });
      return Object.assign({}, item, { puntaje: ev.puntaje });
    });

    evaluadas = recomendar(evaluadas);
    return {
      ok: motivos.length === 0 && criticos.length === 0,
      motivos: motivos,
      criticos: criticos,
      sugerencias: evaluadas,
      total: total
    };
  }

  function evaluarTitulo(titulo, params) {
    var ctx = contexto(params);
    var n = contar(titulo);
    var relevancia = 0;
    var motivos = [];
    var criticos = [];
    var puntos = 0;

    relevancia += coincidencia(titulo, ctx.propuesta.temaGeneral, 20);
    relevancia += coincidencia(titulo, ctx.propuesta.problemaNecesidad, 18);
    relevancia += coincidencia(titulo, ctx.propuesta.objetivo, 15);
    relevancia += coincidencia(titulo, ctx.propuesta.lugarContexto, 10);
    relevancia += coincidencia(titulo, ctx.propuesta.grupoEstudio, 8);
    relevancia += coincidencia(titulo, ctx.propuesta.anioPeriodo, 6);
    relevancia += coincidencia(titulo, ctx.estudiante.carrera, 12);
    puntos += relevancia;

    if (n >= 20 && n <= 30) puntos += 18;
    else if (n >= 15 && n <= 34) motivos.push('ajusta la extensión a 20-30 palabras.');
    else {
      motivos.push('la extensión es inadecuada.');
      criticos.push('LONGITUD');
    }

    if (relevancia < 8) {
      motivos.push('falta relación clara con los datos ingresados.');
      criticos.push('RELEVANCIA');
    }

    if (/no especificado|titulo academico completo|primera alternativa|segunda alternativa|tercera alternativa/.test(normalizar(titulo))) {
      motivos.push('contiene texto genérico o datos no especificados.');
      criticos.push('GENERICO');
    }

    return { puntaje: puntos, motivos: motivos, criticos: criticos };
  }

  function contexto(params) {
    var prompt = window.EstudianteMVPIAPrompt;
    if (prompt && typeof prompt.normalizarContexto === 'function') {
      return prompt.normalizarContexto(params || {});
    }
    return { estudiante: params.estudiante || {}, propuesta: params.propuesta || {} };
  }

  function coincidencia(titulo, dato, maximo) {
    var ignorar = { para:1, como:1, con:1, del:1, las:1, los:1, una:1, por:1, que:1, sin:1, durante:1, mediante:1, especificado:1 };
    var t = normalizar(titulo);
    var terminos = normalizar(dato).split(' ').filter(function (p) {
      return p.length >= 4 && !ignorar[p];
    });
    var encontrados = 0;

    terminos.forEach(function (p) {
      if (t.indexOf(p) >= 0) encontrados += 1;
    });
    if (!terminos.length) return 0;
    return Math.min(maximo, encontrados / Math.min(terminos.length, 5) * maximo);
  }

  function recomendar(lista) {
    var mejor = 0;
    lista.forEach(function (item, index) {
      if (item.puntaje > lista[mejor].puntaje) mejor = index;
    });
    return lista.map(function (item, index) {
      return Object.assign({}, item, {
        numero: index + 1,
        recomendada: index === mejor,
        recomendado: index === mejor,
        justificacion: item.justificacion || (index === mejor
          ? 'Recomendada por su mayor relación con los datos ingresados.'
          : 'Alternativa válida para la misma propuesta.')
      });
    });
  }

  function resultado(proveedor, sugerencias, mensaje) {
    var mejor = sugerencias.find(function (s) { return s.recomendada; }) || sugerencias[0];
    return {
      ok: true,
      proveedor: id(proveedor),
      proveedorNombre: limpiar(proveedor && (proveedor.nombre || proveedor.name) || id(proveedor)),
      sugerencias: sugerencias,
      recomendado: mejor.numero,
      mejorSugerencia: mejor,
      mensaje: mensaje
    };
  }

  function validar(params, firebase, prompt, providers) {
    var e = params.estudiante || {};
    var p = params.propuesta || {};
    if (!firebase || !prompt || !providers) return 'Faltan módulos internos de IA.';
    if (!e.cedula && !e.numeroIdentificacion) return 'Primero consulta al estudiante.';
    if (!e.nombreCarrera && !e.carrera) return 'El estudiante no tiene carrera registrada.';
    if (!limpiar(p.temaGeneral || p.tema)) return 'Completa el tema general.';
    if (!limpiar(p.problemaNecesidad || p.problema || p.necesidad)) return 'Completa el problema o necesidad.';
    return '';
  }

  function id(p) {
    return limpiar(p && (p.id || p.proveedor || p.provider) || 'IA');
  }

  function mensajeSeguro(error) {
    return limpiar(error && error.message || error || 'Error de proveedor IA.').slice(0, 300);
  }

  function errorFinal(errores) {
    var mensaje = 'No fue posible obtener 3 títulos corregidos con los proveedores IA activos.';
    if (errores.length) {
      mensaje += ' Detalle: ' + errores.map(function (e) {
        return e.proveedor + ': ' + e.mensaje;
      }).join(' | ');
    }
    return new Error(mensaje);
  }

  instalar();
})(window);
