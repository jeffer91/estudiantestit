/*
  Archivo: ia.prompt.service.js
  Funciones vigentes:
  - Normalizar estudiante y propuesta para el motor IA 3x3.
  - Mantener las definiciones académicas de las tres etapas.
  - Conservar la validación principal de envíos y el respaldo provisional.
  - Ocultar referencias técnicas en todos los textos visibles al estudiante.
*/
(function (window) {
  'use strict';

  var ETAPAS = Object.freeze([
    {
      numero: 1,
      codigo: 'diagnostico_inicial',
      nombre: 'Diagnóstico inicial',
      descripcion: 'Identificar, analizar, caracterizar o diagnosticar la situación inicial sin afirmar que una solución ya fue ejecutada.'
    },
    {
      numero: 2,
      codigo: 'propuesta_mejora',
      nombre: 'Propuesta o mejora',
      descripcion: 'Diseñar, proponer, optimizar o plantear una mejora viable sin afirmar que ya fue implementada.'
    },
    {
      numero: 3,
      codigo: 'evaluacion_resultado',
      nombre: 'Evaluación o resultado esperado',
      descripcion: 'Evaluar, valorar o analizar resultados esperados sin inventar resultados reales ni afirmar que ya fueron obtenidos.'
    }
  ]);

  var consultaPrincipalOriginal = null;
  var consultaPrincipalCache = null;
  var reenviandoConsulta = false;

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function limpiarDato(valor) {
    var utils = obtenerUtils();
    var limpio = utils && typeof utils.limpiarTexto === 'function'
      ? utils.limpiarTexto(valor)
      : String(valor == null ? '' : valor).replace(/\s+/g, ' ').trim();

    return limpio || 'No especificado';
  }

  function limpiarCedula(valor) {
    var utils = obtenerUtils();

    return utils && typeof utils.limpiarCedula === 'function'
      ? utils.limpiarCedula(valor)
      : String(valor || '').replace(/\D/g, '');
  }

  function obtenerEtapaPropuesta(numero) {
    numero = Number(numero || 1);

    return ETAPAS.find(function (item) {
      return Number(item.numero) === numero;
    }) || ETAPAS[0];
  }

  function normalizarContexto(params) {
    var utils = obtenerUtils();
    var estudiante;
    var propuesta;

    params = params || {};
    estudiante = params.estudiante || {};
    propuesta = params.propuesta || {};

    return {
      estudiante: {
        nombres: limpiarDato(estudiante.nombres || estudiante.nombreCompleto),
        cedula: limpiarDato(estudiante.cedula || estudiante.numeroIdentificacion),
        carrera: limpiarDato(estudiante.nombreCarrera || estudiante.carrera || estudiante.NombreCarrera),
        codigoCarrera: limpiarDato(estudiante.codigoCarrera || estudiante.CodigoCarrera),
        sede: limpiarDato(estudiante.sede || estudiante.Sede),
        modalidadDetectada: limpiarDato(estudiante.modalidadDetectada || estudiante.modalidad),
        periodoId: limpiarDato(estudiante.periodoId),
        periodoLabel: limpiarDato(estudiante.periodoLabel || estudiante.periodo)
      },
      propuesta: {
        numero: Number(propuesta.numero || params.numeroPropuesta || 1),
        tituloBase: limpiarDato(propuesta.tituloFinal || propuesta.titulo || propuesta.tituloBase),
        temaGeneral: limpiarDato(propuesta.temaGeneral || propuesta.tema),
        lugarContexto: limpiarDato(propuesta.lugarContexto || propuesta.contexto || propuesta.lugar),
        grupoEstudio: limpiarDato(propuesta.grupoEstudio || propuesta.grupo || propuesta.poblacion),
        problemaNecesidad: limpiarDato(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad),
        objetivo: limpiarDato(propuesta.objetivo || propuesta.objetivoGeneral),
        anioPeriodo: limpiarDato(propuesta.anioPeriodo || propuesta.periodo || propuesta.tiempo)
      },
      raw: utils && typeof utils.clonar === 'function'
        ? utils.clonar(params)
        : JSON.parse(JSON.stringify(params))
    };
  }

  function estadoPermiteReenvio(registro) {
    var estado;

    registro = registro || {};
    estado = String(
      registro.estado ||
      registro.estadoFinal ||
      registro.estadoGoogleSheets ||
      registro.estadoProceso ||
      ''
    ).toUpperCase().trim();

    return registro.permitirReenvio === true || [
      'DEVUELTO',
      'NO_ENVIO',
      'ELIMINADO',
      'ELIMINADO_ADMIN',
      'BORRADO'
    ].indexOf(estado) >= 0;
  }

  function normalizarDecisionPrincipal(resultado, cedula) {
    var salida = Object.assign({}, resultado || {});

    salida.cedula = salida.cedula || limpiarCedula(cedula);
    salida.origenDecision = 'registro-principal';

    if (
      salida.encontrado === true &&
      estadoPermiteReenvio(salida.envio || salida)
    ) {
      salida.encontrado = false;
      salida.reenvioPermitido = true;
      salida.mensaje = 'Puedes realizar un nuevo envío.';
    }

    return salida;
  }

  function instalarFuentePrincipal() {
    var servicio = window.EstudianteMVPSheets || null;
    var reemplazo;

    if (
      !servicio ||
      servicio.__fuentePrincipalInstalada === true ||
      typeof servicio.consultarEnvioPorCedula !== 'function'
    ) {
      return;
    }

    consultaPrincipalOriginal = servicio.consultarEnvioPorCedula.bind(servicio);

    reemplazo = Object.assign({}, servicio, {
      consultarEnvioPorCedula: function (cedula) {
        var cedulaLimpia = limpiarCedula(cedula);
        var resultadoCache;

        if (
          consultaPrincipalCache &&
          consultaPrincipalCache.cedula === cedulaLimpia
        ) {
          resultadoCache = consultaPrincipalCache.resultado;
          consultaPrincipalCache = null;
          return Promise.resolve(resultadoCache);
        }

        return consultaPrincipalOriginal(cedulaLimpia)
          .then(function (resultado) {
            return normalizarDecisionPrincipal(resultado, cedulaLimpia);
          });
      }
    });

    Object.defineProperty(reemplazo, '__fuentePrincipalInstalada', {
      value: true,
      enumerable: false
    });

    Object.defineProperty(reemplazo, '__googleSheetsFuentePrincipal', {
      value: true,
      enumerable: false
    });

    Object.defineProperty(reemplazo, '__permisoReenvioInstalado', {
      value: true,
      enumerable: false
    });

    window.EstudianteMVPSheets = Object.freeze(reemplazo);
  }

  function obtenerColeccionTitulos() {
    var config = window.EstudianteMVPConfig || null;

    return config && typeof config.obtenerColeccion === 'function'
      ? config.obtenerColeccion('titulos') || 'titulos'
      : 'titulos';
  }

  function esColeccionTitulos(coleccion) {
    return String(coleccion || '').trim().toLowerCase() ===
      String(obtenerColeccionTitulos()).trim().toLowerCase();
  }

  function instalarRespaldoSoloEscritura() {
    var servicio = window.EstudianteMVPFirebaseCore || null;
    var leerDocumentoOriginal;
    var consultarPorCampoOriginal;
    var reemplazo;

    if (!servicio || servicio.__titulosSoloRespaldo === true) {
      return;
    }

    leerDocumentoOriginal = typeof servicio.leerDocumento === 'function'
      ? servicio.leerDocumento.bind(servicio)
      : null;

    consultarPorCampoOriginal = typeof servicio.consultarPorCampo === 'function'
      ? servicio.consultarPorCampo.bind(servicio)
      : null;

    reemplazo = Object.assign({}, servicio);

    if (leerDocumentoOriginal) {
      reemplazo.leerDocumento = function (coleccion, documento) {
        if (esColeccionTitulos(coleccion)) {
          return Promise.resolve(null);
        }

        return leerDocumentoOriginal(coleccion, documento);
      };
    }

    if (consultarPorCampoOriginal) {
      reemplazo.consultarPorCampo = function (
        coleccion,
        campo,
        operador,
        valor,
        limite
      ) {
        if (esColeccionTitulos(coleccion)) {
          return Promise.resolve([]);
        }

        return consultarPorCampoOriginal(
          coleccion,
          campo,
          operador,
          valor,
          limite
        );
      };
    }

    Object.defineProperty(reemplazo, '__titulosSoloRespaldo', {
      value: true,
      enumerable: false
    });

    window.EstudianteMVPFirebaseCore = Object.freeze(reemplazo);
  }

  function mostrarModalConsulta() {
    var modales = window.EstudianteMVPModales || null;

    if (
      modales &&
      typeof modales.mostrarConsulta === 'function'
    ) {
      modales.mostrarConsulta();
    }
  }

  function mostrarErrorConsulta(error) {
    var ui = window.EstudianteMVPUI || null;
    var mensaje =
      'No fue posible verificar tu registro. ' +
      'Intenta nuevamente en unos minutos.';
    var estado;

    console.error(
      '[Estudiantes MVP] No se pudo validar el registro:',
      error
    );

    if (ui && typeof ui.setCargando === 'function') {
      ui.setCargando(false);
    }

    if (ui && typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado('#estadoPrincipal', mensaje, 'error');

      if (typeof ui.enfocar === 'function') {
        ui.enfocar('#cedulaInput');
      }

      return;
    }

    estado = window.document &&
      window.document.getElementById('estadoPrincipal');

    if (estado) {
      estado.textContent = mensaje;
      estado.classList.remove('is-info', 'is-warning', 'is-success');
      estado.classList.add('is-error');
    }
  }

  function mostrarConsultando() {
    var ui = window.EstudianteMVPUI || null;

    if (!ui) return;

    if (typeof ui.setCargando === 'function') {
      ui.setCargando(true, 'Consultando estado del registro...');
    }

    if (typeof ui.mostrarEstado === 'function') {
      ui.mostrarEstado(
        '#estadoPrincipal',
        'Verificando tu registro...',
        'info'
      );
    }
  }

  function instalarConsultaSegura() {
    var documento = window.document;

    if (
      !documento ||
      documento.__consultaSeguraInstalada === true
    ) {
      return;
    }

    documento.__consultaSeguraInstalada = true;

    documento.addEventListener(
      'submit',
      function (evento) {
        var formulario = evento.target;
        var input;
        var cedula;

        if (!formulario || formulario.id !== 'formConsulta') {
          return;
        }

        if (reenviandoConsulta) {
          reenviandoConsulta = false;
          mostrarModalConsulta();
          return;
        }

        input = documento.getElementById('cedulaInput');
        cedula = limpiarCedula(input ? input.value : '');

        if (!cedula) {
          return;
        }

        evento.preventDefault();
        evento.stopImmediatePropagation();

        mostrarConsultando();

        if (typeof consultaPrincipalOriginal !== 'function') {
          mostrarErrorConsulta(
            new Error('La consulta principal no está disponible.')
          );
          return;
        }

        consultaPrincipalOriginal(cedula)
          .then(function (resultado) {
            resultado = normalizarDecisionPrincipal(resultado, cedula);

            if (resultado.ok === false) {
              throw new Error(
                resultado.mensaje ||
                'No se pudo verificar el registro.'
              );
            }

            consultaPrincipalCache = {
              cedula: cedula,
              resultado: resultado
            };

            reenviandoConsulta = true;

            formulario.dispatchEvent(
              new window.Event('submit', {
                bubbles: true,
                cancelable: true
              })
            );
          })
          .catch(mostrarErrorConsulta);
      },
      true
    );
  }

  function convertirTextoVisible(valor) {
    return String(valor == null ? '' : valor)
      .replace(/Google\s*Sheets/gi, 'el sistema')
      .replace(/\bSheets\b/gi, 'el sistema')
      .replace(/\bFirebase\b/gi, 'el sistema')
      .replace(/bases?\s+de\s+datos/gi, 'sistema')
      .replace(/base\s+principal/gi, 'registro principal')
      .replace(/base\s+provisional/gi, 'respaldo provisional');
  }

  function sanitizarAtributos(elemento) {
    ['title', 'aria-label', 'placeholder', 'alt'].forEach(function (atributo) {
      var actual;
      var corregido;

      if (!elemento || !elemento.getAttribute || !elemento.hasAttribute(atributo)) {
        return;
      }

      actual = elemento.getAttribute(atributo);
      corregido = convertirTextoVisible(actual);

      if (corregido !== actual) {
        elemento.setAttribute(atributo, corregido);
      }
    });
  }

  function sanitizarVista(raiz) {
    var documento = window.document;
    var walker;
    var nodo;
    var actual;
    var corregido;
    var elementos;

    if (!documento || !raiz) return;

    if (raiz.nodeType === 1) {
      sanitizarAtributos(raiz);
    }

    walker = documento.createTreeWalker(
      raiz,
      window.NodeFilter.SHOW_TEXT,
      {
        acceptNode: function (texto) {
          var padre = texto.parentNode;
          var etiqueta = padre && padre.nodeName
            ? padre.nodeName.toUpperCase()
            : '';

          if (
            etiqueta === 'SCRIPT' ||
            etiqueta === 'STYLE' ||
            etiqueta === 'NOSCRIPT'
          ) {
            return window.NodeFilter.FILTER_REJECT;
          }

          return window.NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    while ((nodo = walker.nextNode())) {
      actual = nodo.nodeValue;
      corregido = convertirTextoVisible(actual);

      if (corregido !== actual) {
        nodo.nodeValue = corregido;
      }
    }

    if (raiz.querySelectorAll) {
      elementos = raiz.querySelectorAll('[title],[aria-label],[placeholder],[alt]');
      Array.prototype.forEach.call(elementos, sanitizarAtributos);
    }
  }

  function instalarCorreccionVisual() {
    var documento = window.document;
    var observer;
    var alertOriginal;
    var confirmOriginal;

    if (!documento || documento.__correccionVisualTecnicaInstalada === true) {
      return;
    }

    documento.__correccionVisualTecnicaInstalada = true;

    if (documento.body) {
      sanitizarVista(documento.body);
    }

    observer = new window.MutationObserver(function (mutaciones) {
      mutaciones.forEach(function (mutacion) {
        if (mutacion.type === 'characterData') {
          sanitizarVista(mutacion.target.parentNode || mutacion.target);
          return;
        }

        Array.prototype.forEach.call(
          mutacion.addedNodes || [],
          function (nodo) {
            sanitizarVista(nodo);
          }
        );
      });
    });

    if (documento.body) {
      observer.observe(documento.body, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }

    if (typeof window.alert === 'function') {
      alertOriginal = window.alert.bind(window);
      window.alert = function (mensaje) {
        return alertOriginal(convertirTextoVisible(mensaje));
      };
    }

    if (typeof window.confirm === 'function') {
      confirmOriginal = window.confirm.bind(window);
      window.confirm = function (mensaje) {
        return confirmOriginal(convertirTextoVisible(mensaje));
      };
    }
  }

  window.EstudianteMVPIAPrompt = Object.freeze({
    normalizarContexto: normalizarContexto,
    obtenerEtapas: function () {
      return ETAPAS.slice();
    },
    obtenerEtapaPropuesta: obtenerEtapaPropuesta,
    estadoPermiteReenvio: estadoPermiteReenvio,
    modo: '3x3'
  });

  instalarFuentePrincipal();
  instalarRespaldoSoloEscritura();
  instalarCorreccionVisual();
  instalarConsultaSegura();
})(window);
