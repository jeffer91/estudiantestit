/* Administrador Firebase: UTET consulta; Títulos operación, coordinación e IA. */
(function(window,document){
  'use strict';

  var VERSION='3.1.2';
  var state={periodos:[],principal:null,carreras:[],coordinadores:[],titulos:[],proveedores:[],periodoId:'',coordinadorEdicion:null,proveedorEdicion:null};

  function api(){if(!window.ADAPIService)throw new Error('ADAPIService no está disponible.');return window.ADAPIService;}
  function $(id){return document.getElementById(id);}
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function esc(v){return texto(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function listaCarreras(v){if(Array.isArray(v))return v.map(texto).filter(Boolean);return texto(v).split(/[,;\n|]+/).map(texto).filter(Boolean);}
  function cedula(v){var d=texto(v).replace(/\D/g,'');return d.length===9?'0'+d:d;}
  function mensaje(error){return error&&error.message?error.message:texto(error)||'Error desconocido.';}
  function setTexto(id,value){var el=$(id);if(el)el.textContent=value;}
  function setHtml(id,value){var el=$(id);if(el)el.innerHTML=value;}
  function estadoBox(id,msg,tipo){var el=$(id);if(!el)return;el.textContent=msg||'';el.className='ad-result-box ad-status-'+(tipo||'info');}
  function badge(id,text,type){var el=$(id);if(!el)return;el.textContent=text;el.className='ad-badge ad-badge-'+type;}
  function busy(active,text){var el=$('ad-loading');if(el){el.hidden=!active;el.textContent=text||'Procesando...';}document.querySelectorAll('button').forEach(function(btn){btn.disabled=active&&btn.getAttribute('data-no-lock')!=='true';});}
  function option(value,label,selected){return '<option value="'+esc(value)+'"'+(selected?' selected':'')+'>'+esc(label)+'</option>';}

  function mostrarVista(id){
    document.querySelectorAll('[data-ad-view]').forEach(function(section){section.hidden=section.id!==id;});
    document.querySelectorAll('[data-ad-view-target]').forEach(function(link){var active=link.getAttribute('data-ad-view-target')===id;link.classList.toggle('is-active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    try{window.location.hash=id;}catch(error){}
  }

  function renderPeriodos(){
    var filas=state.periodos.map(function(p){return '<tr><td>'+esc(p.id||p.periodoId)+'</td><td>'+esc(p.label||p.periodoLabel||p.id)+'</td><td><span class="ad-badge ad-badge-success">Firebase</span></td><td>'+(p.principal?'<span class="ad-badge ad-badge-info">Principal</span>':'-')+'</td></tr>';});
    setHtml('ad-tabla-periodos',filas.length?filas.join(''):'<tr><td colspan="4" class="ad-empty">No se encontraron períodos.</td></tr>');
    var select=$('ad-periodo-select');
    if(select)select.innerHTML=state.periodos.map(function(p){return option(p.id||p.periodoId,p.label||p.periodoLabel||p.id,(p.id||p.periodoId)===state.periodoId);}).join('');
    document.querySelectorAll('[data-periodo-select]').forEach(function(el){el.innerHTML='<option value="">Todos / principal</option>'+state.periodos.map(function(p){return option(p.id||p.periodoId,p.label||p.periodoLabel||p.id,false);}).join('');});
    setTexto('ad-kpi-periodo',state.principal&&state.principal.label||'Sin período');
    setTexto('ad-kpi-periodo-id',state.principal&&state.principal.id||'-');
  }

  function renderCarreras(){
    var filas=state.carreras.map(function(c){var codigo=texto(c.CodigoCarrera||c.codigoCarrera||c.codigo||c.id);var nombre=texto(c.NombreCarrera||c.nombreCarrera||c.nombre||c.carrera);return '<tr><td>'+esc(codigo)+'</td><td>'+esc(nombre)+'</td><td><span class="ad-badge ad-badge-info">Firebase Títulos</span></td></tr>';});
    setHtml('ad-tabla-carreras',filas.length?filas.join(''):'<tr><td colspan="3" class="ad-empty">No se encontraron carreras para el período.</td></tr>');
    setTexto('ad-kpi-carreras',String(state.carreras.length));
  }

  function normalizarCoordinador(c){c=c||{};var carreras=listaCarreras(c.carreras||c.carrerasAsignadas||c.carrerasNombres);return{id:texto(c.id||c._docId||c.idRegistro||c.coordinadorId||c.nombre),nombre:texto(c.nombre||c.Nombre||c.coordinador),telegram:texto(c.telegram||c.Telegram),activo:c.activo!==false&&texto(c.estado||'ACTIVO').toUpperCase()!=='INACTIVO',carreras:carreras};}
  function renderCoordinadores(){
    state.coordinadores=state.coordinadores.map(normalizarCoordinador).filter(function(c){return c.id&&c.nombre;});
    var filas=state.coordinadores.map(function(c){return '<tr><td><strong>'+esc(c.nombre)+'</strong><br><small>'+esc(c.id)+'</small></td><td>'+esc(c.telegram)+'</td><td><span class="ad-badge '+(c.activo?'ad-badge-success':'ad-badge-warning')+'">'+(c.activo?'Activo':'Inactivo')+'</span></td><td>'+esc(c.carreras.join(' | '))+'</td><td><button class="ad-btn ad-btn-secondary" type="button" data-action="editar-coordinador" data-id="'+esc(c.id)+'">Editar</button> <button class="ad-btn '+(c.activo?'ad-btn-danger':'ad-btn-primary')+'" type="button" data-action="toggle-coordinador" data-id="'+esc(c.id)+'" data-activo="'+(!c.activo)+'">'+(c.activo?'Desactivar':'Activar')+'</button></td></tr>';});
    setHtml('ad-tabla-coordinadores',filas.length?filas.join(''):'<tr><td colspan="5" class="ad-empty">No hay coordinadores registrados.</td></tr>');
    setTexto('ad-kpi-coordinadores',String(state.coordinadores.length));
    var sel=$('ad-asignar-coordinador');if(sel)sel.innerHTML='<option value="">Selecciona</option>'+state.coordinadores.map(function(c){return option(c.id,c.nombre,false);}).join('');
  }

  function normalizarTitulo(t){
    t=t||{};
    var periodId=texto(t.periodoId||t.periodId);
    var periodLabel=texto(t.periodo||t.periodoLabel||periodId);
    return{
      id:texto(t.envioId||t.id||t._id||t.idRegistro),
      cedula:cedula(t.cedula||t.numeroIdentificacion),
      nombres:texto(t.estudiante||t.nombres||t.Nombres),
      carrera:texto(t.carrera||t.NombreCarrera||t.nombreCarrera),
      periodo:periodLabel,
      periodoId:periodId,
      estado:texto(t.estado||t.estadoFinal||'PENDIENTE_REVISION').toUpperCase(),
      fecha:texto(t.fechaEnvio||t['Fecha envío']||t.fechaServidor),
      titulo1:texto(t.titulo1||t['Título 1']),
      titulo2:texto(t.titulo2||t['Título 2']),
      titulo3:texto(t.titulo3||t['Título 3']),
      preferido:texto(t.preferido||t.tituloPreferidoNumero||t.tituloPreferido),
      raw:t
    };
  }

  function renderTitulos(){
    var filtro=texto($('ad-buscar-titulo')&&$('ad-buscar-titulo').value).toLowerCase();
    var lista=state.titulos.filter(function(t){return !filtro||[t.cedula,t.nombres,t.carrera,t.periodo,t.estado].join(' ').toLowerCase().indexOf(filtro)>=0;});
    var filas=lista.map(function(t){
      var key=t.id||[t.cedula,t.periodoId||t.periodo].join('|');
      return '<tr><td>'+esc(t.cedula)+'</td><td>'+esc(t.nombres)+'</td><td>'+esc(t.carrera)+'</td><td>'+esc(t.periodo)+'</td><td><span class="ad-badge '+(t.estado==='DEVUELTO'?'ad-badge-warning':t.estado==='APROBADO'||t.estado==='REEMPLAZADO'?'ad-badge-success':'ad-badge-info')+'">'+esc(t.estado)+'</span></td><td><button class="ad-btn ad-btn-secondary" type="button" data-action="usar-titulo" data-id="'+esc(key)+'">Usar</button> <button class="ad-btn ad-btn-danger" type="button" data-action="eliminar-titulo" data-id="'+esc(key)+'">Eliminar</button></td></tr>';
    });
    setHtml('ad-tabla-titulos',filas.length?filas.join(''):'<tr><td colspan="6" class="ad-empty">No hay títulos para mostrar.</td></tr>');
    setTexto('ad-kpi-titulos',String(state.titulos.length));
  }

  function buscarTitulo(id){return state.titulos.find(function(t){return (t.id||[t.cedula,t.periodoId||t.periodo].join('|'))===id;})||null;}

  function renderIA(){
    var filas=state.proveedores.map(function(p){return '<tr><td><strong>'+esc(p.nombre||p.id)+'</strong><br><small>'+esc(p.id)+'</small></td><td>'+esc(p.tipo)+'</td><td>'+esc(p.modelo||p.model)+'</td><td><span class="ad-badge '+(p.activo?'ad-badge-success':'ad-badge-warning')+'">'+(p.activo?'Activo':'Inactivo')+'</span></td><td>'+(p.apiKeyConfigurada?'Sí':'No')+'</td><td><button class="ad-btn ad-btn-secondary" type="button" data-action="editar-ia" data-id="'+esc(p.id)+'">Editar</button> <button class="ad-btn '+(p.activo?'ad-btn-danger':'ad-btn-primary')+'" type="button" data-action="toggle-ia" data-id="'+esc(p.id)+'" data-activo="'+(!p.activo)+'">'+(p.activo?'Desactivar':'Activar')+'</button> <button class="ad-btn ad-btn-secondary" type="button" data-action="probar-ia" data-id="'+esc(p.id)+'">Probar</button></td></tr>';});
    setHtml('ad-tabla-ia',filas.length?filas.join(''):'<tr><td colspan="6" class="ad-empty">No hay proveedores IA configurados.</td></tr>');
    setTexto('ad-kpi-ia',String(state.proveedores.filter(function(p){return p.activo;}).length));
  }

  function cargarPeriodos(){return api().listarPeriodos().then(function(r){state.periodos=api().extraerPeriodos(r);state.principal=r.principal||state.periodos.find(function(p){return p.principal;})||state.periodos[0]||null;state.periodoId=state.principal&&String(state.principal.id||state.principal.periodoId)||'';renderPeriodos();return cargarCarreras();});}
  function cargarCarreras(){return api().listarCarreras(state.periodoId).then(function(r){state.carreras=api().extraerCarreras(r);renderCarreras();});}
  function cargarCoordinadores(){return api().listarCoordinadores().then(function(r){state.coordinadores=api().extraerCoordinadores(r);renderCoordinadores();});}
  function cargarTitulos(){return api().listarTitulos({carreras:'',carrera:'',estado:'',periodo:''}).then(function(r){state.titulos=api().extraerTitulos(r).map(normalizarTitulo).filter(function(t){return t.cedula;});renderTitulos();});}
  function cargarIA(){return api().listarIA().then(function(r){state.proveedores=Array.isArray(r.proveedores)?r.proveedores:[];renderIA();});}

  function diagnosticar(){
    busy(true,'Comprobando las dos Firebase...');
    return Promise.allSettled([api().configTitulos(),api().configRequisitos(),api().pingTitulos(),api().pingRequisitos(),api().listarIA()]).then(function(partes){
      var nombres=['Configuración Títulos','Configuración UTET','PING Títulos','PING UTET','Firebase IA'];
      var lineas=partes.map(function(p,i){return nombres[i]+': '+(p.status==='fulfilled'?'OK':'ERROR - '+mensaje(p.reason));});
      setTexto('ad-diagnostico-salida',lineas.join('\n'));
      var titulosOk=partes[0].status==='fulfilled'&&partes[2].status==='fulfilled';
      var requisitosOk=partes[1].status==='fulfilled'&&partes[3].status==='fulfilled';
      var clavesOk=partes[4].status==='fulfilled';
      badge('ad-badge-titulos','Títulos: '+(titulosOk?'activo':'error'),titulosOk?'success':'danger');
      badge('ad-badge-requisitos','UTET: '+(requisitosOk?'activo':'error'),requisitosOk?'success':'danger');
      badge('ad-badge-claves','IA: '+(clavesOk?'activa':'error'),clavesOk?'success':'danger');
    }).finally(function(){busy(false);});
  }

  function refrescarTodo(){
    busy(true,'Cargando Firebase...');
    return Promise.allSettled([cargarPeriodos(),cargarCoordinadores(),cargarTitulos(),cargarIA()]).then(function(partes){
      var errores=partes.filter(function(p){return p.status==='rejected';}).map(function(p){return mensaje(p.reason);});
      estadoBox('ad-estado-general',errores.length?'Carga parcial:\n'+errores.join('\n'):'Datos cargados correctamente desde Firebase.',errores.length?'warning':'success');
      return diagnosticar();
    }).finally(function(){busy(false);});
  }

  function editarCoordinador(id){var c=state.coordinadores.find(function(x){return x.id===id;});if(!c)return;state.coordinadorEdicion=c;$('ad-coordinador-id').value=c.id;$('ad-coordinador-nombre').value=c.nombre;$('ad-coordinador-telegram').value=c.telegram;$('ad-coordinador-carreras').value=c.carreras.join(' | ');mostrarVista('ad-seccion-coordinadores');}
  function guardarCoordinador(event){event.preventDefault();var id=texto($('ad-coordinador-id').value),nombre=texto($('ad-coordinador-nombre').value),telegram=texto($('ad-coordinador-telegram').value),carreras=listaCarreras($('ad-coordinador-carreras').value);if(!nombre){estadoBox('ad-estado-coordinador','Ingresa el nombre del coordinador.','danger');return;}busy(true,'Guardando coordinador...');api().guardarCoordinador({id:id,idRegistro:id,nombre:nombre,coordinador:nombre,telegram:telegram,activo:state.coordinadorEdicion?state.coordinadorEdicion.activo:true,estado:state.coordinadorEdicion&&state.coordinadorEdicion.activo===false?'INACTIVO':'ACTIVO',carreras:carreras,carrerasAsignadas:carreras,origen:'administrador'}).then(function(){estadoBox('ad-estado-coordinador','Coordinador guardado en Firebase Títulos.','success');state.coordinadorEdicion=null;$('ad-form-coordinador').reset();return cargarCoordinadores();}).catch(function(error){estadoBox('ad-estado-coordinador',mensaje(error),'danger');}).finally(function(){busy(false);});}
  function toggleCoordinador(id,activo){var c=state.coordinadores.find(function(x){return x.id===id;});if(!c)return;busy(true,'Actualizando estado...');api().cambiarEstadoCoordinador({id:c.id,idRegistro:c.id,nombre:c.nombre,coordinador:c.nombre,telegram:c.telegram,activo:activo,estado:activo?'ACTIVO':'INACTIVO',carreras:c.carreras,carrerasAsignadas:c.carreras,origen:'administrador'}).then(cargarCoordinadores).catch(function(error){estadoBox('ad-estado-coordinador',mensaje(error),'danger');}).finally(function(){busy(false);});}
  function asignarCarreras(event){event.preventDefault();var id=texto($('ad-asignar-coordinador').value),c=state.coordinadores.find(function(x){return x.id===id;}),carreras=listaCarreras($('ad-asignar-carreras').value);if(!c||!carreras.length){estadoBox('ad-estado-asignacion','Selecciona un coordinador e ingresa al menos una carrera.','danger');return;}busy(true,'Asignando carreras...');api().asignarCarreras({id:c.id,idRegistro:c.id,nombre:c.nombre,coordinador:c.nombre,telegram:c.telegram,activo:c.activo,estado:c.activo?'ACTIVO':'INACTIVO',carreras:carreras,carrerasAsignadas:carreras,origen:'administrador'}).then(function(){estadoBox('ad-estado-asignacion','Carreras guardadas en Firebase Títulos.','success');return cargarCoordinadores();}).catch(function(error){estadoBox('ad-estado-asignacion',mensaje(error),'danger');}).finally(function(){busy(false);});}

  function consultarEstudiante(event){event.preventDefault();var c=cedula($('ad-estudiante-cedula').value),p=texto($('ad-estudiante-periodo').value);if(!c){estadoBox('ad-estudiante-salida','Ingresa una cédula.','danger');return;}busy(true,'Consultando estudiante en Firebase UTET...');api().consultarEstudiante(c,p).then(function(r){var e=r.estudiante||r.registro;if(!r.encontrado||!e){estadoBox('ad-estudiante-salida',r.mensaje||'Estudiante no encontrado.','warning');return;}setTexto('ad-estudiante-salida',JSON.stringify({cedula:e.cedula||e.numeroIdentificacion,nombres:e.Nombres||e.nombres,carrera:e.NombreCarrera||e.carrera,periodo:e.periodoLabel||e.periodoId,celular:e.Celular||e.celular||''},null,2));}).catch(function(error){estadoBox('ad-estudiante-salida',mensaje(error),'danger');}).finally(function(){busy(false);});}

  function usarTitulo(titulo){if(!titulo)return;$('ad-devolver-cedula').value=titulo.cedula;$('ad-devolver-periodo').value=titulo.periodo;mostrarVista('ad-seccion-devolver');}
  function devolverTitulo(event){event.preventDefault();var c=cedula($('ad-devolver-cedula').value),p=texto($('ad-devolver-periodo').value),motivo=texto($('ad-devolver-motivo').value);if(!c||motivo.length<4){estadoBox('ad-estado-devolver','Ingresa la cédula y un motivo de al menos 4 caracteres.','danger');return;}busy(true,'Devolviendo propuestas...');api().consultarTitulo(c,p).then(function(r){var e=r.envio||r.registro;if(!e)throw new Error('No se encontró el envío original.');var favorito=texto(e.tituloPreferidoTexto||e.tituloPreferido||e.preferido||e.titulo1||e['Título 1']);return api().devolverTitulo({cedula:c,numeroIdentificacion:c,periodo:e.periodo||e.periodoLabel||p,estudiante:e.estudiante||e.nombres,carrera:e.carrera||e.NombreCarrera,coordinador:'Administrador',estadoFinal:'DEVUELTO',estado:'DEVUELTO',tituloElegido:favorito,tituloCorregido:'',observacion:motivo,comentario:motivo,comentarioCoordinador:motivo,fechaResolucion:new Date().toISOString(),permitirReenvio:true});}).then(function(){estadoBox('ad-estado-devolver','Propuestas devueltas correctamente en Firebase Títulos.','success');return cargarTitulos();}).catch(function(error){estadoBox('ad-estado-devolver',mensaje(error),'danger');}).finally(function(){busy(false);});}

  function eliminarTitulo(titulo){
    if(!titulo)return;
    var detalle='Estudiante: '+(titulo.nombres||'Sin nombre')+'\nCédula: '+titulo.cedula+'\nCarrera: '+(titulo.carrera||'Sin carrera')+'\nPeríodo: '+(titulo.periodo||titulo.periodoId||'Sin período');
    var confirmado=window.confirm('¿Eliminar definitivamente este registro de titulación?\n\n'+detalle+'\n\nSe eliminarán el envío, sus versiones y sus resoluciones. Esta acción no se puede deshacer.');
    if(!confirmado)return;
    busy(true,'Eliminando registro de titulación...');
    estadoBox('ad-estado-titulos','Eliminando '+titulo.cedula+'...','warning');
    api().eliminarTitulo({envioId:titulo.id,idRegistro:titulo.id,cedula:titulo.cedula,numeroIdentificacion:titulo.cedula,periodo:titulo.periodo,periodoLabel:titulo.periodo,periodoId:titulo.periodoId}).then(function(r){
      estadoBox('ad-estado-titulos',r.mensaje||'Registro eliminado correctamente. El estudiante ya puede volver a enviar sus propuestas.','success');
      return cargarTitulos();
    }).catch(function(error){estadoBox('ad-estado-titulos',mensaje(error),'danger');}).finally(function(){busy(false);});
  }

  function editarIA(id){var p=state.proveedores.find(function(x){return x.id===id;});if(!p)return;state.proveedorEdicion=p;$('ad-ia-id').value=p.id;$('ad-ia-nombre').value=p.nombre||'';$('ad-ia-tipo').value=p.tipo||'openai-compatible';$('ad-ia-endpoint').value='';$('ad-ia-modelo').value=p.modelo||p.model||'';$('ad-ia-credencial').value='';$('ad-ia-prioridad').value=p.prioridad||999;$('ad-ia-activo').checked=p.activo===true;mostrarVista('ad-seccion-ia');}
  function guardarIA(event){event.preventDefault();var proveedor={id:texto($('ad-ia-id').value),nombre:texto($('ad-ia-nombre').value),tipo:texto($('ad-ia-tipo').value),endpoint:texto($('ad-ia-endpoint').value),modelo:texto($('ad-ia-modelo').value),credencial:texto($('ad-ia-credencial').value),prioridad:Number($('ad-ia-prioridad').value||999),activo:$('ad-ia-activo').checked,estado:$('ad-ia-activo').checked?'ACTIVO':'INACTIVO'};if(!proveedor.id){estadoBox('ad-estado-ia','Ingresa el ID del proveedor.','danger');return;}busy(true,'Guardando proveedor IA...');api().guardarIA(proveedor).then(function(){estadoBox('ad-estado-ia','Proveedor guardado en Firebase Títulos.','success');state.proveedorEdicion=null;$('ad-form-ia').reset();return cargarIA();}).catch(function(error){estadoBox('ad-estado-ia',mensaje(error),'danger');}).finally(function(){busy(false);});}
  function toggleIA(id,activo){busy(true,'Actualizando IA...');api().cambiarEstadoIA(id,activo).then(cargarIA).catch(function(error){estadoBox('ad-estado-ia',mensaje(error),'danger');}).finally(function(){busy(false);});}
  function probarIA(id){busy(true,'Probando IA...');api().probarIA(id,'Responde únicamente: conexión correcta.').then(function(r){estadoBox('ad-estado-ia','Proveedor '+id+': '+texto(r.text||'conexión correcta')+' | '+Number(r.latencyMs||0)+' ms','success');return cargarIA();}).catch(function(error){estadoBox('ad-estado-ia',mensaje(error),'danger');}).finally(function(){busy(false);});}

  function enlazar(){
    document.addEventListener('click',function(event){
      var link=event.target.closest('[data-ad-view-target]');
      if(link){event.preventDefault();mostrarVista(link.getAttribute('data-ad-view-target'));return;}
      var b=event.target.closest('[data-action]');
      if(!b)return;
      var a=b.getAttribute('data-action');
      var titulo;
      if(a==='refrescar')refrescarTodo();
      else if(a==='diagnosticar')diagnosticar();
      else if(a==='editar-coordinador')editarCoordinador(b.getAttribute('data-id'));
      else if(a==='toggle-coordinador')toggleCoordinador(b.getAttribute('data-id'),b.getAttribute('data-activo')==='true');
      else if(a==='usar-titulo'){titulo=buscarTitulo(b.getAttribute('data-id'));usarTitulo(titulo);}
      else if(a==='eliminar-titulo'){titulo=buscarTitulo(b.getAttribute('data-id'));eliminarTitulo(titulo);}
      else if(a==='editar-ia')editarIA(b.getAttribute('data-id'));
      else if(a==='toggle-ia')toggleIA(b.getAttribute('data-id'),b.getAttribute('data-activo')==='true');
      else if(a==='probar-ia')probarIA(b.getAttribute('data-id'));
    });
    $('ad-form-coordinador').addEventListener('submit',guardarCoordinador);
    $('ad-form-asignacion').addEventListener('submit',asignarCarreras);
    $('ad-form-estudiante').addEventListener('submit',consultarEstudiante);
    $('ad-form-devolver').addEventListener('submit',devolverTitulo);
    $('ad-form-ia').addEventListener('submit',guardarIA);
    $('ad-buscar-titulo').addEventListener('input',renderTitulos);
    $('ad-periodo-select').addEventListener('change',function(){state.periodoId=texto(this.value);busy(true,'Cargando carreras...');cargarCarreras().catch(function(error){estadoBox('ad-estado-carreras',mensaje(error),'danger');}).finally(function(){busy(false);});});
    $('ad-asignar-coordinador').addEventListener('change',function(){var c=state.coordinadores.find(function(x){return x.id===texto($('ad-asignar-coordinador').value);});$('ad-asignar-carreras').value=c?c.carreras.join(' | '):'';});
  }

  function init(){
    setTexto('ad-badge-version','v'+VERSION);setTexto('ad-footer-version','Versión '+VERSION);
    enlazar();
    var hash=texto(window.location.hash).replace(/^#/,'');mostrarVista(document.getElementById(hash)?hash:'ad-seccion-estado');
    refrescarTodo();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window,document);
