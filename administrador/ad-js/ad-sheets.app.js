/* Módulo visual de Google Sheets para el administrador. */
(function(window,document){
  'use strict';

  var iniciado=false;
  var COORDINADORES_STORAGE_KEY='titulos_coordinadores_catalogo_v1';

  function s(){if(!window.ADSheetsService)throw new Error('ADSheetsService no disponible.');return window.ADSheetsService;}
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
    if(copia.configuracion)copia.configuracion.token=copia.configuracion.token?'CONFIGURADO':'';
    el.textContent=nombre+'\n\n'+JSON.stringify(copia,null,2);
  }
  function normalizarCoordinador(item,indice){
    item=item||{};
    var id=t(item.id||item._docId||item.nombre||('coordinador_'+indice));
    return {
      id:id,
      _docId:id,
      nombre:t(item.nombre||item.Nombre||id),
      telegram:t(item.telegram||item.Telegram||''),
      Telegram:t(item.telegram||item.Telegram||''),
      activo:item.activo!==false,
      carreras:Array.isArray(item.carreras)?item.carreras.slice():[],
      carrerasAsignadas:Array.isArray(item.carrerasAsignadas)?item.carrerasAsignadas.slice():[]
    };
  }
  function guardarCatalogoCoordinadores(lista){
    lista=Array.isArray(lista)?lista.map(normalizarCoordinador).filter(function(item){return item.nombre;}):[];
    if(!lista.length)return false;
    try{
      window.localStorage.setItem(COORDINADORES_STORAGE_KEY,JSON.stringify({
        actualizadoEn:new Date().toISOString(),
        origen:'administrador',
        total:lista.length,
        coordinadores:lista
      }));
      return true;
    }catch(error){return false;}
  }
  function compartirCoordinadores(){
    var servicio=window.ADCoordinadoresService;
    if(!servicio||typeof servicio.listarCoordinadores!=='function')return Promise.resolve({ok:false,total:0});
    return servicio.listarCoordinadores(500).then(function(respuesta){
      var lista=respuesta&&respuesta.coordinadores||[];
      var guardado=guardarCatalogoCoordinadores(lista);
      return {ok:guardado,total:lista.length};
    }).catch(function(error){
      return {ok:false,total:0,error:error&&error.message||String(error)};
    });
  }
  function plantilla(){
    return [
      '<div class="ad-section-head"><div><p class="ad-eyebrow">Base principal</p><h3>Google Sheets</h3><p class="ad-muted">Configura Apps Script directamente para Administrador y Coordinadores, sin depender de la cuota de Firebase.</p></div></div>',
      '<div class="ad-card">',
      '<div class="ad-sheets-grid">',
      '<label class="ad-sheets-full"><span>URL de Apps Script</span><input id="ad-sheets-url" type="url" placeholder="https://script.google.com/macros/s/.../exec"></label>',
      '<label><span>Clave de conexión</span><input id="ad-sheets-token" type="password" placeholder="Vacío conserva la actual"><small id="ad-sheets-token-ayuda">Sin clave guardada</small></label>',
      '<label><span>Tiempo máximo (ms)</span><input id="ad-sheets-timeout" type="number" min="5000" step="1000" value="45000"></label>',
      '<label class="ad-sheets-check"><input id="ad-sheets-activo" type="checkbox" checked><span>Conexión activa</span></label>',
      '</div>',
      '<div class="ad-actions-row ad-sheets-actions">',
      '<button class="ad-btn ad-btn-primary" id="ad-sheets-guardar" type="button">Guardar</button>',
      '<button class="ad-btn ad-btn-secondary" id="ad-sheets-importar" type="button">Importar configuración anterior</button>',
      '<button class="ad-btn ad-btn-secondary" id="ad-sheets-ping" type="button">Probar PING</button>',
      '<button class="ad-btn ad-btn-secondary" id="ad-sheets-coordinadores" type="button">Probar Coordinadores</button>',
      '<button class="ad-btn ad-btn-secondary" id="ad-sheets-envios" type="button">Probar Envios</button>',
      '</div>',
      '<div id="ad-sheets-estado" class="ad-status-box">Leyendo configuración...</div>',
      '</div>',
      '<div class="ad-card">',
      '<div class="ad-section-head ad-sheets-subhead"><div><p class="ad-eyebrow">Prueba puntual</p><h4>Consultar estudiante</h4><p class="ad-muted">Verifica que Envios devuelva la columna Preferido.</p></div></div>',
      '<div class="ad-sheets-query"><label><span>Cédula</span><input id="ad-sheets-cedula" type="text" inputmode="numeric" placeholder="1004654479"></label><label><span>Período opcional</span><input id="ad-sheets-periodo" type="text"></label><button class="ad-btn ad-btn-primary" id="ad-sheets-consultar" type="button">Consultar</button></div>',
      '<pre id="ad-sheets-resultado" class="ad-sheets-result">Sin prueba ejecutada.</pre>',
      '</div>'
    ].join('');
  }
  function cargar(){
    return Promise.all([s().leerConfiguracion(),compartirCoordinadores()]).then(function(partes){
      var cfg=partes[0]||{};var catalogo=partes[1]||{};
      $('ad-sheets-url').value=cfg.endpoint||'';
      $('ad-sheets-timeout').value=cfg.timeoutMs||45000;
      $('ad-sheets-activo').checked=cfg.activo!==false;
      $('ad-sheets-token').value='';
      $('ad-sheets-token-ayuda').textContent=cfg.token?'Clave guardada':'Sin clave guardada';
      if(cfg.endpoint){
        estado('Configuración lista. Catálogo compartido con Coordinadores: '+(catalogo.ok?catalogo.total+' registro(s)':'no disponible')+'.',catalogo.ok?'success':'warning');
      }else{
        estado('Falta la URL publicada de Apps Script.','warning');
      }
      return cfg;
    });
  }
  function guardar(){
    return s().leerConfiguracion({importarFirebase:false}).then(function(actual){
      return s().guardarConfiguracion({
        endpoint:t($('ad-sheets-url').value),
        token:t($('ad-sheets-token').value)||actual.token||'',
        activo:$('ad-sheets-activo').checked,
        timeoutMs:Number($('ad-sheets-timeout').value||45000)
      });
    }).then(function(){estado('Configuración guardada. Coordinadores la leerá directamente.','success');return cargar();})
      .catch(function(error){estado(error.message||String(error),'error');});
  }
  function ejecutar(nombre,fn){
    estado('Ejecutando '+nombre+'...','');
    return fn().then(function(r){estado(nombre+' respondió correctamente.','success');resultado(nombre,r);return r;})
      .catch(function(error){estado(nombre+' falló: '+(error.message||String(error)),'error');resultado(nombre,{ok:false,error:error.message||String(error)});});
  }
  function consultar(){return ejecutar('VERIFICAR_ENVIO',function(){return s().consultarCedula(t($('ad-sheets-cedula').value),t($('ad-sheets-periodo').value));});}
  function conectar(){
    $('ad-sheets-guardar').addEventListener('click',guardar);
    $('ad-sheets-importar').addEventListener('click',function(){s().importarDesdeFirebase().then(cargar).then(function(){estado('Configuración anterior importada.','success');}).catch(function(e){estado(e.message||String(e),'error');});});
    $('ad-sheets-ping').addEventListener('click',function(){ejecutar('PING',s().probarPing);});
    $('ad-sheets-coordinadores').addEventListener('click',function(){ejecutar('LISTAR_COORDINADORES',s().probarCoordinadores);});
    $('ad-sheets-envios').addEventListener('click',function(){ejecutar('LISTAR_ENVIOS_POR_CARRERA',s().probarEnvios);});
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
