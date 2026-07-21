/*
  Núcleo IA de Titulación 3x3:
  - Solicita hasta 9 títulos internos.
  - Recupera JSON, listas, objetos anidados y texto numerado.
  - Conserva los títulos válidos aunque la respuesta esté incompleta.
  - Considera apta una respuesta cuando existe al menos una opción válida por enfoque.
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
    var propuesta = propuestas[numero - 1] || params && params.propuesta || {};

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
        carrera: limpiar(estudiante.nombreCarrera || estudiante.carrera || estudiante.NombreCarrera),
        codigoCarrera: limpiar(estudiante.codigoCarrera || estudiante.CodigoCarrera),
        sede: limpiar(estudiante.sede || estudiante.Sede),
        periodoLabel: limpiar(estudiante.periodoLabel || estudiante.periodoId)
      },
      propuesta: {
        numero: numero,
        tituloBase: limpiar(propuesta.tituloFinal || propuesta.titulo),
        temaGeneral: limpiar(propuesta.temaGeneral || propuesta.tema),
        lugarContexto: limpiar(propuesta.lugarContexto || propuesta.contexto),
        grupoEstudio: limpiar(propuesta.grupoEstudio || propuesta.grupo),
        problemaNecesidad: limpiar(propuesta.problemaNecesidad || propuesta.problema),
        objetivo: limpiar(propuesta.objetivo || propuesta.objetivoGeneral),
        anioPeriodo: limpiar(propuesta.anioPeriodo || propuesta.periodo)
      }
    };
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

  function construirPrompt(params) {
    var contextos = [1, 2, 3].map(function (numero) {
      return obtenerContexto(params, numero);
    });
    var carrera = contextos[0].estudiante.carrera || 'la carrera del estudiante';

    return [
      'Actúa como especialista en titulación académica de educación superior.',
      'Genera EXACTAMENTE 9 títulos internos: 3 por cada enfoque indicado.',
      '',
      'REGLAS OBLIGATORIAS:',
      '1. Cada título debe tener entre 20 y 30 palabras.',
      '2. Usa únicamente la información entregada. No inventes empresas, lugares, poblaciones, fechas, intervenciones ni resultados.',
      '3. Relaciona los títulos con la carrera: ' + carrera + '.',
      '4. Los títulos deben abordar la misma propuesta; cambia únicamente el enfoque académico.',
      '5. No afirmes que algo fue implementado, ejecutado o demostrado si no consta en los datos.',
      '6. Cada título debe ser diferente, claro y utilizable como título académico.',
      '7. Responde únicamente JSON válido, sin Markdown ni explicaciones externas.',
      '',
      construirBloqueContexto(contextos[0], ETAPAS[0]),
      '',
      construirBloqueContexto(contextos[1], ETAPAS[1]),
      '',
      construirBloqueContexto(contextos[2], ETAPAS[2]),
      '',
      'FORMATO JSON OBLIGATORIO:',
      '{"secciones":[',
      '{"seccion":1,"etapa":"diagnostico_inicial","titulos":[{"numero":1,"titulo":"...","justificacion":"..."},{"numero":2,"titulo":"...","justificacion":"..."},{"numero":3,"titulo":"...","justificacion":"..."}]},',
      '{"seccion":2,"etapa":"propuesta_mejora","titulos":[{"numero":1,"titulo":"...","justificacion":"..."},{"numero":2,"titulo":"...","justificacion":"..."},{"numero":3,"titulo":"...","justificacion":"..."}]},',
      '{"seccion":3,"etapa":"evaluacion_resultado","titulos":[{"numero":1,"titulo":"...","justificacion":"..."},{"numero":2,"titulo":"...","justificacion":"..."},{"numero":3,"titulo":"...","justificacion":"..."}]}',
      ']}',
      'Verifica antes de responder que el JSON sea válido y que no contenga texto fuera del objeto.'
    ].join('\n');
  }

  function construirPromptRevision(params, secciones, reporte) {
    var errores = reporte && Array.isArray(reporte.errores) ? reporte.errores : [];
    var problemas = errores.length
      ? errores.slice(0, 18).map(function (item) {
          return '- Sección ' + item.seccion + ', título ' + (item.titulo || 'faltante') + ': ' + item.mensaje;
        }).join('\n')
      : '- Completa y mejora la estructura sin alterar los datos.';

    return [
      'Actúa como revisor académico de títulos.',
      'Corrige y completa la respuesta anterior. Puedes trabajar con el mismo contenido generado previamente.',
      'Conserva los títulos correctos y modifica únicamente los incompletos, repetidos o inválidos.',
      'Devuelve 3 secciones y hasta 3 títulos por sección. Cada título debe tener entre 20 y 30 palabras.',
      'No inventes información ni cambies tema, problema, objetivo, lugar, grupo, período o carrera.',
      '',
      'PROBLEMAS DETECTADOS:',
      problemas,
      '',
      'RESPUESTA ANTERIOR NORMALIZADA:',
      JSON.stringify({ secciones: secciones || [] }),
      '',
      'CONTEXTO Y FORMATO REQUERIDO:',
      construirPrompt(params),
      '',
      'Responde únicamente JSON válido.'
    ].join('\n');
  }

  function extraerJson(texto) {
    var limpio = String(texto || '')
      .replace(/```(?:json)?/ig, '')
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

  function claveEsTitulo(clave) {
    return /^(titulo|título|title|texto|text|propuesta|alternativa|opcion|opción)(?:\d+)?$/i.test(clave || '');
  }

  function recolectarTitulos(objeto, salida, seccionHeredada, profundidad) {
    var seccion;

    salida = salida || [];
    profundidad = Number(profundidad || 0);
    if (profundidad > 8 || objeto === null || objeto === undefined) return salida;

    if (typeof objeto === 'string') {
      if (limpiar(objeto).length >= 18) {
        salida.push({ titulo: limpiar(objeto), seccion: seccionHeredada || 0 });
      }
      return salida;
    }

    if (Array.isArray(objeto)) {
      objeto.forEach(function (item) {
        recolectarTitulos(item, salida, seccionHeredada, profundidad + 1);
      });
      return salida;
    }

    if (typeof objeto !== 'object') return salida;

    seccion = Number(
      objeto.seccion || objeto.section || objeto.bloque || objeto.grupo || seccionHeredada || 0
    );

    Object.keys(objeto).forEach(function (clave) {
      var valor = objeto[clave];
      if (claveEsTitulo(clave) && typeof valor === 'string') {
        salida.push({
          titulo: limpiar(valor),
          justificacion: limpiar(objeto.justificacion || objeto.razon || objeto.explicacion || objeto.motivo),
          seccion: seccion
        });
      } else if (valor && typeof valor === 'object') {
        recolectarTitulos(valor, salida, seccion, profundidad + 1);
      }
    });

    return salida;
  }

  function detectarSeccionesNombradas(json) {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return [];

    var claves = [
      ['diagnostico', 'diagnóstico', 'diagnostico_inicial', 'seccion1', 'sección1'],
      ['proceso', 'propuesta', 'mejora', 'propuesta_mejora', 'seccion2', 'sección2'],
      ['resultado', 'resultados', 'evaluacion', 'evaluación', 'impacto', 'evaluacion_resultado', 'seccion3', 'sección3']
    ];
    var encontradas = [];

    claves.forEach(function (grupo, index) {
      var valor = null;
      grupo.some(function (clave) {
        if (json[clave] !== undefined) {
          valor = json[clave];
          return true;
        }
        return false;
      });
      if (valor !== null) {
        encontradas.push(crearSeccion(index + 1, recolectarTitulos(valor, [], index + 1, 0)));
      }
    });

    return encontradas;
  }

  function parsearRespuesta(texto) {
    var json = extraerJson(texto);
    var seccionesRaw = obtenerLista(json, ['secciones', 'sections', 'bloques']);
    var salida = [];
    var plana;

    if (seccionesRaw.length) {
      salida = seccionesRaw.map(function (seccion, index) {
        return normalizarSeccion(seccion, index + 1);
      });
    }

    if (!salida.length) salida = detectarSeccionesNombradas(json);

    if (!salida.length && json) {
      plana = recolectarTitulos(json, [], 0, 0);
      salida = normalizarListaPlana(plana);
    }

    if (!contarTitulos(salida)) {
      salida = normalizarListaPlana(extraerTextoPlano(texto));
    }

    return completarEstructura(salida);
  }

  function normalizarSeccion(seccion, fallback) {
    var numero = Number(seccion && (seccion.seccion || seccion.numero || seccion.section) || fallback);
    var lista = obtenerLista(seccion, ['titulos', 'títulos', 'sugerencias', 'titles', 'opciones', 'alternativas']);
    if (!lista.length) lista = recolectarTitulos(seccion, [], numero, 0);
    return crearSeccion(numero, lista);
  }

  function normalizarListaPlana(lista) {
    var grupos = [[], [], []];
    var limpias = [];
    var usadas = {};

    (Array.isArray(lista) ? lista : []).forEach(function (item) {
      var objeto = typeof item === 'string' ? { titulo: item } : item || {};
      var titulo = limpiar(objeto.titulo || objeto.título || objeto.title || objeto.texto || objeto.text || objeto.propuesta || objeto.alternativa || '');
      var clave = normalizar(titulo);
      if (!titulo || titulo.length < 18 || !clave || usadas[clave]) return;
      usadas[clave] = true;
      limpias.push(Object.assign({}, objeto, { titulo: titulo }));
    });

    limpias.forEach(function (item, index) {
      var seccion = Number(item.seccion || item.section || item.bloque || 0);
      if (seccion < 1 || seccion > 3) {
        if (limpias.length === 3) seccion = index + 1;
        else if (limpias.length <= 5) seccion = index % 3 + 1;
        else seccion = Math.min(3, Math.floor(index / 3) + 1);
      }
      if (grupos[seccion - 1].length < 3) grupos[seccion - 1].push(item);
    });

    // Garantiza que una respuesta con títulos utilizables no deje un enfoque vacío.
    [0, 1, 2].forEach(function (indice) {
      var donante;
      if (grupos[indice].length) return;
      donante = grupos.find(function (grupo) { return grupo.length > 1; });
      if (donante) grupos[indice].push(donante.pop());
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
        objeto.titulo || objeto.título || objeto.title || objeto.texto || objeto.text || objeto.propuesta || objeto.alternativa || ''
      ).replace(/^[“”"']+|[“”"']+$/g, '');
      var clave = normalizar(titulo);

      if (!titulo || titulo.length < 18 || !clave || usadas[clave] || titulos.length >= 3) return;
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
        .replace(/^t[ií]tulo\s*\d*\s*[:.-]\s*/i, '')
        .replace(/^opci[oó]n\s*\d*\s*[:.-]\s*/i, '');
      if (titulo.length >= 25 && lista.length < 12) lista.push({ titulo: titulo });
    });
    return lista;
  }

  function validarYRecomendar(secciones, params) {
    var errores = [];
    var graves = 0;
    var menores = 0;
    var total = 0;
    var usadasGlobal = {};
    var seccionesConOpcionValida = 0;

    var normalizadas = completarEstructura(secciones).map(function (seccion) {
      var etapa = ETAPAS[seccion.seccion - 1];
      var contexto = obtenerContexto(params, seccion.seccion);
      var tieneValida = false;
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

        if (!evaluacion.graves.length) tieneValida = true;
        total += evaluacion.puntaje;

        return {
          numero: index + 1,
          titulo: item.titulo,
          justificacion: item.justificacion,
          puntaje: evaluacion.puntaje,
          erroresGraves: evaluacion.graves.slice(),
          erroresMenores: evaluacion.menores.slice(),
          recomendada: false,
          recomendado: false
        };
      });

      if (!titulos.length) {
        errores.push({
          seccion: seccion.seccion,
          titulo: 0,
          nivel: 'grave',
          mensaje: 'Falta una opción para este enfoque.'
        });
        graves += 1;
      } else if (titulos.length < 3) {
        errores.push({
          seccion: seccion.seccion,
          titulo: 0,
          nivel: 'menor',
          mensaje: 'La respuesta interna contiene menos de tres alternativas en este enfoque.'
        });
        menores += 1;
      }

      if (tieneValida) seccionesConOpcionValida += 1;
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
      seccionesConOpcionValida: seccionesConOpcionValida,
      apto: seccionesConOpcionValida === 3,
      perfecto: graves === 0 && menores === 0 && contarTitulos(normalizadas) === 9
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
    else if (palabras >= 16 && palabras <= 34) {
      puntaje += 8;
      menores.push('Conviene ajustar ligeramente la extensión al rango de 20 a 30 palabras.');
    } else {
      graves.push('La extensión está demasiado alejada del rango de 20 a 30 palabras.');
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
          : 'Alternativa relacionada con este enfoque académico.';
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
