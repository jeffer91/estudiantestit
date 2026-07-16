/*
  Orquestador IA 3x3:
  - Una IA genera 9 títulos: 3 por sección.
  - La app valida estructura y calidad.
  - Otra IA corrige los mismos 9 cuando es necesario.
  - Nunca genera títulos mediante plantillas locales.
*/
(function (window) {
  'use strict';

  window.__ESTUDIANTE_IA_SELECCION_INSTALADA__ = true;

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
      __flujoNueveTitulos: true
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

        if (reporte.perfecto) {
          return construirResultado(candidato, null, 'Se generaron 9 títulos correctamente. Elige uno en cada sección.');
        }

        return revisarConOtraIA({
          params: ctx.params,
          proveedores: ctx.proveedores,
          indice: ctx.indice + 1,
          base: candidato,
          mejor: candidato,
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

  function revisarConOtraIA(ctx) {
    var proveedor;
    var promptRevision;

    if (ctx.indice >= ctx.proveedores.length) {
      if (ctx.mejor && ctx.mejor.reporte.apto) {
        return construirResultado(
          ctx.mejor,
          ctx.base.proveedor,
          'Se conservaron los mejores 9 títulos disponibles. Revisa la recomendación de cada sección y elige.'
        );
      }
      throw construirErrorFinal(ctx.errores);
    }

    proveedor = ctx.proveedores[ctx.indice];
    promptRevision = ctx.core.construirPromptRevision(
      ctx.params,
      ctx.mejor.reporte.secciones,
      ctx.mejor.reporte
    );

    return llamarProveedor(ctx.providers, proveedor, promptRevision, true, ctx.params)
      .then(function (respuesta) {
        var secciones = ctx.core.parsearRespuesta(respuesta);
        var total = ctx.core.contarTitulos(secciones);
        var reporte;
        var candidato;

        if (total !== 9) {
          ctx.errores.push({
            proveedor: obtenerId(proveedor),
            mensaje: 'La revisión no devolvió nuevamente los 9 títulos completos.'
          });
          ctx.indice += 1;
          return revisarConOtraIA(ctx);
        }

        reporte = ctx.core.validarYRecomendar(secciones, ctx.params);
        candidato = crearCandidato(proveedor, reporte, true);

        if (esMejor(candidato, ctx.mejor)) ctx.mejor = candidato;

        if (reporte.apto) {
          return construirResultado(
            candidato,
            ctx.base.proveedor,
            'Una segunda IA revisó los 9 títulos. Elige uno en cada sección.'
          );
        }

        ctx.errores.push({
          proveedor: obtenerId(proveedor),
          mensaje: resumirReporte(reporte)
        });

        ctx.indice += 1;
        return revisarConOtraIA(ctx);
      }, function (errorProveedor) {
        ctx.errores.push({
          proveedor: obtenerId(proveedor),
          mensaje: limpiarError(errorProveedor)
        });
        ctx.indice += 1;
        return revisarConOtraIA(ctx);
      });
  }

  function llamarProveedor(servicio, proveedor, prompt, revision, params) {
    return servicio.generarTexto(proveedor, prompt, {
      timeoutMs: params.timeoutMs,
      temperatura: revision ? 0.15 : 0.3,
      maxTokens: Math.max(Number(params.maxTokens || 0), 2600)
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

  function resumirReporte(reporte) {
    var lista = reporte && Array.isArray(reporte.errores) ? reporte.errores : [];
    if (!lista.length) return 'Los títulos todavía necesitan revisión.';
    return lista.slice(0, 6).map(function (item) {
      return 'S' + item.seccion + ' T' + item.titulo + ': ' + item.mensaje;
    }).join(' ');
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
