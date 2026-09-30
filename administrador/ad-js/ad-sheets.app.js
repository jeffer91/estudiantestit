/* Diagnóstico visual del backend Firebase de Titulación. */
(function(window,document){
  'use strict';
  var iniciado=false;
  var COORDINADORES_STORAGE_KEY='titulos_coordinadores_catalogo_v1';

  function s(){if(!window.ADSheetsService)throw new Error('Servicio de backend no disponible.');return window.ADSheetsService;}
  function $(id){return document.getElementById(id);}
  function t(v){return String(v==null?'':v).trim();}
  function estado(mensaje,tipo){
    var el=$('ad-sheets-estado');if(!el)return;
    el.className='ad-status-box';
    if(tipo==='success')el.classList.add('is-success');
    if(tipo==='error')el.classList.add('is-error');
    if(tipo==='warning')el.classList.add('is-warning');
    el.textContent=mensaje||'';
  }
  function resultado(nombre,data){
    var el=$('ad-sheets-resultado');if(!el)return;var copia;
    try{copia=JSON.parse(JSON.stringify(data||{}));}catch(e){copia={};}
    el.textContent=nombre+'\n\n'+JSON.stringify(copia,null,2);
  }
  function normalizarCoordinador(item,indice){
    item=item||{};var id=t(item.id||item._docId||item.nombre||('coordinador_'+indice));
    return{id:id,_docId:id,nombre:t(item.nombre||item.Nombre||id),telegram:t(item.telegram||item.Telegram||''),Telegram:t(item.telegram||item.Telegram||''),activo:item.activo!==false,carreras:Array.isArray(item.carreras)?item.carreras.slice():[],carrerasAsignadas:Array.isArray(item.carrerasAsignadas)?item.carrerasAsignadas.slice():[]};
  }
  function guardarCatalogoCoordinadores(lista){
    lista=Array.isArray(lista)?lista.map(normalizarCoordinador).filter(function(item){return item.nombre;}):[];
    if(!lista.length)return false;
    try{window.localStorage.setItem(COORDINADORES_STORAGE_KEY,JSON.stringify({actualizadoEn:new Date().toISOString(),origen:'firebase-functions',total:lista.length,coordinadores:lista}));return true;}catch(error){return false;}
  }
  function compartirCoordinadores(){
    var servicio=window.ADCoordinadoresService;
    if(!servicio||typeof servicio.listarCoordinadores!=='function')return Promise.resolve({ok:false,total:0});
    return servicio.listarCoordinadores(500).then(function(respuesta){
      var lista=respuesta&&respuesta.coordinadores||[];
      return{ok:guardarCatalogoCoordinadores(lista),total:lista.length};
    }).catch(function(error){return{ok:false,total:0,error:error&&error.message||String(error)};});
  }
  function plantilla(){
    return[
      '<div class="ad-section-head"><div><p class="ad-eyebrow">Infraestructura</p><h3>Backend Firebase</h3><p class="ad-muted">Diagnóstico de la conexión central utilizada por Administrador, Coordinadores y Estudiantes.</p></div></div>',
      '<div class="ad-card">',
      '<div class="ad-actions-row ad-sheets-actions">',
      '<button class="ad-btn ad-btn-primary" id="ad-sheets-ping" type="button">Probar conexión</button>',
      '<button class="ad-btn ad-btn-secondary" id="ad-sheets-coordinadores" type="button">Probar Coordinadores</button>',
      '<button class="ad-btn ad-btn-secondary" id="ad-sheets-envios" type="button">Probar envíos</button>',
      '<button class="ad-btn ad-btn-secondary" id="ad-sheets-recargar" type="button">Actualizar</button>',
      '</div>',
      '<div id="ad-sheets-estado" class="ad-status-box">Comprobando backend...</div>',
      '</div>',
      '<div class="ad-card">',
      '<div class="ad-section-head ad-sheets-subhead"><div><p class="ad-eyebrow">Prueba puntual</p><h4>Consultar estudiante</h4><p class="ad-muted">Comprueba un expediente mediante el backend Firebase.</p></div></div>',
      '<div class="ad-sheets-query"><label><span>Cédula</span><input id="ad-sheets-cedula" type="text" inputmode="numeric" placeholder="1004654479"></label><label><span>Período opcional</span><input id="ad-sheets-periodo" type="text"></label><button class="ad-btn ad-btn-primary" id="ad-sheets-consultar" type="button">Consultar</button></div>',
      '<pre id="ad-sheets-resultado" class="ad-sheets-result">Sin prueba ejecutada.</pre>',
      '</div>'
    ].join('');
  }
  function cargar(){
    return Promise.all([s().leerConfiguracion(),compartirCoordinadores()]).then(function(partes){
      var cfg=partes[0]||{},catalogo=partes[1]||{};
      estado(
        cfg.activo!==false
          ? 'Backend Firebase configurado. Catálogo local de Coordinadores: '+(catalogo.ok?catalogo.total+' registro(s)':'no disponible')+'.'
          : 'Backend Firebase no disponible.',
        cfg.activo!==false?'success':'error'
      );
      return cfg;
    });
  }
  function ejecutar(nombre,fn){
    estado('Ejecutando '+nombre+'...','');
    return fn().then(function(r){estado(nombre+' respondió correctamente.','success');resultado(nombre,r);return r;})
      .catch(function(error){estado(nombre+' falló: '+(error.message||String(error)),'error');resultado(nombre,{ok:false,error:error.message||String(error)});});
  }
  function consultar(){return ejecutar('VERIFICAR_ENVIO',function(){return s().consultarCedula(t($('ad-sheets-cedula').value),t($('ad-sheets-periodo').value));});}
  function conectar(){
    $('ad-sheets-ping').addEventListener('click',function(){ejecutar('PING',s().probarPing);});
    $('ad-sheets-coordinadores').addEventListener('click',function(){ejecutar('LISTAR_COORDINADORES',s().probarCoordinadores);});
    $('ad-sheets-envios').addEventListener('click',function(){ejecutar('LISTAR_ENVIOS_POR_CARRERA',s().probarEnvios);});
    $('ad-sheets-recargar').addEventListener('click',cargar);
    $('ad-sheets-consultar').addEventListener('click',consultar);
  }
  function instalar(){
    var seccion=$('ad-seccion-sheets');if(!seccion)return;
    if(!iniciado){seccion.innerHTML=plantilla();conectar();iniciado=true;}
    cargar().catch(function(e){estado(e.message||String(e),'error');});
  }
  window.ADSheetsApp={instalar:instalar,cargar:cargar,compartirCoordinadores:compartirCoordinadores};
  instalar();
})(window,document);
