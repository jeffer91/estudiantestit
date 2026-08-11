/* Evita que un estudiante con Trabajo de Titulación existente ingrese por error
 * al formulario de Artículo Académico. La comprobación se hace antes de que
 * arranque la consulta normal de esta pantalla.
 */
(function (window, document) {
  'use strict';

  if (window.__ESTUDIANTE_RUTA_TRABAJO_TITULACION__) return;
  window.__ESTUDIANTE_RUTA_TRABAJO_TITULACION__ = true;

  var bypass = false;
  var checking = false;

  function text(value) {
    return String(value === null || value === undefined ? '' : value).trim();
  }

  function cedula(value) {
    var digits = text(value).replace(/\D/g, '');
    if (digits.length === 9) digits = '0' + digits;
    return digits.length === 10 ? digits : '';
  }

  function apiBase() {
    var forced = text(window.TITULOS_API_BASE || '');
    var host = text(window.location && window.location.hostname).toLowerCase();
    var origin = text(window.location && window.location.origin);
    if (forced) return forced.replace(/\/$/, '');
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].indexOf(host) >= 0) {
      return 'http://127.0.0.1:8788';
    }
    return origin && origin !== 'null' ? origin.replace(/\/$/, '') : 'https://titulos.pages.dev';
  }

  function setStatus(message, type) {
    var el = document.getElementById('estadoPrincipal');
    if (!el) return;
    el.className = 'status-message ' + (type === 'error' ? 'is-error' : 'is-info');
    el.textContent = message || '';
  }

  function setBusy(value) {
    var form = document.getElementById('formConsulta');
    var button = form && form.querySelector('button[type="submit"]');
    if (button) button.disabled = value === true;
  }

  function consultarTrabajo(id) {
    return fetch(apiBase() + '/api/trabajo-titulacion', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Titulos-App': 'estudiantes'
      },
      body: JSON.stringify({
        accion: 'CONSULTAR_ENVIO_TRABAJO_TITULACION',
        metodo: 'POST',
        datos: {
          cedula: id,
          numeroIdentificacion: id
        }
      })
    }).then(function (response) {
      return response.text().then(function (body) {
        var json = {};
        try {
          json = body ? JSON.parse(body) : {};
        } catch (_error) {
          throw new Error('No se pudo verificar el tipo de trabajo registrado.');
        }
        if (!response.ok || json.ok === false) {
          throw new Error(json.mensaje || json.error || ('Error HTTP ' + response.status));
        }
        return json;
      });
    });
  }

  function continueArticle(form) {
    bypass = true;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }

  function install() {
    var form = document.getElementById('formConsulta');
    var input = document.getElementById('cedulaInput');
    if (!form || !input) return;

    form.addEventListener('submit', function (event) {
      var id;
      if (bypass) {
        bypass = false;
        return;
      }
      if (checking) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      id = cedula(input.value);
      if (!id) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      checking = true;
      setBusy(true);
      setStatus('Verificando si tu proceso corresponde a Artículo Académico o Trabajo de Titulación…', 'info');

      consultarTrabajo(id).then(function (result) {
        var envio = result && (result.envio || result.registro);
        if (result && result.encontrado === true && envio) {
          setStatus('Tu registro corresponde a Trabajo de Titulación. Abriendo el formulario correcto…', 'info');
          window.location.assign('/trabajo-titulacion/?cedula=' + encodeURIComponent(id));
          return;
        }
        setStatus('', 'info');
        continueArticle(form);
      }).catch(function (error) {
        setStatus(
          (error && error.message ? error.message : 'No se pudo verificar tu tipo de trabajo.') +
          ' Intenta nuevamente antes de continuar.',
          'error'
        );
      }).finally(function () {
        checking = false;
        setBusy(false);
      });
    }, true);
  }

  install();
})(window, document);
