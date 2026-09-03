/* Tablero operativo de estadísticas v3.1.
 * - Todos los períodos: activos + históricos con pendientes/devueltos.
 * - Responsable: asignación ACTUAL de carrera -> coordinador.
 * - Devueltos: solo estado actual DEVUELTO.
 * - Tipo: Todos / Artículo académico / Trabajo de Titulación.
 * - La actualización recarga catálogo de períodos, carreras y coordinadores.
 */
(function(window, document){
  'use strict';

  var ALL='__TODOS__';
  var iniciado=false;
  var cargando=false;
  var catalogo={periodos:[],carreras:[],coordinadores:[]};
  var ultimo=null;

  function api(){return window.ADAPIService||null;}
  function $(id){return document.getElementById(id);}
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function esc(v){return texto(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function normal(v){return texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
  function pct(v){return Number(v||0).toFixed(1).replace('.',',')+' %';}
  function num(v){return v===null||v===undefined?'—':String(Number(v||0));}
  function option(value,label){return '<option value="'+esc(value)+'">'+esc(label)+'</option>';}
  function coordinadorActivo(c){return Boolean(c&&c.activo!==false&&texto(c.estado||'ACTIVO').toUpperCase()!=='INACTIVO');}
  function estado(msg,tipo){var el=$('ad-v3-stat-status');if(!el)return;el.textContent=msg||'';el.className='ad-result-box ad-status-'+(tipo||'info');}
  function busy(active){cargando=active;var b=$('ad-v3-stat-refresh');if(b)b.disabled=active;}

  function estilos(){
    if($('ad-v3-stat-styles'))return;
    var style=document.createElement('style');
    style.id='ad-v3-stat-styles';
    style.textContent=''+
      '.ad-v3-filters{display:grid;grid-template-columns:1.15fr 1.15fr 1.15fr 1fr auto;gap:12px;align-items:end;margin-bottom:14px}.ad-v3-filters label{display:grid;gap:7px;font-weight:700}'+
      '.ad-v3-kpis{display:grid;grid-template-columns:repeat(8,minmax(0,1fr));gap:12px;margin:16px 0}.ad-v3-kpi{background:#f7f9fc;border:1px solid #dce6f2;border-radius:16px;padding:14px}.ad-v3-kpi span{display:block;color:#5b7190;font-size:.78rem;text-transform:uppercase;letter-spacing:.03em}.ad-v3-kpi strong{display:block;font-size:1.75rem;margin-top:6px}'+
      '.ad-v3-section{margin-top:18px}.ad-v3-section h4{margin:0 0 10px}.ad-v3-alert{margin:14px 0;padding:12px 14px;border:1px solid #e1b96a;background:#fff9e8;border-radius:13px}.ad-v3-alert[hidden]{display:none}'+
      '.ad-v3-chip{display:inline-flex;align-items:center;padding:4px 8px;border-radius:999px;background:#eef5ff;border:1px solid #d7e5f7;font-size:.8rem}.ad-v3-muted{color:#60728b;font-size:.88rem}.ad-v3-danger{font-weight:800;color:#9b2c2c}.ad-v3-good{font-weight:800;color:#246b42}'+
      '@media(max-width:1180px){.ad-v3-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}.ad-v3-filters{grid-template-columns:1fr 1fr 1fr}}@media(max-width:720px){.ad-v3-kpis{grid-template-columns:1fr 1fr}.ad-v3-filters{grid-template-columns:1fr}}';
    document.head.appendChild(style);
  }

  function interfaz(){
    var section=$('ad-seccion-estadisticas');
    if(!section)return false;
    section.innerHTML=''+
      '<div class="ad-section-head"><div><p class="ad-eyebrow">Control operativo</p><h3>Estadísticas y pendientes</h3><p class="ad-muted">Identifica qué falta, qué coordinador debe actuar y en qué carreras se concentra el trabajo.</p></div></div>'+
      '<div class="ad-card">'+
        '<div class="ad-v3-filters">'+
          '<label><span>Período</span><select id="ad-v3-stat-period"></select></label>'+
          '<label><span>Carrera</span><select id="ad-v3-stat-career"><option value="">Todas</option></select></label>'+
          '<label><span>Coordinador responsable</span><select id="ad-v3-stat-coordinator"><option value="">Todos</option></select></label>'+
          '<label><span>Tipo</span><select id="ad-v3-stat-type"><option value="">Todos</option><option value="ARTICULO_ACADEMICO">Artículo académico</option><option value="TRABAJO_TITULACION">Trabajo de Titulación</option></select></label>'+
          '<button id="ad-v3-stat-refresh" class="ad-btn ad-btn-primary" type="button">Actualizar</button>'+
        '</div>'+
        '<pre id="ad-v3-stat-status" class="ad-result-box">Cargando filtros...</pre>'+
        '<div id="ad-v3-stat-type-note" class="ad-v3-alert" hidden></div>'+
        '<div class="ad-v3-kpis">'+
          '<article class="ad-v3-kpi"><span>Esperados</span><strong id="ad-v3-expected">0</strong></article>'+
          '<article class="ad-v3-kpi"><span>Enviados</span><strong id="ad-v3-sent">0</strong></article>'+
          '<article class="ad-v3-kpi"><span>No enviaron</span><strong id="ad-v3-missing">0</strong></article>'+
          '<article class="ad-v3-kpi"><span>Por revisar</span><strong id="ad-v3-pending">0</strong></article>'+
          '<article class="ad-v3-kpi"><span>Devueltos</span><strong id="ad-v3-returned">0</strong></article>'+
          '<article class="ad-v3-kpi"><span>Aprobados</span><strong id="ad-v3-approved">0</strong></article>'+
          '<article class="ad-v3-kpi"><span>Revisados</span><strong id="ad-v3-reviewed">0</strong></article>'+
          '<article class="ad-v3-kpi"><span>% revisión</span><strong id="ad-v3-review">0 %</strong></article>'+
        '</div>'+
        '<div id="ad-v3-unassigned" class="ad-v3-alert" hidden></div>'+
        '<section class="ad-v3-section"><h4>Trabajo pendiente por coordinador</h4><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Coordinador</th><th>Carreras</th><th>Esperados</th><th>Enviados</th><th>Por revisar</th><th>Devueltos</th><th>Revisados</th><th>% revisión</th><th>Más antiguo</th></tr></thead><tbody id="ad-v3-coordinators"></tbody></table></div></section>'+
        '<section class="ad-v3-section"><h4>Detalle por carrera</h4><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Carrera</th><th>Coordinador</th><th>Esperados</th><th>Enviados</th><th>No enviaron</th><th>Por revisar</th><th>Devueltos</th><th>Aprobados</th><th>% revisión</th></tr></thead><tbody id="ad-v3-careers"></tbody></table></div></section>'+
        '<section class="ad-v3-section"><h4>Resumen por período</h4><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Período</th><th>Estado</th><th>Esperados</th><th>Enviados</th><th>No enviaron</th><th>Por revisar</th><th>Devueltos</th><th>Aprobados</th><th>% revisión</th></tr></thead><tbody id="ad-v3-periods"></tbody></table></div></section>'+
        '<section class="ad-v3-section"><h4>Pendientes de revisión más antiguos</h4><p class="ad-v3-muted">Muestra primero los envíos que más tiempo llevan esperando al coordinador.</p><div class="ad-table-wrap"><table class="ad-table"><thead><tr><th>Estudiante</th><th>Carrera</th><th>Coordinador</th><th>Período</th><th>Enviado</th><th>Espera</th></tr></thead><tbody id="ad-v3-oldest"></tbody></table></div></section>'+
      '</div>';
    return true;
  }

  function valoresActuales(){
    return{
      periodo:texto($('ad-v3-stat-period')&&$('ad-v3-stat-period').value),
      carrera:texto($('ad-v3-stat-career')&&$('ad-v3-stat-career').value),
      coordinador:texto($('ad-v3-stat-coordinator')&&$('ad-v3-stat-coordinator').value),
      tipo:texto($('ad-v3-stat-type')&&$('ad-v3-stat-type').value)
    };
  }

  function renderFiltros(prev){
    prev=prev||{};
    var p=$('ad-v3-stat-period'),c=$('ad-v3-stat-career'),co=$('ad-v3-stat-coordinator'),t=$('ad-v3-stat-type');
    var periodIds=catalogo.periodos.map(function(x){return texto(x.id||x.periodoId);});
    var careerNames=catalogo.carreras.map(function(x){return texto(x.nombre||x.nombreCarrera||x.id);}).filter(Boolean);
    var coordinatorIds=catalogo.coordinadores.map(function(x){return texto(x.id||x.coordinadorId);}).filter(Boolean);

    if(p){
      p.innerHTML=option(ALL,'Todos: activos + históricos pendientes')+catalogo.periodos.map(function(item){
        return option(item.id||item.periodoId,(item.label||item.periodoLabel||item.id)+(item.activo?'':' · Inactivo'));
      }).join('');
      p.value=prev.periodo===ALL||periodIds.indexOf(prev.periodo)>=0?prev.periodo:ALL;
    }
    if(c){
      c.innerHTML='<option value="">Todas</option>'+careerNames.sort(function(a,b){return a.localeCompare(b,'es');}).map(function(name){return option(name,name);}).join('');
      c.value=careerNames.indexOf(prev.carrera)>=0?prev.carrera:'';
    }
    if(co){
      co.innerHTML='<option value="">Todos</option>'+catalogo.coordinadores.map(function(item){
        var id=texto(item.id||item.coordinadorId);
        var name=texto(item.nombre||item.coordinador||id);
        if(!coordinadorActivo(item))name+=' · Inactivo';
        return option(id,name);
      }).join('');
      co.value=coordinatorIds.indexOf(prev.coordinador)>=0?prev.coordinador:'';
    }
    if(t&&['','ARTICULO_ACADEMICO','TRABAJO_TITULACION'].indexOf(prev.tipo)>=0)t.value=prev.tipo||'';
  }

  function cargarCatalogos(){
    var prev=valoresActuales();
    return Promise.all([api().listarPeriodosAdmin(),api().listarCarrerasAdmin(),api().listarCoordinadores()]).then(function(res){
      catalogo.periodos=res[0].periodos||res[0].registros||[];
      catalogo.carreras=res[1].carreras||res[1].registros||[];
      /* No se excluyen inactivos: una carrera puede seguir asignada a uno y
         debe aparecer como alerta operativa, no desaparecer del tablero. */
      catalogo.coordinadores=res[2].coordinadores||res[2].registros||[];
      renderFiltros(prev);
      return catalogo;
    });
  }

  function filtros(){
    return{
      periodoId:texto($('ad-v3-stat-period')&&$('ad-v3-stat-period').value)||ALL,
      carrera:texto($('ad-v3-stat-career')&&$('ad-v3-stat-career').value),
      coordinadorId:texto($('ad-v3-stat-coordinator')&&$('ad-v3-stat-coordinator').value),
      tipoTrabajo:texto($('ad-v3-stat-type')&&$('ad-v3-stat-type').value)
    };
  }

  function formatFecha(value){if(!texto(value))return'—';var d=new Date(value);return Number.isNaN(d.getTime())?esc(value):d.toLocaleDateString('es-EC',{day:'2-digit',month:'short',year:'numeric'});}
  function espera(value){return value===null||value===undefined?'—':Number(value)+' día'+(Number(value)===1?'':'s');}
  function porcentaje(value,total){return total?Number(((Number(value||0)/Number(total))*100).toFixed(1)):0;}
  function diasDesde(value){if(!texto(value))return null;var d=new Date(value);if(Number.isNaN(d.getTime()))return null;return Math.max(0,Math.floor((Date.now()-d.getTime())/86400000));}
  function tipoNormal(value){var t=texto(value).toUpperCase().replace(/[^A-Z0-9]+/g,'_');if(!t||t==='TODOS')return'';if(t.indexOf('TRABAJO')>=0&&t.indexOf('TITUL')>=0)return'TRABAJO_TITULACION';if(t.indexOf('ARTICULO')>=0)return'ARTICULO_ACADEMICO';return t;}

  function asignacion(item){
    var code=normal(item&&item.codigoCarrera);
    var name=normal(item&&item.carrera);
    var found=null;
    catalogo.carreras.some(function(c){
      var ccode=normal(c.codigo||c.codigoCarrera||c.id);
      var cname=normal(c.nombre||c.nombreCarrera);
      if((code&&ccode===code)||(name&&cname===name)){found=c;return true;}
      return false;
    });
    var coordinatorId=texto(found&&found.coordinadorId);
    var coordinatorName=texto(found&&found.coordinadorNombre);
    var coordinator=coordinatorId?catalogo.coordinadores.find(function(c){
      return texto(c.id||c.coordinadorId)===coordinatorId;
    }):null;
    if(coordinator&&!coordinatorName)coordinatorName=texto(coordinator.nombre||coordinator.coordinador);
    return{
      coordinadorId:coordinatorId,
      coordinador:coordinatorName||coordinatorId||'Sin asignar',
      coordinadorEncontrado:Boolean(coordinator),
      coordinadorActivo:Boolean(coordinator&&coordinadorActivo(coordinator)),
      carrera:texto(found&&(found.nombre||found.nombreCarrera))||texto(item&&item.carrera)||'SIN CARRERA'
    };
  }

  function cargarPeriodo(period){
    return api().obtenerEstadisticas({periodoId:period.id||period.periodoId,periodo:period.id||period.periodoId}).then(function(result){
      return{ok:true,period:period,result:result};
    }).catch(function(error){
      return{ok:false,period:period,error:error&&error.message?error.message:String(error)};
    });
  }

  function mapLimit(items,limit,worker){
    var out=new Array(items.length),cursor=0;
    function run(){
      function next(){
        if(cursor>=items.length)return Promise.resolve();
        var i=cursor++;
        return Promise.resolve(worker(items[i],i)).then(function(v){out[i]=v;}).then(next);
      }
      return next();
    }
    var workers=[];
    for(var i=0;i<Math.min(limit,items.length);i++)workers.push(run());
    return Promise.all(workers).then(function(){return out;});
  }

  function baseBucket(){
    return{esperados:0,enviados:0,faltan:0,pendientes:0,pendientesInvestigacion:0,aprobados:0,reemplazados:0,devueltos:0,revisados:0,avance:0,revision:0,pendienteMasAntiguoDias:null,investigacionMasAntiguaDias:null,devueltoMasAntiguoDias:null};
  }

  function add(bucket,item,typeFiltered){
    var st=texto(item.estado).toUpperCase();
    if(!typeFiltered){
      bucket.esperados+=1;
      if(st==='NO_ENVIADO'){bucket.faltan+=1;return;}
    }else if(st==='NO_ENVIADO')return;
    bucket.enviados+=1;
    if(st==='APROBADO_FINAL'||st==='APROBADO')bucket.aprobados+=1;
    else if(st==='REEMPLAZADO')bucket.reemplazados+=1;
    else if(st==='PENDIENTE_INVESTIGADOR'){
      bucket.pendientesInvestigacion+=1;
      if(item.diasPendiente!==null)bucket.investigacionMasAntiguaDias=bucket.investigacionMasAntiguaDias===null?item.diasPendiente:Math.max(bucket.investigacionMasAntiguaDias,item.diasPendiente);
    }
    else if(st==='DEVUELTO'){
      bucket.devueltos+=1;
      if(item.diasDevuelto!==null)bucket.devueltoMasAntiguoDias=bucket.devueltoMasAntiguoDias===null?item.diasDevuelto:Math.max(bucket.devueltoMasAntiguoDias,item.diasDevuelto);
    }else{
      bucket.pendientes+=1;
      if(item.diasPendiente!==null)bucket.pendienteMasAntiguoDias=bucket.pendienteMasAntiguoDias===null?item.diasPendiente:Math.max(bucket.pendienteMasAntiguoDias,item.diasPendiente);
    }
  }

  function finish(bucket,typeFiltered){
    bucket.revisados=bucket.aprobados+bucket.reemplazados+bucket.devueltos;
    bucket.revision=porcentaje(bucket.revisados,bucket.enviados);
    bucket.avance=typeFiltered?null:porcentaje(bucket.enviados,bucket.esperados);
    if(typeFiltered){bucket.esperados=null;bucket.faltan=null;}
    return bucket;
  }

  function consolidar(cargas,filters,errors){
    var type=tipoNormal(filters.tipoTrabajo),typeFiltered=Boolean(type),rows=[],keys={},included=[];
    cargas.forEach(function(load){
      var summary=load.result&&load.result.resumen||{};
      var include=load.period.activo===true||Number(summary.pendientes||0)>0||Number(summary.pendientesInvestigacion||0)>0||Number(summary.devueltos||0)>0;
      if(filters.periodoId!==ALL)include=true;
      if(!include)return;
      included.push(load.period);
      (load.result.registros||[]).forEach(function(item){
        var asg=asignacion(item);
        var periodId=texto(load.period.id||load.period.periodoId);
        var key=periodId+'__'+texto(item.cedula);
        if(keys[key])return;
        keys[key]=true;
        var st=texto(item.estado).toUpperCase();
        rows.push(Object.assign({},item,{
          carrera:asg.carrera,
          periodoId:periodId,
          periodo:load.period.label||load.period.periodoLabel||periodId,
          periodoActivo:load.period.activo===true,
          coordinadorResponsableId:asg.coordinadorId,
          coordinadorResponsable:asg.coordinador,
          coordinadorResponsableEncontrado:asg.coordinadorEncontrado,
          coordinadorResponsableActivo:asg.coordinadorActivo,
          diasPendiente:st==='PENDIENTE_REVISION'?diasDesde(item.fechaEnvio):st==='PENDIENTE_INVESTIGADOR'?diasDesde(item.fechaValidacionCoordinador||item.fechaResolucion||item.fechaEnvio):null,
          diasDevuelto:st==='DEVUELTO'?diasDesde(item.fechaResolucion||item.fechaEnvio):null
        }));
      });
    });

    rows=rows.filter(function(item){
      if(filters.carrera&&normal(item.carrera)!==normal(filters.carrera))return false;
      if(filters.coordinadorId&&texto(item.coordinadorResponsableId)!==texto(filters.coordinadorId))return false;
      if(type){
        if(item.estado==='NO_ENVIADO')return false;
        if(tipoNormal(item.tipoTrabajo)!==type)return false;
      }
      return true;
    });

    var summary=baseBucket(),careerMap={},coordMap={},periodMap={};
    rows.forEach(function(item){
      add(summary,item,typeFiltered);

      var ck=normal(item.carrera)||'sin carrera';
      if(!careerMap[ck])careerMap[ck]=Object.assign(baseBucket(),{
        carrera:item.carrera,
        codigoCarrera:item.codigoCarrera||'',
        coordinadorId:item.coordinadorResponsableId||'',
        coordinador:item.coordinadorResponsable||'Sin asignar',
        coordinadorEncontrado:item.coordinadorResponsableEncontrado,
        coordinadorActivo:item.coordinadorResponsableActivo
      });
      add(careerMap[ck],item,typeFiltered);

      var qk=normal(item.coordinadorResponsableId||item.coordinadorResponsable)||'sin asignar';
      if(!coordMap[qk])coordMap[qk]=Object.assign(baseBucket(),{
        coordinadorId:item.coordinadorResponsableId||'',
        coordinador:item.coordinadorResponsable||'Sin asignar',
        coordinadorEncontrado:item.coordinadorResponsableEncontrado,
        coordinadorActivo:item.coordinadorResponsableActivo,
        carreras:{}
      });
      coordMap[qk].carreras[item.carrera]=true;
      add(coordMap[qk],item,typeFiltered);

      var pk=texto(item.periodoId)||'sin-periodo';
      if(!periodMap[pk])periodMap[pk]=Object.assign(baseBucket(),{
        periodoId:pk,periodo:item.periodo,activo:item.periodoActivo
      });
      add(periodMap[pk],item,typeFiltered);
    });

    finish(summary,typeFiltered);
    var careers=Object.keys(careerMap).map(function(k){return finish(careerMap[k],typeFiltered);}).sort(function(a,b){
      return b.pendientes-a.pendientes||b.devueltos-a.devueltos||a.carrera.localeCompare(b.carrera,'es');
    });
    var coords=Object.keys(coordMap).map(function(k){
      var x=coordMap[k];
      x.carreras=Object.keys(x.carreras).sort(function(a,b){return a.localeCompare(b,'es');});
      return finish(x,typeFiltered);
    }).sort(function(a,b){
      return b.pendientes-a.pendientes||Number(b.pendienteMasAntiguoDias||0)-Number(a.pendienteMasAntiguoDias||0)||a.coordinador.localeCompare(b.coordinador,'es');
    });
    var periods=Object.keys(periodMap).map(function(k){return finish(periodMap[k],typeFiltered);}).sort(function(a,b){
      return texto(b.periodoId).localeCompare(texto(a.periodoId),'es',{numeric:true});
    });
    var pending=rows.filter(function(x){return x.estado==='PENDIENTE_REVISION';}).sort(function(a,b){
      return Number(b.diasPendiente||0)-Number(a.diasPendiente||0);
    });
    var returned=rows.filter(function(x){return x.estado==='DEVUELTO';}).sort(function(a,b){
      return Number(b.diasDevuelto||0)-Number(a.diasDevuelto||0);
    });

    return{
      ok:true,
      modoTodosPeriodos:filters.periodoId===ALL,
      tipoTrabajo:type||'TODOS',
      tipoFiltrado:typeFiltered,
      periodosIncluidos:included.map(function(p){return{id:p.id||p.periodoId,label:p.label||p.periodoLabel||p.id,activo:p.activo===true,principal:p.principal===true};}),
      registros:rows,
      resumen:summary,
      carreras:careers,
      coordinadores:coords,
      periodos:periods,
      pendientesRevision:pending,
      pendientesInvestigacion:rows.filter(function(x){return x.estado==='PENDIENTE_INVESTIGADOR';}),
      devueltosActuales:returned,
      faltantes:typeFiltered?[]:rows.filter(function(x){return x.estado==='NO_ENVIADO';}),
      alertas:{
        carrerasSinCoordinador:careers.filter(function(x){return !x.coordinadorId&&x.pendientes>0;}),
        carrerasCoordinadorNoDisponible:careers.filter(function(x){
          return x.coordinadorId&&x.pendientes>0&&(!x.coordinadorEncontrado||!x.coordinadorActivo);
        })
      },
      periodosConError:errors||[],
      mensaje:filters.periodoId===ALL?'Estadísticas consolidadas: períodos activos y períodos históricos que todavía tienen pendientes o devueltos.':'Estadísticas del período seleccionado.'
    };
  }

  function render(data){
    ultimo=data||{};
    var s=data.resumen||{};
    $('ad-v3-expected').textContent=num(s.esperados);
    $('ad-v3-sent').textContent=num(s.enviados);
    $('ad-v3-missing').textContent=num(s.faltan);
    $('ad-v3-pending').textContent=num(s.pendientes);
    $('ad-v3-returned').textContent=num(s.devueltos);
    $('ad-v3-approved').textContent=num(Number(s.aprobados||0)+Number(s.reemplazados||0));
    $('ad-v3-reviewed').textContent=num(s.revisados);
    $('ad-v3-review').textContent=pct(s.revision);

    var note=$('ad-v3-stat-type-note');
    if(note){
      note.hidden=!data.tipoFiltrado;
      note.textContent=data.tipoFiltrado?'El filtro por tipo solo puede aplicarse a estudiantes que ya enviaron. Los no enviados aún no tienen tipo de trabajo, por eso Esperados y No enviaron se muestran como —.':'';
    }

    var sin=(data.alertas&&data.alertas.carrerasSinCoordinador)||[];
    var noDisponible=(data.alertas&&data.alertas.carrerasCoordinadorNoDisponible)||[];
    var alert=$('ad-v3-unassigned');
    if(alert){
      var partes=[];
      if(sin.length)partes.push('<strong>Sin coordinador:</strong> '+sin.map(function(x){return esc(x.carrera)+' ('+Number(x.pendientes||0)+')';}).join(', ')+'.');
      if(noDisponible.length)partes.push('<strong>Coordinador inactivo o no disponible:</strong> '+noDisponible.map(function(x){return esc(x.carrera)+' → '+esc(x.coordinador)+' ('+Number(x.pendientes||0)+')';}).join(', ')+'.');
      alert.hidden=!partes.length;
      alert.innerHTML=partes.join(' ');
    }

    $('ad-v3-coordinators').innerHTML=(data.coordinadores||[]).map(function(item){
      var pending=Number(item.pendientes||0);
      var cls=pending?'ad-v3-danger':'ad-v3-good';
      var name=esc(item.coordinador||'Sin asignar');
      if(item.coordinadorId&&(!item.coordinadorEncontrado||!item.coordinadorActivo))name+=' <span class="ad-v3-chip">No disponible</span>';
      return '<tr><td><strong>'+name+'</strong></td><td>'+esc((item.carreras||[]).join(' | '))+'</td><td>'+num(item.esperados)+'</td><td>'+num(item.enviados)+'</td><td class="'+cls+'">'+pending+'</td><td>'+Number(item.devueltos||0)+'</td><td>'+Number(item.revisados||0)+'</td><td>'+pct(item.revision)+'</td><td>'+espera(item.pendienteMasAntiguoDias)+'</td></tr>';
    }).join('')||'<tr><td colspan="9" class="ad-empty">No hay datos para los filtros seleccionados.</td></tr>';

    $('ad-v3-careers').innerHTML=(data.carreras||[]).map(function(item){
      var coordinator=esc(item.coordinador||'Sin asignar');
      if(item.coordinadorId&&(!item.coordinadorEncontrado||!item.coordinadorActivo))coordinator+=' <span class="ad-v3-chip">No disponible</span>';
      return '<tr><td><strong>'+esc(item.carrera)+'</strong></td><td>'+coordinator+'</td><td>'+num(item.esperados)+'</td><td>'+num(item.enviados)+'</td><td>'+num(item.faltan)+'</td><td class="'+(Number(item.pendientes||0)?'ad-v3-danger':'')+'">'+Number(item.pendientes||0)+'</td><td>'+Number(item.devueltos||0)+'</td><td>'+(Number(item.aprobados||0)+Number(item.reemplazados||0))+'</td><td>'+pct(item.revision)+'</td></tr>';
    }).join('')||'<tr><td colspan="9" class="ad-empty">No hay carreras para los filtros seleccionados.</td></tr>';

    $('ad-v3-periods').innerHTML=(data.periodos||[]).map(function(item){
      return '<tr><td><strong>'+esc(item.periodo||item.periodoId)+'</strong></td><td><span class="ad-v3-chip">'+(item.activo?'Activo':'Histórico pendiente')+'</span></td><td>'+num(item.esperados)+'</td><td>'+num(item.enviados)+'</td><td>'+num(item.faltan)+'</td><td>'+Number(item.pendientes||0)+'</td><td>'+Number(item.devueltos||0)+'</td><td>'+(Number(item.aprobados||0)+Number(item.reemplazados||0))+'</td><td>'+pct(item.revision)+'</td></tr>';
    }).join('')||'<tr><td colspan="9" class="ad-empty">No hay períodos incluidos.</td></tr>';

    $('ad-v3-oldest').innerHTML=(data.pendientesRevision||[]).slice(0,20).map(function(item){
      return '<tr><td><strong>'+esc(item.nombres||item.cedula)+'</strong><br><small>'+esc(item.cedula)+'</small></td><td>'+esc(item.carrera||'-')+'</td><td>'+esc(item.coordinadorResponsable||'Sin asignar')+'</td><td>'+esc(item.periodo||item.periodoId||'-')+'</td><td>'+formatFecha(item.fechaEnvio)+'</td><td class="'+(Number(item.diasPendiente||0)>=4?'ad-v3-danger':'')+'">'+espera(item.diasPendiente)+'</td></tr>';
    }).join('')||'<tr><td colspan="6" class="ad-empty">No hay pendientes de revisión.</td></tr>';

    var included=(data.periodosIncluidos||[]).length;
    var errorCount=(data.periodosConError||[]).length;
    var msg=data.mensaje||'Estadísticas actualizadas.';
    if(data.modoTodosPeriodos)msg+=' Incluye '+included+' período(s).';
    if(errorCount)msg+=' '+errorCount+' período(s) no pudieron consultarse y se excluyeron.';
    estado(msg,errorCount?'warning':'success');
  }

  function cargar(){
    if(cargando||!api())return Promise.resolve();
    var f=filtros();
    busy(true);
    estado(f.periodoId===ALL?'Revisando períodos activos e históricos con trabajo pendiente...':'Calculando estadísticas del período...','info');
    var periods=f.periodoId===ALL?catalogo.periodos:catalogo.periodos.filter(function(p){
      return texto(p.id||p.periodoId)===f.periodoId;
    });
    if(!periods.length){busy(false);estado('No se encontró el período seleccionado.','danger');return Promise.resolve();}
    return mapLimit(periods,2,cargarPeriodo).then(function(loads){
      var ok=loads.filter(function(x){return x&&x.ok;});
      var errors=loads.filter(function(x){return x&&!x.ok;}).map(function(x){
        return{id:x.period.id||x.period.periodoId,label:x.period.label||x.period.periodoLabel||x.period.id,error:x.error};
      });
      var result=consolidar(ok,f,errors);
      render(result);
      window.ADAdminStatisticsLast=result;
      return result;
    }).catch(function(error){
      estado(error&&error.message?error.message:String(error),'danger');
      throw error;
    }).finally(function(){busy(false);});
  }

  function actualizar(){
    if(cargando||!api())return Promise.resolve();
    estado('Actualizando períodos, carreras y asignaciones de coordinadores...','info');
    if(api().forzarActualizacion)api().forzarActualizacion({forzarMs:15000,permitirRespaldo:true});
    return cargarCatalogos().then(function(){return cargar();}).catch(function(error){
      estado(error&&error.message?error.message:String(error),'danger');
      throw error;
    });
  }

  function eventos(){
    document.addEventListener('click',function(event){
      var b=event.target.closest('#ad-v3-stat-refresh');
      if(b)actualizar();
    });
    document.addEventListener('change',function(event){
      if(['ad-v3-stat-period','ad-v3-stat-career','ad-v3-stat-coordinator','ad-v3-stat-type'].indexOf(event.target.id)>=0)cargar();
    });
  }

  function iniciar(){
    if(iniciado)return;
    if(!api()||!$('ad-seccion-estadisticas')||!$('ad-v2-stat-period')){setTimeout(iniciar,300);return;}
    iniciado=true;
    estilos();
    interfaz();
    eventos();
    estado('Cargando períodos, carreras y coordinadores...','info');
    cargarCatalogos().then(cargar).catch(function(error){estado(error&&error.message?error.message:String(error),'danger');});
  }

  if(document.readyState==='complete')setTimeout(iniciar,900);
  else window.addEventListener('load',function(){setTimeout(iniciar,900);},{once:true});

  window.ADEstadisticasControl={
    cargar:cargar,
    actualizar:actualizar,
    ultimo:function(){return ultimo;}
  };
})(window,document);
