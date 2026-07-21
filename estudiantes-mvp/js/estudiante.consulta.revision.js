/* Consulta pública y bloqueo de registros previamente enviados. */
(function (window, document) {
  'use strict';

  if (window.__ESTUDIANTE_CONSULTA_REVISION_CARGADA__) return;
  window.__ESTUDIANTE_CONSULTA_REVISION_CARGADA__ = true;

  var intentos = 0;
  var consultaActiva = null;
  var ultimaCedula = '';

  function get(nombre) { return window[nombre] || null; }
  function texto(valor) { return String(valor === null || valor === undefined ? '' : valor).trim(); }
  function cedula(valor) {
    var salida = texto(valor).replace(/\D/g, '');
    if (salida.length === 9) salida = '0' + salida;
    return salida.length === 10 ? salida : '';
  }
  function campo(objeto, claves) {
    var data = objeto || {};
    for (var i = 0; i < claves.length; i += 1) {
      if (data[claves[i]] !== undefined && texto(data[claves[i]])) return data[claves[i]];
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
  function normalizarEstudiante(data, identificacion) {
    data = data || {};
    var estudiante = Object.assign({}, data);
    estudiante.cedula = cedula(
      campo(estudiante, ['cedula', 'numeroIdentificacion', 'identificacion']) || identificacion
    );
    estudiante.numeroIdentificacion = estudiante.cedula;
    estudiante.nombres = texto(campo(estudiante, [
      'nombres', 'Nombres', 'nombreCompleto', 'NombreCompleto', 'nombre', 'Nombre'
    ]));
    estudiante.nombreCarrera = texto(campo(estudiante, [
      'nombreCarrera', 'NombreCarrera', 'carrera', 'Carrera'
    ]));
    estudiante.carrera = estudiante.nombreCarrera;
    estudiante.codigoCarrera = texto(campo(estudiante, ['codigoCarrera', 'CodigoCarrera']));
    estudiante.periodoId = texto(campo(estudiante, [
      'periodoId', 'PeriodoId', 'periodoCanonicoId', 'ultimoPeriodoId', 'periodo', 'Periodo'
    ]));
    estudiante.periodoLabel = texto(campo(estudiante, [
      'periodoLabel', 'PeriodoLabel', 'periodoCanonicoLabel', 'periodoTexto', 'PeriodoTexto'
    ])) || estudiante.periodoId;
    estudiante.sede = texto(campo(estudiante, ['sede', 'Sede']));
    estudiante.modalidad = texto(campo(estudiante, ['modalidad', 'Modalidad']));
    estudiante.correoInstitucional = texto(campo(estudiante, ['correoInstitucional', 'CorreoInstitucional']));
    estudiante.correoPersonal = texto(campo(estudiante, ['correoPersonal', 'CorreoPersonal']));
    estudiante.celular = texto(campo(estudiante, ['celular', 'Celular']));
    return estudiante;
  }
  function validarEstudiante(estudiante) {
    if (!estudiante || !estudiante.cedula) return { ok: false, mensaje: 'El registro no contiene una cédula válida.' };
    if (!estudiante.nombres) return { ok: false, mensaje: 'El registro no contiene los nombres del estudiante.' };
    if (!estudiante.nombreCarrera) return { ok: false, mensaje: 'El registro no contiene la carrera del estudiante.' };
    return { ok: true };
  }
  function normalizarEnvio(envio) {
    var salida = Object.assign({}, envio || {});
    salida._origen = 'envios-respaldo';
    return salida;
  }
  function titulosEnvio(envio) {
    var lista = [];
    [1, 2, 3].forEach(function (numero) {
      var titulo = texto(campo(envio || {}, [
        'titulo' + numero,
        'titulo_' + numero,
        'tituloFinal' + numero,
        'tituloFinal_' + numero
      ]));
      if (titulo && lista.indexOf(titulo) < 0) lista.push(titulo);
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
  function etiquetaEstado(estado) {
    if (estado === 'DEVUELTO') return 'Registro devuelto para corrección';
    if (estado === 'APROBADO' || estado === 'REEMPLAZADO') return 'Registro revisado por coordinación';
    return 'En revisión por coordinación';
  }
  function mostrarRevision(estudiante, envio) {
    envio = envio || {};
    var panel = panelRevision();
    var titulos = titulosEnvio(envio);
    var estado = texto(campo(envio, ['estado', 'estadoFinal', 'estadoProceso'])).toUpperCase();
    var bloqueTitulos = titulos.length
      ? '<div class="review-titles"><h3>Propuestas registradas</h3><ol>' +
        titulos.map(function (titulo) { return '<li>' + escapar(titulo) + '</li>'; }).join('') +
        '</ol></div>'
      : '<div class="review-status-card__notice">El registro existe y está protegido. Los títulos se recuperarán desde la base institucional.</div>';

    mostrarFlujo(false);
    panel.innerHTML = [
      '<div class="review-status-card__hero">',
      '<div class="review-status-card__icon" aria-hidden="true">✓</div>',
      '<div><p class="review-status-card__eyebrow">Registro confirmado</p>',
      '<h2>Tus propuestas ya fueron enviadas</h2>',
      '<span class="review-status-card__badge">', escapar(etiquetaEstado(estado)), '</span></div></div>',
      '<p class="review-status-card__message">Tus títulos están siendo revisados por el coordinador de titulación.</p>',
      '<div class="review-data">',
      dato('Estudiante', estudiante.nombres),
      dato('Cédula', estudiante.cedula),
      dato('Carrera', estudiante.nombreCarrera),
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
    if (input) { input.value = ''; input.focus(); }
  }
  function mostrarError(mensaje) {
    var ui = get('EstudianteMVPUI');
    var input = document.getElementById('cedulaInput');
    mostrarFlujo(true);
    if (ui && typeof ui.mostrarEstado === 'function') ui.mostrarEstado('#estadoPrincipal', mensaje, 'error');
    if (input) input.focus();
  }
  function consultar(evento) {
    var ui = get('EstudianteMVPUI');
    var sheets = get('EstudianteMVPSheets');
    var input = document.getElementById('cedulaInput');
    var identificacion = cedula(input ? input.value : '');

    evento.preventDefault();
    evento.stopPropagation();
    evento.stopImmediatePropagation();

    if (!identificacion) { mostrarError('La cédula debe tener 10 números.'); return; }
    if (consultaActiva && ultimaCedula === identificacion) return;

    ultimaCedula = identificacion;
    input.value = identificacion;
    mostrarFlujo(true);
    if (ui && typeof ui.setCargando === 'function') ui.setCargando(true, 'Buscando tus datos y verificando envíos previos...');
    if (ui && typeof ui.mostrarEstado === 'function') ui.mostrarEstado('#estadoPrincipal', 'Verificando tu registro...', 'info');

    consultaActiva = sheets.consultarAccesoEstudiante(identificacion)
      .then(function (resultado) {
        var raw = resultado && (resultado.estudiante || resultado.registro);
        if (!resultado || resultado.encontrado !== true || !raw) {
          throw new Error(resultado && resultado.mensaje || 'No encontramos un estudiante con esa cédula. Revisa el número e intenta nuevamente.');
        }
        var estudiante = normalizarEstudiante(raw, identificacion);
        var validacion = validarEstudiante(estudiante);
        if (!validacion.ok) throw new Error(validacion.mensaje);

        var bloqueado = Boolean(
          resultado.tieneEnvio === true ||
          resultado.encontradoEnvio === true ||
          resultado.envio
        ) && resultado.permiteReenvio !== true;

        if (bloqueado) mostrarRevision(estudiante, normalizarEnvio(resultado.envio || {}));
        else continuar(estudiante);
      })
      .catch(function (error) {
        mostrarError(error && error.message || 'No se pudo consultar la información. Intenta nuevamente.');
      })
      .then(function () {
        consultaActiva = null;
        if (ui && typeof ui.setCargando === 'function') ui.setCargando(false);
      });
  }
  function instalar() {
    var form = document.getElementById('formConsulta');
    var input = document.getElementById('cedulaInput');
    var sheets = get('EstudianteMVPSheets');
    if (window.__ESTUDIANTE_CONSULTA_REVISION_INSTALADA__) return;
    if (!form || !input || !get('EstudianteMVPUI') || !get('EstudianteMVPState') ||
        !get('EstudianteMVPApp') || !sheets || typeof sheets.consultarAccesoEstudiante !== 'function') {
      intentos += 1;
      if (intentos <= 150) window.setTimeout(instalar, 100);
      return;
    }
    window.__ESTUDIANTE_CONSULTA_REVISION_INSTALADA__ = true;
    panelRevision();
    input.setAttribute('maxlength', '10');
    input.setAttribute('pattern', '[0-9]{9,10}');
    form.addEventListener('submit', consultar, true);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', instalar, { once: true });
  else instalar();
})(window, document);
