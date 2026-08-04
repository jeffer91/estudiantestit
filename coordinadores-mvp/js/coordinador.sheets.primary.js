/* Coordinadores: lectura y escritura de artículos y Trabajos de Titulación. */
(function(window){
'use strict';

var VERSION='2.9.3';
var CACHE_CONFIG_MS=5*60*1000;
var CACHE_COORDINADORES_MS=5*60*1000;
var memoria={};
var enCurso={};

function config(){return window.CoordinadorMVPConfig||null;}
function utils(){return window.CoordinadorMVPUtils||null;}
function texto(v){return String(v===null||v===undefined?'':v).trim();}
function base(){return texto(window.TITULOS_API_BASE||'https://titulos-coordinadores.pages.dev').replace(/\/$/,'');}
function url(){return base()+'/api/titulos';}
function urlTrabajo(){return base()+'/api/trabajo-titulacion';}
function mensajeError(v){return v&&v.message?v.message:typeof v==='string'?v:'Error de Firebase Títulos.';}
function ahora(){return Date.now();}
function cacheValido(clave){var item=memoria[clave];return item&&item.expira>ahora()?item.valor:null;}
function guardarCache(clave,valor,ttl){memoria[clave]={valor:valor,expira:ahora()+ttl};return valor;}
function resolverUnaVez(clave,ttl,forzar,cargador){if(!forzar){var guardado=cacheValido(clave);if(guardado)return Promise.resolve(guardado);if(enCurso[clave])return enCurso[clave];}enCurso[clave]=Promise.resolve().then(cargador).then(function(valor){return guardarCache(clave,valor,ttl);}).finally(function(){delete enCurso[clave];});return enCurso[clave];}
function limpiarCache(clave){if(clave){delete memoria[clave];delete enCurso[clave];return;}memoria={};enCurso={};}
function solicitarEn(endpoint,a,p,m){return fetch(endpoint,{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','X-Titulos-App':'coordinadores'},body:JSON.stringify({accion:a,metodo:m||'POST',datos:p||{}})}).then(function(resp){return resp.text().then(function(body){var j={};try{j=body?JSON.parse(body):{};}catch(e){throw new Error('Firebase Títulos respondió en formato no válido.');}if(!resp.ok||j.ok===false)throw new Error(j.mensaje||j.error||('Error HTTP '+resp.status));return j;});});}
function solicitar(a,p,m){return solicitarEn(url(),a,p,m);}
function solicitarTrabajo(a,p){return solicitarEn(urlTrabajo(),a,p,'POST');}
function tget(a,p){return solicitar(a,p,'GET');}
function tpost(a,p){return solicitar(a,p,'POST');}
function leerConfiguracion(forzar){return resolverUnaVez('configuracion',CACHE_CONFIG_MS,forzar===true,function(){return solicitar('CONFIGURACION_PUBLICA',{},'GET').then(function(x){return{activo:x.activo!==false,titulos:x,origen:'FIREBASE_TITULOS'};});});}
function enviarAccion(a,p){var l=['PING','LISTAR_COORDINADORES','LISTAR_ENVIOS_COORDINADOR','LISTAR_ENVIOS_POR_CARRERA','VERIFICAR_ENVIO','CONSULTAR_ENVIO_CEDULA'];return l.indexOf(String(a||'').toUpperCase())>=0?tget(a,p):tpost(a,p);}
function rec(v,k,n){if(n>6||v===null||v===undefined)return[];if(Array.isArray(v))return v;if(typeof v!=='object')return[];for(var i=0;i<k.length;i++)if(Array.isArray(v[k[i]]))return v[k[i]];var ks=Object.keys(v);for(var j=0;j<ks.length;j++){var x=rec(v[ks[j]],k,n+1);if(x.length)return x;}return[];}
function lista(r,t){var k=t==='coordinadores'?['coordinadores','registros','filas','rows','items','resultado','result','data']:['envios','registros','filas','rows','items','resultado','result','data'];return rec(r,k,0);}
function campo(f,a,z){return utils().obtenerCampoFlexible(f||{},a||[],z===undefined?'':z);}
function norm(v){return texto(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();}
function favorito(v,t){var x=texto(v);if(/^[123]$/.test(x))return Number(x);var m=x.match(/(?:t[ií]tulo|propuesta|opci[oó]n|favorito)\s*#?\s*([123])/i);if(m)return Number(m[1]);var n=norm(x);for(var i=0;i<3;i++)if(n&&norm(t[i])===n)return i+1;return 0;}
function tipoTrabajo(f){return texto(f&&f.tipoTrabajo).toUpperCase()==='TRABAJO_TITULACION'?'TRABAJO_TITULACION':'ARTICULO_ACADEMICO';}
function normalizarCoordinador(f,i){var c=config().data.columnas.coordinadores,n=utils().limpiarTexto(campo(f,c.nombre,'')),cs=utils().normalizarCarreras(campo(f,c.carreras,'')),activo=utils().parseBoolean(campo(f,c.activo,'ACTIVO'),true);return{id:utils().normalizarClave(f.id||f.idRegistro||n||('coordinador_'+i)),nombre:n,carreras:cs,carrerasTexto:utils().carrerasComoTexto(cs),activo:activo,fuente:'FIREBASE_TITULOS',raw:f||{}};}
function normalizarEnvio(f,i){
  var c=config().data.columnas.envios;f=f||{};
  var t=[utils().limpiarTitulo(campo(f,c.titulo1,'')),utils().limpiarTitulo(campo(f,c.titulo2,'')),utils().limpiarTitulo(campo(f,c.titulo3,''))];
  var pr=utils().limpiarTexto(campo(f,c.preferido,'')),pn=favorito(pr,t);
  var e=utils().normalizarEstado(utils().limpiarTexto(campo(f,c.estado,''))||utils().limpiarTexto(campo(f,c.estadoFirebase,''))||config().obtenerEstado('pendiente'));
  if(e==='ENVIADO'||e==='PENDIENTE_SYNC')e=config().obtenerEstado('pendiente');
  var p=utils().limpiarTexto(campo(f,c.periodo,''));
  var id=utils().limpiarTexto(campo(f,c.idRegistro,''))||utils().limpiarTexto(f.envioId||f.id||f.ID||f._id||'');
  var tipo=tipoTrabajo(f);
  return{
    id:id||[f.periodoId||p,f.cedula||f.numeroIdentificacion||'',tipo,i].join('__'),_clave:id||[f.periodoId||p,f.cedula||f.numeroIdentificacion||'',tipo,i].join('__'),
    cedula:utils().limpiarCedula(campo(f,c.cedula,'')||f.cedula||f.numeroIdentificacion),nombres:utils().limpiarTexto(campo(f,c.nombres,'')||f.nombres||f.estudiante),
    carrera:utils().limpiarTexto(campo(f,c.carrera,'')||f.carrera||f.carreraNombre||f.nombreCarrera),codigoCarrera:utils().limpiarTexto(f.codigoCarrera||f.carreraCodigo||f.CodigoCarrera||f.carreraId||''),
    periodo:p||utils().limpiarTexto(f.periodoNombre||f.periodoLabel||f.periodoId),periodoLabel:utils().limpiarTexto(f.periodoLabel||f.periodoNombre||p||f.periodoId),periodoId:utils().limpiarTexto(f.periodoId||p),
    telegram:utils().limpiarTexto(campo(f,c.telegram,'')||f.telegram),celular:utils().limpiarTexto(f.celular||f.telefono||''),correoInstitucional:utils().limpiarTexto(f.correoInstitucional||''),correoPersonal:utils().limpiarTexto(f.correoPersonal||''),
    estado:e,enviado:true,tieneTitulos:Boolean(t[0]||t[1]||t[2]),puedeRevisar:true,fechaEnvio:utils().limpiarTexto(campo(f,c.fechaEnvio,'')||f.fechaEnvio),
    titulo1:t[0],titulo2:t[1],titulo3:t[2],tituloPreferido:pr||String(pn||''),tituloPreferidoNumero:pn,tituloPreferidoTexto:pn?t[pn-1]:pr,preferido:pn||pr,
    tituloAprobado:utils().limpiarTitulo(campo(f,c.tituloAprobado,'')||f.tituloFinal),comentarioCoordinador:utils().limpiarTextoMultilinea(campo(f,c.comentarioCoordinador,'')||f.observacion),
    coordinador:utils().limpiarTexto(campo(f,c.coordinador,'')||f.coordinador),fechaRevision:utils().limpiarTexto(campo(f,c.fechaRevision,'')||f.fechaResolucion),
    tipoTrabajo:tipo,tipoTrabajoLabel:tipo==='TRABAJO_TITULACION'?'Trabajo de Titulación':'Artículo académico',propuestasDetalle:Array.isArray(f.propuestasDetalle)?f.propuestasDetalle:[],
    fuente:'FIREBASE_TITULOS',raw:f
  };
}
function listarCoordinadores(forzar){return resolverUnaVez('coordinadores',CACHE_COORDINADORES_MS,forzar===true,function(){return tget('LISTAR_COORDINADORES',{}).then(function(r){var l=lista(r,'coordinadores').map(normalizarCoordinador).filter(function(x){return x&&x.activo!==false&&x.nombre;});if(!l.length)throw new Error('Firebase Títulos no devolvió coordinadores activos.');return l;});});}
function listarEnvios(){
  return Promise.all([
    tget('LISTAR_ENVIOS_POR_CARRERA',{estado:'',todas:'true',incluirTodos:'true'}).then(function(r){return lista(r,'envios');}),
    solicitarTrabajo('LISTAR_ENVIOS_TRABAJO_TITULACION',{estado:'',todas:true,incluirTodos:true}).then(function(r){return lista(r,'envios');})
  ]).then(function(resultados){return resultados[0].concat(resultados[1]).map(normalizarEnvio).filter(function(x){return x&&x.cedula&&x.tieneTitulos;});});
}
function listarPeriodos(){return listarEnvios().then(function(envios){var mapa={},periodos=[];envios.forEach(function(item){var id=texto(item.periodoId||item.periodo),label=texto(item.periodoLabel||item.periodo||id);if(!id||mapa[id])return;mapa[id]=true;periodos.push({id:id,label:label,activo:true});});return{periodos:periodos,principal:periodos[0]||null,envios:envios};});}
function consultarEnvioPorCedula(c,p,tipo,id){c=utils().limpiarCedula(c);if(!c)return Promise.reject(new Error('No se recibió una cédula válida.'));if(texto(tipo).toUpperCase()==='TRABAJO_TITULACION'){return solicitarTrabajo('CONSULTAR_ENVIO_TRABAJO_TITULACION',{cedula:c,numeroIdentificacion:c,periodo:texto(p),envioId:texto(id)}).then(function(r){var e=r.envio||r.registro;if(!e)throw new Error('No se devolvió el Trabajo de Titulación.');return normalizarEnvio(e,0);});}return tget('VERIFICAR_ENVIO',{cedula:c,numeroIdentificacion:c,periodo:texto(p)}).then(function(r){var e=r.envio||r.registro||r.data&&(r.data.envio||r.data.registro);if(!e){var l=lista(r,'envios');e=l[l.length-1];}if(!e)throw new Error('Firebase Títulos no devolvió el envío.');return normalizarEnvio(e,0);});}
function nc(v){return typeof v==='string'?v:texto(v&&(v.nombre||v.coordinador||v.id));}
function resolverEndpoint(e,p){if(e.tipoTrabajo==='TRABAJO_TITULACION')return solicitarTrabajo('GUARDAR_RESOLUCION_TRABAJO_TITULACION',p);return tpost('GUARDAR_RESOLUCION',p);}
function aprobarEnvio(e,res){e=e||{};res=res||{};var f=utils().limpiarTitulo(res.tituloFinal),o=utils().limpiarTitulo(res.tituloOriginal);if(!f)return Promise.reject(new Error(config().obtener('textos.seleccionaTitulo')));var st=f===o?config().obtenerEstado('aprobado'):config().obtenerEstado('reemplazado'),p={envioId:e.id||e._clave,tipoTrabajo:e.tipoTrabajo,cedula:e.cedula,numeroIdentificacion:e.cedula,periodo:e.periodoLabel||e.periodo,periodoId:e.periodoId,estudiante:e.nombres,nombres:e.nombres,carrera:e.carrera,coordinador:nc(res.coordinador),estadoFinal:st,estado:st,tituloElegido:o||f,preferido:o||f,tituloFinal:f,tituloCorregido:f!==o?f:'',observacion:utils().limpiarTextoMultilinea(res.comentarioCoordinador),comentario:utils().limpiarTextoMultilinea(res.comentarioCoordinador),fechaResolucion:utils().fechaIso(),permitirReenvio:false};return resolverEndpoint(e,p).then(function(r){limpiarCache();return{ok:true,estado:st,mensaje:r.mensaje||config().obtener('textos.aprobarOk'),respuesta:r,payload:p};});}
function devolverEnvio(e,res){e=e||{};res=res||{};var c=utils().limpiarTextoMultilinea(res.comentarioCoordinador);if(c.length<4)return Promise.reject(new Error(config().obtener('textos.comentarioDevolucion')));var st=config().obtenerEstado('devuelto'),el=e.tituloPreferidoTexto||e.tituloPreferido||e.titulo1||'',p={envioId:e.id||e._clave,tipoTrabajo:e.tipoTrabajo,cedula:e.cedula,numeroIdentificacion:e.cedula,periodo:e.periodoLabel||e.periodo,periodoId:e.periodoId,estudiante:e.nombres,nombres:e.nombres,carrera:e.carrera,coordinador:nc(res.coordinador),estadoFinal:st,estado:st,tituloElegido:el,preferido:el,tituloCorregido:'',observacion:c,comentario:c,fechaResolucion:utils().fechaIso(),permitirReenvio:true};return resolverEndpoint(e,p).then(function(r){limpiarCache();return{ok:true,estado:st,mensaje:r.mensaje||config().obtener('textos.devolverOk'),respuesta:r,payload:p};});}
function diagnostico(){return Promise.allSettled([leerConfiguracion(),tget('PING',{}),solicitarTrabajo('PING',{})]).then(function(p){return{ok:true,version:VERSION,soportaTrabajoTitulacion:true,fuentePrincipal:'FIREBASE_TITULOS',titulos:p[1].status==='fulfilled'?p[1].value:{error:mensajeError(p[1].reason)},trabajoTitulacion:p[2].status==='fulfilled'?p[2].value:{error:mensajeError(p[2].reason)},configuracion:p[0].status==='fulfilled'?p[0].value:{error:mensajeError(p[0].reason)},fecha:new Date().toISOString()};});}

window.CoordinadorMVPSheetsPrimary=Object.freeze({version:VERSION,soportaTrabajoTitulacion:true,leerConfiguracion:leerConfiguracion,enviarAccion:enviarAccion,enviarGet:tget,enviarPost:tpost,listarCoordinadores:listarCoordinadores,listarPeriodos:listarPeriodos,listarEnvios:listarEnvios,consultarEnvioPorCedula:consultarEnvioPorCedula,aprobarEnvio:aprobarEnvio,devolverEnvio:devolverEnvio,diagnostico:diagnostico,normalizarCoordinador:normalizarCoordinador,normalizarEnvio:normalizarEnvio,mensajeError:mensajeError,extraerLista:lista,limpiarCache:limpiarCache});
})(window);
