/*
  Consulta pública reforzada:
  - acepta cédulas oficiales de 10 dígitos;
  - busca también la variante antigua de 9 dígitos sin cero inicial;
  - muestra una pantalla personalizada cuando ya existen títulos enviados.
*/
(function (window, document) {
  'use strict';

  var instalado = false;
  var intentos = 0;

  function get(nombre) { return window[nombre] || null; }
  function texto(valor) { return String(valor == null ? '' : valor).trim(); }
  function digitos(valor) { return String(valor == null ? '' : valor).replace(/\D/g, ''); }

  function normalizarCedula(valor) {
    var cedula = digitos(valor);
    if (cedula.length === 9) return '0' + cedula;
    if (cedula.length === 10) return cedula;
    return '';
  }

  function variantesCedula(valor) {
    var oficial = normalizarCedula(valor);
    var lista = oficial ? [oficial] : [];
    if (oficial && oficial.charAt(0) === '0') lista.push(oficial.slice(1));
    return lista.filter(function (item, index, todos) {
      return item && todos.indexOf(item) === index;
    });
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
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function coleccion(nombre, fallback) {
    var config = get('EstudianteMVPConfig');
    return config && typeof config.obtenerColeccion === 'function'
      ? config.obtenerColeccion(nombre) || fallback
      : fallback;
  }

  function consultasCedula(nombreColeccion, cedula, incluirDocumento) {
    var firebase = get('EstudianteMVPFirebaseCore');
    var variantes = variantesCedula(cedula);
    var consultas = [];

    if (!firebase) return consultas;

    if (incluirDocumento && typeof firebase.leerDocumento === 'function') {
      variantes.forEach(function (variante) {
        consultas.push(firebase.leerDocumento(nombreColeccion, variante).catch(function () { return null; }));
      });
    }

    if (typeof firebase.consultarPorCampo === 'function') {
      ['numeroIdentificacion', 'cedula'].forEach(function (nombreCampo) {
        variantes.forEach(function (variante) {
          consultas.push(
            firebase.consultarPorCampo(nombreColeccion, nombreCampo, '==', variante, 5)
              .catch(function () { return []; })
          );

          if (Number.isSafeInteger(Number(variante))) {
            consultas.push(
              firebase.consultarPorCampo(nombreColeccion, nombreCampo, '==', Number(variante), 5)
                .catch(function () { return []; })
            );
          }
        });
      });
    }

    return consultas;
  }

  function aLista(resultados) {
    var lista = [];
    (resultados || []).forEach(function (resultado) {
      if (Array.isArray(resultado)) lista = lista.concat(resultado);
      else if (resultado && resultado.estudiante) lista.push(resultado.estudiante);
      else if (resultado) lista.push(resultado);
    });
    return lista;
  }

  function normalizarEstudiante(data, cedulaOficial) {
    var servicio = get('EstudianteMVPFirebaseEstudiantes');
    var config = get('EstudianteMVPConfig');
    var normalizado = servicio && typeof servicio.normalizarEstudiante === 'function'
      ? servicio.normalizarEstudiante(data || {}, cedulaOficial)
      : data || {};
    var raw = normalizado.raw || {};
    var estudiante = {};

    Object.keys(raw).forEach(function (clave) { estudiante[clave] = raw[clave]; });
    Object.keys(normalizado).forEach(function (clave) {
      if (clave !== 'raw') estudiante[clave] = normalizado[clave];
    });

    estudiante.cedula = cedulaOficial;
    estudiante.numeroIdentificacion = cedulaOficial;
    estudiante.identificacion = cedulaOficial;
    estudiante.nombres = texto(campo(estudiante, [
      'nombres', 'Nombres', 'nombreCompleto', 'NombreCompleto', 'nombre', 'Nombre'
    ]));
    estudiante.nombreCarrera = texto(campo(estudiante, [
      'nombreCarrera', 'NombreCarrera', 'carrera', 'Carrera'
    ]));
    estudiante.carrera = estudiante.nombreCarrera;
    estudiante.periodoId = texto(campo(estudiante, [
      'periodoId', 'PeriodoId', 'ultimoPeriodoId', 'periodo', 'Periodo'
    ]));
    estudiante.periodoLabel = texto(campo(estudiante, [
      'periodoLabel', 'PeriodoLabel', 'periodoTexto', 'PeriodoTexto', 'periodo', 'Periodo'
    ]));

    if (!estudiante.periodoLabel && config && typeof config.obtenerPeriodoFallback === 'function') {
      estudiante.periodoLabel = config.obtenerPeriodoFallback().periodoLabel || '';
    }

    return estudiante;
  }

  function estudianteValido(estudiante) {
    return !!(
      estudiante && estudiante.cedula && estudiante.nombres &&
      (estudiante.carrera || estudiante.nombreCarrera)
    );
  }

  function buscarEstudiante(cedula) {
    var consultas = consultasCedula(coleccion('estudiantes', 'Estudiantes'), cedula, true);
    var servicio = get('EstudianteMVPFirebaseEstudiantes');

    if (!consultas.length && servicio && typeof servicio.buscarPorCedula === 'function') {
      consultas.push(servicio.buscarPorCedula(cedula).catch(function () { return null; }));
    }

    return Promise.all(consultas).then(function (resultados) {
      var candidatos = aLista(resultados);
      for (var i = 0; i < candidatos.length; i += 1) {
        var estudiante = normalizarEstudiante(candidatos[i], cedula);
        if (estudianteValido(estudiante)) return estudiante;
      }
      throw new Error('No encontramos un estudiante con esa cédula. Revisa el número e intenta nuevamente.');
    });
  }

  function normalizarEnvio(resultado, origen) {
    var base = resultado && resultado.envio
      ? resultado.envio
      : resultado && resultado.data
        ? resultado.data
        : resultado || {};
    var datos = base.datos && typeof base.datos === 'object' ? base.datos : {};
    var envio = {};

    Object.keys(datos).forEach(function (clave) { envio[clave] = datos[clave]; });
    Object.keys(base).forEach(function (clave) {
      if (clave !== 'datos') envio[clave] = base[clave];
    });
    envio._origen = origen || '';
    return envio;
  }

  function buscarEnvioSheets(cedula) {
    var sheets = get('EstudianteMVPSheets');
    var variantes = variantesCedula(cedula);
    var indice = 0;

    if (!sheets || typeof sheets.consultarEnvioPorCedula !== 'function') return Promise.resolve(null);

    function siguiente() {
      if (indice >= variantes.length) return Promise.resolve(null);
      return sheets.consultarEnvioPorCedula(variantes[indice++])
        .then(function (resultado) {
          return resultado && resultado.encontrado === true
            ? normalizarEnvio(resultado, 'google-sheets')
            : siguiente();
        })
        .catch(siguiente);
    }

    return siguiente();
  }

  function buscarEnvioFirebase(cedula) {
    var consultas = consultasCedula(coleccion('titulos', 'titulos'), cedula, true);
    if (!consultas.length) return Promise.resolve(null);

    return Promise.all(consultas).then(function (resultados) {
      var candidatos = aLista(resultados);
      return candidatos.length ? normalizarEnvio(candidatos[0], 'firebase') : null;
    });
  }

  function buscarEnvio(cedula) {
    return Promise.all([buscarEnvioSheets(cedula), buscarEnvioFirebase(cedula)])
      .then(function (resultados) { return resultados[0] || resultados[1] || null; });
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
        'titulo' + numero, 'titulo_' + numero,
        'tituloFinal' + numero, 'tituloFinal_' + numero
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
    var estado = texto(campo(envio, ['estado', 'estadoFinal', 'estadoProceso', 'estadoFirebase'])).toUpperCase();
    var etiqueta = estado === 'PENDIENTE_SYNC'
      ? 'Registro recibido — sincronización pendiente'
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
      '<p class="review-status-card__message">El coordinador está revisando tus títulos. ',
      'No necesitas enviarlos nuevamente. Ingresa en unos días para consultar el estado del proceso.</p>',
      '<div class="review-data">',
      dato('Estudiante', estudiante.nombres),
      dato('Cédula', estudiante.cedula),
      dato('Carrera', estudiante.carrera || estudiante.nombreCarrera),
      dato('Período', estudiante.periodoLabel || estudiante.periodoId),
      '</div>', bloqueTitulos,
      '<div class="review-status-card__footer">',
      '<div class="review-status-card__notice"><strong>Importante:</strong> este registro ya está protegido para evitar envíos duplicados.</div>',
      '<button class="btn btn--secondary" type="button" data-review-action="otra-cedula">Consultar otra cédula</button>',
      '</div>'
    ].join('');
    panel.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function continuar(estudiante) {
    var estado = get('EstudianteMVPState');
    var interfaz = get('EstudianteMVPUI');
    var aplicacion = get('EstudianteMVPApp');

    mostrarFlujo(true);
    if (estado && typeof estado.setEstudiante === 'function') estado.setEstudiante(estudiante);
    if (interfaz && typeof interfaz.pintarEstudiante === 'function') interfaz.pintarEstudiante(estudiante);
    if (interfaz && typeof interfaz.mostrarEstado === 'function') interfaz.mostrarEstado('#estadoPrincipal', '', '');
    if (aplicacion && typeof aplicacion.irPaso === 'function') aplicacion.irPaso('datos');
  }

  function reiniciar() {
    var aplicacion = get('EstudianteMVPApp');
    var input = document.getElementById('cedulaInput');
    mostrarFlujo(true);
    if (aplicacion && typeof aplicacion.nuevoRegistro === 'function') aplicacion.nuevoRegistro();
    else if (aplicacion && typeof aplicacion.irPaso === 'function') aplicacion.irPaso('consulta');
    if (input) {
      input.value = '';
      input.focus();
    }
  }

  function mostrarError(mensaje) {
    var interfaz = get('EstudianteMVPUI');
    var input = document.getElementById('cedulaInput');
    mostrarFlujo(true);
    if (interfaz && typeof interfaz.mostrarEstado === 'function') {
      interfaz.mostrarEstado('#estadoPrincipal', mensaje, 'error');
    }
    if (input) input.focus();
  }

  function consultar(evento) {
    var interfaz = get('EstudianteMVPUI');
    var input = document.getElementById('cedulaInput');
    var cedula = normalizarCedula(input ? input.value : '');

    evento.preventDefault();
    evento.stopPropagation();
    evento.stopImmediatePropagation();

    if (!cedula) {
      mostrarError('La cédula debe tener 10 números. También se tolera el registro antiguo de 9 números cuando se perdió el cero inicial.');
      return;
    }

    input.value = cedula;
    mostrarFlujo(true);
    if (interfaz && typeof interfaz.setCargando === 'function') {
      interfaz.setCargando(true, 'Consultando datos y estado del registro...');
    }
    if (interfaz && typeof interfaz.mostrarEstado === 'function') {
      interfaz.mostrarEstado('#estadoPrincipal', 'Validando tu identidad y revisando si ya enviaste tus propuestas...', 'info');
    }

    buscarEstudiante(cedula)
      .then(function (estudiante) {
        return buscarEnvio(cedula).then(function (envio) {
          return { estudiante: estudiante, envio: envio };
        });
      })
      .then(function (resultado) {
        if (resultado.envio) mostrarRevision(resultado.estudiante, resultado.envio);
        else continuar(resultado.estudiante);
      })
      .catch(function (error) {
        mostrarError(error && error.message
          ? error.message
          : 'No encontramos un estudiante con esa cédula. Revisa el número e intenta nuevamente.');
      })
      .then(function () {
        if (interfaz && typeof interfaz.setCargando === 'function') interfaz.setCargando(false);
      });
  }

  function instalar() {
    var form = document.getElementById('formConsulta');
    var input = document.getElementById('cedulaInput');

    if (instalado) return;
    if (!form || !input || !get('EstudianteMVPUI') || !get('EstudianteMVPState') ||
        !get('EstudianteMVPApp') || !get('EstudianteMVPFirebaseEstudiantes')) {
      intentos += 1;
      if (intentos <= 50) window.setTimeout(instalar, 100);
      return;
    }

    instalado = true;
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
