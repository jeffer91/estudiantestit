/* =========================================================
Archivo: ad-reparar.app.js
Ruta: /administrador/ad-js/ad-reparar.app.js
Función:
- Presentar un único módulo de mantenimiento de datos.
- Usar Google Sheets como base principal.
- Conservar Firebase como respaldo secundario.
- Ejecutar únicamente correcciones seguras y respaldadas.
========================================================= */
(function(window,document){
  "use strict";

  var casosSheets=[];
  var casosFirebase=[];
  var conectado=false;

  function cfg(){return window.AD_CONFIG||{};}
  function el(id){return document.getElementById(id);}
  function txt(v){return String(v===null||v===undefined?"":v).trim();}
  function val(id){var x=el(id);return x?txt(x.value):"";}
  function setText(id,v){var x=el(id);if(x)x.textContent=v;}
  function setHtml(id,v){var x=el(id);if(x)x.innerHTML=v;}
  function esc(v){
    return txt(v)
      .replace(/&/g,"&amp;")
      .replace(/</g,"&lt;")
      .replace(/>/g,"&gt;")
      .replace(/"/g,"&quot;")
      .replace(/'/g,"&#039;");
  }
  function detener(ev){
    if(!ev)return;
    ev.preventDefault();
    ev.stopPropagation();
    if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();
  }
  function estado(id,mensaje,tipo){
    var x=el(id);
    if(!x)return;
    x.className="ad-status-box";
    if(tipo==="success")x.classList.add("is-success");
    if(tipo==="warning")x.classList.add("is-warning");
    if(tipo==="error")x.classList.add("is-error");
    x.textContent=mensaje||"";
  }

  function fs(){
    if(!window.ADFirebaseService)throw new Error("ADFirebaseService no está disponible.");
    return window.ADFirebaseService;
  }
  function ts(){
    if(!window.ADTitulosService)throw new Error("ADTitulosService no está disponible.");
    return window.ADTitulosService;
  }
  function firebaseRepair(){
    var servicio=window.ADFirebaseRepairService||window.ADBaseRepairService;
    if(!servicio)throw new Error("El servicio de mantenimiento de Firebase no está disponible.");
    return servicio;
  }
  function sheetsRepair(){
    if(!window.ADSheetsRepairService)throw new Error("El servicio de mantenimiento de Google Sheets todavía no está disponible.");
    return window.ADSheetsRepairService;
  }
  function cols(){return cfg().colecciones||{};}
  function clean(v){return ts().limpiarCedula?ts().limpiarCedula(v):txt(v).replace(/[^0-9A-Za-z]/g,"");}

  function renombrarMenu(){
    var enlace=document.querySelector('[data-ad-view-target="ad-seccion-reparar"]');
    if(enlace){
      enlace.textContent="Mantenimiento de datos";
      enlace.setAttribute("href","#ad-seccion-reparar");
    }
  }

  function htmlMantenimiento(){
    return [
      '<div id="ad-maintenance-root" class="ad-maintenance-root">',
      '  <div class="ad-section-head">',
      '    <div>',
      '      <p class="ad-eyebrow">Control y normalización</p>',
      '      <h3>Mantenimiento de datos</h3>',
      '      <p class="ad-muted">Google Sheets es la base principal. Firebase se conserva como respaldo secundario y tiene herramientas independientes.</p>',
      '    </div>',
      '  </div>',
      '  <div class="ad-repair-source-tabs" role="tablist" aria-label="Fuente de datos">',
      '    <button class="ad-repair-source-tab is-active" id="ad-repair-tab-sheets" type="button" role="tab" aria-selected="true" aria-controls="ad-repair-panel-sheets" data-ad-repair-source="sheets">',
      '      Google Sheets <span class="ad-repair-source-label ad-repair-source-label--primary">Base principal</span>',
      '    </button>',
      '    <button class="ad-repair-source-tab" id="ad-repair-tab-firebase" type="button" role="tab" aria-selected="false" aria-controls="ad-repair-panel-firebase" data-ad-repair-source="firebase">',
      '      Firebase <span class="ad-repair-source-label ad-repair-source-label--backup">Respaldo</span>',
      '    </button>',
      '  </div>',
      '  <section id="ad-repair-panel-sheets" class="ad-repair-source-panel" role="tabpanel" aria-labelledby="ad-repair-tab-sheets">',
      htmlSheets(),
      '  </section>',
      '  <section id="ad-repair-panel-firebase" class="ad-repair-source-panel" role="tabpanel" aria-labelledby="ad-repair-tab-firebase" hidden>',
      '    <div class="ad-repair-warning"><strong>Firebase es un respaldo secundario.</strong> Las acciones de este apartado no modifican la base principal de Google Sheets.</div>',
      '    <div id="ad-firebase-original-content"></div>',
      htmlNormalizadorFirebase(),
      '  </section>',
      '</div>'
    ].join("");
  }

  function htmlSheets(){
    return [
      '<div class="ad-card ad-base-repair-card" id="ad-sheets-repair-card">',
      '  <div class="ad-section-head ad-section-head-compact">',
      '    <div>',
      '      <p class="ad-eyebrow">Normalización segura</p>',
      '      <h3>Registros duplicados e inconsistencias de Google Sheets</h3>',
      '      <p class="ad-muted">Analiza las hojas principales sin modificar información. Solo se habilitan correcciones que Apps Script clasifique como seguras.</p>',
      '    </div>',
      '    <div class="ad-base-repair-actions">',
      '      <button class="ad-btn ad-btn-secondary" id="ad-btn-analizar-sheets" type="button">Analizar Google Sheets</button>',
      '      <button class="ad-btn ad-btn-primary" id="ad-btn-corregir-sheets" type="button" disabled>Corregir seleccionados</button>',
      '    </div>',
      '  </div>',
      '  <div id="ad-sheets-repair-status" class="ad-status-box">Todavía no se han analizado las hojas.</div>',
      '  <div class="ad-table-wrap">',
      '    <table class="ad-table ad-base-repair-table ad-sheets-repair-table">',
      '      <thead><tr><th>Seleccionar</th><th>Hoja</th><th>Fila</th><th>ID del registro</th><th>Cédula</th><th>Período</th><th>Problema</th><th>Corrección propuesta</th><th>Estado</th></tr></thead>',
      '      <tbody id="ad-sheets-repair-body"><tr><td colspan="9" class="ad-empty">Pulsa Analizar Google Sheets para buscar inconsistencias.</td></tr></tbody>',
      '    </table>',
      '  </div>',
      '</div>'
    ].join("");
  }

  function htmlNormalizadorFirebase(){
    return [
      '<div class="ad-card ad-base-repair-card" id="ad-firebase-repair-card">',
      '  <div class="ad-section-head ad-section-head-compact">',
      '    <div>',
      '      <p class="ad-eyebrow">Respaldo secundario</p>',
      '      <h3>Títulos y documentos duplicados en Firebase</h3>',
      '      <p class="ad-muted">Analiza únicamente la colección de respaldo. Los casos ambiguos quedan marcados para revisión manual.</p>',
      '    </div>',
      '    <div class="ad-base-repair-actions">',
      '      <button class="ad-btn ad-btn-secondary" id="ad-btn-analizar-firebase" type="button">Analizar Firebase</button>',
      '      <button class="ad-btn ad-btn-primary" id="ad-btn-corregir-firebase" type="button" disabled>Corregir seleccionados</button>',
      '    </div>',
      '  </div>',
      '  <div id="ad-firebase-repair-status" class="ad-status-box">Todavía no se ha analizado el respaldo de Firebase.</div>',
      '  <div class="ad-table-wrap">',
      '    <table class="ad-table ad-base-repair-table">',
      '      <thead><tr><th>Seleccionar</th><th>Documento</th><th>Cédula</th><th>Período</th><th>Problema</th><th>Corrección propuesta</th><th>Estado</th></tr></thead>',
      '      <tbody id="ad-firebase-repair-body"><tr><td colspan="7" class="ad-empty">Pulsa Analizar Firebase para buscar inconsistencias.</td></tr></tbody>',
      '    </table>',
      '  </div>',
      '</div>'
    ].join("");
  }

  function mostrarFuente(fuente){
    var sheets=fuente!=="firebase";
    var tabSheets=el("ad-repair-tab-sheets");
    var tabFirebase=el("ad-repair-tab-firebase");
    var panelSheets=el("ad-repair-panel-sheets");
    var panelFirebase=el("ad-repair-panel-firebase");

    if(tabSheets){
      tabSheets.classList.toggle("is-active",sheets);
      tabSheets.setAttribute("aria-selected",sheets?"true":"false");
    }
    if(tabFirebase){
      tabFirebase.classList.toggle("is-active",!sheets);
      tabFirebase.setAttribute("aria-selected",!sheets?"true":"false");
    }
    if(panelSheets)panelSheets.hidden=!sheets;
    if(panelFirebase)panelFirebase.hidden=sheets;
  }

  function prepararSeccion(){
    var seccion=el("ad-seccion-reparar");
    var fragmento;
    var originales;
    var destino;
    if(!seccion)return null;
    renombrarMenu();
    seccion.classList.remove("ad-danger-zone");
    if(el("ad-maintenance-root"))return seccion;

    fragmento=document.createDocumentFragment();
    while(seccion.firstChild)fragmento.appendChild(seccion.firstChild);
    seccion.innerHTML=htmlMantenimiento();
    destino=el("ad-firebase-original-content");
    if(destino)destino.appendChild(fragmento);

    originales=destino?destino.querySelectorAll("h2,h3,h4,.ad-eyebrow"):[];
    Array.prototype.forEach.call(originales,function(nodo){
      var contenido=txt(nodo.textContent).toLowerCase();
      if(contenido==="reparar firebase")nodo.textContent="Reparación puntual del respaldo Firebase";
    });

    return seccion;
  }

  function instalarMantenimiento(){
    var seccion=prepararSeccion();
    if(!seccion)return;
    conectarEventos();
    mostrarFuente("sheets");
  }

  function conectarUnaVez(nodo,evento,fn,marca){
    if(!nodo||nodo.getAttribute(marca)==="1")return;
    nodo.setAttribute(marca,"1");
    nodo.addEventListener(evento,fn);
  }

  function conectarEventos(){
    var seccion=el("ad-seccion-reparar");
    if(!seccion)return;

    if(!conectado){
      seccion.addEventListener("click",function(evento){
        var tab=evento.target&&evento.target.closest?evento.target.closest("[data-ad-repair-source]"):null;
        if(tab){
          evento.preventDefault();
          mostrarFuente(tab.getAttribute("data-ad-repair-source"));
        }
      });
      conectado=true;
    }

    conectarUnaVez(el("ad-btn-analizar-sheets"),"click",analizarSheets,"data-ad-connected");
    conectarUnaVez(el("ad-btn-corregir-sheets"),"click",corregirSheets,"data-ad-connected");
    conectarUnaVez(el("ad-sheets-repair-body"),"change",actualizarSeleccionadosSheets,"data-ad-connected");
    conectarUnaVez(el("ad-btn-analizar-firebase"),"click",analizarFirebase,"data-ad-connected");
    conectarUnaVez(el("ad-btn-corregir-firebase"),"click",corregirFirebase,"data-ad-connected");
    conectarUnaVez(el("ad-firebase-repair-body"),"change",actualizarSeleccionadosFirebase,"data-ad-connected");

    conectarUnaVez(el("ad-btn-detectar-reparaciones"),"click",detectar,"data-ad-repair-connected");
    conectarUnaVez(el("ad-btn-reparar-documento"),"click",ejecutar,"data-ad-repair-connected");
  }

  function listaTexto(valor){
    if(Array.isArray(valor))return valor.filter(Boolean).join("; ");
    return txt(valor);
  }

  function renderSheets(resultado){
    var filas=[];
    casosSheets=Array.isArray(resultado&&resultado.casos)?resultado.casos:[];
    casosSheets.forEach(function(caso,indice){
      var seguro=caso&&caso.seguro===true&&resultado.capacidadCorreccion!==false;
      filas.push(
        '<tr class="'+(seguro?'is-safe':'is-manual')+'">'+
          '<td><input class="ad-sheets-case-check" type="checkbox" data-index="'+indice+'" '+(seguro?'':'disabled')+' aria-label="Seleccionar corrección de Google Sheets"></td>'+
          '<td><strong>'+esc(caso.hoja||'Sin hoja')+'</strong></td>'+
          '<td>'+esc(caso.fila||'—')+'</td>'+
          '<td><code>'+esc(caso.idRegistro||caso.id||'Sin ID')+'</code></td>'+
          '<td>'+esc(caso.cedula||'Sin cédula')+'</td>'+
          '<td>'+esc(caso.periodo||'Sin período')+'</td>'+
          '<td>'+esc(listaTexto(caso.problemas))+'</td>'+
          '<td>'+esc(listaTexto(caso.acciones))+'</td>'+
          '<td><span class="ad-badge '+(seguro?'ad-badge-success':'ad-badge-warning')+'">'+(seguro?'Corrección segura':'Revisión manual')+'</span></td>'+
        '</tr>'
      );
    });

    setHtml("ad-sheets-repair-body",filas.length?filas.join(""):'<tr><td colspan="9" class="ad-empty">No se detectaron inconsistencias en las hojas analizadas.</td></tr>');

    var resumen="Hojas analizadas: "+Number(resultado.totalHojas||0)+
      ". Registros analizados: "+Number(resultado.totalRegistros||0)+
      ". Casos detectados: "+Number(resultado.totalCasos||casosSheets.length)+
      ". Seguros: "+Number(resultado.seguros||0)+
      ". Revisión manual: "+Number(resultado.manuales||0)+".";
    if(resultado.mensaje)resumen+=" "+resultado.mensaje;
    estado("ad-sheets-repair-status",resumen,resultado.capacidadCorreccion===false?"warning":"success");
    actualizarSeleccionadosSheets();
  }

  function analizarSheets(){
    var boton=el("ad-btn-analizar-sheets");
    if(boton)boton.disabled=true;
    estado("ad-sheets-repair-status","Analizando Google Sheets sin modificar datos...","");
    setHtml("ad-sheets-repair-body",'<tr><td colspan="9" class="ad-empty">Analizando hojas y registros...</td></tr>');

    return Promise.resolve()
      .then(function(){return sheetsRepair().analizarBase();})
      .then(renderSheets)
      .catch(function(error){
        casosSheets=[];
        estado("ad-sheets-repair-status","No se pudo analizar Google Sheets: "+(error.message||String(error)),"error");
        setHtml("ad-sheets-repair-body",'<tr><td colspan="9" class="ad-empty">Error durante el análisis de Google Sheets.</td></tr>');
        actualizarSeleccionadosSheets();
      })
      .then(function(){if(boton)boton.disabled=false;});
  }

  function indicesSeleccionados(selector,casos){
    return Array.prototype.slice.call(document.querySelectorAll(selector+":checked"))
      .map(function(check){return Number(check.getAttribute("data-index"));})
      .filter(function(indice){return Number.isInteger(indice)&&casos[indice]&&casos[indice].seguro===true;});
  }

  function actualizarSeleccionadosSheets(){
    var total=indicesSeleccionados(".ad-sheets-case-check",casosSheets).length;
    var boton=el("ad-btn-corregir-sheets");
    if(boton){
      boton.disabled=total===0;
      boton.textContent=total?"Corregir seleccionados ("+total+")":"Corregir seleccionados";
    }
  }

  function corregirSheets(){
    var indices=indicesSeleccionados(".ad-sheets-case-check",casosSheets);
    var seleccionados=indices.map(function(indice){return casosSheets[indice];});
    var boton=el("ad-btn-corregir-sheets");
    if(!seleccionados.length)return;
    if(!window.confirm("Apps Script respaldará cada fila antes de aplicar "+seleccionados.length+" corrección(es) en Google Sheets. ¿Continuar?"))return;

    if(boton)boton.disabled=true;
    estado("ad-sheets-repair-status","Respaldando filas y aplicando correcciones seguras...","");
    return sheetsRepair().ejecutarSeleccionados(seleccionados)
      .then(function(resultado){
        estado(
          "ad-sheets-repair-status",
          "Proceso terminado. Correctos: "+resultado.correctos+". Errores: "+resultado.errores+
          ". Los registros procesados fueron respaldados en HistorialReparaciones.",
          resultado.errores?"warning":"success"
        );
        return analizarSheets();
      })
      .catch(function(error){
        estado("ad-sheets-repair-status","No se pudieron aplicar las correcciones: "+(error.message||String(error)),"error");
        actualizarSeleccionadosSheets();
      });
  }

  function renderFirebase(resultado){
    var filas=[];
    casosFirebase=Array.isArray(resultado&&resultado.casos)?resultado.casos:[];
    casosFirebase.forEach(function(caso,indice){
      filas.push(
        '<tr class="'+(caso.seguro?'is-safe':'is-manual')+'">'+
          '<td><input class="ad-firebase-case-check" type="checkbox" data-index="'+indice+'" '+(caso.seguro?'':'disabled')+' aria-label="Seleccionar corrección de Firebase"></td>'+
          '<td><code>'+esc(caso.id)+'</code></td>'+
          '<td>'+esc(caso.cedula||'Sin cédula')+'</td>'+
          '<td>'+esc(caso.periodo||'Sin período')+'</td>'+
          '<td>'+esc(listaTexto(caso.problemas))+'</td>'+
          '<td>'+esc(listaTexto(caso.acciones))+'</td>'+
          '<td><span class="ad-badge '+(caso.seguro?'ad-badge-success':'ad-badge-warning')+'">'+(caso.seguro?'Corrección segura':'Revisión manual')+'</span></td>'+
        '</tr>'
      );
    });
    setHtml("ad-firebase-repair-body",filas.length?filas.join(""):'<tr><td colspan="7" class="ad-empty">No se detectaron inconsistencias en el respaldo de Firebase.</td></tr>');
    estado(
      "ad-firebase-repair-status",
      "Documentos analizados: "+Number(resultado.totalDocumentos||0)+
      ". Casos detectados: "+Number(resultado.totalCasos||casosFirebase.length)+
      ". Seguros: "+Number(resultado.seguros||0)+
      ". Revisión manual: "+Number(resultado.manuales||0)+".",
      "success"
    );
    actualizarSeleccionadosFirebase();
  }

  function analizarFirebase(){
    var boton=el("ad-btn-analizar-firebase");
    if(boton)boton.disabled=true;
    estado("ad-firebase-repair-status","Analizando el respaldo de Firebase sin modificar datos...","");
    setHtml("ad-firebase-repair-body",'<tr><td colspan="7" class="ad-empty">Analizando documentos...</td></tr>');
    return Promise.resolve()
      .then(function(){return firebaseRepair().analizarBase();})
      .then(renderFirebase)
      .catch(function(error){
        casosFirebase=[];
        estado("ad-firebase-repair-status","No se pudo analizar Firebase: "+(error.message||String(error)),"error");
        setHtml("ad-firebase-repair-body",'<tr><td colspan="7" class="ad-empty">Error durante el análisis de Firebase.</td></tr>');
        actualizarSeleccionadosFirebase();
      })
      .then(function(){if(boton)boton.disabled=false;});
  }

  function actualizarSeleccionadosFirebase(){
    var total=indicesSeleccionados(".ad-firebase-case-check",casosFirebase).length;
    var boton=el("ad-btn-corregir-firebase");
    if(boton){
      boton.disabled=total===0;
      boton.textContent=total?"Corregir seleccionados ("+total+")":"Corregir seleccionados";
    }
  }

  function corregirFirebase(){
    var indices=indicesSeleccionados(".ad-firebase-case-check",casosFirebase);
    var seleccionados=indices.map(function(indice){return casosFirebase[indice];});
    var boton=el("ad-btn-corregir-firebase");
    if(!seleccionados.length)return;
    if(!window.confirm("Se respaldará cada documento antes de aplicar "+seleccionados.length+" corrección(es) en Firebase. ¿Continuar?"))return;

    if(boton)boton.disabled=true;
    estado("ad-firebase-repair-status","Respaldando y corrigiendo los documentos seleccionados...","");
    return firebaseRepair().ejecutarSeleccionados(seleccionados)
      .then(function(resultado){
        estado(
          "ad-firebase-repair-status",
          "Proceso terminado. Correctos: "+resultado.correctos+". Errores: "+resultado.errores+
          ". Los documentos procesados fueron respaldados en titulos_historial.",
          resultado.errores?"warning":"success"
        );
        return analizarFirebase();
      })
      .catch(function(error){
        estado("ad-firebase-repair-status","No se pudieron aplicar las correcciones: "+(error.message||String(error)),"error");
        actualizarSeleccionadosFirebase();
      });
  }

  function extraerCedula(docId,data){
    var directo=clean((data||{}).cedula||(data||{}).numeroIdentificacion||"");
    var partes;
    if(directo)return directo;
    partes=txt(docId).split("__");
    return clean(partes[partes.length-1]||docId);
  }

  function historialId(cedula){
    return clean(cedula)+"__REPARACION__"+new Date().toISOString().replace(/[^0-9A-Za-z]/g,"");
  }

  function leerIncorrecto(idViejo){
    var id=txt(idViejo);
    if(!id)return Promise.reject(new Error("Ingresa el ID incorrecto."));
    return fs().leerDocumento(cols().titulos,id).then(function(resp){
      if(!resp.existe)throw new Error("No existe ese documento en titulos.");
      return{id:resp.id,data:resp.data||{}};
    });
  }

  function construirCorrecto(viejo){
    var cedula=extraerCedula(viejo.id,viejo.data);
    if(!cedula)return Promise.reject(new Error("No se pudo extraer la cédula."));
    return ts().buscarEstudiantePorCedula(cedula).then(function(est){
      var nuevo=Object.assign({},viejo.data||{});
      nuevo.cedula=cedula;
      nuevo.numeroIdentificacion=nuevo.numeroIdentificacion||cedula;
      if(est){
        nuevo.NombreCarrera=est.NombreCarrera||nuevo.NombreCarrera||"";
        nuevo.CodigoCarrera=est.CodigoCarrera||nuevo.CodigoCarrera||"";
        nuevo.periodoId=est.periodoId||est.ultimoPeriodoId||nuevo.periodoId||"";
        nuevo.periodoLabel=est.periodoLabel||nuevo.periodoLabel||"";
        nuevo.Nombres=est.Nombres||nuevo.Nombres||nuevo.nombres||"";
      }
      nuevo._reparadoDesde=viejo.id;
      nuevo.reparadoEn=fs().fechaCliente();
      nuevo.reparadoPor=cfg().administrador||"administrador";
      return{cedula:cedula,data:nuevo,estudiante:est||null};
    });
  }

  function logReparacion(idViejo,cedula,hid){
    return fs().agregarDocumento(cols().logs,{
      accion:(cfg().accionesLog||{}).firebaseReparado||"ADMIN_FIREBASE_REPARADO",
      idOriginal:idViejo,
      cedula:cedula,
      historialId:hid,
      administrador:cfg().administrador||"administrador",
      origen:"administrador",
      modulo:"mantenimiento_firebase",
      estado:"OK",
      fecha:fs().fechaCliente()
    }).catch(function(){return{ok:false};});
  }

  function reparar(idViejo){
    return leerIncorrecto(idViejo).then(function(viejo){
      return construirCorrecto(viejo).then(function(nuevo){
        var hid=historialId(nuevo.cedula);
        var respaldo=Object.assign({},viejo.data||{}, {
          _idOriginal:viejo.id,
          accionHistorial:"REPARACION_FIREBASE",
          archivadoEn:fs().fechaCliente(),
          archivadoPor:cfg().administrador||"administrador"
        });
        return fs().guardarDocumento(cols().historial,hid,respaldo,{merge:false})
          .then(function(){return fs().guardarDocumento(cols().titulos,nuevo.cedula,nuevo.data,{merge:true});})
          .then(function(){return logReparacion(viejo.id,nuevo.cedula,hid);})
          .then(function(){return fs().eliminarDocumento(cols().titulos,viejo.id);})
          .then(function(){return{ok:true,idViejo:viejo.id,cedula:nuevo.cedula,historialId:hid};});
      });
    });
  }

  function detectar(ev){
    detener(ev);
    var id=val("ad-reparar-doc-id");
    setText("ad-resultado-reparar","Revisando documento del respaldo...");
    return leerIncorrecto(id)
      .then(function(viejo){
        var ced=extraerCedula(viejo.id,viejo.data);
        setText("ad-resultado-reparar","Documento encontrado en Firebase.\nID actual: "+viejo.id+"\nCédula detectada: "+ced+"\nID correcto esperado: "+ced);
      })
      .catch(function(error){setText("ad-resultado-reparar","Error al detectar:\n"+(error.message||String(error)));});
  }

  function ejecutar(ev){
    detener(ev);
    setText("ad-resultado-reparar","Reparando documento del respaldo...");
    return reparar(val("ad-reparar-doc-id"))
      .then(function(r){
        setText("ad-resultado-reparar","Documento de Firebase reparado correctamente.\nID anterior: "+r.idViejo+"\nID correcto: "+r.cedula+"\nHistorial: "+r.historialId);
        setText("ad-panel-diagnostico","Reparación del respaldo Firebase completada.");
      })
      .catch(function(error){
        setText("ad-resultado-reparar","Error en reparación:\n"+(error.message||String(error)));
        setText("ad-panel-diagnostico","Error en la reparación del respaldo Firebase.");
      });
  }

  function conectar(){
    instalarMantenimiento();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",conectar);
  else conectar();

  window.ADRepararApp={
    instalarMantenimiento:instalarMantenimiento,
    instalarNormalizador:instalarMantenimiento,
    mostrarFuente:mostrarFuente,
    analizarSheets:analizarSheets,
    corregirSheets:corregirSheets,
    analizarFirebase:analizarFirebase,
    corregirFirebase:corregirFirebase,
    detectar:detectar,
    reparar:reparar,
    ejecutar:ejecutar
  };
})(window,document);
