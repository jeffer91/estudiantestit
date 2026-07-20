import { getDocument, text } from '../_lib/firestore.js';

const ORIGINS = new Set([
  'https://titulos.pages.dev',
  'https://titulos-administrador.pages.dev',
  'https://titulos-coordinadores.pages.dev',
  'http://127.0.0.1:5500','http://localhost:5500',
  'http://127.0.0.1:8787','http://localhost:8787'
]);
const STUDENT = new Set(['PING','CONFIGURACION_PUBLICA','CONSULTAR_ENVIO_CEDULA','VERIFICAR_ENVIO','ENVIO_ESTUDIANTE']);
const COORDINATOR = new Set(['PING','CONFIGURACION_PUBLICA','LISTAR_COORDINADORES','LISTAR_PERIODOS_TITULACION','LISTAR_ENVIOS_COORDINADOR','LISTAR_ENVIOS_POR_CARRERA','VERIFICAR_ENVIO','CONSULTAR_ENVIO_CEDULA','APROBAR_ENVIO_COORDINADOR','DEVOLVER_ENVIO_COORDINADOR','GUARDAR_REVISION_COORDINADOR','GUARDAR_RESOLUCION','MOVER_DEVUELTO_COORDINADOR','GUARDAR_LOG']);
const ADMIN = new Set([...STUDENT,...COORDINATOR,'RESUMEN_ADMINISTRADOR','LISTAR_BASE_ESTUDIANTES','GUARDAR_PERIODOS_TITULACION','GUARDAR_COORDINADOR','CAMBIAR_ESTADO_COORDINADOR','SINCRONIZAR_COORDINADORES','ADMIN_DEVOLVER_TITULOS','ADMIN_ELIMINAR_TITULOS','LISTAR_PENDIENTES_SYNC','LISTAR_HISTORIAL_REPARACIONES','LISTAR_LOGS','ANALIZAR_GOOGLE_SHEETS','CORREGIR_GOOGLE_SHEETS','CONSULTAR_ESTUDIANTE']);
const READS = new Set(['PING','LISTAR_COORDINADORES','LISTAR_PERIODOS_TITULACION','LISTAR_ENVIOS_COORDINADOR','LISTAR_ENVIOS_POR_CARRERA','VERIFICAR_ENVIO','CONSULTAR_ENVIO_CEDULA','RESUMEN_ADMINISTRADOR','LISTAR_BASE_ESTUDIANTES','LISTAR_PENDIENTES_SYNC','LISTAR_HISTORIAL_REPARACIONES','LISTAR_LOGS','ANALIZAR_GOOGLE_SHEETS','CONSULTAR_ESTUDIANTE']);

function origin(request){return text(request.headers.get('Origin'));}
function cors(request){const o=origin(request);const h={'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Vary':'Origin'};if(o&&ORIGINS.has(o))h['Access-Control-Allow-Origin']=o;return h;}
function reply(request,data,status=200){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...cors(request)}});}
function role(request){const o=origin(request).toLowerCase();if(o.includes('titulos-administrador')||o.includes('localhost')||o.includes('127.0.0.1'))return'admin';if(o.includes('titulos-coordinadores'))return'coordinator';return'student';}
function allowed(r,a){return r==='admin'?ADMIN.has(a):r==='coordinator'?COORDINATOR.has(a):STUDENT.has(a);}
function action(value){return text(value).toUpperCase().replace(/[^A-Z0-9_]/g,'');}
function boolean(value){if(value===false)return false;return !['false','0','no','inactivo'].includes(text(value).toLowerCase());}
async function config(env){const item=await getDocument(env,text(env.SHEETS_CONFIG_DOC)||'app_config/titulos_sheets',{allowPublic:true});if(!item)throw new Error('No existe la configuración de Google Sheets en Firebase.');const endpoint=text(item.endpoint||item.url||item.webAppUrl||item.appsScriptUrl||item.sheetsWebAppUrl);if(!endpoint)throw new Error('No existe la URL de Apps Script.');const u=new URL(endpoint);if(u.protocol!=='https:'||!['script.google.com','script.googleusercontent.com'].includes(u.hostname))throw new Error('La URL de Apps Script no es válida.');return{endpoint:u.toString(),activo:boolean(item.activo!==undefined?item.activo:item.sheetsActivo),timeoutMs:Math.min(60000,Math.max(5000,Number(item.timeoutMs||45000))),nombre:text(item.nombre||'Google Sheets Titulación')};}
function serialize(v){if(v===null||v===undefined)return'';if(Array.isArray(v))return v.join(',');if(typeof v==='object')return JSON.stringify(v);return String(v);}
function getUrl(endpoint,a,payload,secret,r){const u=new URL(endpoint);u.searchParams.set('accion',a);u.searchParams.set('action',a);u.searchParams.set('origen',r==='admin'?'administrador':r==='coordinator'?'coordinadores-mvp':'estudiantes-mvp');u.searchParams.set('token',secret);Object.keys(payload||{}).forEach(k=>{if(['accion','action','tipo','datos','token','metodo'].includes(k))return;const v=serialize(payload[k]);if(v!=='')u.searchParams.set(k,v);});return u.toString();}
async function upstream(response){const raw=await response.text();let data;try{data=raw?JSON.parse(raw):{};}catch(e){throw new Error('Apps Script respondió en un formato no válido.');}if(!response.ok||data.ok===false)throw new Error(text(data.mensaje||data.message||data.error)||'Apps Script devolvió un error.');return data;}
async function timed(url,options,ms){const c=new AbortController();const timer=setTimeout(()=>c.abort(),ms);try{return await fetch(url,{...options,signal:c.signal});}finally{clearTimeout(timer);}}

export async function onRequest({request,env}){
  const o=origin(request);if(o&&!ORIGINS.has(o))return reply(request,{ok:false,mensaje:'Origen no permitido.'},403);
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors(request)});
  if(request.method!=='POST')return reply(request,{ok:false,mensaje:'Método no permitido.'},405);
  try{
    const input=await request.json();const a=action(input.accion||input.action||input.tipo);const r=role(request);
    if(!a)throw new Error('No se indicó una acción.');if(!allowed(r,a))return reply(request,{ok:false,mensaje:'Acción no permitida para esta pantalla.'},403);
    const cfg=await config(env);if(a==='CONFIGURACION_PUBLICA')return reply(request,{ok:true,activo:cfg.activo,endpoint:cfg.endpoint,timeoutMs:cfg.timeoutMs,nombre:cfg.nombre});if(!cfg.activo)throw new Error('Google Sheets está desactivado.');
    const secret=text(env.APPS_SCRIPT_TOKEN);if(!secret)throw new Error('No está configurado el acceso privado de Apps Script.');
    const nested=input.datos&&typeof input.datos==='object'?input.datos:{};const payload={...input,...nested};delete payload.token;const useGet=READS.has(a)&&text(input.metodo).toUpperCase()!=='POST';let response;
    if(useGet)response=await timed(getUrl(cfg.endpoint,a,payload,secret,r),{method:'GET',cache:'no-store'},cfg.timeoutMs);
    else{const clean={...payload};delete clean.accion;delete clean.action;delete clean.tipo;delete clean.datos;delete clean.metodo;response=await timed(cfg.endpoint,{method:'POST',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({accion:a,action:a,tipo:a,origen:r==='admin'?'administrador':r==='coordinator'?'coordinadores-mvp':'estudiantes-mvp',token:secret,datos:{...clean,token:secret},...clean})},cfg.timeoutMs);}
    return reply(request,await upstream(response));
  }catch(error){return reply(request,{ok:false,mensaje:error.message||String(error)},502);}
}
