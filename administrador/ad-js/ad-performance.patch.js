/* Evita reconstruir en el servidor las estadísticas cuando la lista global ya está cargada. */
(function(window){
  'use strict';

  if(window.ADAdminPerformanceV1)return;
  window.ADAdminPerformanceV1=true;

  function texto(value){return String(value===null||value===undefined?'':value).trim();}
  function normal(value){return texto(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}

  function mismoPeriodo(data,filtros){
    var requested=texto(filtros&&(
      filtros.periodoId||
      filtros.periodo||
      filtros.periodoLabel
    ));
    if(!requested)return true;
    return requested===texto(data&&data.periodoId)||
      requested===texto(data&&data.periodo);
  }

  function calcular(data,filtros){
    var career=texto(filtros&&filtros.carrera);
    var records=(data.registros||[]).filter(function(student){
      return !career||normal(student&&student.carrera)===normal(career);
    });
    var buckets=new Map();

    records.forEach(function(student){
      var key=normal(student.codigoCarrera||student.carrera)||'sin carrera';
      if(!buckets.has(key)){
        buckets.set(key,{
          codigoCarrera:student.codigoCarrera||'',
          carrera:student.carrera||'SIN CARRERA',
          esperados:0,enviados:0,faltan:0,pendientes:0,
          aprobados:0,reemplazados:0,devueltos:0,avance:0
        });
      }
      var item=buckets.get(key);
      var state=texto(student.estado).toUpperCase();
      item.esperados+=1;
      if(state==='NO_ENVIADO')item.faltan+=1;
      else{
        item.enviados+=1;
        if(state==='APROBADO')item.aprobados+=1;
        else if(state==='REEMPLAZADO')item.reemplazados+=1;
        else if(state==='DEVUELTO')item.devueltos+=1;
        else item.pendientes+=1;
      }
    });

    var carreras=Array.from(buckets.values()).map(function(item){
      item.avance=item.esperados?Number(((item.enviados/item.esperados)*100).toFixed(1)):0;
      return item;
    }).sort(function(a,b){return a.carrera.localeCompare(b.carrera,'es');});

    var resumen={
      esperados:0,enviados:0,faltan:0,pendientes:0,
      aprobados:0,reemplazados:0,devueltos:0,avance:0
    };
    carreras.forEach(function(item){
      ['esperados','enviados','faltan','pendientes','aprobados','reemplazados','devueltos'].forEach(function(field){
        resumen[field]+=Number(item[field]||0);
      });
    });
    resumen.avance=resumen.esperados?Number(((resumen.enviados/resumen.esperados)*100).toFixed(1)):0;
    resumen.enviosFirebase=Number(data.totalEnviosPeriodo||0);
    resumen.trabajosTitulacion=Number(data.totalTrabajosTitulacion||0);

    var outside=(data.fueraPoblacion||[]).filter(function(item){
      return !career||normal(item&&item.carrera)===normal(career);
    });
    resumen.fueraPoblacion=outside.length;

    return Object.assign({},data,{
      carrera:career,
      registros:records,
      estudiantes:records,
      faltantes:records.filter(function(item){return texto(item.estado).toUpperCase()==='NO_ENVIADO';}),
      fueraPoblacion:outside,
      total:records.length,
      totalEsperados:records.length,
      resumen:resumen,
      carreras:carreras,
      estadisticasDesdeListaGlobal:true,
      mensaje:'Estadísticas calculadas para '+resumen.esperados+' estudiantes.'
    });
  }

  function install(){
    var original=window.ADAPIService;
    if(!original||typeof original.obtenerEstadisticas!=='function'){
      window.setTimeout(install,25);
      return;
    }
    if(original.__adminPerformanceV1)return;

    var wrapper={};
    Object.keys(original).forEach(function(key){wrapper[key]=original[key];});
    wrapper.__adminPerformanceV1=true;
    wrapper.obtenerEstadisticas=function(filtros){
      var global=window.ADAdminGlobalLast;
      if(global&&Array.isArray(global.registros)&&mismoPeriodo(global,filtros)){
        var result=calcular(global,filtros||{});
        window.ADAdminStatisticsLast=result;
        return Promise.resolve(result);
      }
      return original.obtenerEstadisticas(filtros);
    };
    window.ADAPIService=Object.freeze(wrapper);
  }

  install();
})(window);
