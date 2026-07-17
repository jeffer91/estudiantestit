/* =========================================================
Archivo: ad-sheets-repair.service.js
Ruta: /administrador/ad-js/ad-sheets-repair.service.js
Función:
- Analizar Google Sheets como base principal.
- Ejecutar únicamente correcciones seguras autorizadas por Apps Script.
- Mantener una lectura de compatibilidad cuando el Apps Script aún no expone
  las acciones de mantenimiento, sin modificar datos.
========================================================= */
(function(window){
  "use strict";

  var HOJAS_PRINCIPALES=[
    "BaseEstudiantes",
    "Envios",
    "Coordinadores",
    "PendientesSync"
  ];

  function sheets(){
    if(!window.ADSheetsService) throw new Error("ADSheetsService no está disponible.");
    return window.ADSheetsService;
  }

  function texto(valor){
    return String(valor===null||valor===undefined?"":valor).trim();
  }

  function numero(valor,fallback){
    var n=Number(valor);
    return Number.isFinite(n)?n:Number(fallback||0);
  }

  function normal(valor){
    return texto(valor)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g,"")
      .replace(/[^a-z0-9]+/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function extraerData(respuesta){
    var data=respuesta&&respuesta.data!==undefined?respuesta.data:respuesta;
    if(data&&data.data!==undefined&&data.ok!==false) data=data.data;
    return data||{};
  }

  function extraerLista(respuesta){
    if(window.ADSheetsService&&typeof window.ADSheetsService.extraerLista==="function"){
      return window.ADSheetsService.extraerLista(respuesta);
    }
    var data=extraerData(respuesta);
    if(Array.isArray(data)) return data;
    if(!data||typeof data!=="object") return [];
    var candidatos=[
      data.registros,
      data.envios,
      data.coordinadores,
      data.pendientes,
      data.casos,
      data.resultado,
      data.result
    ];
    for(var i=0;i<candidatos.length;i+=1){
      if(Array.isArray(candidatos[i])) return candidatos[i];
    }
    return [];
  }

  function normalizarCaso(caso,indice){
    caso=caso||{};
    var problemas=Array.isArray(caso.problemas)?caso.problemas.slice():
      (texto(caso.problema)?[texto(caso.problema)]:[]);
    var acciones=Array.isArray(caso.acciones)?caso.acciones.slice():
      (texto(caso.correccionPropuesta||caso.correccion)?[texto(caso.correccionPropuesta||caso.correccion)]:[]);
    var hoja=texto(caso.hoja||caso.sheet||caso.nombreHoja||"");
    var fila=numero(caso.fila||caso.row||caso.numeroFila,0);
    var id=texto(caso.id||caso.idCaso||caso.idRegistro||(hoja&&fila?hoja+"__"+fila:"caso_"+indice));

    return {
      id:id,
      hoja:hoja,
      fila:fila,
      idRegistro:texto(caso.idRegistro||caso.registroId||caso.idEnvio||caso.documentoId||""),
      cedula:texto(caso.cedula||caso.numeroIdentificacion||caso.identificacion||""),
      periodo:texto(caso.periodo||caso.periodoId||caso.periodoLabel||caso.periodoTexto||""),
      problemas:problemas,
      acciones:acciones,
      seguro:caso.seguro===true,
      firmaOriginal:texto(caso.firmaOriginal||caso.firma||caso.hash||""),
      tipo:texto(caso.tipo||caso.codigo||""),
      datos:caso.datos&&typeof caso.datos==="object"?caso.datos:{},
      raw:caso
    };
  }

  function normalizarAnalisis(respuesta){
    var data=extraerData(respuesta);
    var casos=Array.isArray(data.casos)?data.casos:
      (Array.isArray(data.registros)?data.registros:[]);
    casos=casos.map(normalizarCaso);

    return {
      ok:data.ok!==false,
      fuente:texto(data.fuente||"google-sheets"),
      capacidadCorreccion:data.capacidadCorreccion!==false,
      totalHojas:numero(data.totalHojas,HOJAS_PRINCIPALES.length),
      totalRegistros:numero(data.totalRegistros||data.totalFilas,0),
      totalCasos:numero(data.totalCasos,casos.length),
      seguros:numero(data.seguros,casos.filter(function(c){return c.seguro;}).length),
      manuales:numero(data.manuales,casos.filter(function(c){return !c.seguro;}).length),
      hojas:Array.isArray(data.hojas)?data.hojas.slice():HOJAS_PRINCIPALES.slice(),
      casos:casos,
      mensaje:texto(data.mensaje||"")
    };
  }

  function mensajeNoSoportado(error){
    var mensaje=texto(error&&error.message?error.message:error).toLowerCase();
    return mensaje.indexOf("acción")>=0&&(
      mensaje.indexOf("no válida")>=0||
      mensaje.indexOf("no valida")>=0||
      mensaje.indexOf("desconocida")>=0||
      mensaje.indexOf("no soportada")>=0||
      mensaje.indexOf("no existe")>=0
    );
  }

  function valorCampo(item,nombres){
    item=item||{};
    for(var i=0;i<nombres.length;i+=1){
      if(item[nombres[i]]!==undefined&&texto(item[nombres[i]])) return texto(item[nombres[i]]);
    }
    return "";
  }

  function claveEnvio(item){
    var cedula=valorCampo(item,["cedula","numeroIdentificacion","identificacion"]);
    var periodo=valorCampo(item,["periodo","periodoId","periodoLabel","periodoTexto"]);
    return cedula?normal(cedula)+"__"+normal(periodo||"SIN_PERIODO"):"";
  }

  function firmaSimple(item){
    var copia={};
    Object.keys(item||{}).sort().forEach(function(clave){
      if(clave.charAt(0)!=="_") copia[clave]=item[clave];
    });
    try{return JSON.stringify(copia);}catch(error){return texto(item);}
  }

  function titulos(item){
    var candidatos=[
      valorCampo(item,["titulo1","Titulo1","propuesta1"]),
      valorCampo(item,["titulo2","Titulo2","propuesta2"]),
      valorCampo(item,["titulo3","Titulo3","propuesta3"])
    ].filter(Boolean);
    return candidatos;
  }

  function analizarEnviosCompatibilidad(lista,casos){
    var grupos={};
    (lista||[]).forEach(function(item,indice){
      var clave=claveEnvio(item);
      var hoja="Envios";
      var fila=numero(item._fila||item.fila||item.numeroFila,indice+2);
      var ts=titulos(item);
      var vistos={};
      var repetidos=ts.filter(function(titulo){
        var n=normal(titulo);
        if(!n) return false;
        if(vistos[n]) return true;
        vistos[n]=true;
        return false;
      });

      if(repetidos.length){
        casos.push(normalizarCaso({
          id:hoja+"__"+fila+"__titulos",
          hoja:hoja,
          fila:fila,
          idRegistro:valorCampo(item,["idRegistro","id","_id","envioId"]),
          cedula:valorCampo(item,["cedula","numeroIdentificacion"]),
          periodo:valorCampo(item,["periodo","periodoId","periodoLabel"]),
          problema:"El envío contiene propuestas de título repetidas",
          correccionPropuesta:"Revisar el envío y conservar únicamente propuestas distintas",
          seguro:false,
          tipo:"TITULOS_REPETIDOS"
        },casos.length));
      }

      if(clave){
        if(!grupos[clave]) grupos[clave]=[];
        grupos[clave].push({item:item,indice:indice,fila:fila,firma:firmaSimple(item)});
      }
    });

    Object.keys(grupos).forEach(function(clave){
      var grupo=grupos[clave];
      if(grupo.length<2) return;
      var exactos=grupo.every(function(entry){return entry.firma===grupo[0].firma;});
      grupo.forEach(function(entry){
        casos.push(normalizarCaso({
          id:"Envios__"+entry.fila+"__duplicado",
          hoja:"Envios",
          fila:entry.fila,
          idRegistro:valorCampo(entry.item,["idRegistro","id","_id","envioId"]),
          cedula:valorCampo(entry.item,["cedula","numeroIdentificacion"]),
          periodo:valorCampo(entry.item,["periodo","periodoId","periodoLabel"]),
          problema:exactos?"Registro duplicado exacto":"Registros diferentes para la misma cédula y período",
          correccionPropuesta:exactos
            ?"Apps Script debe conservar una fila y respaldar la copia antes de retirarla"
            :"Comparar manualmente las filas antes de fusionar o eliminar",
          seguro:false,
          tipo:exactos?"DUPLICADO_EXACTO":"DUPLICADO_CONFLICTO"
        },casos.length));
      });
    });
  }

  function analizarCoordinadoresCompatibilidad(lista,casos){
    var grupos={};
    (lista||[]).forEach(function(item,indice){
      var id=normal(valorCampo(item,["id","_docId","correo","email","nombre"]));
      if(!id) return;
      if(!grupos[id]) grupos[id]=[];
      grupos[id].push({item:item,fila:numero(item._fila||item.fila,indice+2)});
    });
    Object.keys(grupos).forEach(function(clave){
      if(grupos[clave].length<2) return;
      grupos[clave].forEach(function(entry){
        casos.push(normalizarCaso({
          id:"Coordinadores__"+entry.fila+"__duplicado",
          hoja:"Coordinadores",
          fila:entry.fila,
          idRegistro:valorCampo(entry.item,["id","_docId","correo","email"]),
          problema:"Coordinador duplicado",
          correccionPropuesta:"Revisar las asignaciones y conservar un solo registro",
          seguro:false,
          tipo:"COORDINADOR_DUPLICADO"
        },casos.length));
      });
    });
  }

  function analizarPendientesCompatibilidad(pendientes,envios,casos){
    var existentes={};
    (envios||[]).forEach(function(item){
      var clave=claveEnvio(item);
      if(clave) existentes[clave]=true;
    });
    (pendientes||[]).forEach(function(item,indice){
      var clave=claveEnvio(item);
      if(!clave||!existentes[clave]) return;
      casos.push(normalizarCaso({
        id:"PendientesSync__"+numero(item._fila||item.fila,indice+2)+"__resuelto",
        hoja:"PendientesSync",
        fila:numero(item._fila||item.fila,indice+2),
        idRegistro:valorCampo(item,["idRegistro","id","_id","envioId"]),
        cedula:valorCampo(item,["cedula","numeroIdentificacion"]),
        periodo:valorCampo(item,["periodo","periodoId","periodoLabel"]),
        problema:"El registro pendiente ya existe en Envios",
        correccionPropuesta:"Respaldar y retirar el pendiente ya sincronizado",
        seguro:false,
        tipo:"PENDIENTE_YA_SINCRONIZADO"
      },casos.length));
    });
  }

  function analizarLecturasDisponibles(){
    var servicio=sheets();
    return Promise.allSettled([
      servicio.enviarGet("LISTAR_ENVIOS_POR_CARRERA",{carreras:"",carrera:"",estado:"",incluirTodos:true}),
      servicio.enviarGet("LISTAR_COORDINADORES",{incluirInactivos:true}),
      servicio.enviarGet("LISTAR_PENDIENTES_SYNC",{})
    ]).then(function(partes){
      var envios=partes[0].status==="fulfilled"?extraerLista(partes[0].value):[];
      var coordinadores=partes[1].status==="fulfilled"?extraerLista(partes[1].value):[];
      var pendientes=partes[2].status==="fulfilled"?extraerLista(partes[2].value):[];
      var casos=[];

      analizarEnviosCompatibilidad(envios,casos);
      analizarCoordinadoresCompatibilidad(coordinadores,casos);
      analizarPendientesCompatibilidad(pendientes,envios,casos);

      return {
        ok:true,
        fuente:"lectura-compatible",
        capacidadCorreccion:false,
        totalHojas:3,
        totalRegistros:envios.length+coordinadores.length+pendientes.length,
        totalCasos:casos.length,
        seguros:0,
        manuales:casos.length,
        hojas:["Envios","Coordinadores","PendientesSync"],
        casos:casos,
        mensaje:"El Apps Script actual todavía no expone las acciones de mantenimiento. Se realizó un análisis de solo lectura; no se habilitaron correcciones automáticas."
      };
    });
  }

  function analizarBase(){
    return sheets().enviarGet("ANALIZAR_GOOGLE_SHEETS",{
      hojas:HOJAS_PRINCIPALES,
      modo:"SEGURO",
      incluirDetalles:true
    }).then(normalizarAnalisis).catch(function(error){
      if(mensajeNoSoportado(error)) return analizarLecturasDisponibles();
      throw error;
    });
  }

  function normalizarResultadoCorreccion(respuesta){
    var data=extraerData(respuesta);
    var resultados=Array.isArray(data.resultados)?data.resultados:[];
    return {
      ok:data.ok!==false,
      procesados:numero(data.procesados,resultados.length),
      correctos:numero(data.correctos,resultados.filter(function(r){return r&&r.ok!==false;}).length),
      errores:numero(data.errores,resultados.filter(function(r){return r&&r.ok===false;}).length),
      resultados:resultados,
      mensaje:texto(data.mensaje||"")
    };
  }

  function ejecutarSeleccionados(casos){
    var seleccionados=(casos||[]).filter(function(caso){
      return caso&&caso.seguro===true;
    }).map(function(caso){
      return {
        id:caso.id,
        hoja:caso.hoja,
        fila:caso.fila,
        idRegistro:caso.idRegistro,
        cedula:caso.cedula,
        periodo:caso.periodo,
        tipo:caso.tipo,
        firmaOriginal:caso.firmaOriginal,
        acciones:caso.acciones,
        datos:caso.datos
      };
    });

    if(!seleccionados.length){
      return Promise.reject(new Error("No hay correcciones seguras seleccionadas."));
    }

    return sheets().enviarPost("CORREGIR_GOOGLE_SHEETS",{
      casos:seleccionados,
      administrador:(window.AD_CONFIG&&window.AD_CONFIG.administrador)||"administrador",
      crearRespaldo:true,
      hojaHistorial:"HistorialReparaciones"
    }).then(normalizarResultadoCorreccion);
  }

  function listarHistorial(limite){
    return sheets().enviarGet("LISTAR_HISTORIAL_REPARACIONES",{
      limite:Math.max(1,numero(limite,100))
    });
  }

  window.ADSheetsRepairService=Object.freeze({
    HOJAS_PRINCIPALES:HOJAS_PRINCIPALES.slice(),
    analizarBase:analizarBase,
    analizarLecturasDisponibles:analizarLecturasDisponibles,
    ejecutarSeleccionados:ejecutarSeleccionados,
    listarHistorial:listarHistorial,
    normalizarAnalisis:normalizarAnalisis
  });
})(window);
