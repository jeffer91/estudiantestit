/*
  Interfaz de IA por propuesta:
  - Muestra un modal de progreso que cambia de etapa mientras trabajan las IA.
  - Presenta únicamente 3 opciones finales: diagnóstico, proceso y análisis final.
  - Marca una sola opción como recomendada.
  - Nunca aplica un título automáticamente.
*/
(function (window, document) {
  'use strict';

  var MODAL_RESULTADO_ID = 'modalTresTitulosIA';
  var MODAL_PROGRESO_ID = 'modalProgresoTitulosIA';
  var STYLE_ID = 'ia-titulos-propuesta-estilos';
  var intervaloProgreso = null;
  var indiceMensaje = 0;
  var mensajesProgreso = [
    'Analizando la información de la propuesta',
    'Generando nueve alternativas internas',
    'Revisando diagnóstico, proceso y análisis final',
    'Comparando claridad, carrera y contexto',
    'Preparando las tres mejores opciones'
  ];

  function instalarEstilos() {
    var style;

    if (document.getElementById(STYLE_ID)) return;

    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.suggestion-card.is-recommended{border:2px solid #c9ad63;box-shadow:0 14px 34px rgba(138,107,36,.15)}',
      '.ia-stage-badge{display:inline-flex;align-items:center;margin-left:7px;padding:4px 8px;border-radius:999px;background:#e8eef8;color:#29496f;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}',
      '.ia-recommended-badge{display:inline-flex;align-items:center;margin-left:7px;padding:4px 8px;border-radius:999px;background:#fff1bd;color:#775708;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}',
      '.ia-modal{position:fixed;inset:0;z-index:10030;display:flex;align-items:center;justify-content:center;padding:18px;font-family:inherit}',
      '.ia-modal__backdrop{position:absolute;inset:0;background:rgba(15,23,42,.76);backdrop-filter:blur(7px)}',
      '.ia-modal__card{position:relative;width:min(980px,100%);max-height:92vh;overflow:auto;border-radius:28px;background:#f8fafc;padding:28px;border:3px solid #2f6df6;box-shadow:0 30px 90px rgba(15,23,42,.36)}',
      '.ia-modal__close{position:absolute;top:16px;right:16px;width:40px;height:40px;border:0;border-radius:50%;background:#e8edf5;color:#0f172a;font-size:22px;cursor:pointer}',
      '.ia-modal__kicker{display:inline-flex;padding:7px 13px;border-radius:999px;background:#eee7ff;color:#6d28d9;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.07em}',
      '.ia-modal__title{margin:12px 48px 8px 0;color:#111827;font-size:clamp(25px,4vw,38px);line-height:1.08}',
      '.ia-modal__help{margin:0 0 22px;color:#52637a;line-height:1.55}',
      '.ia-options{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}',
      '.ia-option{display:flex;flex-direction:column;padding:17px;border-radius:20px;background:#fff;border:1px solid #dce5f0}',
      '.ia-option.is-recommended{border:2px solid #c9ad63;background:linear-gradient(145deg,#fffaf0,#fff)}',
      '.ia-option.is-selected{border:2px solid #168a4b;background:#f1fff7}',
      '.ia-option__head{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-bottom:10px;color:#64748b;font-size:12px;font-weight:900;text-transform:uppercase}',
      '.ia-option__text{margin:0 0 11px;color:#111827;font-size:16px;font-weight:800;line-height:1.45}',
      '.ia-option__why{margin:0 0 15px;color:#607086;font-size:13px;line-height:1.45}',
      '.ia-option__button{margin-top:auto;border:0;border-radius:999px;padding:11px 16px;background:linear-gradient(135deg,#6d35f5,#2f6df6);color:#fff;font-weight:900;cursor:pointer}',
      '.ia-option.is-selected .ia-option__button{background:#168a4b}',
      '.ia-modal__footer{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:22px;padding-top:18px;border-top:1px solid #dbe4f0}',
      '.ia-modal__summary{color:#52637a;font-weight:700}',
      '.ia-modal__done{border:0;border-radius:999px;padding:12px 22px;background:#163a67;color:#fff;font-weight:900;cursor:pointer}',
      '.ia-modal__done:disabled{background:#dfe7f2;color:#64748b;cursor:not-allowed}',
      '.ia-progress__card{width:min(560px,100%);text-align:center;overflow:hidden}',
      '.ia-progress__spinner{width:64px;height:64px;margin:6px auto 18px;border-radius:50%;border:7px solid #dce7fb;border-top-color:#2f6df6;animation:ia-spin 1s linear infinite}',
      '.ia-progress__process{display:inline-flex;padding:6px 12px;border-radius:999px;background:#e8eef8;color:#29496f;font-size:12px;font-weight:900}',
      '.ia-progress__stage{margin:18px 0 8px;color:#10213d;font-size:24px;font-weight:900;line-height:1.2}',
      '.ia-progress__detail{margin:0;color:#64748b;line-height:1.5}',
      '.ia-progress__dots{display:flex;justify-content:center;gap:7px;margin-top:20px}',
      '.ia-progress__dots span{width:9px;height:9px;border-radius:50%;background:#cbd5e1;animation:ia-pulse 1.2s infinite ease-in-out}',
      '.ia-progress__dots span:nth-child(2){animation-delay:.18s}.ia-progress__dots span:nth-child(3){animation-delay:.36s}',
      '@keyframes ia-spin{to{transform:rotate(360deg)}}',
      '@keyframes ia-pulse{0%,80%,100%{transform:scale(.7);opacity:.45}40%{transform:scale(1.15);opacity:1}}',
      '@media(max-width:820px){.ia-options{grid-template-columns:1fr}.ia-modal__card{padding:22px 16px}.ia-modal__footer{align-items:stretch;flex-direction:column}.ia-modal__done{width:100%}}'
    ].join('');

    document.head.appendChild(style);
  }

  function mostrarProgreso(datos) {
    var modal;
    var backdrop;
    var card;
    var spinner;
    var process;
    var stage;
    var detail;
    var dots;

    instalarEstilos();
    cerrarProgreso();
    cerrarResultado();

    datos = datos || {};
    indiceMensaje = 0;

    modal = document.createElement('div');
    modal.id = MODAL_PROGRESO_ID;
    modal.className = 'ia-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-live', 'polite');

    backdrop = document.createElement('div');
    backdrop.className = 'ia-modal__backdrop';

    card = document.createElement('div');
    card.className = 'ia-modal__card ia-progress__card';

    spinner = document.createElement('div');
    spinner.className = 'ia-progress__spinner';

    process = document.createElement('div');
    process.className = 'ia-progress__process';
    process.setAttribute('data-ia-proceso', '');
    process.textContent = 'Proceso 1 de ' + Number(datos.maxProcesos || 3);

    stage = document.createElement('div');
    stage.className = 'ia-progress__stage';
    stage.setAttribute('data-ia-etapa', '');
    stage.textContent = mensajesProgreso[0];

    detail = document.createElement('p');
    detail.className = 'ia-progress__detail';
    detail.setAttribute('data-ia-detalle', '');
    detail.textContent = 'Estamos preparando opciones claras y relacionadas con tu propuesta.';

    dots = document.createElement('div');
    dots.className = 'ia-progress__dots';
    dots.innerHTML = '<span></span><span></span><span></span>';

    card.appendChild(spinner);
    card.appendChild(process);
    card.appendChild(stage);
    card.appendChild(detail);
    card.appendChild(dots);
    modal.appendChild(backdrop);
    modal.appendChild(card);
    document.body.appendChild(modal);

    intervaloProgreso = window.setInterval(function () {
      var actual = document.getElementById(MODAL_PROGRESO_ID);
      var etapa = actual ? actual.querySelector('[data-ia-etapa]') : null;

      if (!actual || !etapa) return;
      indiceMensaje = (indiceMensaje + 1) % mensajesProgreso.length;
      etapa.textContent = mensajesProgreso[indiceMensaje];
    }, 2400);
  }

  function actualizarProgreso(detalle) {
    var modal = document.getElementById(MODAL_PROGRESO_ID);
    var process;
    var stage;
    var detail;

    if (!modal) return;

    detalle = detalle || {};
    process = modal.querySelector('[data-ia-proceso]');
    stage = modal.querySelector('[data-ia-etapa]');
    detail = modal.querySelector('[data-ia-detalle]');

    if (process && detalle.proceso) {
      process.textContent = 'Proceso ' + detalle.proceso + ' de ' + Number(detalle.maxProcesos || 3);
    }
    if (stage && detalle.mensaje) {
      stage.textContent = detalle.mensaje;
    }
    if (detail) {
      detail.textContent = textoEtapa(detalle.etapa, detalle.proveedor);
    }
  }

  function textoEtapa(etapa, proveedor) {
    var mapa = {
      generacion: 'Una IA está creando nueve alternativas internas.',
      validacion: 'La app está revisando estructura, extensión y relación con la carrera.',
      correccion: 'Otra IA está corrigiendo los mismos títulos sin cambiar el tema.',
      comparacion: 'Se está comparando la versión original con la corregida.',
      reinicio: 'El proceso continuará con otro par de proveedores.',
      finalizacion: 'Se están preparando las tres opciones que verá el estudiante.'
    };
    var texto = mapa[etapa] || 'El proceso continúa trabajando en tu propuesta.';

    if (proveedor) texto += ' Proveedor actual: ' + proveedor + '.';
    return texto;
  }

  function cerrarProgreso() {
    var modal = document.getElementById(MODAL_PROGRESO_ID);

    if (intervaloProgreso) {
      window.clearInterval(intervaloProgreso);
      intervaloProgreso = null;
    }
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  function marcarPagina(numeroPropuesta, opciones) {
    instalarEstilos();

    (Array.isArray(opciones) ? opciones : []).forEach(function (item, index) {
      var numero = Number(item.numero || index + 1);
      var tarjeta = document.querySelector(
        '[data-sugerencia-card="' + Number(numeroPropuesta) + '-' + numero + '"]'
      );
      var cabecera;
      var fuerte;

      if (!tarjeta) return;

      tarjeta.classList.toggle('is-recommended', item.recomendada === true);
      cabecera = tarjeta.querySelector('.suggestion-card__head');

      if (!cabecera) return;

      Array.prototype.forEach.call(
        cabecera.querySelectorAll('.ia-stage-badge,.ia-recommended-badge'),
        function (badge) {
          if (badge.parentNode) badge.parentNode.removeChild(badge);
        }
      );

      fuerte = cabecera.querySelector('strong');
      if (fuerte) fuerte.textContent = 'Opción ' + numero;
      cabecera.appendChild(crearStageBadge(item.nombreEtapa || item.etapa));
      if (item.recomendada === true) cabecera.appendChild(crearRecommendedBadge());
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
    var options;
    var footer;
    var summary;
    var done;
    var numeroPropuesta;
    var lista;

    instalarEstilos();
    cerrarProgreso();
    cerrarResultado();

    resultado = resultado || {};
    numeroPropuesta = Number(resultado.numeroPropuesta || 1);
    lista = Array.isArray(resultado.opcionesFinales) ? resultado.opcionesFinales : [];

    modal = document.createElement('div');
    modal.id = MODAL_RESULTADO_ID;
    modal.className = 'ia-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('data-propuesta', String(numeroPropuesta));

    backdrop = document.createElement('div');
    backdrop.className = 'ia-modal__backdrop';

    card = document.createElement('div');
    card.className = 'ia-modal__card';

    close = document.createElement('button');
    close.type = 'button';
    close.className = 'ia-modal__close';
    close.setAttribute('aria-label', 'Cerrar');
    close.textContent = '×';
    close.addEventListener('click', cerrarResultado);

    kicker = document.createElement('span');
    kicker.className = 'ia-modal__kicker';
    kicker.textContent = '3 opciones validadas';

    title = document.createElement('h2');
    title.className = 'ia-modal__title';
    title.textContent = 'Elige el título que más te convenga';

    help = document.createElement('p');
    help.className = 'ia-modal__help';
    help.textContent = resultado.mensaje ||
      'Se analizaron nueve alternativas internas y se muestra una opción de diagnóstico, una de proceso y una de análisis final.';

    options = document.createElement('div');
    options.className = 'ia-options';

    lista.forEach(function (item, index) {
      options.appendChild(crearOpcion(numeroPropuesta, item, index));
    });

    footer = document.createElement('div');
    footer.className = 'ia-modal__footer';

    summary = document.createElement('div');
    summary.className = 'ia-modal__summary';
    summary.setAttribute('data-ia-resumen', '');

    done = document.createElement('button');
    done.type = 'button';
    done.className = 'ia-modal__done';
    done.setAttribute('data-ia-finalizar', '');
    done.textContent = 'Selecciona un título';
    done.disabled = true;
    done.addEventListener('click', function () {
      if (!done.disabled) cerrarResultado();
    });

    footer.appendChild(summary);
    footer.appendChild(done);

    card.appendChild(close);
    card.appendChild(kicker);
    card.appendChild(title);
    card.appendChild(help);
    card.appendChild(options);
    card.appendChild(footer);
    modal.appendChild(backdrop);
    modal.appendChild(card);
    document.body.appendChild(modal);

    actualizarSeleccionModal();
  }

  function crearOpcion(numeroPropuesta, item, index) {
    var card = document.createElement('article');
    var head = document.createElement('div');
    var text = document.createElement('p');
    var why = document.createElement('p');
    var button = document.createElement('button');
    var numero = Number(item.numero || index + 1);

    card.className = 'ia-option' + (item.recomendada === true ? ' is-recommended' : '');
    card.setAttribute('data-ia-opcion', String(numero));

    head.className = 'ia-option__head';
    head.textContent = 'Opción ' + numero;
    head.appendChild(crearStageBadge(item.nombreEtapa || item.etapa));
    if (item.recomendada === true) head.appendChild(crearRecommendedBadge());

    text.className = 'ia-option__text';
    text.textContent = item.titulo;

    why.className = 'ia-option__why';
    why.textContent = item.justificacion ||
      'Opción seleccionada por su relación con la propuesta y el enfoque académico.';

    button.type = 'button';
    button.className = 'ia-option__button';
    button.textContent = 'Usar este título';
    button.addEventListener('click', function (evento) {
      evento.preventDefault();
      seleccionarTitulo(numeroPropuesta, numero);
    });

    card.appendChild(head);
    card.appendChild(text);
    card.appendChild(why);
    card.appendChild(button);

    return card;
  }

  function seleccionarTitulo(numeroPropuesta, numeroSugerencia) {
    var state = window.EstudianteMVPState;
    var ui = window.EstudianteMVPUI;
    var memoria = window.EstudianteMVPMemoria || null;
    var propuesta;

    if (!state || typeof state.seleccionarSugerencia !== 'function') return;

    propuesta = state.seleccionarSugerencia(numeroPropuesta, numeroSugerencia);
    if (!propuesta) return;

    if (ui && typeof ui.escribirPropuestaEnFormulario === 'function') {
      ui.escribirPropuestaEnFormulario(propuesta);
    }
    if (ui && typeof ui.marcarSugerenciaUsada === 'function') {
      ui.marcarSugerenciaUsada(numeroPropuesta, numeroSugerencia);
    }
    if (ui && typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado(
        '#p' + numeroPropuesta + 'EstadoIA',
        'Título seleccionado para la propuesta ' + numeroPropuesta + '.',
        'success'
      );
    }
    if (memoria && typeof memoria.guardarDesdeState === 'function') {
      memoria.guardarDesdeState({
        pasoActual: 'propuestas',
        propuestaActual: numeroPropuesta
      });
    }

    actualizarSeleccionModal();
  }

  function actualizarSeleccionModal() {
    var modal = document.getElementById(MODAL_RESULTADO_ID);
    var state = window.EstudianteMVPState;
    var numeroPropuesta;
    var propuesta;
    var seleccion;
    var summary;
    var done;

    if (!modal || !state || typeof state.obtenerPropuesta !== 'function') return;

    numeroPropuesta = Number(modal.getAttribute('data-propuesta') || 1);
    propuesta = state.obtenerPropuesta(numeroPropuesta) || {};
    seleccion = Number(propuesta.sugerenciaSeleccionadaNumero || 0);

    Array.prototype.forEach.call(
      modal.querySelectorAll('[data-ia-opcion]'),
      function (tarjeta) {
        var activa = Number(tarjeta.getAttribute('data-ia-opcion') || 0) === seleccion;
        var boton = tarjeta.querySelector('button');

        tarjeta.classList.toggle('is-selected', activa);
        if (boton) boton.textContent = activa ? 'Título seleccionado' : 'Usar este título';
      }
    );

    summary = modal.querySelector('[data-ia-resumen]');
    done = modal.querySelector('[data-ia-finalizar]');

    if (summary) {
      summary.textContent = seleccion
        ? 'Listo: elegiste el título de esta propuesta.'
        : 'Elige una de las tres opciones para continuar.';
    }
    if (done) {
      done.disabled = !seleccion;
      done.textContent = seleccion ? 'Guardar selección y cerrar' : 'Selecciona un título';
    }
  }

  function crearStageBadge(texto) {
    var badge = document.createElement('span');
    badge.className = 'ia-stage-badge';
    badge.textContent = nombreCortoEtapa(texto);
    return badge;
  }

  function crearRecommendedBadge() {
    var badge = document.createElement('span');
    badge.className = 'ia-recommended-badge';
    badge.textContent = 'Recomendada';
    return badge;
  }

  function nombreCortoEtapa(valor) {
    var texto = String(valor || '').toLowerCase();

    if (texto.indexOf('diagn') >= 0 || texto.indexOf('inicial') >= 0) return 'Diagnóstico';
    if (texto.indexOf('propuesta') >= 0 || texto.indexOf('mejora') >= 0 || texto.indexOf('proceso') >= 0) return 'Proceso';
    return 'Análisis final';
  }

  function cerrarResultado() {
    var modal = document.getElementById(MODAL_RESULTADO_ID);
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
  }

  window.EstudianteMVPIARecomendacion = Object.freeze({
    mostrarProgreso: mostrarProgreso,
    actualizarProgreso: actualizarProgreso,
    cerrarProgreso: cerrarProgreso,
    marcarPagina: marcarPagina,
    mostrarResultado: mostrarResultado,
    actualizarSeleccionModal: actualizarSeleccionModal,
    cerrar: cerrarResultado,
    cerrarResultado: cerrarResultado,
    version: '3.0.0'
  });
})(window, document);
