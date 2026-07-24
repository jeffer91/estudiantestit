/* Reporte PDF sanitizado de Firebase Títulos. */
(function(window,document){
  'use strict';

  var VERSION='3.3.2';
  var JS_PDF='https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
  var AUTO_TABLE='https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js';

  function $(id){return document.getElementById(id);}
  function texto(value){return String(value===null||value===undefined?'':value).trim();}
  function esc(value){return texto(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function scalar(value){
    if(value===null||value===undefined)return'';
    if(Array.isArray(value))return value.map(scalar).join(' | ');
    if(typeof value==='object'){
      try{return JSON.stringify(value);}catch(error){return'[Objeto]';}
    }
    return texto(value);
  }
  function date(value){var parsed=new Date(value);return Number.isNaN(parsed.getTime())?texto(value):parsed.toLocaleString('es-EC');}
  function setStatus(message,type){var box=$('ad-estado-servicio');if(!box)return;box.textContent=message||'';box.className='ad-result-box ad-status-'+(type||'info');}
  function busy(active,message){var overlay=$('ad-loading');if(overlay){overlay.hidden=!active;overlay.textContent=message||'Procesando...';}}

  function updateVersion(){
    var badge=$('ad-badge-version');
    var footer=$('ad-footer-version');
    if(badge)badge.textContent='v'+VERSION;
    if(footer)footer.textContent='Versión '+VERSION;
  }

  function loadScript(src,attribute){
    return new Promise(function(resolve,reject){
      var existing=document.querySelector('script['+attribute+'="true"]');
      if(existing){
        if(existing.getAttribute('data-loaded')==='true')return resolve();
        existing.addEventListener('load',function(){resolve();},{once:true});
        existing.addEventListener('error',function(){reject(new Error('No se pudo cargar la librería PDF.'));},{once:true});
        return;
      }
      var script=document.createElement('script');
      script.src=src;
      script.async=true;
      script.setAttribute(attribute,'true');
      script.onload=function(){script.setAttribute('data-loaded','true');resolve();};
      script.onerror=function(){reject(new Error('No se pudo cargar la librería PDF.'));};
      document.head.appendChild(script);
    });
  }

  function ensurePdf(){
    var ready=window.jspdf&&window.jspdf.jsPDF;
    var first=ready?Promise.resolve():loadScript(JS_PDF,'data-jspdf');
    return first.then(function(){
      var sample=window.jspdf&&window.jspdf.jsPDF;
      if(!sample)throw new Error('jsPDF no está disponible.');
      var doc=new sample();
      if(typeof doc.autoTable==='function')return;
      return loadScript(AUTO_TABLE,'data-jspdf-autotable');
    });
  }

  function addTitle(doc,title,subtitle){
    doc.setFont('helvetica','bold');
    doc.setFontSize(18);
    doc.text(title,14,16);
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.text(subtitle,14,23);
  }

  function addSection(doc,title,columns,rows){
    if(!rows||!rows.length)return;
    var y=doc.lastAutoTable&&doc.lastAutoTable.finalY?doc.lastAutoTable.finalY+9:32;
    if(y>185){doc.addPage('a4','landscape');y=18;}
    doc.setFont('helvetica','bold');
    doc.setFontSize(11);
    doc.text(title,14,y);
    doc.autoTable({
      startY:y+3,
      head:[columns.map(function(column){return column.label;})],
      body:rows.map(function(row){return columns.map(function(column){return scalar(row[column.key]);});}),
      theme:'grid',
      margin:{left:14,right:14},
      styles:{font:'helvetica',fontSize:6.2,cellPadding:1.4,overflow:'linebreak',valign:'top'},
      headStyles:{fillColor:[20,70,118],textColor:255,fontStyle:'bold'},
      alternateRowStyles:{fillColor:[246,249,253]},
      rowPageBreak:'avoid',
      showHead:'everyPage'
    });
  }

  function genericRows(rows){
    return (rows||[]).map(function(row){
      var id=texto(row.id||row._id||row._docId);
      var copy={};
      Object.keys(row||{}).forEach(function(key){if(key!=='id'&&key!=='_id'&&key!=='_docId')copy[key]=row[key];});
      return{id:id,datos:JSON.stringify(copy)};
    });
  }

  function generatePdf(data){
    var jsPDF=window.jspdf.jsPDF;
    var doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
    addTitle(doc,'Reporte de Firebase Títulos','Proyecto: '+texto(data.proyecto||'titulos-ec2fa')+' | Generado: '+date(data.generadoEn));
    doc.setFontSize(8);
    doc.text(texto(data.nota||'Las credenciales y secretos se encuentran ocultos.'),14,28);

    addSection(doc,'Resumen de colecciones',[
      {key:'coleccion',label:'Colección'},
      {key:'documentos',label:'Documentos'}
    ],data.resumen||[]);

    var collections=data.colecciones||{};
    addSection(doc,'Períodos',[
      {key:'id',label:'ID'},
      {key:'nombre',label:'Período'},
      {key:'activo',label:'Activo'},
      {key:'principal',label:'Principal'},
      {key:'actualizadoEn',label:'Actualizado'}
    ],collections.periodos||[]);

    addSection(doc,'Carreras',[
      {key:'codigo',label:'Código'},
      {key:'nombre',label:'Carrera'},
      {key:'coordinadorNombre',label:'Coordinador'},
      {key:'activo',label:'Activa'}
    ],collections.carreras||[]);

    addSection(doc,'Coordinadores',[
      {key:'nombre',label:'Coordinador'},
      {key:'telegram',label:'Telegram'},
      {key:'estado',label:'Estado'},
      {key:'carrerasNombres',label:'Carreras'}
    ],collections.coordinadores||[]);

    addSection(doc,'Envíos de títulos',[
      {key:'cedula',label:'Cédula'},
      {key:'nombres',label:'Estudiante'},
      {key:'carreraNombre',label:'Carrera'},
      {key:'periodoNombre',label:'Período'},
      {key:'estado',label:'Estado'},
      {key:'titulo1',label:'Título 1'},
      {key:'titulo2',label:'Título 2'},
      {key:'titulo3',label:'Título 3'},
      {key:'tituloPreferidoNumero',label:'Favorito'},
      {key:'tituloFinal',label:'Título final'},
      {key:'coordinador',label:'Coordinador'},
      {key:'fechaEnvio',label:'Fecha envío'},
      {key:'fechaResolucion',label:'Fecha resolución'}
    ],collections.envios||[]);

    addSection(doc,'Versiones de los envíos',[
      {key:'envioId',label:'Envío'},
      {key:'numeroVersion',label:'Versión'},
      {key:'titulo1',label:'Título 1'},
      {key:'titulo2',label:'Título 2'},
      {key:'titulo3',label:'Título 3'},
      {key:'tituloPreferidoNumero',label:'Favorito'},
      {key:'estado',label:'Estado'},
      {key:'fechaEnvio',label:'Fecha'}
    ],collections.versiones_envio||[]);

    addSection(doc,'Resoluciones',[
      {key:'envioId',label:'Envío'},
      {key:'numeroResolucion',label:'N.º'},
      {key:'coordinador',label:'Coordinador'},
      {key:'estado',label:'Estado'},
      {key:'tituloElegido',label:'Título elegido'},
      {key:'tituloCorregido',label:'Título corregido'},
      {key:'observacion',label:'Observación'},
      {key:'fechaResolucion',label:'Fecha'}
    ],collections.resoluciones||[]);

    ['ia','servicios','configuracion','migraciones'].forEach(function(name){
      addSection(doc,'Colección: '+name,[
        {key:'id',label:'Documento'},
        {key:'datos',label:'Datos sanitizados'}
      ],genericRows(collections[name]||[]));
    });

    var pages=doc.getNumberOfPages();
    for(var page=1;page<=pages;page+=1){
      doc.setPage(page);
      doc.setFontSize(7);
      doc.text('Firebase Títulos - Página '+page+' de '+pages,280,203,{align:'right'});
    }
    var filename='Firebase_Titulos_'+new Date().toISOString().slice(0,10)+'.pdf';
    doc.save(filename);
  }

  function printable(data){
    var win=window.open('','_blank');
    if(!win)throw new Error('El navegador bloqueó la ventana del reporte.');
    var collections=data.colecciones||{};
    function table(title,rows){
      return '<h2>'+esc(title)+'</h2><pre>'+esc(JSON.stringify(rows||[],null,2))+'</pre>';
    }
    win.document.write('<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Reporte Firebase Títulos</title><style>body{font-family:Arial,sans-serif;margin:28px;color:#132b49}h1{margin-bottom:4px}h2{margin-top:28px;border-bottom:1px solid #ccd8e8;padding-bottom:6px}pre{white-space:pre-wrap;font-size:10px;background:#f5f8fc;padding:12px;border:1px solid #dbe5f1}@media print{button{display:none}}</style></head><body><button onclick="window.print()">Guardar como PDF</button><h1>Reporte de Firebase Títulos</h1><p>Proyecto: '+esc(data.proyecto)+'</p><p>Generado: '+esc(date(data.generadoEn))+'</p>'+table('Resumen',data.resumen)+Object.keys(collections).map(function(name){return table(name,collections[name]);}).join('')+'<script>setTimeout(function(){window.print();},500);<\/script></body></html>');
    win.document.close();
  }

  function exportPdf(){
    if(!window.ADAPIService||typeof window.ADAPIService.exportarFirebaseTitulos!=='function'){
      setStatus('El servicio de exportación PDF todavía no está disponible.','danger');
      return;
    }
    busy(true,'Leyendo Firebase Títulos y preparando el PDF...');
    setStatus('Leyendo las colecciones de Firebase Títulos...','info');
    window.ADAPIService.exportarFirebaseTitulos().then(function(data){
      return ensurePdf().then(function(){generatePdf(data);}).catch(function(){printable(data);});
    }).then(function(){
      setStatus('Reporte de Firebase Títulos generado correctamente. Las claves privadas se ocultaron.','success');
    }).catch(function(error){
      setStatus(error&&error.message?error.message:'No se pudo generar el PDF.','danger');
    }).finally(function(){busy(false);});
  }

  function installButton(){
    var section=$('ad-seccion-servicios');
    if(!section)return false;
    var head=section.querySelector('.ad-section-head');
    if(!head||head.querySelector('[data-action="generar-pdf-firebase"]'))return true;
    var button=document.createElement('button');
    button.className='ad-btn ad-btn-primary';
    button.type='button';
    button.setAttribute('data-action','generar-pdf-firebase');
    button.textContent='Generar PDF Firebase Títulos';
    var current=head.querySelector('button');
    if(current){
      var wrapper=document.createElement('div');
      wrapper.style.display='flex';
      wrapper.style.gap='10px';
      current.parentNode.insertBefore(wrapper,current);
      wrapper.appendChild(current);
      wrapper.appendChild(button);
    }else head.appendChild(button);
    return true;
  }

  function init(){
    updateVersion();
    document.addEventListener('click',function(event){
      var button=event.target&&event.target.closest?event.target.closest('[data-action="generar-pdf-firebase"]'):null;
      if(button)exportPdf();
    });
    var attempts=0;
    var timer=setInterval(function(){
      updateVersion();
      attempts+=1;
      if(installButton()||attempts>30)clearInterval(timer);
    },200);
    setTimeout(updateVersion,1200);
    setTimeout(updateVersion,3000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window,document);
