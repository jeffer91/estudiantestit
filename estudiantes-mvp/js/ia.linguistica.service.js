/* Evaluación de articulación, legibilidad y forma académica para títulos en español. */
(function(window){'use strict';
  function limpiar(v){return String(v==null?'':v).replace(/\s+/g,' ').trim();}
  function normalizar(v){return limpiar(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9ñ]+/g,' ').trim();}
  function evaluar(titulo,opciones){var b=window.EstudianteMVPIABibliotecaAcademica;var etapa=opciones&&opciones.etapa||'';var texto=limpiar(titulo);var normal=normalizar(texto);var palabras=normal?normal.split(/\s+/).filter(Boolean):[];var graves=[];var menores=[];var ajuste=0;var rep={},max=0;
    palabras.forEach(function(p){if(p.length<4)return;rep[p]=(rep[p]||0)+1;max=Math.max(max,rep[p]);});
    if(!texto)graves.push('El título está vacío.');
    if(/\.$/.test(texto))menores.push('Un título académico normalmente no necesita punto final.');
    if(/[,;:]\s*[,;:]/.test(texto))menores.push('La puntuación está encadenada y dificulta la lectura.');
    if(/\b(de|para|con|en|por)\s+\1\b/i.test(texto))menores.push('Hay una preposición repetida de forma consecutiva.');
    if(max>=3)menores.push('Una palabra relevante se repite demasiado y resta fluidez al título.');
    if(texto&&texto.charAt(0)!==texto.charAt(0).toUpperCase())menores.push('Conviene iniciar el título con mayúscula.');
    if(b){if(etapa&&!b.aperturaValida(texto,etapa))menores.push('Conviene usar una apertura académica más directa para este enfoque.');else if(etapa)ajuste+=8;b.frasesVagas.forEach(function(frase){if(normal.indexOf(normalizar(frase))>=0)graves.push('El título contiene una frase genérica que debe sustituirse por datos reales de la propuesta.');});}
    if(palabras.length>=20&&palabras.length<=30)ajuste+=5;ajuste-=graves.length*20;ajuste-=menores.length*3;
    return{puntajeAjuste:ajuste,erroresGraves:graves,erroresMenores:menores,metricas:{palabras:palabras.length,repeticionMaxima:max}};
  }
  window.EstudianteMVPIALinguistica=Object.freeze({evaluar:evaluar,version:'1.0.0'});
})(window);
