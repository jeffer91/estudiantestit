/*
  Modal de proceso para el envío final del estudiante.
  Se muestra mientras la aplicación guarda y confirma el registro.
*/
(function (window, document) {
  'use strict';

  var STYLE_ID = 'estudianteEnvioModalStyles';
  var MODAL_ID = 'modalGuardandoRegistro';
  var timerPasos = null;
  var pasoActual = 0;
  var overflowAnterior = '';
  var intentosInstalacion = 0;
  var MAX_INTENTOS = 200;

  var PASOS = [
    'Verificando la información',
    'Guardando las propuestas',
    'Confirmando el registro'
  ];

  function asegurarEstilos() {
    var style;

    if (document.getElementById(STYLE_ID)) return;

    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.student-save-modal{position:fixed;inset:0;z-index:12000;display:grid;place-items:center;padding:20px;font-family:inherit;}',
      '.student-save-modal__backdrop{position:absolute;inset:0;background:rgba(5,18,38,.82);backdrop-filter:blur(7px);}',
      '.student-save-modal__card{position:relative;width:min(520px,100%);border-radius:26px;background:#fff;border:2px solid #c9ad63;box-shadow:0 32px 100px rgba(3,15,34,.42);padding:30px;text-align:center;overflow:hidden;}',
      '.student-save-modal__card::before{content:"";position:absolute;inset:0 0 auto;height:7px;background:linear-gradient(90deg,#c9ad63,#f1da98,#c9ad63);background-size:200% 100%;animation:studentSaveShine 1.5s linear infinite;}',
      '.student-save-modal__kicker{display:inline-flex;align-items:center;margin:0 0 12px;padding:7px 14px;border-radius:999px;background:#edf4ff;color:#123b70;font-size:12px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;}',
      '.student-save-modal__title{margin:0;color:#071d3c;font-size:clamp(26px,4vw,34px);line-height:1.12;}',
      '.student-save-modal__text{margin:12px auto 22px;max-width:410px;color:#53657c;font-size:16px;line-height:1.55;}',
      '.student-save-modal__loader{width:82px;height:82px;margin:0 auto 22px;border-radius:50%;border:8px solid #e7eef8;border-top-color:#123b70;border-right-color:#c9ad63;animation:studentSaveSpin 1s linear infinite;}',
      '.student-save-modal__steps{display:grid;gap:9px;margin:0;padding:0;list-style:none;text-align:left;}',
      '.student-save-modal__step{display:flex;align-items:center;gap:11px;padding:12px 14px;border-radius:15px;background:#f4f7fb;color:#718096;font-weight:750;transition:background .25s ease,color .25s ease,transform .25s ease;}',
      '.student-save-modal__step span{display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border-radius:50%;background:#dce5f1;color:#50647d;font-size:13px;font-weight:900;}',
      '.student-save-modal__step.is-active{background:#eaf2ff;color:#0d3970;transform:translateX(3px);}',
      '.student-save-modal__step.is-active span{background:#123b70;color:#fff;box-shadow:0 0 0 5px rgba(18,59,112,.11);}',
      '.student-save-modal__step.is-done{background:#eef8f2;color:#247449;}',
      '.student-save-modal__step.is-done span{background:#247449;color:#fff;}',
      '.student-save-modal__note{margin:18px 0 0;padding:12px 14px;border-radius:14px;background:#fff8e8;color:#74591b;font-size:14px;font-weight:800;line-height:1.4;}',
      '@keyframes studentSaveSpin{to{transform:rotate(360deg);}}',
      '@keyframes studentSaveShine{to{background-position:-200% 0;}}',
      '@media (max-width:560px){.student-save-modal__card{padding:26px 18px 22px;border-radius:22px;}.student-save-modal__step{padding:11px 12px;}}',
      '@media (prefers-reduced-motion:reduce){.student-save-modal__loader,.student-save-modal__card::before{animation-duration:3s;}}'
    ].join('\n');

    document.head.appendChild(style);
  }

  function actualizarPasos() {
    var modal = document.getElementById(MODAL_ID);
    var pasos;

    if (!modal) return;

    pasos = modal.querySelectorAll('.student-save-modal__step');

    Array.prototype.forEach.call(pasos, function (item, index) {
      item.classList.toggle('is-done', index < pasoActual);
      item.classList.toggle('is-active', index === pasoActual);
    });
  }

  function iniciarProgreso() {
    detenerProgreso();
    pasoActual = 0;
    actualizarPasos();

    timerPasos = window.setInterval(function () {
      if (pasoActual < PASOS.length - 1) {
        pasoActual += 1;
        actualizarPasos();
      }
    }, 1700);
  }

  function detenerProgreso() {
    if (timerPasos) {
      window.clearInterval(timerPasos);
      timerPasos = null;
    }
  }

  function mostrar() {
    var modal;
    var backdrop;
    var card;
    var kicker;
    var titulo;
    var texto;
    var loader;
    var lista;
    var nota;

    if (document.getElementById(MODAL_ID)) return;

    asegurarEstilos();
    overflowAnterior = document.body.style.overflow || '';
    document.body.style.overflow = 'hidden';

    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'student-save-modal';
    modal.setAttribute('role', 'status');
    modal.setAttribute('aria-live', 'polite');
    modal.setAttribute('aria-busy', 'true');
    modal.setAttribute('aria-labelledby', MODAL_ID + 'Titulo');

    backdrop = document.createElement('div');
    backdrop.className = 'student-save-modal__backdrop';

    card = document.createElement('div');
    card.className = 'student-save-modal__card';

    kicker = document.createElement('p');
    kicker.className = 'student-save-modal__kicker';
    kicker.textContent = 'Envío en proceso';

    titulo = document.createElement('h2');
    titulo.id = MODAL_ID + 'Titulo';
    titulo.className = 'student-save-modal__title';
    titulo.textContent = 'Guardando tus propuestas';

    texto = document.createElement('p');
    texto.className = 'student-save-modal__text';
    texto.textContent = 'Estamos registrando la información. Este proceso puede tardar unos segundos.';

    loader = document.createElement('div');
    loader.className = 'student-save-modal__loader';
    loader.setAttribute('aria-hidden', 'true');

    lista = document.createElement('ol');
    lista.className = 'student-save-modal__steps';

    PASOS.forEach(function (nombre, index) {
      var item = document.createElement('li');
      var numero = document.createElement('span');
      var contenido = document.createElement('strong');

      item.className = 'student-save-modal__step';
      numero.textContent = String(index + 1);
      contenido.textContent = nombre;
      item.appendChild(numero);
      item.appendChild(contenido);
      lista.appendChild(item);
    });

    nota = document.createElement('p');
    nota.className = 'student-save-modal__note';
    nota.textContent = 'No cierres ni actualices esta página hasta que aparezca la confirmación.';

    card.appendChild(kicker);
    card.appendChild(titulo);
    card.appendChild(texto);
    card.appendChild(loader);
    card.appendChild(lista);
    card.appendChild(nota);
    modal.appendChild(backdrop);
    modal.appendChild(card);
    document.body.appendChild(modal);

    iniciarProgreso();
  }

  function cerrar() {
    var modal = document.getElementById(MODAL_ID);

    detenerProgreso();

    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }

    document.body.style.overflow = overflowAnterior;
  }

  function esProcesoDeEnvio(estado, mensaje) {
    if (estado !== true) return false;

    mensaje = String(mensaje || '').toLowerCase();

    return (
      mensaje.indexOf('enviando registro') >= 0 ||
      mensaje.indexOf('guardando registro') >= 0 ||
      mensaje.indexOf('guardando respaldo') >= 0 ||
      mensaje.indexOf('procesando envío') >= 0
    );
  }

  function instalar() {
    var ui = window.EstudianteMVPUI;
    var setCargandoOriginal;
    var reemplazo;

    if (!ui || ui.__modalEnvioInstalado === true) return false;
    if (typeof ui.setCargando !== 'function') return false;

    setCargandoOriginal = ui.setCargando.bind(ui);
    reemplazo = Object.assign({}, ui, {
      setCargando: function (estado, mensaje) {
        var resultado = setCargandoOriginal(estado, mensaje);

        if (esProcesoDeEnvio(estado, mensaje)) {
          mostrar();
        } else if (estado === false && document.getElementById(MODAL_ID)) {
          cerrar();
        }

        return resultado;
      }
    });

    Object.defineProperty(reemplazo, '__modalEnvioInstalado', {
      value: true,
      enumerable: false
    });

    window.EstudianteMVPUI = Object.freeze(reemplazo);
    return true;
  }

  function iniciar() {
    if (instalar()) return;

    var timer = window.setInterval(function () {
      intentosInstalacion += 1;

      if (instalar() || intentosInstalacion >= MAX_INTENTOS) {
        window.clearInterval(timer);
      }
    }, 50);
  }

  window.EstudianteMVPEnvioModal = Object.freeze({
    mostrar: mostrar,
    cerrar: cerrar,
    instalar: instalar
  });

  iniciar();
})(window, document);
