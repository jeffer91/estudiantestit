/* =========================================================
Archivo: ad-coordinadores.service.js
Ruta: /administrador/ad-js/ad-coordinadores.service.js
Función:
- Usar Google Sheets como fuente principal de coordinadores.
- Mantener Firebase como respaldo secundario.
- Crear, editar, activar, desactivar y asignar carreras.
- Sincronizar el catálogo completo con Google Sheets.
========================================================= */
(function(window,document){
  "use strict";

  function config(){ return window.AD_CONFIG || {}; }
  function utils(){ return window.AD_UTILS || {}; }
  function texto(valor){ return String(valor === null || valor === undefined ? "" : valor).trim(); }

  function firebaseService(){
    if (!window.ADFirebaseService) throw new Error("ADFirebaseService no está disponible.");
    return window.ADFirebaseService;
  }

  function sheetsService(){
    if (!window.ADSheetsService) throw new Error("ADSheetsService no está disponible.");
    return window.ADSheetsService;
  }

  function asegurarSheetsService(){
    if (window.ADSheetsService) return Promise.resolve(window.ADSheetsService);

    return new Promise(function(resolve,reject){
      var id = "ad-sheets-service-script";
      var existente = document.getElementById(id);
      var inicio = Date.now();
      var timer;

      function comprobar(){
        if (window.ADSheetsService) {
          if (timer) window.clearInterval(timer);
          resolve(window.ADSheetsService);
          return true;
        }
        if (Date.now() - inicio > 10000) {
          if (timer) window.clearInterval(timer);
          reject(new Error("No se pudo cargar el servicio de Google Sheets."));
          return true;
        }
        return false;
      }

      if (!existente) {
        existente = document.createElement("script");
        existente.id = id;
        existente.src = "./ad-js/ad-sheets.service.js?v=1.9.0";
        existente.async = false;
        existente.onload = comprobar;
        existente.onerror = function(){ reject(new Error("No se pudo cargar ad-sheets.service.js.")); };
        document.body.appendChild(existente);
      }

      timer = window.setInterval(comprobar,100);
      comprobar();
    });
  }

  var MIGRATION_KEY = "titulos_coordinadores_sheets_migrados_v1";

  function colCoordinadores(){ return config().colecciones.coordinadores; }
  function colLogs(){ return config().colecciones.logs; }
  function migracionHecha(){
    try { return window.localStorage.getItem(MIGRATION_KEY) === "SI"; }
    catch (error) { return false; }
  }
  function marcarMigracion(){
    try { window.localStorage.setItem(MIGRATION_KEY,"SI"); }
    catch (error) {}
  }
  function fechaCliente(){
    try { return firebaseService().fechaCliente(); }
    catch (error) { return new Date().toISOString(); }
  }

  function normalizarDocId(valor){
    if (utils().normalizarDocId) return utils().normalizarDocId(valor);
    return texto(valor)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function prepararCoordinadorId(nombre,idManual){ return normalizarDocId(idManual || nombre); }

  function normalizar(item){
    var data = item || {};
    var id = texto(data.id || data._docId || data.idRegistro || data.coordinadorId || data.nombre || data.Nombre);
    var carreras = data.carreras;
    var asignadas = data.carrerasAsignadas;

    if (!Array.isArray(carreras)) carreras = separarCarreras(carreras);
    if (!Array.isArray(asignadas)) asignadas = [];

    return Object.assign({},data,{
      id: id || prepararCoordinadorId(data.nombre || data.Nombre || ""),
      _docId: id || prepararCoordinadorId(data.nombre || data.Nombre || ""),
      nombre: texto(data.nombre || data.Nombre || data.coordinador || id),
      telegram: texto(data.telegram || data.Telegram || ""),
      Telegram: texto(data.telegram || data.Telegram || ""),
      activo: data.activo !== false && String(data.estado || "ACTIVO").toUpperCase() !== "INACTIVO",
      carreras: carreras,
      carrerasAsignadas: asignadas,
      fuente: texto(data.fuente || "")
    });
  }

  function separarCarreras(valor){
    var lista = Array.isArray(valor) ? valor : String(valor || "").split(/[,;\n|]+/);
    var mapa = {};
    return lista.map(function(item){ return texto(item && (item.nombreCarrera || item.NombreCarrera || item.carrera || item.codigoCarrera || item.key || item)); })
      .filter(function(item){
        var clave = normalizarClaveCarrera(item);
        if (!clave || mapa[clave]) return false;
        mapa[clave] = true;
        return true;
      });
  }

  function ordenar(lista){
    return (Array.isArray(lista) ? lista : []).map(normalizar).filter(function(item){ return item.id && item.nombre; }).sort(function(a,b){
      return String(a.nombre).localeCompare(String(b.nombre),"es");
    });
  }

  function registrar(accion,detalle){
    try {
      return firebaseService().agregarDocumento(colLogs(),Object.assign({
        accion: accion,
        fecha: fechaCliente(),
        origen: "administrador",
        administrador: config().administrador,
        modulo: "coordinadores",
        estado: "OK"
      },detalle || {})).catch(function(){ return { ok:false }; });
    } catch (error) {
      return Promise.resolve({ ok:false });
    }
  }

  function listarFirebase(limite){
    var max = Number(limite || 500);
    if (!Number.isFinite(max) || max <= 0) max = 500;
    return firebaseService().listarColeccion(colCoordinadores(),max).then(function(resultado){
      return ordenar(resultado.datos || []);
    });
  }

  function guardarFirebase(coordinador){
    var item = normalizar(coordinador);
    if (!item.id) return Promise.resolve({ ok:false });
    return firebaseService().guardarDocumento(colCoordinadores(),item.id,Object.assign({},item,{
      origen: "google-sheets-principal",
      actualizadoEn: fechaCliente(),
      actualizadoPor: config().administrador
    }),{ merge:true }).catch(function(){ return { ok:false }; });
  }

  function respaldarListaFirebase(lista){
    return Promise.all((Array.isArray(lista) ? lista : []).map(guardarFirebase)).then(function(){ return true; }).catch(function(){ return false; });
  }

  function extraerListaSheets(respuesta){
    var servicio = sheetsService();
    var lista = servicio.extraerLista ? servicio.extraerLista(respuesta) : [];
    return ordenar(lista);
  }

  function listarSheets(){
    return asegurarSheetsService().then(function(servicio){
      return servicio.enviarGet("LISTAR_COORDINADORES",{ incluirInactivos:true });
    }).then(function(respuesta){
      var lista = extraerListaSheets(respuesta);
      return respaldarListaFirebase(lista).then(function(){ return lista; });
    });
  }

  function listarCoordinadores(limite){
    return Promise.allSettled([
      listarSheets(),
      listarFirebase(limite)
    ]).then(function(partes){
      var listaSheets = partes[0].status === "fulfilled" ? partes[0].value : [];
      var respaldo = partes[1].status === "fulfilled" ? partes[1].value : [];
      var errorSheets = partes[0].status === "rejected" ? partes[0].reason : null;
      var idsSheets = {};
      var faltantes = [];

      listaSheets.forEach(function(item){ idsSheets[texto(item.id || item._docId)] = true; });
      respaldo.forEach(function(item){
        var id = texto(item.id || item._docId);
        if (id && !idsSheets[id]) faltantes.push(id);
      });

      if (!migracionHecha() && respaldo.length && (!listaSheets.length || faltantes.length)) {
        return sincronizarCatalogo(respaldo,"administrador-migracion-automatica").then(function(){
          marcarMigracion();
          return {
            ok:true,total:respaldo.length,coordinadores:respaldo,fuente:"google-sheets",fuentePrincipal:"Google Sheets",
            migracionAutomatica:true,
            mensaje:"El catálogo completo de Firebase se migró automáticamente a Google Sheets."
          };
        }).catch(function(errorSync){
          return {
            ok:true,total:respaldo.length,coordinadores:respaldo,fuente:"firebase-respaldo",fuentePrincipal:"Google Sheets",
            advertencia:"No se pudo completar la migración inicial a Google Sheets: " + (errorSync.message || String(errorSync))
          };
        });
      }

      if (listaSheets.length) {
        return { ok:true,total:listaSheets.length,coordinadores:listaSheets,fuente:"google-sheets",fuentePrincipal:"Google Sheets" };
      }

      if (respaldo.length) {
        return {
          ok:true,total:respaldo.length,coordinadores:respaldo,fuente:"firebase-respaldo",fuentePrincipal:"Google Sheets",
          advertencia:errorSheets ? "Google Sheets no respondió. Se muestra Firebase como respaldo temporal: " + (errorSheets.message || String(errorSheets)) : "Google Sheets no contiene coordinadores."
        };
      }

      if (errorSheets) throw errorSheets;
      return { ok:true,total:0,coordinadores:[],fuente:"google-sheets",fuentePrincipal:"Google Sheets" };
    });
  }

  function obtenerCoordinador(id){
    var buscado = texto(id);
    return listarCoordinadores(500).then(function(resultado){
      return (resultado.coordinadores || []).find(function(item){ return texto(item.id || item._docId) === buscado; }) || null;
    });
  }

  function payloadSheets(item){
    item = normalizar(item);
    return {
      id: item.id,
      idRegistro: item.id,
      coordinadorId: item.id,
      nombre: item.nombre,
      coordinador: item.nombre,
      telegram: item.telegram,
      activo: item.activo !== false,
      estado: item.activo !== false ? "ACTIVO" : "INACTIVO",
      carreras: item.carreras || [],
      carrerasAsignadas: item.carrerasAsignadas || [],
      fecha: new Date().toISOString(),
      origen: "administrador"
    };
  }

  function guardarPrincipal(accion,item){
    return asegurarSheetsService().then(function(servicio){
      return servicio.enviarPost(accion,payloadSheets(item));
    }).then(function(respuesta){
      return guardarFirebase(item).then(function(){ return respuesta; });
    });
  }

  function guardarCoordinador(datos){
    var entrada = datos || {};
    var nombre = texto(entrada.nombre);
    var telegram = texto(entrada.telegram || entrada.Telegram);
    var id = prepararCoordinadorId(nombre,entrada.id || entrada._docId);

    if (!nombre) return Promise.reject(new Error("Ingresa el nombre del coordinador."));
    if (!id) return Promise.reject(new Error("No se pudo generar el ID del coordinador."));

    return obtenerCoordinador(id).then(function(actual){
      var existe = Boolean(actual);
      var item = normalizar({
        id:id,
        nombre:nombre,
        telegram:telegram,
        activo:existe ? actual.activo !== false : true,
        carreras:existe ? actual.carreras : [],
        carrerasAsignadas:existe ? actual.carrerasAsignadas : []
      });

      return guardarPrincipal("GUARDAR_COORDINADOR",item)
        .then(function(){
          return registrar(existe ? config().accionesLog.coordinadorActualizado : config().accionesLog.coordinadorCreado,{
            coordinadorId:id,coordinadorNombre:nombre,detalle:existe ? "Coordinador actualizado en Google Sheets." : "Coordinador creado en Google Sheets."
          });
        })
        .then(function(){
          item.fuente = "google-sheets";
          item.mensaje = "Coordinador guardado en Google Sheets y respaldado en Firebase.";
          return item;
        });
    });
  }

  function cambiarEstado(id,activo){
    var docId = texto(id);
    if (!docId) return Promise.reject(new Error("ID de coordinador vacío."));

    return obtenerCoordinador(docId).then(function(actual){
      if (!actual) throw new Error("No se encontró el coordinador.");
      var item = normalizar(Object.assign({},actual,{ activo:activo === true }));
      return guardarPrincipal("CAMBIAR_ESTADO_COORDINADOR",item)
        .then(function(){
          return registrar(activo ? config().accionesLog.coordinadorActivado : config().accionesLog.coordinadorDesactivado,{
            coordinadorId:docId,detalle:activo ? "Coordinador activo en Google Sheets." : "Coordinador inactivo en Google Sheets."
          });
        })
        .then(function(){ item.mensaje = "Estado guardado en Google Sheets y respaldado en Firebase."; return item; });
    });
  }

  function normalizarClaveCarrera(valor){
    return texto(valor).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
  }

  function tokensCarrera(carrera){
    var item = carrera || {};
    var valores = typeof item === "string" ? [item] : [item.key,item.codigoCarrera,item.CodigoCarrera,item.nombreCarrera,item.NombreCarrera,item.carrera,item.nombre];
    var mapa = {};
    return valores.map(normalizarClaveCarrera).filter(function(token){ if (!token || mapa[token]) return false; mapa[token] = true; return true; });
  }

  function coincideCarrera(itemAsignado,carreraObjetivo){
    var origen = tokensCarrera(itemAsignado);
    var objetivo = tokensCarrera(carreraObjetivo);
    if (!origen.length || !objetivo.length) return false;
    return origen.some(function(token){ return objetivo.indexOf(token) >= 0; });
  }

  function claveCarrera(carrera){ var c = carrera || {}; return texto(c.codigoCarrera || c.CodigoCarrera || c.key || c.nombreCarrera || c.NombreCarrera); }
  function nombreCarrera(carrera){ var c = carrera || {}; return texto(c.nombreCarrera || c.NombreCarrera || c.carrera || c.codigoCarrera || c.key); }
  function filtrarCarrera(lista,carrera){ return (Array.isArray(lista) ? lista : []).filter(function(item){ return !coincideCarrera(item,carrera); }); }
  function construirAsignacion(carrera){
    var data = carrera || {};
    return {
      codigoCarrera:texto(data.codigoCarrera || data.CodigoCarrera || data.key),
      nombreCarrera:nombreCarrera(data),
      periodoId:texto(data.periodoId || ""),
      periodoLabel:texto(data.periodoLabel || ""),
      asignadoEn:fechaCliente(),
      asignadoPor:config().administrador
    };
  }

  function sincronizarCatalogo(lista,origen){
    var normalizados = ordenar(lista);
    if (!normalizados.length) return Promise.reject(new Error("No hay coordinadores para sincronizar."));

    return asegurarSheetsService().then(function(servicio){
      return servicio.enviarPost("SINCRONIZAR_COORDINADORES",{
        coordinadores:normalizados.map(payloadSheets),
        total:normalizados.length,
        reemplazar:true,
        origen:origen || "administrador"
      });
    }).then(function(respuesta){
      return respaldarListaFirebase(normalizados).then(function(){
        return { ok:true,total:normalizados.length,coordinadores:normalizados,respuestaSheets:respuesta,mensaje:"Catálogo sincronizado con Google Sheets y respaldado en Firebase." };
      });
    });
  }

  function sincronizarTodosConSheets(){
    return listarFirebase(1000).then(function(lista){
      return sincronizarCatalogo(lista,"administrador-sincronizacion-inicial").then(function(resultado){
        marcarMigracion();
        return resultado;
      });
    });
  }

  function guardarAsignacionCarrera(coordinadorId,carrera){
    var docId = texto(coordinadorId);
    var data = carrera || {};
    var key = claveCarrera(data);
    var nombre = nombreCarrera(data);

    if (!docId) return Promise.reject(new Error("Selecciona un coordinador."));
    if (!key && !nombre) return Promise.reject(new Error("No se pudo identificar la carrera."));

    return listarCoordinadores(500).then(function(resultado){
      var lista = (resultado.coordinadores || []).map(normalizar);
      var seleccionado = lista.find(function(item){ return texto(item.id || item._docId) === docId; });
      var anteriores = [];

      if (!seleccionado) throw new Error("No se encontró el coordinador seleccionado.");

      lista = lista.map(function(item){
        var idActual = texto(item.id || item._docId);
        var teniaCarrera = (item.carreras || []).some(function(valor){ return coincideCarrera(valor,data); }) ||
          (item.carrerasAsignadas || []).some(function(valor){ return coincideCarrera(valor,data); });
        var nuevasCarreras = filtrarCarrera(item.carreras || [],data);
        var nuevasAsignadas = filtrarCarrera(item.carrerasAsignadas || [],data);

        if (idActual === docId) {
          nuevasCarreras.push(nombre || key);
          nuevasAsignadas.push(construirAsignacion(data));
        } else if (teniaCarrera) {
          anteriores.push(idActual);
        }

        return normalizar(Object.assign({},item,{ carreras:nuevasCarreras,carrerasAsignadas:nuevasAsignadas }));
      });

      return sincronizarCatalogo(lista,"administrador-asignacion-carrera").then(function(){
        var coordinadorActualizado = lista.find(function(item){ return texto(item.id) === docId; }) || null;
        return registrar(config().accionesLog.carreraAsignada,{
          coordinadorId:docId,
          coordinadorNombre:seleccionado.nombre || docId,
          codigoCarrera:texto(data.codigoCarrera || data.CodigoCarrera || data.key),
          nombreCarrera:nombre,
          coordinadoresAnteriores:anteriores,
          detalle:anteriores.length ? "Carrera reasignada de forma exclusiva en Google Sheets." : "Carrera asignada de forma exclusiva en Google Sheets."
        }).then(function(){
          return {
            ok:true,carrera:data,coordinador:coordinadorActualizado,coordinadoresAnteriores:anteriores,
            mensaje:"Asignación guardada en Google Sheets y respaldada en Firebase."
          };
        });
      });
    });
  }

  function vincularCarrera(coordinadorId,carrera){ return guardarAsignacionCarrera(coordinadorId,carrera); }

  window.ADCoordinadoresService = {
    prepararCoordinadorId:prepararCoordinadorId,
    listarCoordinadores:listarCoordinadores,
    obtenerCoordinador:obtenerCoordinador,
    guardarCoordinador:guardarCoordinador,
    cambiarEstado:cambiarEstado,
    coincideCarrera:coincideCarrera,
    guardarAsignacionCarrera:guardarAsignacionCarrera,
    vincularCarrera:vincularCarrera,
    asignarCarrera:guardarAsignacionCarrera,
    sincronizarCatalogo:sincronizarCatalogo,
    sincronizarTodosConSheets:sincronizarTodosConSheets,
    listarFirebase:listarFirebase,
    asegurarSheetsService:asegurarSheetsService
  };
})(window,document);
