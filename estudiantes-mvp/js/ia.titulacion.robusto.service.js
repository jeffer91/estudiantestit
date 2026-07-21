/*
  Orquestador robusto de IA de Titulación:
  - Funciona con uno o varios motores internos.
  - El mismo motor puede generar y corregir cuando es el único disponible.
  - Conserva únicamente títulos completos, limpios y académicamente utilizables.
  - Intenta obtener tres opciones, pero nunca completa tarjetas con fragmentos JSON.
  - Si al finalizar solo existe una o dos opciones válidas, muestra únicamente esas.
*/
(function (window, document) {
  'use strict';

  var MAX_PROCESOS = 3;
  var instalado = false;
  var intentosInstalacion = 0;

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
      modo: 'motores-internos-privados',
      version: '5.1.0'
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
        mejor: null,
        errores: [],
        providers: providers,
        core: core
      });
    });
  }

  function ejecutarProceso(ctx) {
    var generador;
    var revisor;
    var prompt;

    if (ctx.proceso > ctx.maxProcesos) {
      return finalizarConMejorDisponible(ctx);
    }

    generador = ctx.motores[(ctx.proceso - 1) % ctx.motores.length];
    revisor = ctx.motores.length > 1
      ? ctx.motores[ctx.proceso % ctx.motores.length]
      : generador;
    prompt = construirPromptGeneracion(ctx.core, ctx.paramsCore, ctx.params);

    notificar(ctx.params, {
      proceso: ctx.proceso,
      maxProcesos: ctx.maxProcesos,
      etapa: 'generacion',
      mensaje: 'Generando nuevas alternativas internas.'
    });

    return llamarMotor(ctx.providers, generador, prompt, false, ctx.params)
      .then(function (respuesta) {
        var secciones = ctx.core.parsearRespuesta(respuesta);
        var total = ctx.core.contarTitulos(secciones);
        var reporte;
        var base;

        if (!total) {
          registrarError(ctx, 'La respuesta no contenía títulos completos y utilizables.');
          return siguienteProceso(ctx);
        }

        reporte = ctx.core.validarYRecomendar(secciones, ctx.paramsCore);
        base = crearCandidato(reporte, total, false, ctx.params, ctx.core);
        ctx.mejor = esMejor(base, ctx.mejor) ? base : ctx.mejor;

        notificar(ctx.params, {
          proceso: ctx.proceso,
          maxProcesos: ctx.maxProcesos,
          etapa: 'validacion',
          mensaje: 'Revisando redacción, extensión y relación académica.'
        });

        if (base.aptoFinal) {
          return construirResultado(
            base,
            ctx,
            'Se prepararon tres opciones completas y relacionadas con la propuesta.'
          );
        }

        return revisarMismoGrupo(ctx, base, revisor);
      })
      .catch(function (errorMotor) {
        registrarError(ctx, limpiarError(errorMotor));
        return siguienteProceso(ctx);
      });
  }

  function revisarMismoGrupo(ctx, base, revisor) {
    var promptRevision = construirPromptRevision(
      ctx.core,
      ctx.paramsCore,
      ctx.params,
      base.reporte
    );

    notificar(ctx.params, {
      proceso: ctx.proceso,
      maxProcesos: ctx.maxProcesos,
      etapa: 'correccion',
      mensaje: 'Corrigiendo las opciones que necesitan ajustes.'
    });

    return llamarMotor(ctx.providers, revisor, promptRevision, true, ctx.params)
      .then(function (respuesta) {
        var secciones = ctx.core.parsearRespuesta(respuesta);
        var total = ctx.core.contarTitulos(secciones);
        var reporte;
        var revisado;
        var elegido;

        if (!total) {
          registrarError(ctx, 'La revisión no devolvió títulos completos y utilizables.');
          return siguienteProceso(ctx);
        }

        reporte = ctx.core.validarYRecomendar(secciones, ctx.paramsCore);
        revisado = crearCandidato(reporte, total, true, ctx.params, ctx.core);
        elegido = esMejor(revisado, base) ? revisado : base;
        ctx.mejor = esMejor(elegido, ctx.mejor) ? elegido : ctx.mejor;

        notificar(ctx.params, {
          proceso: ctx.proceso,
          maxProcesos: ctx.maxProcesos,
          etapa: 'comparacion',
          mensaje: 'Comparando las versiones y conservando las opciones mejor redactadas.'
        });

        if (elegido.aptoFinal) {
          return construirResultado(
            elegido,
            ctx,
            elegido.revisado
              ? 'Las tres opciones fueron revisadas y quedaron listas para elegir.'
              : 'La versión inicial obtuvo una mejor evaluación y quedó lista para elegir.'
          );
        }

        registrarError(ctx, resumirReporte(elegido.reporte));
        return siguienteProceso(ctx);
      })
      .catch(function (errorMotor) {
        registrarError(ctx, limpiarError(errorMotor));
        return siguienteProceso(ctx);
      });
  }

  function siguienteProceso(ctx) {
    ctx.proceso += 1;

    if (ctx.proceso <= ctx.maxProcesos) {
      notificar(ctx.params, {
        proceso: ctx.proceso,
        maxProcesos: ctx.maxProcesos,
        etapa: 'reinicio',
        mensaje: 'Realizando una nueva revisión interna.'
      });
    }

    return ejecutarProceso(ctx);
  }

  function finalizarConMejorDisponible(ctx) {
    var cantidad;
    var mensaje;

    if (!ctx.mejor || !Array.isArray(ctx.mejor.opcionesFinales)) {
      throw construirErrorFinal(ctx.errores);
    }

    cantidad = ctx.mejor.opcionesFinales.length;
    if (cantidad < 1 || cantidad > 3 || !sonMostrables(ctx.mejor.opcionesFinales, ctx.core)) {
      throw construirErrorFinal(ctx.errores);
    }

    mensaje = cantidad === 1
      ? 'Se obtuvo una opción completa y bien redactada para esta propuesta.'
      : cantidad === 2
        ? 'Se conservaron las dos opciones completas y mejor redactadas para esta propuesta.'
        : 'Se conservaron las tres opciones más sólidas obtenidas para esta propuesta.';

    return construirResultado(ctx.mejor, ctx, mensaje, cantidad < 3);
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

  function construirPromptGeneracion(core, paramsCore, paramsOriginales) {
    var tituloBase = obtenerTituloBase(paramsOriginales);

    return core.construirPrompt(paramsCore) + [
      '',
      'REGLAS ESPECIALES PARA ESTA PROPUESTA:',
      '- Los títulos deben abordar exactamente la misma propuesta; solo cambia el enfoque entre diagnóstico, propuesta de mejora y evaluación esperada.',
      '- Al menos una opción del enfoque de propuesta o mejora debe conservar claramente la idea central del título escrito por el estudiante.',
      '- No copies errores de redacción ni inventes información.',
      '- En cada objeto, el campo titulo debe contener solamente el título académico completo.',
      '- Nunca coloques etapa, justificación, etiquetas, nombres de campos o fragmentos JSON dentro del campo titulo.',
      '- Título escrito por el estudiante: ' + (tituloBase || 'No escribió un título previo.')
    ].join('\n');
  }

  function construirPromptRevision(core, paramsCore, paramsOriginales, reporte) {
    var tituloBase = obtenerTituloBase(paramsOriginales);

    return core.construirPromptRevision(
      paramsCore,
      reporte.secciones,
      reporte
    ) + [
      '',
      'REGLAS ESPECIALES DE CORRECCIÓN:',
      '- Conserva todas las opciones que ya están completas y bien redactadas.',
      '- Regenera únicamente los títulos faltantes, cortados, repetidos o inválidos.',
      '- Cada campo titulo debe contener solo una oración académica completa, sin comillas sobrantes, etiquetas ni fragmentos JSON.',
      '- Mantén una versión mejorada de la idea central del estudiante dentro del enfoque de propuesta o mejora.',
      '- Título escrito por el estudiante: ' + (tituloBase || 'No escribió un título previo.')
    ].join('\n');
  }

  function crearCandidato(reporte, total, revisado, params, core) {
    var opcionesFinales = seleccionarOpcionesFinales(reporte, params, core);
    var tituloBase = obtenerTituloBase(params);
    var opcionProceso = opcionesFinales.find(function (item) {
      return item.etapa === 'propuesta_mejora';
    }) || null;
    var cumpleTituloBase = !tituloBase || !opcionProceso ||
      similitud(opcionProceso.titulo, tituloBase) >= 0.08;

    return {
      reporte: reporte,
      totalTitulos: total,
      revisado: revisado === true,
      opcionesFinales: opcionesFinales,
      cumpleTituloBase: cumpleTituloBase,
      gravesSeleccionados: 0,
      aptoFinal: opcionesFinales.length === 3 && sonMostrables(opcionesFinales, core)
    };
  }

  function seleccionarOpcionesFinales(reporte, params, core) {
    var tituloBase = obtenerTituloBase(params);
    var usadas = {};
    var opciones = [];
    var secciones = reporte && Array.isArray(reporte.secciones) ? reporte.secciones : [];
    var restantes = [];

    secciones.slice(0, 3).forEach(function (seccion) {
      var candidatos = candidatosValidos(seccion, core);
      var elegida;

      candidatos.sort(function (a, b) {
        var similitudA = seccion.seccion === 2 && tituloBase ? similitud(a.titulo, tituloBase) : 0;
        var similitudB = seccion.seccion === 2 && tituloBase ? similitud(b.titulo, tituloBase) : 0;

        if (seccion.seccion === 2 && tituloBase && Math.abs(similitudB - similitudA) > 0.03) {
          return similitudB - similitudA;
        }
        return Number(b.puntaje || 0) - Number(a.puntaje || 0);
      });

      elegida = candidatos.find(function (item) {
        var clave = normalizar(item.titulo);
        return clave && !usadas[clave];
      }) || null;

      if (elegida) {
        usadas[normalizar(elegida.titulo)] = true;
        opciones.push(crearOpcion(elegida, seccion, opciones.length + 1, tituloBase, core));
      }

      candidatos.forEach(function (item) {
        restantes.push({ item: item, seccion: seccion });
      });
    });

    restantes.sort(function (a, b) {
      return Number(b.item.puntaje || 0) - Number(a.item.puntaje || 0);
    });

    restantes.some(function (registro) {
      var clave = normalizar(registro.item.titulo);
      if (!clave || usadas[clave]) return false;
      usadas[clave] = true;
      opciones.push(crearOpcion(
        registro.item,
        registro.seccion,
        opciones.length + 1,
        tituloBase,
        core
      ));
      return opciones.length === 3;
    });

    marcarRecomendadaUnica(opciones);
    return opciones.slice(0, 3);
  }

  function candidatosValidos(seccion, core) {
    return (seccion && Array.isArray(seccion.titulos) ? seccion.titulos : []).filter(function (item) {
      var graves = Array.isArray(item.erroresGraves) ? item.erroresGraves : [];
      return graves.length === 0 && esTituloUtilizable(item.titulo, core);
    });
  }

  function crearOpcion(item, seccion, numero, tituloBase, core) {
    var titulo = core && typeof core.limpiarTitulo === 'function'
      ? core.limpiarTitulo(item.titulo)
      : limpiar(item.titulo);

    return {
      numero: numero,
      titulo: titulo,
      justificacion: limpiar(item.justificacion) ||
        'Opción seleccionada por su relación con la propuesta y el enfoque académico.',
      puntaje: Number(item.puntaje || 0),
      etapa: seccion.etapa,
      nombreEtapa: seccion.nombreEtapa,
      basadaEnTituloEstudiante: seccion.seccion === 2 && tituloBase
        ? similitud(titulo, tituloBase) >= 0.08
        : false,
      recomendada: false,
      recomendado: false
    };
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

  function sonMostrables(opciones, core) {
    var usadas = {};

    if (!Array.isArray(opciones) || opciones.length < 1 || opciones.length > 3) return false;

    return opciones.every(function (item) {
      var titulo = limpiar(item && item.titulo);
      var clave = normalizar(titulo);

      if (!esTituloUtilizable(titulo, core) || !clave || usadas[clave]) return false;
      usadas[clave] = true;
      return true;
    });
  }

  function esMejor(a, b) {
    if (!a) return false;
    if (!b) return true;

    if (a.opcionesFinales.length !== b.opcionesFinales.length) {
      return a.opcionesFinales.length > b.opcionesFinales.length;
    }
    if (a.aptoFinal !== b.aptoFinal) return a.aptoFinal;
    if (a.cumpleTituloBase !== b.cumpleTituloBase) return a.cumpleTituloBase;
    if (a.reporte.graves !== b.reporte.graves) return a.reporte.graves < b.reporte.graves;
    if (a.reporte.menores !== b.reporte.menores) return a.reporte.menores < b.reporte.menores;

    return puntajeOpciones(a.opcionesFinales) > puntajeOpciones(b.opcionesFinales);
  }

  function puntajeOpciones(opciones) {
    return (Array.isArray(opciones) ? opciones : []).reduce(function (total, item) {
      return total + Number(item.puntaje || 0);
    }, 0);
  }

  function construirResultado(candidato, ctx, mensaje, mejorDisponible) {
    var cantidad = candidato.opcionesFinales.length;

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
      revisadoInternamente: candidato.revisado === true,
      procesoUsado: Math.min(ctx.proceso, ctx.maxProcesos),
      maxProcesos: ctx.maxProcesos,
      totalTitulosInternos: candidato.totalTitulos,
      cantidadOpciones: cantidad,
      opcionesFinales: candidato.opcionesFinales.map(function (item) {
        return Object.assign({}, item);
      }),
      mejorDisponible: mejorDisponible === true,
      validacion: {
        graves: candidato.reporte.graves,
        menores: candidato.reporte.menores,
        puntajeTotal: candidato.reporte.puntajeTotal,
        cumpleTituloBase: candidato.cumpleTituloBase
      },
      mensaje: mensaje
    };
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
    if (!estudiante.cedula && !estudiante.numeroIdentificacion) {
      return 'Primero consulta los datos del estudiante.';
    }
    if (!estudiante.nombreCarrera && !estudiante.carrera && !estudiante.NombreCarrera) {
      return 'El estudiante no tiene una carrera registrada.';
    }
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
    var ignorar = {
      para: 1, como: 1, con: 1, del: 1, las: 1, los: 1, una: 1,
      por: 1, que: 1, sin: 1, durante: 1, mediante: 1, sobre: 1,
      este: 1, esta: 1, estos: 1, estas: 1, hacia: 1, entre: 1
    };

    return normalizar(valor).split('_').filter(function (palabra) {
      return palabra.length >= 4 && !ignorar[palabra];
    });
  }

  function contarPalabras(valor) {
    var texto = limpiar(valor)
      .replace(/[“”"'.,;:¿?¡!()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
    ctx.errores.push({
      proceso: ctx.proceso,
      mensaje: limpiar(mensaje).slice(0, 350)
    });
  }

  function construirErrorFinal(errores) {
    errores = Array.isArray(errores) ? errores : [];
    var huboRespuestaIncompleta = errores.some(function (item) {
      return /título|titulo|respuesta|revisión|revision|opciones/.test(normalizar(item.mensaje));
    });

    return new Error(
      huboRespuestaIncompleta
        ? 'La IA de Titulación respondió, pero no produjo una opción completa y bien redactada. Intenta nuevamente.'
        : 'No fue posible completar la generación en este momento. Intenta nuevamente.'
    );
  }

  function notificar(params, detalle) {
    var callback = params && params.onProgress;
    var evento;
    var publico = Object.assign({}, detalle || {});

    delete publico.proveedor;
    delete publico.provider;
    delete publico.modelo;

    if (typeof callback === 'function') {
      try { callback(publico); } catch (errorCallback) {}
    }

    try {
      evento = new CustomEvent('ia-titulacion:progreso', {
        detail: Object.assign({
          numeroPropuesta: Number(
            params.numeroPropuesta || params.propuesta && params.propuesta.numero || 1
          )
        }, publico)
      });
      document.dispatchEvent(evento);
    } catch (errorEvento) {}
  }

  function limpiarError(error) {
    var mensaje = limpiar(error && error.message || error || 'Error del servicio de IA.');
    return mensaje
      .replace(/gemini|groq|openrouter|openai|claude|llama|mistral/ig, 'servicio de IA')
      .slice(0, 350);
  }

  function limpiar(valor) {
    return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  }

  function normalizar(valor) {
    return limpiar(valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function clonar(valor) {
    return JSON.parse(JSON.stringify(valor || {}));
  }

  instalar();
})(window, document);
