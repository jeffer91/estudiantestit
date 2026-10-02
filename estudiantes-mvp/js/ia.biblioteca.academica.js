/* Biblioteca académica en español para títulos de trabajos de titulación. */
(function (window) {
  'use strict';
  var APERTURAS = Object.freeze({
    diagnostico_inicial: ['Análisis de', 'Diagnóstico de', 'Caracterización de', 'Identificación de', 'Evaluación inicial de'],
    propuesta_mejora: ['Diseño de', 'Propuesta de', 'Desarrollo de', 'Plan de mejora para', 'Estrategia para la mejora de'],
    evaluacion_resultado: ['Evaluación de', 'Valoración de', 'Análisis del impacto esperado de', 'Estimación de resultados de', 'Evaluación del resultado esperado de']
  });
  var CONECTORES = Object.freeze(['para','mediante','orientado a','en','con','sobre','ante','durante','a partir de','en relación con','considerando','dirigido a']);
  var VAGAS = Object.freeze(['no especificado','tema registrado','contexto registrado','grupo registrado','necesidad registrada','objetivo registrado','período registrado','titulo academico']);
  var ARTICULOS = Object.freeze(['el','la','los','las','un','una','unos','unas']);
  var PREPOSICIONES = Object.freeze(['a','ante','bajo','con','contra','de','desde','durante','en','entre','hacia','para','por','según','sin','sobre','tras']);
  function limpiar(valor){return String(valor==null?'':valor).replace(/\s+/g,' ').trim();}
  function normalizar(valor){return limpiar(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');}
  function contarPalabras(valor){var limpio=limpiar(valor).replace(/[“”"'.,;:¿?¡!()[\]{}]/g,' ');return limpio?limpio.split(/\s+/).filter(Boolean).length:0;}
  function etapaDeApertura(titulo){var texto=normalizar(titulo),encontrada='';Object.keys(APERTURAS).some(function(etapa){return APERTURAS[etapa].some(function(apertura){if(texto.indexOf(normalizar(apertura))===0){encontrada=etapa;return true;}return false;});});return encontrada;}
  function aperturaValida(titulo,etapa){var texto=normalizar(titulo);return(APERTURAS[etapa]||[]).some(function(apertura){return texto.indexOf(normalizar(apertura))===0;});}
  window.EstudianteMVPIABibliotecaAcademica=Object.freeze({aperturas:APERTURAS,conectores:CONECTORES,articulos:ARTICULOS,preposiciones:PREPOSICIONES,frasesVagas:VAGAS,contarPalabras:contarPalabras,etapaDeApertura:etapaDeApertura,aperturaValida:aperturaValida,version:'1.0.0'});
})(window);
