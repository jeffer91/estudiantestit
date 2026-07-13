/* =========================================================
Archivo: ad-titulos.service.js
Ruta: /administrador/ad-js/ad-titulos.service.js
Función:
- Servicio de apoyo para títulos y estudiantes.
- En este bloque detecta carreras desde titulos y cruza con Estudiantes.
- Deja preparada la base para búsqueda, devolución y reparación posteriores.
Dependencias:
- ad-config.js
- ad-firebase.service.js
========================================================= */

(function(window){
  "use strict";

  function config(){
    return window.AD_CONFIG || {};
  }

  function utils(){
    return window.AD_UTILS || {};
  }

  function firebaseService(){
    if (!window.ADFirebaseService) {
      throw new Error("ADFirebaseService no está disponible.");
    }
    return window.ADFirebaseService;
  }

  function texto(valor){
    if (utils().normalizarTexto) return utils().normalizarTexto(valor);
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function colecciones(){
    return config().colecciones || {};
  }

  function campos(){
    return config().campos || {};
  }

  function limpiarCedula(valor){
    return texto(valor).replace(/[^0-9A-Za-z]/g, "");
  }

  function obtenerCedulaDeTitulo(titulo){
    var data = titulo || {};
    return limpiarCedula(data.cedula || data.numeroIdentificacion || data.identificacion || data._docId || "");
  }

  function buscarEstudiantePorCedula(cedulaValor){
    var cedula = limpiarCedula(cedulaValor);
    var col = colecciones().estudiantes;
    var campoCedula = campos().cedula || "cedula";
    var campoNumero = campos().numeroIdentificacion || "numeroIdentificacion";

    if (!cedula) {
      return Promise.resolve(null);
    }

    return firebaseService().leerDocumento(col, cedula)
      .then(function(resultado){
        if (resultado.existe) return resultado.data;
        return firebaseService().consultarPorCampo(col, campoCedula, "==", cedula, 1)
          .then(function(resp){
            if (resp.datos && resp.datos.length) return resp.datos[0];
            return firebaseService().consultarPorCampo(col, campoNumero, "==", cedula, 1)
              .then(function(respNumero){
                return respNumero.datos && respNumero.datos.length ? respNumero.datos[0] : null;
              });
          });
      })
      .catch(function(){
        return null;
      });
  }

  function listarTitulosBasico(limite){
    var max = Number(limite || 250);
    if (!Number.isFinite(max) || max <= 0) max = 250;
    return firebaseService().listarColeccion(colecciones().titulos, max)
      .then(function(resultado){
        return resultado.datos || [];
      });
  }

  function claveCarrera(codigo, nombre){
    var codigoLimpio = texto(codigo);
    var nombreLimpio = texto(nombre);
    return codigoLimpio || nombreLimpio;
  }

  function detectarCarrerasDesdeTitulos(limite){
    var max = Number(limite || 300);
    var mapa = {};
    var carreras = [];
    var totalTitulos = 0;
    var totalConEstudiante = 0;
    var totalSinCarrera = 0;

    if (!Number.isFinite(max) || max <= 0) max = 300;

    return listarTitulosBasico(max).then(function(titulos){
      totalTitulos = titulos.length;
      return Promise.all(titulos.map(function(titulo){
        var cedula = obtenerCedulaDeTitulo(titulo);
        if (!cedula) {
          totalSinCarrera += 1;
          return null;
        }
        return buscarEstudiantePorCedula(cedula).then(function(estudiante){
          var codigo = texto(estudiante && estudiante[campos().codigoCarrera || "CodigoCarrera"]);
          var nombre = texto(estudiante && estudiante[campos().nombreCarrera || "NombreCarrera"]);
          var key = claveCarrera(codigo, nombre);

          if (!estudiante) {
            totalSinCarrera += 1;
            return null;
          }

          totalConEstudiante += 1;

          if (!key) {
            totalSinCarrera += 1;
            return null;
          }

          if (!mapa[key]) {
            mapa[key] = {
              key: key,
              codigoCarrera: codigo,
              nombreCarrera: nombre || codigo,
              periodoId: texto(estudiante.periodoId || estudiante.ultimoPeriodoId || titulo.periodoId || ""),
              periodoLabel: texto(estudiante.periodoLabel || titulo.periodoLabel || ""),
              division: texto(estudiante.division || ""),
              sede: texto(estudiante.Sede || estudiante.sede || ""),
              cantidadTitulos: 0,
              muestraCedulas: []
            };
            carreras.push(mapa[key]);
          }

          mapa[key].cantidadTitulos += 1;
          if (mapa[key].muestraCedulas.length < 5) {
            mapa[key].muestraCedulas.push(cedula);
          }

          return mapa[key];
        });
      }));
    }).then(function(){
      carreras.sort(function(a, b){
        return String(a.nombreCarrera).localeCompare(String(b.nombreCarrera), "es");
      });

      return {
        ok: true,
        limite: max,
        totalTitulosLeidos: totalTitulos,
        totalConEstudiante: totalConEstudiante,
        totalSinCarrera: totalSinCarrera,
        totalCarreras: carreras.length,
        carreras: carreras
      };
    });
  }

  window.ADTitulosService = {
    limpiarCedula: limpiarCedula,
    obtenerCedulaDeTitulo: obtenerCedulaDeTitulo,
    buscarEstudiantePorCedula: buscarEstudiantePorCedula,
    listarTitulosBasico: listarTitulosBasico,
    detectarCarrerasDesdeTitulos: detectarCarrerasDesdeTitulos
  };
})(window);
