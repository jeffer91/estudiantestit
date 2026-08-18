/* Versión y estabilidad visual del Administrador.
 * Este archivo es la única autoridad de versión visible.
 * No implementa correo ni lógica de negocio para evitar controladores duplicados.
 */
(function(window,document){
  'use strict';

  var VERSION='3.5.0';
  var scheduled=false;

  function text(value){
    return String(value===null||value===undefined?'':value).trim();
  }

  function normal(value){
    return text(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function validEmail(value){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value));
  }

  function updateVersion(){
    var badge=document.getElementById('ad-badge-version');
    var footer=document.getElementById('ad-footer-version');
    if(badge&&badge.textContent!=='v'+VERSION)badge.textContent='v'+VERSION;
    if(footer&&footer.textContent!=='Versión '+VERSION)footer.textContent='Versión '+VERSION;
    document.documentElement.setAttribute('data-ad-version',VERSION);
    window.AD_ADMIN_VERSION=VERSION;
  }

  function friendlyTechnicalError(value){
    var source=text(value);
    var key=source.toLowerCase();

    if(
      key.indexOf('too many subrequests')>=0 ||
      key.indexOf('subrequest')>=0 && key.indexOf('limit')>=0
    ){
      return 'No se pudo cargar la lista completa porque la consulta superó el límite temporal del servidor. Actualiza nuevamente; si persiste, revisa el diagnóstico.';
    }

    if(
      key.indexOf('resource_exhausted')>=0 ||
      key.indexOf('quota')>=0 ||
      key.indexOf('429')>=0
    ){
      return 'El servicio alcanzó temporalmente su límite de consultas. Espera unos segundos y vuelve a actualizar.';
    }

    if(key.indexOf('failed to fetch')>=0||key.indexOf('networkerror')>=0){
      return 'No se pudo conectar con el servidor. Verifica la conexión e intenta actualizar nuevamente.';
    }

    return source;
  }

  function titleStatus(){
    return document.getElementById('ad-v2-title-status');
  }

  function selectedPeriod(){
    var select=document.getElementById('ad-v2-title-period');
    return select?text(select.value):'';
  }

  function selectedCareer(){
    var select=document.getElementById('ad-v2-title-career');
    return select?text(select.value):'';
  }

  function globalAvailable(){
    var status=titleStatus();
    var data=window.ADAdminGlobalLast;

    if(!status||!data||!Array.isArray(data.registros))return false;
    if(status.classList.contains('ad-status-danger')||status.classList.contains('ad-status-error'))return false;

    var selected=selectedPeriod();
    if(selected&&text(data.periodoId)&&text(data.periodoId)!==selected)return false;

    return status.classList.contains('ad-status-success');
  }

  function syncTitleStatus(){
    var status=titleStatus();
    if(!status)return;

    var isError=
      status.classList.contains('ad-status-danger')||
      status.classList.contains('ad-status-error');

    if(isError){
      window.ADAdminGlobalReady=false;
      var original=text(status.getAttribute('data-technical-error')||status.textContent);
      var friendly=friendlyTechnicalError(original);
      if(friendly!==original){
        status.setAttribute('data-technical-error',original);
        status.title=original;
        status.textContent=friendly;
      }
      return;
    }

    if(globalAvailable()){
      window.ADAdminGlobalReady=true;
      status.removeAttribute('data-technical-error');
      status.removeAttribute('title');
    }
  }

  function missingStudents(){
    if(!globalAvailable())return null;

    var data=window.ADAdminGlobalLast||{};
    var career=selectedCareer();

    return (data.registros||[]).filter(function(item){
      if(text(item&&item.estado).toUpperCase()!=='NO_ENVIADO')return false;
      if(career&&normal(item&&item.carrera)!==normal(career))return false;
      return true;
    });
  }

  function syncMissingMailButton(){
    var button=document.getElementById('ad-correo-masivo-btn');
    if(!button)return;

    var students=missingStudents();
    if(students===null){
      var pendingLabel='✉️ Correo a faltantes (—)';
      if(button.textContent!==pendingLabel)button.textContent=pendingLabel;
      button.disabled=true;
      button.title='La lista de estudiantes todavía no está disponible.';
      return;
    }

    var validCount=0;
    students.forEach(function(student){
      var institutional=text(student&&student.correoInstitucional).toLowerCase();
      var personal=text(student&&student.correoPersonal).toLowerCase();
      if(validEmail(institutional)||validEmail(personal))validCount+=1;
    });

    var label='✉️ Correo a faltantes ('+students.length+')';
    if(button.textContent!==label)button.textContent=label;
    button.disabled=!students.length||!validCount;
    button.title=!students.length
      ?'No hay estudiantes con estado No enviado en esta selección.'
      :!validCount
        ?'Los estudiantes faltantes no tienen correos válidos.'
        :'Preparar recordatorio para '+students.length+' estudiantes faltantes.';
  }

  function sync(){
    scheduled=false;
    updateVersion();
    syncTitleStatus();
    syncMissingMailButton();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    window.setTimeout(sync,0);
  }

  function install(){
    updateVersion();
    sync();

    var observer=new MutationObserver(schedule);
    observer.observe(document.documentElement,{
      childList:true,
      subtree:true,
      characterData:true,
      attributes:true,
      attributeFilter:['class','hidden','disabled']
    });

    document.addEventListener('change',function(event){
      if(event.target&&[
        'ad-v2-title-period',
        'ad-v2-title-career',
        'ad-v2-title-state'
      ].indexOf(event.target.id)>=0)schedule();
    },true);

    window.addEventListener('load',schedule,{once:true});
    [100,250,500,1000,2000,4000,7000].forEach(function(delay){
      window.setTimeout(schedule,delay);
    });
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',install,{once:true});
  }else{
    install();
  }
})(window,document);
