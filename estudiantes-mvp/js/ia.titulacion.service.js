/*
  Archivo: ia.titulacion.service.js
  Ruta: estudiantes-mvp/js/ia.titulacion.service.js
  Funciones principales:
  - Coordinar la IA de Titulación.
  - Leer proveedores activos desde Firebase.
  - Intentar generar títulos con Gemini, Groq, OpenRouter o Cloudflare.
  - Validar que se obtengan exactamente 3 sugerencias limpias.
  - Forzar que las sugerencias pertenezcan a la carrera del estudiante.
  - Validar que cada título tenga entre 15 y 25 palabras.
  - Si una IA genera mal, pedirle a esa misma IA que corrija sin cortar títulos.
  - Si una IA falla, probar con la siguiente IA activa.
  - Entregar sugerencias listas para mostrarse en la pantalla estudiante.
*/
(function (window) {
  'use strict';

  var TITULO_MIN_PALABRAS = 15;
  var TITULO_MAX_PALABRAS = 25;

  var ETAPAS_FALLBACK = Object.freeze([
    {
      numero: 1,
      etapa: 'inicial',
      nombreEtapa: 'Diagnóstico inicial'
    },
    {
      numero: 2,
      etapa: 'proceso',
      nombreEtapa: 'Proceso o propuesta de mejora'
    },
    {
      numero: 3,
      etapa: 'final',
      nombreEtapa: 'Evaluación o resultado final'
    }
  ]);

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function obtenerFirebaseIA() {
    return window.EstudianteMVPFirebaseIA || null;
  }

  function obtenerPromptService() {
    return window.EstudianteMVPIAPrompt || null;
  }

  function obtenerProvidersService() {
    return window.EstudianteMVPIAProviders || null;
  }

  function generarTitulosPorPropuesta(params) {
    var validacion = validarParametros(params || {});
    var prompt;

    if (!validacion.ok) {
      return Promise.reject(new Error(validacion.mensaje));
    }

    prompt = obtenerPromptService().construirPromptTitulos(params || {});

    return obtenerFirebaseIA().listarProveedoresActivos()
      .then(function (proveedores) {
        if (!proveedores.length) {
          throw new Error('No hay proveedores IA activos en Firebase.');
        }

        return intentarProveedores({
          proveedores: proveedores,
          prompt: prompt,
          params: params || {},
          errores: []
        });
      });
  }

  function intentarProveedores(contexto) {
    var proveedor;

    contexto = contexto || {};
    contexto.proveedores = Array.isArray(contexto.proveedores) ? contexto.proveedores : [];
    contexto.errores = Array.isArray(contexto.errores) ? contexto.errores : [];

    if (!contexto.proveedores.length) {
      throw construirErrorFinal(contexto.errores);
    }

    proveedor = contexto.proveedores.shift();

    return generarYValidarConProveedor(proveedor, contexto.prompt, contexto.params)
      .then(function (resultado) {
        return resultado;
      })
      .catch(function (error) {
        contexto.errores.push({
          proveedor: proveedor.id || proveedor.proveedor || 'desconocido',
          mensaje: limpiarMensajeError(error)
        });

        return intentarProveedores(contexto);
      });
  }

  function generarYValidarConProveedor(proveedor, prompt, params) {
    var opciones = {
      timeoutMs: params.timeoutMs,
      temperatura: params.temperatura,
      maxTokens: params.maxTokens
    };

    return obtenerProvidersService().generarTexto(proveedor, prompt, opciones)
      .then(function (textoOriginal) {
        var sugerencias;

        try {
          sugerencias = convertirTextoEnSugerencias(textoOriginal, params);
        } catch (errorValidacion) {
          if (!esErrorValidacionSugerencias(errorValidacion)) {
            throw errorValidacion;
          }

          return corregirRespuestaConMismaIA({
            proveedor: proveedor,
            promptOriginal: prompt,
            textoOriginal: textoOriginal,
            params: params,
            motivo: errorValidacion.message
          });
        }

        return construirResultadoProveedor(proveedor, sugerencias, textoOriginal, false);
      });
  }

  function corregirRespuestaConMismaIA(contextoCorreccion) {
    var proveedor = contextoCorreccion.proveedor;
    var params = contextoCorreccion.params || {};
    var promptCorreccion = construirPromptCorreccionSugerencias(contextoCorreccion);
    var opciones = {
      timeoutMs: params.timeoutMs,
      temperatura: 0.2,
      maxTokens: params.maxTokens
    };

    return obtenerProvidersService().generarTexto(proveedor, promptCorreccion, opciones)
      .then(function (textoCorregido) {
        var sugerenciasCorregidas = convertirTextoEnSugerencias(textoCorregido, params);

        return construirResultadoProveedor(proveedor, sugerenciasCorregidas, textoCorregido, true);
      });
  }

  function construirResultadoProveedor(proveedor, sugerencias, textoOriginal, fueCorregido) {
    if (!Array.isArray(sugerencias) || sugerencias.length !== 3) {
      throw crearErrorValidacionSugerencias(
        'El proveedor ' + (proveedor.id || proveedor.proveedor || 'IA') +
        ' no devolvió exactamente 3 títulos limpios.'
      );
    }

    return {
      ok: true,
      proveedor: proveedor.id,
      proveedorNombre: proveedor.nombre || proveedor.id,
      sugerencias: sugerencias,
      textoOriginal: textoOriginal,
      corregidoPorIA: fueCorregido === true,
      mensaje: fueCorregido
        ? 'Se generaron 3 sugerencias corregidas por IA correctamente.'
        : 'Se generaron 3 sugerencias de titulación correctamente.'
    };
  }

  function validarParametros(params) {
    var utils = obtenerUtils();
    var estudiante = params.estudiante || {};
    var propuesta = params.propuesta || {};

    if (!utils || !obtenerFirebaseIA() || !obtenerPromptService() || !obtenerProvidersService()) {
      return {
        ok: false,
        mensaje: 'Faltan módulos internos para usar la IA de Titulación.'
      };
    }

    if (!estudiante.cedula && !estudiante.numeroIdentificacion) {
      return {
        ok: false,
        mensaje: 'Primero consulta y carga los datos del estudiante.'
      };
    }

    if (!estudiante.nombreCarrera && !estudiante.carrera) {
      return {
        ok: false,
        mensaje: 'El estudiante no tiene carrera registrada. La IA necesita la carrera para generar títulos.'
      };
    }

    if (!utils.limpiarTexto(propuesta.temaGeneral || propuesta.tema)) {
      return {
        ok: false,
        mensaje: 'Completa el tema general de la propuesta antes de activar la IA.'
      };
    }

    if (!utils.limpiarTexto(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad)) {
      return {
        ok: false,
        mensaje: 'Completa el problema o necesidad antes de activar la IA.'
      };
    }

    return {
      ok: true,
      mensaje: 'Datos listos para generar títulos.'
    };
  }

  function convertirTextoEnSugerencias(texto, params) {
    var json = extraerJson(texto);
    var lista;
    var sugerenciasNormalizadas;

    if (json && Array.isArray(json.sugerencias)) {
      lista = json.sugerencias;
    } else if (Array.isArray(json)) {
      lista = json;
    } else {
      lista = extraerSugerenciasDesdeTextoPlano(texto);
    }

    sugerenciasNormalizadas = normalizarSugerencias(lista);

    if (!params || (!params.estudiante && !params.propuesta)) {
      return sugerenciasNormalizadas;
    }

    return validarSugerenciasFinales(sugerenciasNormalizadas, params || {});
  }

  function extraerJson(texto) {
    var limpio = limpiarBloquesCodigo(texto);
    var inicioObjeto;
    var finObjeto;
    var inicioArray;
    var finArray;
    var posible;

    try {
      return JSON.parse(limpio);
    } catch (errorDirecto) {
      // Continuar con extracción parcial.
    }

    inicioObjeto = limpio.indexOf('{');
    finObjeto = limpio.lastIndexOf('}');

    if (inicioObjeto >= 0 && finObjeto > inicioObjeto) {
      posible = limpio.slice(inicioObjeto, finObjeto + 1);

      try {
        return JSON.parse(posible);
      } catch (errorObjeto) {
        // Continuar con array.
      }
    }

    inicioArray = limpio.indexOf('[');
    finArray = limpio.lastIndexOf(']');

    if (inicioArray >= 0 && finArray > inicioArray) {
      posible = limpio.slice(inicioArray, finArray + 1);

      try {
        return JSON.parse(posible);
      } catch (errorArray) {
        return null;
      }
    }

    return null;
  }

  function limpiarBloquesCodigo(texto) {
    return String(texto || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```$/i, '')
      .trim();
  }

  function extraerSugerenciasDesdeTextoPlano(texto) {
    var utils = obtenerUtils();
    var lineas = String(texto || '').split(/\n+/);
    var sugerencias = [];

    lineas.forEach(function (linea) {
      var limpia = utils.limpiarTexto(linea)
        .replace(/^\s*[-*•]\s*/g, '')
        .replace(/^\s*\d+[).:-]\s*/g, '')
        .replace(/^Título\s*\d*\s*[:.-]\s*/i, '')
        .trim();

      if (limpia && limpia.length > 18 && sugerencias.length < 3) {
        sugerencias.push({
          titulo: limpia
        });
      }
    });

    return sugerencias;
  }

  function normalizarSugerencias(lista) {
    var utils = obtenerUtils();
    var usadas = {};
    var salida = [];

    if (!Array.isArray(lista)) {
      lista = [];
    }

    lista.forEach(function (item, index) {
      var etapa = ETAPAS_FALLBACK[index] || ETAPAS_FALLBACK[salida.length] || {};
      var titulo;
      var clave;

      if (salida.length >= 3) {
        return;
      }

      if (typeof item === 'string') {
        titulo = item;
        item = {};
      } else {
        item = item || {};
        titulo = item.titulo || item.tituloFinal || item.texto || item.title || '';
      }

      titulo = utils.limpiarTitulo(titulo);

      if (!titulo || titulo.length < 18) {
        return;
      }

      clave = utils.normalizarClave(titulo);

      if (usadas[clave]) {
        return;
      }

      usadas[clave] = true;

      salida.push({
        numero: Number(item.numero || etapa.numero || salida.length + 1),
        etapa: utils.limpiarTexto(item.etapa || etapa.etapa || ''),
        nombreEtapa: utils.limpiarTexto(item.nombreEtapa || etapa.nombreEtapa || ''),
        titulo: titulo,
        justificacion: utils.limpiarTexto(item.justificacion || item.explicacion || item.motivo || '')
      });
    });

    return salida.map(function (item, index) {
      var etapa = ETAPAS_FALLBACK[index] || {};

      return {
        numero: index + 1,
        etapa: item.etapa || etapa.etapa,
        nombreEtapa: item.nombreEtapa || etapa.nombreEtapa,
        titulo: item.titulo,
        justificacion: item.justificacion || 'Título sugerido para la etapa ' + (etapa.nombreEtapa || index + 1) + '.'
      };
    });
  }

  function validarSugerenciasFinales(sugerencias, params) {
    var promptService = obtenerPromptService();
    var contexto;
    var perfil;
    var errores = [];

    sugerencias = Array.isArray(sugerencias) ? sugerencias : [];

    if (sugerencias.length !== 3) {
      throw crearErrorValidacionSugerencias('La IA no devolvió exactamente 3 títulos.');
    }

    if (!promptService || typeof promptService.normalizarContexto !== 'function') {
      validarCantidadPalabrasSolamente(sugerencias);
      return sugerencias;
    }

    contexto = promptService.normalizarContexto(params || {});
    perfil = construirPerfilCarrera(contexto.estudiante.carrera);

    sugerencias.forEach(function (sugerencia, index) {
      var titulo = sugerencia && sugerencia.titulo ? sugerencia.titulo : '';
      var palabras = contarPalabrasTitulo(titulo);

      if (palabras < TITULO_MIN_PALABRAS || palabras > TITULO_MAX_PALABRAS) {
        errores.push(
          'Título ' + (index + 1) + ' tiene ' + palabras + ' palabras. Debe tener entre ' +
          TITULO_MIN_PALABRAS + ' y ' + TITULO_MAX_PALABRAS + '.'
        );
      }

      if (debeValidarCarrera(perfil) && !tituloPerteneceALaCarrera(titulo, perfil)) {
        errores.push(
          'Título ' + (index + 1) + ' no pertenece claramente a la carrera ' + perfil.carrera + '.'
        );
      }
    });

    if (errores.length) {
      throw crearErrorValidacionSugerencias(errores[0]);
    }

    return sugerencias;
  }

  function validarCantidadPalabrasSolamente(sugerencias) {
    sugerencias.forEach(function (sugerencia, index) {
      var titulo = sugerencia && sugerencia.titulo ? sugerencia.titulo : '';
      var palabras = contarPalabrasTitulo(titulo);

      if (palabras < TITULO_MIN_PALABRAS || palabras > TITULO_MAX_PALABRAS) {
        throw crearErrorValidacionSugerencias(
          'Título ' + (index + 1) + ' tiene ' + palabras + ' palabras. Debe tener entre ' +
          TITULO_MIN_PALABRAS + ' y ' + TITULO_MAX_PALABRAS + '.'
        );
      }
    });
  }

  function contarPalabrasTitulo(titulo) {
    var limpio = String(titulo || '')
      .replace(/[“”"']/g, ' ')
      .replace(/[.,;:¿?¡!()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!limpio) {
      return 0;
    }

    return limpio.split(' ').filter(function (palabra) {
      return palabra && palabra.trim();
    }).length;
  }

  function construirPromptCorreccionSugerencias(contextoCorreccion) {
    var promptService = obtenerPromptService();
    var contexto = promptService.normalizarContexto(contextoCorreccion.params || {});
    var respuestaAnterior = limitarTexto(contextoCorreccion.textoOriginal || '', 2600);
    var motivo = contextoCorreccion.motivo || 'La respuesta no cumple las reglas.';
    var resumenDatos = construirResumenDatosParaCorreccion(contexto);

    return [
      'Tu respuesta anterior fue rechazada por esta razón:',
      motivo,
      '',
      'Debes corregirla sin explicar nada fuera del JSON.',
      '',
      'REGLAS OBLIGATORIAS PARA LA CORRECCIÓN:',
      '1. Devuelve exactamente 3 títulos.',
      '2. Cada título debe tener mínimo ' + TITULO_MIN_PALABRAS + ' palabras y máximo ' + TITULO_MAX_PALABRAS + ' palabras.',
      '3. No cortes títulos. Reescribe cada título completo, claro y académico.',
      '4. Todos los títulos deben pertenecer claramente a la carrera: ' + contexto.estudiante.carrera + '.',
      '5. Usa el tema del estudiante solo como contexto de aplicación.',
      '6. No generes títulos de otra carrera.',
      '7. No inventes instituciones, fechas, lugares ni poblaciones nuevas.',
      '8. Responde únicamente JSON válido, sin markdown.',
      '',
      resumenDatos,
      '',
      'RESPUESTA ANTERIOR A CORREGIR:',
      respuestaAnterior,
      '',
      'FORMATO EXACTO:',
      '{',
      '  "sugerencias": [',
      '    {',
      '      "numero": 1,',
      '      "etapa": "inicial",',
      '      "nombreEtapa": "Diagnóstico inicial",',
      '      "titulo": "Título corregido de 15 a 25 palabras",',
      '      "justificacion": "Breve justificación"',
      '    },',
      '    {',
      '      "numero": 2,',
      '      "etapa": "proceso",',
      '      "nombreEtapa": "Proceso o propuesta de mejora",',
      '      "titulo": "Título corregido de 15 a 25 palabras",',
      '      "justificacion": "Breve justificación"',
      '    },',
      '    {',
      '      "numero": 3,',
      '      "etapa": "final",',
      '      "nombreEtapa": "Evaluación o resultado final",',
      '      "titulo": "Título corregido de 15 a 25 palabras",',
      '      "justificacion": "Breve justificación"',
      '    }',
      '  ]',
      '}'
    ].join('\n');
  }

  function construirResumenDatosParaCorreccion(contexto) {
    return [
      'DATOS QUE DEBES RESPETAR:',
      '- Carrera: ' + contexto.estudiante.carrera,
      '- Código de carrera: ' + contexto.estudiante.codigoCarrera,
      '- Modalidad: ' + contexto.estudiante.modalidadDetectada,
      '- Tema general: ' + contexto.propuesta.temaGeneral,
      '- Lugar o contexto: ' + contexto.propuesta.lugarContexto,
      '- Grupo de estudio: ' + contexto.propuesta.grupoEstudio,
      '- Problema o necesidad: ' + contexto.propuesta.problemaNecesidad,
      '- Objetivo: ' + contexto.propuesta.objetivo,
      '- Año o período: ' + contexto.propuesta.anioPeriodo
    ].join('\n');
  }

  function limitarTexto(texto, maximo) {
    texto = String(texto || '');

    if (texto.length <= maximo) {
      return texto;
    }

    return texto.slice(0, maximo) + '...';
  }

  function crearErrorValidacionSugerencias(mensaje) {
    var error = new Error(mensaje || 'La respuesta de la IA no cumple las reglas de títulos.');

    error.esValidacionSugerencias = true;

    return error;
  }

  function esErrorValidacionSugerencias(error) {
    return !!(error && error.esValidacionSugerencias === true);
  }

  function debeValidarCarrera(perfil) {
    var utils = obtenerUtils();
    var clave;

    if (!perfil || !perfil.carrera) {
      return false;
    }

    clave = utils.normalizarClave(perfil.carrera);

    return !!clave && clave !== 'no_especificado' && perfil.tipo !== 'sin_carrera';
  }

  function construirPerfilCarrera(carrera) {
    var utils = obtenerUtils();
    var carreraLimpia = utils.limpiarTexto(carrera);
    var clave = utils.normalizarClave(carreraLimpia);

    if (!clave || clave === 'no_especificado') {
      return {
        tipo: 'sin_carrera',
        carrera: '',
        area: '',
        terminos: []
      };
    }

    if (/desarrollo|software|sistemas|informatica|programacion|computacion|tecnologia/.test(clave)) {
      return {
        tipo: 'software',
        carrera: carreraLimpia,
        area: 'Desarrollo de Software',
        terminos: [
          'software',
          'aplicación',
          'aplicacion',
          'aplicación web',
          'aplicacion web',
          'plataforma',
          'plataforma digital',
          'sistema',
          'sistema web',
          'sistema informático',
          'sistema informatico',
          'herramienta digital',
          'prototipo',
          'prototipo de software',
          'automatización',
          'automatizacion',
          'base de datos',
          'módulo',
          'modulo',
          'gestión de datos',
          'gestion de datos',
          'interfaz',
          'usabilidad'
        ]
      };
    }

    if (/contabilidad|contable|finanzas|financiera|tributaria|auditoria/.test(clave)) {
      return {
        tipo: 'contabilidad',
        carrera: carreraLimpia,
        area: 'Contabilidad',
        terminos: [
          'contable',
          'contabilidad',
          'tributario',
          'tributaria',
          'financiero',
          'financiera',
          'costos',
          'auditoría',
          'auditoria',
          'estados financieros',
          'obligaciones tributarias'
        ]
      };
    }

    if (/administracion|empresas|gestion_empresarial|talento_humano/.test(clave)) {
      return {
        tipo: 'administracion',
        carrera: carreraLimpia,
        area: 'Administración',
        terminos: [
          'administrativo',
          'administrativa',
          'administración',
          'administracion',
          'gestión empresarial',
          'gestion empresarial',
          'procesos',
          'organización',
          'organizacion',
          'planificación',
          'planificacion',
          'talento humano'
        ]
      };
    }

    if (/marketing|mercadotecnia|publicidad|comercial/.test(clave)) {
      return {
        tipo: 'marketing',
        carrera: carreraLimpia,
        area: 'Marketing',
        terminos: [
          'marketing',
          'mercado',
          'marca',
          'consumidor',
          'ventas',
          'publicidad',
          'redes sociales',
          'estrategia comercial'
        ]
      };
    }

    if (/educacion|pedagogia|docencia|ensenanza|aprendizaje|basica/.test(clave)) {
      return {
        tipo: 'educacion',
        carrera: carreraLimpia,
        area: 'Educación',
        terminos: [
          'educación',
          'educacion',
          'educación básica',
          'educacion basica',
          'básica',
          'basica',
          'educativo',
          'educativa',
          'enseñanza',
          'ensenanza',
          'aprendizaje',
          'didáctica',
          'didactica',
          'pedagógico',
          'pedagogico',
          'aula',
          'primaria',
          'estudiantes',
          'modelo educativo'
        ]
      };
    }

    return {
      tipo: 'generico',
      carrera: carreraLimpia || 'la carrera del estudiante',
      area: carreraLimpia || 'la carrera del estudiante',
      terminos: obtenerTerminosGenericosCarrera(carreraLimpia)
    };
  }

  function tituloPerteneceALaCarrera(titulo, perfil) {
    var utils = obtenerUtils();
    var texto = utils.normalizarClave(titulo || '');
    var i;
    var termino;

    if (!texto || !perfil) {
      return false;
    }

    if (perfil.tipo === 'software') {
      return /software|aplicacion|aplicacion_web|plataforma|plataforma_digital|sistema|sistema_web|sistema_informatico|herramienta_digital|prototipo|prototipo_de_software|automatizacion|base_de_datos|modulo|gestion_de_datos|interfaz|usabilidad/.test(texto);
    }

    for (i = 0; i < perfil.terminos.length; i += 1) {
      termino = utils.normalizarClave(perfil.terminos[i]);

      if (termino && texto.indexOf(termino) >= 0) {
        return true;
      }
    }

    return false;
  }

  function obtenerTerminosGenericosCarrera(carrera) {
    var utils = obtenerUtils();
    var palabras = utils.limpiarTexto(carrera)
      .split(/\s+/)
      .filter(function (palabra) {
        palabra = utils.normalizarClave(palabra);
        return palabra.length > 3 &&
          palabra !== 'online' &&
          palabra !== 'presencial' &&
          palabra !== 'carrera';
      });

    return palabras.length ? palabras : [carrera || 'carrera'];
  }

  function construirErrorFinal(errores) {
    var mensaje = 'No se pudieron generar las 3 sugerencias con los proveedores IA activos.';

    errores = Array.isArray(errores) ? errores : [];

    if (errores.length) {
      mensaje += ' Detalle: ' + errores.map(function (item) {
        return (item.proveedor || 'proveedor') + ': ' + item.mensaje;
      }).join(' | ');
    }

    return new Error(mensaje);
  }

  function limpiarMensajeError(error) {
    var utils = obtenerUtils();
    var mensaje = utils
      ? utils.obtenerMensajeError(error, 'Error de proveedor IA.')
      : String(error || 'Error de proveedor IA.');

    return String(mensaje)
      .replace(/key=[^\s&]+/ig, 'key=***')
      .replace(/api[_-]?key[^\s&]+/ig, 'apiKey=***')
      .replace(/Bearer\s+[^\s]+/ig, 'Bearer ***')
      .replace(/token[=:][^\s&]+/ig, 'token=***')
      .slice(0, 300);
  }

  function probarIA() {
    return generarTitulosPorPropuesta({
      estudiante: {
        cedula: '0000000000',
        nombres: 'ESTUDIANTE DE PRUEBA',
        nombreCarrera: 'CONTABILIDAD ONLINE',
        codigoCarrera: 'PRUEBA',
        sede: 'Matriz',
        modalidadDetectada: 'ONLINE',
        periodoId: '2026-02__2026-08',
        periodoLabel: 'Febrero 2026 a Agosto 2026'
      },
      propuesta: {
        numero: 1,
        titulo: 'Cumplimiento de obligaciones tributarias en una empresa comercial',
        temaGeneral: 'Cumplimiento tributario',
        lugarContexto: 'Empresa comercial',
        grupoEstudio: 'Área contable de la empresa',
        problemaNecesidad: 'La empresa presenta errores y retrasos en sus obligaciones tributarias.',
        objetivo: 'Proponer mejoras para fortalecer el cumplimiento tributario.',
        anioPeriodo: '2026'
      }
    });
  }

  window.EstudianteMVPIATitulacion = Object.freeze({
    generarTitulosPorPropuesta: generarTitulosPorPropuesta,
    generarTresTitulos: generarTitulosPorPropuesta,
    convertirTextoEnSugerencias: convertirTextoEnSugerencias,
    validarParametros: validarParametros,
    probarIA: probarIA
  });
})(window);