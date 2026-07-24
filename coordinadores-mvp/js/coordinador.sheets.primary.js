/* Coordinadores: toda la operación se realiza con Firebase Títulos. */
(function(window){
'use strict';

var CACHE_CONFIG_MS=5*60*1000;
var CACHE_COORDINADORES_MS=5*60*1000;
var memoria={};
var enCurso={};

function config(){return window.CoordinadorMVPConfig||null;}
function utils(){return window.CoordinadorMVPUtils||null;}
function texto(v){return String(v===null||v===undefined?'':v).trim();}
function base(){return texto(window.TITULOS_API_BASE||'https://titulos.pages.dev').replace(/\/$/,'');}
function url(){return base()+'/api/titulos';}
function mensajeError(v){return v&&v.message?v.message:typeof v==='string'?v:'Error de Firebase.';}
function ahora(){return Date.now();}
function cacheValido(clave){var item=memoria[clave];return item&&item.expira>ahora()?item.valor:null;}
function guardarCache(clave,valor,ttl){memoria[clave]={valor:valor,expira:ahora()+ttl};return valor;}
function resolverUnaVez(clave,ttl,forzar,cargador){
  if(!forzar){var guardado=cacheValido(clave);if(guardado)return Promise.resolve(guardado);if(enCurso[clave])return enCurso[clave];}
  enCurso[clave]=Promise.resolve().then(cargador).then(function(valor){return guardarCache(clave,valor,ttl);}).finally(function(){delete enCurso[clave];});
  return enCurso[clave];
}
function limpiarCache(clave){if(clave){delete memoria[clave];delete enCurso[clave];return;}memoria={};enCurso={};}

function solicitar(a,p,m){return fetch(url(),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'coordinadores'},body:JSON.stringify({accion:a,metodo:m||'POST',datos:p||{}})}).then(function(resp){return resp.text().then(function(body){var j={};try{j=body?JSON.parse(body):{};}catch(e){throw new Error('Firebase Títulos respondió en formato no válido.');}if(!resp.ok||j.ok===false)throw new Error(j.mensaje||j.error||('Error HTTP '+resp.status));return j;});});}
function tget(a,p){return solicitar(a,p,'GET');}
function tpost(a,p){return solicitar(a,p,'POST');}

function leerConfiguracion(forzar){return resolverUnaVez('configuracion',CACHE_CONFIG_MS,forzar===true,function(){return solicitar('CONFIGURACION_PUBLICA',{},'GET').then(function(x){return{activo:x.activo!==false,titulos:x,origen:'FIREBASE_TITULOS'};});});}
function enviarAccion(a,p){var l=['PING','LISTAR_COORDINADORES','LISTAR_ENVIOS_COORDINADOR','LISTAR_ENVIOS_POR_CARRERA','VERIFICAR_ENVIO','CONSULTAR_ENVIO_CEDULA'];return l.indexOf(String(a||'').toUpperCase())>=0?tget(a,p):tpost(a,p);}
function rec(v,k,n){if(n>6||v===null||v===undefined)return[];if(Array.isArray(v))return v;if(typeof v!=='object')return[];for(var i=0;i<k.length;i++)if(Array.isArray(v[k[i]]))return v[k[i]];var ks=Object.keys(v);for(var j=0;j<ks.length;j++){var x=rec(v[ks[j]],k,n+1);if(x.length)return x;}return[];}
function lista(r,t){var k=t==='coordinadores'?['coordinadores','registros','filas','rows','items','resultado','result','data']:t==='periodos'?['periodos','periods','registros','items','resultado','result','data']:['envios','registros','filas','rows','items','resultado','result','data'];return rec(r,k,0);}
function campo(f,a,z){return utils().obtenerCampoFlexible(f||{},a||[],z===undefined?'':z);}
function norm(v){return texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function favorito(v,t){var x=texto(v);if(/^[123]$/.test(x))return Number(x);var m=x.match(/(?:t[ií]tulo|propuesta|opci[oó]n|favorito)\s*#?\s*([123])/i);if(m)return Number(m[1]);var n=norm(x);for(var i=0;i<3;i++)if(n&&norm(t[i])===n)return i+1;return 0;}

function normalizarCoordinador(f,i){var c=config().data.columnas.coordinadores,n=utils().limpiarTexto(campo(f,c.nombre,'')),cs=utils().normalizarCarreras(campo(f,c.carreras,'')),activo=utils().parseBoolean(campo(f,c.activo,'ACTIVO'),true);return{id:utils().normalizarClave(f.id||f.idRegistro||n||('coordinador_'+i)),nombre:n,carreras:cs,carrerasTexto:utils().carrerasComoTexto(cs),activo:activo,fuente:'FIREBASE_TITULOS',raw:f||{}};}
function normalizarEnvio(f,i){var c=config().data.columnas.envios;f=f||{};var t=[utils().limpiarTitulo(campo(f,c.titulo1,'')),utils().limpiarTitulo(campo(f,c.titulo2,'')),utils().limpiarTitulo(campo(f,c.titulo3,''))],pr=utils().limpiarTexto(campo(f,c.preferido,'')),pn=favorito(pr,t),e=utils().normalizarEstado(utils().limpiarTexto(campo(f,c.estado,''))||utils().limpiarTexto(campo(f,c.estadoFirebase,''))||config().obtenerEstado('pendiente'));if(e==='ENVIADO'||e==='PENDIENTE_SYNC')e=config().obtenerEstado('pendiente');var p=utils().limpiarTexto(campo(f,c.periodo,'')),id=utils().limpiarTexto(campo(f,c.idRegistro,''))||utils().limpiarTexto(f.id||f.ID||f._id||''),x={id:id,_clave:id,fila:f.__fila||f.fila||f.rowNumber||i+2,cedula:utils().limpiarCedula(campo(f,c.cedula,'')),nombres:utils().limpiarTexto(campo(f,c.nombres,'')),carrera:utils().limpiarTexto(campo(f,c.carrera,'')),codigoCarrera:utils().limpiarTexto(f.codigoCarrera||f.CodigoCarrera||''),periodo:p,periodoLabel:utils().limpiarTexto(f.periodoLabel||p),periodoId:utils().limpiarTexto(f.periodoId||p),telegram:utils().limpiarTexto(campo(f,c.telegram,'')),estado:e,fechaEnvio:utils().limpiarTexto(campo(f,c.fechaEnvio,'')),titulo1:t[0],titulo2:t[1],titulo3:t[2],tituloPreferido:pr||String(pn||''),tituloPreferidoNumero:pn,tituloPreferidoTexto:pn?t[pn-1]:pr,preferido:pn||pr,tituloAprobado:utils().limpiarTitulo(campo(f,c.tituloAprobado,'')),comentarioCoordinador:utils().limpiarTextoMultilinea(campo(f,c.comentarioCoordinador,'')),coordinador:utils().limpiarTexto(campo(f,c.coordinador,'')),fechaRevision:utils().limpiarTexto(campo(f,c.fechaRevision,'')),fuente:'FIREBASE_TITULOS',raw:f};if(!x.id)x.id=x.cedula||('envio_'+i);return x;}

function listarCoordinadores(forzar){return resolverUnaVez('coordinadores',CACHE_COORDINADORES_MS,forzar===true,function(){return tget('LISTAR_COORDINADORES',{}).then(function(r){var l=lista(r,'coordinadores').map(normalizarCoordinador).filter(function(x){return x&&x.activo!==false&&x.nombre;});if(!l.length)throw new Error('Firebase Títulos no devolvió coordinadores activos.');return l;});});}
function listarPeriodos(){return Promise.reject(new Error('El módulo de envíos todavía no ha construido los períodos de Firebase Títulos.'));}
function listarEnvios(op){op=op||{};var cs=op.carreras||(op.coordinador&&op.coordinador.carreras)||[];return tget('LISTAR_ENVIOS_POR_CARRERA',{carreras:Array.isArray(cs)?cs.join(','):cs,carrera:Array.isArray(cs)?cs.join(','):cs,estado:'',periodo:op.periodo||op.periodoId||''}).then(function(r){return lista(r,'envios').map(normalizarEnvio).filter(function(x){return x&&x.cedula&&(x.titulo1||x.titulo2||x.titulo3);});});}
function consultarEnvioPorCedula(c,p){c=utils().limpiarCedula(c);if(!c)return Promise.reject(new Error('No se recibió una cédula válida.'));return tget('VERIFICAR_ENVIO',{cedula:c,numeroIdentificacion:c,periodo:texto(p)}).then(function(r){var e=r.envio||r.registro||r.data&&(r.data.envio||r.data.registro);if(!e){var l=lista(r,'envios');e=l[l.length-1];}if(!e)throw new Error('Firebase Títulos no devolvió el envío.');return normalizarEnvio(e,0);});}
function nc(v){return typeof v==='string'?v:texto(v&&(v.nombre||v.coordinador||v.id));}
function aprobarEnvio(e,res){e=e||{};res=res||{};var f=utils().limpiarTitulo(res.tituloFinal),o=utils().limpiarTitulo(res.tituloOriginal);if(!f)return Promise.reject(new Error(config().obtener('textos.seleccionaTitulo')));var st=f===o?config().obtenerEstado('aprobado'):config().obtenerEstado('reemplazado'),p={cedula:e.cedula,numeroIdentificacion:e.cedula,periodo:e.periodoLabel||e.periodo,estudiante:e.nombres,nombres:e.nombres,carrera:e.carrera,coordinador:nc(res.coordinador),estadoFinal:st,estado:st,tituloElegido:o||f,preferido:o||f,tituloCorregido:f!==o?f:'',observacion:utils().limpiarTextoMultilinea(res.comentarioCoordinador),comentario:utils().limpiarTextoMultilinea(res.comentarioCoordinador),fechaResolucion:utils().fechaIso(),permitirReenvio:false};return tpost('GUARDAR_RESOLUCION',p).then(function(r){limpiarCache();return{ok:true,estado:st,mensaje:r.mensaje||config().obtener('textos.aprobarOk'),respuesta:r,payload:p};});}
function devolverEnvio(e,res){e=e||{};res=res||{};var c=utils().limpiarTextoMultilinea(res.comentarioCoordinador);if(c.length<4)return Promise.reject(new Error(config().obtener('textos.comentarioDevolucion')));var st=config().obtenerEstado('devuelto'),el=e.tituloPreferidoTexto||e.tituloPreferido||e.titulo1||'',p={cedula:e.cedula,numeroIdentificacion:e.cedula,periodo:e.periodoLabel||e.periodo,estudiante:e.nombres,nombres:e.nombres,carrera:e.carrera,coordinador:nc(res.coordinador),estadoFinal:st,estado:st,tituloElegido:el,preferido:el,tituloCorregido:'',observacion:c,comentario:c,fechaResolucion:utils().fechaIso(),permitirReenvio:true};return tpost('GUARDAR_RESOLUCION',p).then(function(r){limpiarCache();return{ok:true,estado:st,mensaje:r.mensaje||config().obtener('textos.devolverOk'),respuesta:r,payload:p};});}
function diagnostico(){return Promise.all([leerConfiguracion(),tget('PING',{})]).then(function(p){return{ok:true,fuentePrincipal:'FIREBASE_TITULOS',titulos:p[1],configuracion:p[0],fecha:new Date().toISOString()};});}

window.CoordinadorMVPSheetsPrimary=Object.freeze({leerConfiguracion:leerConfiguracion,enviarAccion:enviarAccion,enviarGet:tget,enviarPost:tpost,listarCoordinadores:listarCoordinadores,listarPeriodos:listarPeriodos,listarEnvios:listarEnvios,consultarEnvioPorCedula:consultarEnvioPorCedula,aprobarEnvio:aprobarEnvio,devolverEnvio:devolverEnvio,diagnostico:diagnostico,normalizarCoordinador:normalizarCoordinador,normalizarEnvio:normalizarEnvio,mensajeError:mensajeError,extraerLista:lista,limpiarCache:limpiarCache});
})(window);
