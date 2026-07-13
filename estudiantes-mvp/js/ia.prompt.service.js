/*
  Archivo: ia.prompt.service.js
  Ruta: estudiantes-mvp/js/ia.prompt.service.js
  Funciones principales:
  - Construir el prompt académico para la IA de Titulación.
  - Pedir exactamente 3 títulos por propuesta.
  - Forzar 3 enfoques: diagnóstico inicial, proceso/propuesta y resultado/evaluación final.
  - Usar la carrera del estudiante como dato central.
  - Solicitar respuesta en JSON limpio para poder procesarla sin errores.
*/
(function (window) {
  'use strict';

  var ETAPAS = Object.freeze([
    {
      numero: 1,
      codigo: 'inicial',
      nombre: 'Diagnóstico inicial',
      descripcion: 'Título orientado a identificar, analizar o diagnosticar el problema al inicio del proceso.'
    },
    {
      numero: 2,
      codigo: 'proceso',
      nombre: 'Proceso o propuesta de mejora',
      descripcion: 'Título orientado al desarrollo de una propuesta, plan, estrategia, modelo o intervención.'
    },
    {
      numero: 3,
      codigo: 'final',
      nombre: 'Evaluación o resultado final',
      descripcion: 'Título orientado a evaluar resultados, impacto, efectividad o mejoras obtenidas.'
    }
  ]);

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function construirPromptTitulos(params) {
    var utils = obtenerUtils();
    var contexto;

    if (!utils) {
      throw new Error('No está disponible EstudianteMVPUtils.');
    }

    contexto = normalizarContexto(params || {});

    return [
      construirRol(),
      '',
      construirReglasGenerales(contexto),
      '',
      construirDatosEstudiante(contexto),
      '',
      construirDatosPropuesta(contexto),
      '',
      construirEtapas(),
      '',
      construirFormatoRespuesta()
    ].join('\n');
  }

  function construirRol() {
    return [
      'Actúa como una IA de Titulación académica para estudiantes de educación superior.',
      'Tu tarea es mejorar propuestas de títulos de investigación de forma clara, viable y relacionada con la carrera del estudiante.',
      'Debes escribir títulos académicos sencillos, formales, específicos y aplicables.'
    ].join('\n');
  }

  function construirReglasGenerales(contexto) {
    var carrera = contexto && contexto.estudiante
      ? contexto.estudiante.carrera
      : 'la carrera del estudiante';

    return [
      'REGLAS OBLIGATORIAS:',
      '1. Genera exactamente 3 títulos.',
      '2. Cada título debe corresponder a una etapa diferente del proceso de titulación.',
      '3. La carrera del estudiante es el criterio principal y obligatorio: ' + carrera + '.',
      '4. Todos los títulos deben pertenecer claramente a la carrera del estudiante.',
      '5. Si el tema escrito por el estudiante pertenece a otra área, NO generes títulos de esa otra área.',
      '6. Si el tema es lejano a la carrera, adáptalo como un problema, sistema, plataforma, aplicación, módulo, prototipo, herramienta tecnológica, automatización, gestión de datos o solución propia de la carrera.',
      '7. Conserva el lugar, grupo de estudio, problema, necesidad y objetivo solo como contexto de aplicación, pero el enfoque académico del título debe ser de la carrera.',
      '8. No propongas títulos genéricos que podrían servir para cualquier carrera.',
      '9. No inventes instituciones, empresas, lugares, fechas ni poblaciones si no aparecen en los datos.',
      '10. Si falta algún dato, redacta el título con la información disponible.',
      '11. Cada título debe tener entre 15 y 25 palabras.',
      '12. No superes las 25 palabras por título bajo ninguna circunstancia.',
      '13. Evita títulos demasiado largos, confusos o con palabras innecesarias.',
      '14. No uses comillas al inicio o al final del título.',
      '15. La respuesta debe ser únicamente JSON válido, sin explicación externa y sin markdown.'
    ].join('\n');
  }

  function construirDatosEstudiante(contexto) {
    return [
      'DATOS DEL ESTUDIANTE:',
      '- Nombres: ' + contexto.estudiante.nombres,
      '- Cédula: ' + contexto.estudiante.cedula,
      '- Carrera: ' + contexto.estudiante.carrera,
      '- Código de carrera: ' + contexto.estudiante.codigoCarrera,
      '- Sede: ' + contexto.estudiante.sede,
      '- Modalidad: ' + contexto.estudiante.modalidadDetectada,
      '- Período: ' + contexto.estudiante.periodoLabel + ' (' + contexto.estudiante.periodoId + ')'
    ].join('\n');
  }

  function construirDatosPropuesta(contexto) {
    return [
      'DATOS DE LA PROPUESTA ' + contexto.propuesta.numero + ':',
      '- Título escrito por el estudiante: ' + contexto.propuesta.tituloBase,
      '- Tema general: ' + contexto.propuesta.temaGeneral,
      '- Lugar o contexto: ' + contexto.propuesta.lugarContexto,
      '- Grupo de estudio: ' + contexto.propuesta.grupoEstudio,
      '- Problema o necesidad: ' + contexto.propuesta.problemaNecesidad,
      '- Objetivo: ' + contexto.propuesta.objetivo,
      '- Año o período de revisión: ' + contexto.propuesta.anioPeriodo
    ].join('\n');
  }

  function construirEtapas() {
    return [
      'LOS 3 TÍTULOS DEBEN TENER ESTOS ENFOQUES:',
      '1. Diagnóstico inicial: analiza o identifica la situación inicial del problema.',
      '2. Proceso o propuesta: plantea una propuesta, estrategia, plan, sistema, guía, modelo o mejora.',
      '3. Evaluación final: evalúa resultados, impacto, efectividad o cumplimiento al final del proceso.'
    ].join('\n');
  }

  function construirFormatoRespuesta() {
    return [
      'FORMATO DE RESPUESTA OBLIGATORIO:',
      'Antes de responder, cuenta las palabras de cada título. Si un título tiene más de 25 palabras, reescríbelo más corto.',
      '{',
      '  "sugerencias": [',
      '    {',
      '      "numero": 1,',
      '      "etapa": "inicial",',
      '      "nombreEtapa": "Diagnóstico inicial",',
      '      "titulo": "Título académico completo de 15 a 25 palabras",',
      '      "justificacion": "Explicación breve de por qué este título corresponde a la etapa inicial"',
      '    },',
      '    {',
      '      "numero": 2,',
      '      "etapa": "proceso",',
      '      "nombreEtapa": "Proceso o propuesta de mejora",',
      '      "titulo": "Título académico completo",',
      '      "justificacion": "Explicación breve de por qué este título corresponde al proceso"',
      '    },',
      '    {',
      '      "numero": 3,',
      '      "etapa": "final",',
      '      "nombreEtapa": "Evaluación o resultado final",',
      '      "titulo": "Título académico completo",',
      '      "justificacion": "Explicación breve de por qué este título corresponde a la etapa final"',
      '    }',
      '  ]',
      '}'
    ].join('\n');
  }

  function normalizarContexto(params) {
    var utils = obtenerUtils();
    var estudiante = params.estudiante || {};
    var propuesta = params.propuesta || {};

    return {
      estudiante: {
        nombres: limpiarDato(estudiante.nombres),
        cedula: limpiarDato(estudiante.cedula || estudiante.numeroIdentificacion),
        carrera: limpiarDato(estudiante.nombreCarrera || estudiante.carrera),
        codigoCarrera: limpiarDato(estudiante.codigoCarrera),
        sede: limpiarDato(estudiante.sede),
        modalidadDetectada: limpiarDato(estudiante.modalidadDetectada),
        periodoId: limpiarDato(estudiante.periodoId),
        periodoLabel: limpiarDato(estudiante.periodoLabel)
      },
      propuesta: {
        numero: Number(propuesta.numero || params.numeroPropuesta || 1),
        tituloBase: limpiarDato(propuesta.tituloFinal || propuesta.titulo || propuesta.tituloBase),
        temaGeneral: limpiarDato(propuesta.temaGeneral || propuesta.tema),
        lugarContexto: limpiarDato(propuesta.lugarContexto || propuesta.contexto || propuesta.lugar),
        grupoEstudio: limpiarDato(propuesta.grupoEstudio || propuesta.grupo || propuesta.poblacion),
        problemaNecesidad: limpiarDato(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad),
        objetivo: limpiarDato(propuesta.objetivo || propuesta.objetivoGeneral),
        anioPeriodo: limpiarDato(propuesta.anioPeriodo || propuesta.periodo || propuesta.tiempo)
      },
      raw: utils.clonar(params || {})
    };
  }

  function limpiarDato(valor) {
    var utils = obtenerUtils();
    var texto = utils ? utils.limpiarTexto(valor) : String(valor || '').replace(/\s+/g, ' ').trim();

    return texto || 'No especificado';
  }

  function obtenerEtapas() {
    return ETAPAS.slice();
  }

  window.EstudianteMVPIAPrompt = Object.freeze({
    construirPromptTitulos: construirPromptTitulos,
    normalizarContexto: normalizarContexto,
    obtenerEtapas: obtenerEtapas
  });
})(window);
