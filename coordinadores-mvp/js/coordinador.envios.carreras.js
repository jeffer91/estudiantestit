/* =========================================================
Archivo: coordinador.envios.carreras.js
Ruta: /coordinadores-mvp/js/coordinador.envios.carreras.js
Función:
- Recuperar envíos mediante consultas amplias y por carrera.
- No enviar el período al servidor para evitar coincidencias rígidas.
- Unificar respuestas, eliminar duplicados y construir períodos reales.
- Mantener Google Sheets como fuente principal.
========================================================= */
(function(window){
  'use strict';

  var ultimoDiagnostico={consultas:0,respondidas:0,fallidas:0,filasRecibidas:0,enviosNormalizados:0};

  function texto(valor){
    return String(valor===null||valor===undefined?'':valor).trim();
  }

  function normal(valor){
    return texto(valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-z0-9]+/g,' ')
      .replace(/\s+/g,' ')
      .trim();
  }

  function obtenerNombreCarrera(item){
    if(typeof item==='string')return texto(item);
    item=item||{};
    return texto(
      item.nombreCarrera||item.NombreCarrera||item.carrera||item.Carrera||
      item.codigoCarrera||item.CodigoCarrera||item.key||item.id||''
    );
  }

  function obtenerCarreras(opciones){
    opciones=opciones||{};
    var origen=opciones.carreras||(opciones.coordinador&&opciones.coordinador.carreras)||[];
    if(!Array.isArray(origen))origen=texto(origen).split(/[,;\n]+/);

    var mapa={};
    var salida=[];
    origen.forEach(function(item){
      var carrera=obtenerNombreCarrera(item);
      var clave=normal(carrera);
      if(!clave||mapa[clave])return;
      mapa[clave]=true;
      salida.push(carrera);
    });
    return salida;
  }

  function extraerLista(valor,profundidad){
    if(profundidad>8||valor===null||valor===undefined)return [];
    if(Array.isArray(valor))return valor;
    if(typeof valor!=='object')return [];

    var claves=['envios','estudiantes','registros','filas','rows','items','resultados','resultado','result','data'];
    var i;
    for(i=0;i<claves.length;i+=1){
      if(Array.isArray(valor[claves[i]]))return valor[claves[i]];
    }

    var nombres=Object.keys(valor);
    for(i=0;i<nombres.length;i+=1){
      var encontrada=extraerLista(valor[nombres[i]],profundidad+1);
      if(encontrada.length)return encontrada;
    }
    return [];
  }

  function claveEnvio(envio,indice){
    envio=envio||{};
    return texto(
      envio.id||envio._clave||[
        envio.cedula,
        envio.periodoId||envio.periodoLabel||envio.periodo,
        envio.carrera,
        envio.fila||indice
      ].join('|')
    );
  }

  function construirConsultas(enviarGet,carreras){
    var consultas=[];
    var carrerasTexto=carreras.join(',');

    consultas.push(function(){
      return enviarGet('LISTAR_ENVIOS_POR_CARRERA',{
        hoja:'Envios',
        estado:'',
        todas:'true',
        incluirTodos:'true'
      });
    });

    consultas.push(function(){
      return enviarGet('LISTAR_ENVIOS_COORDINADOR',{
        hoja:'Envios',
        estado:'',
        carreras:carrerasTexto,
        todas:'true',
        incluirTodos:'true'
      });
    });

    carreras.forEach(function(carrera){
      consultas.push(function(){
        return enviarGet('LISTAR_ENVIOS_POR_CARRERA',{
          hoja:'Envios',
          estado:'',
          carrera:carrera,
          carreras:carrera
        });
      });
    });

    return consultas;
  }

  function construirPeriodosDesdeEnvios(lista){
    var mapa={};
    var periodos=[];

    (Array.isArray(lista)?lista:[]).forEach(function(item){
      item=item||{};
      var id=texto(item.periodoId||item.periodoLabel||item.periodo);
      var label=texto(item.periodoLabel||item.periodo||item.periodoId);
      var clave=normal(id||label);
      if(!clave||mapa[clave])return;
      mapa[clave]=true;
      periodos.push({id:id||label,label:label||id,activo:true});
    });

    periodos.sort(function(a,b){
      return texto(b.label).localeCompare(texto(a.label),'es',{numeric:true});
    });

    if(periodos.length)periodos[0].principal=true;
    return {
      periodos:periodos,
      principal:periodos[0]||null,
      envios:Array.isArray(lista)?lista:[]
    };
  }

  function instalar(){
    var servicio=window.CoordinadorMVPSheetsPrimary;
    if(!servicio||servicio.__enviosFlexiblesInstalado)return false;
    if(typeof servicio.enviarGet!=='function'||typeof servicio.normalizarEnvio!=='function')return false;

    var enviarGet=servicio.enviarGet;
    var normalizarEnvio=servicio.normalizarEnvio;

    servicio.listarEnvios=function(opciones){
      opciones=opciones||{};
      var carreras=obtenerCarreras(opciones);
      var consultas=construirConsultas(enviarGet,carreras);

      ultimoDiagnostico={
        consultas:consultas.length,
        respondidas:0,
        fallidas:0,
        filasRecibidas:0,
        enviosNormalizados:0,
        carrerasSolicitadas:carreras.slice()
      };

      return Promise.allSettled(consultas.map(function(ejecutar){return ejecutar();}))
        .then(function(resultados){
          var filas=[];
          var errores=[];

          resultados.forEach(function(resultado){
            if(resultado.status==='fulfilled'){
              ultimoDiagnostico.respondidas+=1;
              var lista=extraerLista(resultado.value,0);
              ultimoDiagnostico.filasRecibidas+=lista.length;
              filas=filas.concat(lista);
            }else{
              ultimoDiagnostico.fallidas+=1;
              errores.push(resultado.reason);
            }
          });

          if(!filas.length&&errores.length===resultados.length)throw errores[0];

          var mapa={};
          var envios=[];
          filas.map(normalizarEnvio).forEach(function(envio,indice){
            if(!envio||!envio.cedula)return;
            if(!envio.titulo1&&!envio.titulo2&&!envio.titulo3)return;
            var clave=claveEnvio(envio,indice);
            if(mapa[clave])return;
            mapa[clave]=true;
            envios.push(envio);
          });

          ultimoDiagnostico.enviosNormalizados=envios.length;
          return envios;
        });
    };

    servicio.listarPeriodos=function(){
      return servicio.listarEnvios({carreras:[],incluirTodos:true})
        .then(function(lista){
          var resultado=construirPeriodosDesdeEnvios(lista);
          if(resultado.periodos.length)return resultado;
          var cfg=window.CoordinadorMVPConfig;
          var id=cfg&&cfg.obtener?cfg.obtener('periodos.fallbackId','2026-02__2026-08'):'2026-02__2026-08';
          var label=cfg&&cfg.obtener?cfg.obtener('periodos.fallbackLabel','Febrero 2026 a Agosto 2026'):'Febrero 2026 a Agosto 2026';
          var fallback={id:id,label:label,activo:true,principal:true,fallback:true};
          return {periodos:[fallback],principal:fallback,envios:lista};
        });
    };

    servicio.construirPeriodosDesdeEnvios=construirPeriodosDesdeEnvios;
    servicio.obtenerDiagnosticoConsulta=function(){return Object.assign({},ultimoDiagnostico);};
    servicio.__enviosPorCarreraInstalado=true;
    servicio.__enviosFlexiblesInstalado=true;
    return true;
  }

  window.CoordinadorMVPEnviosCarreras={instalar:instalar};
  instalar();
})(window);