/*
  Archivo: config.app.js
  Ruta: estudiantes-mvp/js/config.app.js
  Funciones principales:
  - Controlar la pantalla temporal config.html.
  - Probar conexión con Firebase.
  - Listar, agregar y actualizar proveedores IA en Firebase.
  - Probar la IA de Titulación.
  - Guardar y probar el endpoint de Google Sheets / Apps Script.
  - Mostrar diagnóstico general del MVP.
*/
(function (window, document) {
  'use strict';

  var ultimoListadoProveedores = [];

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function obtenerFirebaseCore() {
    return window.EstudianteMVPFirebaseCore || null;
  }

  function obtenerFirebaseIA() {
    return window.EstudianteMVPFirebaseIA || null;
  }

  function obtenerSheets() {
    return window.EstudianteMVPSheets || null;
  }

  function obtenerIATitulacion() {
    return window.EstudianteMVPIATitulacion || null;
  }

  function iniciar() {
    if (!validarDependencias()) {
      return;
    }

    conectarEventos();
    mostrarEstado('#estadoConfig', 'Pantalla de configuración lista.', 'info');
    escribirDiagnosticoBasico();

    console.info('[Config MVP] Pantalla de configuración iniciada.');
  }

  function validarDependencias() {
    var faltantes = [];

    if (!obtenerUtils()) faltantes.push('EstudianteMVPUtils');
    if (!obtenerFirebaseCore()) faltantes.push('EstudianteMVPFirebaseCore');
    if (!obtenerFirebaseIA()) faltantes.push('EstudianteMVPFirebaseIA');
    if (!obtenerSheets()) faltantes.push('EstudianteMVPSheets');
    if (!obtenerIATitulacion()) faltantes.push('EstudianteMVPIATitulacion');

    if (faltantes.length) {
      console.error('[Config MVP] Faltan módulos:', faltantes);

      var estado = document.getElementById('estadoConfig');

      if (estado) {
        estado.textContent = 'Faltan módulos internos: ' + faltantes.join(', ');
        estado.classList.add('is-error');
      }

      return false;
    }

    return true;
  }

  function conectarEventos() {
    conectarClick('#btnProbarFirebase', probarFirebase);
    conectarClick('#btnListarIA', listarProveedoresIA);
    conectarClick('#btnGuardarProveedorIA', guardarProveedorIA);
    conectarClick('#btnLimpiarProveedorIA', limpiarFormularioProveedorIA);
    conectarClick('#btnProbarIA', probarIA);
    conectarClick('#btnLeerSheets', leerConfiguracionSheets);
    conectarClick('#btnGuardarSheets', guardarConfiguracionSheets);
    conectarClick('#btnProbarSheets', probarSheets);
    conectarClick('#btnDiagnosticoGeneral', diagnosticoGeneral);

    document.addEventListener('click', manejarClickGeneral);
  }

  function conectarClick(selector, handler) {
    var elemento = document.querySelector(selector);

    if (!elemento) {
      return;
    }

    elemento.addEventListener('click', function (evento) {
      evento.preventDefault();
      handler();
    });
  }

  function manejarClickGeneral(evento) {
    var accion = evento.target && evento.target.getAttribute('data-accion');

    if (!accion) {
      return;
    }

    if (accion === 'cargar-proveedor') {
      evento.preventDefault();
      cargarProveedorEnFormulario(evento.target.getAttribute('data-provider-id'));
    }
  }

  function probarFirebase() {
    setCargando(true, 'Probando conexión con Firebase...');
    mostrarEstado('#estadoConfig', 'Probando Firebase...', 'info');

    obtenerFirebaseCore().inicializar()
      .then(function (resultado) {
        mostrarEstado('#estadoConfig', 'Firebase conectado correctamente.', 'success');
        escribirJson('#firebaseResultado', {
          ok: true,
          mensaje: resultado.mensaje || 'Firebase conectado correctamente.',
          listo: obtenerFirebaseCore().estaListo()
        });
      })
      .catch(function (error) {
        mostrarEstado('#estadoConfig', obtenerMensajeError(error, 'No se pudo conectar con Firebase.'), 'error');
        escribirJson('#firebaseResultado', {
          ok: false,
          error: obtenerMensajeError(error)
        });
      })
      .then(function () {
        setCargando(false);
      });
  }

  function listarProveedoresIA() {
    setCargando(true, 'Leyendo proveedores IA desde Firebase...');
    mostrarEstado('#estadoIA', 'Leyendo proveedores IA...', 'info');

    obtenerFirebaseIA().listarProveedores()
      .then(function (proveedores) {
        ultimoListadoProveedores = proveedores || [];
        pintarProveedoresIA(ultimoListadoProveedores);

        mostrarEstado(
          '#estadoIA',
          ultimoListadoProveedores.length
            ? 'Proveedores IA encontrados: ' + ultimoListadoProveedores.length
            : 'No hay proveedores IA guardados.',
          ultimoListadoProveedores.length ? 'success' : 'warning'
        );

        escribirJson('#iaResultado', {
          ok: true,
          total: ultimoListadoProveedores.length,
          proveedores: ultimoListadoProveedores.map(function (proveedor) {
            return limpiarProveedorParaMostrar(proveedor);
          })
        });
      })
      .catch(function (error) {
        mostrarEstado('#estadoIA', obtenerMensajeError(error, 'No se pudieron leer los proveedores IA.'), 'error');
        escribirJson('#iaResultado', {
          ok: false,
          error: obtenerMensajeError(error)
        });
      })
      .then(function () {
        setCargando(false);
      });
  }

  function guardarProveedorIA() {
    var utils = obtenerUtils();
    var id = utils.normalizarClave(valor('#iaProviderId'));
    var apiKeyNueva = utils.limpiarTexto(valor('#iaApiKey'));
    var dataBase;

    if (!id) {
      mostrarEstado('#estadoIA', 'Ingresa el ID del proveedor IA.', 'error');
      enfocar('#iaProviderId');
      return;
    }

    setCargando(true, 'Guardando proveedor IA...');
    mostrarEstado('#estadoIA', 'Preparando datos del proveedor IA...', 'info');

    obtenerFirebaseIA().leerProveedor(id)
      .then(function (existente) {
        dataBase = existente || {};

        return obtenerFirebaseIA().guardarProveedor({
          id: id,
          proveedor: id,
          nombre: valor('#iaNombre') || dataBase.nombre || id,
          activo: estaMarcado('#iaActivo'),
          endpoint: valor('#iaEndpoint') || dataBase.endpoint || '',
          apiKey: apiKeyNueva || dataBase.apiKey || '',
          key: apiKeyNueva || dataBase.key || dataBase.apiKey || '',
          model: valor('#iaModelo') || dataBase.model || dataBase.modelo || '',
          modelo: valor('#iaModelo') || dataBase.modelo || dataBase.model || '',
          origen: 'config-mvp'
        });
      })
      .then(function (resultado) {
        mostrarEstado('#estadoIA', 'Proveedor IA guardado correctamente.', 'success');
        escribirJson('#iaResultado', {
          ok: true,
          mensaje: resultado.mensaje,
          proveedor: limpiarProveedorParaMostrar(resultado.proveedor)
        });

        limpiarCampo('#iaApiKey');
        return listarProveedoresIA();
      })
      .catch(function (error) {
        mostrarEstado('#estadoIA', obtenerMensajeError(error, 'No se pudo guardar el proveedor IA.'), 'error');
        escribirJson('#iaResultado', {
          ok: false,
          error: obtenerMensajeError(error)
        });
      })
      .then(function () {
        setCargando(false);
      });
  }

  function cargarProveedorEnFormulario(providerId) {
    var proveedor = ultimoListadoProveedores.find(function (item) {
      return item.id === providerId;
    });

    if (!proveedor) {
      mostrarEstado('#estadoIA', 'No se encontró el proveedor seleccionado.', 'error');
      return;
    }

    setValor('#iaProviderId', proveedor.id || '');
    setValor('#iaNombre', proveedor.nombre || '');
    setValor('#iaEndpoint', proveedor.endpoint || '');
    setValor('#iaModelo', proveedor.modelo || proveedor.model || '');
    setMarcado('#iaActivo', proveedor.activo === true);
    limpiarCampo('#iaApiKey');

    mostrarEstado(
      '#estadoIA',
      'Proveedor cargado. La clave no se muestra por seguridad. Si dejas la clave vacía, se conserva la anterior.',
      'info'
    );
  }

  function limpiarFormularioProveedorIA() {
    setValor('#iaProviderId', '');
    setValor('#iaNombre', '');
    setValor('#iaEndpoint', '');
    setValor('#iaModelo', '');
    setValor('#iaApiKey', '');
    setMarcado('#iaActivo', true);

    mostrarEstado('#estadoIA', 'Formulario de proveedor IA limpio.', 'info');
  }

  function probarIA() {
    setCargando(true, 'Probando IA de Titulación...');
    mostrarEstado('#estadoIA', 'Probando generación de títulos con IA...', 'info');

    obtenerIATitulacion().probarIA()
      .then(function (resultado) {
        mostrarEstado('#estadoIA', 'IA respondió correctamente.', 'success');
        escribirJson('#iaResultado', {
          ok: true,
          proveedor: resultado.proveedor,
          proveedorNombre: resultado.proveedorNombre,
          sugerencias: resultado.sugerencias
        });
      })
      .catch(function (error) {
        mostrarEstado('#estadoIA', obtenerMensajeError(error, 'No se pudo probar la IA.'), 'error');
        escribirJson('#iaResultado', {
          ok: false,
          error: obtenerMensajeError(error)
        });
      })
      .then(function () {
        setCargando(false);
      });
  }

  function leerConfiguracionSheets() {
    setCargando(true, 'Leyendo configuración de Google Sheets...');
    mostrarEstado('#estadoSheets', 'Leyendo configuración desde Firebase...', 'info');

    obtenerSheets().leerConfiguracion()
      .then(function (configSheets) {
        setValor('#sheetsEndpoint', configSheets.endpoint || '');
        setMarcado('#sheetsActivo', configSheets.activo !== false);

        mostrarEstado(
          '#estadoSheets',
          configSheets.endpoint
            ? 'Configuración de Sheets encontrada.'
            : 'No hay endpoint de Sheets configurado.',
          configSheets.endpoint ? 'success' : 'warning'
        );

        escribirJson('#sheetsResultado', {
          ok: true,
          configuracion: {
            activo: configSheets.activo,
            endpointConfigurado: !!configSheets.endpoint,
            nombre: configSheets.nombre
          }
        });
      })
      .catch(function (error) {
        mostrarEstado('#estadoSheets', obtenerMensajeError(error, 'No se pudo leer la configuración de Sheets.'), 'error');
        escribirJson('#sheetsResultado', {
          ok: false,
          error: obtenerMensajeError(error)
        });
      })
      .then(function () {
        setCargando(false);
      });
  }

  function guardarConfiguracionSheets() {
    var endpoint = valor('#sheetsEndpoint');
    var activo = estaMarcado('#sheetsActivo');

    if (!endpoint) {
      mostrarEstado('#estadoSheets', 'Ingresa el endpoint de Apps Script.', 'error');
      enfocar('#sheetsEndpoint');
      return;
    }

    setCargando(true, 'Guardando configuración de Sheets...');
    mostrarEstado('#estadoSheets', 'Guardando endpoint en Firebase...', 'info');

    obtenerSheets().guardarConfiguracion(endpoint, {
      activo: activo,
      nombre: 'Google Sheets Titulación'
    })
      .then(function (resultado) {
        mostrarEstado('#estadoSheets', 'Configuración de Sheets guardada correctamente.', 'success');
        escribirJson('#sheetsResultado', {
          ok: true,
          mensaje: resultado.mensaje,
          endpointConfigurado: true,
          activo: activo
        });
      })
      .catch(function (error) {
        mostrarEstado('#estadoSheets', obtenerMensajeError(error, 'No se pudo guardar la configuración de Sheets.'), 'error');
        escribirJson('#sheetsResultado', {
          ok: false,
          error: obtenerMensajeError(error)
        });
      })
      .then(function () {
        setCargando(false);
      });
  }

  function probarSheets() {
    setCargando(true, 'Probando Apps Script / Google Sheets...');
    mostrarEstado('#estadoSheets', 'Enviando PING a Apps Script...', 'info');

    obtenerSheets().probarConexion()
      .then(function (resultado) {
        mostrarEstado('#estadoSheets', resultado.mensaje || 'Apps Script respondió correctamente.', 'success');
        escribirJson('#sheetsResultado', resultado);
      })
      .catch(function (error) {
        mostrarEstado('#estadoSheets', obtenerMensajeError(error, 'No se pudo probar Apps Script.'), 'error');
        escribirJson('#sheetsResultado', {
          ok: false,
          error: obtenerMensajeError(error)
        });
      })
      .then(function () {
        setCargando(false);
      });
  }

  function diagnosticoGeneral() {
    setCargando(true, 'Ejecutando diagnóstico general...');
    mostrarEstado('#estadoDiagnostico', 'Ejecutando diagnóstico...', 'info');

    var diagnostico = {
      fechaLocal: new Date().toISOString(),
      navegador: window.navigator ? window.navigator.userAgent : 'No disponible',
      modulos: {
        config: !!window.EstudianteMVPConfig,
        utils: !!window.EstudianteMVPUtils,
        firebaseCore: !!window.EstudianteMVPFirebaseCore,
        firebaseEstudiantes: !!window.EstudianteMVPFirebaseEstudiantes,
        firebaseIA: !!window.EstudianteMVPFirebaseIA,
        firebaseEnvios: !!window.EstudianteMVPFirebaseEnvios,
        sheets: !!window.EstudianteMVPSheets,
        iaPrompt: !!window.EstudianteMVPIAPrompt,
        iaProviders: !!window.EstudianteMVPIAProviders,
        iaTitulacion: !!window.EstudianteMVPIATitulacion
      },
      firebaseListo: obtenerFirebaseCore().estaListo(),
      proveedoresUltimaLectura: ultimoListadoProveedores.map(function (proveedor) {
        return limpiarProveedorParaMostrar(proveedor);
      })
    };

    escribirJson('#diagnosticoResultado', diagnostico);
    mostrarEstado('#estadoDiagnostico', 'Diagnóstico generado correctamente.', 'success');
    setCargando(false);
  }

  function escribirDiagnosticoBasico() {
    escribirJson('#diagnosticoResultado', {
      mensaje: 'Presiona “Diagnóstico general” para revisar el estado de los módulos.',
      archivosEsperados: [
        'app.config.js',
        'app.utils.js',
        'firebase.core.service.js',
        'firebase.estudiantes.service.js',
        'firebase.ia.service.js',
        'firebase.envios.service.js',
        'sheets.service.js',
        'ia.prompt.service.js',
        'ia.providers.service.js',
        'ia.titulacion.service.js',
        'config.app.js'
      ]
    });
  }

  function pintarProveedoresIA(proveedores) {
    var contenedor = document.getElementById('proveedoresIALista');

    if (!contenedor) {
      return;
    }

    proveedores = Array.isArray(proveedores) ? proveedores : [];

    if (!proveedores.length) {
      contenedor.innerHTML = '<p class="muted">No hay proveedores IA guardados en Firebase.</p>';
      return;
    }

    contenedor.innerHTML = proveedores.map(function (proveedor) {
      return [
        '<article class="provider-card">',
        '  <div>',
        '    <h3>' + escaparHtml(proveedor.nombre || proveedor.id) + '</h3>',
        '    <p><strong>ID:</strong> ' + escaparHtml(proveedor.id || '-') + '</p>',
        '    <p><strong>Estado:</strong> ' + (proveedor.activo ? 'Activo' : 'Inactivo') + '</p>',
        '    <p><strong>Modelo:</strong> ' + escaparHtml(proveedor.modelo || proveedor.model || '-') + '</p>',
        '    <p><strong>Endpoint:</strong> ' + escaparHtml(proveedor.endpoint ? 'Configurado' : 'No configurado') + '</p>',
        '    <p><strong>Clave:</strong> ' + escaparHtml((proveedor.apiKey || proveedor.key) ? 'Configurada' : 'No configurada') + '</p>',
        '  </div>',
        '  <button type="button" class="btn btn--secondary" data-accion="cargar-proveedor" data-provider-id="' + escaparHtml(proveedor.id || '') + '">',
        '    Cargar',
        '  </button>',
        '</article>'
      ].join('');
    }).join('');
  }

  function limpiarProveedorParaMostrar(proveedor) {
    proveedor = proveedor || {};

    return {
      id: proveedor.id || '',
      nombre: proveedor.nombre || '',
      activo: proveedor.activo === true,
      endpointConfigurado: !!proveedor.endpoint,
      modelo: proveedor.modelo || proveedor.model || '',
      claveConfigurada: !!(proveedor.apiKey || proveedor.key),
      origen: proveedor.origen || ''
    };
  }

  function valor(selector) {
    var utils = obtenerUtils();

    if (utils && utils.valor) {
      return utils.valor(selector);
    }

    var elemento = document.querySelector(selector);
    return elemento && 'value' in elemento ? String(elemento.value || '').trim() : '';
  }

  function setValor(selector, texto) {
    var elemento = document.querySelector(selector);

    if (elemento && 'value' in elemento) {
      elemento.value = texto == null ? '' : String(texto);
    }
  }

  function limpiarCampo(selector) {
    setValor(selector, '');
  }

  function estaMarcado(selector) {
    var elemento = document.querySelector(selector);

    return !!(elemento && elemento.checked);
  }

  function setMarcado(selector, valorNuevo) {
    var elemento = document.querySelector(selector);

    if (elemento) {
      elemento.checked = !!valorNuevo;
    }
  }

  function mostrarEstado(selector, mensaje, tipo) {
    var utils = obtenerUtils();

    if (utils && utils.mostrarEstado) {
      utils.mostrarEstado(selector, mensaje, tipo || 'info');
      return;
    }

    var elemento = document.querySelector(selector);

    if (elemento) {
      elemento.textContent = mensaje || '';
    }
  }

  function escribirJson(selector, data) {
    var elemento = document.querySelector(selector);

    if (!elemento) {
      return;
    }

    elemento.textContent = JSON.stringify(data || {}, null, 2);
  }

  function setCargando(activo, mensaje) {
    var loading = document.getElementById('loadingConfig');
    var botones = document.querySelectorAll('button');

    Array.prototype.forEach.call(botones, function (boton) {
      boton.disabled = !!activo;
    });

    if (loading) {
      loading.hidden = !activo;
      loading.textContent = mensaje || 'Cargando...';
    }
  }

  function obtenerMensajeError(error, fallback) {
    var utils = obtenerUtils();

    if (utils && utils.obtenerMensajeError) {
      return utils.obtenerMensajeError(error, fallback || 'Ocurrió un error.');
    }

    return error && error.message ? error.message : fallback || 'Ocurrió un error.';
  }

  function enfocar(selector) {
    var elemento = document.querySelector(selector);

    if (elemento && typeof elemento.focus === 'function') {
      elemento.focus();
    }
  }

  function escaparHtml(valorEntrada) {
    return String(valorEntrada == null ? '' : valorEntrada)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  window.EstudianteMVPConfigApp = Object.freeze({
    iniciar: iniciar,
    probarFirebase: probarFirebase,
    listarProveedoresIA: listarProveedoresIA,
    guardarProveedorIA: guardarProveedorIA,
    probarIA: probarIA,
    leerConfiguracionSheets: leerConfiguracionSheets,
    guardarConfiguracionSheets: guardarConfiguracionSheets,
    probarSheets: probarSheets,
    diagnosticoGeneral: diagnosticoGeneral
  });
})(window, document);
