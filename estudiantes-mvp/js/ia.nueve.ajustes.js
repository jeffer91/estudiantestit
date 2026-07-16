/* Ajustes de tolerancia y compatibilidad para el núcleo IA 3x3. */
(function (window) {
  'use strict';

  var original = window.EstudianteMVPIANueveCore;
  var CLAVES_SECCIONES = ['secciones', 'sections', 'bloques'];
  var CLAVES_TITULOS = [
    'sugerencias', 'titulos', 'títulos', 'titles',
    'opciones', 'propuestas', 'alternativas'
  ];

  if (!original) return;

  function contar(valor) {
    var limpio = String(valor || '')
      .replace(/[“”"'.,;:¿?¡!()[\]{}]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return limpio ? limpio.split(' ').filter(Boolean).length : 0;
  }

  function normalizar(valor) {
    return String(valor || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_');
  }

  function numeroSeccion(valor, fallback) {
    var numero = Number(valor);
    var clave;

    if (numero >= 1 && numero <= 3) return numero;

    clave = normalizar(valor);
    if (/diagnostico|inicial/.test(clave)) return 1;
    if (/propuesta|mejora|proceso|diseno/.test(clave)) return 2;
    if (/evaluacion|resultado|impacto|final/.test(clave)) return 3;

    return fallback;
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

  function buscarArregloRecursivo(objeto, claves, profundidad) {
    var encontrada = null;

    profundidad = Number(profundidad || 0);
    if (profundidad > 8 || objeto == null) return null;
    if (Array.isArray(objeto)) return objeto;
    if (typeof objeto !== 'object') return null;

    claves.some(function (clave) {
      if (Array.isArray(objeto[clave])) {
        encontrada = objeto[clave];
        return true;
      }
      return false;
    });

    if (encontrada) return encontrada;

    Object.keys(objeto).some(function (clave) {
      var valor = objeto[clave];
      if (valor && typeof valor === 'object') {
        encontrada = buscarArregloRecursivo(valor, claves, profundidad + 1);
        return !!encontrada;
      }
      return false;
    });

    return encontrada;
  }

  function prepararJsonCompatible(json) {
    var secciones;
    var titulos;

    if (!json) return null;

    secciones = buscarArregloRecursivo(json, CLAVES_SECCIONES, 0);
    if (secciones && secciones.length) {
      secciones.forEach(function (seccion, index) {
        var valor;

        seccion = seccion || {};
        valor = seccion.seccion || seccion.numero || seccion.section || seccion.etapa || seccion.nombreEtapa;
        seccion.seccion = numeroSeccion(valor, index + 1);

        if (!Array.isArray(seccion.titulos)) {
          seccion.titulos = buscarArregloRecursivo(seccion, CLAVES_TITULOS, 0) || [];
        }
      });

      return { secciones: secciones };
    }

    titulos = buscarArregloRecursivo(json, CLAVES_TITULOS, 0);
    if (titulos && titulos.length) {
      return { sugerencias: titulos };
    }

    return json;
  }

  function parsearRespuesta(texto) {
    var json = extraerJson(texto);
    var compatible = prepararJsonCompatible(json);

    if (compatible) {
      return original.parsearRespuesta(JSON.stringify(compatible));
    }

    return original.parsearRespuesta(texto);
  }

  function validarYRecomendar(secciones, params) {
    var reporte = original.validarYRecomendar(secciones, params);
    var errores = [];

    (reporte.errores || []).forEach(function (error) {
      var copia = Object.assign({}, error);
      var seccion = reporte.secciones[copia.seccion - 1];
      var titulo = seccion && seccion.titulos[copia.titulo - 1];
      var palabras = titulo ? contar(titulo.titulo) : 0;

      if (
        copia.nivel === 'grave' &&
        /extensi[oó]n/i.test(copia.mensaje) &&
        palabras >= 16 && palabras <= 34
      ) {
        copia.nivel = 'menor';
        copia.mensaje = 'Conviene ajustar la extensión al rango ideal de 20 a 30 palabras.';
      }

      errores.push(copia);
    });

    reporte.errores = errores;
    reporte.graves = errores.filter(function (item) {
      return item.nivel === 'grave';
    }).length;
    reporte.menores = errores.filter(function (item) {
      return item.nivel === 'menor';
    }).length;
    reporte.apto = reporte.graves === 0;
    reporte.perfecto = reporte.graves === 0 && reporte.menores === 0;

    return reporte;
  }

  window.EstudianteMVPIANueveCore = Object.freeze(Object.assign({}, original, {
    parsearRespuesta: parsearRespuesta,
    validarYRecomendar: validarYRecomendar
  }));
})(window);
