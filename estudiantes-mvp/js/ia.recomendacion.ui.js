/*
  Interfaz IA 3x3:
  - Muestra 9 títulos agrupados en 3 secciones.
  - Marca una recomendación por sección.
  - No aplica títulos automáticamente.
*/
(function (window, document) {
  'use strict';

  var MODAL_ID = 'modalNueveTitulosIA';
  var STYLE_ID = 'ia-nueve-estilos';

  function instalarEstilos() {
    var style;
    if (document.getElementById(STYLE_ID)) return;

    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.suggestion-card.is-recommended{border:2px solid #c9ad63;box-shadow:0 14px 34px rgba(138,107,36,.15)}',
      '.ia-recommended-badge{display:inline-flex;align-items:center;margin-left:8px;padding:4px 9px;border-radius:999px;background:#fff1bd;color:#775708;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}',
      '.ia9-modal{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:18px;font-family:inherit}',
      '.ia9-modal__backdrop{position:absolute;inset:0;background:rgba(15,23,42,.76);backdrop-filter:blur(7px)}',
      '.ia9-modal__card{position:relative;width:min(1080px,100%);max-height:92vh;overflow:auto;border-radius:28px;background:#f8fafc;padding:28px;border:3px solid #2f6df6;box-shadow:0 30px 90px rgba(15,23,42,.36)}',
      '.ia9-modal__close{position:absolute;top:16px;right:16px;width:40px;height:40px;border:0;border-radius:50%;background:#e8edf5;color:#0f172a;font-size:22px;cursor:pointer}',
      '.ia9-modal__kicker{display:inline-flex;padding:7px 13px;border-radius:999px;background:#eee7ff;color:#6d28d9;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.07em}',
      '.ia9-modal__title{margin:12px 48px 8px 0;color:#111827;font-size:clamp(25px,4vw,38px);line-height:1.08}',
      '.ia9-modal__help{margin:0 0 22px;color:#52637a;line-height:1.55}',
      '.ia9-modal__sections{display:grid;gap:22px}',
      '.ia9-section{padding:18px;border-radius:22px;background:#fff;border:1px solid #dbe4f0}',
      '.ia9-section__head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:13px}',
      '.ia9-section__head h3{margin:0;color:#10213d;font-size:20px}',
      '.ia9-section__state{font-size:12px;font-weight:800;color:#64748b}',
      '.ia9-section__titles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}',
      '.ia9-title{display:flex;flex-direction:column;padding:15px;border-radius:18px;background:#fbfdff;border:1px solid #dce5f0}',
      '.ia9-title.is-recommended{border:2px solid #c9ad63;background:linear-gradient(145deg,#fffaf0,#fff)}',
      '.ia9-title.is-selected{border:2px solid #168a4b;background:#f1fff7}',
      '.ia9-title__head{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-bottom:9px;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase}',
      '.ia9-title__text{margin:0 0 10px;color:#111827;font-size:16px;font-weight:800;line-height:1.45}',
      '.ia9-title__why{margin:0 0 14px;color:#607086;font-size:13px;line-height:1.45}',
      '.ia9-title__button{margin-top:auto;border:0;border-radius:999px;padding:11px 16px;background:linear-gradient(135deg,#6d35f5,#2f6df6);color:#fff;font-weight:900;cursor:pointer}',
      '.ia9-title.is-selected .ia9-title__button{background:#168a4b}',
      '.ia9-modal__footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:22px;padding-top:18px;border-top:1px solid #dbe4f0}',
      '.ia9-modal__summary{color:#52637a;font-weight:700}',
      '.ia9-modal__done{border:0;border-radius:999px;padding:12px 22px;background:#dfe7f2;color:#10213d;font-weight:900;cursor:pointer}',
      '@media(max-width:850px){.ia9-section__titles{grid-template-columns:1fr}.ia9-modal__card{padding:22px 16px}.ia9-modal__footer{align-items:stretch;flex-direction:column}.ia9-modal__done{width:100%}}'
    ].join('');
    document.head.appendChild(style);
  }

  function marcarPagina(secciones) {
    instalarEstilos();
    (Array.isArray(secciones) ? secciones : []).forEach(function (seccion) {
      (Array.isArray(seccion.titulos) ? seccion.titulos : []).forEach(function (item, index) {
        var numero = Number(item.numero || index + 1);
        var tarjeta = document.querySelector(
          '[data-sugerencia-card="' + Number(seccion.seccion) + '-' + numero + '"]'
        );
        var cabecera;

        if (!tarjeta) return;
        tarjeta.classList.toggle('is-recommended', item.recomendada === true);
        cabecera = tarjeta.querySelector('.suggestion-card__head');
        if (cabecera && item.recomendada === true && !cabecera.querySelector('.ia-recommended-badge')) {
          cabecera.appendChild(crearBadge());
        }
      });
    });
  }

  function mostrarResultado(resultado) {
    var modal;
    var backdrop;
    var card;
    var close;
    var kicker;
    var title;
    var help;
    var sections;
    var footer;
    var summary;
    var done;

    instalarEstilos();
    cerrar();

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'ia9-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    backdrop = document.createElement('div');
    backdrop.className = 'ia9-modal__backdrop';

    card = document.createElement('div');
    card.className = 'ia9-modal__card';

    close = document.createElement('button');
    close.type = 'button';
    close.className = 'ia9-modal__close';
    close.setAttribute('aria-label', 'Cerrar');
    close.textContent = '×';
    close.addEventListener('click', cerrar);

    kicker = document.createElement('span');
    kicker.className = 'ia9-modal__kicker';
    kicker.textContent = '9 sugerencias generadas';

    title = document.createElement('h2');
    title.className = 'ia9-modal__title';
    title.textContent = 'Elige un título para cada sección';

    help = document.createElement('p');
    help.className = 'ia9-modal__help';
    help.textContent = resultado && resultado.mensaje
      ? resultado.mensaje
      : 'Se muestran tres alternativas por sección. La recomendación es orientativa y tú decides cuál utilizar.';

    sections = document.createElement('div');
    sections.className = 'ia9-modal__sections';

    (resultado && Array.isArray(resultado.secciones) ? resultado.secciones : []).forEach(function (seccion) {
      sections.appendChild(crearSeccion(seccion));
    });

    footer = document.createElement('div');
    footer.className = 'ia9-modal__footer';
    summary = document.createElement('div');
    summary.className = 'ia9-modal__summary';
    summary.setAttribute('data-ia9-resumen', '');
    done = document.createElement('button');
    done.type = 'button';
    done.className = 'ia9-modal__done';
    done.textContent = 'Cerrar';
    done.addEventListener('click', cerrar);

    footer.appendChild(summary);
    footer.appendChild(done);

    card.appendChild(close);
    card.appendChild(kicker);
    card.appendChild(title);
    card.appendChild(help);
    card.appendChild(sections);
    card.appendChild(footer);
    modal.appendChild(backdrop);
    modal.appendChild(card);
    document.body.appendChild(modal);

    backdrop.addEventListener('click', cerrar);
    actualizarSeleccionModal();
  }

  function crearSeccion(seccion) {
    var bloque = document.createElement('section');
    var head = document.createElement('div');
    var title = document.createElement('h3');
    var state = document.createElement('span');
    var titles = document.createElement('div');

    bloque.className = 'ia9-section';
    bloque.setAttribute('data-ia9-seccion', String(seccion.seccion));
    head.className = 'ia9-section__head';
    title.textContent = 'Sección ' + seccion.seccion + ': ' + seccion.nombreEtapa;
    state.className = 'ia9-section__state';
    state.setAttribute('data-ia9-estado-seccion', String(seccion.seccion));
    titles.className = 'ia9-section__titles';

    (Array.isArray(seccion.titulos) ? seccion.titulos : []).forEach(function (item, index) {
      titles.appendChild(crearTitulo(seccion.seccion, item, index));
    });

    head.appendChild(title);
    head.appendChild(state);
    bloque.appendChild(head);
    bloque.appendChild(titles);
    return bloque;
  }

  function crearTitulo(seccion, item, index) {
    var card = document.createElement('article');
    var head = document.createElement('div');
    var text = document.createElement('p');
    var why = document.createElement('p');
    var button = document.createElement('button');
    var numero = Number(item.numero || index + 1);

    card.className = 'ia9-title' + (item.recomendada === true ? ' is-recommended' : '');
    card.setAttribute('data-ia9-titulo', seccion + '-' + numero);
    head.className = 'ia9-title__head';
    head.textContent = 'Título ' + numero;
    if (item.recomendada === true) head.appendChild(crearBadge());

    text.className = 'ia9-title__text';
    text.textContent = item.titulo;
    why.className = 'ia9-title__why';
    why.textContent = item.justificacion || 'Alternativa para esta sección.';

    button.type = 'button';
    button.className = 'ia9-title__button';
    button.textContent = 'Usar este título';
    button.setAttribute('data-accion', 'usar-sugerencia');
    button.setAttribute('data-propuesta', String(seccion));
    button.setAttribute('data-sugerencia', String(numero));
    button.addEventListener('click', function () {
      window.setTimeout(actualizarSeleccionModal, 50);
    });

    card.appendChild(head);
    card.appendChild(text);
    card.appendChild(why);
    card.appendChild(button);
    return card;
  }

  function actualizarSeleccionModal() {
    var modal = document.getElementById(MODAL_ID);
    var state = window.EstudianteMVPState;
    var seleccionadas = 0;
    var resumen;

    if (!modal || !state || typeof state.obtenerPropuesta !== 'function') return;

    [1, 2, 3].forEach(function (numero) {
      var propuesta = state.obtenerPropuesta(numero) || {};
      var seleccion = Number(propuesta.sugerenciaSeleccionadaNumero || 0);
      var estado = modal.querySelector('[data-ia9-estado-seccion="' + numero + '"]');

      Array.prototype.forEach.call(
        modal.querySelectorAll('[data-ia9-titulo^="' + numero + '-"]'),
        function (tarjeta) {
          var activa = tarjeta.getAttribute('data-ia9-titulo') === numero + '-' + seleccion;
          var boton = tarjeta.querySelector('button');
          tarjeta.classList.toggle('is-selected', activa);
          if (boton) boton.textContent = activa ? 'Título seleccionado' : 'Usar este título';
        }
      );

      if (seleccion) seleccionadas += 1;
      if (estado) estado.textContent = seleccion ? 'Seleccionado' : 'Pendiente';
    });

    resumen = modal.querySelector('[data-ia9-resumen]');
    if (resumen) {
      resumen.textContent = seleccionadas === 3
        ? 'Listo: elegiste un título en cada sección.'
        : 'Selecciones realizadas: ' + seleccionadas + ' de 3.';
    }
  }

  function crearBadge() {
    var badge = document.createElement('span');
    badge.className = 'ia-recommended-badge';
    badge.textContent = 'Recomendada';
    return badge;
  }

  function cerrar() {
    var modal = document.getElementById(MODAL_ID);
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  window.EstudianteMVPIARecomendacion = Object.freeze({
    marcarPagina: marcarPagina,
    mostrarResultado: mostrarResultado,
    actualizarSeleccionModal: actualizarSeleccionModal,
    cerrar: cerrar
  });
})(window, document);
