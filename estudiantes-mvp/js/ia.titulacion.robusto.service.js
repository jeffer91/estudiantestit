/*
  Orquestador robusto de IA de Titulación.
  - Usa todos los motores internos disponibles sin revelar sus nombres.
  - Con dos o más motores, uno genera y otro revisa.
  - Acumula una opción válida por enfoque: diagnóstico, propuesta y evaluación.
  - Nunca completa espacios con justificaciones ni con opciones repetidas.
*/
(function (window, document) {
  'use strict';

  var MAX_PROCESOS = 3;
  var instalado = false;
  var intentosInstalacion = 0;
  var NOMBRES_ENFOQUE = {
    1: 'diagnóstico de la situación inicial',
    2: 'propuesta o mejora',
    3: 'evaluación o resultado esperado'
  };

  function instalar() {
    var original = window.EstudianteMVPIATitulacion;

    if (instalado) return;
    if (!original || !window.EstudianteMVPIANueveCore) {
      intentosInstalacion += 1;
      if (intentosInstalacion < 240) window.setTimeout(instalar, 25);
      return;
    }

    window.EstudianteMVPIATitulacion = Object.freeze(Object.assign({}, original, {
      generarOpcionesParaPropuesta: generarOpcionesParaPropuesta,
      generarNueveTitulos: generarOpcionesParaPropuesta,
      generarTitulos3x3: generarOpcionesParaPropuesta,
      __flujoNueveTitulos: true,
      modo: 'motores-internos-combinados',
      version: '5.2.0'
    }));

    instalado = true;
  }

  function generarOpcionesParaPropuesta(params) {
    var config = window.EstudianteMVPFirebaseIA;
    var providers = window.EstudianteMVPIAProviders;
    var core = window.EstudianteMVPIANueveCore;
    var error = validarParametros(params, config, providers, core);
    var maxProcesos;

    if (error) return Promise.reject(new Error(error));

    maxProcesos = Math.max(1, Math.min(
      MAX_PROCESOS,
      Number(params.maxProcesos || MAX_PROCESOS)
    ));

    return config.listarProveedoresActivos().then(function (motores) {
      motores = Array.isArray(motores) ? motores.slice() : [];
      motores.sort(function (a, b) {
        return Number(a.prioridad || 999) - Number(b.prioridad || 999);
      });

      if (!motores.length) {
        throw new Error('La IA de Titulación no está disponible en este momento.');
      }

      return ejecutarProceso({
        params: params,
        paramsCore: construirParametrosCore(params),
        motores: motores,
        proceso: 1,
        maxProcesos: maxProcesos,
        acumulado: {},
        errores: [],
        providers: providers,
        core: core,
        ultimoReporte: null,
        totalTitulosInternos: 0,
        revisadoInternamente: false
      });
    });
  }

  function ejecutarProceso(ctx) {
    var generador;
    var revisor;
    var prompt;

    if (ctx.proceso > ctx.maxProcesos) {
      return finalizarConAcumulado(ctx);
    }

    generador = ctx.motores[(ctx.proceso - 1) % ctx.motores.length];
    revisor = ctx.motores.length > 1
      ? ctx.motores[ctx.proceso % ctx.motores.length]
      : generador;
    prompt = construirPromptGeneracion(ctx);

    notificar(ctx.params, {
      proceso: ctx.proceso,
      maxProcesos: ctx.maxProcesos,
      etapa: 'generacion',
      mensaje: mensajeFaltantes(ctx, 'Generando alternativas')
    });

    return llamarMotor(ctx.providers, generador, prompt, false, ctx.params).then(
      function (respuesta) {
        var reporte = analizarRespuesta(ctx, respuesta);
        var cantidadAntes = cantidadAcumulada(ctx);

        if (!reporte) {
          registrarError(ctx, 'La respuesta no contenía títulos completos y utilizables.');
          return siguienteProceso(ctx);
        }

        combinarReporte(ctx, reporte);

        notificar(ctx.params, {
          proceso: ctx.proceso,
          maxProcesos: ctx.maxProcesos,
          etapa: 'validacion',
          mensaje: 'Revisando redacción, extensión y enfoque académico.'
        });

        /* Con más de un motor siempre se usa el segundo como revisor. */
        if (ctx.motores.length > 1) {
          return revisarConMotor(ctx, revisor, reporte);
        }

        if (cantidadAcumulada(ctx) === 3) {
          return construirResultado(ctx, 'Se prepararon tres opciones completas y diferentes.');
        }

        if (cantidadAcumulada(ctx) === cantidadAntes) {
          registrarError(ctx, resumirReporte(reporte));
        }
        return revisarConMotor(ctx, revisor, reporte);
      },
      function (errorMotor) {
        registrarError(ctx, limpiarError(errorMotor));
        return siguienteProceso(ctx);
      }
    );
  }

  function revisarConMotor(ctx, revisor, reporteBase) {
    var promptRevision = construirPromptRevision(ctx, reporteBase);

    notificar(ctx.params, {
      proceso: ctx.proceso,
      maxProcesos: ctx.maxProcesos,
      etapa: 'correccion',
      mensaje: mensajeFaltantes(ctx, 'Revisando y completando')
    });

    return llamarMotor(ctx.providers, revisor, promptRevision, true, ctx.params).then(
      function (respuesta) {
        var reporte = analizarRespuesta(ctx, respuesta);

        ctx.revisadoInternamente = true;
        if (reporte) combinarReporte(ctx, reporte);
        else registrarError(ctx, 'La revisión no devolvió títulos completos y utilizables.');

        notificar(ctx.params, {
          proceso: ctx.proceso,
          maxProcesos: ctx.maxProcesos,
          etapa: 'comparacion',
          mensaje: 'Comparando los resultados y conservando una opción por enfoque.'
        });

        if (cantidadAcumulada(ctx) === 3) {
          return construirResultado(ctx, 'Las tres opciones fueron revisadas y quedaron listas para elegir.');
        }

        if (reporte) registrarError(ctx, resumirReporte(reporte));
        return siguienteProceso(ctx);
      },
      function (errorMotor) {
        registrarError(ctx, limpiarError(errorMotor));

        if (cantidadAcumulada(ctx) === 3) {
          return construirResultado(ctx, 'Se conservaron tres opciones completas y diferentes.');
        }
        return siguienteProceso(ctx);
      }
    );
  }

  function analizarRespuesta(ctx, respuesta) {
    var secciones = ctx.core.parsearRespuesta(respuesta);
    var total = ctx.core.contarTitulos(secciones);
    var reporte;

    ctx.totalTitulosInternos += total;
    if (!total) return null;

    reporte = ctx.core.validarYRecomendar(secciones, ctx.paramsCore);
    ctx.ultimoReporte = reporte;
    return reporte;
  }

  function combinarReporte(ctx, reporte) {
    var secciones = reporte && Array.isArray(reporte.secciones) ? reporte.secciones : [];

    secciones.forEach(function (seccion, index) {
      var numero = numeroSeccion(seccion, index + 1, ctx.core);
      var candidato = mejorCandidatoSeccion(seccion, ctx.core);
      var actual;

      if (!candidato || numero < 1 || numero > 3) return;

      actual = ctx.acumulado[numero];
      if (!actual || esCandidatoMejor(candidato, actual)) {
        ctx.acumulado[numero] = crearOpcion(candidato, seccion, numero, ctx.params, ctx.core);
      }
    });
  }

  function mejorCandidatoSeccion(seccion, core) {
    var candidatos = (seccion && Array.isArray(seccion.titulos) ? seccion.titulos : []).filter(function (item) {
      var graves = Array.isArray(item.erroresGraves) ? item.erroresGraves : [];
      return graves.length === 0 && esTituloUtilizable(item.titulo, core);
    });

    candidatos.sort(function (a, b) {
      return Number(b.puntaje || 0) - Number(a.puntaje || 0);
    });

    return candidatos[0] || null;
  }

  function crearOpcion(item, seccion, numero, params, core) {
    var titulo = core && typeof core.limpiarTitulo === 'function'
      ? core.limpiarTitulo(item.titulo)
      : limpiar(item.titulo);
    var tituloBase = obtenerTituloBase(params);

    return {
      numero: numero,
      titulo: titulo,
      justificacion: limpiar(item.justificacion) ||
        'Opción seleccionada por su relación con la propuesta y este enfoque académico.',
      puntaje: Number(item.puntaje || 0),
      etapa: seccion.etapa || codigoEtapa(numero),
      nombreEtapa: seccion.nombreEtapa || nombreEtapa(numero),
      basadaEnTituloEstudiante: numero === 2 && tituloBase
        ? similitud(titulo, tituloBase) >= 0.08
        : false,
      recomendada: false,
      recomendado: false
    };
  }

  function esCandidatoMejor(nuevo, actual) {
    return Number(nuevo.puntaje || 0) > Number(actual.puntaje || 0);
  }

  function siguienteProceso(ctx) {
    ctx.proceso += 1;

    if (ctx.proceso <= ctx.maxProcesos) {
      notificar(ctx.params, {
        proceso: ctx.proceso,
        maxProcesos: ctx.maxProcesos,
        etapa: 'reinicio',
        mensaje: mensajeFaltantes(ctx, 'Iniciando una nueva búsqueda para completar')
      });
    }

    return ejecutarProceso(ctx);
  }

  function finalizarConAcumulado(ctx) {
    var cantidad = cantidadAcumulada(ctx);
    var mensaje;

    if (!cantidad) throw construirErrorFinal(ctx.errores);

    mensaje = cantidad === 1
      ? 'Se obtuvo una opción completa y bien redactada.'
      : cantidad === 2
        ? 'Se conservaron dos opciones completas y de enfoques diferentes.'
        : 'Se conservaron tres opciones completas y de enfoques diferentes.';

    return construirResultado(ctx, mensaje, cantidad < 3);
  }

  function construirResultado(ctx, mensaje, mejorDisponible) {
    var opciones = opcionesAcumuladas(ctx);
    var cantidad = opciones.length;

    marcarRecomendadaUnica(opciones);

    notificar(ctx.params, {
      proceso: Math.min(ctx.proceso, ctx.maxProcesos),
      maxProcesos: ctx.maxProcesos,
      etapa: 'finalizacion',
      mensaje: cantidad === 1
        ? 'Preparando la opción validada.'
        : 'Preparando las ' + cantidad + ' opciones validadas.'
    });

    return {
      ok: true,
      numeroPropuesta: Number(
        ctx.params.numeroPropuesta ||
        ctx.params.propuesta && ctx.params.propuesta.numero ||
        1
      ),
      revisadoInternamente: ctx.revisadoInternamente === true,
      procesoUsado: Math.min(ctx.proceso, ctx.maxProcesos),
      maxProcesos: ctx.maxProcesos,
      totalTitulosInternos: ctx.totalTitulosInternos,
      cantidadOpciones: cantidad,
      opcionesFinales: opciones,
      mejorDisponible: mejorDisponible === true,
      enfoquesCompletos: opciones.map(function (item) { return item.etapa; }),
      mensaje: mensaje
    };
  }

  function opcionesAcumuladas(ctx) {
    return [1, 2, 3].map(function (numero) {
      return ctx.acumulado[numero] || null;
    }).filter(Boolean).map(function (item, index) {
      return Object.assign({}, item, { numero: index + 1 });
    });
  }

  function cantidadAcumulada(ctx) {
    return opcionesAcumuladas(ctx).length;
  }

  function enfoquesFaltantes(ctx) {
    return [1, 2, 3].filter(function (numero) {
      return !ctx.acumulado[numero];
    });
  }

  function mensajeFaltantes(ctx, prefijo) {
    var faltantes = enfoquesFaltantes(ctx);
    if (!faltantes.length) return prefijo + ' las opciones finales.';
    return prefijo + ': ' + faltantes.map(function (numero) {
      return NOMBRES_ENFOQUE[numero];
    }).join(', ') + '.';
  }

  function construirParametrosCore(params) {
    var propuesta = clonar(params.propuesta || {});
    var propuestas = [1, 2, 3].map(function (numero) {
      var copia = clonar(propuesta);
      copia.numero = numero;
      return copia;
    });

    return {
      estudiante: clonar(params.estudiante || {}),
      propuestas: propuestas,
      propuesta: clonar(propuesta),
      numeroPropuesta: Number(params.numeroPropuesta || propuesta.numero || 1)
    };
  }

  function construirPromptGeneracion(ctx) {
    var tituloBase = obtenerTituloBase(ctx.params);
    var faltantes = enfoquesFaltantes(ctx);
    var existentes = opcionesAcumuladas(ctx);

    return ctx.core.construirPrompt(ctx.paramsCore) + [
      '',
      'INSTRUCCIONES OBLIGATORIAS:',
      '- Entrega tres enfoques distintos: diagnóstico, propuesta o mejora, y evaluación o resultado esperado.',
      '- Cada enfoque debe contener títulos académicos completos de 20 a 30 palabras.',
      '- En cada objeto, el campo titulo debe contener únicamente el título. No escribas etiquetas, explicaciones ni justificaciones dentro de titulo.',
      '- No uses encabezados como Justification, Reason, Explanation, Etapa, Stage o Section dentro de los títulos.',
      '- No repitas el mismo enfoque ni el mismo título.',
      '- Responde exclusivamente con JSON válido.',
      '- Enfoques que todavía faltan: ' + (faltantes.length ? faltantes.map(function (n) { return NOMBRES_ENFOQUE[n]; }).join(', ') : 'ninguno'),
      '- Opciones válidas ya conservadas: ' + (existentes.length ? existentes.map(function (o) { return o.nombreEtapa + ': ' + o.titulo; }).join(' | ') : 'ninguna'),
      '- Título escrito por el estudiante: ' + (tituloBase || 'No escribió un título previo.')
    ].join('\n');
  }

  function construirPromptRevision(ctx, reporte) {
    var tituloBase = obtenerTituloBase(ctx.params);
    var faltantes = enfoquesFaltantes(ctx);
    var existentes = opcionesAcumuladas(ctx);

    return ctx.core.construirPromptRevision(
      ctx.paramsCore,
      reporte && reporte.secciones || [],
      reporte || {}
    ) + [
      '',
      'INSTRUCCIONES OBLIGATORIAS DE REVISIÓN:',
      '- Revisa la redacción y completa los enfoques faltantes.',
      '- Devuelve una opción diferente para diagnóstico, una para propuesta o mejora y una para evaluación o resultado.',
      '- No conviertas justificaciones, razones o explicaciones en títulos.',
      '- El campo titulo debe contener únicamente una oración académica completa de 20 a 30 palabras.',
      '- No uses etiquetas como Justification, Reason, Explanation, Etapa, Stage o Section dentro de titulo.',
      '- Responde exclusivamente con JSON válido.',
      '- Enfoques que todavía faltan: ' + (faltantes.length ? faltantes.map(function (n) { return NOMBRES_ENFOQUE[n]; }).join(', ') : 'ninguno; revisa los tres'),
      '- Opciones válidas que deben conservarse: ' + (existentes.length ? existentes.map(function (o) { return o.nombreEtapa + ': ' + o.titulo; }).join(' | ') : 'ninguna'),
      '- Título escrito por el estudiante: ' + (tituloBase || 'No escribió un título previo.')
    ].join('\n');
  }

  function numeroSeccion(seccion, fallback, core) {
    var valor = seccion && (seccion.seccion || seccion.numero || seccion.section || seccion.etapa || seccion.nombreEtapa);
    if (core && typeof core.numeroSeccionSeguro === 'function') {
      return core.numeroSeccionSeguro(valor, fallback);
    }
    return Number(valor || fallback || 0);
  }

  function codigoEtapa(numero) {
    return numero === 1 ? 'diagnostico_inicial' : numero === 2 ? 'propuesta_mejora' : 'evaluacion_resultado';
  }

  function nombreEtapa(numero) {
    return numero === 1 ? 'Diagnóstico' : numero === 2 ? 'Propuesta o mejora' : 'Evaluación o resultado';
  }

  function marcarRecomendadaUnica(opciones) {
    var mejor = -1;

    opciones.forEach(function (item, index) {
      if (mejor < 0 || Number(item.puntaje || 0) > Number(opciones[mejor].puntaje || 0)) {
        mejor = index;
      }
    });

    opciones.forEach(function (item, index) {
      item.recomendada = index === mejor;
      item.recomendado = index === mejor;
    });
  }

  function esTituloUtilizable(titulo, core) {
    if (core && typeof core.esTituloValido === 'function') {
      return core.esTituloValido(titulo);
    }
    return limpiar(titulo).length >= 35 && contarPalabras(titulo) >= 16;
  }

  function llamarMotor(servicio, motor, prompt, revision, params) {
    return servicio.generarTexto(motor, prompt, {
      timeoutMs: params.timeoutMs,
      temperatura: revision ? 0.12 : 0.3,
      maxTokens: Math.max(Number(params.maxTokens || 0), 3000),
      modoRevision: revision === true
    });
  }

  function validarParametros(params, config, providers, core) {
    var estudiante = params && params.estudiante || {};
    var propuesta = params && params.propuesta || {};

    if (!config || !providers || !core) return 'Faltan módulos internos de IA de Titulación.';
    if (!estudiante.cedula && !estudiante.numeroIdentificacion) return 'Primero consulta los datos del estudiante.';
    if (!estudiante.nombreCarrera && !estudiante.carrera && !estudiante.NombreCarrera) return 'El estudiante no tiene una carrera registrada.';
    if (!limpiar(propuesta.temaGeneral || propuesta.tema)) return 'Completa el tema general de esta propuesta.';
    if (!limpiar(propuesta.lugarContexto || propuesta.contexto || propuesta.lugar)) return 'Completa el lugar o contexto de esta propuesta.';
    if (!limpiar(propuesta.grupoEstudio || propuesta.grupo || propuesta.poblacion)) return 'Completa el grupo de estudio de esta propuesta.';
    if (!limpiar(propuesta.anioPeriodo || propuesta.periodo || propuesta.tiempo)) return 'Completa el año o período de esta propuesta.';
    if (!limpiar(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad)) return 'Completa el problema o necesidad de esta propuesta.';
    if (!limpiar(propuesta.objetivo || propuesta.objetivoGeneral)) return 'Completa el objetivo de esta propuesta.';

    return '';
  }

  function obtenerTituloBase(params) {
    var propuesta = params && params.propuesta || {};
    var titulo = limpiar(propuesta.tituloFinal || propuesta.titulo || propuesta.tituloBase);
    return titulo && normalizar(titulo) !== 'no_especificado' ? titulo : '';
  }

  function similitud(a, b) {
    var tokensA = palabrasSignificativas(a);
    var tokensB = palabrasSignificativas(b);
    var encontrados = 0;

    if (!tokensA.length || !tokensB.length) return 0;
    tokensB.forEach(function (token) {
      if (tokensA.indexOf(token) >= 0) encontrados += 1;
    });
    return encontrados / Math.min(Math.max(tokensB.length, 1), 8);
  }

  function palabrasSignificativas(valor) {
    var ignorar = { para: 1, como: 1, con: 1, del: 1, las: 1, los: 1, una: 1, por: 1, que: 1, sin: 1, durante: 1, mediante: 1, sobre: 1, este: 1, esta: 1, estos: 1, estas: 1, hacia: 1, entre: 1 };
    return normalizar(valor).split('_').filter(function (palabra) {
      return palabra.length >= 4 && !ignorar[palabra];
    });
  }

  function contarPalabras(valor) {
    var texto = limpiar(valor).replace(/[“”"'.,;:¿?¡!()[\]{}]/g, ' ').replace(/\s+/g, ' ').trim();
    return texto ? texto.split(' ').filter(Boolean).length : 0;
  }

  function resumirReporte(reporte) {
    var lista = reporte && Array.isArray(reporte.errores) ? reporte.errores : [];
    if (!lista.length) return 'Las opciones todavía necesitan una revisión adicional.';
    return lista.slice(0, 6).map(function (item) {
      return 'Enfoque ' + item.seccion + ': ' + item.mensaje;
    }).join(' ');
  }

  function registrarError(ctx, mensaje) {
    ctx.errores.push({ proceso: ctx.proceso, mensaje: limpiar(mensaje).slice(0, 350) });
  }

  function construirErrorFinal(errores) {
    errores = Array.isArray(errores) ? errores : [];
    var huboRespuesta = errores.some(function (item) {
      return /titulo|respuesta|revision|opciones/.test(normalizar(item.mensaje));
    });
    return new Error(
      huboRespuesta
        ? 'La IA de Titulación respondió, pero no produjo una opción completa y bien redactada. Intenta nuevamente.'
        : 'No fue posible completar la generación en este momento. Intenta nuevamente.'
    );
  }

  function notificar(params, detalle) {
    var callback = params && params.onProgress;
    var publico = Object.assign({}, detalle || {});
    var evento;

    delete publico.proveedor;
    delete publico.provider;
    delete publico.modelo;

    if (typeof callback === 'function') {
      try { callback(publico); } catch (errorCallback) {}
    }

    try {
      evento = new CustomEvent('ia-titulacion:progreso', {
        detail: Object.assign({
          numeroPropuesta: Number(params.numeroPropuesta || params.propuesta && params.propuesta.numero || 1)
        }, publico)
      });
      document.dispatchEvent(evento);
    } catch (errorEvento) {}
  }

  function limpiarError(error) {
    return limpiar(error && error.message || error || 'Error del servicio de IA.')
      .replace(/gemini|groq|openrouter|openai|claude|llama|mistral/ig, 'servicio de IA')
      .slice(0, 350);
  }

  function limpiar(valor) {
    return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  }

  function normalizar(valor) {
    return limpiar(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  function clonar(valor) {
    return JSON.parse(JSON.stringify(valor || {}));
  }

  instalar();
})(window, document);
