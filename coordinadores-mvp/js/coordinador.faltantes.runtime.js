/*
  Carga automática de la población del período para Coordinadores.
  Inyecta el período actual en la consulta y actualiza la lista al cambiarlo.
*/
(function(window,document){
  'use strict';

  var instalado=false;
  var ultimaFirma='';
  var temporizador=null;

  function texto(value){return String(value===null||value===undefined?'':value).trim();}
  function state(){return window.CoordinadorMVPState||null;}
  function app(){return window.CoordinadorMVPApp||null;}

  function periodoActual(){
    var current=state()&&state().obtenerPeriodoActual?state().obtenerPeriodoActual():null;
    return current&&texto(current.id||current.label)?current:null;
  }

  function instalarPeriodoEnServicio(){
    var original=window.CoordinadorMVPSheetsPrimary;
    if(!original||original.__periodoAutomaticoInstalado)return false;
    if(typeof original.listarEnvios!=='function')return false;
    var servicio=Object.assign({},original);
    var listarOriginal=original.listarEnvios;
    servicio.listarEnvios=function(options){
      options=Object.assign({},options||{});
      var current=periodoActual();
      var period=texto(options.periodo||options.periodoId||options.periodoLabel||current&&(current.id||current.label));
      options.periodo=period;
      options.periodoId=period;
      options.periodoLabel=current&&texto(current.label)||period;
      return listarOriginal.call(original,options);
    };
    servicio.__periodoAutomaticoInstalado=true;
    window.CoordinadorMVPSheetsPrimary=servicio;
    return true;
  }

  function cargar(forzar){
    instalarPeriodoEnServicio();
    var current=periodoActual();
    if(!current||!app()||typeof app().cargarTitulos!=='function')return;
    var firma=texto(current.id||current.label);
    if(!forzar&&firma===ultimaFirma)return;
    ultimaFirma=firma;
    window.clearTimeout(temporizador);
    temporizador=window.setTimeout(function(){app().cargarTitulos(forzar===true);},30);
  }

  function estilos(){
    if(document.getElementById('coordinador-faltantes-style'))return;
    var style=document.createElement('style');
    style.id='coordinador-faltantes-style';
    style.textContent=''+
      '.state-pill.state-missing{background:#fff2d8;color:#9a5a00;border-color:#f2d19c}'+
      '.row-no-action{display:inline-flex;align-items:center;min-height:34px;padding:0 12px;border-radius:10px;background:#f3f6fa;color:#64748b;font-weight:700}'+
      '.tabs{flex-wrap:wrap}';
    document.head.appendChild(style);
  }

  function instalar(){
    if(instalado)return true;
    if(!state()||!app())return false;
    instalado=true;
    estilos();
    instalarPeriodoEnServicio();
    if(typeof state().escuchar==='function'){
      state().escuchar(function(tipo,snapshot){
        if((tipo==='periodos'||tipo==='periodo')&&snapshot&&snapshot.periodoActual)cargar(tipo==='periodo');
      });
    }
    var select=document.getElementById('periodoSelect');
    if(select)select.addEventListener('change',function(){window.setTimeout(function(){cargar(true);},20);});
    window.setTimeout(function(){cargar(true);},150);
    return true;
  }

  if(!instalar()){
    var intentos=0;
    var timer=window.setInterval(function(){intentos+=1;if(instalar()||intentos>40)window.clearInterval(timer);},100);
  }

  window.CoordinadorMVPFaltantesRuntime=Object.freeze({instalar:instalar,cargar:cargar});
})(window,document);
