/* Modal de revisión de propuestas para Coordinadores. */
(function(window,document){
  'use strict';

  var envioActual=null;
  var iniciado=false;
  var guardando=false;
  var borradoresMemoria={};
  var PREFIJO_BORRADOR='coordinador_revision_borrador_v1:';

  function state(){return window.CoordinadorMVPState||null;}
  function ui(){return window.CoordinadorMVPUI||null;}
  function utils(){return window.CoordinadorMVPUtils||null;}
  function firebaseService(){return window.CoordinadorMVPFirebase||null;}
  function $(id){return document.getElementById(id);}
  function texto(valor){return String(valor===null||valor===undefined?'':valor).trim();}
  function setTexto(id,valor){var el=$(id);if(el)el.textContent=texto(valor)||'-';}
  function setValor(id,valor){var el=$(id);if(el)el.value=texto(valor);}
  function estadoNormal(valor){return texto(valor).toUpperCase();}
  function normalizarComparacion(valor){return texto(valor).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}

  function iniciar(){
    if(iniciado)return true;
    iniciado=true;

    document.addEventListener('change',function(evento){
      if(evento.target&&evento.target.name==='tituloSeleccionado')seleccionarTitulo(Number(evento.target.value||0));
    });

    document.addEventListener('click',function(evento){
      var boton=evento.target&&evento.target.closest?evento.target.closest('[data-seleccionar-propuesta]'):null;
      if(boton){
        evento.preventDefault();
        seleccionarTitulo(Number(boton.getAttribute('data-seleccionar-propuesta')||0));
        return;
      }
      var tarjeta=evento.target&&evento.target.closest?evento.target.closest('.proposal-card[data-propuesta]'):null;
      if(!tarjeta||evento.target.closest('button,input,textarea,a,label'))return;
      seleccionarTitulo(Number(tarjeta.getAttribute('data-propuesta')||0));
    });

    document.addEventListener('keydown',function(evento){
      var tarjeta=evento.target&&evento.target.closest?evento.target.closest('.proposal-card[data-propuesta]'):null;
      if(!tarjeta||tarjeta.classList.contains('is-disabled'))return;
      if(evento.key==='Enter'||evento.key===' '){
        evento.preventDefault();
        seleccionarTitulo(Number(tarjeta.getAttribute('data-propuesta')||0));
      }
    });

    var finalInput=$('tituloFinalInput');
    if(finalInput){
      finalInput.addEventListener('input',function(){
        actualizarEstadoEdicion();
        guardarBorradorActual();
      });
    }

    var comentario=$('comentarioCoordinadorInput');
    if(comentario)comentario.addEventListener('input',guardarBorradorActual);
    return true;
  }

  function esPendiente(envio){return['PENDIENTE_REVISION','PENDIENTE_SYNC','ENVIADO','PENDIENTE'].indexOf(estadoNormal(envio&&envio.estado))>=0;}
  function tieneTitulosCompletos(envio){
    if(firebaseService()&&typeof firebaseService().tieneTitulosEnviados==='function')return firebaseService().tieneTitulosEnviados(envio);
    return Boolean(envio&&texto(envio.titulo1)&&texto(envio.titulo2)&&texto(envio.titulo3));
  }

  function claveBorrador(envio){
    envio=envio||{};
    var id=texto(envio.id||envio.idRegistro||envio._clave||'');
    if(!id)id=texto(envio.cedula)+'__'+texto(envio.periodoId||envio.periodoLabel||envio.periodo);
    return id?PREFIJO_BORRADOR+id:'';
  }

  function leerBorrador(envio){
    var clave=claveBorrador(envio);
    if(!clave)return null;
    try{
      var guardado=window.sessionStorage&&window.sessionStorage.getItem(clave);
      if(guardado)return JSON.parse(guardado);
    }catch(error){}
    return borradoresMemoria[clave]||null;
  }

  function escribirBorrador(envio,borrador){
    var clave=claveBorrador(envio);
    if(!clave)return false;
    borradoresMemoria[clave]=borrador;
    try{if(window.sessionStorage)window.sessionStorage.setItem(clave,JSON.stringify(borrador));}catch(error){}
    return true;
  }

  function eliminarBorrador(envio){
    var clave=claveBorrador(envio);
    if(!clave)return;
    delete borradoresMemoria[clave];
    try{if(window.sessionStorage)window.sessionStorage.removeItem(clave);}catch(error){}
  }

  function guardarBorradorActual(){
    if(!envioActual||guardando||!esPendiente(envioActual))return false;
    var numero=obtenerNumeroTituloSeleccionado();
    var final=texto($('tituloFinalInput')&&$('tituloFinalInput').value);
    var comentario=texto($('comentarioCoordinadorInput')&&$('comentarioCoordinadorInput').value);
    if(!numero&&!final&&!comentario){eliminarBorrador(envioActual);return true;}
    return escribirBorrador(envioActual,{tituloSeleccionadoNumero:numero,tituloFinal:final,comentarioCoordinador:comentario,actualizadoEn:new Date().toISOString()});
  }

  function restaurarBorrador(envio){
    if(!esPendiente(envio))return false;
    var borrador=leerBorrador(envio);
    if(!borrador)return false;
    var numero=Number(borrador.tituloSeleccionadoNumero||0);
    if(numero>=1&&numero<=3){
      var radio=document.querySelector('input[name="tituloSeleccionado"][value="'+numero+'"]');
      if(radio)radio.checked=true;
    }
    setValor('tituloFinalInput',borrador.tituloFinal||'');
    setValor('comentarioCoordinadorInput',borrador.comentarioCoordinador||'');
    actualizarEstadoEdicion();
    mostrarEstado('Se recuperó el borrador de esta revisión. Puedes continuar y guardarlo.','info');
    return true;
  }

  function abrir(envio){
    envioActual=envio||null;
    guardando=false;
    if(!envioActual){mostrarEstado('No se encontró el estudiante seleccionado.','error');return;}
    limpiarFormulario();
    pintarDatos(envioActual);
    pintarTitulos(envioActual);
    configurarModo(envioActual);
    restaurarBorrador(envioActual);
    var modal=$('detalleModal');
    if(modal)modal.hidden=false;
    document.body.style.overflow='hidden';
  }

  function cerrar(opciones){
    opciones=opciones||{};
    if(guardando&&opciones.forzar!==true)return false;
    if(envioActual&&opciones.descartar!==true)guardarBorradorActual();
    var modal=$('detalleModal');
    if(modal)modal.hidden=true;
    document.body.style.overflow='';
    envioActual=null;
    guardando=false;
    limpiarFormulario();
    return true;
  }

  function pintarDatos(envio){
    setTexto('modalTitulo',envio.nombres||'Revisión de títulos');
    setTexto('modalSubtitulo',(envio.cedula||'-')+' · '+(envio.carrera||'-'));
    setTexto('detallePeriodo',envio.periodoLabel||envio.periodoId||envio.periodo);
    setTexto('detalleFechaEnvio',envio.fechaEnvio);
    setTexto('detalleEstado',ui()&&ui().textoEstado?ui().textoEstado(envio.estado):envio.estado);
  }

  function pintarTitulos(envio){
    setTexto('detalleTitulo1',envio.titulo1||'Sin título registrado');
    setTexto('detalleTitulo2',envio.titulo2||'Sin título registrado');
    setTexto('detalleTitulo3',envio.titulo3||'Sin título registrado');
    pintarFavorito(envio);
  }

  function pintarFavorito(envio){
    var numero=obtenerNumeroFavorito(envio);
    document.querySelectorAll('.proposal-card').forEach(function(tarjeta){tarjeta.classList.remove('is-favorite');tarjeta.removeAttribute('aria-label');});
    document.querySelectorAll('.favorite-badge').forEach(function(insignia){insignia.hidden=true;});
    if(numero<1||numero>3)return 0;
    var tarjeta=document.querySelector('.proposal-card[data-propuesta="'+numero+'"]');
    var insignia=document.querySelector('.favorite-badge[data-favorito="'+numero+'"]');
    if(tarjeta){tarjeta.classList.add('is-favorite');tarjeta.setAttribute('aria-label','Título '+numero+', favorito del estudiante');}
    if(insignia)insignia.hidden=false;
    return numero;
  }

  function obtenerNumeroFavorito(envio){
    var raw=envio&&envio.raw&&typeof envio.raw==='object'?envio.raw:{};
    var candidatos=[envio&&envio.tituloPreferidoNumero,envio&&envio.tituloPreferido,envio&&envio.tituloPreferidoTexto,envio&&envio.preferido,envio&&envio.tituloSeleccionado,envio&&envio.tituloFavorito,valorFlexible(raw,['tituloPreferidoNumero','tituloPreferido','tituloPreferidoTexto','preferido','tituloSeleccionado','tituloFavorito','titulofavorito'])];
    var titulos=[normalizarComparacion(envio&&envio.titulo1),normalizarComparacion(envio&&envio.titulo2),normalizarComparacion(envio&&envio.titulo3)];
    for(var i=0;i<candidatos.length;i+=1){
      var candidato=texto(candidatos[i]);
      if(!candidato)continue;
      var numero=extraerNumeroFavorito(candidato);
      if(numero)return numero;
      var normalizado=normalizarComparacion(candidato);
      if(normalizado===titulos[0])return 1;
      if(normalizado===titulos[1])return 2;
      if(normalizado===titulos[2])return 3;
    }
    return 0;
  }

  function extraerNumeroFavorito(valor){
    var limpio=texto(valor).toLowerCase().trim();
    if(/^[123]$/.test(limpio))return Number(limpio);
    var coincidencia=limpio.match(/^(?:t[ií]tulo|propuesta|opci[oó]n|alternativa|favorito)\s*#?\s*([123])(?:\s|[-:.)]|$)/i);
    if(coincidencia)return Number(coincidencia[1]);
    coincidencia=limpio.match(/^([123])\s*[-:.)]\s+/);
    return coincidencia?Number(coincidencia[1]):0;
  }

  function valorFlexible(objeto,nombres){
    var data=objeto||{},mapa={};
    Object.keys(data).forEach(function(item){mapa[normalizarComparacion(item)]=item;});
    for(var i=0;i<nombres.length;i+=1){
      var clave=mapa[normalizarComparacion(nombres[i])];
      if(clave!==undefined&&data[clave]!==undefined&&data[clave]!==null&&texto(data[clave]))return data[clave];
    }
    return'';
  }

  function configurarModo(envio){
    var completos=tieneTitulosCompletos(envio);
    var pendiente=esPendiente(envio)&&completos;
    var favorito=obtenerNumeroFavorito(envio);
    var finalInput=$('tituloFinalInput');
    var comentario=$('comentarioCoordinadorInput');
    var aprobar=$('btnAprobarEnvio');
    var devolver=$('btnDevolverEnvio');

    if(finalInput){finalInput.readOnly=!pendiente;if(!pendiente)finalInput.value=texto(envio.tituloAprobado||envio.tituloFinal||envio.tituloCorregido);}
    if(comentario){comentario.readOnly=!pendiente;if(!pendiente)comentario.value=texto(envio.comentarioCoordinador||envio.comentario||envio.observacion);}
    if(aprobar){aprobar.hidden=!pendiente;aprobar.disabled=false;aprobar.textContent='Aprobar título';}
    if(devolver){devolver.hidden=!pendiente;devolver.disabled=false;devolver.textContent='Devolver';}

    document.querySelectorAll('input[name="tituloSeleccionado"]').forEach(function(radio){radio.disabled=!pendiente;});
    document.querySelectorAll('.proposal-card').forEach(function(tarjeta){
      tarjeta.classList.toggle('is-disabled',!pendiente);
      tarjeta.setAttribute('aria-disabled',pendiente?'false':'true');
      tarjeta.tabIndex=pendiente?0:-1;
    });
    document.querySelectorAll('[data-seleccionar-propuesta]').forEach(function(boton){boton.disabled=!pendiente;});

    if(!completos)mostrarEstado('Este registro no contiene las tres propuestas y no puede ser revisado.','error');
    else if(pendiente&&favorito)mostrarEstado('El favorito del estudiante está resaltado en dorado. Selecciona la propuesta que aprobarás o escribe el título final.','info');
    else if(pendiente)mostrarEstado('Selecciona una propuesta o escribe el título final.','info');
    else mostrarEstado('Registro revisado. Esta vista es solo de lectura.','success');
  }

  function seleccionarTitulo(numero){
    if(numero<1||numero>3||guardando||!envioActual||!esPendiente(envioActual)||!tieneTitulosCompletos(envioActual))return false;
    var titulo=obtenerTituloPorNumero(numero);
    if(!titulo)return false;
    var radio=document.querySelector('input[name="tituloSeleccionado"][value="'+numero+'"]');
    if(radio)radio.checked=true;
    setValor('tituloFinalInput',titulo);
    actualizarSeleccionVisual(numero,false);
    guardarBorradorActual();
    mostrarEstado('Título '+numero+' seleccionado. Puedes aprobarlo o editar el texto final sin perder la selección.','success');
    return true;
  }

  function actualizarSeleccionVisual(numero,editado){
    document.querySelectorAll('.proposal-card').forEach(function(tarjeta){
      var seleccionada=Number(tarjeta.getAttribute('data-propuesta')||0)===numero;
      tarjeta.classList.toggle('is-selected',seleccionada);
      tarjeta.classList.toggle('is-edited',seleccionada&&editado===true);
      tarjeta.setAttribute('aria-pressed',seleccionada?'true':'false');
    });
    document.querySelectorAll('[data-seleccionar-propuesta]').forEach(function(boton){
      var seleccionada=Number(boton.getAttribute('data-seleccionar-propuesta')||0)===numero;
      boton.classList.toggle('is-selected',seleccionada);
      boton.classList.toggle('is-edited',seleccionada&&editado===true);
      boton.setAttribute('aria-pressed',seleccionada?'true':'false');
      boton.textContent=seleccionada?(editado?'✓ Seleccionado · corregido':'✓ Título seleccionado'):'Seleccionar este título';
    });
  }

  function actualizarEstadoEdicion(){
    var numero=obtenerNumeroTituloSeleccionado();
    if(!numero){actualizarSeleccionVisual(0,false);return false;}
    var original=obtenerTituloPorNumero(numero);
    var final=texto($('tituloFinalInput')&&$('tituloFinalInput').value);
    var editado=Boolean(final&&normalizarComparacion(final)!==normalizarComparacion(original));
    actualizarSeleccionVisual(numero,editado);
    return editado;
  }

  function obtenerTituloPorNumero(numero){
    if(!envioActual)return'';
    if(numero===1)return texto(envioActual.titulo1);
    if(numero===2)return texto(envioActual.titulo2);
    if(numero===3)return texto(envioActual.titulo3);
    return'';
  }

  function obtenerNumeroTituloSeleccionado(){
    var radio=document.querySelector('input[name="tituloSeleccionado"]:checked');
    return radio?Number(radio.value||0):0;
  }

  function obtenerResolucion(tipo){
    var coordinador=state()&&state().obtenerCoordinadorActual();
    var numero=obtenerNumeroTituloSeleccionado();
    var original=obtenerTituloPorNumero(numero);
    var final=texto($('tituloFinalInput')&&$('tituloFinalInput').value);
    var comentario=texto($('comentarioCoordinadorInput')&&$('comentarioCoordinadorInput').value);
    var coincideSeleccion=Boolean(numero&&original&&normalizarComparacion(final)===normalizarComparacion(original));

    if(!envioActual)return{ok:false,mensaje:'No hay estudiante seleccionado.'};
    if(!tieneTitulosCompletos(envioActual))return{ok:false,mensaje:'El estudiante no tiene las tres propuestas registradas.'};
    if(!coordinador)return{ok:false,mensaje:'Selecciona un coordinador.'};

    if(tipo==='aprobar'){
      if(!final)return{ok:false,mensaje:'Selecciona una propuesta o escribe el título final.',selector:'#tituloFinalInput'};
      if(!coincideSeleccion&&final.length<8)return{ok:false,mensaje:'Escribe un título final completo o selecciona una de las propuestas.',selector:'#tituloFinalInput'};
    }
    if(tipo==='devolver'&&comentario.length<4)return{ok:false,mensaje:'Escribe una observación para devolver.',selector:'#comentarioCoordinadorInput'};

    guardarBorradorActual();
    return{ok:true,data:{tipo:tipo,envio:utils()&&utils().clonar?utils().clonar(envioActual):Object.assign({},envioActual),tituloSeleccionadoNumero:numero,tituloOriginal:original,tituloFinal:final,comentarioCoordinador:comentario,coordinador:{id:coordinador.id,nombre:coordinador.nombre,carreras:coordinador.carreras||[]}}};
  }

  function obtenerResolucionAprobar(){
    var resultado=obtenerResolucion('aprobar');
    if(!resultado.ok){mostrarEstado(resultado.mensaje,'error');if(ui()&&resultado.selector)ui().enfocar(resultado.selector);}
    return resultado;
  }

  function obtenerResolucionDevolver(){
    var resultado=obtenerResolucion('devolver');
    if(!resultado.ok){mostrarEstado(resultado.mensaje,'error');if(ui()&&resultado.selector)ui().enfocar(resultado.selector);}
    return resultado;
  }

  function establecerGuardando(activo,mensaje){
    guardando=activo===true;
    var pendiente=Boolean(envioActual&&esPendiente(envioActual)&&tieneTitulosCompletos(envioActual));
    var aprobar=$('btnAprobarEnvio'),devolver=$('btnDevolverEnvio'),finalInput=$('tituloFinalInput'),comentario=$('comentarioCoordinadorInput');
    if(aprobar){aprobar.disabled=guardando;aprobar.textContent=guardando?'Guardando...':'Aprobar título';}
    if(devolver){devolver.disabled=guardando;devolver.textContent=guardando?'Guardando...':'Devolver';}
    if(finalInput)finalInput.readOnly=guardando||!pendiente;
    if(comentario)comentario.readOnly=guardando||!pendiente;
    document.querySelectorAll('input[name="tituloSeleccionado"]').forEach(function(radio){radio.disabled=guardando||!pendiente;});
    document.querySelectorAll('[data-seleccionar-propuesta]').forEach(function(boton){boton.disabled=guardando||!pendiente;});
    document.querySelectorAll('.proposal-card').forEach(function(tarjeta){
      tarjeta.classList.toggle('is-disabled',guardando||!pendiente);
      tarjeta.setAttribute('aria-disabled',guardando||!pendiente?'true':'false');
      tarjeta.tabIndex=guardando||!pendiente?-1:0;
    });
    if(mensaje)mostrarEstado(mensaje,guardando?'info':'error');
  }

  function confirmarGuardado(mensaje){
    var envio=envioActual;
    guardando=true;
    eliminarBorrador(envio);
    var aprobar=$('btnAprobarEnvio'),devolver=$('btnDevolverEnvio'),finalInput=$('tituloFinalInput'),comentario=$('comentarioCoordinadorInput');
    if(aprobar){aprobar.disabled=true;aprobar.textContent='✓ Guardado';}
    if(devolver)devolver.disabled=true;
    if(finalInput)finalInput.readOnly=true;
    if(comentario)comentario.readOnly=true;
    document.querySelectorAll('input[name="tituloSeleccionado"]').forEach(function(radio){radio.disabled=true;});
    document.querySelectorAll('[data-seleccionar-propuesta]').forEach(function(boton){boton.disabled=true;});
    document.querySelectorAll('.proposal-card').forEach(function(tarjeta){tarjeta.classList.add('is-disabled');tarjeta.setAttribute('aria-disabled','true');tarjeta.tabIndex=-1;});
    mostrarEstado(mensaje||'La resolución se guardó correctamente.','success');
  }

  function errorGuardado(mensaje){
    establecerGuardando(false);
    mostrarEstado(mensaje||'No se pudo guardar la resolución. El borrador se conserva.','error');
    guardarBorradorActual();
  }

  function limpiarFormulario(){
    document.querySelectorAll('input[name="tituloSeleccionado"]').forEach(function(radio){radio.checked=false;radio.disabled=false;});
    document.querySelectorAll('.proposal-card').forEach(function(tarjeta){tarjeta.classList.remove('is-selected','is-edited','is-favorite','is-disabled');tarjeta.removeAttribute('aria-label');tarjeta.setAttribute('aria-pressed','false');tarjeta.setAttribute('aria-disabled','false');tarjeta.tabIndex=0;});
    document.querySelectorAll('.favorite-badge').forEach(function(insignia){insignia.hidden=true;});
    document.querySelectorAll('[data-seleccionar-propuesta]').forEach(function(boton){boton.disabled=false;boton.classList.remove('is-selected','is-edited');boton.setAttribute('aria-pressed','false');boton.textContent='Seleccionar este título';});
    setValor('tituloFinalInput','');
    setValor('comentarioCoordinadorInput','');
    var aprobar=$('btnAprobarEnvio'),devolver=$('btnDevolverEnvio'),finalInput=$('tituloFinalInput'),comentario=$('comentarioCoordinadorInput');
    if(aprobar){aprobar.hidden=false;aprobar.disabled=false;aprobar.textContent='Aprobar título';}
    if(devolver){devolver.hidden=false;devolver.disabled=false;devolver.textContent='Devolver';}
    if(finalInput)finalInput.readOnly=false;
    if(comentario)comentario.readOnly=false;
    mostrarEstado('','info');
  }

  function mostrarEstado(mensaje,tipo){if(ui())ui().mostrarEstado('estadoModal',mensaje,tipo||'info');}
  function obtenerEnvioActual(){return envioActual?(utils()&&utils().clonar?utils().clonar(envioActual):Object.assign({},envioActual)):null;}

  window.CoordinadorMVPModal=Object.freeze({
    iniciar:iniciar,
    abrir:abrir,
    cerrar:cerrar,
    seleccionarTitulo:seleccionarTitulo,
    obtenerNumeroFavorito:obtenerNumeroFavorito,
    obtenerResolucionAprobar:obtenerResolucionAprobar,
    obtenerResolucionDevolver:obtenerResolucionDevolver,
    obtenerEnvioActual:obtenerEnvioActual,
    guardarBorradorActual:guardarBorradorActual,
    establecerGuardando:establecerGuardando,
    confirmarGuardado:confirmarGuardado,
    errorGuardado:errorGuardado,
    mostrarEstado:mostrarEstado
  });
})(window,document);
