/* Ajustes de tolerancia y compatibilidad para el núcleo IA 3x3. */
(function (window) {
  'use strict';

  var original = window.EstudianteMVPIANueveCore;
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
    return null;
  }

  function parsearRespuesta(texto) {
    var json = extraerJson(texto);

    if (json && Array.isArray(json.secciones)) {
      json.secciones.forEach(function (seccion, index) {
        var valor = seccion.seccion || seccion.numero || seccion.section || seccion.etapa;
        seccion.seccion = numeroSeccion(valor, index + 1);
      });
      return original.parsearRespuesta(JSON.stringify(json));
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
    reporte.graves = errores.filter(function (item) { return item.nivel === 'grave'; }).length;
    reporte.menores = errores.filter(function (item) { return item.nivel === 'menor'; }).length;
    reporte.apto = reporte.graves === 0;
    reporte.perfecto = reporte.graves === 0 && reporte.menores === 0;
    return reporte;
  }

  window.EstudianteMVPIANueveCore = Object.freeze(Object.assign({}, original, {
    parsearRespuesta: parsearRespuesta,
    validarYRecomendar: validarYRecomendar
  }));
})(window);
