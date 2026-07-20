/*
  Consulta pública optimizada:
  - REQUISITOS_BDLOCAL_SYNC valida identidad.
  - RESPALDO TITULOS APP verifica envíos previos.
  - Ambas consultas se ejecutan en paralelo.
  - No consulta Firebase.
*/
(function (window, document) {
  'use strict';

  if (window.__ESTUDIANTE_CONSULTA_REVISION_CARGADA__) return;
  window.__ESTUDIANTE_CONSULTA_REVISION_CARGADA__ = true;
  window.__ESTUDIANTE_CONSULTA_GOOGLE_SHEETS__ = true;

  var intentos = 0;
  var consultaActiva = null;
  var ultimaCedula = '';

  function get(nombre) {
    return window[nombre] || null;
  }

  function texto(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function normalizarCedula(valor) {
    var cedula = texto(valor).replace(/\D/g, '');
    if (cedula.length === 9) cedula = '0' + cedula;
    return cedula.length === 10 ? cedula : '';
  }

  function campo(objeto, claves) {
    var data = objeto || {};
    for (var i = 0; i < claves.length; i += 1) {
      if (data[claves[i]] !== undefined && texto(data[claves[i]])) {
        return data[claves[i]];
      }
    }
    return '';
  }

  function escapar(valor) {
    return texto(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function servicioRequisitos() {
    return get('EstudianteMVPRequisitosEstudiantes');
  }

  function normalizarEstudiante(data, cedula) {
    var servicio = servicioRequisitos();
    var base = servicio && typeof servicio.normalizarEstudiante === 'function'
      ? servicio.normalizarEstudiante(data || {}, cedula)
      : data || {};
    var raw = base.raw || {};
    var estudiante = {};

    Object.keys(raw).forEach(function (key) { estudiante[key] = raw[key]; });
    Object.keys(base).forEach(function (key) {
      if (key !== 'raw') estudiante[key] = base[key];
    });

    estudiante.cedula = normalizarCedula(
      campo(estudiante, ['cedula', 'numeroIdentificacion', 'identificacion']) || cedula
    );
    estudiante.numeroIdentificacion = estudiante.cedula;
    estudiante.identificacion = estudiante.cedula;
    estudiante.nombres = texto(campo(estudiante, [
      'nombres', 'Nombres', 'nombreCompleto', 'NombreCompleto', 'nombre', 'Nombre'
    ]));
    estudiante.nombreCarrera = texto(campo(estudiante, [
      'nombreCarrera', 'NombreCarrera', 'carrera', 'Carrera'
    ]));
    estudiante.carrera = estudiante.nombreCarrera;
    estudiante.periodoId = texto(campo(estudiante, [
      'periodoId', 'PeriodoId', 'periodoCanonicoId', 'ultimoPeriodoId', 'periodo', 'Periodo'
    ]));
    estudiante.periodoLabel = texto(campo(estudiante, [
      'periodoLabel', 'PeriodoLabel', 'periodoCanonicoLabel', 'periodoTexto', 'PeriodoTexto'
    ])) || estudiante.periodoId;

    return estudiante;
  }

  function buscarEstudiante(cedula) {
    var servicio = servicioRequisitos();

    if (!servicio || typeof servicio.buscarPorCedula !== 'function') {
      return Promise.reject(new Error('El servicio REQUISITOS_BDLOCAL_SYNC no está disponible.'));
    }

    return servicio.buscarPorCedula(cedula).then(function (resultado) {
      var data = resultado && (resultado.estudiante || resultado.registro || resultado.data);
      var estudiante;
      var validacion;

      if (!resultado || resultado.encontrado === false || !data) {
        throw new Error(
          resultado && resultado.mensaje ||
          'No encontramos un estudiante con esa cédula. Revisa el número e intenta nuevamente.'
        );
      }

      estudiante = normalizarEstudiante(data, cedula);
      if (typeof servicio.validarEstudianteParaContinuar === 'function') {
        validacion = servicio.validarEstudianteParaContinuar(estudiante);
        if (!validacion || validacion.ok !== true) {
          throw new Error(validacion && validacion.mensaje || 'No se pudo validar el estudiante.');
        }
      } else if (!estudiante.cedula || !estudiante.nombres || !estudiante.nombreCarrera) {
        throw new Error('El registro encontrado no contiene nombres o carrera.');
      }

      return estudiante;
    });
  }

  function normalizarEnvio(resultado) {
    var base = resultado && resultado.envio
      ? resultado.envio
      : resultado && resultado.data
        ? resultado.data
        : resultado || {};
    var datos = base.datos && typeof base.datos === 'object' ? base.datos : {};
    var envio = {};

    Object.keys(datos).forEach(function (key) { envio[key] = datos[key]; });
    Object.keys(base).forEach(function (key) {
      if (key !== 'datos') envio[key] = base[key];
    });
    envio._origen = 'google-sheets';
    return envio;
  }

  function buscarEnvio(cedula) {
    var sheets = get('EstudianteMVPSheets');
    if (!sheets || typeof sheets.consultarEnvioPorCedula !== 'function') {
      return Promise.resolve(null);
    }

    return sheets.consultarEnvioPorCedula(cedula)
      .then(function (resultado) {
        return resultado && resultado.encontrado === true
          ? normalizarEnvio(resultado)
          : null;
      })
      .catch(function () { return null; });
  }

  function titulosEnvio(envio) {
    var lista = [];
    var propuestas = envio && (envio.titulosEnviados || envio.propuestas || envio.titulos);

    if (Array.isArray(propuestas)) {
      propuestas.forEach(function (item) {
        var titulo = typeof item === 'string'
          ? item
          : campo(item || {}, ['tituloFinal', 'titulo', 'tituloMejorado', 'texto']);
        if (texto(titulo)) lista.push(texto(titulo));
      });
    }

    [1, 2, 3].forEach(function (numero) {
      var titulo = campo(envio || {}, [
        'titulo' + numero,
        'titulo_' + numero,
        'tituloFinal' + numero,
        'tituloFinal_' + numero
      ]);
      if (texto(titulo) && lista.indexOf(texto(titulo)) === -1) lista.push(texto(titulo));
    });

    return lista.slice(0, 3);
  }

  function panelRevision() {
    var panel = document.getElementById('revisionTitulosPanel');
    var main = document.querySelector('.app-container');
    var estado = document.getElementById('estadoPrincipal');

    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'revisionTitulosPanel';
    panel.className = 'review-status-card';
    panel.hidden = true;
    panel.setAttribute('aria-live', 'polite');

    if (main && estado && estado.parentNode === main) main.insertBefore(panel, estado.nextSibling);
    else if (main) main.appendChild(panel);

    panel.addEventListener('click', function (evento) {
      var boton = evento.target && evento.target.closest
        ? evento.target.closest('[data-review-action="otra-cedula"]')
        : null;
      if (!boton) return;
      evento.preventDefault();
      reiniciar();
    });

    return panel;
  }

  function mostrarFlujo(visible) {
    var stepper = document.querySelector('.stepper');
    var estado = document.getElementById('estadoPrincipal');
    var panel = document.getElementById('revisionTitulosPanel');

    if (stepper) stepper.hidden = !visible;
    if (estado) estado.hidden = !visible;
    if (panel && visible) panel.hidden = true;

    if (!visible) {
      Array.prototype.forEach.call(document.querySelectorAll('[data-step-panel]'), function (item) {
        item.hidden = true;
        item.classList.remove('is-active');
      });
      if (estado) {
        estado.textContent = '';
        estado.className = 'status-message';
      }
    }
  }

  function dato(etiqueta, valor) {
    return '<div class="review-data__item"><span>' + escapar(etiqueta) +
      '</span><strong>' + escapar(texto(valor) || 'No registrado') + '</strong></div>';
  }

  function mostrarRevision(estudiante, envio) {
    var panel = panelRevision();
    var titulos = titulosEnvio(envio);
    var estado = texto(campo(envio, [
      'estado', 'estadoFinal', 'estadoProceso', 'estadoGoogleSheets'
    ])).toUpperCase();
    var etiqueta = estado === 'DEVUELTO'
      ? 'Registro devuelto para corrección'
      : 'En revisión por coordinación';
    var bloqueTitulos = titulos.length
      ? '<div class="review-titles"><h3>Propuestas registradas</h3><ol>' +
        titulos.map(function (titulo) { return '<li>' + escapar(titulo) + '</li>'; }).join('') +
        '</ol></div>'
      : '';

    mostrarFlujo(false);
    panel.innerHTML = [
      '<div class="review-status-card__hero">',
      '<div class="review-status-card__icon" aria-hidden="true">✓</div>',
      '<div><p class="review-status-card__eyebrow">Registro confirmado</p>',
      '<h2>Tus propuestas ya fueron enviadas</h2>',
      '<span class="review-status-card__badge">', escapar(etiqueta), '</span></div></div>',
      '<p class="review-status-card__message">El registro fue encontrado en RESPALDO TITULOS APP.</p>',
      '<div class="review-data">',
      dato('Estudiante', estudiante.nombres),
      dato('Cédula', estudiante.cedula),
      dato('Carrera', estudiante.carrera || estudiante.nombreCarrera),
      dato('Período', estudiante.periodoLabel || estudiante.periodoId),
      '</div>',
      bloqueTitulos,
      '<div class="review-status-card__footer">',
      '<div class="review-status-card__notice"><strong>Importante:</strong> este registro está protegido para evitar envíos duplicados.</div>',
      '<button class="btn btn--secondary" type="button" data-review-action="otra-cedula">Consultar otra cédula</button>',
      '</div>'
    ].join('');
    panel.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function continuar(estudiante) {
    var state = get('EstudianteMVPState');
    var ui = get('EstudianteMVPUI');
    var app = get('EstudianteMVPApp');

    mostrarFlujo(true);
    if (state && typeof state.setEstudiante === 'function') state.setEstudiante(estudiante);
    if (ui && typeof ui.pintarEstudiante === 'function') ui.pintarEstudiante(estudiante);
    if (ui && typeof ui.mostrarEstado === 'function') ui.mostrarEstado('#estadoPrincipal', '', '');
    if (app && typeof app.irPaso === 'function') app.irPaso('datos');
  }

  function reiniciar() {
    var app = get('EstudianteMVPApp');
    var input = document.getElementById('cedulaInput');
    consultaActiva = null;
    ultimaCedula = '';
    mostrarFlujo(true);
    if (app && typeof app.nuevoRegistro === 'function') app.nuevoRegistro();
    else if (app && typeof app.irPaso === 'function') app.irPaso('consulta');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  function mostrarError(mensaje) {
    var ui = get('EstudianteMVPUI');
    var input = document.getElementById('cedulaInput');
    mostrarFlujo(true);
    if (ui && typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado('#estadoPrincipal', mensaje, 'error');
    }
    if (input) input.focus();
  }

  function consultar(evento) {
    var ui = get('EstudianteMVPUI');
    var input = document.getElementById('cedulaInput');
    var cedula = normalizarCedula(input ? input.value : '');

    evento.preventDefault();
    evento.stopPropagation();
    evento.stopImmediatePropagation();

    if (!cedula) {
      mostrarError('La cédula debe tener 10 números.');
      return;
    }

    if (consultaActiva && ultimaCedula === cedula) return;
    ultimaCedula = cedula;
    input.value = cedula;
    mostrarFlujo(true);

    if (ui && typeof ui.setCargando === 'function') {
      ui.setCargando(true, 'Consultando REQUISITOS_BDLOCAL_SYNC y RESPALDO TITULOS APP...');
    }
    if (ui && typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado('#estadoPrincipal', 'Consultando tu información...', 'info');
    }

    consultaActiva = Promise.all([
      buscarEstudiante(cedula),
      buscarEnvio(cedula)
    ])
      .then(function (resultados) {
        var estudiante = resultados[0];
        var envio = resultados[1];
        if (envio) mostrarRevision(estudiante, envio);
        else continuar(estudiante);
      })
      .catch(function (error) {
        mostrarError(
          error && error.message ||
          'No encontramos un estudiante con esa cédula. Revisa el número e intenta nuevamente.'
        );
      })
      .then(function () {
        consultaActiva = null;
        if (ui && typeof ui.setCargando === 'function') ui.setCargando(false);
      });
  }

  function instalar() {
    var form = document.getElementById('formConsulta');
    var input = document.getElementById('cedulaInput');

    if (window.__ESTUDIANTE_CONSULTA_REVISION_INSTALADA__) return;
    if (!form || !input || !get('EstudianteMVPUI') || !get('EstudianteMVPState') ||
        !get('EstudianteMVPApp') || !servicioRequisitos() || !get('EstudianteMVPSheets')) {
      intentos += 1;
      if (intentos <= 100) window.setTimeout(instalar, 100);
      return;
    }

    window.__ESTUDIANTE_CONSULTA_REVISION_INSTALADA__ = true;
    panelRevision();
    input.setAttribute('maxlength', '10');
    input.setAttribute('pattern', '[0-9]{9,10}');
    form.addEventListener('submit', consultar, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }
})(window, document);
