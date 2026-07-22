/* Consulta pública, estados de coordinación y reenvío. */
(function (w, d) {
  'use strict';
  if (w.__ESTUDIANTE_CONSULTA_REVISION_CARGADA__) return;
  w.__ESTUDIANTE_CONSULTA_REVISION_CARGADA__ = true;

  var intentos = 0;
  var consulta = null;

  function mod(n) { return w[n] || null; }
  function txt(v) { return String(v == null ? '' : v).trim(); }
  function key(v) {
    return txt(v).toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
  }
  function val(o, names) {
    var map = {}, real, i;
    o = o || {};
    Object.keys(o).forEach(function (k) { map[key(k)] = k; });
    for (i = 0; i < names.length; i += 1) {
      real = map[key(names[i])];
      if (real !== undefined && o[real] != null && txt(o[real])) return o[real];
    }
    return '';
  }
  function esc(v) {
    return txt(v).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function ci(v) {
    var n = txt(v).replace(/\D/g, '');
    if (n.length === 9) n = '0' + n;
    return n.length === 10 ? n : '';
  }
  function yes(v) {
    return v === true || ['SI', 'SÍ', 'TRUE', '1', 'YES']
      .indexOf(txt(v).toUpperCase()) >= 0;
  }
  function json(v) {
    if (!v) return null;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (_e) { return null; }
  }
  function student(raw, ced) {
    return {
      cedula: ci(val(raw, ['cedula', 'numeroIdentificacion']) || ced),
      numeroIdentificacion: ci(val(raw, ['cedula', 'numeroIdentificacion']) || ced),
      nombres: txt(val(raw, ['nombres', 'Nombres', 'nombreCompleto', 'nombre'])),
      nombreCarrera: txt(val(raw, ['nombreCarrera', 'NombreCarrera', 'carrera'])),
      carrera: txt(val(raw, ['nombreCarrera', 'NombreCarrera', 'carrera'])),
      codigoCarrera: txt(val(raw, ['codigoCarrera', 'CodigoCarrera'])),
      periodoId: txt(val(raw, ['periodoId', 'periodId', 'periodo'])),
      periodoLabel: txt(val(raw, ['periodoLabel', 'periodo', 'PeriodoLabel'])),
      sede: txt(val(raw, ['sede', 'Sede'])),
      modalidad: txt(val(raw, ['modalidad', 'Modalidad']))
    };
  }
  function envio(result) {
    var base = result && result.envio && typeof result.envio === 'object'
      ? result.envio : {};
    var res = json(val(base, ['resolucion', 'ultimaResolucion'])) ||
      json(val(result || {}, ['resolucion', 'ultimaResolucion'])) || {};
    var out = Object.assign({}, base, res);
    if (txt(result && result.estadoEnvio)) out.estado = result.estadoEnvio;
    ['estado', 'estadoFinal', 'tituloAprobado', 'tituloCorregido',
      'tituloFinal', 'tituloElegido', 'comentarioCoordinador',
      'comentario', 'observacion', 'coordinador', 'fechaResolucion',
      'fechaRevision', 'telegram', 'preferido', 'tituloPreferidoNumero']
      .forEach(function (k) {
        if (txt(result && result[k])) out[k] = result[k];
      });
    return out;
  }
  function estado(e) {
    return txt(val(e, ['estadoFinal', 'estado', 'estadoEnvio',
      'estadoProceso', 'estadoGoogleSheets'])).toUpperCase();
  }
  function aprobado(s) {
    s = txt(s).toUpperCase();
    return s === 'REEMPLAZADO' || s.indexOf('APROBADO') >= 0;
  }
  function comentario(e) {
    return txt(val(e, ['comentarioCoordinador', 'observacion',
      'comentario', 'observaciones', 'motivo']));
  }
  function titulo(e, n) {
    return txt(val(e, ['titulo' + n, 'titulo_' + n,
      'tituloFinal' + n, 'tituloFinal_' + n]));
  }
  function favorito(e) {
    var v = txt(val(e, ['tituloPreferidoNumero', 'preferido',
      'tituloSeleccionadoNumero', 'tituloElegidoNumero']));
    return /^[123]$/.test(v) ? Number(v) : 0;
  }
  function tituloAprobado(e) {
    var t = txt(val(e, ['tituloCorregido', 'tituloAprobado',
      'tituloFinal', 'tituloElegido']));
    return t || titulo(e, favorito(e));
  }
  function dato(label, value) {
    return '<div class="review-data__item"><span>' + esc(label) +
      '</span><strong>' + esc(value || 'No registrado') + '</strong></div>';
  }
  function panelFinal() {
    var p = d.getElementById('revisionTitulosPanel');
    var main = d.querySelector('.app-container');
    var st = d.getElementById('estadoPrincipal');
    if (p) return p;
    p = d.createElement('section');
    p.id = 'revisionTitulosPanel';
    p.className = 'review-status-card';
    p.hidden = true;
    if (main && st) main.insertBefore(p, st.nextSibling);
    p.addEventListener('click', function (ev) {
      if (ev.target.closest('[data-review-action="otra-cedula"]')) reset();
    });
    return p;
  }
  function panelDevuelto() {
    var p = d.getElementById('devolucionDatosPanel');
    var step = d.querySelector('[data-step-panel="datos"]');
    var grid = step && step.querySelector('.data-grid');
    if (p) return p;
    p = d.createElement('section');
    p.id = 'devolucionDatosPanel';
    p.className = 'returned-review';
    p.hidden = true;
    if (step && grid) step.insertBefore(p, grid.nextSibling);
    return p;
  }
  function flow(show) {
    var stepper = d.querySelector('.stepper');
    var status = d.getElementById('estadoPrincipal');
    var final = d.getElementById('revisionTitulosPanel');
    if (stepper) stepper.hidden = !show;
    if (status) status.hidden = !show;
    if (final && show) final.hidden = true;
    if (!show) {
      Array.prototype.forEach.call(d.querySelectorAll('[data-step-panel]'),
        function (x) { x.hidden = true; x.classList.remove('is-active'); });
    }
  }
  function clearReturned() {
    var p = d.getElementById('devolucionDatosPanel');
    var b = d.querySelector('[data-step-panel="datos"] [data-paso="telegram"]');
    if (p) { p.hidden = true; p.innerHTML = ''; }
    if (b) { b.textContent = 'Continuar'; b.removeAttribute('data-reenvio-activo'); }
  }
  function finalView(stu, e, isApproved) {
    var p = panelFinal();
    var titles = [titulo(e, 1), titulo(e, 2), titulo(e, 3)].filter(Boolean);
    var comm = comentario(e);
    clearReturned();
    flow(false);
    p.className = 'review-status-card' +
      (isApproved ? ' review-status-card--approved' : '');
    p.innerHTML = isApproved ? [
      '<div class="review-status-card__hero"><div class="review-status-card__icon">✓</div>',
      '<div><p class="review-status-card__eyebrow">Resultado de coordinación</p>',
      '<h2>Tu tema de titulación fue aprobado</h2>',
      '<span class="review-status-card__badge">Aprobado por coordinación</span></div></div>',
      '<p class="review-status-card__message">Este es el título final aprobado. No necesitas realizar un nuevo envío.</p>',
      '<div class="approved-title-card"><span>Título aprobado</span><strong>',
      esc(tituloAprobado(e) || 'Comunícate con coordinación para confirmar el título final.'),
      '</strong></div>'
    ].join('') : [
      '<div class="review-status-card__hero"><div class="review-status-card__icon">✓</div>',
      '<div><p class="review-status-card__eyebrow">Registro confirmado</p>',
      '<h2>Tus propuestas ya fueron enviadas</h2>',
      '<span class="review-status-card__badge">En revisión por coordinación</span></div></div>',
      '<p class="review-status-card__message">Tus títulos están siendo revisados por el coordinador de titulación.</p>',
      titles.length ? '<div class="review-titles"><h3>Propuestas registradas</h3><ol>' +
        titles.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        '</ol></div>' : ''
    ].join('');
    p.innerHTML += '<div class="review-data">' +
      dato('Estudiante', stu.nombres) + dato('Cédula', stu.cedula) +
      dato('Carrera', stu.nombreCarrera) +
      dato('Período', stu.periodoLabel || stu.periodoId) + '</div>' +
      (comm ? '<div class="approved-comment"><span>Comentario del coordinador</span><p>' +
        esc(comm) + '</p></div>' : '') +
      '<div class="review-status-card__footer"><div class="review-status-card__notice">' +
      (isApproved ? '<strong>Proceso finalizado:</strong> conserva este título.' :
        '<strong>Importante:</strong> el registro está protegido para evitar duplicados.') +
      '</div><button class="btn btn--secondary" type="button" data-review-action="otra-cedula">' +
      'Consultar otra cédula</button></div>';
    p.hidden = false;
    w.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function priorProposals(e) {
    var raw = json(val(e, ['propuestas', 'propuestasEnviadas'])) || [];
    return [1, 2, 3].map(function (n) {
      var item = raw[n - 1] || {};
      var t = txt(val(item, ['tituloFinal', 'titulo'])) || titulo(e, n);
      return {
        numero: n, tituloFinal: t,
        temaGeneral: txt(val(item, ['temaGeneral', 'tema'])),
        lugarContexto: txt(val(item, ['lugarContexto', 'contexto'])),
        grupoEstudio: txt(val(item, ['grupoEstudio', 'grupo'])),
        problemaNecesidad: txt(val(item, ['problemaNecesidad', 'problema'])),
        objetivo: txt(val(item, ['objetivo'])),
        anioPeriodo: txt(val(item, ['anioPeriodo', 'periodo'])),
        tituloDefinidoConfirmado: true
      };
    });
  }
  function returnedView(stu, e) {
    var state = mod('EstudianteMVPState');
    var ui = mod('EstudianteMVPUI');
    var app = mod('EstudianteMVPApp');
    var memory = mod('EstudianteMVPMemoria');
    var p = panelDevuelto();
    var proposals = priorProposals(e);
    var fav = favorito(e);
    var b = d.querySelector('[data-step-panel="datos"] [data-paso="telegram"]');
    if (memory && memory.borrar) memory.borrar();
    if (state && state.reiniciarTodo) state.reiniciarTodo();
    if (state && state.setEstudiante) state.setEstudiante(stu);
    if (state && state.setTelegram && txt(val(e, ['telegram']))) {
      state.setTelegram(txt(val(e, ['telegram'])));
    }
    if (state && state.setPropuestas) state.setPropuestas(proposals);
    if (state && state.setTituloPreferidoNumero && fav) state.setTituloPreferidoNumero(fav);
    if (ui && ui.aplicarEstadoEnFormulario && state) {
      ui.aplicarEstadoEnFormulario(state.obtenerEstado());
    }
    if (ui && ui.pintarEstudiante) ui.pintarEstudiante(stu);
    flow(true);
    p.innerHTML = '<div class="returned-review__header">' +
      '<div class="returned-review__icon">!</div><div>' +
      '<p class="returned-review__eyebrow">Resultado de coordinación</p>' +
      '<h3>Tus propuestas fueron devueltas para corrección</h3>' +
      '<p>Revisa el comentario, corrige los títulos y vuelve a enviarlos.</p></div></div>' +
      '<div class="returned-review__comment"><span>Comentario del coordinador</span><p>' +
      esc(comentario(e) || 'La coordinación solicitó correcciones.') + '</p></div>' +
      '<div class="returned-review__titles"><h4>Propuestas enviadas anteriormente</h4><ol>' +
      proposals.map(function (x) {
        return '<li' + (x.numero === fav ? ' class="is-favorite"' : '') +
          '><div><b>Propuesta ' + x.numero + '</b>' +
          (x.numero === fav ? '<span>Favorito anterior</span>' : '') +
          '</div><p>' + esc(x.tituloFinal || 'Sin título registrado.') + '</p></li>';
      }).join('') + '</ol></div>' +
      '<div class="returned-review__notice"><strong>Los títulos anteriores ya fueron cargados.</strong> ' +
      'Puedes modificarlos y enviarlos nuevamente.</div>';
    p.hidden = false;
    if (b) { b.textContent = 'Corregir y reenviar'; b.setAttribute('data-reenvio-activo', 'true'); }
    if (ui && ui.mostrarEstado) ui.mostrarEstado('#estadoPrincipal',
      'Tus propuestas fueron devueltas. Revisa el comentario y corrige los títulos.', 'warning');
    if (app && app.irPaso) app.irPaso('datos');
  }
  function continueView(stu) {
    var state = mod('EstudianteMVPState'), ui = mod('EstudianteMVPUI');
    var app = mod('EstudianteMVPApp');
    clearReturned(); flow(true);
    if (state && state.setEstudiante) state.setEstudiante(stu);
    if (ui && ui.pintarEstudiante) ui.pintarEstudiante(stu);
    if (ui && ui.mostrarEstado) ui.mostrarEstado('#estadoPrincipal', '', '');
    if (app && app.irPaso) app.irPaso('datos');
  }
  function reset() {
    var app = mod('EstudianteMVPApp');
    var input = d.getElementById('cedulaInput');
    consulta = null; clearReturned(); flow(true);
    if (app && app.nuevoRegistro) app.nuevoRegistro();
    else if (app && app.irPaso) app.irPaso('consulta');
    if (input) { input.value = ''; input.focus(); }
  }
  function fail(msg) {
    var ui = mod('EstudianteMVPUI'), input = d.getElementById('cedulaInput');
    clearReturned(); flow(true);
    if (ui && ui.mostrarEstado) ui.mostrarEstado('#estadoPrincipal', msg, 'error');
    if (input) input.focus();
  }
  function submit(ev) {
    var ui = mod('EstudianteMVPUI'), sheets = mod('EstudianteMVPSheets');
    var input = d.getElementById('cedulaInput'), id = ci(input && input.value);
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    if (!id) return fail('La cédula debe tener 10 números.');
    if (consulta) return;
    input.value = id; clearReturned(); flow(true);
    if (ui && ui.setCargando) ui.setCargando(true,
      'Buscando datos, período y estado de tus propuestas...');
    if (ui && ui.mostrarEstado) ui.mostrarEstado('#estadoPrincipal',
      'Verificando tu registro...', 'info');
    consulta = sheets.consultarAccesoEstudiante(id).then(function (r) {
      var raw = r && (r.estudiante || r.registro);
      if (!r || r.encontrado !== true || !raw) {
        throw new Error(r && r.mensaje || 'No encontramos un estudiante con esa cédula.');
      }
      var stu = student(raw, id), e = envio(r), s = estado(e);
      if (!stu.cedula || !stu.nombres || !stu.nombreCarrera) {
        throw new Error('El registro académico está incompleto.');
      }
      if (aprobado(s)) finalView(stu, e, true);
      else if (s === 'DEVUELTO' && r.permiteReenvio === true) returnedView(stu, e);
      else if (yes(r.tieneEnvio) || yes(r.encontradoEnvio) || r.envio) finalView(stu, e, false);
      else continueView(stu);
    }).catch(function (e) {
      fail(e && e.message || 'No se pudo consultar la información.');
    }).then(function () {
      consulta = null;
      if (ui && ui.setCargando) ui.setCargando(false);
    });
  }
  function styles() {
    if (d.getElementById('estudianteDevolucionCss')) return;
    var link = d.createElement('link');
    link.id = 'estudianteDevolucionCss';
    link.rel = 'stylesheet';
    link.href = 'css/estudiante.devolucion.css?v=2.3.4';
    d.head.appendChild(link);
  }
  function install() {
    var form = d.getElementById('formConsulta');
    var input = d.getElementById('cedulaInput');
    var sheets = mod('EstudianteMVPSheets');
    if (w.__ESTUDIANTE_CONSULTA_REVISION_INSTALADA__) return;
    if (!form || !input || !mod('EstudianteMVPUI') || !mod('EstudianteMVPState') ||
        !mod('EstudianteMVPApp') || !sheets || !sheets.consultarAccesoEstudiante) {
      intentos += 1;
      if (intentos < 150) w.setTimeout(install, 100);
      return;
    }
    w.__ESTUDIANTE_CONSULTA_REVISION_INSTALADA__ = true;
    styles(); panelFinal(); panelDevuelto();
    input.maxLength = 10; input.pattern = '[0-9]{9,10}';
    form.addEventListener('submit', submit, true);
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})(window, document);
