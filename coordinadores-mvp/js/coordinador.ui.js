/* =========================================================
Archivo: coordinador.ui.js
Ruta: /coordinadores-mvp/js/coordinador.ui.js
Función:
- Renderizar períodos, coordinadores, pestañas y tabla.
- Mostrar estados, carga y diagnóstico.
========================================================= */
(function(window,document){
  'use strict';

  var iniciada = false;

  function state(){ return window.CoordinadorMVPState || null; }
  function utils(){ return window.CoordinadorMVPUtils || null; }
  function texto(valor){ return String(valor === null || valor === undefined ? '' : valor).trim(); }
  function esc(valor){
    if(utils() && utils().escaparHtml) return utils().escaparHtml(valor);
    return texto(valor).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function $(id){ return document.getElementById(id); }

  function iniciar(){
    if(iniciada || !state()) return Boolean(iniciada);
    iniciada = true;
    state().escuchar(function(tipo,snapshot){ render(snapshot,tipo); });
    render(state().obtenerEstado(),'inicial');
    return true;
  }

  function render(snapshot){
    snapshot = snapshot || {};
    pintarPeriodos(snapshot.periodos || [], snapshot.periodoActual);
    pintarCoordinadores(snapshot.coordinadores || [], snapshot.coordinadorActual, snapshot.periodoActual);
    pintarResumen(snapshot.coordinadorActual);
    pintarTabs(snapshot.vistaActual);
    pintarEncabezado(snapshot.vistaActual);
    pintarTabla(snapshot.registrosFiltrados || []);
    setTexto('contadorRegistros', String((snapshot.registrosFiltrados || []).length));
    actualizarEstado(snapshot);
    setCargando(snapshot.cargando, 'Cargando...');
  }

  function pintarPeriodos(periodos, actual){
    var select = $('periodoSelect');
    var valor = actual && actual.id ? actual.id : (select && select.value);
    if(!select) return;

    if(!periodos.length){
      select.innerHTML = '<option value="">No hay períodos activos</option>';
      select.value = '';
      return;
    }

    select.innerHTML = periodos.map(function(item){
      return '<option value="' + esc(item.id) + '">' + esc(item.label || item.id) + (item.principal ? ' · Principal' : '') + '</option>';
    }).join('');
    select.value = valor && periodos.some(function(item){ return item.id === valor; }) ? valor : periodos[0].id;
  }

  function pintarCoordinadores(lista, actual, periodo){
    var select = $('coordinadorSelect');
    var valor = actual && actual.id ? actual.id : (select && select.value);
    if(!select) return;

    select.disabled = !periodo || !lista.length;

    if(!lista.length){
      select.innerHTML = '<option value="">No hay coordinadores activos</option>';
      select.value = '';
      return;
    }

    select.innerHTML = '<option value="">Selecciona un coordinador</option>' + lista.map(function(item){
      return '<option value="' + esc(item.id) + '">' + esc(item.nombre || item.id) + '</option>';
    }).join('');
    if(valor && lista.some(function(item){ return item.id === valor; })) select.value = valor;
  }

  function pintarResumen(coordinador){
    var resumen = $('coordinadorResumen');
    if(!resumen) return;
    if(!coordinador){
      resumen.hidden = true;
      return;
    }
    resumen.hidden = false;
    setTexto('coordinadorNombre', coordinador.nombre || '-');
    setTexto('coordinadorCarreras', coordinador.carrerasTexto || ((coordinador.carreras || []).join(', ')) || 'Sin carreras asignadas');
  }

  function pintarTabs(vista){
    document.querySelectorAll('[data-accion="cambiar-vista"]').forEach(function(boton){
      boton.classList.toggle('is-active', boton.getAttribute('data-vista') === vista);
    });
  }

  function pintarEncabezado(vista){
    var datos = {
      pendientes:['Pendientes','Estudiantes pendientes'],
      aprobados:['Aprobados','Títulos aprobados o corregidos'],
      devueltos:['Devueltos','Títulos devueltos']
    }[vista] || ['Estudiantes','Estudiantes'];
    setTexto('vistaActualKicker', datos[0]);
    setTexto('tituloTablaEstudiantes', datos[1]);
  }

  function claseEstado(valor){
    var estado = texto(valor).toUpperCase();
    if(estado === 'DEVUELTO') return 'state-returned';
    if(estado === 'APROBADO' || estado === 'REEMPLAZADO') return 'state-approved';
    return 'state-pending';
  }

  function textoEstado(valor){
    var estado = texto(valor).toUpperCase();
    if(estado === 'PENDIENTE_REVISION' || estado === 'PENDIENTE_SYNC' || estado === 'ENVIADO') return 'Pendiente';
    if(estado === 'REEMPLAZADO') return 'Aprobado corregido';
    if(estado === 'APROBADO') return 'Aprobado';
    if(estado === 'DEVUELTO') return 'Devuelto';
    return estado || 'Pendiente';
  }

  function pintarTabla(registros){
    var tbody = $('tablaEstudiantesBody');
    if(!tbody) return;

    if(!registros.length){
      tbody.innerHTML = '<tr><td colspan="5" class="empty-cell">No hay estudiantes para mostrar.</td></tr>';
      return;
    }

    tbody.innerHTML = registros.map(function(item){
      var id = item._docId || item.id || item._clave || item.cedula;
      return '<tr>' +
        '<td>' + esc(item.cedula || '-') + '</td>' +
        '<td><strong>' + esc(item.nombres || '-') + '</strong></td>' +
        '<td>' + esc(item.carrera || '-') + '</td>' +
        '<td><span class="state-pill ' + claseEstado(item.estado) + '">' + esc(textoEstado(item.estado)) + '</span></td>' +
        '<td><button type="button" class="row-action" data-accion="ver-detalle" data-envio-id="' + esc(id) + '">Ver más</button></td>' +
      '</tr>';
    }).join('');
  }

  function actualizarEstado(snapshot){
    if(snapshot.ultimoError){
      mostrarEstado('estadoPrincipal', snapshot.ultimoError.message || String(snapshot.ultimoError), 'error');
      return;
    }
    if(!snapshot.periodoActual){
      mostrarEstado('estadoPrincipal','No hay un período activo seleccionado.','warning');
      return;
    }
    if(!snapshot.coordinadorActual){
      mostrarEstado('estadoPrincipal','Selecciona un coordinador.','info');
      return;
    }
    if(!snapshot.coordinadorActual.carreras || !snapshot.coordinadorActual.carreras.length){
      mostrarEstado('estadoPrincipal','El coordinador no tiene carreras asignadas.','warning');
      return;
    }
    mostrarEstado('estadoPrincipal','Mostrando ' + (snapshot.registrosFiltrados || []).length + ' estudiante(s).','success');
  }

  function mostrarEstado(id,mensaje,tipo){
    var el = typeof id === 'string' ? $(id.replace(/^#/,'')) : id;
    if(!el) return;
    el.classList.remove('is-info','is-success','is-warning','is-error');
    el.classList.add('is-' + (tipo || 'info'));
    el.textContent = mensaje || '';
  }

  function setTexto(id,valor){
    var el = typeof id === 'string' ? $(id.replace(/^#/,'')) : id;
    if(el) el.textContent = valor === null || valor === undefined ? '' : String(valor);
  }

  function setCargando(activo,mensaje){
    var overlay = $('loadingOverlay');
    var label = $('loadingTexto');
    if(overlay) overlay.hidden = !activo;
    if(label && mensaje) label.textContent = mensaje;
  }

  function mostrarCargando(mensaje){ setCargando(true,mensaje || 'Cargando...'); }
  function ocultarCargando(){ setCargando(false,''); }

  function mostrarDiagnostico(){
    var panel = $('diagnosticoPanel');
    if(panel){ panel.hidden = false; panel.classList.remove('is-hidden'); panel.scrollIntoView({ behavior:'smooth', block:'start' }); }
  }

  function ocultarDiagnostico(){
    var panel = $('diagnosticoPanel');
    if(panel){ panel.hidden = true; panel.classList.add('is-hidden'); }
  }

  function escribirDiagnostico(data){
    var pre = $('diagnosticoResultado');
    if(pre) pre.textContent = typeof data === 'string' ? data : JSON.stringify(data || {}, null, 2);
  }

  function enfocar(selector){
    var el = document.querySelector(selector);
    if(el && typeof el.focus === 'function') el.focus();
  }

  window.CoordinadorMVPUI = Object.freeze({
    iniciar: iniciar,
    render: render,
    mostrarEstado: mostrarEstado,
    mostrarCargando: mostrarCargando,
    ocultarCargando: ocultarCargando,
    setCargando: setCargando,
    mostrarDiagnostico: mostrarDiagnostico,
    ocultarDiagnostico: ocultarDiagnostico,
    escribirDiagnostico: escribirDiagnostico,
    enfocar: enfocar,
    textoEstado: textoEstado
  });
})(window,document);
