/*
  Orquestador IA 3x3:
  - Una IA genera 9 títulos: 3 por sección.
  - La app valida estructura y calidad.
  - Solo cuando existen errores graves, una segunda IA efectiva revisa los mismos 9.
  - Los proveedores que no conectan se omiten; no cuentan como revisores.
  - Se conserva siempre el grupo con mejor evaluación.
  - Nunca se generan títulos mediante plantillas locales.
*/
(function (window) {
  'use strict';

  var instalado = false;
  var intentosInstalacion = 0;

  function instalar() {
    var original = window.EstudianteMVPIATitulacion;

    if (instalado) return;
    if (!original || !window.EstudianteMVPIANueveCore) {
      intentosInstalacion += 1;
      if (intentosInstalacion < 160) window.setTimeout(instalar, 25);
      return;
    }

    window.EstudianteMVPIATitulacion = Object.freeze(Object.assign({}, original, {
      generarNueveTitulos: generarNueveTitulos,
      generarTitulos3x3: generarNueveTitulos,
      __flujoNueveTitulos: true,
      modo: '3x3',
      version: '3.1.0'
    }));

    instalado = true;
  }

  function generarNueveTitulos(params) {
    var firebase = window.EstudianteMVPFirebaseIA;
    var providers = window.EstudianteMVPIAProviders;
    var core = window.EstudianteMVPIANueveCore;
    var error = validarParametros(params, firebase, providers, core);

    if (error) return Promise.reject(new Error(error));

    return firebase.listarProveedoresActivos().then(function (lista) {
      lista = Array.isArray(lista) ? lista.slice() : [];
      lista.sort(function (a, b) {
        return Number(a.prioridad || 999) - Number(b.prioridad || 999);
      });

      if (!lista.length) throw new Error('No hay proveedores IA activos.');

      return buscarGenerador({
        params: params,
        proveedores: lista,
        indice: 0,
        prompt: core.construirPrompt(params),
        errores: [],
        providers: providers,
        core: core
      });
    });
  }

  function buscarGenerador(ctx) {
    var proveedor;

    if (ctx.indice >= ctx.proveedores.length) {
      throw construirErrorFinal(ctx.errores);
    }

    proveedor = ctx.proveedores[ctx.indice];

    return llamarProveedor(ctx.providers, proveedor, ctx.prompt, false, ctx.params)
      .then(function (respuesta) {
        var secciones = ctx.core.parsearRespuesta(respuesta);
        var total = ctx.core.contarTitulos(secciones);
        var reporte;
        var candidato;

        if (total !== 9) {
          ctx.errores.push({
            proveedor: obtenerId(proveedor),
            mensaje: 'No entregó exactamente 9 títulos organizados en 3 secciones.'
          });
          ctx.indice += 1;
          return buscarGenerador(ctx);
        }

        reporte = ctx.core.validarYRecomendar(secciones, ctx.params);
        candidato = crearCandidato(proveedor, reporte, false);

        /* Las mejoras menores afectan la puntuación, pero no bloquean la entrega. */
        if (reporte.apto) {
          return construirResultado(
            candidato,
            null,
            reporte.menores
              ? 'Se generaron 9 títulos válidos. Algunos tienen mejoras menores, pero puedes elegir uno en cada sección.'
              : 'Se generaron 9 títulos correctamente. Elige uno en cada sección.'
          );
        }

        return buscarRevisorDisponible({
          params: ctx.params,
          proveedores: ctx.proveedores,
          indice: ctx.indice + 1,
          base: candidato,
          errores: ctx.errores,
          providers: ctx.providers,
          core: ctx.core
        });
      }, function (errorProveedor) {
        ctx.errores.push({
          proveedor: obtenerId(proveedor),
          mensaje: limpiarError(errorProveedor)
        });
        ctx.indice += 1;
        return buscarGenerador(ctx);
      });
  }

  /*
    Busca una IA que pueda actuar como revisora. Los fallos de conexión o una
    respuesta incompleta hacen que se pruebe otro proveedor. En cuanto una IA
    devuelve una revisión completa de 9 títulos, no se consulta ninguna otra.
  */
  function buscarRevisorDisponible(ctx) {
    var proveedor;
    var promptRevision;

    if (ctx.indice >= ctx.proveedores.length) {
      return construirResultado(
        ctx.base,
        ctx.base.proveedor,
        'La revisión externa no estuvo disponible. Se conservaron los 9 títulos originales para que puedas elegir.'
      );
    }

    proveedor = ctx.proveedores[ctx.indice];
    promptRevision = ctx.core.construirPromptRevision(
      ctx.params,
      ctx.base.reporte.secciones,
      ctx.base.reporte
    );

    return llamarProveedor(ctx.providers, proveedor, promptRevision, true, ctx.params)
      .then(function (respuesta) {
        var secciones = ctx.core.parsearRespuesta(respuesta);
        var total = ctx.core.contarTitulos(secciones);
        var reporte;
        var revisado;
        var elegido;

        if (total !== 9) {
          ctx.errores.push({
            proveedor: obtenerId(proveedor),
            mensaje: 'La revisión no devolvió los 9 títulos completos.'
          });
          ctx.indice += 1;
          return buscarRevisorDisponible(ctx);
        }

        reporte = ctx.core.validarYRecomendar(secciones, ctx.params);
        revisado = crearCandidato(proveedor, reporte, true);
        elegido = esMejor(revisado, ctx.base) ? revisado : ctx.base;

        return construirResultado(
          elegido,
          ctx.base.proveedor,
          elegido === revisado
            ? 'Una segunda IA revisó los 9 títulos. Se conservó la versión con mejor evaluación; elige uno en cada sección.'
            : 'Una segunda IA revisó los títulos, pero la versión original obtuvo mejor evaluación. Elige uno en cada sección.'
        );
      }, function (errorProveedor) {
        ctx.errores.push({
          proveedor: obtenerId(proveedor),
          mensaje: limpiarError(errorProveedor)
        });
        ctx.indice += 1;
        return buscarRevisorDisponible(ctx);
      });
  }

  function llamarProveedor(servicio, proveedor, prompt, revision, params) {
    return servicio.generarTexto(proveedor, prompt, {
      timeoutMs: params.timeoutMs,
      temperatura: revision ? 0.15 : 0.3,
      maxTokens: Math.max(Number(params.maxTokens || 0), 2800),
      modoRevision: revision === true
    });
  }

  function crearCandidato(proveedor, reporte, revisado) {
    return {
      proveedor: proveedor,
      reporte: reporte,
      revisado: revisado === true
    };
  }

  function esMejor(a, b) {
    if (!b) return true;
    if (a.reporte.graves !== b.reporte.graves) {
      return a.reporte.graves < b.reporte.graves;
    }
    if (a.reporte.menores !== b.reporte.menores) {
      return a.reporte.menores < b.reporte.menores;
    }
    return a.reporte.puntajeTotal > b.reporte.puntajeTotal;
  }

  function construirResultado(candidato, proveedorGenerador, mensaje) {
    var proveedor = candidato.proveedor || {};
    var generador = proveedorGenerador || proveedor;

    return {
      ok: true,
      proveedor: obtenerId(proveedor),
      proveedorNombre: limpiar(
        proveedor.nombre || proveedor.name || obtenerId(proveedor)
      ),
      proveedorGenerador: obtenerId(generador),
      revisadoPorOtraIA: candidato.revisado === true,
      secciones: candidato.reporte.secciones,
      totalTitulos: 9,
      validacion: {
        graves: candidato.reporte.graves,
        menores: candidato.reporte.menores,
        puntajeTotal: candidato.reporte.puntajeTotal
      },
      mensaje: mensaje
    };
  }

  function validarParametros(params, firebase, providers, core) {
    var estudiante = params && params.estudiante || {};
    var propuestas = params && Array.isArray(params.propuestas) ? params.propuestas : [];
    var i;
    var propuesta;

    if (!firebase || !providers || !core) return 'Faltan módulos internos de IA.';
    if (!estudiante.cedula && !estudiante.numeroIdentificacion) return 'Primero consulta los datos del estudiante.';
    if (!estudiante.nombreCarrera && !estudiante.carrera) return 'El estudiante no tiene una carrera registrada.';
    if (propuestas.length !== 3) return 'Se necesitan las tres propuestas para generar los nueve títulos.';

    for (i = 0; i < 3; i += 1) {
      propuesta = propuestas[i] || {};
      if (!limpiar(propuesta.temaGeneral || propuesta.tema)) {
        return 'Completa el tema general de la propuesta ' + (i + 1) + '.';
      }
      if (!limpiar(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad)) {
        return 'Completa el problema o necesidad de la propuesta ' + (i + 1) + '.';
      }
      if (!limpiar(propuesta.objetivo || propuesta.objetivoGeneral)) {
        return 'Completa el objetivo de la propuesta ' + (i + 1) + '.';
      }
    }

    return '';
  }

  function construirErrorFinal(errores) {
    var mensaje = 'No fue posible obtener los 9 títulos completos con los proveedores IA activos.';
    errores = Array.isArray(errores) ? errores : [];

    if (errores.length) {
      mensaje += ' Detalle: ' + errores.map(function (item) {
        return item.proveedor + ': ' + item.mensaje;
      }).join(' | ');
    }

    return new Error(mensaje);
  }

  function obtenerId(proveedor) {
    return limpiar(proveedor && (proveedor.id || proveedor.proveedor || proveedor.provider) || 'IA');
  }

  function limpiarError(error) {
    return limpiar(error && error.message || error || 'Error de proveedor IA.').slice(0, 350);
  }

  function limpiar(valor) {
    return String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();
  }

  instalar();
})(window);
