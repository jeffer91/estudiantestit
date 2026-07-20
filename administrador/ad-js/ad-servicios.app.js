/* Gestión administrativa de los servicios almacenados en la hoja Claves. */
(function(window,document){
  'use strict';

  var servicios=[];
  function api(){return window.ADAPIService||null;}
  function $(id){return document.getElementById(id);}
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function esc(v){return texto(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function errorTexto(error){return error&&error.message?error.message:texto(error)||'Error desconocido.';}
  function estado(mensaje,tipo){var el=$('ad-estado-servicio');if(!el)return;el.textContent=mensaje||'';el.className='ad-result-box ad-status-'+(tipo||'info');}
  function render(){
    var body=$('ad-tabla-servicios');
    if(!body)return;
    var filas=servicios.map(function(s){
      return '<tr><td><strong>'+esc(s.nombre||s.clave)+'</strong><br><small>'+esc(s.clave)+'</small></td>'+ 
        '<td>'+esc(s.endpoint||'No configurado')+'</td>'+ 
        '<td>'+(s.secretoConfigurado?'Sí':'No')+'</td>'+ 
        '<td>'+esc(s.spreadsheetId||'-')+'</td>'+ 
        '<td><span class="ad-badge '+(s.activo?'ad-badge-success':'ad-badge-warning')+'">'+esc(s.estado||'INACTIVO')+'</span></td>'+ 
        '<td><button type="button" class="ad-btn ad-btn-secondary" data-action="editar-servicio" data-id="'+esc(s.clave)+'">Editar</button> '+
        '<button type="button" class="ad-btn '+(s.activo?'ad-btn-danger':'ad-btn-primary')+'" data-action="toggle-servicio" data-id="'+esc(s.clave)+'" data-activo="'+(!s.activo)+'">'+(s.activo?'Desactivar':'Activar')+'</button></td></tr>';
    });
    body.innerHTML=filas.length?filas.join(''):'<tr><td colspan="6" class="ad-empty">No hay servicios configurados en Claves.</td></tr>';
  }
  function cargar(){
    if(!api())return Promise.reject(new Error('ADAPIService no está disponible.'));
    return api().listarServicios().then(function(r){servicios=api().extraerServicios(r);render();return servicios;}).catch(function(error){estado(errorTexto(error),'danger');throw error;});
  }
  function editar(id){
    var s=servicios.find(function(item){return texto(item.clave).toUpperCase()===texto(id).toUpperCase();});
    if(!s)return;
    $('ad-servicio-clave').value=s.clave||'';
    $('ad-servicio-nombre').value=s.nombre||'';
    $('ad-servicio-endpoint').value=s.endpoint||'';
    $('ad-servicio-secreto').value='';
    $('ad-servicio-spreadsheet').value=s.spreadsheetId||'';
    $('ad-servicio-timeout').value=Number(s.timeoutMs||45000);
    $('ad-servicio-version').value=s.version||'';
    $('ad-servicio-mensaje').value=s.mensaje||'';
    $('ad-servicio-activo').checked=s.activo===true;
    try{window.location.hash='ad-seccion-servicios';}catch(error){}
  }
  function guardar(event){
    event.preventDefault();
    var datos={
      clave:texto($('ad-servicio-clave').value).toUpperCase(),
      nombre:texto($('ad-servicio-nombre').value),
      endpoint:texto($('ad-servicio-endpoint').value),
      secreto:texto($('ad-servicio-secreto').value),
      spreadsheetId:texto($('ad-servicio-spreadsheet').value),
      timeoutMs:Number($('ad-servicio-timeout').value||45000),
      version:texto($('ad-servicio-version').value),
      mensaje:texto($('ad-servicio-mensaje').value),
      activo:$('ad-servicio-activo').checked,
      estado:$('ad-servicio-activo').checked?'ACTIVO':'INACTIVO'
    };
    if(!datos.clave||!datos.nombre){estado('La clave y el nombre son obligatorios.','danger');return;}
    estado('Guardando en Claves...','info');
    api().guardarServicio(datos).then(function(){estado('Servicio guardado correctamente en Claves.','success');$('ad-servicio-secreto').value='';return cargar();}).catch(function(error){estado(errorTexto(error),'danger');});
  }
  function toggle(id,activo){
    var s=servicios.find(function(item){return texto(item.clave).toUpperCase()===texto(id).toUpperCase();});
    if(!s)return;
    api().guardarServicio({
      clave:s.clave,
      nombre:s.nombre,
      endpoint:s.endpoint,
      spreadsheetId:s.spreadsheetId,
      timeoutMs:s.timeoutMs,
      version:s.version,
      mensaje:s.mensaje,
      activo:activo,
      estado:activo?'ACTIVO':'INACTIVO'
    }).then(cargar).catch(function(error){estado(errorTexto(error),'danger');});
  }
  function init(){
    var form=$('ad-form-servicio');
    if(!form)return;
    form.addEventListener('submit',guardar);
    document.addEventListener('click',function(event){
      var button=event.target&&event.target.closest?event.target.closest('[data-action]'):null;
      if(!button)return;
      var action=button.getAttribute('data-action');
      if(action==='editar-servicio')editar(button.getAttribute('data-id'));
      else if(action==='toggle-servicio')toggle(button.getAttribute('data-id'),button.getAttribute('data-activo')==='true');
      else if(action==='refrescar-servicios')cargar();
    });
    cargar();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window,document);
