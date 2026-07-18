/*
  Archivo: estudiante.consulta.revision.js
  Ruta: estudiantes-mvp/js/estudiante.consulta.revision.js
  Funciones principales:
  - Tolerar cédulas almacenadas con 9 dígitos por pérdida del cero inicial.
  - Mantener como cédula oficial la versión de 10 dígitos.
  - Consultar primero los datos del estudiante y luego sus envíos previos.
  - Mostrar una pantalla visible y personalizada cuando los títulos están en revisión.
*/
(function (window, document) {
  'use strict';

  var instalado = false;
  var intentosInstalacion = 0;
  var MAX_INTENTOS = 40;

  function utils() {
    return window.EstudianteMVPUtils || null;
  }

  function ui() {
    return window.EstudianteMVPUI || null;
  }

  function state() {
    return window.EstudianteMVPState || null;
  }

  function app() {
    return window.EstudianteMVPApp || null;
  }

  function estudiantesService() {
    return window.EstudianteMVPFirebaseEstudiantes || null;
  }

  function firebaseCore() {
    return window.EstudianteMVPFirebaseCore || null;
  }

  function sheetsService() {
    return window.EstudianteMVPSheets || null;
  }

  function config() {
    return window.EstudianteMVPConfig || null;
  }

  function soloDigitos(valor) {
    return String(valor == null ? '' : valor).replace(/\D/g, '');
  }

  function normalizarCedula(valor) {
    var digitos = soloDigitos(valor);

    if (digitos.length === 9) {
      return '0' + digitos;
    }

    if (digitos.length === 10) {
      return digitos;
    }

    return '';
  }

  function variantesCedula(valor) {
    var oficial = normalizarCedula(valor);
    var lista = [];

    if (!oficial) {
      return lista;
    }

    lista.push(oficial);

    if (oficial.charAt(0) === '0') {
      lista.push(oficial.slice(1));
    }

    return lista.filter(function (item, index, todos) {
      return item && todos.indexOf(item) === index;
    });
  }

  function texto(valor) {
    return String(valor == null ? '' : valor).trim();
  }

  function valorCampo(objeto, claves) {
    var data = objeto || {};
    var i;

    for (i = 0; i < claves.length; i += 1) {
      if (
        data[claves[i]] !== undefined &&
        data[claves[i]] !== null &&
        texto(data[claves[i]])
      ) {
        return data[claves[i]];
      }
    }

    return '';
  }

  function escaparHtml(valor) {
    return String(valor == null ? '' : valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function normalizarEstudiante(resultado, cedulaOficial) {
    var estudiante = resultado && resultado.estudiante
      ? resultado.estudiante
      : resultado || {};
    var raw = estudiante.raw || {};
    var copia = {};

    Object.keys(raw).forEach(function (clave) {
      copia[clave] = raw[clave];
    });

    Object.keys(estudiante).forEach(function (clave) {
      if (clave !== 'raw') {
        copia[clave] = estudiante[clave];
      }
    });

    copia.cedula = cedulaOficial;
    copia.numeroIdentificacion = cedulaOficial;
    copia.identificacion = cedulaOficial;

    copia.nombres = texto(valorCampo(copia, [
      'nombres', 'Nombres', 'nombreCompleto', 'NombreCompleto', 'nombre', 'Nombre'
    ]));

    copia.nombreCarrera = texto(valorCampo(copia, [
      'nombreCarrera', 'NombreCarrera', 'carrera', 'Carrera'
    ]));
    copia.carrera = copia.nombreCarrera;

    copia.codigoCarrera = texto(valorCampo(copia, [
      'codigoCarrera', 'CodigoCarrera'
    ]));

    copia.periodoId = texto(valorCampo(copia, [
      'periodoId', 'PeriodoId', 'ultimoPeriodoId', 'periodo', 'Periodo'
    ]));

    copia.periodoLabel = texto(valorCampo(copia, [
      'periodoLabel', 'PeriodoLabel', 'periodoTexto', 'PeriodoTexto', 'periodo', 'Periodo'
    ]));

    if (!copia.periodoLabel && config() && typeof config().obtenerPeriodoFallback === 'function') {
      copia.periodoLabel = config().obtenerPeriodoFallback().periodoLabel || '';
    }

    return copia;
  }

  function estudianteValido(estudiante) {
    return !!(
      estudiante &&
      estudiante.cedula &&
      estudiante.nombres &&
      (estudiante.carrera || estudiante.nombreCarrera)
    );
  }

  function buscarEstudiante(cedulaOficial) {
    var servicio = estudiantesService();
    var variantes = variantesCedula(cedulaOficial);
    var indice = 0;
    var ultimoResultado = null;

    if (!servicio || typeof servicio.buscarPorCedula !== 'function') {
      return Promise.reject(new Error('No está disponible el servicio de consulta de estudiantes.'));
    }

    function intentarSiguiente() {
      if (indice >= variantes.length) {
        return Promise.resolve(ultimoResultado);
      }

      return servicio.buscarPorCedula(variantes[indice++])
        .then(function (resultado) {
          var estudiante = normalizarEstudiante(resultado, cedulaOficial);

          ultimoResultado = resultado;

          if (
            resultado &&
            resultado.encontrado !== false &&
            estudianteValido(estudiante)
          ) {
            return estudiante;
          }

          return intentarSiguiente();
        })
        .catch(function () {
          return intentarSiguiente();
        });
    }

    return intentarSiguiente().then(function (resultado) {
      if (estudianteValido(resultado)) {
        return resultado;
      }

      throw new Error('No encontramos un estudiante con esa cédula. Revisa el número e intenta nuevamente.');
    });
  }

  function normalizarEnvio(resultado, origen) {
    var data = resultado && resultado.envio
      ? resultado.envio
      : resultado && resultado.data
        ? resultado.data
        : resultado || {};
    var datos = data && data.datos && typeof data.datos === 'object'
      ? data.datos
      : {};
    var combinado = {};

    Object.keys(datos).forEach(function (clave) {
      combinado[clave] = datos[clave];
    });

    Object.keys(data || {}).forEach(function (clave) {
      if (clave !== 'datos') {
        combinado[clave] = data[clave];
      }
    });

    combinado._origenConsulta = origen || '';
    return combinado;
  }

  function obtenerTitulos(envio) {
    var data = envio || {};
    var lista = [];
    var propuestas = data.titulosEnviados || data.propuestas || data.titulos;

    if (Array.isArray(propuestas)) {
      propuestas.forEach(function (item) {
        var titulo = typeof item === 'string'
          ? item
          : valorCampo(item || {}, [
            'tituloFinal', 'titulo', 'tituloMejorado', 'texto', 'tituloGenerado'
          ]);

        if (texto(titulo)) {
          lista.push(texto(titulo));
        }
      });
    }

    [1, 2, 3].forEach(function (numero) {
      var titulo = valorCampo(data, [
        'titulo' + numero,
        'titulo_' + numero,
        'tituloFinal' + numero,
        'tituloFinal_' + numero
      ]);

      if (texto(titulo) && lista.indexOf(texto(titulo)) === -1) {
        lista.push(texto(titulo));
      }
    });

    return lista.slice(0, 3);
  }

  function tieneEnvio(envio) {
    var data = envio || {};
    var estado = texto(valorCampo(data, [
      'estado', 'estadoFirebase', 'estadoFinal', 'estadoProceso', 'estadoGoogleSheets'
    ])).toUpperCase();
    var titulos = obtenerTitulos(data);

    return !!(
      titulos.length ||
      estado === 'ENVIADO' ||
      estado === 'PENDIENTE_REVISION' ||
      estado === 'PENDIENTE_SYNC' ||
      estado === 'RESPALDADO' ||
      estado === 'APROBADO'
    );
  }

  function consultarSheets(cedulaOficial) {
    var servicio = sheetsService();
    var variantes = variantesCedula(cedulaOficial);
    var indice = 0;

    if (!servicio || typeof servicio.consultarEnvioPorCedula !== 'function') {
      return Promise.resolve(null);
    }

    function intentar() {
      if (indice >= variantes.length) {
        return Promise.resolve(null);
      }

      return servicio.consultarEnvioPorCedula(variantes[indice++])
        .then(function (resultado) {
          var envio = normalizarEnvio(resultado, 'google-sheets');

          if (resultado && resultado.encontrado === true && tieneEnvio(envio)) {
            return envio;
          }

          return intentar();
        })
        .catch(function () {
          return intentar();
        });
    }

    return intentar();
  }

  function consultarFirebase(cedulaOficial) {
    var firebase = firebaseCore();
    var configuracion = config();
    var variantes = variantesCedula(cedulaOficial);
    var coleccion = configuracion && typeof configuracion.obtenerColeccion === 'function'
      ? configuracion.obtenerColeccion('titulos') || 'titulos'
      : 'titulos';
    var consultas = [];

    if (!firebase) {
      return Promise.resolve(null);
    }

    if (typeof firebase.leerDocumento === 'function') {
      variantes.forEach(function (cedula) {
        consultas.push(
          firebase.leerDocumento(coleccion, cedula).catch(function () {
            return null;
          })
        );
      });
    }

    if (typeof firebase.consultarPorCampo === 'function') {
      ['cedula', 'numeroIdentificacion'].forEach(function (campo) {
        variantes.forEach(function (cedula) {
          consultas.push(
            firebase.consultarPorCampo(coleccion, campo, '==', cedula, 5)
              .catch(function () {
                return [];
              })
          );

          if (Number.isSafeInteger(Number(cedula))) {
            consultas.push(
              firebase.consultarPorCampo(coleccion, campo, '==', Number(cedula), 5)
                .catch(function () {
                  return [];
                })
            );
          }
        });
      });
    }

    if (!consultas.length) {
      return Promise.resolve(null);
    }

    return Promise.all(consultas).then(function (resultados) {
      var candidatos = [];

      resultados.forEach(function (resultado) {
        if (Array.isArray(resultado)) {
          candidatos = candidatos.concat(resultado);
        } else if (resultado) {
          candidatos.push(resultado);
        }
      });

      for (var i = 0; i < candidatos.length; i += 1) {
        var envio = normalizarEnvio(candidatos[i], 'firebase');

        if (tieneEnvio(envio)) {
          return envio;
        }
      }

      return null;
    });
  }

  function buscarEnvio(cedulaOficial) {
    return Promise.all([
      consultarSheets(cedulaOficial),
      consultarFirebase(cedulaOficial)
    ]).then(function (resultados) {
      return resultados[0] || resultados[1] || null;
    });
  }

  function ocultarFlujoNormal() {
    var stepper = document.querySelector('.stepper');
    var paneles = document.querySelectorAll('[data-step-panel]');
    var estadoPrincipal = document.getElementById('estadoPrincipal');

    if (stepper) {
      stepper.hidden = true;
    }

    Array.prototype.forEach.call(paneles, function (panel) {
      panel.hidden = true;
      panel.classList.remove('is-active');
    });

    if (estadoPrincipal) {
      estadoPrincipal.textContent = '';
      estadoPrincipal.className = 'status-message';
      estadoPrincipal.hidden = true;
    }
  }

  function mostrarFlujoNormal() {
    var stepper = document.querySelector('.stepper');
    var estadoPrincipal = document.getElementById('estadoPrincipal');
    var panelRevision = document.getElementById('revisionTitulosPanel');

    if (stepper) {
      stepper.hidden = false;
    }

    if (estadoPrincipal) {
      estadoPrincipal.hidden = false;
    }

    if (panelRevision) {
      panelRevision.hidden = true;
    }
  }

  function asegurarPanelRevision() {
    var existente = document.getElementById('revisionTitulosPanel');
    var main = document.querySelector('.app-container');
    var estado = document.getElementById('estadoPrincipal');

    if (existente) {
      return existente;
    }

    existente = document.createElement('section');
    existente.id = 'revisionTitulosPanel';
    existente.className = 'review-status-card';
    existente.hidden = true;
    existente.setAttribute('aria-live', 'polite');

    if (main && estado && estado.parentNode === main) {
      main.insertBefore(existente, estado.nextSibling);
    } else if (main) {
      main.appendChild(existente);
    }

    existente.addEventListener('click', function (evento) {
      var boton = evento.target && evento.target.closest
        ? evento.target.closest('[data-review-action="otra-cedula"]')
        : null;

      if (!boton) {
        return;
      }

      evento.preventDefault();
      reiniciarConsulta();
    });

    return existente;
  }

  function renderDato(etiqueta, valor) {
    return [
      '<div class="review-data__item">',
      '  <span>', escaparHtml(etiqueta), '</span>',
      '  <strong>', escaparHtml(texto(valor) || 'No registrado'), '</strong>',
      '</div>'
    ].join('');
  }

  function mostrarRevision(estudiante, envio) {
    var panel = asegurarPanelRevision();
    var titulos = obtenerTitulos(envio);
    var estadoEnvio = texto(valorCampo(envio, [
      'estado', 'estadoFinal', 'estadoProceso', 'estadoFirebase'
    ])).toUpperCase();
    var etiquetaEstado = estadoEnvio === 'PENDIENTE_SYNC'
      ? 'Registro recibido — sincronización pendiente'
      : 'En revisión por coordinación';
    var listaTitulos = '';

    ocultarFlujoNormal();

    if (titulos.length) {
      listaTitulos = [
        '<div class="review-titles">',
        '  <h3>Propuestas registradas</h3>',
        '  <ol>',
        titulos.map(function (titulo) {
          return '<li>' + escaparHtml(titulo) + '</li>';
        }).join(''),
        '  </ol>',
        '</div>'
      ].join('');
    }

    panel.innerHTML = [
      '<div class="review-status-card__hero">',
      '  <div class="review-status-card__icon" aria-hidden="true">✓</div>',
      '  <div>',
      '    <p class="review-status-card__eyebrow">Registro confirmado</p>',
      '    <h2>Tus propuestas ya fueron enviadas</h2>',
      '    <span class="review-status-card__badge">', escaparHtml(etiquetaEstado), '</span>',
      '  </div>',
      '</div>',
      '<p class="review-status-card__message">',
      '  El coordinador está revisando tus títulos. No necesitas enviarlos nuevamente. ',
      '  Ingresa en unos días para consultar el estado del proceso.',
      '</p>',
      '<div class="review-data">',
      renderDato('Estudiante', estudiante.nombres),
      renderDato('Cédula', estudiante.cedula),
      renderDato('Carrera', estudiante.carrera || estudiante.nombreCarrera),
      renderDato('Período', estudiante.periodoLabel || estudiante.periodoId),
      '</div>',
      listaTitulos,
      '<div class="review-status-card__footer">',
      '  <div class="review-status-card__notice">',
      '    <strong>Importante:</strong> este registro ya está protegido para evitar envíos duplicados.',
      '  </div>',
      '  <button class="btn btn--secondary" type="button" data-review-action="otra-cedula">',
      '    Consultar otra cédula',
      '  </button>',
      '</div>'
    ].join('');

    panel.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function continuarFormulario(estudiante) {
    var estado = state();
    var interfaz = ui();
    var aplicacion = app();

    mostrarFlujoNormal();

    if (estado && typeof estado.setEstudiante === 'function') {
      estado.setEstudiante(estudiante);
    }

    if (interfaz && typeof interfaz.pintarEstudiante === 'function') {
      interfaz.pintarEstudiante(estudiante);
    }

    if (interfaz && typeof interfaz.mostrarEstado === 'function') {
      interfaz.mostrarEstado('#estadoPrincipal', '', '');
    }

    if (aplicacion && typeof aplicacion.irPaso === 'function') {
      aplicacion.irPaso('datos');
    }
  }

  function reiniciarConsulta() {
    var aplicacion = app();
    var input = document.getElementById('cedulaInput');

    mostrarFlujoNormal();

    if (aplicacion && typeof aplicacion.nuevoRegistro === 'function') {
      aplicacion.nuevoRegistro();
    } else if (aplicacion && typeof aplicacion.irPaso === 'function') {
      aplicacion.irPaso('consulta');
    }

    if (input) {
      input.value = '';
      input.focus();
    }
  }

  function mostrarError(mensaje) {
    var interfaz = ui();
    var input = document.getElementById('cedulaInput');

    mostrarFlujoNormal();

    if (interfaz && typeof interfaz.mostrarEstado === 'function') {
      interfaz.mostrarEstado('#estadoPrincipal', mensaje, 'error');
    }

    if (input) {
      input.focus();
    }
  }

  function manejarConsulta(evento) {
    var interfaz = ui();
    var input = document.getElementById('cedulaInput');
    var cedulaOficial = normalizarCedula(input ? input.value : '');

    evento.preventDefault();
    evento.stopPropagation();
    evento.stopImmediatePropagation();

    if (!cedulaOficial) {
      mostrarError('La cédula debe tener 10 números. También se tolera el registro antiguo de 9 números cuando se perdió el cero inicial.');
      return;
    }

    input.value = cedulaOficial;
    mostrarFlujoNormal();

    if (interfaz && typeof interfaz.setCargando === 'function') {
      interfaz.setCargando(true, 'Consultando datos y estado del registro...');
    }

    if (interfaz && typeof interfaz.mostrarEstado === 'function') {
      interfaz.mostrarEstado(
        '#estadoPrincipal',
        'Validando tu identidad y revisando si ya enviaste tus propuestas...',
        'info'
      );
    }

    buscarEstudiante(cedulaOficial)
      .then(function (estudiante) {
        return buscarEnvio(cedulaOficial)
          .then(function (envio) {
            return {
              estudiante: estudiante,
              envio: envio
            };
          });
      })
      .then(function (resultado) {
        if (resultado.envio) {
          mostrarRevision(resultado.estudiante, resultado.envio);
          return;
        }

        continuarFormulario(resultado.estudiante);
      })
      .catch(function (error) {
        mostrarError(
          error && error.message
            ? error.message
            : 'No encontramos un estudiante con esa cédula. Revisa el número e intenta nuevamente.'
        );
      })
      .then(function () {
        if (interfaz && typeof interfaz.setCargando === 'function') {
          interfaz.setCargando(false);
        }
      });
  }

  function instalar() {
    var formulario = document.getElementById('formConsulta');
    var input = document.getElementById('cedulaInput');

    if (instalado) {
      return;
    }

    if (
      !formulario ||
      !input ||
      !utils() ||
      !ui() ||
      !state() ||
      !app() ||
      !estudiantesService()
    ) {
      intentosInstalacion += 1;

      if (intentosInstalacion <= MAX_INTENTOS) {
        window.setTimeout(instalar, 100);
      }

      return;
    }

    instalado = true;
    asegurarPanelRevision();

    input.setAttribute('maxlength', '10');
    input.setAttribute('pattern', '[0-9]{9,10}');

    formulario.addEventListener('submit', manejarConsulta, true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }
})(window, document);
