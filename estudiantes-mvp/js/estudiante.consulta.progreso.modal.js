/*
  Modal de progreso para la consulta académica.
  - Aparece inmediatamente al pulsar "Consultar datos".
  - Presenta el proceso con mensajes claros y sin términos técnicos.
  - Se cierra automáticamente cuando la consulta termina.
*/
(function (window, document) {
  'use strict';

  if (window.EstudianteMVPConsultaProgreso) return;

  var MODAL_ID = 'modalConsultaProgresoAcademico';
  var STYLE_ID = 'modalConsultaProgresoAcademicoStyles';
  var MIN_VISIBLE_MS = 1200;
  var inicio = 0;
  var timers = [];
  var etapaActual = 0;

  var ETAPAS = [
    {
      titulo: 'Buscando tus datos académicos',
      detalle: 'Estamos localizando tu registro institucional.'
    },
    {
      titulo: 'Verificando tu información',
      detalle: 'Confirmamos que los datos correspondan a tu cédula.'
    },
    {
      titulo: 'Revisando tu período académico',
      detalle: 'Comprobamos el período asociado a tu registro.'
    },
    {
      titulo: 'Validando tu carrera',
      detalle: 'Revisamos la carrera registrada para tu proceso.'
    },
    {
      titulo: 'Comprobando tus propuestas',
      detalle: 'Verificamos si ya realizaste un envío anteriormente.'
    }
  ];

  function asegurarEstilos() {
    var style;

    if (document.getElementById(STYLE_ID)) return;

    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'html.consulta-progreso-abierta,body.consulta-progreso-abierta{overflow:hidden;}',
      '.consulta-progreso{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;padding:20px;font-family:inherit;}',
      '.consulta-progreso[hidden]{display:none;}',
      '.consulta-progreso__fondo{position:absolute;inset:0;background:rgba(4,18,38,.76);backdrop-filter:blur(7px);}',
      '.consulta-progreso__tarjeta{position:relative;width:min(620px,100%);max-height:92vh;overflow:auto;border-radius:28px;background:#fff;box-shadow:0 30px 100px rgba(4,18,38,.38);border:1px solid rgba(201,173,99,.65);padding:30px;}',
      '.consulta-progreso__cabecera{display:grid;grid-template-columns:64px 1fr;gap:18px;align-items:center;margin-bottom:22px;}',
      '.consulta-progreso__icono{position:relative;width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:#0b2d59;color:#fff;font-size:24px;font-weight:900;box-shadow:0 0 0 7px rgba(201,173,99,.18);}',
      '.consulta-progreso__icono::after{content:"";position:absolute;inset:-7px;border-radius:50%;border:3px solid transparent;border-top-color:#d3b761;border-right-color:#d3b761;animation:consultaProgresoGiro 1s linear infinite;}',
      '.consulta-progreso.is-complete .consulta-progreso__icono::after,.consulta-progreso.is-error .consulta-progreso__icono::after{display:none;}',
      '.consulta-progreso.is-complete .consulta-progreso__icono{background:#16794a;}',
      '.consulta-progreso.is-error .consulta-progreso__icono{background:#b42318;}',
      '.consulta-progreso__kicker{margin:0 0 5px;color:#8a6b24;font-size:12px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;}',
      '.consulta-progreso__titulo{margin:0;color:#071d38;font-size:clamp(23px,4vw,32px);line-height:1.12;}',
      '.consulta-progreso__detalle{margin:9px 0 0;color:#52647b;font-size:15px;line-height:1.55;}',
      '.consulta-progreso__barra{height:8px;border-radius:999px;background:#e8edf4;overflow:hidden;margin:0 0 22px;}',
      '.consulta-progreso__barra span{display:block;width:20%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#0b2d59,#d3b761);transition:width .4s ease;}',
      '.consulta-progreso__lista{display:grid;gap:9px;margin:0;padding:0;list-style:none;}',
      '.consulta-progreso__paso{display:grid;grid-template-columns:32px 1fr;gap:12px;align-items:center;padding:11px 13px;border:1px solid #e1e7ef;border-radius:16px;background:#f8fafc;color:#68778b;transition:all .25s ease;}',
      '.consulta-progreso__numero{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;background:#e5ebf2;color:#53647a;font-size:12px;font-weight:900;}',
      '.consulta-progreso__paso strong{display:block;color:inherit;font-size:14px;line-height:1.25;}',
      '.consulta-progreso__paso.is-active{border-color:#d3b761;background:#fff9e9;color:#0b2d59;transform:translateX(3px);}',
      '.consulta-progreso__paso.is-active .consulta-progreso__numero{background:#0b2d59;color:#fff;box-shadow:0 0 0 5px rgba(11,45,89,.10);}',
      '.consulta-progreso__paso.is-done{border-color:#b7dec9;background:#f2fbf6;color:#16683f;}',
      '.consulta-progreso__paso.is-done .consulta-progreso__numero{background:#16794a;color:#fff;}',
      '.consulta-progreso__nota{margin:18px 0 0;padding-top:16px;border-top:1px solid #e7ebf1;color:#68778b;font-size:13px;text-align:center;}',
      '.consulta-progreso__acciones{display:none;justify-content:flex-end;margin-top:20px;}',
      '.consulta-progreso.is-error .consulta-progreso__acciones{display:flex;}',
      '.consulta-progreso__boton{border:0;border-radius:999px;padding:12px 22px;background:#0b2d59;color:#fff;font:inherit;font-weight:900;cursor:pointer;}',
      '@keyframes consultaProgresoGiro{to{transform:rotate(360deg);}}',
      '@media(max-width:560px){.consulta-progreso{padding:12px;}.consulta-progreso__tarjeta{padding:24px 18px;border-radius:23px;}.consulta-progreso__cabecera{grid-template-columns:54px 1fr;gap:14px;}.consulta-progreso__icono{width:54px;height:54px;}.consulta-progreso__paso{padding:10px;}}'
    ].join('\n');

    document.head.appendChild(style);
  }

  function limpiarTimers() {
    timers.forEach(function (timer) {
      window.clearTimeout(timer);
    });
    timers = [];
  }

  function obtenerModal() {
    return document.getElementById(MODAL_ID);
  }

  function crearModal() {
    var modal = document.createElement('div');
    var lista = ETAPAS.map(function (etapa, index) {
      return [
        '<li class="consulta-progreso__paso" data-consulta-paso="', index, '">',
        '<span class="consulta-progreso__numero">', index + 1, '</span>',
        '<strong>', etapa.titulo, '</strong>',
        '</li>'
      ].join('');
    }).join('');

    modal.id = MODAL_ID;
    modal.className = 'consulta-progreso';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'consultaProgresoTitulo');
    modal.innerHTML = [
      '<div class="consulta-progreso__fondo"></div>',
      '<section class="consulta-progreso__tarjeta">',
      '<div class="consulta-progreso__cabecera">',
      '<div class="consulta-progreso__icono" data-consulta-icono aria-hidden="true">···</div>',
      '<div>',
      '<p class="consulta-progreso__kicker">Consulta académica</p>',
      '<h2 class="consulta-progreso__titulo" id="consultaProgresoTitulo">Estamos buscando tus datos</h2>',
      '<p class="consulta-progreso__detalle" data-consulta-detalle>Espera un momento mientras revisamos tu información.</p>',
      '</div>',
      '</div>',
      '<div class="consulta-progreso__barra" aria-hidden="true"><span data-consulta-barra></span></div>',
      '<ol class="consulta-progreso__lista">', lista, '</ol>',
      '<p class="consulta-progreso__nota">Este proceso puede tardar unos segundos. No cierres esta ventana.</p>',
      '<div class="consulta-progreso__acciones">',
      '<button type="button" class="consulta-progreso__boton" data-consulta-cerrar>Volver a intentar</button>',
      '</div>',
      '</section>'
    ].join('');

    document.body.appendChild(modal);
    return modal;
  }

  function actualizarEtapa(indice) {
    var modal = obtenerModal();
    var titulo;
    var detalle;
    var barra;
    var pasos;

    if (!modal || !ETAPAS[indice]) return false;

    etapaActual = indice;
    titulo = modal.querySelector('.consulta-progreso__titulo');
    detalle = modal.querySelector('[data-consulta-detalle]');
    barra = modal.querySelector('[data-consulta-barra]');
    pasos = modal.querySelectorAll('[data-consulta-paso]');

    if (titulo) titulo.textContent = ETAPAS[indice].titulo;
    if (detalle) detalle.textContent = ETAPAS[indice].detalle;
    if (barra) barra.style.width = Math.round(((indice + 1) / ETAPAS.length) * 100) + '%';

    Array.prototype.forEach.call(pasos, function (paso, pasoIndice) {
      var numero = paso.querySelector('.consulta-progreso__numero');
      paso.classList.toggle('is-active', pasoIndice === indice);
      paso.classList.toggle('is-done', pasoIndice < indice);
      if (numero) numero.textContent = pasoIndice < indice ? '✓' : String(pasoIndice + 1);
    });

    return true;
  }

  function abrir() {
    var modal;

    asegurarEstilos();
    cerrarInmediato();
    limpiarTimers();

    modal = crearModal();
    inicio = Date.now();
    etapaActual = 0;
    document.documentElement.classList.add('consulta-progreso-abierta');
    document.body.classList.add('consulta-progreso-abierta');
    actualizarEtapa(0);

    [1, 2, 3, 4].forEach(function (indice) {
      timers.push(window.setTimeout(function () {
        actualizarEtapa(indice);
      }, indice * 1000));
    });

    return modal;
  }

  function completar() {
    var modal = obtenerModal();
    var titulo;
    var detalle;
    var icono;
    var barra;
    var pasos;

    if (!modal) return false;

    limpiarTimers();
    modal.classList.remove('is-error');
    modal.classList.add('is-complete');
    titulo = modal.querySelector('.consulta-progreso__titulo');
    detalle = modal.querySelector('[data-consulta-detalle]');
    icono = modal.querySelector('[data-consulta-icono]');
    barra = modal.querySelector('[data-consulta-barra]');
    pasos = modal.querySelectorAll('[data-consulta-paso]');

    if (titulo) titulo.textContent = 'Información encontrada';
    if (detalle) detalle.textContent = 'Tus datos académicos están listos para continuar.';
    if (icono) icono.textContent = '✓';
    if (barra) barra.style.width = '100%';

    Array.prototype.forEach.call(pasos, function (paso) {
      var numero = paso.querySelector('.consulta-progreso__numero');
      paso.classList.remove('is-active');
      paso.classList.add('is-done');
      if (numero) numero.textContent = '✓';
    });

    return true;
  }

  function mostrarError(mensaje, alCerrar) {
    var modal = obtenerModal() || abrir();
    var titulo;
    var detalle;
    var icono;
    var barra;
    var pasos;
    var boton;

    limpiarTimers();
    modal.classList.remove('is-complete');
    modal.classList.add('is-error');
    titulo = modal.querySelector('.consulta-progreso__titulo');
    detalle = modal.querySelector('[data-consulta-detalle]');
    icono = modal.querySelector('[data-consulta-icono]');
    barra = modal.querySelector('[data-consulta-barra]');
    pasos = modal.querySelectorAll('[data-consulta-paso]');
    boton = modal.querySelector('[data-consulta-cerrar]');

    if (titulo) titulo.textContent = 'No pudimos completar la consulta';
    if (detalle) detalle.textContent = mensaje || 'Revisa la cédula e intenta nuevamente.';
    if (icono) icono.textContent = '!';
    if (barra) barra.style.width = Math.max(20, ((etapaActual + 1) / ETAPAS.length) * 100) + '%';

    Array.prototype.forEach.call(pasos, function (paso, index) {
      paso.classList.remove('is-active');
      paso.classList.toggle('is-done', index < etapaActual);
    });

    if (boton) {
      boton.onclick = function () {
        cerrarInmediato();
        if (typeof alCerrar === 'function') alCerrar();
      };
      window.setTimeout(function () {
        boton.focus();
      }, 50);
    }
  }

  function cerrar() {
    var transcurrido = Date.now() - inicio;
    var espera = Math.max(260, MIN_VISIBLE_MS - transcurrido);

    completar();

    return new Promise(function (resolve) {
      window.setTimeout(function () {
        cerrarInmediato();
        resolve(true);
      }, espera);
    });
  }

  function cerrarInmediato() {
    var modal = obtenerModal();

    limpiarTimers();
    if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
    document.documentElement.classList.remove('consulta-progreso-abierta');
    document.body.classList.remove('consulta-progreso-abierta');
  }

  window.EstudianteMVPConsultaProgreso = Object.freeze({
    abrir: abrir,
    actualizarEtapa: actualizarEtapa,
    completar: completar,
    mostrarError: mostrarError,
    cerrar: cerrar,
    cerrarInmediato: cerrarInmediato
  });
})(window, document);
