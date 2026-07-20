/* Gestión administrativa de endpoints, tokens y estados almacenados en Claves. */
(function(window,document){
  'use strict';

  var servicios=[];
  function api(){return window.ADAPIService||null;}
  function $(id){return document.getElementById(id);}
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function esc(v){return texto(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function errorTexto(error){return error&&error.message?error.message:texto(error)||'Error desconocido.';}
  function estado(mensaje,tipo){var el=$('ad-estado-servicio');if(!el)return;el.textContent=mensaje||'';el.className='ad-result-box ad-status-'+(tipo||'info');}

  function asegurarInterfaz(){
    if($('ad-seccion-servicios'))return;
    var nav=document.querySelector('.ad-nav');
    var main=document.querySelector('.ad-main');
    var diagnostico=$('ad-seccion-diagnostico');
    if(nav){
      var link=document.createElement('a');
      link.href='#ad-seccion-servicios';
      link.setAttribute('data-ad-view-target','ad-seccion-servicios');
      link.textContent='Servicios y tokens';
      var iaLink=nav.querySelector('[data-ad-view-target="ad-seccion-ia"]');
      nav.insertBefore(link,iaLink||null);
    }
    if(main){
      var section=document.createElement('section');
      section.id='ad-seccion-servicios';
      section.className='ad-view';
      section.setAttribute('data-ad-view','');
      section.hidden=true;
      section.innerHTML=''+
        '<div class="ad-section-head"><div><p class="ad-eyebrow">Claves</p><h3>Servicios, endpoints y tokens</h3><p class="ad-muted">Configura RESPALDO TITULOS APP y REQUISITOS_BDLOCAL_SYNC. El token existente se conserva cuando el campo queda vacío.</p></div><button class="ad-btn ad-btn-secondary" type="button" data-action="refrescar-servicios">Actualizar</button></div>'+
        '<div class="ad-card">'+
          '<form id="ad-form-servicio" class="ad-form-grid ad-form-grid-4">'+
            '<label><span>Clave</span><select id="ad-servicio-clave"><option value="TITULOS">TITULOS</option><option value="REQUISITOS">REQUISITOS</option></select></label>'+
            '<label><span>Nombre</span><input id="ad-servicio-nombre" required /></label>'+
            '<label><span>Estado</span><label class="ad-check"><input id="ad-servicio-activo" type="checkbox" /><span>Servicio activo</span></label></label>'+
            '<label><span>Timeout ms</span><input id="ad-servicio-timeout" type="number" min="5000" max="60000" value="45000" /></label>'+
            '<label class="ad-form-span"><span>URL /exec del Apps Script</span><input id="ad-servicio-endpoint" placeholder="https://script.google.com/macros/s/.../exec" /></label>'+
            '<label><span>Token / secreto</span><input id="ad-servicio-secreto" type="password" autocomplete="new-password" placeholder="Vacío conserva el actual" /></label>'+
            '<label><span>ID de Google Sheets</span><input id="ad-servicio-spreadsheet" placeholder="Opcional" /></label>'+
            '<label><span>Versión</span><input id="ad-servicio-version" /></label>'+
            '<label><span>Mensaje</span><input id="ad-servicio-mensaje" /></label>'+
            '<button class="ad-btn ad-btn-primary" type="submit">Guardar en Claves</button>'+
          '</form>'+
          '<pre id="ad-estado-servicio" class="ad-result-box">Los secretos no se muestran después de guardarlos.</pre>'+
          '<div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Servicio</th><th>Endpoint</th><th>Token</th><th>Google Sheets</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="ad-tabla-servicios"><tr><td colspan="6" class="ad-empty">Cargando...</td></tr></tbody></table></div>'+
        '</div>';
      main.insertBefore(section,diagnostico||main.querySelector('.ad-footer'));
    }
  }

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
    var link=document.querySelector('[data-ad-view-target="ad-seccion-servicios"]');
    if(link)link.click();
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
    api().guardarServicio({clave:s.clave,nombre:s.nombre,endpoint:s.endpoint,spreadsheetId:s.spreadsheetId,timeoutMs:s.timeoutMs,version:s.version,mensaje:s.mensaje,activo:activo,estado:activo?'ACTIVO':'INACTIVO'}).then(cargar).catch(function(error){estado(errorTexto(error),'danger');});
  }
  function init(){
    asegurarInterfaz();
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
