/*
  Archivo: coordinador.ui.js
  Ruta: coordinadores-mvp/js/coordinador.ui.js

  Funciones principales:
  - Pintar selector de coordinadores.
  - Pintar resumen del coordinador seleccionado.
  - Pintar menú activo: Pendientes, Aprobados, Devueltos.
  - Pintar tabla principal con cédula, nombre y Ver más.
  - Mostrar estados, contador, loading y panel de diagnóstico.
  - Mantener la UI separada de la lógica de datos.
*/

(function (window, document) {
  'use strict';

  var uiIniciada = false;

  function obtenerConfig() {
    return window.CoordinadorMVPConfig || null;
  }

  function obtenerUtils() {
    return window.CoordinadorMVPUtils || null;
  }

  function obtenerState() {
    return window.CoordinadorMVPState || null;
  }

  function validarDependencias() {
    return !!(obtenerConfig() && obtenerUtils() && obtenerState());
  }

  function iniciar() {
    var state;

    if (!validarDependencias()) {
      mostrarEstado('#estadoPrincipal', 'Faltan módulos internos para iniciar la interfaz.', 'error');
      return false;
    }

    if (uiIniciada) {
      return true;
    }

    uiIniciada = true;
    state = obtenerState();

    state.escuchar(function (tipo, snapshot) {
      render(snapshot, tipo);
    });

    render(state.obtenerEstado(), 'inicial');

    return true;
  }

  function render(snapshot, tipo) {
    snapshot = snapshot || {};

    pintarCoordinadores(snapshot.coordinadores || [], snapshot.coordinadorActual);
    pintarResumenCoordinador(snapshot.coordinadorActual);
    pintarMenu(snapshot.vistaActual);
    pintarEncabezadoVista(snapshot.vistaActual);
    pintarTabla(snapshot.registrosFiltrados || []);
    pintarContador(snapshot.registrosFiltrados || []);
    setCargando(snapshot.cargando, '');
    pintarErrorSiExiste(snapshot.ultimoError);

    if (tipo === 'envios' || tipo === 'vista' || tipo === 'busqueda' || tipo === 'coordinador') {
      actualizarDescripcionEstado(snapshot);
    }
  }

  function pintarCoordinadores(coordinadores, coordinadorActual) {
    var select = document.getElementById('coordinadorSelect');
    var utils = obtenerUtils();
    var valorActual;
    var html;

    if (!select || !utils) {
      return;
    }

    valorActual = coordinadorActual && coordinadorActual.id
      ? coordinadorActual.id
      : select.value;

    coordinadores = Array.isArray(coordinadores) ? coordinadores : [];

    if (!coordinadores.length) {
      select.innerHTML = '<option value="">No hay coordinadores cargados</option>';
      select.value = '';
      return;
    }

    html = ['<option value="">Selecciona un coordinador</option>'];

    coordinadores.forEach(function (coordinador) {
      html.push(
        '<option value="' + utils.escaparHtml(coordinador.id) + '">' +
          utils.escaparHtml(coordinador.nombre || coordinador.id) +
        '</option>'
      );
    });

    select.innerHTML = html.join('');

    if (valorActual) {
      select.value = valorActual;
    }
  }

  function pintarResumenCoordinador(coordinador) {
    var resumen = document.getElementById('coordinadorResumen');
    var nombre = document.getElementById('coordinadorNombre');
    var carreras = document.getElementById('coordinadorCarreras');
    var utils = obtenerUtils();

    if (!resumen || !nombre || !carreras || !utils) {
      return;
    }

    if (!coordinador) {
      resumen.hidden = true;
      nombre.textContent = '-';
      carreras.textContent = 'Carreras: -';
      return;
    }

    resumen.hidden = false;
    nombre.textContent = coordinador.nombre || '-';
    carreras.textContent = 'Carreras: ' + utils.carrerasComoTexto(coordinador.carreras || []);
  }

  function pintarMenu(vistaActual) {
    var botones = document.querySelectorAll('[data-accion="cambiar-vista"]');

    Array.prototype.forEach.call(botones, function (boton) {
      if (boton.getAttribute('data-vista') === vistaActual) {
        boton.classList.add('is-active');
      } else {
        boton.classList.remove('is-active');
      }
    });
  }

  function pintarEncabezadoVista(vistaId) {
    var config = obtenerConfig();
    var vista = config ? config.obtenerVista(vistaId) : null;

    if (!vista) {
      return;
    }

    setTexto('#vistaActualKicker', vista.label || 'Vista');
    setTexto('#tituloTablaEstudiantes', vista.titulo || 'Estudiantes');
    setTexto('#descripcionTabla', vista.descripcion || '');
  }

  function pintarTabla(registros) {
    var tbody = document.getElementById('tablaEstudiantesBody');
    var utils = obtenerUtils();

    if (!tbody || !utils) {
      return;
    }

    registros = Array.isArray(registros) ? registros : [];

    if (!registros.length) {
      tbody.innerHTML = [
        '<tr>',
        '  <td colspan="3" class="empty-cell">No hay estudiantes para mostrar en esta vista.</td>',
        '</tr>'
      ].join('');
      return;
    }

    tbody.innerHTML = registros.map(function (envio) {
      var id = envio.id || envio._clave || envio.cedula || '';
      var cedula = envio.cedula || '-';
      var nombre = envio.nombres || envio.nombre || '-';

      return [
        '<tr data-envio-id="' + utils.escaparHtml(id) + '">',
        '  <td>' + utils.escaparHtml(cedula) + '</td>',
        '  <td>' + utils.escaparHtml(nombre) + '</td>',
        '  <td>',
        '    <button type="button" class="row-action" data-accion="ver-detalle" data-envio-id="' + utils.escaparHtml(id) + '">',
        '      Ver más',
        '    </button>',
        '  </td>',
        '</tr>'
      ].join('');
    }).join('');
  }

  function pintarContador(registros) {
    var total = Array.isArray(registros) ? registros.length : 0;

    setTexto('#contadorRegistros', String(total));
  }

  function actualizarDescripcionEstado(snapshot) {
    var config = obtenerConfig();
    var coordinador = snapshot.coordinadorActual;
    var total = Array.isArray(snapshot.registrosFiltrados)
      ? snapshot.registrosFiltrados.length
      : 0;
    var vista = config ? config.obtenerVista(snapshot.vistaActual) : null;

    if (!coordinador) {
      mostrarEstado('#estadoPrincipal', 'Selecciona un coordinador para cargar los estudiantes.', 'info');
      return;
    }

    mostrarEstado(
      '#estadoPrincipal',
      'Mostrando ' + total + ' registro(s) en la vista ' + ((vista && vista.label) || snapshot.vistaActual) + '.',
      total ? 'success' : 'warning'
    );
  }

  function pintarErrorSiExiste(error) {
    if (!error) {
      return;
    }

    mostrarEstado('#estadoPrincipal', obtenerUtils().obtenerMensajeError(error), 'error');
  }

  function mostrarEstado(selector, mensaje, tipo) {
    var utils = obtenerUtils();

    if (utils && utils.mostrarEstado) {
      return utils.mostrarEstado(selector, mensaje, tipo || 'info');
    }

    return false;
  }

  function setTexto(selector, texto) {
    var utils = obtenerUtils();

    if (utils && utils.setTexto) {
      return utils.setTexto(selector, texto);
    }

    return false;
  }

  function setValor(selector, valor) {
    var utils = obtenerUtils();

    if (utils && utils.setValor) {
      return utils.setValor(selector, valor);
    }

    return false;
  }

  function limpiarBuscador() {
    setValor('#buscadorInput', '');
  }

  function setCargando(activo, mensaje) {
    var overlay = document.getElementById('loadingOverlay');
    var texto = document.getElementById('loadingTexto');
    var botones;

    if (overlay) {
      overlay.hidden = !activo;
    }

    if (texto && mensaje) {
      texto.textContent = mensaje;
    }

    botones = document.querySelectorAll('button, select, input, textarea');

    Array.prototype.forEach.call(botones, function (elemento) {
      if (elemento.id === 'loadingOverlay') {
        return;
      }

      elemento.disabled = !!activo;
    });
  }

  function mostrarCargando(mensaje) {
    setCargando(true, mensaje || 'Cargando...');
  }

  function ocultarCargando() {
    setCargando(false, '');
  }

  function mostrarDiagnostico() {
    var panel = document.getElementById('diagnosticoPanel');

    if (!panel) {
      return;
    }

    panel.classList.remove('is-hidden');
    panel.hidden = false;
    panel.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }

  function ocultarDiagnostico() {
    var panel = document.getElementById('diagnosticoPanel');

    if (!panel) {
      return;
    }

    panel.classList.add('is-hidden');
    panel.hidden = true;
  }

  function escribirDiagnostico(data) {
    var pre = document.getElementById('diagnosticoResultado');

    if (!pre) {
      return;
    }

    if (typeof data === 'string') {
      pre.textContent = data;
      return;
    }

    pre.textContent = JSON.stringify(data || {}, null, 2);
  }

  function mostrarMensajeTabla(mensaje) {
    var tbody = document.getElementById('tablaEstudiantesBody');

    if (!tbody) {
      return;
    }

    tbody.innerHTML = [
      '<tr>',
      '  <td colspan="3" class="empty-cell">' + obtenerUtils().escaparHtml(mensaje || '') + '</td>',
      '</tr>'
    ].join('');
  }

  function enfocar(selector) {
    var elemento = document.querySelector(selector);

    if (elemento && typeof elemento.focus === 'function') {
      elemento.focus();
    }
  }

  window.CoordinadorMVPUI = Object.freeze({
    iniciar: iniciar,
    render: render,
    pintarCoordinadores: pintarCoordinadores,
    pintarResumenCoordinador: pintarResumenCoordinador,
    pintarMenu: pintarMenu,
    pintarEncabezadoVista: pintarEncabezadoVista,
    pintarTabla: pintarTabla,
    pintarContador: pintarContador,
    actualizarDescripcionEstado: actualizarDescripcionEstado,
    mostrarEstado: mostrarEstado,
    setTexto: setTexto,
    setValor: setValor,
    limpiarBuscador: limpiarBuscador,
    setCargando: setCargando,
    mostrarCargando: mostrarCargando,
    ocultarCargando: ocultarCargando,
    mostrarDiagnostico: mostrarDiagnostico,
    ocultarDiagnostico: ocultarDiagnostico,
    escribirDiagnostico: escribirDiagnostico,
    mostrarMensajeTabla: mostrarMensajeTabla,
    enfocar: enfocar
  });
})(window, document);