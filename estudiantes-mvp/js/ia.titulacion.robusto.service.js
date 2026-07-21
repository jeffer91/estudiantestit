/*
  Orquestador rápido de IA de Titulación.
  - Ejecuta todos los motores internos en paralelo.
  - Primera ronda: cada motor propone los tres enfoques.
  - Segunda ronda opcional: solicita únicamente los enfoques faltantes.
  - Conserva una sola opción completa por enfoque.
  - Nunca revela nombres, marcas, modelos ni credenciales.
*/
(function (window, document) {
  'use strict';

  var MAX_RONDAS = 2;
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
      modo: 'motores-internos-paralelos',
      version: '6.0.0'
    }));

    instalado = true;
  }

  function generarOpcionesParaPropuesta(params) {
    var config = window.EstudianteMVPFirebaseIA;
    var providers = window.EstudianteMVPIAProviders;
    var core = window.EstudianteMVPIANueveCore;
    var error = validarParametros(params, config, providers, core);

    if (error) return Promise.reject(new Error(error));

    return config.listarProveedoresActivos().then(function (motores) {
      motores = Array.isArray(motores) ? motores.slice() : [];
      motores.sort(function (a, b) {
        return Number(a.prioridad || 999) - Number(b.prioridad || 999);
      });

      if (!motores.length) {
        throw new Error('La IA de Titulación no está disponible en este momento.');
      }

      return ejecutarRonda({
        params: params,
        paramsCore: construirParametrosCore(params),
        motores: motores,
        providers: providers,
        core: core,
        ronda: 1,
        maxRondas: Math.max(1, Math.min(MAX_RONDAS, Number(params.maxProcesos || MAX_RONDAS))),
        acumulado: {},
        errores: [],
        ultimoReporte: null,
        totalTitulosInternos: 0,
        revisadoInternamente: false
      });
    });
  }

  function ejecutarRonda(ctx) {
    var esCorreccion = ctx.ronda > 1;
    var promptBase;
    var tareas;

    if (cantidadAcumulada(ctx) === 3) {
      return Promise.resolve(construirResultado(ctx, 'Se prepararon tres opciones completas y diferentes.'));
    }

    promptBase = esCorreccion
      ? construirPromptCorreccion(ctx)
      : construirPromptInicial(ctx);

    notificar(ctx.params, {
      proceso: ctx.ronda,
      maxProcesos: ctx.maxRondas,
      ronda: ctx.ronda,
      maxRondas: ctx.maxRondas,
      etapa: esCorreccion ? 'correccion_paralela' : 'generacion_paralela',
      mensaje: esCorreccion
        ? mensajeFaltantes(ctx, 'Completando en paralelo')
        : 'Los motores internos están generando alternativas en paralelo.'
    });

    tareas = ctx.motores.map(function (motor, index) {
      var prompt = promptBase + varianteMotor(index, esCorreccion);

      return llamarMotor(
        ctx.providers,
        motor,
        prompt,
        esCorreccion,
        ctx.params
      ).then(function (respuesta) {
        return { ok: true, motor: motor, respuesta: respuesta };
      }).catch(function (error) {
        return { ok: false, motor: motor, error: error };
      });
    });

    return Promise.all(tareas).then(function (resultados) {
      var respondieron = 0;

      resultados.forEach(function (resultado) {
        var reporte;

        if (!resultado.ok) {
          registrarError(ctx, limpiarError(resultado.error));
          return;
        }

        respondieron += 1;
        reporte = analizarRespuesta(ctx, resultado.respuesta);
        if (reporte) combinarReporte(ctx, reporte);
        else registrarError(ctx, 'Una respuesta no contenía títulos completos y utilizables.');
      });

      notificar(ctx.params, {
        proceso: ctx.ronda,
        maxProcesos: ctx.maxRondas,
        ronda: ctx.ronda,
        maxRondas: ctx.maxRondas,
        etapa: 'validacion',
        mensaje: 'Validando y combinando las mejores opciones obtenidas.'
      });

      if (cantidadAcumulada(ctx) === 3) {
        return construirResultado(
          ctx,
          esCorreccion
            ? 'Las tres opciones fueron completadas y quedaron listas para elegir.'
            : 'Los motores internos prepararon tres opciones completas y diferentes.'
        );
      }

      if (!respondieron && !cantidadAcumulada(ctx) && ctx.ronda >= ctx.maxRondas) {
        throw construirErrorFinal(ctx.errores);
      }

      if (ctx.ronda < ctx.maxRondas) {
        ctx.ronda += 1;
        ctx.revisadoInternamente = true;
        return ejecutarRonda(ctx);
      }

      return finalizarConAcumulado(ctx);
    });
  }

  function varianteMotor(index, esCorreccion) {
    var variantes = [
      'Usa una redacción directa, clara y académica.',
      'Usa una formulación alternativa, aplicada y distinta de las opciones evidentes.',
      'Prioriza precisión metodológica y relación clara entre problema, grupo y contexto.'
    ];

    return [
      '',
      'VARIANTE INTERNA ' + (index + 1) + ':',
      variantes[index % variantes.length],
      esCorreccion
        ? 'No repitas ninguna opción ya conservada.'
        : 'Evita títulos genéricos y repeticiones.'
    ].join('\n');
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
      var opcion;
      var actual;

      if (!candidato || numero < 1 || numero > 3) return;

      opcion = crearOpcion(candidato, seccion, numero, ctx.params, ctx.core);
      actual = ctx.acumulado[numero];

      if (!actual || esCandidatoMejor(opcion, actual)) {
        ctx.acumulado[numero] = opcion;
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
      proceso: ctx.ronda,
      maxProcesos: ctx.maxRondas,
      ronda: ctx.ronda,
      maxRondas: ctx.maxRondas,
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
      procesoUsado: ctx.ronda,
      rondaUsada: ctx.ronda,
      maxProcesos: ctx.maxRondas,
      maxRondas: ctx.maxRondas,
      totalTitulosInternos: ctx.totalTitulosInternos,
      cantidadOpciones: cantidad,
      opcionesFinales: opciones,
      mejorDisponible: mejorDisponible === true,
      enfoquesCompletos: opciones.map(function (item) { return item.etapa; }),
      motoresUtilizados: ctx.motores.length,
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

  function construirPromptInicial(ctx) {
    var datos = datosPropuesta(ctx.params);

    return [
      'Actúa como asesor académico de trabajos de titulación.',
      'Genera exactamente tres títulos diferentes para UNA MISMA propuesta.',
      '',
      'DATOS:',
      'Carrera: ' + datos.carrera,
      'Tema general: ' + datos.tema,
      'Lugar o contexto: ' + datos.contexto,
      'Grupo de estudio: ' + datos.grupo,
      'Año o período: ' + datos.periodo,
      'Problema o necesidad: ' + datos.problema,
      'Objetivo: ' + datos.objetivo,
      '',
      'ENFOQUES OBLIGATORIOS:',
      '1. Diagnóstico de la situación inicial.',
      '2. Propuesta, diseño o mejora.',
      '3. Evaluación, análisis o resultado esperado.',
      '',
      'REGLAS:',
      '- Cada título debe tener entre 20 y 30 palabras.',
      '- Cada título debe ser una oración completa, clara y académica.',
      '- Incluye tema, enfoque, grupo o contexto y período cuando corresponda.',
      '- No escribas justificaciones, explicaciones, encabezados ni texto fuera del JSON.',
      '- El campo titulo debe contener solamente el título.',
      '- No repitas títulos ni enfoques.',
      '',
      'RESPONDE SOLO CON ESTE JSON:',
      '{"titulos":[',
      '{"seccion":1,"etapa":"diagnostico_inicial","titulo":"..."},',
      '{"seccion":2,"etapa":"propuesta_mejora","titulo":"..."},',
      '{"seccion":3,"etapa":"evaluacion_resultado","titulo":"..."}',
      ']}'
    ].join('\n');
  }

  function construirPromptCorreccion(ctx) {
    var datos = datosPropuesta(ctx.params);
    var faltantes = enfoquesFaltantes(ctx);
    var existentes = opcionesAcumuladas(ctx);

    return [
      'Actúa como asesor académico de trabajos de titulación.',
      'Completa únicamente los enfoques que faltan para esta propuesta.',
      '',
      'DATOS:',
      'Carrera: ' + datos.carrera,
      'Tema general: ' + datos.tema,
      'Lugar o contexto: ' + datos.contexto,
      'Grupo de estudio: ' + datos.grupo,
      'Año o período: ' + datos.periodo,
      'Problema o necesidad: ' + datos.problema,
      'Objetivo: ' + datos.objetivo,
      '',
      'ENFOQUES FALTANTES:',
      faltantes.map(function (numero) {
        return numero + '. ' + NOMBRES_ENFOQUE[numero] + '.';
      }).join('\n'),
      '',
      'TÍTULOS YA ACEPTADOS; NO LOS REPITAS:',
      existentes.length
        ? existentes.map(function (opcion) { return '- ' + opcion.titulo; }).join('\n')
        : '- Ninguno.',
      '',
      'REGLAS:',
      '- Devuelve exactamente un título por cada enfoque faltante.',
      '- Cada título debe tener entre 20 y 30 palabras.',
      '- El campo titulo debe contener únicamente el título académico completo.',
      '- No escribas justificaciones, etiquetas ni texto fuera del JSON.',
      '',
      'RESPONDE SOLO CON JSON:',
      '{"titulos":[{"seccion":NUMERO,"etapa":"CODIGO","titulo":"..."}]}'
    ].join('\n');
  }

  function datosPropuesta(params) {
    var estudiante = params && params.estudiante || {};
    var propuesta = params && params.propuesta || {};

    return {
      carrera: limpiar(estudiante.nombreCarrera || estudiante.carrera || estudiante.NombreCarrera),
      tema: limpiar(propuesta.temaGeneral || propuesta.tema),
      contexto: limpiar(propuesta.lugarContexto || propuesta.contexto || propuesta.lugar),
      grupo: limpiar(propuesta.grupoEstudio || propuesta.grupo || propuesta.poblacion),
      periodo: limpiar(propuesta.anioPeriodo || propuesta.periodo || propuesta.tiempo),
      problema: limpiar(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad),
      objetivo: limpiar(propuesta.objetivo || propuesta.objetivoGeneral)
    };
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
    var limiteSolicitado = Number(params.maxTokens || 900);

    return servicio.generarTexto(motor, prompt, {
      timeoutMs: Math.min(Number(params.timeoutMs || 20000), 20000),
      temperatura: revision ? 0.12 : 0.28,
      maxTokens: revision
        ? Math.min(Math.max(limiteSolicitado, 600), 750)
        : Math.min(Math.max(limiteSolicitado, 750), 950),
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

  function registrarError(ctx, mensaje) {
    ctx.errores.push({ ronda: ctx.ronda, mensaje: limpiar(mensaje).slice(0, 350) });
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
