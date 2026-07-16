/*
  Núcleo IA 3x3:
  - Construye un único prompt de 9 títulos.
  - Interpreta 3 secciones con 3 títulos cada una.
  - Distingue errores graves y mejoras menores.
  - Puntúa y marca una recomendación por sección.
*/
(function (window) {
  'use strict';

  var ETAPAS = [
    {
      numero: 1,
      codigo: 'diagnostico_inicial',
      nombre: 'Diagnóstico inicial',
      orientacion: 'Identificar, analizar, caracterizar o diagnosticar la situación inicial sin afirmar que una solución ya fue aplicada.',
      verbos: /diagnostico|analisis|identificacion|caracterizacion|determinacion|evaluacion_inicial/
    },
    {
      numero: 2,
      codigo: 'propuesta_mejora',
      nombre: 'Propuesta o mejora',
      orientacion: 'Diseñar, proponer, optimizar o plantear una mejora viable sin afirmar que ya fue ejecutada.',
      verbos: /propuesta|diseno|plan|estrategia|modelo|optimizacion|mejora|desarrollo/
    },
    {
      numero: 3,
      codigo: 'evaluacion_resultado',
      nombre: 'Evaluación o resultado esperado',
      orientacion: 'Evaluar, valorar o analizar resultados esperados sin inventar resultados reales ni afirmar que ya fueron obtenidos.',
      verbos: /evaluacion|valoracion|analisis|impacto|efectividad|resultado|estimacion/
    }
  ];

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

  function contarPalabras(valor) {
    var limpio = String(valor || '')
      .replace(/[“”"'.,;:¿?¡!()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return limpio ? limpio.split(' ').filter(Boolean).length : 0;
  }

  function obtenerContexto(params, numero) {
    var prompt = window.EstudianteMVPIAPrompt;
    var estudiante = params && params.estudiante || {};
    var propuestas = params && Array.isArray(params.propuestas) ? params.propuestas : [];
    var propuesta = propuestas[numero - 1] || {};

    if (prompt && typeof prompt.normalizarContexto === 'function') {
      return prompt.normalizarContexto({
        estudiante: estudiante,
        propuesta: propuesta,
        numeroPropuesta: numero
      });
    }

    return {
      estudiante: {
        nombres: limpiar(estudiante.nombres),
        carrera: limpiar(estudiante.nombreCarrera || estudiante.carrera),
        codigoCarrera: limpiar(estudiante.codigoCarrera),
        sede: limpiar(estudiante.sede),
        periodoLabel: limpiar(estudiante.periodoLabel)
      },
      propuesta: {
        numero: numero,
        tituloBase: limpiar(propuesta.tituloFinal || propuesta.titulo),
        temaGeneral: limpiar(propuesta.temaGeneral || propuesta.tema),
        lugarContexto: limpiar(propuesta.lugarContexto || propuesta.contexto),
        grupoEstudio: limpiar(propuesta.grupoEstudio || propuesta.grupo),
        problemaNecesidad: limpiar(propuesta.problemaNecesidad || propuesta.problema),
        objetivo: limpiar(propuesta.objetivo),
        anioPeriodo: limpiar(propuesta.anioPeriodo || propuesta.periodo)
      }
    };
  }

  function construirPrompt(params) {
    var ctx1 = obtenerContexto(params, 1);
    var ctx2 = obtenerContexto(params, 2);
    var ctx3 = obtenerContexto(params, 3);
    var carrera = ctx1.estudiante.carrera || 'la carrera del estudiante';

    return [
      'Actúa como especialista en titulación académica de educación superior.',
      'Debes generar EXACTAMENTE 9 títulos: 3 para cada una de las 3 secciones.',
      '',
      'REGLAS OBLIGATORIAS:',
      '1. Cada título debe tener entre 20 y 30 palabras.',
      '2. Usa únicamente la información entregada. No inventes empresas, lugares, poblaciones, fechas, intervenciones ni resultados.',
      '3. Los títulos deben relacionarse claramente con la carrera: ' + carrera + '.',
      '4. Cada sección debe conservar su propio tema, problema, objetivo, contexto, grupo y período.',
      '5. Los 3 títulos de una sección deben ser distintos entre sí, pero abordar la misma propuesta.',
      '6. No mezcles datos entre las tres secciones.',
      '7. No afirmes que algo fue implementado, ejecutado o demostrado si el estudiante no lo indicó.',
      '8. Responde únicamente JSON válido, sin markdown ni explicaciones externas.',
      '',
      construirBloqueContexto(ctx1, ETAPAS[0]),
      '',
      construirBloqueContexto(ctx2, ETAPAS[1]),
      '',
      construirBloqueContexto(ctx3, ETAPAS[2]),
      '',
      'FORMATO JSON OBLIGATORIO:',
      '{"secciones":[',
      '{"seccion":1,"etapa":"diagnostico_inicial","titulos":[',
      '{"numero":1,"titulo":"...","justificacion":"..."},',
      '{"numero":2,"titulo":"...","justificacion":"..."},',
      '{"numero":3,"titulo":"...","justificacion":"..."}]},',
      '{"seccion":2,"etapa":"propuesta_mejora","titulos":[',
      '{"numero":1,"titulo":"...","justificacion":"..."},',
      '{"numero":2,"titulo":"...","justificacion":"..."},',
      '{"numero":3,"titulo":"...","justificacion":"..."}]},',
      '{"seccion":3,"etapa":"evaluacion_resultado","titulos":[',
      '{"numero":1,"titulo":"...","justificacion":"..."},',
      '{"numero":2,"titulo":"...","justificacion":"..."},',
      '{"numero":3,"titulo":"...","justificacion":"..."}]}',
      ']}',
      'Antes de responder, verifica que existan exactamente 3 secciones y exactamente 3 títulos en cada sección.'
    ].join('\n');
  }

  function construirBloqueContexto(contexto, etapa) {
    var p = contexto.propuesta || {};
    return [
      'SECCIÓN ' + etapa.numero + ' — ' + etapa.nombre + ':',
      '- Orientación: ' + etapa.orientacion,
      '- Tema general: ' + (p.temaGeneral || 'No especificado'),
      '- Lugar o contexto: ' + (p.lugarContexto || 'No especificado'),
      '- Grupo de estudio: ' + (p.grupoEstudio || 'No especificado'),
      '- Problema o necesidad: ' + (p.problemaNecesidad || 'No especificado'),
      '- Objetivo: ' + (p.objetivo || 'No especificado'),
      '- Año o período: ' + (p.anioPeriodo || 'No especificado')
    ].join('\n');
  }

  function construirPromptRevision(params, secciones, reporte) {
    var errores = reporte && Array.isArray(reporte.errores) ? reporte.errores : [];
    var problemas = errores.length
      ? errores.map(function (item) {
          return '- Sección ' + item.seccion + ', título ' + item.titulo + ': ' + item.mensaje;
        }).join('\n')
      : '- Mejora la claridad académica sin alterar los datos.';

    return [
      'Actúa como revisor académico final.',
      'Otra IA generó exactamente 9 títulos, organizados en 3 secciones de 3 títulos.',
      'Corrige SOLO los títulos señalados con problemas. Copia sin cambios los títulos que no aparecen en la lista de problemas.',
      'Debes devolver nuevamente los 9 títulos completos, en las mismas secciones y en el mismo orden.',
      'No inventes ni cambies tema, problema, objetivo, lugar, grupo, período o carrera.',
      'Cada título debe tener entre 20 y 30 palabras.',
      '',
      'PROBLEMAS DETECTADOS:',
      problemas,
      '',
      'TÍTULOS QUE DEBES REVISAR:',
      JSON.stringify({ secciones: secciones }),
      '',
      'CONTEXTO ORIGINAL:',
      construirPrompt(params),
      '',
      'Responde únicamente JSON válido con la misma estructura de 3 secciones y 3 títulos por sección.'
    ].join('\n');
  }

  function extraerJson(texto) {
    var limpio = String(texto || '')
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    var inicio;
    var fin;

    try { return JSON.parse(limpio); } catch (e1) {}

    inicio = limpio.indexOf('{');
    fin = limpio.lastIndexOf('}');
    if (inicio >= 0 && fin > inicio) {
      try { return JSON.parse(limpio.slice(inicio, fin + 1)); } catch (e2) {}
    }

    inicio = limpio.indexOf('[');
    fin = limpio.lastIndexOf(']');
    if (inicio >= 0 && fin > inicio) {
      try { return JSON.parse(limpio.slice(inicio, fin + 1)); } catch (e3) {}
    }

    return null;
  }

  function obtenerLista(objeto, claves) {
    var encontrada = [];
    if (Array.isArray(objeto)) return objeto;
    if (!objeto || typeof objeto !== 'object') return [];

    claves.some(function (clave) {
      if (Array.isArray(objeto[clave])) {
        encontrada = objeto[clave];
        return true;
      }
      return false;
    });

    return encontrada;
  }

  function parsearRespuesta(texto) {
    var json = extraerJson(texto);
    var seccionesRaw = obtenerLista(json, ['secciones', 'sections', 'bloques']);
    var salida;

    if (seccionesRaw.length) {
      salida = seccionesRaw.map(function (seccion, index) {
        return normalizarSeccion(seccion, index + 1);
      });
    } else {
      salida = normalizarListaPlana(
        obtenerLista(json, ['sugerencias', 'titulos', 'títulos', 'titles', 'opciones', 'propuestas', 'alternativas'])
      );
    }

    if (!salida.length) {
      salida = normalizarListaPlana(extraerTextoPlano(texto));
    }

    return completarEstructura(salida);
  }

  function normalizarSeccion(seccion, fallback) {
    var numero = Number(seccion && (seccion.seccion || seccion.numero || seccion.section) || fallback);
    var lista = obtenerLista(seccion, ['titulos', 'títulos', 'sugerencias', 'titles', 'opciones', 'alternativas']);
    return crearSeccion(numero, lista);
  }

  function normalizarListaPlana(lista) {
    var grupos = [[], [], []];
    lista = Array.isArray(lista) ? lista : [];

    lista.forEach(function (item, index) {
      var seccion = Number(item && (item.seccion || item.section || item.bloque) || 0);
      if (seccion < 1 || seccion > 3) seccion = Math.floor(index / 3) + 1;
      if (seccion >= 1 && seccion <= 3 && grupos[seccion - 1].length < 3) {
        grupos[seccion - 1].push(item);
      }
    });

    return grupos.map(function (grupo, index) {
      return crearSeccion(index + 1, grupo);
    });
  }

  function crearSeccion(numero, lista) {
    var etapa = ETAPAS[numero - 1] || ETAPAS[0];
    var usadas = {};
    var titulos = [];

    (Array.isArray(lista) ? lista : []).forEach(function (item) {
      var objeto = typeof item === 'string' ? { titulo: item } : item || {};
      var titulo = limpiar(
        objeto.titulo || objeto.título || objeto.title || objeto.texto || objeto.text || objeto.propuesta || ''
      ).replace(/^[“”"']+|[“”"']+$/g, '');
      var clave = normalizar(titulo);

      if (!titulo || titulo.length < 18 || usadas[clave] || titulos.length >= 3) return;
      usadas[clave] = true;
      titulos.push({
        numero: titulos.length + 1,
        titulo: titulo,
        justificacion: limpiar(objeto.justificacion || objeto.razon || objeto.explicacion || objeto.motivo || '')
      });
    });

    return {
      seccion: numero,
      etapa: etapa.codigo,
      nombreEtapa: etapa.nombre,
      titulos: titulos
    };
  }

  function completarEstructura(secciones) {
    var mapa = {};
    (Array.isArray(secciones) ? secciones : []).forEach(function (seccion) {
      if (seccion && seccion.seccion >= 1 && seccion.seccion <= 3) mapa[seccion.seccion] = seccion;
    });
    return [1, 2, 3].map(function (numero) {
      return mapa[numero] || crearSeccion(numero, []);
    });
  }

  function extraerTextoPlano(texto) {
    var lista = [];
    String(texto || '').split(/\n+/).forEach(function (linea) {
      var titulo = limpiar(linea)
        .replace(/^[-*•]\s*/, '')
        .replace(/^\d+\s*[).:-]\s*/, '')
        .replace(/^t[ií]tulo\s*\d*\s*[:.-]\s*/i, '');
      if (titulo.length >= 25 && lista.length < 9) lista.push({ titulo: titulo });
    });
    return lista;
  }

  function validarYRecomendar(secciones, params) {
    var errores = [];
    var graves = 0;
    var menores = 0;
    var total = 0;
    var usadasGlobal = {};
    var normalizadas = completarEstructura(secciones).map(function (seccion) {
      var etapa = ETAPAS[seccion.seccion - 1];
      var contexto = obtenerContexto(params, seccion.seccion);
      var titulos = seccion.titulos.map(function (item, index) {
        var evaluacion = evaluarTitulo(item.titulo, contexto, etapa);
        var clave = normalizar(item.titulo);

        if (usadasGlobal[clave]) {
          evaluacion.graves.push('El título está repetido en otra sección.');
          evaluacion.puntaje -= 40;
        }
        usadasGlobal[clave] = true;

        evaluacion.graves.forEach(function (mensaje) {
          errores.push({ seccion: seccion.seccion, titulo: index + 1, nivel: 'grave', mensaje: mensaje });
          graves += 1;
        });
        evaluacion.menores.forEach(function (mensaje) {
          errores.push({ seccion: seccion.seccion, titulo: index + 1, nivel: 'menor', mensaje: mensaje });
          menores += 1;
        });
        total += evaluacion.puntaje;

        return {
          numero: index + 1,
          titulo: item.titulo,
          justificacion: item.justificacion,
          puntaje: evaluacion.puntaje,
          recomendada: false,
          recomendado: false
        };
      });

      if (titulos.length !== 3) {
        errores.push({
          seccion: seccion.seccion,
          titulo: 0,
          nivel: 'grave',
          mensaje: 'La sección debe contener exactamente 3 títulos.'
        });
        graves += 1;
      }

      marcarRecomendada(titulos);
      return {
        seccion: seccion.seccion,
        etapa: etapa.codigo,
        nombreEtapa: etapa.nombre,
        titulos: titulos
      };
    });

    return {
      secciones: normalizadas,
      errores: errores,
      graves: graves,
      menores: menores,
      puntajeTotal: total,
      apto: graves === 0,
      perfecto: graves === 0 && menores === 0
    };
  }

  function evaluarTitulo(titulo, contexto, etapa) {
    var p = contexto.propuesta || {};
    var carrera = contexto.estudiante && contexto.estudiante.carrera || '';
    var clave = normalizar(titulo);
    var palabras = contarPalabras(titulo);
    var puntaje = 0;
    var graves = [];
    var menores = [];
    var relevancia = 0;

    relevancia += coincidencia(titulo, p.temaGeneral, 24);
    relevancia += coincidencia(titulo, p.problemaNecesidad, 20);
    relevancia += coincidencia(titulo, p.objetivo, 16);
    relevancia += coincidencia(titulo, p.lugarContexto, 10);
    relevancia += coincidencia(titulo, p.grupoEstudio, 8);
    relevancia += coincidencia(titulo, p.anioPeriodo, 6);
    relevancia += coincidencia(titulo, carrera, 10);
    puntaje += relevancia;

    if (palabras >= 20 && palabras <= 30) puntaje += 20;
    else if (palabras >= 18 && palabras <= 32) {
      puntaje += 10;
      menores.push('Ajusta ligeramente la extensión al rango de 20 a 30 palabras.');
    } else {
      graves.push('La extensión debe aproximarse al rango de 20 a 30 palabras.');
      puntaje -= 25;
    }

    if (etapa.verbos.test(clave)) puntaje += 15;
    else menores.push('Debe reflejar con mayor claridad el enfoque de ' + etapa.nombre + '.');

    if (/no_especificado|titulo_academico|primera_alternativa|segunda_alternativa|tercera_alternativa/.test(clave)) {
      graves.push('Contiene texto genérico o datos no especificados.');
      puntaje -= 35;
    }

    if (relevancia < 7) {
      menores.push('Debe relacionarse con mayor claridad con los datos ingresados.');
      puntaje -= 10;
    }

    return { puntaje: puntaje, graves: graves, menores: menores };
  }

  function coincidencia(titulo, dato, maximo) {
    var ignorar = {
      para: 1, como: 1, con: 1, del: 1, las: 1, los: 1, una: 1,
      por: 1, que: 1, sin: 1, durante: 1, mediante: 1, sobre: 1,
      no: 1, especificado: 1, objetivo: 1, problema: 1
    };
    var tituloNorm = normalizar(titulo).split('_');
    var terminos = normalizar(dato).split('_').filter(function (palabra) {
      return palabra.length >= 4 && !ignorar[palabra];
    });
    var encontrados = 0;

    terminos.forEach(function (termino) {
      if (tituloNorm.indexOf(termino) >= 0) encontrados += 1;
    });
    if (!terminos.length) return 0;
    return Math.min(maximo, encontrados / Math.min(terminos.length, 5) * maximo);
  }

  function marcarRecomendada(titulos) {
    var mejor = -1;
    titulos.forEach(function (item, index) {
      if (mejor < 0 || item.puntaje > titulos[mejor].puntaje) mejor = index;
    });
    titulos.forEach(function (item, index) {
      item.recomendada = index === mejor;
      item.recomendado = index === mejor;
      if (!item.justificacion) {
        item.justificacion = index === mejor
          ? 'Recomendada por su mayor relación con los datos de esta propuesta.'
          : 'Alternativa válida para esta sección.';
      }
    });
  }

  function contarTitulos(secciones) {
    return completarEstructura(secciones).reduce(function (total, seccion) {
      return total + seccion.titulos.length;
    }, 0);
  }

  window.EstudianteMVPIANueveCore = Object.freeze({
    etapas: ETAPAS.slice(),
    construirPrompt: construirPrompt,
    construirPromptRevision: construirPromptRevision,
    parsearRespuesta: parsearRespuesta,
    validarYRecomendar: validarYRecomendar,
    contarTitulos: contarTitulos
  });
})(window);
