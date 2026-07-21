/*
  Sanitizador estricto para IA de Titulación.
  Solo acepta títulos académicos completos. Nunca convierte justificaciones,
  etapas, explicaciones ni fragmentos JSON en opciones visibles.
*/
(function (window) {
  'use strict';

  var original = window.EstudianteMVPIANueveCore;
  var ETAPAS = original && Array.isArray(original.etapas)
    ? original.etapas.slice()
    : [
        { numero: 1, codigo: 'diagnostico_inicial', nombre: 'Diagnóstico' },
        { numero: 2, codigo: 'propuesta_mejora', nombre: 'Propuesta o mejora' },
        { numero: 3, codigo: 'evaluacion_resultado', nombre: 'Evaluación o resultado' }
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

  function esEtiquetaNoTitulo(valor) {
    var texto = limpiar(valor);
    return /^(?:justificaci[oó]n|justification|reason|rationale|explanation|explicaci[oó]n|motivo|etapa|stage|section|secci[oó]n|diagnostic|diagn[oó]stico\s+inicial)\s*(?:\d+(?:\.\d+)*)?\s*[*#._-]*\s*[:=-]/i.test(texto);
  }

  function limpiarTitulo(valor) {
    var titulo = limpiar(valor);

    if (!titulo || esEtiquetaNoTitulo(titulo)) return '';

    titulo = titulo
      .replace(/^\s*[-*•]+\s*/, '')
      .replace(/^\s*\d+\s*[).:-]\s*/, '')
      .replace(/^\s*(?:t[ií]tulo|title|opci[oó]n|option|alternativa)\s*\d*(?:\.\d+)?\s*[*#._-]*\s*["']?\s*[:=-]\s*["']?/i, '')
      .replace(/^\s*["']?(?:titulo|título|title)["']?\s*:\s*["']?/i, '')
      .replace(/^[\s“”"']+/, '')
      .replace(/[\s“”"']+$/, '')
      .replace(/\s*[,;]+\s*[}\]]*\s*$/, '')
      .replace(/\s*[}\]]+\s*$/, '')
      .replace(/\s*\.\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!titulo || esEtiquetaNoTitulo(titulo)) return '';
    return titulo.charAt(0).toUpperCase() + titulo.slice(1);
  }

  function contieneFragmentoTecnico(titulo) {
    var crudo = limpiar(titulo);
    var clave = normalizar(crudo);

    return (
      /[{}\[\]]/.test(crudo) ||
      /["']\s*:\s*["']?/.test(crudo) ||
      /^(?:etapa|stage|section|seccion|sección|justificacion|justificación|justification|reason|rationale|explanation|explicacion|explicación|motivo|numero|número|puntaje|score|recomendada|recomendado|nombreEtapa)\b/i.test(crudo) ||
      /(?:^|_)(?:etapa|stage|section|seccion|justificacion|justification|reason|rationale|explanation|motivo|numero|puntaje|score|recomendada|nombre_etapa)(?:_|$)/.test(clave) ||
      /diagnostico_inicial|propuesta_mejora|evaluacion_resultado/.test(clave)
    );
  }

  function terminaIncompleto(titulo) {
    var texto = limpiar(titulo).toLowerCase();
    return /(?:\bde|\bdel|\bla|\blas|\bel|\blos|\by|\bo|\bpara|\bcon|\ben|\bpor|\bmediante|\bsobre)$/.test(texto);
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
    if (/diagnostico|diagnostic|situacion_inicial|initial/.test(clave)) return 1;
    if (/propuesta|proposal|mejora|improvement|proceso|process|diseno|design|optimizacion/.test(clave)) return 2;
    if (/evaluacion|evaluation|resultado|result|impacto|impact|final|efectividad|effectiveness/.test(clave)) return 3;

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
          objeto.justificacion || objeto.justificación || objeto.razon || objeto.razón ||
          objeto.explicacion || objeto.explicación || objeto.motivo || ''
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
        seccion && (seccion.seccion || seccion.numero || seccion.section || seccion.etapa || seccion.nombreEtapa),
        0
      );
      if (numero >= 1 && numero <= 3) mapa[numero] = crearSeccion(numero, seccion.titulos || []);
    });

    return [1, 2, 3].map(function (numero) {
      return mapa[numero] || crearSeccion(numero, []);
    });
  }

  function extraerJson(texto) {
    var contenido = String(texto || '').replace(/```(?:json)?/ig, '').trim();
    var inicio;
    var fin;

    try { return JSON.parse(contenido); } catch (e1) {}

    inicio = contenido.indexOf('{');
    fin = contenido.lastIndexOf('}');
    if (inicio >= 0 && fin > inicio) {
      try { return JSON.parse(contenido.slice(inicio, fin + 1)); } catch (e2) {}
    }

    inicio = contenido.indexOf('[');
    fin = contenido.lastIndexOf(']');
    if (inicio >= 0 && fin > inicio) {
      try { return JSON.parse(contenido.slice(inicio, fin + 1)); } catch (e3) {}
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
      nodo.seccion || nodo.numeroSeccion || nodo.section || nodo.etapa || nodo.stage || nodo.nombreEtapa,
      seccionHeredada || 0
    );

    ['titulo', 'título', 'title'].some(function (clave) {
      if (typeof nodo[clave] !== 'string') return false;
      if (!esTituloValido(nodo[clave])) return true;
      salida.push({
        titulo: limpiarTitulo(nodo[clave]),
        justificacion: limpiar(
          nodo.justificacion || nodo.justificación || nodo.justification || nodo.razon || nodo.razón ||
          nodo.reason || nodo.rationale || nodo.explicacion || nodo.explicación || nodo.explanation || nodo.motivo || ''
        ),
        seccion: seccion
      });
      return true;
    });

    Object.keys(nodo).forEach(function (clave) {
      var valor = nodo[clave];
      var esLista = /^(?:titulos|títulos|titles|opciones|options|alternativas|sugerencias)$/i.test(clave);
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
      var pareceOpcion = /^\s*(?:[-*•]|\d+\s*[).:-]|t[ií]tulo\s*\d*\s*[:.-]|title\s*\d*\s*[:.-]|opci[oó]n\s*\d*\s*[:.-]|option\s*\d*\s*[:.-])/i.test(originalLinea);
      var titulo;

      if (!pareceOpcion || esEtiquetaNoTitulo(originalLinea)) return;
      if (/["']?(?:etapa|stage|justificacion|justificación|justification|reason|rationale|explanation|seccion|sección|section|numero|número)["']?\s*:/i.test(originalLinea)) return;

      titulo = limpiarTitulo(originalLinea);
      if (esTituloValido(titulo)) salida.push({ titulo: titulo, seccion: 0 });
    });

    return salida.slice(0, 12);
  }

  function agrupar(lista) {
    var grupos = [[], [], []];
    var sinSeccion = [];
    var usadas = {};

    (Array.isArray(lista) ? lista : []).forEach(function (item) {
      var titulo = limpiarTitulo(item && item.titulo || item);
      var clave = normalizar(titulo);
      var seccion = numeroSeccion(item && (item.seccion || item.etapa || item.nombreEtapa), 0);
      var registro;

      if (!esTituloValido(titulo) || usadas[clave]) return;
      usadas[clave] = true;
      registro = Object.assign({}, item || {}, { titulo: titulo });

      if (seccion >= 1 && seccion <= 3) grupos[seccion - 1].push(registro);
      else sinSeccion.push(registro);
    });

    sinSeccion.forEach(function (item, index) {
      var seccion;
      if (sinSeccion.length === 3) seccion = index + 1;
      else seccion = Math.min(3, Math.floor(index / 3) + 1);
      grupos[seccion - 1].push(item);
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
        seccion && (seccion.seccion || seccion.numero || seccion.section || seccion.etapa || seccion.nombreEtapa),
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
    numeroSeccionSeguro: numeroSeccion,
    versionSanitizador: '1.1.0'
  }));
})(window);
