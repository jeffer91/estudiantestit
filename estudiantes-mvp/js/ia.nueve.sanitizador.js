/*
  Sanitizador estricto para IA de Titulación.
  - Extrae únicamente valores que realmente son títulos.
  - Recupera campos "titulo" aun cuando el JSON llegue incompleto.
  - Rechaza etiquetas, justificaciones y fragmentos técnicos.
  - Nunca inventa opciones para completar tres tarjetas.
*/
(function (window) {
  'use strict';

  var original = window.EstudianteMVPIANueveCore;
  var ETAPAS = original && Array.isArray(original.etapas)
    ? original.etapas.slice()
    : [
        { numero: 1, codigo: 'diagnostico_inicial', nombre: 'Diagnóstico inicial' },
        { numero: 2, codigo: 'propuesta_mejora', nombre: 'Propuesta o mejora' },
        { numero: 3, codigo: 'evaluacion_resultado', nombre: 'Evaluación o resultado esperado' }
      ];

  if (!original) return;

  function limpiar(valor) {
    return String(valor == null ? '' : valor)
      .replace(/```(?:json)?/ig, ' ')
      .replace(/\\n|\\r|\\t/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
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
    var texto = limpiar(valor)
      .replace(/[“”"'.,;:¿?¡!()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return texto ? texto.split(' ').filter(Boolean).length : 0;
  }

  function limpiarTitulo(valor) {
    var titulo = limpiar(valor)
      .replace(/^\s*[-*•]+\s*/, '')
      .replace(/^\s*\d+\s*[).:-]\s*/, '')
      .replace(/^\s*(?:t[ií]tulo|title|opci[oó]n|alternativa)\s*\d*\s*["']?\s*[:=-]\s*["']?/i, '')
      .replace(/^\s*["']?(?:titulo|título|title)["']?\s*:\s*["']?/i, '')
      .replace(/^[\s“”"']+/, '')
      .replace(/[\s“”"']+$/, '')
      .replace(/\s*[,;]+\s*[}\]]*\s*$/, '')
      .replace(/\s*[}\]]+\s*$/, '')
      .replace(/\s*\.\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (titulo) {
      titulo = titulo.charAt(0).toUpperCase() + titulo.slice(1);
    }

    return titulo;
  }

  function contieneFragmentoTecnico(titulo) {
    var crudo = limpiar(titulo);
    var clave = normalizar(crudo);

    return (
      /[{}\[\]]/.test(crudo) ||
      /["']\s*:\s*["']?/.test(crudo) ||
      /^(?:etapa|seccion|sección|justificacion|justificación|numero|número|puntaje|recomendada|recomendado|nombreEtapa)\b/i.test(crudo) ||
      /(?:^|_)(?:etapa|seccion|justificacion|numero|puntaje|recomendada|nombre_etapa)(?:_|$)/.test(clave) ||
      /diagnostico_inicial|propuesta_mejora|evaluacion_resultado/.test(clave)
    );
  }

  function terminaIncompleto(titulo) {
    var limpioTitulo = limpiar(titulo).toLowerCase();
    return /(?:\bde|\bdel|\bla|\blas|\bel|\blos|\by|\bo|\bpara|\bcon|\ben|\bpor|\bmediante|\bsobre)$/.test(limpioTitulo);
  }

  function esTituloValido(valor) {
    var titulo = limpiarTitulo(valor);
    var palabras = contarPalabras(titulo);
    var clave = normalizar(titulo);

    if (!titulo || titulo.length < 35) return false;
    if (palabras < 16 || palabras > 34) return false;
    if (!clave || contieneFragmentoTecnico(titulo) || terminaIncompleto(titulo)) return false;
    if (/^(?:diagn[oó]stico inicial|propuesta o mejora|evaluaci[oó]n o resultado esperado)$/i.test(titulo)) return false;
    if (/no especificado|título académico|titulo academico|primera alternativa|segunda alternativa|tercera alternativa/i.test(titulo)) return false;
    if (!/[a-záéíóúñ]/i.test(titulo)) return false;

    return true;
  }

  function numeroSeccion(valor, fallback) {
    var numero = Number(valor);
    var clave;

    if (numero >= 1 && numero <= 3) return numero;

    clave = normalizar(valor);
    if (/diagnostico|inicial/.test(clave)) return 1;
    if (/propuesta|mejora|proceso|diseno|optimizacion/.test(clave)) return 2;
    if (/evaluacion|resultado|impacto|final|efectividad/.test(clave)) return 3;

    return Number(fallback || 0);
  }

  function crearSeccion(numero, lista) {
    var etapa = ETAPAS[numero - 1] || ETAPAS[0];
    var usadas = {};
    var titulos = [];

    (Array.isArray(lista) ? lista : []).forEach(function (item) {
      var objeto = typeof item === 'string' ? { titulo: item } : item || {};
      var titulo = limpiarTitulo(objeto.titulo || objeto.título || objeto.title || '');
      var clave = normalizar(titulo);

      if (!esTituloValido(titulo) || usadas[clave] || titulos.length >= 3) return;
      usadas[clave] = true;
      titulos.push({
        numero: titulos.length + 1,
        titulo: titulo,
        justificacion: limpiar(
          objeto.justificacion || objeto.justificación || objeto.razon ||
          objeto.razón || objeto.explicacion || objeto.explicación || objeto.motivo || ''
        )
      });
    });

    return {
      seccion: numero,
      etapa: etapa.codigo,
      nombreEtapa: etapa.nombre,
      titulos: titulos
    };
  }

  function completar(secciones) {
    var mapa = {};

    (Array.isArray(secciones) ? secciones : []).forEach(function (seccion) {
      var numero = numeroSeccion(
        seccion && (seccion.seccion || seccion.numero || seccion.section || seccion.etapa),
        0
      );
      if (numero >= 1 && numero <= 3) mapa[numero] = crearSeccion(numero, seccion.titulos || []);
    });

    return [1, 2, 3].map(function (numero) {
      return mapa[numero] || crearSeccion(numero, []);
    });
  }

  function extraerJson(texto) {
    var limpioTexto = String(texto || '')
      .replace(/```(?:json)?/ig, '')
      .trim();
    var inicio;
    var fin;

    try { return JSON.parse(limpioTexto); } catch (e1) {}

    inicio = limpioTexto.indexOf('{');
    fin = limpioTexto.lastIndexOf('}');
    if (inicio >= 0 && fin > inicio) {
      try { return JSON.parse(limpioTexto.slice(inicio, fin + 1)); } catch (e2) {}
    }

    inicio = limpioTexto.indexOf('[');
    fin = limpioTexto.lastIndexOf(']');
    if (inicio >= 0 && fin > inicio) {
      try { return JSON.parse(limpioTexto.slice(inicio, fin + 1)); } catch (e3) {}
    }

    return null;
  }

  function recorrerJson(nodo, salida, seccionHeredada, dentroListaTitulos, profundidad) {
    var seccion;

    salida = salida || [];
    profundidad = Number(profundidad || 0);
    if (profundidad > 10 || nodo == null) return salida;

    if (typeof nodo === 'string') {
      if (dentroListaTitulos && esTituloValido(nodo)) {
        salida.push({ titulo: limpiarTitulo(nodo), seccion: seccionHeredada || 0 });
      }
      return salida;
    }

    if (Array.isArray(nodo)) {
      nodo.forEach(function (item) {
        recorrerJson(item, salida, seccionHeredada, dentroListaTitulos, profundidad + 1);
      });
      return salida;
    }

    if (typeof nodo !== 'object') return salida;

    seccion = numeroSeccion(
      nodo.seccion || nodo.numeroSeccion || nodo.section || nodo.etapa || nodo.nombreEtapa,
      seccionHeredada || 0
    );

    ['titulo', 'título', 'title'].some(function (clave) {
      if (typeof nodo[clave] !== 'string') return false;
      if (!esTituloValido(nodo[clave])) return true;
      salida.push({
        titulo: limpiarTitulo(nodo[clave]),
        justificacion: limpiar(
          nodo.justificacion || nodo.justificación || nodo.razon || nodo.razón ||
          nodo.explicacion || nodo.explicación || nodo.motivo || ''
        ),
        seccion: seccion
      });
      return true;
    });

    Object.keys(nodo).forEach(function (clave) {
      var valor = nodo[clave];
      var esLista = /^(?:titulos|títulos|titles|opciones|alternativas|sugerencias)$/i.test(clave);
      if (valor && typeof valor === 'object') {
        recorrerJson(valor, salida, seccion, esLista, profundidad + 1);
      }
    });

    return salida;
  }

  function extraerCamposTituloDeTexto(texto) {
    var salida = [];
    var regex = /["']?(?:titulo|título|title)["']?\s*:\s*["']((?:\\.|[^"'])+)["']/ig;
    var match;

    while ((match = regex.exec(String(texto || ''))) !== null) {
      var titulo = match[1]
        .replace(/\\"/g, '"')
        .replace(/\\'/g, "'")
        .replace(/\\n/g, ' ');
      if (esTituloValido(titulo)) salida.push({ titulo: limpiarTitulo(titulo), seccion: 0 });
      if (salida.length >= 12) break;
    }

    return salida;
  }

  function extraerListaPlana(texto) {
    var salida = [];

    String(texto || '').split(/\n+/).forEach(function (linea) {
      var originalLinea = limpiar(linea);
      var pareceOpcion = /^\s*(?:[-*•]|\d+\s*[).:-]|t[ií]tulo\s*\d*\s*[:.-]|opci[oó]n\s*\d*\s*[:.-])/i.test(originalLinea);
      var titulo;

      if (!pareceOpcion || /["']?(?:etapa|justificacion|justificación|seccion|sección|numero|número)["']?\s*:/i.test(originalLinea)) return;
      titulo = limpiarTitulo(originalLinea);
      if (esTituloValido(titulo)) salida.push({ titulo: titulo, seccion: 0 });
    });

    return salida.slice(0, 12);
  }

  function agrupar(lista) {
    var grupos = [[], [], []];
    var usadas = {};
    var limpias = [];

    (Array.isArray(lista) ? lista : []).forEach(function (item) {
      var titulo = limpiarTitulo(item && item.titulo || item);
      var clave = normalizar(titulo);
      if (!esTituloValido(titulo) || usadas[clave]) return;
      usadas[clave] = true;
      limpias.push(Object.assign({}, item || {}, { titulo: titulo }));
    });

    limpias.forEach(function (item, index) {
      var seccion = numeroSeccion(item.seccion || item.etapa || item.nombreEtapa, 0);
      if (seccion < 1 || seccion > 3) {
        if (limpias.length === 3) seccion = index + 1;
        else seccion = Math.min(3, Math.floor(index / 3) + 1);
      }
      if (grupos[seccion - 1].length < 3) grupos[seccion - 1].push(item);
    });

    return grupos.map(function (grupo, index) {
      return crearSeccion(index + 1, grupo);
    });
  }

  function parsearRespuesta(texto) {
    var json = extraerJson(texto);
    var lista = [];

    if (json) recorrerJson(json, lista, 0, false, 0);
    if (!lista.length) lista = extraerCamposTituloDeTexto(texto);
    if (!lista.length) lista = extraerListaPlana(texto);

    return completar(agrupar(lista));
  }

  function sanitizarSecciones(secciones) {
    var lista = [];

    (Array.isArray(secciones) ? secciones : []).forEach(function (seccion, index) {
      var numero = numeroSeccion(
        seccion && (seccion.seccion || seccion.numero || seccion.section || seccion.etapa),
        index + 1
      );
      (seccion && Array.isArray(seccion.titulos) ? seccion.titulos : []).forEach(function (item) {
        var titulo = limpiarTitulo(item && item.titulo || item);
        if (!esTituloValido(titulo)) return;
        lista.push(Object.assign({}, item || {}, { titulo: titulo, seccion: numero }));
      });
    });

    return completar(agrupar(lista));
  }

  function validarYRecomendar(secciones, params) {
    return original.validarYRecomendar(sanitizarSecciones(secciones), params);
  }

  function contarTitulos(secciones) {
    return sanitizarSecciones(secciones).reduce(function (total, seccion) {
      return total + seccion.titulos.length;
    }, 0);
  }

  window.EstudianteMVPIANueveCore = Object.freeze(Object.assign({}, original, {
    parsearRespuesta: parsearRespuesta,
    validarYRecomendar: validarYRecomendar,
    contarTitulos: contarTitulos,
    limpiarTitulo: limpiarTitulo,
    esTituloValido: esTituloValido,
    sanitizarSecciones: sanitizarSecciones,
    versionSanitizador: '1.0.0'
  }));
})(window);
