/* Administrador Firebase: UTET consulta; Títulos operación, coordinación, estadísticas e IA. */
(function(window,document){
  'use strict';

  var VERSION='3.2.0';
  var state={
    periodos:[],principal:null,carreras:[],coordinadores:[],titulos:[],proveedores:[],
    periodoId:'',coordinadorEdicion:null,proveedorEdicion:null,tituloActual:null,estadisticas:null
  };

  function api(){if(!window.ADAPIService)throw new Error('ADAPIService no está disponible.');return window.ADAPIService;}
  function $(id){return document.getElementById(id);}
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function esc(v){return texto(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function normal(v){return texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function listaCarreras(v){if(Array.isArray(v))return v.map(texto).filter(Boolean);return texto(v).split(/[,;\n|]+/).map(texto).filter(Boolean);}
  function cedula(v){var d=texto(v).replace(/\D/g,'');return d.length===9?'0'+d:d;}
  function mensaje(error){return error&&error.message?error.message:texto(error)||'Error desconocido.';}
  function setTexto(id,value){var el=$(id);if(el)el.textContent=value;}
  function setHtml(id,value){var el=$(id);if(el)el.innerHTML=value;}
  function estadoBox(id,msg,tipo){var el=$(id);if(!el)return;el.textContent=msg||'';el.className='ad-result-box ad-status-'+(tipo||'info');}
  function badge(id,value,type){var el=$(id);if(!el)return;el.textContent=value;el.className='ad-badge ad-badge-'+type;}
  function busy(active,value){var el=$('ad-loading');if(el){el.hidden=!active;el.textContent=value||'Procesando...';}document.querySelectorAll('button').forEach(function(btn){btn.disabled=active&&btn.getAttribute('data-no-lock')!=='true';});}
  function option(value,label,selected){return '<option value="'+esc(value)+'"'+(selected?' selected':'')+'>'+esc(label)+'</option>';}
  function fecha(value){if(!texto(value))return'-';var d=new Date(value);return Number.isNaN(d.getTime())?texto(value):d.toLocaleString('es-EC',{dateStyle:'medium',timeStyle:'short'});}

  function firmaPeriodo(value){
    var base=normal(value);if(!base)return'';
    var meses={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
    Object.keys(meses).forEach(function(m){base=base.replace(new RegExp('\\b'+m+'\\b','g'),meses[m]);});
    var pares=[],vistos={},match;
    function add(y,m){m=String(Number(m)).padStart(2,'0');var p=y+'-'+m;if(Number(m)>0&&Number(m)<13&&!vistos[p]){vistos[p]=true;pares.push(p);}}
    var ym=/\b(20\d{2})\s+(\d{1,2})\b/g;while((match=ym.exec(base)))add(match[1],match[2]);
    var my=/\b(\d{1,2})\s+(20\d{2})\b/g;while((match=my.exec(base)))add(match[2],match[1]);
    if(pares.length>=2)return pares[0]+'__'+pares[pares.length-1];
    return pares[0]||normal(value);
  }
  function mismoPeriodo(a,b){return Boolean(texto(a)&&texto(b)&&(firmaPeriodo(a)===firmaPeriodo(b)||normal(a)===normal(b)));}
  function etiquetaEstado(value){var e=texto(value).toUpperCase();if(e==='APROBADO')return'Aprobado';if(e==='REEMPLAZADO')return'Aprobado con corrección';if(e==='DEVUELTO')return'Devuelto';return'Pendiente de revisión';}
  function claseEstado(value){var e=texto(value).toUpperCase();if(e==='APROBADO'||e==='REEMPLAZADO')return'ad-badge-success';if(e==='DEVUELTO')return'ad-badge-warning';return'ad-badge-info';}

  function mostrarVista(id){
    document.querySelectorAll('[data-ad-view]').forEach(function(section){section.hidden=section.id!==id;});
    document.querySelectorAll('[data-ad-view-target]').forEach(function(link){var active=link.getAttribute('data-ad-view-target')===id;link.classList.toggle('is-active',active);if(active)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');});
    try{window.location.hash=id;}catch(error){}
    if(id==='ad-seccion-estadisticas'&&!state.estadisticas&&state.periodos.length)cargarEstadisticas();
  }

  function llenarPeriodos(){
    var options=state.periodos.map(function(p){return option(p.id||p.periodoId,p.label||p.periodoLabel||p.id,false);}).join('');
    var principalId=state.principal&&texto(state.principal.id||state.principal.periodoId)||'';
    document.querySelectorAll('[data-periodo-select]').forEach(function(el){
      var anterior=texto(el.value);var todo=el.id==='ad-estadisticas-periodo'?'':'<option value="">Todos</option>';
      el.innerHTML=todo+options;
      if(anterior&&state.periodos.some(function(p){return texto(p.id||p.periodoId)===anterior;}))el.value=anterior;
      else if(el.id==='ad-estadisticas-periodo'||el.id==='ad-filtro-titulo-periodo')el.value=principalId;
    });
  }

  function llenarCarreras(){
    var options=state.carreras.map(function(c){var name=texto(c.NombreCarrera||c.nombreCarrera||c.nombre||c.carrera);return option(name,name,false);}).join('');
    document.querySelectorAll('[data-carrera-select]').forEach(function(el){var anterior=texto(el.value);el.innerHTML='<option value="">Todas</option>'+options;if(anterior)el.value=anterior;});
  }

  function renderPeriodos(){
    var filas=state.periodos.map(function(p){return '<tr><td>'+esc(p.id||p.periodoId)+'</td><td>'+esc(p.label||p.periodoLabel||p.id)+'</td><td><span class="ad-badge ad-badge-success">Firebase</span></td><td>'+(p.principal?'<span class="ad-badge ad-badge-info">Principal</span>':'-')+'</td></tr>';});
    setHtml('ad-tabla-periodos',filas.length?filas.join(''):'<tr><td colspan="4" class="ad-empty">No se encontraron períodos.</td></tr>');
    var select=$('ad-periodo-select');if(select){select.innerHTML=state.periodos.map(function(p){return option(p.id||p.periodoId,p.label||p.periodoLabel||p.id,(p.id||p.periodoId)===state.periodoId);}).join('');}
    llenarPeriodos();
    setTexto('ad-kpi-periodo',state.principal&&state.principal.label||'Sin período');
    setTexto('ad-kpi-periodo-id',state.principal&&state.principal.id||'-');
  }

  function renderCarreras(){
    var filas=state.carreras.map(function(c){var codigo=texto(c.CodigoCarrera||c.codigoCarrera||c.codigo||c.id);var nombre=texto(c.NombreCarrera||c.nombreCarrera||c.nombre||c.carrera);return '<tr><td>'+esc(codigo)+'</td><td>'+esc(nombre)+'</td><td><span class="ad-badge ad-badge-info">Firebase Títulos</span></td></tr>';});
    setHtml('ad-tabla-carreras',filas.length?filas.join(''):'<tr><td colspan="3" class="ad-empty">No se encontraron carreras.</td></tr>');
    setTexto('ad-kpi-carreras',String(state.carreras.length));
    llenarCarreras();
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
    t=t||{};var periodId=texto(t.periodoId||t.periodId);var periodLabel=texto(t.periodo||t.periodoLabel||t.periodoNombre||periodId);var favorito=Number(t.tituloPreferidoNumero||t.preferido||t.tituloPreferido||0);
    return{id:texto(t.envioId||t.id||t._id||t.idRegistro),cedula:cedula(t.cedula||t.numeroIdentificacion),nombres:texto(t.estudiante||t.nombres||t.Nombres),carrera:texto(t.carrera||t.carreraNombre||t.NombreCarrera||t.nombreCarrera),periodo:periodLabel,periodoId:periodId,estado:texto(t.estado||t.estadoFinal||'PENDIENTE_REVISION').toUpperCase(),fecha:texto(t.fechaEnvio||t['Fecha envío']||t.fechaServidor),titulo1:texto(t.titulo1||t['Título 1']),titulo2:texto(t.titulo2||t['Título 2']),titulo3:texto(t.titulo3||t['Título 3']),preferido:favorito,tituloPreferidoTexto:texto(t.tituloPreferidoTexto),tituloFinal:texto(t.tituloFinal||t.tituloAprobado||t.tituloCorregido),coordinador:texto(t.coordinador||t.nombreCoordinador),observacion:texto(t.observacion||t.comentarioCoordinador||t.comentario),fechaResolucion:texto(t.fechaResolucion||t.fechaRevision),raw:t};
  }

  function filtrosTitulo(){return{periodo:texto($('ad-filtro-titulo-periodo')&&$('ad-filtro-titulo-periodo').value),carrera:texto($('ad-filtro-titulo-carrera')&&$('ad-filtro-titulo-carrera').value),estado:texto($('ad-filtro-titulo-estado')&&$('ad-filtro-titulo-estado').value),buscar:normal($('ad-buscar-titulo')&&$('ad-buscar-titulo').value)};}
  function renderTitulos(){
    var f=filtrosTitulo();var lista=state.titulos.filter(function(t){if(f.periodo&&!mismoPeriodo(t.periodoId||t.periodo,f.periodo))return false;if(f.carrera&&normal(t.carrera)!==normal(f.carrera))return false;if(f.estado&&t.estado!==f.estado)return false;if(f.buscar&&normal([t.cedula,t.nombres,t.carrera,t.periodo,t.estado].join(' ')).indexOf(f.buscar)<0)return false;return true;});
    var filas=lista.map(function(t){var key=t.id||[t.cedula,t.periodoId||t.periodo].join('|');return '<tr><td>'+esc(t.cedula)+'</td><td>'+esc(t.nombres)+'</td><td>'+esc(t.carrera)+'</td><td>'+esc(t.periodo)+'</td><td><span class="ad-badge '+claseEstado(t.estado)+'">'+esc(etiquetaEstado(t.estado))+'</span></td><td><div class="ad-icon-actions"><button class="ad-icon-btn" type="button" data-action="detalle-titulo" data-id="'+esc(key)+'" title="Ver detalles" aria-label="Ver detalles">👁️</button><button class="ad-icon-btn ad-icon-btn--danger" type="button" data-action="eliminar-titulo" data-id="'+esc(key)+'" title="Eliminar" aria-label="Eliminar">🗑️</button></div></td></tr>';});
    setHtml('ad-tabla-titulos',filas.length?filas.join(''):'<tr><td colspan="6" class="ad-empty">No hay títulos que coincidan con los filtros.</td></tr>');
    setTexto('ad-kpi-titulos',String(state.titulos.length));
  }
  function buscarTitulo(id){return state.titulos.find(function(t){return (t.id||[t.cedula,t.periodoId||t.periodo].join('|'))===id;})||null;}

  function abrirModal(id){var modal=$(id);if(!modal)return;modal.hidden=false;document.body.classList.add('ad-modal-open');}
  function cerrarModal(id){var modal=$(id);if(modal)modal.hidden=true;if(!document.querySelector('.ad-modal:not([hidden])'))document.body.classList.remove('ad-modal-open');}
  function abrirDetalle(titulo){
    if(!titulo)return;state.tituloActual=titulo;
    setTexto('ad-modal-titulo-nombre',titulo.nombres||'Títulos del estudiante');setTexto('ad-detalle-cedula',titulo.cedula||'-');setTexto('ad-detalle-carrera',titulo.carrera||'-');setTexto('ad-detalle-periodo',titulo.periodo||titulo.periodoId||'-');setTexto('ad-detalle-fecha',fecha(titulo.fecha));setTexto('ad-detalle-titulo1',titulo.titulo1||'-');setTexto('ad-detalle-titulo2',titulo.titulo2||'-');setTexto('ad-detalle-titulo3',titulo.titulo3||'-');
    [1,2,3].forEach(function(n){var article=$('ad-propuesta-'+n);var mark=document.querySelector('[data-favorito="'+n+'"]');var favorite=Number(titulo.preferido)===n;if(article)article.classList.toggle('is-favorite',favorite);if(mark)mark.hidden=!favorite;});
    var reviewed=titulo.estado!=='PENDIENTE_REVISION';setTexto('ad-detalle-estado',etiquetaEstado(titulo.estado));setTexto('ad-detalle-revisado',reviewed?'Sí':'No, todavía está pendiente');setTexto('ad-detalle-coordinador',titulo.coordinador||'-');setTexto('ad-detalle-fecha-resolucion',fecha(titulo.fechaResolucion));setTexto('ad-detalle-titulo-final',titulo.tituloFinal||'-');setTexto('ad-detalle-observacion',titulo.observacion||'-');
    var reason=$('ad-modal-motivo-devolucion');if(reason)reason.value='';estadoBox('ad-modal-estado-titulo','Desde este modal puedes devolver o eliminar el registro.','info');
    var returnButton=document.querySelector('[data-action="devolver-titulo-modal"]');if(returnButton)returnButton.hidden=titulo.estado==='DEVUELTO';var returnBox=$('ad-caja-devolver');if(returnBox)returnBox.hidden=titulo.estado==='DEVUELTO';abrirModal('ad-modal-titulo');
  }

  function renderEstadisticas(){
    var data=state.estadisticas||{};var r=data.resumen||{};setTexto('ad-stat-esperados',String(r.esperados||0));setTexto('ad-stat-enviados',String(r.enviados||0));setTexto('ad-stat-faltan',String(r.faltan||0));setTexto('ad-stat-aprobados',String((r.aprobados||0)+(r.reemplazados||0)));setTexto('ad-stat-avance',String(r.avance||0)+' %');
    var filas=(data.carreras||[]).map(function(item){var approved=(item.aprobados||0)+(item.reemplazados||0);return '<tr><td>'+esc(item.carrera)+'</td><td>'+Number(item.esperados||0)+'</td><td>'+Number(item.enviados||0)+'</td><td><button class="ad-count-btn" type="button" data-action="mostrar-faltantes" data-carrera="'+esc(item.carrera)+'" '+(Number(item.faltan||0)?'':'disabled')+'>'+Number(item.faltan||0)+'</button></td><td>'+Number(item.pendientes||0)+'</td><td>'+approved+'</td><td>'+Number(item.devueltos||0)+'</td><td><div class="ad-progress"><div class="ad-progress__track"><div class="ad-progress__bar" style="width:'+Math.max(0,Math.min(100,Number(item.avance||0)))+'%"></div></div><small>'+Number(item.avance||0)+' %</small></div></td></tr>';});
    setHtml('ad-tabla-estadisticas',filas.length?filas.join(''):'<tr><td colspan="8" class="ad-empty">No hay datos para el período y la carrera seleccionados.</td></tr>');
    estadoBox('ad-estado-estadisticas',data.mensaje||'Estadísticas calculadas correctamente.',(r.esperados||0)?'success':'warning');
  }

  function abrirFaltantes(carrera){
    if(!state.estadisticas)return;var list=(state.estadisticas.faltantes||[]).filter(function(item){return !carrera||normal(item.carrera)===normal(carrera);});
    setTexto('ad-modal-faltantes-titulo',carrera?'Faltantes: '+carrera:'Estudiantes que no han enviado');
    var filas=list.map(function(item){return '<tr><td>'+esc(item.cedula)+'</td><td>'+esc(item.nombres||'Sin nombre')+'</td><td>'+esc(item.carrera||'-')+'</td><td>'+esc(item.celular||'Sin celular')+'</td><td><button class="ad-icon-btn ad-icon-btn--whatsapp" type="button" data-action="whatsapp-faltante" data-cedula="'+esc(item.cedula)+'" title="Enviar recordatorio por WhatsApp" aria-label="Enviar recordatorio por WhatsApp" '+(texto(item.celular)?'':'disabled')+'>💬</button></td></tr>';});
    setHtml('ad-tabla-faltantes',filas.length?filas.join(''):'<tr><td colspan="5" class="ad-empty">No hay estudiantes faltantes para esta selección.</td></tr>');abrirModal('ad-modal-faltantes');
  }

  function whatsapp(cedulaValue){
    var items=state.estadisticas&&state.estadisticas.faltantes||[];var student=items.find(function(item){return item.cedula===cedulaValue;});if(!student)return;
    var phone=texto(student.celular).replace(/\D/g,'');if(phone.indexOf('593')===0){}else if(phone.charAt(0)==='0')phone='593'+phone.slice(1);else if(phone.length===9)phone='593'+phone;
    if(phone.length<11){window.alert('El estudiante no tiene un celular válido registrado en UTET.');return;}
    var period=texto(state.estadisticas.periodo||$('ad-estadisticas-periodo').value);var msg='Estimado/a '+(student.nombres||'estudiante')+', le recordamos que aún no registra sus propuestas de titulación correspondientes al período '+period+'. Por favor, ingrese a la plataforma y complete el envío.';
    window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank','noopener');
  }

  function renderIA(){
    var filas=state.proveedores.map(function(p){return '<tr><td><strong>'+esc(p.nombre||p.id)+'</strong><br><small>'+esc(p.id)+'</small></td><td>'+esc(p.tipo)+'</td><td>'+esc(p.modelo||p.model)+'</td><td><span class="ad-badge '+(p.activo?'ad-badge-success':'ad-badge-warning')+'">'+(p.activo?'Activo':'Inactivo')+'</span></td><td>'+(p.apiKeyConfigurada?'Sí':'No')+'</td><td><button class="ad-btn ad-btn-secondary" type="button" data-action="editar-ia" data-id="'+esc(p.id)+'">Editar</button> <button class="ad-btn '+(p.activo?'ad-btn-danger':'ad-btn-primary')+'" type="button" data-action="toggle-ia" data-id="'+esc(p.id)+'" data-activo="'+(!p.activo)+'">'+(p.activo?'Desactivar':'Activar')+'</button> <button class="ad-btn ad-btn-secondary" type="button" data-action="probar-ia" data-id="'+esc(p.id)+'">Probar</button></td></tr>';});
    setHtml('ad-tabla-ia',filas.length?filas.join(''):'<tr><td colspan="6" class="ad-empty">No hay proveedores IA configurados.</td></tr>');setTexto('ad-kpi-ia',String(state.proveedores.filter(function(p){return p.activo;}).length));
  }

  function cargarPeriodos(){return api().listarPeriodos().then(function(r){state.periodos=api().extraerPeriodos(r);state.principal=r.principal||state.periodos.find(function(p){return p.principal;})||state.periodos[0]||null;state.periodoId=state.principal&&String(state.principal.id||state.principal.periodoId)||'';renderPeriodos();return cargarCarreras();});}
  function cargarCarreras(){return api().listarCarreras(state.periodoId).then(function(r){state.carreras=api().extraerCarreras(r);renderCarreras();});}
  function cargarCoordinadores(){return api().listarCoordinadores().then(function(r){state.coordinadores=api().extraerCoordinadores(r);renderCoordinadores();});}
  function cargarTitulos(){return api().listarTitulos({carreras:'',carrera:'',estado:'',periodo:''}).then(function(r){state.titulos=api().extraerTitulos(r).map(normalizarTitulo).filter(function(t){return t.cedula;});renderTitulos();});}
  function cargarIA(){return api().listarIA().then(function(r){state.proveedores=Array.isArray(r.proveedores)?r.proveedores:[];renderIA();});}
  function cargarEstadisticas(){var p=texto($('ad-estadisticas-periodo')&&$('ad-estadisticas-periodo').value)||state.periodoId;var c=texto($('ad-estadisticas-carrera')&&$('ad-estadisticas-carrera').value);if(!p){estadoBox('ad-estado-estadisticas','Selecciona un período.','warning');return Promise.resolve();}busy(true,'Calculando estadísticas...');return api().obtenerEstadisticas({periodo:p,periodoId:p,carrera:c}).then(function(r){state.estadisticas=r;renderEstadisticas();return r;}).catch(function(error){estadoBox('ad-estado-estadisticas',mensaje(error),'danger');throw error;}).finally(function(){busy(false);});}

  function diagnosticar(){busy(true,'Comprobando las dos Firebase...');return Promise.allSettled([api().configTitulos(),api().configRequisitos(),api().pingTitulos(),api().pingRequisitos(),api().listarIA()]).then(function(partes){var nombres=['Configuración Títulos','Configuración UTET','PING Títulos','PING UTET','Firebase IA'];var lineas=partes.map(function(p,i){return nombres[i]+': '+(p.status==='fulfilled'?'OK':'ERROR - '+mensaje(p.reason));});setTexto('ad-diagnostico-salida',lineas.join('\n'));var titulosOk=partes[0].status==='fulfilled'&&partes[2].status==='fulfilled';var requisitosOk=partes[1].status==='fulfilled'&&partes[3].status==='fulfilled';var clavesOk=partes[4].status==='fulfilled';badge('ad-badge-titulos','Títulos: '+(titulosOk?'activo':'error'),titulosOk?'success':'danger');badge('ad-badge-requisitos','UTET: '+(requisitosOk?'activo':'error'),requisitosOk?'success':'danger');badge('ad-badge-claves','IA: '+(clavesOk?'activa':'error'),clavesOk?'success':'danger');}).finally(function(){busy(false);});}
  function refrescarTodo(){busy(true,'Cargando Firebase...');return Promise.allSettled([cargarPeriodos(),cargarCoordinadores(),cargarTitulos(),cargarIA()]).then(function(partes){var errores=partes.filter(function(p){return p.status==='rejected';}).map(function(p){return mensaje(p.reason);});estadoBox('ad-estado-general',errores.length?'Carga parcial:\n'+errores.join('\n'):'Datos cargados correctamente desde Firebase.',errores.length?'warning':'success');return diagnosticar();}).finally(function(){busy(false);});}

  function editarCoordinador(id){var c=state.coordinadores.find(function(x){return x.id===id;});if(!c)return;state.coordinadorEdicion=c;$('ad-coordinador-id').value=c.id;$('ad-coordinador-nombre').value=c.nombre;$('ad-coordinador-telegram').value=c.telegram;$('ad-coordinador-carreras').value=c.carreras.join(' | ');mostrarVista('ad-seccion-coordinadores');}
  function guardarCoordinador(event){event.preventDefault();var id=texto($('ad-coordinador-id').value),name=texto($('ad-coordinador-nombre').value),telegram=texto($('ad-coordinador-telegram').value),careers=listaCarreras($('ad-coordinador-carreras').value);if(!name){estadoBox('ad-estado-coordinador','Ingresa el nombre del coordinador.','danger');return;}busy(true,'Guardando coordinador...');api().guardarCoordinador({id:id,idRegistro:id,nombre:name,coordinador:name,telegram:telegram,activo:state.coordinadorEdicion?state.coordinadorEdicion.activo:true,estado:state.coordinadorEdicion&&state.coordinadorEdicion.activo===false?'INACTIVO':'ACTIVO',carreras:careers,carrerasAsignadas:careers,origen:'administrador'}).then(function(){estadoBox('ad-estado-coordinador','Coordinador guardado en Firebase Títulos.','success');state.coordinadorEdicion=null;$('ad-form-coordinador').reset();return cargarCoordinadores();}).catch(function(error){estadoBox('ad-estado-coordinador',mensaje(error),'danger');}).finally(function(){busy(false);});}
  function toggleCoordinador(id,activo){var c=state.coordinadores.find(function(x){return x.id===id;});if(!c)return;busy(true,'Actualizando estado...');api().cambiarEstadoCoordinador({id:c.id,idRegistro:c.id,nombre:c.nombre,coordinador:c.nombre,telegram:c.telegram,activo:activo,estado:activo?'ACTIVO':'INACTIVO',carreras:c.carreras,carrerasAsignadas:c.carreras,origen:'administrador'}).then(cargarCoordinadores).catch(function(error){estadoBox('ad-estado-coordinador',mensaje(error),'danger');}).finally(function(){busy(false);});}
  function asignarCarreras(event){event.preventDefault();var id=texto($('ad-asignar-coordinador').value),c=state.coordinadores.find(function(x){return x.id===id;}),careers=listaCarreras($('ad-asignar-carreras').value);if(!c||!careers.length){estadoBox('ad-estado-asignacion','Selecciona un coordinador e ingresa al menos una carrera.','danger');return;}busy(true,'Asignando carreras...');api().asignarCarreras({id:c.id,idRegistro:c.id,nombre:c.nombre,coordinador:c.nombre,telegram:c.telegram,activo:c.activo,estado:c.activo?'ACTIVO':'INACTIVO',carreras:careers,carrerasAsignadas:careers,origen:'administrador'}).then(function(){estadoBox('ad-estado-asignacion','Carreras guardadas en Firebase Títulos.','success');return cargarCoordinadores();}).catch(function(error){estadoBox('ad-estado-asignacion',mensaje(error),'danger');}).finally(function(){busy(false);});}
  function consultarEstudiante(event){event.preventDefault();var c=cedula($('ad-estudiante-cedula').value),p=texto($('ad-estudiante-periodo').value);if(!c){estadoBox('ad-estudiante-salida','Ingresa una cédula.','danger');return;}busy(true,'Consultando estudiante en Firebase UTET...');api().consultarEstudiante(c,p).then(function(r){var e=r.estudiante||r.registro;if(!r.encontrado||!e){estadoBox('ad-estudiante-salida',r.mensaje||'Estudiante no encontrado.','warning');return;}setTexto('ad-estudiante-salida',JSON.stringify({cedula:e.cedula||e.numeroIdentificacion,nombres:e.Nombres||e.nombres,carrera:e.NombreCarrera||e.carrera,periodo:e.periodoLabel||e.periodoId,celular:e.Celular||e.celular||''},null,2));}).catch(function(error){estadoBox('ad-estudiante-salida',mensaje(error),'danger');}).finally(function(){busy(false);});}

  function tituloFavorito(t){var n=Number(t.preferido||0);return n===2?t.titulo2:n===3?t.titulo3:t.titulo1;}
  function devolverTituloActual(){var t=state.tituloActual;if(!t)return;var reason=texto($('ad-modal-motivo-devolucion').value);if(reason.length<4){estadoBox('ad-modal-estado-titulo','Escribe un motivo de al menos 4 caracteres.','danger');return;}busy(true,'Devolviendo propuestas...');api().devolverTitulo({cedula:t.cedula,numeroIdentificacion:t.cedula,periodo:t.periodo,periodoId:t.periodoId,estudiante:t.nombres,nombres:t.nombres,carrera:t.carrera,coordinador:'Administrador',estadoFinal:'DEVUELTO',estado:'DEVUELTO',tituloElegido:tituloFavorito(t),tituloCorregido:'',observacion:reason,comentario:reason,comentarioCoordinador:reason,fechaResolucion:new Date().toISOString(),permitirReenvio:true}).then(function(){estadoBox('ad-estado-titulos','Propuestas devueltas correctamente.','success');cerrarModal('ad-modal-titulo');state.tituloActual=null;return cargarTitulos();}).catch(function(error){estadoBox('ad-modal-estado-titulo',mensaje(error),'danger');}).finally(function(){busy(false);});}
  function eliminarTitulo(titulo,fromModal){if(!titulo)return;var detail='Estudiante: '+(titulo.nombres||'Sin nombre')+'\nCédula: '+titulo.cedula+'\nCarrera: '+(titulo.carrera||'Sin carrera')+'\nPeríodo: '+(titulo.periodo||titulo.periodoId||'Sin período');if(!window.confirm('¿Eliminar definitivamente este registro de titulación?\n\n'+detail+'\n\nSe eliminarán el envío, sus versiones y sus resoluciones.'))return;busy(true,'Eliminando registro...');api().eliminarTitulo({envioId:titulo.id,idRegistro:titulo.id,cedula:titulo.cedula,numeroIdentificacion:titulo.cedula,periodo:titulo.periodo,periodoLabel:titulo.periodo,periodoId:titulo.periodoId}).then(function(r){estadoBox('ad-estado-titulos',r.mensaje||'Registro eliminado correctamente.','success');if(fromModal)cerrarModal('ad-modal-titulo');state.tituloActual=null;return cargarTitulos();}).catch(function(error){estadoBox(fromModal?'ad-modal-estado-titulo':'ad-estado-titulos',mensaje(error),'danger');}).finally(function(){busy(false);});}

  function editarIA(id){var p=state.proveedores.find(function(x){return x.id===id;});if(!p)return;state.proveedorEdicion=p;$('ad-ia-id').value=p.id;$('ad-ia-nombre').value=p.nombre||'';$('ad-ia-tipo').value=p.tipo||'openai-compatible';$('ad-ia-endpoint').value='';$('ad-ia-modelo').value=p.modelo||p.model||'';$('ad-ia-credencial').value='';$('ad-ia-prioridad').value=p.prioridad||999;$('ad-ia-activo').checked=p.activo===true;mostrarVista('ad-seccion-ia');}
  function guardarIA(event){event.preventDefault();var provider={id:texto($('ad-ia-id').value),nombre:texto($('ad-ia-nombre').value),tipo:texto($('ad-ia-tipo').value),endpoint:texto($('ad-ia-endpoint').value),modelo:texto($('ad-ia-modelo').value),credencial:texto($('ad-ia-credencial').value),prioridad:Number($('ad-ia-prioridad').value||999),activo:$('ad-ia-activo').checked,estado:$('ad-ia-activo').checked?'ACTIVO':'INACTIVO'};if(!provider.id){estadoBox('ad-estado-ia','Ingresa el ID del proveedor.','danger');return;}busy(true,'Guardando proveedor IA...');api().guardarIA(provider).then(function(){estadoBox('ad-estado-ia','Proveedor guardado en Firebase Títulos.','success');state.proveedorEdicion=null;$('ad-form-ia').reset();return cargarIA();}).catch(function(error){estadoBox('ad-estado-ia',mensaje(error),'danger');}).finally(function(){busy(false);});}
  function toggleIA(id,activo){busy(true,'Actualizando IA...');api().cambiarEstadoIA(id,activo).then(cargarIA).catch(function(error){estadoBox('ad-estado-ia',mensaje(error),'danger');}).finally(function(){busy(false);});}
  function probarIA(id){busy(true,'Probando IA...');api().probarIA(id,'Responde únicamente: conexión correcta.').then(function(r){estadoBox('ad-estado-ia','Proveedor '+id+': '+texto(r.text||'conexión correcta')+' | '+Number(r.latencyMs||0)+' ms','success');return cargarIA();}).catch(function(error){estadoBox('ad-estado-ia',mensaje(error),'danger');}).finally(function(){busy(false);});}

  function enlazar(){
    document.addEventListener('click',function(event){
      var link=event.target.closest('[data-ad-view-target]');if(link){event.preventDefault();mostrarVista(link.getAttribute('data-ad-view-target'));return;}
      var b=event.target.closest('[data-action]');if(!b)return;var a=b.getAttribute('data-action'),title;
      if(a==='refrescar')refrescarTodo();else if(a==='diagnosticar')diagnosticar();else if(a==='editar-coordinador')editarCoordinador(b.getAttribute('data-id'));else if(a==='toggle-coordinador')toggleCoordinador(b.getAttribute('data-id'),b.getAttribute('data-activo')==='true');else if(a==='detalle-titulo'){title=buscarTitulo(b.getAttribute('data-id'));abrirDetalle(title);}else if(a==='eliminar-titulo'){title=buscarTitulo(b.getAttribute('data-id'));eliminarTitulo(title,false);}else if(a==='cerrar-modal-titulo')cerrarModal('ad-modal-titulo');else if(a==='devolver-titulo-modal')devolverTituloActual();else if(a==='eliminar-titulo-modal')eliminarTitulo(state.tituloActual,true);else if(a==='cargar-estadisticas')cargarEstadisticas();else if(a==='mostrar-faltantes')abrirFaltantes(b.getAttribute('data-carrera'));else if(a==='cerrar-modal-faltantes')cerrarModal('ad-modal-faltantes');else if(a==='whatsapp-faltante')whatsapp(b.getAttribute('data-cedula'));else if(a==='editar-ia')editarIA(b.getAttribute('data-id'));else if(a==='toggle-ia')toggleIA(b.getAttribute('data-id'),b.getAttribute('data-activo')==='true');else if(a==='probar-ia')probarIA(b.getAttribute('data-id'));
    });
    var formCoordinator=$('ad-form-coordinador');if(formCoordinator)formCoordinator.addEventListener('submit',guardarCoordinador);
    var formAssignment=$('ad-form-asignacion');if(formAssignment)formAssignment.addEventListener('submit',asignarCarreras);
    var formStudent=$('ad-form-estudiante');if(formStudent)formStudent.addEventListener('submit',consultarEstudiante);
    var formIa=$('ad-form-ia');if(formIa)formIa.addEventListener('submit',guardarIA);
    ['ad-buscar-titulo','ad-filtro-titulo-periodo','ad-filtro-titulo-carrera','ad-filtro-titulo-estado'].forEach(function(id){var el=$(id);if(el)el.addEventListener(id==='ad-buscar-titulo'?'input':'change',renderTitulos);});
    var periodSelect=$('ad-periodo-select');if(periodSelect)periodSelect.addEventListener('change',function(){state.periodoId=texto(this.value);busy(true,'Cargando carreras...');cargarCarreras().catch(function(error){estadoBox('ad-estado-carreras',mensaje(error),'danger');}).finally(function(){busy(false);});});
    var coordinatorSelect=$('ad-asignar-coordinador');if(coordinatorSelect)coordinatorSelect.addEventListener('change',function(){var c=state.coordinadores.find(function(x){return x.id===texto(coordinatorSelect.value);});$('ad-asignar-carreras').value=c?c.carreras.join(' | '):'';});
    document.addEventListener('keydown',function(event){if(event.key==='Escape'){cerrarModal('ad-modal-titulo');cerrarModal('ad-modal-faltantes');}});
  }

  function init(){setTexto('ad-badge-version','v'+VERSION);setTexto('ad-footer-version','Versión '+VERSION);enlazar();var hash=texto(window.location.hash).replace(/^#/,'');mostrarVista(document.getElementById(hash)?hash:'ad-seccion-estado');refrescarTodo();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window,document);
