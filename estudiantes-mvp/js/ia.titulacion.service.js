/*
  Archivo: ia.titulacion.service.js
  Base de compatibilidad del motor IA.

  El proceso individual de tres títulos fue retirado. El flujo vigente se
  instala desde ia.titulacion.robusto.service.js y genera 9 títulos: 3 por sección.
*/
(function (window) {
  'use strict';

  /* El cargador puede haber instalado ya el motor 3x3 antes de llegar aquí. */
  if (
    window.EstudianteMVPIATitulacion &&
    window.EstudianteMVPIATitulacion.__flujoNueveTitulos === true
  ) {
    return;
  }

  function flujoIndividualDesactivado() {
    return Promise.reject(new Error(
      'El flujo individual de tres títulos fue desactivado. Utiliza la generación 3×3.'
    ));
  }

  window.EstudianteMVPIATitulacion = Object.freeze({
    generarTitulosPorPropuesta: flujoIndividualDesactivado,
    generarTresTitulos: flujoIndividualDesactivado,
    modo: 'esperando_motor_3x3',
    version: '3.0.1-base'
  });
})(window);
