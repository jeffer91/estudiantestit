/* =========================================================
Archivo: coordinador.modal.js
Ruta: /coordinadores-mvp/js/coordinador.modal.js
Función:
- Mostrar propuestas y datos del estudiante.
- Resaltar en dorado el título favorito elegido por el estudiante.
- Mantener separada la preferencia del estudiante de la selección del coordinador.
- Preparar aprobación, corrección o devolución.
- Impedir revisar registros sin las tres propuestas.
- Mostrar aprobados y devueltos en modo lectura.
========================================================= */
(function(window,document){
  'use strict';

  var envioActual = null;
  var iniciado = false;

  function state(){ return window.CoordinadorMVPState || null; }
  function ui(){ return window.CoordinadorMVPUI || null; }
  function utils(){ return window.CoordinadorMVPUtils || null; }
  function firebaseService(){ return window.CoordinadorMVPFirebase || null; }
  function $(id){ return document.getElementById(id); }
  function texto(valor){ return String(valor === null || valor === undefined ? '' : valor).trim(); }
  function setTexto(id,valor){ var el=$(id); if(el) el.textContent=texto(valor)||'-'; }
  function setValor(id,valor){ var el=$(id); if(el) el.value=texto(valor); }
  function estadoNormal(valor){ return texto(valor).toUpperCase(); }
  function normalizarComparacion(valor){
    return texto(valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function iniciar(){
    if(iniciado) return true;
    iniciado = true;
    document.addEventListener('change',function(evento){
      if(evento.target && evento.target.name === 'tituloSeleccionado'){
        seleccionarTitulo(Number(evento.target.value || 0));
      }
    });
    return true;
  }

  function esPendiente(envio){
    return ['PENDIENTE_REVISION','PENDIENTE_SYNC','ENVIADO','PENDIENTE'].indexOf(estadoNormal(envio && envio.estado)) >= 0;
  }

  function tieneTitulosCompletos(envio){
    if(firebaseService() && typeof firebaseService().tieneTitulosEnviados === 'function'){
      return firebaseService().tieneTitulosEnviados(envio);
    }
    return Boolean(
      envio &&
      texto(envio.titulo1) &&
      texto(envio.titulo2) &&
      texto(envio.titulo3)
    );
  }

  function abrir(envio){
    envioActual = envio || null;
    if(!envioActual){
      mostrarEstado('No se encontró el estudiante seleccionado.','error');
      return;
    }

    limpiarFormulario();
    pintarDatos(envioActual);
    pintarTitulos(envioActual);
    configurarModo(envioActual);
    $('detalleModal').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function cerrar(){
    var modal = $('detalleModal');
    if(modal) modal.hidden = true;
    document.body.style.overflow = '';
    envioActual = null;
    limpiarFormulario();
  }

  function pintarDatos(envio){
    setTexto('modalTitulo', envio.nombres || 'Revisión de títulos');
    setTexto('modalSubtitulo', (envio.cedula || '-') + ' · ' + (envio.carrera || '-'));
    setTexto('detallePeriodo', envio.periodoLabel || envio.periodoId || envio.periodo);
    setTexto('detalleFechaEnvio', envio.fechaEnvio);
    setTexto('detalleEstado', ui() && ui().textoEstado ? ui().textoEstado(envio.estado) : envio.estado);
  }

  function pintarTitulos(envio){
    setTexto('detalleTitulo1', envio.titulo1 || 'Sin título registrado');
    setTexto('detalleTitulo2', envio.titulo2 || 'Sin título registrado');
    setTexto('detalleTitulo3', envio.titulo3 || 'Sin título registrado');
    pintarFavorito(envio);
  }

  function pintarFavorito(envio){
    var numero = obtenerNumeroFavorito(envio);

    document.querySelectorAll('.proposal-card').forEach(function(tarjeta){
      tarjeta.classList.remove('is-favorite');
      tarjeta.removeAttribute('aria-label');
    });
    document.querySelectorAll('.favorite-badge').forEach(function(insignia){
      insignia.hidden = true;
    });

    if(numero < 1 || numero > 3) return 0;

    var tarjeta = document.querySelector('.proposal-card[data-propuesta="' + numero + '"]');
    var insignia = document.querySelector('.favorite-badge[data-favorito="' + numero + '"]');

    if(tarjeta){
      tarjeta.classList.add('is-favorite');
      tarjeta.setAttribute('aria-label','Título ' + numero + ', favorito del estudiante');
    }
    if(insignia) insignia.hidden = false;

    return numero;
  }

  function obtenerNumeroFavorito(envio){
    var raw = envio && envio.raw && typeof envio.raw === 'object' ? envio.raw : {};
    var candidatos = [
      envio && envio.tituloPreferidoNumero,
      envio && envio.tituloPreferido,
      envio && envio.tituloPreferidoTexto,
      envio && envio.preferido,
      envio && envio.tituloSeleccionado,
      envio && envio.tituloFavorito,
      valorFlexible(raw,['tituloPreferidoNumero','tituloPreferido','tituloPreferidoTexto','preferido','tituloSeleccionado','tituloFavorito','titulofavorito'])
    ];
    var titulos = [
      normalizarComparacion(envio && envio.titulo1),
      normalizarComparacion(envio && envio.titulo2),
      normalizarComparacion(envio && envio.titulo3)
    ];
    var i;
    var candidato;
    var numero;
    var normalizado;

    for(i = 0; i < candidatos.length; i += 1){
      candidato = texto(candidatos[i]);
      if(!candidato) continue;

      numero = extraerNumeroFavorito(candidato);
      if(numero) return numero;

      normalizado = normalizarComparacion(candidato);
      if(!normalizado) continue;

      if(normalizado === titulos[0]) return 1;
      if(normalizado === titulos[1]) return 2;
      if(normalizado === titulos[2]) return 3;
    }

    return 0;
  }

  function extraerNumeroFavorito(valor){
    var limpio = texto(valor).toLowerCase().trim();
    var coincidencia;

    if(/^[123]$/.test(limpio)) return Number(limpio);

    coincidencia = limpio.match(/^(?:t[ií]tulo|propuesta|opci[oó]n|alternativa|favorito)\s*#?\s*([123])(?:\s|[-:.)]|$)/i);
    if(coincidencia) return Number(coincidencia[1]);

    coincidencia = limpio.match(/^([123])\s*[-:.)]\s+/);
    if(coincidencia) return Number(coincidencia[1]);

    return 0;
  }

  function valorFlexible(objeto,nombres){
    var data = objeto || {};
    var mapa = {};
    var i;
    var clave;

    Object.keys(data).forEach(function(item){
      mapa[normalizarComparacion(item)] = item;
    });

    for(i = 0; i < nombres.length; i += 1){
      clave = mapa[normalizarComparacion(nombres[i])];
      if(clave !== undefined && data[clave] !== undefined && data[clave] !== null){
        if(texto(data[clave])) return data[clave];
      }
    }

    return '';
  }

  function configurarModo(envio){
    var completos = tieneTitulosCompletos(envio);
    var pendiente = esPendiente(envio) && completos;
    var favorito = obtenerNumeroFavorito(envio);
    var finalInput = $('tituloFinalInput');
    var comentario = $('comentarioCoordinadorInput');
    var aprobar = $('btnAprobarEnvio');
    var devolver = $('btnDevolverEnvio');
    var radios = document.querySelectorAll('input[name="tituloSeleccionado"]');

    if(finalInput){
      finalInput.readOnly = !pendiente;
      if(!pendiente) finalInput.value = texto(envio.tituloAprobado);
    }
    if(comentario){
      comentario.readOnly = !pendiente;
      comentario.value = texto(envio.comentarioCoordinador);
    }
    if(aprobar) aprobar.hidden = !pendiente;
    if(devolver) devolver.hidden = !pendiente;
    radios.forEach(function(radio){ radio.disabled = !pendiente; });

    if(!completos){
      mostrarEstado('Este registro no contiene las tres propuestas y no puede ser revisado.','error');
    }else if(pendiente && favorito){
      mostrarEstado('El favorito del estudiante está resaltado en dorado. Selecciona la propuesta que aprobarás o escribe el título final.','info');
    }else if(pendiente){
      mostrarEstado('Selecciona una propuesta o escribe el título final.','info');
    }else{
      mostrarEstado('Registro revisado. Esta vista es solo de lectura.','success');
    }
  }

  function seleccionarTitulo(numero){
    document.querySelectorAll('.proposal-card').forEach(function(tarjeta){ tarjeta.classList.remove('is-selected'); });
    var tarjeta = document.querySelector('.proposal-card[data-propuesta="' + numero + '"]');
    if(tarjeta) tarjeta.classList.add('is-selected');
    if(esPendiente(envioActual) && tieneTitulosCompletos(envioActual)){
      var titulo = obtenerTituloPorNumero(numero);
      if(titulo) setValor('tituloFinalInput',titulo);
    }
  }

  function obtenerTituloPorNumero(numero){
    if(!envioActual) return '';
    if(numero === 1) return texto(envioActual.titulo1);
    if(numero === 2) return texto(envioActual.titulo2);
    if(numero === 3) return texto(envioActual.titulo3);
    return '';
  }

  function obtenerNumeroTituloSeleccionado(){
    var radio = document.querySelector('input[name="tituloSeleccionado"]:checked');
    return radio ? Number(radio.value || 0) : 0;
  }

  function obtenerResolucion(tipo){
    var coordinador = state() && state().obtenerCoordinadorActual();
    var numero = obtenerNumeroTituloSeleccionado();
    var original = obtenerTituloPorNumero(numero);
    var final = texto($('tituloFinalInput') && $('tituloFinalInput').value);
    var comentario = texto($('comentarioCoordinadorInput') && $('comentarioCoordinadorInput').value);

    if(!envioActual) return { ok:false, mensaje:'No hay estudiante seleccionado.' };
    if(!tieneTitulosCompletos(envioActual)) {
      return { ok:false, mensaje:'El estudiante no tiene las tres propuestas registradas.' };
    }
    if(!coordinador) return { ok:false, mensaje:'Selecciona un coordinador.' };
    if(tipo === 'aprobar' && final.length < 8){
      return { ok:false, mensaje:'Selecciona o escribe el título final.', selector:'#tituloFinalInput' };
    }
    if(tipo === 'devolver' && comentario.length < 4){
      return { ok:false, mensaje:'Escribe una observación para devolver.', selector:'#comentarioCoordinadorInput' };
    }

    return {
      ok:true,
      data:{
        tipo:tipo,
        envio:utils() && utils().clonar ? utils().clonar(envioActual) : Object.assign({},envioActual),
        tituloSeleccionadoNumero:numero,
        tituloOriginal:original,
        tituloFinal:final,
        comentarioCoordinador:comentario,
        coordinador:{ id:coordinador.id, nombre:coordinador.nombre, carreras:coordinador.carreras || [] }
      }
    };
  }

  function obtenerResolucionAprobar(){
    var resultado = obtenerResolucion('aprobar');
    if(!resultado.ok){
      mostrarEstado(resultado.mensaje,'error');
      if(ui() && resultado.selector) ui().enfocar(resultado.selector);
    }
    return resultado;
  }

  function obtenerResolucionDevolver(){
    var resultado = obtenerResolucion('devolver');
    if(!resultado.ok){
      mostrarEstado(resultado.mensaje,'error');
      if(ui() && resultado.selector) ui().enfocar(resultado.selector);
    }
    return resultado;
  }

  function limpiarFormulario(){
    document.querySelectorAll('input[name="tituloSeleccionado"]').forEach(function(radio){
      radio.checked=false;
      radio.disabled=false;
    });
    document.querySelectorAll('.proposal-card').forEach(function(tarjeta){
      tarjeta.classList.remove('is-selected');
      tarjeta.classList.remove('is-favorite');
      tarjeta.removeAttribute('aria-label');
    });
    document.querySelectorAll('.favorite-badge').forEach(function(insignia){
      insignia.hidden=true;
    });
    setValor('tituloFinalInput','');
    setValor('comentarioCoordinadorInput','');
    var aprobar=$('btnAprobarEnvio');
    var devolver=$('btnDevolverEnvio');
    if(aprobar) aprobar.hidden=false;
    if(devolver) devolver.hidden=false;
    var finalInput=$('tituloFinalInput');
    var comentario=$('comentarioCoordinadorInput');
    if(finalInput) finalInput.readOnly=false;
    if(comentario) comentario.readOnly=false;
    mostrarEstado('','info');
  }

  function mostrarEstado(mensaje,tipo){
    if(ui()) ui().mostrarEstado('estadoModal',mensaje,tipo || 'info');
  }

  function obtenerEnvioActual(){
    return envioActual
      ? (utils() && utils().clonar ? utils().clonar(envioActual) : Object.assign({},envioActual))
      : null;
  }

  window.CoordinadorMVPModal = Object.freeze({
    iniciar:iniciar,
    abrir:abrir,
    cerrar:cerrar,
    seleccionarTitulo:seleccionarTitulo,
    obtenerNumeroFavorito:obtenerNumeroFavorito,
    obtenerResolucionAprobar:obtenerResolucionAprobar,
    obtenerResolucionDevolver:obtenerResolucionDevolver,
    obtenerEnvioActual:obtenerEnvioActual,
    mostrarEstado:mostrarEstado
  });
})(window,document);
