/* Consulta optimizada con progreso visible desde el primer clic. */
(function (window, document) {
  'use strict';

  if (window.__ESTUDIANTE_CONSULTA_OPTIMIZADA__) return;
  window.__ESTUDIANTE_CONSULTA_OPTIMIZADA__ = true;

  var MODAL_ID = 'modalConsultaAcademicaProgreso';
  var STYLE_ID = 'consultaAcademicaProgresoStyles';
  var consultaEnCurso = false;
  var temporizadores = [];
  var observador = null;
  var botonConsulta = null;

  function texto(valor) {
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function normalizarClave(valor) {
    return texto(valor).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function campoFlexible(objeto, nombres) {
    var data = objeto || {};
    var mapa = {};
    var i;
    Object.keys(data).forEach(function (key) {
      mapa[normalizarClave(key)] = key;
    });
    for (i = 0; i < nombres.length; i += 1) {
      var real = mapa[normalizarClave(nombres[i])];
      if (real !== undefined && data[real] !== undefined && data[real] !== null) {
        return data[real];
      }
    }
    return undefined;
  }

  function si(valor) {
    return valor === true || ['SI', 'SÍ', 'TRUE', '1', 'YES'].indexOf(texto(valor).toUpperCase()) >= 0;
  }

  function cedula(valor) {
    var salida = texto(valor).replace(/\D/g, '');
    if (salida.length === 9) salida = '0' + salida;
    return salida.length === 10 ? salida : '';
  }

  function esLocal() {
    var host = texto(window.location && window.location.hostname).toLowerCase();
    return ['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].indexOf(host) >= 0;
  }

  function apiBase() {
    var forzada = texto(window.TITULOS_API_BASE || '');
    var origen;
    if (forzada) return forzada.replace(/\/$/, '');
    if (esLocal()) return 'http://127.0.0.1:8788';
    origen = texto(window.location && window.location.origin);
    return origen && origen !== 'null' ? origen.replace(/\/$/, '') : 'https://titulos.pages.dev';
  }

  function asegurarEstilos() {
    var style;
    if (document.getElementById(STYLE_ID)) return;
    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.consulta-progress{position:fixed;inset:0;z-index:12000;display:flex;align-items:center;justify-content:center;padding:18px;font-family:inherit;}',
      '.consulta-progress__backdrop{position:absolute;inset:0;background:rgba(7,25,50,.76);backdrop-filter:blur(7px);}',
      '.consulta-progress__card{position:relative;width:min(560px,100%);border-radius:26px;background:#fff;border:1px solid #d7e1ef;box-shadow:0 28px 80px rgba(5,22,46,.34);padding:28px;overflow:hidden;}',
      '.consulta-progress__top{display:flex;align-items:center;gap:16px;margin-bottom:18px;}',
      '.consulta-progress__spinner{width:54px;height:54px;flex:0 0 54px;border-radius:50%;border:5px solid #dbe7f5;border-top-color:#123f73;animation:consultaSpin .85s linear infinite;}',
      '.consulta-progress__kicker{margin:0 0 4px;color:#9a741d;font-size:12px;font-weight:900;letter-spacing:.09em;text-transform:uppercase;}',
      '.consulta-progress__title{margin:0;color:#0b2345;font-size:clamp(22px,4vw,30px);line-height:1.1;}',
      '.consulta-progress__message{margin:8px 0 0;color:#5b6f89;font-size:15px;line-height:1.45;}',
      '.consulta-progress__bar{height:8px;border-radius:999px;background:#e7eef7;overflow:hidden;margin:20px 0;}',
      '.consulta-progress__bar span{display:block;height:100%;width:18%;border-radius:inherit;background:linear-gradient(90deg,#c8a84e,#174d84);transition:width .4s ease;}',
      '.consulta-progress__steps{display:grid;gap:9px;margin:0;padding:0;list-style:none;}',
      '.consulta-progress__step{display:flex;align-items:center;gap:11px;padding:10px 12px;border-radius:14px;color:#728197;background:#f7f9fc;border:1px solid transparent;font-weight:700;}',
      '.consulta-progress__dot{width:22px;height:22px;flex:0 0 22px;border-radius:50%;display:grid;place-items:center;background:#dfe7f1;color:#6b7d93;font-size:12px;font-weight:900;}',
      '.consulta-progress__step.is-active{color:#0b2345;background:#eef5ff;border-color:#bfd2e8;}',
      '.consulta-progress__step.is-active .consulta-progress__dot{background:#174d84;color:#fff;box-shadow:0 0 0 5px rgba(23,77,132,.10);}',
      '.consulta-progress__step.is-done{color:#17613d;background:#eef9f3;}',
      '.consulta-progress__step.is-done .consulta-progress__dot{background:#198754;color:#fff;}',
      '.consulta-progress__hint{margin:16px 0 0;padding-top:14px;border-top:1px solid #e4ebf4;color:#718198;font-size:13px;text-align:center;}',
      '@keyframes consultaSpin{to{transform:rotate(360deg);}}',
      '@media(max-width:560px){.consulta-progress{padding:12px;align-items:flex-end;}.consulta-progress__card{border-radius:24px 24px 18px 18px;padding:22px 18px;}.consulta-progress__spinner{width:46px;height:46px;flex-basis:46px;}}'
    ].join('\n');
    document.head.appendChild(style);
  }

  function limpiarTemporizadores() {
    temporizadores.forEach(function (id) { window.clearTimeout(id); });
    temporizadores = [];
  }

  function crearModal() {
    var modal = document.getElementById(MODAL_ID);
    var pasos;
    if (modal) return modal;
    asegurarEstilos();
    modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'consulta-progress';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-live', 'polite');
    modal.innerHTML = [
      '<div class="consulta-progress__backdrop"></div>',
      '<div class="consulta-progress__card">',
      '<div class="consulta-progress__top">',
      '<div class="consulta-progress__spinner" aria-hidden="true"></div>',
      '<div><p class="consulta-progress__kicker">Consulta institucional</p>',
      '<h2 class="consulta-progress__title">Estamos buscando tu información</h2>',
      '<p id="consultaProgressMessage" class="consulta-progress__message">Validando el número de cédula ingresado.</p></div>',
      '</div>',
      '<div class="consulta-progress__bar"><span id="consultaProgressBar"></span></div>',
      '<ol class="consulta-progress__steps">',
      '<li class="consulta-progress__step is-active" data-consulta-step="1"><span class="consulta-progress__dot">1</span><span>Validando cédula</span></li>',
      '<li class="consulta-progress__step" data-consulta-step="2"><span class="consulta-progress__dot">2</span><span>Buscando período académico</span></li>',
      '<li class="consulta-progress__step" data-consulta-step="3"><span class="consulta-progress__dot">3</span><span>Consultando datos del estudiante</span></li>',
      '<li class="consulta-progress__step" data-consulta-step="4"><span class="consulta-progress__dot">4</span><span>Verificando títulos enviados</span></li>',
      '</ol>',
      '<p class="consulta-progress__hint">No cierres esta ventana. La consulta puede tardar unos segundos.</p>',
      '</div>'
    ].join('');
    document.body.appendChild(modal);
    pasos = modal.querySelectorAll('[data-consulta-step]');
    Array.prototype.forEach.call(pasos, function (paso) {
      paso.classList.remove('is-done', 'is-active');
    });
    return modal;
  }

  function actualizarPaso(numero, mensaje) {
    var modal = document.getElementById(MODAL_ID);
    var barra;
    var mensajeElemento;
    if (!modal) return;
    Array.prototype.forEach.call(modal.querySelectorAll('[data-consulta-step]'), function (paso) {
      var valor = Number(paso.getAttribute('data-consulta-step') || 0);
      paso.classList.toggle('is-done', valor < numero);
      paso.classList.toggle('is-active', valor === numero);
      var dot = paso.querySelector('.consulta-progress__dot');
      if (dot) dot.textContent = valor < numero ? '✓' : String(valor);
    });
    barra = document.getElementById('consultaProgressBar');
    if (barra) barra.style.width = ({ 1: 18, 2: 42, 3: 68, 4: 88, 5: 100 }[numero] || 18) + '%';
    mensajeElemento = document.getElementById('consultaProgressMessage');
    if (mensajeElemento && mensaje) mensajeElemento.textContent = mensaje;
  }

  function abrirProgreso() {
    var modal;
    if (consultaEnCurso) return;
    consultaEnCurso = true;
    limpiarTemporizadores();
    modal = crearModal();
    actualizarPaso(1, 'Validando el número de cédula ingresado.');
    botonConsulta = document.querySelector('#formConsulta button[type="submit"]');
    if (botonConsulta) {
      botonConsulta.disabled = true;
      botonConsulta.setAttribute('aria-busy', 'true');
      botonConsulta.setAttribute('data-texto-original', botonConsulta.textContent || 'Consultar datos');
      botonConsulta.textContent = 'Consultando...';
    }
    temporizadores.push(window.setTimeout(function () {
      actualizarPaso(2, 'Buscando el período académico vigente del estudiante.');
    }, 350));
    temporizadores.push(window.setTimeout(function () {
      actualizarPaso(3, 'Consultando nombres, carrera y datos académicos.');
    }, 1150));
    temporizadores.push(window.setTimeout(function () {
      actualizarPaso(4, 'Verificando si ya existen títulos enviados o aprobados.');
    }, 2400));
    temporizadores.push(window.setTimeout(function () {
      actualizarPaso(4, 'La base institucional está procesando la consulta. Un momento más.');
    }, 5200));
    if (modal) modal.focus && modal.focus();
  }

  function cerrarProgreso(exito) {
    var modal = document.getElementById(MODAL_ID);
    limpiarTemporizadores();
    if (exito && modal) {
      actualizarPaso(5, 'Información encontrada. Preparando la pantalla.');
    }
    window.setTimeout(function () {
      if (modal && modal.parentNode) modal.parentNode.removeChild(modal);
      consultaEnCurso = false;
      if (botonConsulta) {
        botonConsulta.disabled = false;
        botonConsulta.removeAttribute('aria-busy');
        botonConsulta.textContent = botonConsulta.getAttribute('data-texto-original') || 'Consultar datos';
        botonConsulta.removeAttribute('data-texto-original');
      }
      botonConsulta = null;
    }, exito ? 260 : 80);
  }

  function resultadoVisible() {
    var panelRevision = document.getElementById('revisionTitulosPanel');
    var panelDatos = document.querySelector('[data-step-panel="datos"]');
    var estado = document.getElementById('estadoPrincipal');
    if (panelRevision && panelRevision.hidden === false) return 'ok';
    if (panelDatos && panelDatos.hidden === false && panelDatos.classList.contains('is-active')) return 'ok';
    if (estado && /is-error/.test(estado.className) && texto(estado.textContent)) return 'error';
    return '';
  }

  function vigilarResultado() {
    if (observador) return;
    observador = new MutationObserver(function () {
      if (!consultaEnCurso) return;
      var resultado = resultadoVisible();
      if (resultado) cerrarProgreso(resultado === 'ok');
    });
    observador.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
      attributeFilter: ['hidden', 'class']
    });
  }

  function extraerEnvio(result) {
    var candidatos = [
      result && result.envio,
      result && result.registroEnvio,
      result && result.envioActual,
      result && result.data && result.data.envio,
      result && result.resultado && result.resultado.envio
    ];
    var i;
    for (i = 0; i < candidatos.length; i += 1) {
      if (candidatos[i] && typeof candidatos[i] === 'object') return candidatos[i];
    }
    return null;
  }

  function estadoEnvio(envio) {
    return texto(campoFlexible(envio || {}, ['estado', 'estadoFinal', 'estadoProceso', 'estadoGoogleSheets'])).toUpperCase();
  }

  function permiteReenvio(result, envio) {
    var estado = estadoEnvio(envio) || texto(campoFlexible(result || {}, ['estado', 'estadoFinal'])).toUpperCase();
    var propio = campoFlexible(envio || {}, ['permitirReenvio', 'permiteReenvio']);
    var valor = propio !== undefined ? propio : campoFlexible(result || {}, ['permitirReenvio', 'permiteReenvio']);
    return estado === 'DEVUELTO' && (valor === undefined || valor === null || valor === '' || si(valor));
  }

  function consultaOptimizada(identificacion) {
    var id = cedula(identificacion);
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, 70000) : null;
    var opciones = {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Titulos-App': 'estudiantes'
      },
      body: JSON.stringify({
        accion: 'CONSULTAR_ACCESO_ESTUDIANTE',
        metodo: 'GET',
        datos: { cedula: id, numeroIdentificacion: id }
      })
    };
    if (controller) opciones.signal = controller.signal;

    return fetch(apiBase() + '/api/acceso-estudiante', opciones)
      .then(function (response) {
        return response.text().then(function (body) {
          var json = {};
          try { json = body ? JSON.parse(body) : {}; }
          catch (error) { throw new Error('La consulta institucional respondió en un formato no válido.'); }
          if (!response.ok || json.ok === false) {
            throw new Error(json.mensaje || json.error || ('Error HTTP ' + response.status));
          }
          return json;
        });
      })
      .then(function (result) {
        var student = result.estudiante || result.registro || null;
        var envio = extraerEnvio(result);
        var permitir = permiteReenvio(result, envio);
        return {
          ok: true,
          encontrado: result.encontrado === true || result.existe === true || si(result.encontrado) || si(result.existe) || Boolean(student),
          cedula: id,
          estudiante: student,
          registro: student,
          tieneEnvio: (result.tieneEnvio === true || result.encontradoEnvio === true || Boolean(envio)) && !permitir,
          encontradoEnvio: result.encontradoEnvio === true || Boolean(envio),
          permiteReenvio: permitir,
          envio: envio,
          estadoEnvio: estadoEnvio(envio),
          periodoId: result.periodoId || student && campoFlexible(student, ['periodoId']) || '',
          periodoLabel: result.periodoLabel || student && campoFlexible(student, ['periodoLabel', 'periodo']) || '',
          fuente: result.fuente || 'CONSULTA_ACCESO_OPTIMIZADA',
          duracionMs: Number(result.duracionMs || 0),
          cache: result.cache || false,
          mensaje: result.mensaje || ''
        };
      })
      .finally(function () {
        if (timer) window.clearTimeout(timer);
      });
  }

  function instalarServicio() {
    var original = window.EstudianteMVPSheets;
    var reemplazo;
    if (!original || window.__ESTUDIANTE_SHEETS_OPTIMIZADO__) return Boolean(original);
    reemplazo = {};
    Object.keys(original).forEach(function (key) { reemplazo[key] = original[key]; });
    reemplazo.consultarAccesoEstudiante = function (id) {
      return consultaOptimizada(id).catch(function (error) {
        console.warn('[Estudiantes MVP] Consulta optimizada no disponible; se utiliza la ruta compatible.', error);
        return original.consultarAccesoEstudiante(id);
      });
    };
    window.EstudianteMVPSheets = Object.freeze(reemplazo);
    window.__ESTUDIANTE_SHEETS_OPTIMIZADO__ = true;
    return true;
  }

  function instalar() {
    var form = document.getElementById('formConsulta');
    var input = document.getElementById('cedulaInput');
    if (!form || !input || !instalarServicio()) {
      window.setTimeout(instalar, 80);
      return;
    }
    if (form.getAttribute('data-consulta-progreso') === 'true') return;
    form.setAttribute('data-consulta-progreso', 'true');
    form.addEventListener('submit', function () {
      var id = cedula(input.value);
      if (!id) return;
      abrirProgreso();
    }, true);
    vigilarResultado();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }
})(window, document);
