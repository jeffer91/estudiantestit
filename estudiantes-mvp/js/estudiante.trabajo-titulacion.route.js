/* Evita que un estudiante con Trabajo de Titulación existente ingrese por error
 * al formulario de Artículo Académico. Primero obtiene el período académico
 * actual y luego comprueba el Trabajo de Titulación dentro de ese período.
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

  function esGitHubPages() {
    var host = text(window.location && window.location.hostname).toLowerCase();
    return host === 'github.io' || /\.github\.io$/.test(host);
  }

  function firebaseDirecto() {
    return window.TitulosFirebaseDirectPublic || null;
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
    return text(window.TITULOS_API_BASE || '').replace(/\/$/, '') || (origin && origin !== 'null' ? origin.replace(/\/$/, '') : '');
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

  function post(path, action, data) {
    return fetch(apiBase() + path, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Titulos-App': 'estudiantes'
      },
      body: JSON.stringify({ accion: action, metodo: 'POST', datos: data || {} })
    }).then(function (response) {
      return response.text().then(function (body) {
        var json = {};
        try {
          json = body ? JSON.parse(body) : {};
        } catch (_error) {
          throw new Error('El sistema respondió en un formato no válido.');
        }
        if (!response.ok || json.ok === false) {
          throw new Error(json.mensaje || json.error || ('Error HTTP ' + response.status));
        }
        return json;
      });
    });
  }

  function consultarAcademico(id) {
    var directo = firebaseDirecto();
    if (esGitHubPages() && directo) {
      return directo.getStudent(id).then(function (student) {
        return {
          periodoId: text(student.periodoId || student.periodId),
          periodoLabel: text(student.periodoLabel || student.periodo || student.periodoId)
        };
      });
    }
    return post('/api/requisitos', 'CONSULTAR_ESTUDIANTE_TITULACION', {
      cedula: id,
      numeroIdentificacion: id
    }).then(function (result) {
      var student = result && (result.estudiante || result.registro || result.data);
      if (!result || result.encontrado !== true || !student) return null;
      return {
        periodoId: text(student.periodoId || student.periodId || result.periodoId),
        periodoLabel: text(student.periodoLabel || student.periodo || result.periodoLabel)
      };
    });
  }

  function consultarTrabajo(id, academic) {
    academic = academic || {};
    var directo = firebaseDirecto();
    if (esGitHubPages() && directo) {
      return directo.getWorkEnvio(
        id,
        text(academic.periodoId || academic.periodoLabel)
      ).then(function (envio) {
        return envio
          ? { ok: true, encontrado: true, existe: true, envio: envio, registro: envio }
          : { ok: true, encontrado: false, existe: false };
      }).catch(function () {
        // La consulta académica principal no debe quedar bloqueada si el
        // documento opcional de Trabajo de Titulación no está disponible.
        return { ok: true, encontrado: false, existe: false, verificacionDisponible: false };
      });
    }
    return post('/api/trabajo-titulacion', 'CONSULTAR_ENVIO_TRABAJO_TITULACION', {
      cedula: id,
      numeroIdentificacion: id,
      periodoId: text(academic.periodoId),
      periodoLabel: text(academic.periodoLabel),
      periodo: text(academic.periodoLabel || academic.periodoId)
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

      consultarAcademico(id).then(function (academic) {
        if (!academic) {
          setStatus('', 'info');
          continueArticle(form);
          return null;
        }
        return consultarTrabajo(id, academic);
      }).then(function (result) {
        var envio;
        if (!result) return;
        envio = result && (result.envio || result.registro);
        if (result.encontrado === true && envio) {
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
