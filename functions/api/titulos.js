import { getPublicStatus, requestClaves, runService } from '../_lib/claves.js';
import { corsHeaders, jsonReply, normalizeAction, readJson, rejectUnknownOrigin, role, text } from '../_lib/http.js';

const ACCESS_ACTION = 'CONSULTAR_ACCESO_ESTUDIANTE';
const STUDENT = new Set(['PING','CONFIGURACION_PUBLICA',ACCESS_ACTION,'CONSULTAR_ENVIO_CEDULA','VERIFICAR_ENVIO','ENVIO_ESTUDIANTE']);
const COORDINATOR = new Set([...STUDENT,'LISTAR_COORDINADORES','LISTAR_ENVIOS_COORDINADOR','LISTAR_ENVIOS_POR_CARRERA','APROBAR_ENVIO_COORDINADOR','DEVOLVER_ENVIO_COORDINADOR','GUARDAR_REVISION_COORDINADOR','GUARDAR_RESOLUCION','MOVER_DEVUELTO_COORDINADOR','GUARDAR_LOG']);
const ADMIN = new Set([...COORDINATOR,'RESUMEN_ADMINISTRADOR','LISTAR_BASE_ESTUDIANTES','GUARDAR_COORDINADOR','ACTUALIZAR_COORDINADOR','CAMBIAR_ESTADO_COORDINADOR','ASIGNAR_CARRERA','SINCRONIZAR_COORDINADORES','ADMIN_DEVOLVER_TITULOS','ADMIN_ELIMINAR_TITULOS','LISTAR_PENDIENTES_SYNC','LISTAR_HISTORIAL_REPARACIONES','LISTAR_LOGS','ANALIZAR_GOOGLE_SHEETS','CORREGIR_GOOGLE_SHEETS','CONSULTAR_ESTUDIANTE']);
const READ_BY_ID = new Set([ACCESS_ACTION,'VERIFICAR_ENVIO','CONSULTAR_ENVIO_CEDULA']);
const WRITE_ACTIONS = new Set(['ENVIO_ESTUDIANTE','APROBAR_ENVIO_COORDINADOR','DEVOLVER_ENVIO_COORDINADOR','GUARDAR_REVISION_COORDINADOR','GUARDAR_RESOLUCION','MOVER_DEVUELTO_COORDINADOR','ADMIN_DEVOLVER_TITULOS','ADMIN_ELIMINAR_TITULOS']);
const LIST_TTL = new Map([
  ['LISTAR_COORDINADORES',5*60*1000],
  ['LISTAR_ENVIOS_COORDINADOR',60*1000],
  ['LISTAR_ENVIOS_POR_CARRERA',60*1000]
]);

const CACHE_LIMIT=400;
const verificationCache=new Map();
const verificationInflight=new Map();
const queryCache=new Map();
const queryInflight=new Map();
let publicStatusCache=null;
let publicStatusInflight=null;

function allowed(userRole,action){return userRole==='admin'?ADMIN.has(action):userRole==='coordinator'?COORDINATOR.has(action):STUDENT.has(action);}
function publicService(status,key){const list=Array.isArray(status.servicios)?status.servicios:[];return list.find((item)=>String(item.clave||item.key||'').toUpperCase()===key)||null;}
function normalizeCedula(value){const digits=text(value).replace(/\D/g,'');if(digits.length===9)return'0'+digits;return digits.length===10?digits:'';}
function verificationKey(payload){const cedula=normalizeCedula(payload.cedula||payload.numeroIdentificacion||payload.identificacion);const period=text(payload.periodoId||payload.periodo||payload.periodoLabel);return cedula?cedula+'|'+period:'';}
function stable(value){if(Array.isArray(value))return value.map(stable);if(value&&typeof value==='object'){return Object.keys(value).sort().reduce((out,key)=>{if(key!=='token'&&key!=='acceso')out[key]=stable(value[key]);return out;},{});}return value;}
function trimCache(map){while(map.size>=CACHE_LIMIT){const first=map.keys().next().value;if(first===undefined)break;map.delete(first);}}
function cacheGet(map,key){const item=map.get(key);if(!item)return null;if(item.expiresAt<=Date.now()){map.delete(key);return null;}return item.value;}
function cacheSet(map,key,value,ttl){trimCache(map);map.set(key,{value,expiresAt:Date.now()+ttl});return value;}
function clearCaches(){verificationCache.clear();verificationInflight.clear();queryCache.clear();queryInflight.clear();publicStatusCache=null;publicStatusInflight=null;}
function yes(value){return value===true||['SI','SÍ','TRUE','1','YES'].includes(text(value).toUpperCase());}
function extractEnvio(result){return result&&(result.envio||result.registro||result.data&&(result.data.envio||result.data.registro))||null;}
function envioEstado(result){const envio=extractEnvio(result)||{};return text(envio.estado||envio.estadoFinal||envio.estadoProceso||result&&result.estado).toUpperCase();}
function permiteReenvio(result){const envio=extractEnvio(result)||{};const estado=envioEstado(result);const valor=envio.permitirReenvio!==undefined?envio.permitirReenvio:result&&result.permiteReenvio;return estado==='DEVUELTO'&&(valor===undefined||valor===null||yes(valor));}
function directHasEnvio(result){return Boolean(result&&(result.existe===true||result.encontrado===true||extractEnvio(result)));}
function accessHasEnvio(result){
  const student=result&&(result.estudiante||result.registro)||{};
  const evidencia=Boolean(result&&(
    result.tieneEnvio===true||
    result.encontradoEnvio===true||
    extractEnvio(result)||
    yes(student.tieneEnvio)||
    text(student.idRegistro)
  ));
  return evidencia&&!permiteReenvio(result);
}

async function executeService(env,action,method,payload,userRole){const result=await runService(env,'TITULOS',action,method,payload,userRole);return result.respuesta||result.data||result;}
async function lookupEnvio(env,payload,userRole){
  const cedula=normalizeCedula(payload.cedula||payload.numeroIdentificacion||payload.identificacion);
  if(!cedula)return{ok:true,existe:false,encontrado:false};
  const periodo=text(payload.periodo||payload.periodoLabel||payload.periodoId);
  return executeService(env,'CONSULTAR_ENVIO_CEDULA','GET',{cedula,numeroIdentificacion:cedula,periodo,periodoLabel:text(payload.periodoLabel),periodoId:text(payload.periodoId)},userRole);
}
async function executeAccess(env,payload,userRole){
  const cedula=normalizeCedula(payload.cedula||payload.numeroIdentificacion||payload.identificacion);
  const base=await requestClaves(env,ACCESS_ACTION,{cedula,periodoId:text(payload.periodoId||payload.periodo||payload.periodoLabel)},12000);
  if(accessHasEnvio(base)&&extractEnvio(base))return base;
  const student=base.estudiante||base.registro||{};
  const direct=await lookupEnvio(env,{
    cedula,
    periodo:base.periodoLabel||student.periodoLabel||payload.periodo||payload.periodoLabel,
    periodoLabel:base.periodoLabel||student.periodoLabel||payload.periodoLabel,
    periodoId:base.periodoId||student.periodoId||payload.periodoId
  },userRole);
  if(!directHasEnvio(direct))return base;
  const envio=extractEnvio(direct);
  const permitir=permiteReenvio(direct);
  return{
    ...base,
    tieneEnvio:!permitir,
    encontradoEnvio:true,
    permiteReenvio:permitir,
    envio,
    fuenteEnvio:'ENVÍOS_RESPALDO_TITULOS_APP',
    mensaje:permitir?'El registro fue devuelto y puede corregirse.':'Tus propuestas ya fueron enviadas y están siendo revisadas por coordinación.'
  };
}
async function executeRead(env,action,method,payload,userRole){if(action===ACCESS_ACTION)return executeAccess(env,payload,userRole);return executeService(env,action,method,payload,userRole);}
async function verifyWithCache(env,action,method,payload,userRole){
  const rawKey=verificationKey(payload);if(!rawKey)return executeRead(env,action,method,payload,userRole);
  const key=action+'|'+rawKey;const cached=cacheGet(verificationCache,key);if(cached)return{...cached,cache:'worker'};
  if(verificationInflight.has(key))return verificationInflight.get(key);
  const task=executeRead(env,action,method,payload,userRole).then((result)=>{
    const positive=action===ACCESS_ACTION?accessHasEnvio(result):directHasEnvio(result);
    return cacheSet(verificationCache,key,result,positive?2*60*1000:5*1000);
  }).finally(()=>verificationInflight.delete(key));
  verificationInflight.set(key,task);return task;
}
async function queryWithCache(env,action,method,payload,userRole){const ttl=LIST_TTL.get(action);if(!ttl)return executeService(env,action,method,payload,userRole);const key=userRole+'|'+action+'|'+JSON.stringify(stable(payload));const cached=cacheGet(queryCache,key);if(cached)return cached;if(queryInflight.has(key))return queryInflight.get(key);const task=executeService(env,action,method,payload,userRole).then((result)=>cacheSet(queryCache,key,result,ttl)).finally(()=>queryInflight.delete(key));queryInflight.set(key,task);return task;}
async function getCachedPublicStatus(env){if(publicStatusCache&&publicStatusCache.expiresAt>Date.now())return publicStatusCache.value;if(publicStatusInflight)return publicStatusInflight;publicStatusInflight=getPublicStatus(env).then((value)=>{publicStatusCache={value,expiresAt:Date.now()+5*60*1000};return value;}).finally(()=>{publicStatusInflight=null;});return publicStatusInflight;}

export async function onRequest({request,env}){
  const bad=rejectUnknownOrigin(request);if(bad)return bad;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders(request)});
  if(request.method!=='POST')return jsonReply(request,{ok:false,mensaje:'Método no permitido.'},405);
  try{
    const input=await readJson(request);
    const action=normalizeAction(input.accion||input.action||input.tipo);
    const userRole=role(request);
    if(!action)throw new Error('No se indicó una acción.');
    if(!allowed(userRole,action))return jsonReply(request,{ok:false,mensaje:'Acción no permitida para esta pantalla.'},403);
    if(action==='CONFIGURACION_PUBLICA'){
      const item=publicService(await getCachedPublicStatus(env),'TITULOS');
      if(!item)throw new Error('TITULOS no está configurado en Claves.');
      return jsonReply(request,{ok:true,activo:item.activo===true,nombre:item.nombre||'RESPALDO TITULOS APP',version:item.version||'',estado:item.estado||'',mensaje:item.mensaje||'',origenConfig:'claves'});
    }
    const nested=input.datos&&typeof input.datos==='object'?input.datos:{};
    const payload={...input,...nested};delete payload.token;delete payload.acceso;

    if(action==='ENVIO_ESTUDIANTE'){
      const previo=await lookupEnvio(env,payload,userRole);
      if(directHasEnvio(previo)&&!permiteReenvio(previo)){
        return jsonReply(request,{ok:false,duplicado:true,tieneEnvio:true,envio:extractEnvio(previo),mensaje:'Tus propuestas ya fueron enviadas y están siendo revisadas por coordinación.'},409);
      }
    }

    let result;
    if(READ_BY_ID.has(action))result=await verifyWithCache(env,action,input.metodo||'POST',payload,userRole);
    else result=await queryWithCache(env,action,input.metodo||'POST',payload,userRole);
    if(WRITE_ACTIONS.has(action))clearCaches();
    return jsonReply(request,result);
  }catch(error){return jsonReply(request,{ok:false,servicio:'TITULOS',mensaje:error.message||String(error)},502);}
}
