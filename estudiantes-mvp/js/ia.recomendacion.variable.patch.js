/*
  Adapta el modal a la cantidad real de títulos validados y carga las
  correcciones de validación e indicadores de motores internos.
*/
(function (window, document) {
  'use strict';

  function cargarActualizacion(src) {
    if (document.readyState === 'loading') {
      document.write('<script src="' + src + '"><\/script>');
      return;
    }

    var script = document.createElement('script');
    script.src = src;
    script.async = false;
    document.head.appendChild(script);
  }

  /* Se cargan después de las versiones base y antes de la integración final. */
  cargarActualizacion('js/ia.nueve.sanitizador.js?v=1.1.0');
  cargarActualizacion('js/ia.titulacion.robusto.service.js?v=5.2.0');
  cargarActualizacion('js/ia.indicadores.motores.patch.js?v=1.0.0');

  var original = window.EstudianteMVPIARecomendacion;
  var MODAL_ID = 'modalTresTitulosIA';

  if (!original || original.__cantidadVariable) return;

  function plural(cantidad, singular, pluralTexto) {
    return Number(cantidad) === 1 ? singular : pluralTexto;
  }

  function ajustarModal(cantidad) {
    var modal = document.getElementById(MODAL_ID);
    var kicker;
    var title;
    var help;
    var options;
    var summary;
    var seleccion;

    cantidad = Math.max(1, Math.min(3, Number(cantidad || 1)));
    if (!modal) return;

    modal.setAttribute('data-cantidad-opciones', String(cantidad));
    kicker = modal.querySelector('.ia-modal__kicker');
    title = modal.querySelector('.ia-modal__title');
    help = modal.querySelector('.ia-modal__help');
    options = modal.querySelector('.ia-options');
    summary = modal.querySelector('[data-ia-resumen]');
    seleccion = modal.querySelector('.ia-option.is-selected');

    if (kicker) {
      kicker.textContent = cantidad + ' ' + plural(cantidad, 'opción validada', 'opciones validadas');
    }
    if (title) {
      title.textContent = cantidad === 1
        ? 'Revisa el título preparado'
        : 'Elige el título que más te convenga';
    }
    if (help && !String(help.textContent || '').trim()) {
      help.textContent = cantidad === 1
        ? 'Se conservó la opción completa y mejor redactada obtenida para esta propuesta.'
        : 'Se conservaron las opciones completas y mejor redactadas obtenidas para esta propuesta.';
    }
    if (options) {
      options.style.gridTemplateColumns = cantidad === 1
        ? 'minmax(0,620px)'
        : 'repeat(' + cantidad + ',minmax(0,1fr))';
      options.style.justifyContent = 'center';
    }
    if (summary) {
      summary.textContent = seleccion
        ? 'Listo: elegiste el título de esta propuesta.'
        : cantidad === 1
          ? 'Selecciona el título para continuar.'
          : 'Elige una de las ' + cantidad + ' opciones para continuar.';
    }
  }

  function mostrarResultado(resultado) {
    var lista = resultado && Array.isArray(resultado.opcionesFinales)
      ? resultado.opcionesFinales
      : [];
    var cantidad = Math.max(1, Math.min(3, lista.length || Number(resultado && resultado.cantidadOpciones || 1)));
    var retorno = original.mostrarResultado(resultado);
    var modal;

    ajustarModal(cantidad);
    modal = document.getElementById(MODAL_ID);
    if (modal) {
      modal.addEventListener('click', function () {
        window.setTimeout(function () {
          ajustarModal(cantidad);
        }, 0);
      });
    }

    return retorno;
  }

  function actualizarSeleccionModal() {
    var modal = document.getElementById(MODAL_ID);
    var cantidad = modal
      ? Number(modal.getAttribute('data-cantidad-opciones') || modal.querySelectorAll('.ia-option').length || 1)
      : 1;
    var retorno = original.actualizarSeleccionModal();
    ajustarModal(cantidad);
    return retorno;
  }

  window.EstudianteMVPIARecomendacion = Object.freeze(Object.assign({}, original, {
    mostrarResultado: mostrarResultado,
    actualizarSeleccionModal: actualizarSeleccionModal,
    __cantidadVariable: true,
    version: '4.2.0'
  }));
})(window, document);
