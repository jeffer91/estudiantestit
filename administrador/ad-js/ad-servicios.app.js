/* Estado de los servicios Firebase configurados mediante Cloudflare Pages. */
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
      link.textContent='Conexiones Firebase';
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
        '<div class="ad-section-head"><div><p class="ad-eyebrow">Infraestructura</p><h3>Conexiones Firebase</h3><p class="ad-muted">Las credenciales privadas se administran como secretos cifrados de Cloudflare Pages y nunca se escriben desde el navegador.</p></div><button class="ad-btn ad-btn-secondary" type="button" data-action="refrescar-servicios">Actualizar</button></div>'+
        '<div class="ad-card">'+
          '<pre id="ad-estado-servicio" class="ad-result-box">Consultando el estado de las conexiones…</pre>'+
          '<div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Servicio</th><th>Proyecto</th><th>Autenticación</th><th>Acceso</th><th>Estado</th></tr></thead><tbody id="ad-tabla-servicios"><tr><td colspan="5" class="ad-empty">Cargando...</td></tr></tbody></table></div>'+
        '</div>';
      main.insertBefore(section,diagnostico||main.querySelector('.ad-footer'));
    }
  }

  function render(){
    var body=$('ad-tabla-servicios');
    if(!body)return;
    var filas=servicios.map(function(s){
      var activo=s.activo!==false&&texto(s.estado||'ACTIVO').toUpperCase()!=='INACTIVO';
      return '<tr><td><strong>'+esc(s.nombre||s.clave)+'</strong><br><small>'+esc(s.clave||s.id)+'</small></td>'+ 
        '<td>'+esc(s.projectId||texto(s.endpoint).replace('firebase://','')||'-')+'</td>'+ 
        '<td>Cuenta de servicio / IAM</td>'+ 
        '<td>'+(s.soloLectura?'Solo lectura':'Lectura y escritura')+'</td>'+ 
        '<td><span class="ad-badge '+(activo?'ad-badge-success':'ad-badge-warning')+'">'+esc(s.estado||(activo?'ACTIVO':'INACTIVO'))+'</span></td></tr>';
    });
    body.innerHTML=filas.length?filas.join(''):'<tr><td colspan="5" class="ad-empty">No se encontraron conexiones configuradas.</td></tr>';
  }

  function cargar(){
    if(!api())return Promise.reject(new Error('ADAPIService no está disponible.'));
    estado('Comprobando la configuración protegida de Cloudflare…','info');
    return api().listarServicios().then(function(r){
      servicios=api().extraerServicios(r);
      render();
      estado('Las conexiones se administran fuera del navegador mediante secretos cifrados.','success');
      return servicios;
    }).catch(function(error){
      estado(errorTexto(error),'danger');
      throw error;
    });
  }

  function init(){
    asegurarInterfaz();
    document.addEventListener('click',function(event){
      var button=event.target&&event.target.closest?event.target.closest('[data-action]'):null;
      if(button&&button.getAttribute('data-action')==='refrescar-servicios')cargar();
    });
    cargar();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window,document);
