/*
  Orquestador IA por propuesta:
  - Cada botón trabaja únicamente con la propuesta visible.
  - Cada proceso genera 9 títulos internos: 3 diagnósticos, 3 de proceso y 3 de análisis final.
  - Una segunda IA distinta corrige los mismos 9 cuando hay errores graves.
  - Se realizan como máximo 3 procesos completos usando pares de proveedores distintos.
  - Al estudiante se entregan 3 opciones: una por cada enfoque.
  - Nunca se generan títulos mediante plantillas locales.
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
      if (intentosInstalacion < 200) window.setTimeout(instalar, 25);
      return;
    }

    window.EstudianteMVPIATitulacion = Object.freeze(Object.assign({}, original, {
      generarOpcionesParaPropuesta: generarOpcionesParaPropuesta,
      generarNueveTitulos: generarOpcionesParaPropuesta,
      generarTitulos3x3: generarOpcionesParaPropuesta,
      __flujoNueveTitulos: true,
      modo: '9-internos-3-finales-por-propuesta',
      version: '4.0.1'
    }));

    instalado = true;
  }

  function generarOpcionesParaPropuesta(params) {
    var firebase = window.EstudianteMVPFirebaseIA;
    var providers = window.EstudianteMVPIAProviders;
    var core = window.EstudianteMVPIANueveCore;
    var error = validarParametros(params, firebase, providers, core);
    var maxProcesos;

    if (error) return Promise.reject(new Error(error));

    maxProcesos = Math.max(1, Math.min(
      MAX_PROCESOS,
      Number(params.maxProcesos || MAX_PROCESOS)
    ));

    return firebase.listarProveedoresActivos().then(function (lista) {
      var paramsCore;

      lista = Array.isArray(lista) ? lista.slice() : [];
      lista.sort(function (a, b) {
        return Number(a.prioridad || 999) - Number(b.prioridad || 999);
      });

      if (!lista.length) throw new Error('No hay proveedores IA activos.');

      paramsCore = construirParametrosCore(params);

      return ejecutarProceso({
        params: params,
        paramsCore: paramsCore,
        proveedores: lista,
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
    var indiceGenerador = (ctx.proceso - 1) * 2;
    var indiceRevisor = indiceGenerador + 1;
    var generador = ctx.proveedores[indiceGenerador];
    var revisor = ctx.proveedores[indiceRevisor] || null;
    var prompt;

    if (ctx.proceso > ctx.maxProcesos || !generador) {
      return finalizarConMejorDisponible(ctx);
    }

    prompt = construirPromptGeneracion(ctx.core, ctx.paramsCore, ctx.params);

    notificar(ctx.params, {
      proceso: ctx.proceso,
      maxProcesos: ctx.maxProcesos,
      etapa: 'generacion',
      proveedor: obtenerId(generador),
      mensaje: 'Proceso ' + ctx.proceso + ' de ' + ctx.maxProcesos + ': generando 9 alternativas internas.'
    });

    return llamarProveedor(ctx.providers, generador, prompt, false, ctx.params)
      .then(function (respuesta) {
        var secciones = ctx.core.parsearRespuesta(respuesta);
        var total = ctx.core.contarTitulos(secciones);
        var reporte;
        var base;

        if (!total) {
          ctx.errores.push({
            proceso: ctx.proceso,
            proveedor: obtenerId(generador),
            mensaje: 'No devolvió títulos utilizables.'
          });
          return siguienteProceso(ctx);
        }

        reporte = ctx.core.validarYRecomendar(secciones, ctx.paramsCore);
        base = crearCandidato(generador, generador, reporte, total, false, ctx.params);
        ctx.mejor = esMejor(base, ctx.mejor) ? base : ctx.mejor;

        notificar(ctx.params, {
          proceso: ctx.proceso,
          maxProcesos: ctx.maxProcesos,
          etapa: 'validacion',
          proveedor: obtenerId(generador),
          mensaje: 'Validando diagnóstico, proceso y análisis final.'
        });

        if (base.aptoFinal) {
          return construirResultado(
            base,
            ctx,
            'Se analizaron 9 títulos y se seleccionaron las 3 mejores opciones para esta propuesta.'
          );
        }

        if (!revisor) {
          ctx.errores.push({
            proceso: ctx.proceso,
            proveedor: obtenerId(generador),
            mensaje: 'Los títulos necesitan corrección y no hay una IA revisora disponible para este proceso.'
          });
          return siguienteProceso(ctx);
        }

        return revisarMismoGrupo(ctx, base, revisor);
      }, function (errorProveedor) {
        ctx.errores.push({
          proceso: ctx.proceso,
          proveedor: obtenerId(generador),
          mensaje: limpiarError(errorProveedor)
        });
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
      proveedor: obtenerId(revisor),
      mensaje: 'Una segunda IA está corrigiendo los mismos 9 títulos.'
    });

    return llamarProveedor(ctx.providers, revisor, promptRevision, true, ctx.params)
      .then(function (respuesta) {
        var secciones = ctx.core.parsearRespuesta(respuesta);
        var total = ctx.core.contarTitulos(secciones);
        var reporte;
        var revisado;
        var elegido;

        if (!total) {
          ctx.errores.push({
            proceso: ctx.proceso,
            proveedor: obtenerId(revisor),
            mensaje: 'La revisión no devolvió títulos utilizables.'
          });
          return siguienteProceso(ctx);
        }

        reporte = ctx.core.validarYRecomendar(secciones, ctx.paramsCore);
        revisado = crearCandidato(revisor, base.generador, reporte, total, true, ctx.params);
        elegido = esMejor(revisado, base) ? revisado : base;
        ctx.mejor = esMejor(elegido, ctx.mejor) ? elegido : ctx.mejor;

        notificar(ctx.params, {
          proceso: ctx.proceso,
          maxProcesos: ctx.maxProcesos,
          etapa: 'comparacion',
          proveedor: obtenerId(revisor),
          mensaje: 'Comparando la generación original con la versión corregida.'
        });

        if (elegido.aptoFinal) {
          return construirResultado(
            elegido,
            ctx,
            elegido === revisado
              ? 'Una segunda IA corrigió los 9 títulos y se conservaron las 3 mejores opciones.'
              : 'La revisión terminó, pero la versión original obtuvo una evaluación superior. Se muestran las 3 mejores opciones.'
          );
        }

        ctx.errores.push({
          proceso: ctx.proceso,
          proveedor: obtenerId(revisor),
          mensaje: resumirReporte(elegido.reporte)
        });

        return siguienteProceso(ctx);
      }, function (errorProveedor) {
        ctx.errores.push({
          proceso: ctx.proceso,
          proveedor: obtenerId(revisor),
          mensaje: limpiarError(errorProveedor)
        });
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
        mensaje: 'Iniciando un nuevo proceso con otro par de proveedores.'
      });
    }

    return ejecutarProceso(ctx);
  }

  function finalizarConMejorDisponible(ctx) {
    if (
      ctx.mejor &&
      Array.isArray(ctx.mejor.opcionesFinales) &&
      ctx.mejor.opcionesFinales.length === 3 &&
      sonMostrables(ctx.mejor.opcionesFinales)
    ) {
      return construirResultado(
        ctx.mejor,
        ctx,
        'Se completaron los intentos. Se conservaron las 3 opciones más sólidas obtenidas para esta propuesta.',
        true
      );
    }

    throw construirErrorFinal(ctx.errores);
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
    var tituloBase = limpiar(
      paramsOriginales.propuesta && (
        paramsOriginales.propuesta.tituloFinal ||
        paramsOriginales.propuesta.titulo ||
        paramsOriginales.propuesta.tituloBase
      )
    );
    var adicional = [
      '',
      'REGLA ESPECIAL PARA ESTA PROPUESTA:',
      '- Los 9 títulos deben abordar exactamente la misma propuesta; solo cambia el enfoque entre diagnóstico, proceso y análisis final.',
      '- De los 9 títulos, al menos uno debe conservar claramente la idea central del título escrito por el estudiante y mejorar su redacción.',
      '- Coloca esa versión mejorada como el título 1 de la sección 2 (propuesta o mejora).',
      '- No copies errores de redacción del título original y no inventes información nueva.',
      '- Título escrito por el estudiante: ' + (tituloBase || 'No escribió un título previo.')
    ].join('\n');

    return core.construirPrompt(paramsCore) + adicional;
  }

  function construirPromptRevision(core, paramsCore, paramsOriginales, reporte) {
    var tituloBase = limpiar(
      paramsOriginales.propuesta && (
        paramsOriginales.propuesta.tituloFinal ||
        paramsOriginales.propuesta.titulo ||
        paramsOriginales.propuesta.tituloBase
      )
    );

    return core.construirPromptRevision(
      paramsCore,
      reporte.secciones,
      reporte
    ) + [
      '',
      'REGLA ESPECIAL DE CORRECCIÓN:',
      '- Debes corregir los mismos 9 títulos, no iniciar un tema diferente.',
      '- Mantén una versión mejorada de la idea del título del estudiante como título 1 de la sección 2.',
      '- Título escrito por el estudiante: ' + (tituloBase || 'No escribió un título previo.')
    ].join('\n');
  }

  function crearCandidato(proveedor, generador, reporte, total, revisado, params) {
    var opcionesFinales = seleccionarOpcionesFinales(reporte, params);
    var tituloBase = obtenerTituloBase(params);
    var opcionProceso = opcionesFinales.find(function (item) {
      return item.etapa === 'propuesta_mejora';
    }) || null;
    var cumpleTituloBase = !tituloBase || (
      opcionProceso && similitud(opcionProceso.titulo, tituloBase) >= 0.12
    );

    return {
      proveedor: proveedor,
      generador: generador,
      reporte: reporte,
      totalTitulos: total,
      revisado: revisado === true,
      opcionesFinales: opcionesFinales,
      cumpleTituloBase: cumpleTituloBase,
      aptoFinal: reporte.apto === true &&
        opcionesFinales.length === 3 &&
        cumpleTituloBase &&
        sonMostrables(opcionesFinales)
    };
  }

  function seleccionarOpcionesFinales(reporte, params) {
    var tituloBase = obtenerTituloBase(params);
    var usadas = {};
    var opciones = [];

    (reporte && Array.isArray(reporte.secciones) ? reporte.secciones : [])
      .slice(0, 3)
      .forEach(function (seccion) {
        var candidatos = Array.isArray(seccion.titulos) ? seccion.titulos.slice() : [];
        var elegida;

        candidatos.sort(function (a, b) {
          var aValida = Array.isArray(a.erroresGraves) ? a.erroresGraves.length === 0 : true;
          var bValida = Array.isArray(b.erroresGraves) ? b.erroresGraves.length === 0 : true;
          var aSim = seccion.seccion === 2 && tituloBase ? similitud(a.titulo, tituloBase) : 0;
          var bSim = seccion.seccion === 2 && tituloBase ? similitud(b.titulo, tituloBase) : 0;

          if (aValida !== bValida) return aValida ? -1 : 1;
          if (seccion.seccion === 2 && tituloBase && Math.abs(bSim - aSim) > 0.03) {
            return bSim - aSim;
          }
          return Number(b.puntaje || 0) - Number(a.puntaje || 0);
        });

        elegida = candidatos.find(function (item) {
          var clave = normalizar(item.titulo);
          return clave && !usadas[clave];
        }) || null;

        if (!elegida) return;

        usadas[normalizar(elegida.titulo)] = true;
        opciones.push({
          numero: opciones.length + 1,
          titulo: elegida.titulo,
          justificacion: limpiar(elegida.justificacion) ||
            'Opción seleccionada por su relación con la propuesta y el enfoque académico.',
          puntaje: Number(elegida.puntaje || 0),
          etapa: seccion.etapa,
          nombreEtapa: seccion.nombreEtapa,
          basadaEnTituloEstudiante: seccion.seccion === 2 && tituloBase
            ? similitud(elegida.titulo, tituloBase) >= 0.12
            : false,
          recomendada: false,
          recomendado: false
        });
      });

    marcarRecomendadaUnica(opciones);
    return opciones;
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

  function sonMostrables(opciones) {
    var usadas = {};

    if (!Array.isArray(opciones) || opciones.length !== 3) return false;

    return opciones.every(function (item) {
      var titulo = limpiar(item && item.titulo);
      var clave = normalizar(titulo);

      if (
        titulo.length < 25 ||
        !clave ||
        usadas[clave] ||
        /no_especificado|titulo_academico|primera_alternativa|segunda_alternativa|tercera_alternativa/.test(clave)
      ) {
        return false;
      }

      usadas[clave] = true;
      return Number(item.puntaje || 0) > -30;
    });
  }

  function esMejor(a, b) {
    if (!a) return false;
    if (!b) return true;

    if (a.aptoFinal !== b.aptoFinal) return a.aptoFinal;
    if (a.opcionesFinales.length !== b.opcionesFinales.length) {
      return a.opcionesFinales.length > b.opcionesFinales.length;
    }
    if (a.cumpleTituloBase !== b.cumpleTituloBase) return a.cumpleTituloBase;
    if (a.reporte.graves !== b.reporte.graves) {
      return a.reporte.graves < b.reporte.graves;
    }
    if (a.reporte.menores !== b.reporte.menores) {
      return a.reporte.menores < b.reporte.menores;
    }

    return puntajeOpciones(a.opcionesFinales) > puntajeOpciones(b.opcionesFinales);
  }

  function puntajeOpciones(opciones) {
    return (Array.isArray(opciones) ? opciones : []).reduce(function (total, item) {
      return total + Number(item.puntaje || 0);
    }, 0);
  }

  function construirResultado(candidato, ctx, mensaje, mejorDisponible) {
    var proveedor = candidato.proveedor || {};
    var generador = candidato.generador || proveedor;

    notificar(ctx.params, {
      proceso: Math.min(ctx.proceso, ctx.maxProcesos),
      maxProcesos: ctx.maxProcesos,
      etapa: 'finalizacion',
      proveedor: obtenerId(proveedor),
      mensaje: 'Preparando las 3 opciones finales para el estudiante.'
    });

    return {
      ok: true,
      numeroPropuesta: Number(
        ctx.params.numeroPropuesta ||
        ctx.params.propuesta && ctx.params.propuesta.numero ||
        1
      ),
      proveedor: obtenerId(proveedor),
      proveedorNombre: limpiar(
        proveedor.nombre || proveedor.name || obtenerId(proveedor)
      ),
      proveedorGenerador: obtenerId(generador),
      revisadoPorOtraIA: candidato.revisado === true,
      procesoUsado: Math.min(ctx.proceso, ctx.maxProcesos),
      maxProcesos: ctx.maxProcesos,
      totalTitulosInternos: candidato.totalTitulos,
      seccionesInternas: candidato.reporte.secciones,
      opcionesFinales: candidato.opcionesFinales,
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

  function llamarProveedor(servicio, proveedor, prompt, revision, params) {
    return servicio.generarTexto(proveedor, prompt, {
      timeoutMs: params.timeoutMs,
      temperatura: revision ? 0.12 : 0.3,
      maxTokens: Math.max(Number(params.maxTokens || 0), 3000),
      modoRevision: revision === true
    });
  }

  function validarParametros(params, firebase, providers, core) {
    var estudiante = params && params.estudiante || {};
    var propuesta = params && params.propuesta || {};

    if (!firebase || !providers || !core) return 'Faltan módulos internos de IA.';
    if (!estudiante.cedula && !estudiante.numeroIdentificacion) {
      return 'Primero consulta los datos del estudiante.';
    }
    if (!estudiante.nombreCarrera && !estudiante.carrera && !estudiante.NombreCarrera) {
      return 'El estudiante no tiene una carrera registrada.';
    }
    if (!limpiar(propuesta.temaGeneral || propuesta.tema)) {
      return 'Completa el tema general de esta propuesta.';
    }
    if (!limpiar(propuesta.lugarContexto || propuesta.contexto || propuesta.lugar)) {
      return 'Completa el lugar o contexto de esta propuesta.';
    }
    if (!limpiar(propuesta.grupoEstudio || propuesta.grupo || propuesta.poblacion)) {
      return 'Completa el grupo de estudio de esta propuesta.';
    }
    if (!limpiar(propuesta.anioPeriodo || propuesta.periodo || propuesta.tiempo)) {
      return 'Completa el año o período de esta propuesta.';
    }
    if (!limpiar(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad)) {
      return 'Completa el problema o necesidad de esta propuesta.';
    }
    if (!limpiar(propuesta.objetivo || propuesta.objetivoGeneral)) {
      return 'Completa el objetivo de esta propuesta.';
    }

    return '';
  }

  function obtenerTituloBase(params) {
    var propuesta = params && params.propuesta || {};
    var titulo = limpiar(
      propuesta.tituloFinal || propuesta.titulo || propuesta.tituloBase
    );

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

  function resumirReporte(reporte) {
    var lista = reporte && Array.isArray(reporte.errores) ? reporte.errores : [];

    if (!lista.length) return 'Los títulos todavía necesitan revisión.';

    return lista.slice(0, 6).map(function (item) {
      return 'S' + item.seccion + ' T' + item.titulo + ': ' + item.mensaje;
    }).join(' ');
  }

  function construirErrorFinal(errores) {
    var mensaje = 'No fue posible obtener tres opciones válidas después de los procesos disponibles.';

    errores = Array.isArray(errores) ? errores : [];
    if (errores.length) {
      mensaje += ' Detalle: ' + errores.map(function (item) {
        return 'Proceso ' + (item.proceso || '-') + ', ' + item.proveedor + ': ' + item.mensaje;
      }).join(' | ');
    }

    return new Error(mensaje);
  }

  function notificar(params, detalle) {
    var callback = params && params.onProgress;
    var evento;

    if (typeof callback === 'function') {
      try { callback(detalle || {}); } catch (errorCallback) {}
    }

    try {
      evento = new CustomEvent('ia-titulacion:progreso', {
        detail: Object.assign({
          numeroPropuesta: Number(
            params.numeroPropuesta || params.propuesta && params.propuesta.numero || 1
          )
        }, detalle || {})
      });
      document.dispatchEvent(evento);
    } catch (errorEvento) {}
  }

  function obtenerId(proveedor) {
    return limpiar(
      proveedor && (proveedor.id || proveedor.proveedor || proveedor.provider) || 'IA'
    );
  }

  function limpiarError(error) {
    return limpiar(error && error.message || error || 'Error de proveedor IA.').slice(0, 350);
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
