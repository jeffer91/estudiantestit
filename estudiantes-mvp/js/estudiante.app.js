/*
  Archivo: estudiante.app.js
  Ruta: estudiantes-mvp/js/estudiante.app.js
  Funciones principales:
  - Controlar el flujo completo de estudiante.html.
  - Consultar estudiante por cédula en Firebase.
  - Verificar si la cédula ya tiene un envío registrado.
  - Validar siempre la cédula y los nombres antes de continuar.
  - Recuperar títulos guardados después de validar la identidad.
  - Mantener desactivado el modal de recuperación de avance.
  - Validar Telegram, propuestas y título favorito.
  - Activar IA de Titulación.
  - Guardar automáticamente el avance.
  - Enviar a Google Sheets y respaldar en Firebase.
*/
(function (window, document) {
  'use strict';

  var eventosConectados = false;

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function obtenerState() {
    return window.EstudianteMVPState || null;
  }

  function obtenerUI() {
    return window.EstudianteMVPUI || null;
  }

  function obtenerFirebaseEstudiantes() {
    return window.EstudianteMVPFirebaseEstudiantes || null;
  }

  function obtenerIATitulacion() {
    return window.EstudianteMVPIATitulacion || null;
  }

  function obtenerSheets() {
    return window.EstudianteMVPSheets || null;
  }

  function obtenerFirebaseEnvios() {
    return window.EstudianteMVPFirebaseEnvios || null;
  }

  function obtenerMemoria() {
    return window.EstudianteMVPMemoria || null;
  }

  function obtenerPaginacionPropuestas() {
    return window.EstudianteMVPPropuestasPaginacion || null;
  }

  function obtenerModales() {
    return window.EstudianteMVPModales || null;
  }

  function iniciar() {
    var ui;
    var state;
    var memoria;
    var paginacion;

    if (!validarDependencias()) {
      return;
    }

    ui = obtenerUI();
    state = obtenerState();
    memoria = obtenerMemoria();
    paginacion = obtenerPaginacionPropuestas();

    conectarEventos();

    paginacion.iniciar({
      propuestaInicial: state.obtenerPropuestaActual
        ? state.obtenerPropuestaActual()
        : 1,

      alCambiar: function (numero) {
        state.setPropuestaActual(numero);
        refrescarCamposPropuestasAutoExpandibles();

        guardarAvance({
          pasoActual: 'propuestas',
          propuestaActual: numero
        });
      },

      alGuardarPropuesta: function (numero) {
        guardarPropuestaDesdeFormulario(numero);
      },

      alValidarPropuesta: function (numero) {
        guardarPropuestaDesdeFormulario(numero);
        return state.validarPropuesta(numero);
      },

      alVerResumen: function () {
        prepararResumenDesdePropuestas();
      }
    });

    if (
      memoria &&
      typeof memoria.escucharCambiosFormulario === 'function'
    ) {
      memoria.escucharCambiosFormulario();
    }

    ui.mostrarPaso('consulta');
    state.setPasoActual('consulta');

    ui.mostrarEstado(
      '#estadoPrincipal',
      'Ingresa tu cédula para iniciar.',
      'info'
    );

    ui.enfocar('#cedulaInput');

    /*
      Modal de recuperación desactivado.

      Aunque exista información guardada en la memoria del navegador,
      el estudiante siempre debe ingresar primero su cédula.

      Los títulos se recuperarán únicamente después de validar la
      cédula y los nombres en Firebase.
    */

    console.info('[Estudiantes MVP] Pantalla estudiante iniciada.');
  }

  function validarDependencias() {
    var faltantes = [];

    if (!obtenerUtils()) {
      faltantes.push('EstudianteMVPUtils');
    }

    if (!obtenerState()) {
      faltantes.push('EstudianteMVPState');
    }

    if (!obtenerUI()) {
      faltantes.push('EstudianteMVPUI');
    }

    if (!obtenerFirebaseEstudiantes()) {
      faltantes.push('EstudianteMVPFirebaseEstudiantes');
    }

    if (!obtenerIATitulacion()) {
      faltantes.push('EstudianteMVPIATitulacion');
    }

    if (!obtenerSheets()) {
      faltantes.push('EstudianteMVPSheets');
    }

    if (!obtenerFirebaseEnvios()) {
      faltantes.push('EstudianteMVPFirebaseEnvios');
    }

    if (!obtenerMemoria()) {
      faltantes.push('EstudianteMVPMemoria');
    }

    if (!obtenerPaginacionPropuestas()) {
      faltantes.push('EstudianteMVPPropuestasPaginacion');
    }

    if (faltantes.length) {
      console.error(
        '[Estudiantes MVP] Faltan módulos:',
        faltantes
      );

      var estado = document.getElementById('estadoPrincipal');

      if (estado) {
        estado.textContent =
          'Faltan módulos internos: ' + faltantes.join(', ');

        estado.classList.add('is-error');
      }

      return false;
    }

    return true;
  }

  function conectarEventos() {
    var formConsulta;
    var formTelegram;
    var formPropuestas;
    var formEnvio;

    if (eventosConectados) {
      return;
    }

    eventosConectados = true;

    document.addEventListener(
      'click',
      manejarClickGeneral
    );

    document.addEventListener(
      'change',
      manejarChangeGeneral
    );

    document.addEventListener(
      'input',
      manejarInputGeneral
    );

    formConsulta = document.getElementById('formConsulta');
    formTelegram = document.getElementById('formTelegram');
    formPropuestas = document.getElementById('formPropuestas');
    formEnvio = document.getElementById('formEnvio');

    if (formConsulta) {
      formConsulta.addEventListener(
        'submit',
        manejarConsulta
      );
    }

    if (formTelegram) {
      formTelegram.addEventListener(
        'submit',
        manejarTelegram
      );
    }

    if (formPropuestas) {
      formPropuestas.addEventListener(
        'submit',
        manejarPropuestas
      );
    }

    if (formEnvio) {
      formEnvio.addEventListener(
        'submit',
        manejarEnvio
      );
    }

    prepararCamposPropuestasAutoExpandibles();
  }

  function manejarInputGeneral(evento) {
    var target = evento.target;

    if (
      target &&
      target.matches &&
      target.matches(
        '#formPropuestas textarea[data-auto-grow="true"]'
      )
    ) {
      autoAjustarCampoPropuesta(target);
    }
  }

  function prepararCamposPropuestasAutoExpandibles() {
    var form = document.getElementById('formPropuestas');

    if (!form) {
      return;
    }

    convertirInputsPropuestaATextarea(form);
    marcarTitulosPropuestaDestacados(form);
    refrescarCamposPropuestasAutoExpandibles();
  }

  function convertirInputsPropuestaATextarea(form) {
    var inputs = form.querySelectorAll('input');

    Array.prototype.forEach.call(
      inputs,
      function (input) {
        var textarea;

        if (
          !input ||
          input.getAttribute('data-convertido-textarea') === 'true'
        ) {
          return;
        }

        textarea = document.createElement('textarea');

        Array.prototype.forEach.call(
          input.attributes,
          function (atributo) {
            if (
              atributo.name === 'type' ||
              atributo.name === 'value'
            ) {
              return;
            }

            textarea.setAttribute(
              atributo.name,
              atributo.value
            );
          }
        );

        textarea.value = input.value || '';

        textarea.rows =
          input.id &&
          input.id.indexOf('Titulo') !== -1
            ? 2
            : 1;

        textarea.setAttribute(
          'data-auto-grow',
          'true'
        );

        textarea.setAttribute(
          'data-convertido-textarea',
          'true'
        );

        input.parentNode.replaceChild(
          textarea,
          input
        );
      }
    );
  }

  function marcarTitulosPropuestaDestacados(form) {
    ['p1Titulo', 'p2Titulo', 'p3Titulo'].forEach(
      function (id) {
        var campo = document.getElementById(id);

        var contenedor =
          campo && campo.closest
            ? campo.closest('.field')
            : null;

        if (contenedor) {
          contenedor.classList.add(
            'field--titulo-destacado'
          );
        }
      }
    );
  }

  function refrescarCamposPropuestasAutoExpandibles() {
    var campos = document.querySelectorAll(
      '#formPropuestas textarea'
    );

    Array.prototype.forEach.call(
      campos,
      function (campo) {
        campo.setAttribute(
          'data-auto-grow',
          'true'
        );

        autoAjustarCampoPropuesta(campo);
      }
    );
  }

  function autoAjustarCampoPropuesta(campo) {
    if (
      !campo ||
      campo.tagName !== 'TEXTAREA'
    ) {
      return;
    }

    campo.style.height = 'auto';

    campo.style.height =
      Math.max(
        campo.scrollHeight,
        campo.offsetHeight
      ) + 'px';
  }

  function manejarClickGeneral(evento) {
    var boton;
    var accion;
    var paso;
    var numeroPropuesta;
    var numeroSugerencia;
    var paginacion;

    boton =
      evento.target && evento.target.closest
        ? evento.target.closest('[data-accion]')
        : evento.target;

    if (!boton) {
      return;
    }

    accion = boton.getAttribute('data-accion');

    if (!accion) {
      return;
    }

    if (accion === 'ir-paso') {
      evento.preventDefault();

      paso = boton.getAttribute('data-paso');
      manejarIrPasoSeguro(paso);
      return;
    }

    if (accion === 'volver-paso') {
      evento.preventDefault();

      paso = boton.getAttribute('data-paso');
      irPaso(paso);
      return;
    }

    if (accion === 'generar-ia') {
      evento.preventDefault();

      numeroPropuesta = Number(
        boton.getAttribute('data-propuesta') || 0
      );

      generarIA(numeroPropuesta);
      return;
    }

    if (accion === 'usar-sugerencia') {
      evento.preventDefault();

      numeroPropuesta = Number(
        boton.getAttribute('data-propuesta') || 0
      );

      numeroSugerencia = Number(
        boton.getAttribute('data-sugerencia') || 0
      );

      usarSugerencia(
        numeroPropuesta,
        numeroSugerencia
      );

      return;
    }

    if (accion === 'nuevo-registro') {
      evento.preventDefault();
      nuevoRegistro();
      return;
    }

    /*
      Este evento se mantiene por compatibilidad,
      pero el modal ya no se abre automáticamente.
    */
    if (accion === 'memoria-continuar') {
      evento.preventDefault();
      continuarAvanceGuardado();
      return;
    }

    if (accion === 'memoria-nuevo') {
      evento.preventDefault();
      empezarNuevoDesdePopup();
      return;
    }

    if (
      accion === 'propuesta-anterior' ||
      accion === 'propuesta-siguiente' ||
      accion === 'propuesta-ver-resumen'
    ) {
      evento.preventDefault();

      paginacion =
        obtenerPaginacionPropuestas();

      if (
        paginacion &&
        typeof paginacion.manejarAccion === 'function'
      ) {
        paginacion.manejarAccion(accion);
      }

      refrescarCamposPropuestasAutoExpandibles();
    }
  }

  function manejarChangeGeneral(evento) {
    var target = evento.target;
    var state = obtenerState();

    if (!target) {
      return;
    }

    if (target.name === 'tituloPreferido') {
      state.setTituloPreferidoNumero(
        Number(target.value || 0)
      );

      guardarAvance();
    }
  }

  function manejarConsulta(evento) {
    var utils = obtenerUtils();
    var ui = obtenerUI();

    var cedulaInput =
      document.getElementById('cedulaInput');

    var cedula;

    evento.preventDefault();

    cedula = utils.limpiarCedula(
      cedulaInput ? cedulaInput.value : ''
    );

    if (!cedula) {
      ui.mostrarEstado(
        '#estadoPrincipal',
        'Ingresa una cédula válida.',
        'error'
      );

      ui.enfocar('#cedulaInput');
      return;
    }

    verificarEnvioPrevioYContinuar(cedula);
  }

  function verificarEnvioPrevioYContinuar(cedula) {
    var ui = obtenerUI();
    var sheets = obtenerSheets();

    ui.setCargando(
      true,
      'Consultando estado del registro...'
    );

    ui.mostrarEstado(
      '#estadoPrincipal',
      'Consultando si ya tienes un envío registrado...',
      'info'
    );

    Promise.resolve()
      .then(function () {
        if (
          sheets &&
          typeof sheets.consultarEnvioPorCedula === 'function'
        ) {
          return sheets.consultarEnvioPorCedula(
            cedula
          );
        }

        return {
          ok: false,
          encontrado: false,
          mensaje:
            'Consulta externa no disponible.'
        };
      })
      .then(function (resultadoSheets) {
        if (
          resultadoSheets &&
          resultadoSheets.encontrado === true
        ) {
          bloquearPorEnvioPrevio(
            resultadoSheets
          );

          return {
            detenido: true
          };
        }

        return consultarEnvioPrevioFirebase(
          cedula
        ).then(function (resultadoFirebase) {
          if (
            resultadoFirebase &&
            resultadoFirebase.encontrado === true
          ) {
            bloquearPorEnvioPrevio(
              resultadoFirebase
            );

            return {
              detenido: true
            };
          }

          return {
            detenido: false
          };
        });
      })
      .then(function (resultado) {
        if (
          resultado &&
          resultado.detenido
        ) {
          return;
        }

        return continuarConsultaNormal(cedula);
      })
      .catch(function () {
        return continuarConsultaNormal(cedula);
      })
      .then(function () {
        ui.setCargando(false);
      });
  }

  function continuarConsultaNormal(cedula) {
    /*
      La identidad siempre se consulta en Firebase.

      La memoria del navegador puede conservar títulos,
      pero nunca reemplaza la validación de la cédula
      y los nombres del estudiante.
    */
    return consultarEstudianteFirebase(cedula);
  }

  function consultarEnvioPrevioFirebase(cedula) {
    var firebase =
      window.EstudianteMVPFirebaseCore || null;

    var config =
      window.EstudianteMVPConfig || null;

    var utils = obtenerUtils();

    var cedulaLimpia =
      utils &&
      typeof utils.limpiarCedula === 'function'
        ? utils.limpiarCedula(cedula)
        : String(cedula || '').replace(/\D/g, '');

    var coleccion =
      config &&
      typeof config.obtenerColeccion === 'function'
        ? config.obtenerColeccion('titulos') ||
          'titulos'
        : 'titulos';

    if (
      !firebase ||
      typeof firebase.consultarPorCampo !== 'function'
    ) {
      return Promise.resolve({
        ok: false,
        encontrado: false
      });
    }

    return firebase
      .consultarPorCampo(
        coleccion,
        'cedula',
        '==',
        cedulaLimpia,
        5
      )
      .then(function (resultadosCedula) {
        if (tieneEnvioFinal(resultadosCedula)) {
          return {
            ok: true,
            encontrado: true,
            origen: 'firebase',
            envio:
              obtenerPrimerEnvioFinal(
                resultadosCedula
              )
          };
        }

        return firebase.consultarPorCampo(
          coleccion,
          'numeroIdentificacion',
          '==',
          cedulaLimpia,
          5
        );
      })
      .then(function (resultado) {
        if (
          resultado &&
          resultado.encontrado === true
        ) {
          return resultado;
        }

        if (tieneEnvioFinal(resultado)) {
          return {
            ok: true,
            encontrado: true,
            origen: 'firebase',
            envio:
              obtenerPrimerEnvioFinal(resultado)
          };
        }

        return {
          ok: true,
          encontrado: false
        };
      })
      .catch(function () {
        return {
          ok: false,
          encontrado: false
        };
      });
  }

  function tieneEnvioFinal(registros) {
    return !!obtenerPrimerEnvioFinal(registros);
  }

  function obtenerPrimerEnvioFinal(registros) {
    registros =
      Array.isArray(registros)
        ? registros
        : [];

    return (
      registros.find(function (item) {
        var estado = String(
          item.estado ||
            item.estadoFirebase ||
            item.estadoFinal ||
            item.estadoProceso ||
            ''
        ).toUpperCase();

        if (
          estado === 'ENVIADO' ||
          estado === 'PENDIENTE_REVISION' ||
          estado === 'PENDIENTE_SYNC'
        ) {
          return true;
        }

        if (
          Array.isArray(item.titulosEnviados) &&
          item.titulosEnviados.length
        ) {
          return true;
        }

        return false;
      }) || null
    );
  }

  function bloquearPorEnvioPrevio(resultado) {
    var ui = obtenerUI();
    var state = obtenerState();
    var memoria = obtenerMemoria();

    if (
      memoria &&
      typeof memoria.borrar === 'function'
    ) {
      memoria.borrar();
    }

    if (
      state &&
      typeof state.reiniciarTodo === 'function'
    ) {
      state.reiniciarTodo();
    }

    limpiarPantallaNuevoRegistro();
    ui.mostrarPaso('consulta');

    ui.mostrarEstado(
      '#estadoPrincipal',
      'El coordinador está revisando tus títulos. Ingresa en unos días.',
      'warning'
    );

    ui.enfocar('#cedulaInput');

    return resultado;
  }

  function consultarEstudianteFirebase(cedula) {
    var ui = obtenerUI();
    var state = obtenerState();

    var firebaseEstudiantes =
      obtenerFirebaseEstudiantes();

    var modales = obtenerModales();

    if (
      modales &&
      typeof modales.mostrarConsulta === 'function'
    ) {
      modales.mostrarConsulta();
    }

    ui.setCargando(
      true,
      'Consultando datos en Firebase...'
    );

    ui.mostrarEstado(
      '#estadoPrincipal',
      'Consultando tus datos académicos...',
      'info'
    );

    return firebaseEstudiantes
      .buscarPorCedula(cedula)
      .then(function (resultado) {
        var estudiante =
          resultado && resultado.estudiante
            ? resultado.estudiante
            : resultado;

        var validacion;
        var avanceRecuperado;

        validacion =
          firebaseEstudiantes
            .validarEstudianteParaContinuar(
              estudiante
            );

        if (!validacion.ok) {
          throw new Error(
            validacion.mensaje ||
              'No se pudo validar el estudiante.'
          );
        }

        /*
          Primero se valida la identidad en Firebase.

          Después se intenta recuperar el avance guardado.
          La cédula y los nombres de Firebase siempre tienen
          prioridad sobre los datos de la caché.
        */
        avanceRecuperado =
          recuperarAvanceDespuesDeValidarCedula(
            cedula,
            estudiante
          );

        if (!avanceRecuperado) {
          state.setEstudiante(estudiante);
        }

        ui.pintarEstudiante(estudiante);

        if (avanceRecuperado) {
          ui.mostrarEstado(
            '#estadoPrincipal',
            'Datos validados. También recuperamos los títulos guardados en este navegador.',
            'success'
          );
        } else {
          ui.mostrarEstado(
            '#estadoPrincipal',
            '',
            ''
          );
        }

        guardarAvance({
          pasoActual: 'datos'
        });

        irPaso('datos');
      })
      .catch(function (error) {
        ui.mostrarEstado(
          '#estadoPrincipal',
          obtenerMensajeError(
            error,
            'No encontramos un estudiante con esa cédula. Revisa el número e intenta nuevamente.'
          ),
          'error'
        );
      })
      .then(function () {
        ui.setCargando(false);
      });
  }

  function recuperarAvanceDespuesDeValidarCedula(
    cedula,
    estudianteFirebase
  ) {
    var memoria = obtenerMemoria();
    var state = obtenerState();
    var ui = obtenerUI();
    var utils = obtenerUtils();

    var snapshot;
    var cedulaGuardada;
    var cedulaActual;
    var resultado;

    if (
      !memoria ||
      typeof memoria.leer !== 'function' ||
      typeof memoria.aplicarAvanceEnState !==
        'function'
    ) {
      return false;
    }

    snapshot = memoria.leer();

    if (!snapshot) {
      return false;
    }

    cedulaGuardada =
      typeof memoria.obtenerCedulaGuardada ===
      'function'
        ? memoria.obtenerCedulaGuardada(snapshot)
        : '';

    if (
      utils &&
      typeof utils.limpiarCedula === 'function'
    ) {
      cedulaGuardada =
        utils.limpiarCedula(cedulaGuardada);

      cedulaActual =
        utils.limpiarCedula(cedula);
    } else {
      cedulaGuardada = String(
        cedulaGuardada || ''
      ).replace(/\D/g, '');

      cedulaActual = String(
        cedula || ''
      ).replace(/\D/g, '');
    }

    /*
      Si la memoria tiene una cédula diferente,
      no se recuperan esos títulos.

      Las memorias antiguas que no tengan cédula
      se vinculan únicamente después de que Firebase
      valide la identidad actual.
    */
    if (
      cedulaGuardada &&
      cedulaGuardada !== cedulaActual
    ) {
      return false;
    }

    resultado =
      memoria.aplicarAvanceEnState(snapshot);

    if (
      !resultado ||
      !resultado.ok
    ) {
      return false;
    }

    /*
      La identidad consultada en Firebase reemplaza
      cualquier identidad incompleta de la caché.
    */
    state.setEstudiante(estudianteFirebase);

    ui.aplicarEstadoEnFormulario(
      state.obtenerEstado()
    );

    refrescarCamposPropuestasAutoExpandibles();

    refrescarSugerenciasDesdeEstado(
      state.obtenerEstado()
    );

    ui.pintarEstudiante(estudianteFirebase);

    return true;
  }

  /*
    Esta función se conserva por compatibilidad,
    pero ya no forma parte del flujo normal.
  */
  function restaurarDesdeMemoriaPorCedula(cedula) {
    var memoria = obtenerMemoria();
    var ui = obtenerUI();
    var resultado;
    var estado;

    resultado =
      memoria.aplicarAvanceEnState(
        memoria.leer()
      );

    if (!resultado.ok) {
      return consultarEstudianteFirebase(
        cedula
      );
    }

    estado =
      obtenerState().obtenerEstado();

    ui.aplicarEstadoEnFormulario(estado);
    refrescarCamposPropuestasAutoExpandibles();
    refrescarSugerenciasDesdeEstado(estado);
    ui.pintarEstudiante(estado.estudiante);

    ui.mostrarEstado(
      '#estadoPrincipal',
      'Avance recuperado.',
      'success'
    );

    irPaso('datos');

    return Promise.resolve();
  }

  function manejarTelegram(evento) {
    var utils = obtenerUtils();
    var ui = obtenerUI();
    var state = obtenerState();

    var input =
      document.getElementById('telegramInput');

    var validacion;

    evento.preventDefault();

    validacion = utils.validarTelegram(
      input ? input.value : ''
    );

    if (!validacion.ok) {
      ui.mostrarEstado(
        '#estadoTelegram',
        validacion.mensaje,
        'error'
      );

      ui.enfocar(
        validacion.selector ||
          '#telegramInput'
      );

      return;
    }

    state.setTelegram(validacion.data);
    ui.pintarTelegram(validacion.data);

    ui.mostrarEstado(
      '#estadoTelegram',
      'Telegram guardado correctamente.',
      'success'
    );

    guardarAvance({
      pasoActual: 'propuestas',

      propuestaActual:
        state.obtenerPropuestaActual
          ? state.obtenerPropuestaActual()
          : 1
    });

    irPaso('propuestas');
  }

  function manejarPropuestas(evento) {
    if (evento) {
      evento.preventDefault();
    }

    prepararResumenDesdePropuestas();
  }

  function prepararResumenDesdePropuestas() {
    var ui = obtenerUI();
    var state = obtenerState();

    var paginacion =
      obtenerPaginacionPropuestas();

    var validacion;

    guardarTodasLasPropuestasDesdeFormulario();

    validacion = state.validarPropuestas();

    if (!validacion.ok) {
      ui.mostrarEstado(
        '#estadoPropuestas',
        validacion.mensaje,
        'error'
      );

      if (validacion.selector) {
        mostrarPropuestaPorSelector(
          validacion.selector
        );

        ui.marcarCampoInvalido(
          validacion.selector
        );
      }

      return false;
    }

    ui.pintarResumen(
      state.obtenerEstado()
    );

    ui.mostrarEstado(
      '#estadoResumen',
      'Revisa las propuestas y selecciona tu título favorito.',
      'info'
    );

    if (
      paginacion &&
      typeof paginacion.guardarPropuestaActual ===
        'function'
    ) {
      paginacion.guardarPropuestaActual();
    }

    guardarAvance({
      pasoActual: 'resumen'
    });

    irPaso('resumen');

    return true;
  }

  function manejarEnvio(evento) {
    var ui = obtenerUI();
    var state = obtenerState();
    var sheets = obtenerSheets();

    var firebaseEnvios =
      obtenerFirebaseEnvios();

    var acepto =
      document.getElementById(
        'confirmacionEnvio'
      );

    var validacionPropuestas;
    var validacionFavorito;
    var payload;

    evento.preventDefault();

    guardarTodasLasPropuestasDesdeFormulario();

    validacionPropuestas =
      state.validarPropuestas();

    validacionFavorito =
      state.validarFavorito();

    if (!validacionPropuestas.ok) {
      ui.mostrarEstado(
        '#estadoEnvioFinal',
        validacionPropuestas.mensaje,
        'error'
      );

      if (validacionPropuestas.selector) {
        mostrarPropuestaPorSelector(
          validacionPropuestas.selector
        );
      }

      irPaso('propuestas');
      return;
    }

    if (!validacionFavorito.ok) {
      ui.mostrarEstado(
        '#estadoResumen',
        validacionFavorito.mensaje,
        'error'
      );

      irPaso('resumen');
      return;
    }

    if (!acepto || !acepto.checked) {
      ui.mostrarEstado(
        '#estadoEnvioFinal',
        'Confirma que deseas enviar tus propuestas.',
        'error'
      );

      return;
    }

    payload =
      state.construirPayloadEnvio();

    ui.setCargando(
      true,
      'Enviando registro...'
    );

    ui.mostrarEstado(
      '#estadoEnvioFinal',
      'Enviando registro...',
      'info'
    );

    sheets
      .enviarEnvio(payload)
      .then(function (resultadoSheets) {
        ui.mostrarEstado(
          '#estadoEnvioFinal',
          'Registro enviado correctamente. Guardando respaldo...',
          'info'
        );

        return firebaseEnvios
          .guardarRespaldoEnviado(
            payload,
            resultadoSheets
          )
          .then(function (resultadoFirebase) {
            var resultadoFinal = {
              ok: true,
              estado: 'ENVIADO',
              sheets: resultadoSheets,
              firebase: resultadoFirebase,
              mensaje:
                'Tu registro fue enviado correctamente.'
            };

            state.marcarEnviado(
              resultadoFinal
            );

            borrarMemoriaGuardada();

            ui.pintarResultadoEnvio(
              resultadoFinal
            );

            irPaso('enviar');
          });
      })
      .catch(function (errorSheets) {
        ui.mostrarEstado(
          '#estadoEnvioFinal',
          'No se pudo completar el envío principal. Guardando respaldo pendiente...',
          'warning'
        );

        return firebaseEnvios
          .guardarPendienteSync(
            payload,
            errorSheets
          )
          .then(function (resultadoFirebase) {
            var resultadoPendiente = {
              ok: true,
              estado: 'PENDIENTE_SYNC',
              firebase: resultadoFirebase,

              errorSheets:
                obtenerMensajeError(
                  errorSheets,
                  'No se pudo completar el envío principal.'
                ),

              mensaje:
                'No se pudo completar el envío principal, pero tu registro quedó guardado como pendiente.'
            };

            state.marcarEnviado(
              resultadoPendiente
            );

            borrarMemoriaGuardada();

            ui.pintarResultadoEnvio(
              resultadoPendiente
            );

            irPaso('enviar');
          })
          .catch(function (errorFirebase) {
            ui.mostrarEstado(
              '#estadoEnvioFinal',

              obtenerMensajeError(
                errorFirebase,
                'No se pudo guardar el registro. Intenta nuevamente.'
              ),

              'error'
            );
          });
      })
      .then(function () {
        ui.setCargando(false);
      });
  }

  function generarIA(numeroPropuesta) {
    var ui = obtenerUI();
    var state = obtenerState();
    var ia = obtenerIATitulacion();

    var estudiante =
      state.obtenerEstudiante();

    var modales = obtenerModales();
    var propuesta;
    var validacion;

    numeroPropuesta = Number(
      numeroPropuesta || 0
    );

    if (!numeroPropuesta) {
      ui.mostrarEstado(
        '#estadoPropuestas',
        'No se pudo identificar la propuesta.',
        'error'
      );

      return;
    }

    guardarPropuestaDesdeFormulario(
      numeroPropuesta
    );

    propuesta =
      state.obtenerPropuesta(
        numeroPropuesta
      );

    validacion =
      typeof state.validarPropuestaParaIA ===
      'function'
        ? state.validarPropuestaParaIA(
            numeroPropuesta
          )
        : state.validarPropuesta(
            numeroPropuesta
          );

    if (!validacion.ok) {
      ui.mostrarEstado(
        '#p' +
          numeroPropuesta +
          'EstadoIA',

        validacion.mensaje,
        'error'
      );

      if (validacion.selector) {
        ui.marcarCampoInvalido(
          validacion.selector
        );
      }

      return;
    }

    if (
      modales &&
      typeof modales.mostrarGenerandoIA ===
        'function'
    ) {
      modales.mostrarGenerandoIA();
    }

    ui.setCargando(
      true,
      'Generando 3 sugerencias con IA...'
    );

    ui.mostrarEstado(
      '#p' +
        numeroPropuesta +
        'EstadoIA',

      'Generando sugerencias con IA de Titulación...',
      'info'
    );

    ia.generarTitulosPorPropuesta({
      estudiante: estudiante,
      propuesta: propuesta,
      numeroPropuesta: numeroPropuesta
    })
      .then(function (resultado) {
        var sugerencias;

        resultado = resultado || {};

        sugerencias =
          Array.isArray(
            resultado.sugerencias
          )
            ? resultado.sugerencias
            : [];

        state.setSugerenciasIA(
          numeroPropuesta,
          sugerencias,
          resultado.proveedor ||
            resultado.proveedorNombre ||
            ''
        );

        ui.pintarSugerencias(
          numeroPropuesta,
          sugerencias
        );

        ui.mostrarEstado(
          '#p' +
            numeroPropuesta +
            'EstadoIA',

          resultado.mensaje ||
            'Se generaron 3 sugerencias correctamente.',

          'success'
        );

        if (
          modales &&
          typeof modales.mostrarTitulosIA ===
            'function'
        ) {
          modales.mostrarTitulosIA({
            numeroPropuesta:
              numeroPropuesta,

            sugerencias: sugerencias,

            proveedor:
              resultado.proveedor ||
              resultado.proveedorNombre ||
              '',

            proveedorNombre:
              resultado.proveedorNombre ||
              resultado.proveedor ||
              'IA de Titulación',

            mensaje:
              resultado.mensaje || ''
          });
        }

        guardarAvance({
          pasoActual: 'propuestas',
          propuestaActual:
            numeroPropuesta
        });

        refrescarCamposPropuestasAutoExpandibles();
      })
      .catch(function (error) {
        ui.mostrarEstado(
          '#p' +
            numeroPropuesta +
            'EstadoIA',

          obtenerMensajeError(
            error,
            'No se pudo generar con IA.'
          ),

          'error'
        );
      })
      .then(function () {
        if (
          modales &&
          typeof modales.cerrarGenerandoIA ===
            'function'
        ) {
          modales.cerrarGenerandoIA();
        }

        ui.setCargando(false);
      });
  }

  function usarSugerencia(
    numeroPropuesta,
    numeroSugerencia
  ) {
    var ui = obtenerUI();
    var state = obtenerState();
    var propuesta;

    propuesta =
      state.seleccionarSugerencia(
        numeroPropuesta,
        numeroSugerencia
      );

    if (!propuesta) {
      ui.mostrarEstado(
        '#p' +
          numeroPropuesta +
          'EstadoIA',

        'No se pudo aplicar la sugerencia.',
        'error'
      );

      return;
    }

    ui.escribirPropuestaEnFormulario(
      propuesta
    );

    refrescarCamposPropuestasAutoExpandibles();

    ui.marcarSugerenciaUsada(
      numeroPropuesta,
      numeroSugerencia
    );

    ui.mostrarEstado(
      '#p' +
        numeroPropuesta +
        'EstadoIA',

      'Título aplicado en la propuesta ' +
        numeroPropuesta +
        '.',

      'success'
    );

    guardarAvance({
      pasoActual: 'propuestas',
      propuestaActual:
        numeroPropuesta
    });
  }

  /*
    Se conserva solo por compatibilidad.

    El modal ya no se muestra durante el inicio,
    por lo que el flujo normal no debe llamar
    esta función.
  */
  function continuarAvanceGuardado() {
    var memoria = obtenerMemoria();
    var ui = obtenerUI();

    if (
      memoria &&
      typeof memoria.ocultarPopup === 'function'
    ) {
      memoria.ocultarPopup();
    }

    ui.mostrarEstado(
      '#estadoPrincipal',
      'Ingresa tu cédula para validar tus datos y recuperar tus títulos.',
      'info'
    );

    irPaso('consulta');
    ui.enfocar('#cedulaInput');
  }

  function empezarNuevoDesdePopup() {
    var memoria = obtenerMemoria();

    if (
      memoria &&
      typeof memoria.ocultarPopup === 'function'
    ) {
      memoria.ocultarPopup();
    }

    nuevoRegistro();
  }

  function nuevoRegistro() {
    var ui = obtenerUI();
    var state = obtenerState();

    var paginacion =
      obtenerPaginacionPropuestas();

    borrarMemoriaGuardada();
    state.reiniciarTodo();
    limpiarPantallaNuevoRegistro();
    refrescarCamposPropuestasAutoExpandibles();

    if (
      paginacion &&
      typeof paginacion.mostrar === 'function'
    ) {
      paginacion.mostrar(
        1,
        {
          sinScroll: true
        }
      );

      refrescarCamposPropuestasAutoExpandibles();
    }

    ui.mostrarEstado(
      '#estadoPrincipal',
      'Ingresa tu cédula para iniciar.',
      'info'
    );

    irPaso('consulta');
    ui.enfocar('#cedulaInput');
  }

  function manejarIrPasoSeguro(paso) {
    var ui = obtenerUI();
    var state = obtenerState();

    if (paso === 'resumen') {
      prepararResumenDesdePropuestas();
      return;
    }

    if (paso === 'enviar') {
      if (!state.validarFavorito().ok) {
        ui.mostrarEstado(
          '#estadoResumen',
          'Selecciona tu título favorito antes de continuar.',
          'error'
        );

        irPaso('resumen');
        return;
      }
    }

    irPaso(paso);
  }

  function irPaso(paso) {
    var state = obtenerState();
    var ui = obtenerUI();

    var paginacion =
      obtenerPaginacionPropuestas();

    var propuestaActual;

    paso = paso || 'consulta';

    state.setPasoActual(paso);
    ui.mostrarPaso(paso);

    if (paso === 'propuestas') {
      propuestaActual =
        state.obtenerPropuestaActual
          ? state.obtenerPropuestaActual()
          : 1;

      if (
        paginacion &&
        typeof paginacion.mostrar === 'function'
      ) {
        paginacion.mostrar(
          propuestaActual,
          {
            sinScroll: true
          }
        );
      }

      refrescarCamposPropuestasAutoExpandibles();
    }

    if (paso === 'resumen') {
      guardarTodasLasPropuestasDesdeFormulario();

      ui.pintarResumen(
        state.obtenerEstado()
      );
    }

    guardarAvance({
      pasoActual: paso
    });
  }

  function guardarPropuestaDesdeFormulario(
    numero
  ) {
    var ui = obtenerUI();
    var state = obtenerState();
    var propuesta;

    numero = Number(numero || 0);

    if (!numero) {
      return null;
    }

    propuesta =
      ui.leerPropuestaDesdeFormulario(
        numero
      );

    return state.setPropuesta(
      numero,
      propuesta
    );
  }

  function guardarTodasLasPropuestasDesdeFormulario() {
    guardarPropuestaDesdeFormulario(1);
    guardarPropuestaDesdeFormulario(2);
    guardarPropuestaDesdeFormulario(3);
  }

  function guardarAvance(extras) {
    var memoria = obtenerMemoria();

    if (
      memoria &&
      typeof memoria.guardarDesdeState ===
        'function'
    ) {
      memoria.guardarDesdeState(
        extras || {}
      );
    }
  }

  function borrarMemoriaGuardada() {
    var memoria = obtenerMemoria();

    if (
      memoria &&
      typeof memoria.borrar === 'function'
    ) {
      memoria.borrar();
    }
  }

  function refrescarSugerenciasDesdeEstado(
    estado
  ) {
    var ui = obtenerUI();

    estado = estado || {};

    if (!Array.isArray(estado.propuestas)) {
      return;
    }

    estado.propuestas.forEach(
      function (propuesta) {
        if (
          !propuesta ||
          !propuesta.numero
        ) {
          return;
        }

        ui.pintarSugerencias(
          propuesta.numero,
          propuesta.sugerenciasIA || []
        );

        ui.marcarSugerenciaUsada(
          propuesta.numero,

          propuesta
            .sugerenciaSeleccionadaNumero ||
            0
        );
      }
    );

    refrescarCamposPropuestasAutoExpandibles();
  }

  function mostrarPropuestaPorSelector(
    selector
  ) {
    var match;
    var numero;

    var paginacion =
      obtenerPaginacionPropuestas();

    match = String(
      selector || ''
    ).match(/^#p([123])/);

    if (!match) {
      return;
    }

    numero = Number(
      match[1] || 1
    );

    obtenerState().setPropuestaActual(
      numero
    );

    if (
      paginacion &&
      typeof paginacion.mostrar === 'function'
    ) {
      paginacion.mostrar(numero);

      refrescarCamposPropuestasAutoExpandibles();
    }
  }

  function limpiarPantallaNuevoRegistro() {
    var formularios = [
      document.getElementById(
        'formConsulta'
      ),

      document.getElementById(
        'formTelegram'
      ),

      document.getElementById(
        'formPropuestas'
      ),

      document.getElementById(
        'formEnvio'
      )
    ];

    formularios.forEach(
      function (formulario) {
        if (
          formulario &&
          typeof formulario.reset ===
            'function'
        ) {
          formulario.reset();
        }
      }
    );

    limpiarTexto('#datoNombres');
    limpiarTexto('#datoCedula');
    limpiarTexto('#datoCarrera');
    limpiarTexto('#datoCodigoCarrera');
    limpiarTexto('#datoSede');
    limpiarTexto('#datoModalidad');
    limpiarTexto('#datoPeriodo');
    limpiarTexto('#datoCorreo');
    limpiarTexto('#datoCelular');

    limpiarHtml('#p1Sugerencias');
    limpiarHtml('#p2Sugerencias');
    limpiarHtml('#p3Sugerencias');
    limpiarHtml('#resumenEstudiante');
    limpiarHtml('#resumenPropuestas');

    limpiarEstado('#estadoTelegram');
    limpiarEstado('#estadoPropuestas');
    limpiarEstado('#estadoResumen');
    limpiarEstado('#estadoEnvioFinal');
    limpiarEstado('#p1EstadoIA');
    limpiarEstado('#p2EstadoIA');
    limpiarEstado('#p3EstadoIA');

    refrescarCamposPropuestasAutoExpandibles();
  }

  function limpiarTexto(selector) {
    var elemento =
      document.querySelector(selector);

    if (elemento) {
      elemento.textContent = '-';
    }
  }

  function limpiarHtml(selector) {
    var elemento =
      document.querySelector(selector);

    if (elemento) {
      elemento.innerHTML = '';
    }
  }

  function limpiarEstado(selector) {
    var ui = obtenerUI();

    if (
      ui &&
      typeof ui.mostrarEstado === 'function'
    ) {
      ui.mostrarEstado(
        selector,
        '',
        ''
      );
    }
  }

  function obtenerMensajeError(
    error,
    fallback
  ) {
    var utils = obtenerUtils();

    if (
      utils &&
      typeof utils.obtenerMensajeError ===
        'function'
    ) {
      return utils.obtenerMensajeError(
        error,
        fallback ||
          'Ocurrió un error.'
      );
    }

    if (error && error.message) {
      return error.message;
    }

    return fallback ||
      'Ocurrió un error.';
  }

  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      iniciar
    );
  } else {
    iniciar();
  }

  window.EstudianteMVPApp =
    Object.freeze({
      iniciar: iniciar,
      irPaso: irPaso,
      generarIA: generarIA,
      usarSugerencia: usarSugerencia,
      nuevoRegistro: nuevoRegistro,

      continuarAvanceGuardado:
        continuarAvanceGuardado,

      prepararResumenDesdePropuestas:
        prepararResumenDesdePropuestas
    });
})(window, document);