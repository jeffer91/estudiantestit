/* Consulta unificada: Requisitos + Envíos + Resoluciones. */
(function (window, document) {
  'use strict';

  if (window.__ESTUDIANTE_CONSULTA_REVISION_CARGADA__) return;
  window.__ESTUDIANTE_CONSULTA_REVISION_CARGADA__ = true;

  var consultaEnCurso = null;
  var intentosInstalacion = 0;

  function modulo(nombre) {
    return window[nombre] || null;
  }

  function texto(valor) {
    return String(valor === null || valor === undefined ? '' : valor).trim();
  }

  function clave(valor) {
    return texto(valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  function campo(objeto, nombres) {
    var data = objeto && typeof objeto === 'object' ? objeto : {};
    var mapa = {};
    var i;
    var real;
    Object.keys(data).forEach(function (nombre) {
      mapa[clave(nombre)] = nombre;
    });
    for (i = 0; i < nombres.length; i += 1) {
      real = mapa[clave(nombres[i])];
      if (real !== undefined && data[real] !== undefined && data[real] !== null) {
        return data[real];
      }
    }
    return undefined;
  }

  function escapar(valor) {
    return texto(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function cedula(valor) {
    var limpia = texto(valor).replace(/\D/g, '');
    if (limpia.length === 9) limpia = '0' + limpia;
    return limpia.length === 10 ? limpia : '';
  }

  function parsearJson(valor) {
    if (!valor) return null;
    if (typeof valor === 'object') return valor;
    try {
      return JSON.parse(valor);
    } catch (_error) {
      return null;
    }
  }

  function apiBase() {
    var forzada = texto(window.TITULOS_API_BASE || '');
    var host = texto(window.location && window.location.hostname).toLowerCase();
    var protocolo = texto(window.location && window.location.protocol).toLowerCase();
    var origen = texto(window.location && window.location.origin);
    if (forzada) return forzada.replace(/\/$/, '');
    if (['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]'].indexOf(host) >= 0) {
      return 'http://127.0.0.1:8788';
    }
    if (protocolo === 'file:') return 'https://titulos.pages.dev';
    return origen && origen !== 'null' ? origen.replace(/\/$/, '') : 'https://titulos.pages.dev';
  }

  function consultarAcceso(identificacion) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, 45000) : null;
    var opciones = {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'X-Titulos-App': 'estudiantes'
      },
      body: JSON.stringify({
        cedula: identificacion,
        numeroIdentificacion: identificacion,
        datos: {
          cedula: identificacion,
          numeroIdentificacion: identificacion
        }
      })
    };

    if (controller) opciones.signal = controller.signal;

    return fetch(apiBase() + '/api/acceso-estudiante', opciones)
      .then(function (respuesta) {
        return respuesta.text().then(function (cuerpo) {
          var json = {};
          try {
            json = cuerpo ? JSON.parse(cuerpo) : {};
          } catch (_error) {
            throw new Error('La consulta respondió en un formato no válido.');
          }
          if (!respuesta.ok || json.ok === false || json.consultaCompleta === false) {
            throw new Error(json.mensaje || json.error || ('Error HTTP ' + respuesta.status));
          }
          return json;
        });
      })
      .catch(function (error) {
        if (error && error.name === 'AbortError') {
          throw new Error('La consulta tardó demasiado. Intenta nuevamente.');
        }
        throw error;
      })
      .then(function (resultado) {
        if (timer) window.clearTimeout(timer);
        return resultado;
      }, function (error) {
        if (timer) window.clearTimeout(timer);
        throw error;
      });
  }

  function normalizarEstudiante(raw, identificacion) {
    raw = raw || {};
    return {
      id: texto(campo(raw, ['id', '_id', 'studentId'])) || identificacion,
      cedula: cedula(campo(raw, ['cedula', 'numeroIdentificacion']) || identificacion),
      numeroIdentificacion: cedula(campo(raw, ['cedula', 'numeroIdentificacion']) || identificacion),
      nombres: texto(campo(raw, ['nombres', 'Nombres', 'nombreCompleto', 'nombre'])),
      Nombres: texto(campo(raw, ['nombres', 'Nombres', 'nombreCompleto', 'nombre'])),
      nombreCarrera: texto(campo(raw, ['nombreCarrera', 'NombreCarrera', 'carrera'])),
      NombreCarrera: texto(campo(raw, ['nombreCarrera', 'NombreCarrera', 'carrera'])),
      carrera: texto(campo(raw, ['nombreCarrera', 'NombreCarrera', 'carrera'])),
      codigoCarrera: texto(campo(raw, ['codigoCarrera', 'CodigoCarrera'])),
      CodigoCarrera: texto(campo(raw, ['codigoCarrera', 'CodigoCarrera'])),
      periodoId: texto(campo(raw, ['periodoId', 'periodId', 'periodoCanonicoId', 'periodo'])),
      periodoLabel: texto(campo(raw, ['periodoLabel', 'periodoCanonicoLabel', 'PeriodoLabel', 'periodo'])),
      sede: texto(campo(raw, ['sede', 'Sede'])),
      Sede: texto(campo(raw, ['sede', 'Sede'])),
      modalidad: texto(campo(raw, ['modalidad', 'Modalidad', 'modalidadDetectada'])),
      modalidadDetectada: texto(campo(raw, ['modalidad', 'Modalidad', 'modalidadDetectada'])),
      correoInstitucional: texto(campo(raw, ['correoInstitucional', 'CorreoInstitucional'])),
      correoPersonal: texto(campo(raw, ['correoPersonal', 'CorreoPersonal'])),
      celular: texto(campo(raw, ['celular', 'Celular'])),
      raw: raw
    };
  }

  function estadoEfectivo(resultado) {
    return texto(
      resultado && resultado.estadoEfectivo ||
      resultado && resultado.estadoEnvio ||
      campo(resultado && resultado.resolucion || {}, ['estadoFinal', 'estado']) ||
      campo(resultado && resultado.envio || {}, ['estadoFinal', 'estado'])
    ).toUpperCase();
  }

  function tituloDirecto(envio, numero) {
    return texto(campo(envio || {}, [
      'titulo' + numero,
      'titulo_' + numero,
      'tituloFinal' + numero,
      'tituloFinal_' + numero
    ]));
  }

  function propuestasAnteriores(envio) {
    var raw = parsearJson(campo(envio || {}, ['propuestas', 'propuestasEnviadas'])) || [];
    return [1, 2, 3].map(function (numero) {
      var item = raw[numero - 1] || {};
      return {
        numero: numero,
        tituloFinal: texto(campo(item, ['tituloFinal', 'titulo', 'texto'])) || tituloDirecto(envio, numero),
        temaGeneral: texto(campo(item, ['temaGeneral', 'tema'])),
        lugarContexto: texto(campo(item, ['lugarContexto', 'contexto'])),
        grupoEstudio: texto(campo(item, ['grupoEstudio', 'grupo'])),
        problemaNecesidad: texto(campo(item, ['problemaNecesidad', 'problema'])),
        objetivo: texto(campo(item, ['objetivo'])),
        anioPeriodo: texto(campo(item, ['anioPeriodo', 'periodo'])),
        tituloDefinidoConfirmado: true
      };
    });
  }

  function favorito(envio) {
    var valor = texto(campo(envio || {}, [
      'tituloPreferidoNumero',
      'preferido',
      'tituloSeleccionadoNumero',
      'tituloElegidoNumero'
    ]));
    if (/^[123]$/.test(valor)) return Number(valor);
    var coincidencia = valor.match(/(?:t[ií]tulo|propuesta|opci[oó]n|favorito)\s*#?\s*([123])/i);
    return coincidencia ? Number(coincidencia[1]) : 0;
  }

  function comentario(resolucion, envio) {
    return texto(
      campo(resolucion || {}, ['comentarioCoordinador', 'observacion', 'comentario', 'motivo']) ||
      campo(envio || {}, ['comentarioCoordinador', 'observacion', 'comentario', 'motivo'])
    );
  }

  function coordinador(resolucion, envio) {
    return texto(
      campo(resolucion || {}, ['coordinador', 'nombreCoordinador']) ||
      campo(envio || {}, ['coordinador', 'nombreCoordinador'])
    );
  }

  function tituloAprobado(resolucion, envio) {
    return texto(
      campo(resolucion || {}, ['tituloCorregido', 'tituloAprobado', 'tituloFinal', 'tituloElegido']) ||
      campo(envio || {}, ['tituloCorregido', 'tituloAprobado', 'tituloFinal', 'tituloElegido'])
    );
  }

  function panelEstado() {
    var panel = document.getElementById('estadoProcesoTitulacion');
    var paso = document.querySelector('[data-step-panel="datos"]');
    var grid = paso && paso.querySelector('.data-grid');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'estadoProcesoTitulacion';
    panel.className = 'student-process-panel';
    panel.hidden = true;
    if (paso && grid) grid.insertAdjacentElement('afterend', panel);
    return panel;
  }

  function botonContinuar() {
    return document.querySelector('[data-step-panel="datos"] [data-paso="telegram"]');
  }

  function limpiarPanel() {
    var panel = panelEstado();
    var continuar = botonContinuar();
    panel.hidden = true;
    panel.className = 'student-process-panel';
    panel.innerHTML = '';
    if (continuar) {
      continuar.hidden = false;
      continuar.disabled = false;
      continuar.textContent = 'Continuar';
      continuar.removeAttribute('data-reenvio-activo');
    }
  }

  function listaTitulosHtml(propuestas, numeroFavorito) {
    var disponibles = propuestas.filter(function (item) { return texto(item.tituloFinal); });
    if (!disponibles.length) return '';
    return '<div class="student-process-panel__titles">' +
      '<h4>Propuestas enviadas anteriormente</h4><ol>' +
      disponibles.map(function (item) {
        return '<li' + (item.numero === numeroFavorito ? ' class="is-favorite"' : '') + '>' +
          '<div><strong>Propuesta ' + item.numero + '</strong>' +
          (item.numero === numeroFavorito ? '<span>Favorito anterior</span>' : '') + '</div>' +
          '<p>' + escapar(item.tituloFinal) + '</p></li>';
      }).join('') + '</ol></div>';
  }

  function mostrarPanel(resultado, estado, envio, resolucion) {
    var panel = panelEstado();
    var continuar = botonContinuar();
    var propuestas = propuestasAnteriores(envio);
    var numeroFavorito = favorito(envio);
    var observacion = comentario(resolucion, envio);
    var revisor = coordinador(resolucion, envio);
    var final = tituloAprobado(resolucion, envio);
    var clase = 'pending';
    var titulo = 'Tus propuestas están en revisión';
    var mensaje = 'El coordinador de titulación todavía no registra una resolución final.';
    var insignia = 'PENDIENTE DE REVISIÓN';
    var icono = '…';
    var contenidoExtra = listaTitulosHtml(propuestas, numeroFavorito);

    if (estado === 'DEVUELTO') {
      clase = 'returned';
      titulo = 'Tus propuestas fueron devueltas para corrección';
      mensaje = 'Revisa el comentario, corrige los títulos y vuelve a enviarlos.';
      insignia = 'DEVUELTO';
      icono = '!';
      contenidoExtra =
        '<div class="student-process-panel__comment"><span>Comentario del coordinador' +
        (revisor ? ': ' + escapar(revisor) : '') + '</span><p>' +
        escapar(observacion || 'La coordinación solicitó correcciones.') + '</p></div>' +
        listaTitulosHtml(propuestas, numeroFavorito) +
        '<div class="student-process-panel__notice"><strong>Los títulos anteriores fueron cargados.</strong> Puedes modificarlos antes de reenviar.</div>';
      if (continuar) {
        continuar.hidden = false;
        continuar.disabled = false;
        continuar.textContent = 'Corregir y reenviar';
        continuar.setAttribute('data-reenvio-activo', 'true');
      }
    } else if (estado === 'APROBADO' || estado === 'REEMPLAZADO') {
      clase = 'approved';
      titulo = estado === 'REEMPLAZADO' ? 'Tu título corregido fue aprobado' : 'Tu tema de titulación fue aprobado';
      mensaje = 'El proceso de revisión ha finalizado. No necesitas realizar un nuevo envío.';
      insignia = estado;
      icono = '✓';
      contenidoExtra = '<div class="student-process-panel__approved"><span>Título final aprobado</span><strong>' +
        escapar(final || 'Comunícate con coordinación para confirmar el título final.') + '</strong></div>' +
        (observacion ? '<div class="student-process-panel__comment"><span>Comentario del coordinador' +
          (revisor ? ': ' + escapar(revisor) : '') + '</span><p>' + escapar(observacion) + '</p></div>' : '');
      if (continuar) continuar.hidden = true;
    } else {
      if (continuar) continuar.hidden = true;
    }

    panel.className = 'student-process-panel student-process-panel--' + clase;
    panel.innerHTML = '<div class="student-process-panel__header">' +
      '<div class="student-process-panel__icon" aria-hidden="true">' + icono + '</div>' +
      '<div><span class="student-process-panel__badge">' + escapar(insignia) + '</span>' +
      '<h3>' + escapar(titulo) + '</h3><p>' + escapar(mensaje) + '</p></div></div>' +
      contenidoExtra;
    panel.hidden = false;
  }

  function prepararReenvio(estudiante, envio) {
    var state = modulo('EstudianteMVPState');
    var ui = modulo('EstudianteMVPUI');
    var memoria = modulo('EstudianteMVPMemoria');
    var propuestas = propuestasAnteriores(envio);
    var numeroFavorito = favorito(envio);
    var telegram = texto(campo(envio || {}, ['telegram', 'usuarioTelegram']));

    if (memoria && typeof memoria.borrar === 'function') memoria.borrar();
    if (state && typeof state.reiniciarTodo === 'function') state.reiniciarTodo();
    if (state && typeof state.setEstudiante === 'function') state.setEstudiante(estudiante);
    if (state && typeof state.setTelegram === 'function' && telegram) state.setTelegram(telegram);
    if (state && typeof state.setPropuestas === 'function') state.setPropuestas(propuestas);
    if (state && typeof state.setTituloPreferidoNumero === 'function' && numeroFavorito) {
      state.setTituloPreferidoNumero(numeroFavorito);
    }
    if (ui && typeof ui.aplicarEstadoEnFormulario === 'function' && state && typeof state.obtenerEstado === 'function') {
      ui.aplicarEstadoEnFormulario(state.obtenerEstado());
    }
  }

  function prepararEstudianteNuevo(estudiante) {
    var state = modulo('EstudianteMVPState');
    var memoria = modulo('EstudianteMVPMemoria');
    if (memoria && typeof memoria.borrar === 'function') memoria.borrar();
    if (state && typeof state.reiniciarTodo === 'function') state.reiniciarTodo();
    if (state && typeof state.setEstudiante === 'function') state.setEstudiante(estudiante);
  }

  function procesarResultado(resultado, identificacion) {
    var raw = resultado && (resultado.estudiante || resultado.registro);
    var estudiante;
    var envio;
    var resolucion;
    var estado;
    var ui = modulo('EstudianteMVPUI');
    var app = modulo('EstudianteMVPApp');

    if (!resultado || resultado.encontrado !== true || !raw) {
      throw new Error(resultado && resultado.mensaje || 'No encontramos un estudiante con esa cédula.');
    }

    estudiante = normalizarEstudiante(raw, identificacion);
    if (!estudiante.cedula || !estudiante.nombres || !estudiante.nombreCarrera) {
      throw new Error('El registro académico está incompleto.');
    }

    envio = resultado.envioOriginal || resultado.envio || null;
    resolucion = resultado.resolucion || null;
    estado = estadoEfectivo(resultado);

    limpiarPanel();

    if (estado === 'DEVUELTO') prepararReenvio(estudiante, envio || resultado.envio || {});
    else prepararEstudianteNuevo(estudiante);

    if (ui && typeof ui.pintarEstudiante === 'function') ui.pintarEstudiante(estudiante);
    if (ui && typeof ui.mostrarEstado === 'function') ui.mostrarEstado('#estadoPrincipal', '', '');
    if (app && typeof app.irPaso === 'function') app.irPaso('datos');

    if (estado !== 'SIN_ENVIO') {
      mostrarPanel(resultado, estado, envio || resultado.envio || {}, resolucion || {});
    }
  }

  function mostrarError(mensaje) {
    var ui = modulo('EstudianteMVPUI');
    var input = document.getElementById('cedulaInput');
    limpiarPanel();
    if (ui && typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado('#estadoPrincipal', mensaje, 'error');
    }
    if (input) input.focus();
  }

  function manejarConsulta(evento) {
    var ui = modulo('EstudianteMVPUI');
    var input = document.getElementById('cedulaInput');
    var identificacion = cedula(input && input.value);

    evento.preventDefault();
    evento.stopPropagation();
    evento.stopImmediatePropagation();

    if (!identificacion) {
      mostrarError('La cédula debe tener 10 números.');
      return;
    }
    if (consultaEnCurso) return;

    input.value = identificacion;
    limpiarPanel();
    if (ui && typeof ui.setCargando === 'function') {
      ui.setCargando(true, 'Consultando datos, envíos y resoluciones...');
    }
    if (ui && typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado('#estadoPrincipal', 'Verificando tu proceso de titulación...', 'info');
    }

    consultaEnCurso = consultarAcceso(identificacion)
      .then(function (resultado) {
        procesarResultado(resultado, identificacion);
      })
      .catch(function (error) {
        mostrarError(error && error.message || 'No se pudo consultar la información.');
      })
      .then(function () {
        consultaEnCurso = null;
        if (ui && typeof ui.setCargando === 'function') ui.setCargando(false);
      });
  }

  function instalar() {
    var form = document.getElementById('formConsulta');
    var input = document.getElementById('cedulaInput');
    if (window.__ESTUDIANTE_CONSULTA_REVISION_INSTALADA__) return;
    if (!form || !input || !modulo('EstudianteMVPUI') || !modulo('EstudianteMVPState') || !modulo('EstudianteMVPApp')) {
      intentosInstalacion += 1;
      if (intentosInstalacion < 150) window.setTimeout(instalar, 100);
      return;
    }

    window.__ESTUDIANTE_CONSULTA_REVISION_INSTALADA__ = true;
    input.maxLength = 10;
    input.pattern = '[0-9]{9,10}';
    panelEstado();
    form.addEventListener('submit', manejarConsulta, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }
})(window, document);
