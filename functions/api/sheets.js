import { getDocument, text } from '../_lib/firestore.js';

const ORIGINS = new Set([
  'null',
  'https://titulos.pages.dev',
  'https://titulos-administrador.pages.dev',
  'https://titulos-coordinadores.pages.dev',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:8787',
  'http://localhost:8787',
  'http://127.0.0.1:8788',
  'http://localhost:8788'
]);

const STUDENT = new Set([
  'PING','CONFIGURACION_PUBLICA','CONSULTAR_ENVIO_CEDULA',
  'VERIFICAR_ENVIO','ENVIO_ESTUDIANTE'
]);

const COORDINATOR = new Set([
  'PING','CONFIGURACION_PUBLICA','LISTAR_COORDINADORES',
  'LISTAR_PERIODOS_TITULACION','LISTAR_ENVIOS_COORDINADOR',
  'LISTAR_ENVIOS_POR_CARRERA','VERIFICAR_ENVIO',
  'CONSULTAR_ENVIO_CEDULA','APROBAR_ENVIO_COORDINADOR',
  'DEVOLVER_ENVIO_COORDINADOR','GUARDAR_REVISION_COORDINADOR',
  'GUARDAR_RESOLUCION','MOVER_DEVUELTO_COORDINADOR','GUARDAR_LOG'
]);

const ADMIN = new Set([
  ...STUDENT,...COORDINATOR,'RESUMEN_ADMINISTRADOR',
  'LISTAR_BASE_ESTUDIANTES','GUARDAR_PERIODOS_TITULACION',
  'GUARDAR_COORDINADOR','CAMBIAR_ESTADO_COORDINADOR',
  'SINCRONIZAR_COORDINADORES','ADMIN_DEVOLVER_TITULOS',
  'ADMIN_ELIMINAR_TITULOS','LISTAR_PENDIENTES_SYNC',
  'LISTAR_HISTORIAL_REPARACIONES','LISTAR_LOGS',
  'ANALIZAR_GOOGLE_SHEETS','CORREGIR_GOOGLE_SHEETS',
  'CONSULTAR_ESTUDIANTE'
]);

const READS = new Set([
  'PING','LISTAR_COORDINADORES','LISTAR_PERIODOS_TITULACION',
  'LISTAR_ENVIOS_COORDINADOR','LISTAR_ENVIOS_POR_CARRERA',
  'VERIFICAR_ENVIO','CONSULTAR_ENVIO_CEDULA',
  'RESUMEN_ADMINISTRADOR','LISTAR_BASE_ESTUDIANTES',
  'LISTAR_PENDIENTES_SYNC','LISTAR_HISTORIAL_REPARACIONES',
  'LISTAR_LOGS','ANALIZAR_GOOGLE_SHEETS','CONSULTAR_ESTUDIANTE'
]);

function origin(request){ return text(request.headers.get('Origin')); }
function appId(request){ return text(request.headers.get('X-Titulos-App')).toLowerCase(); }

function cors(request){
  const o = origin(request);
  const headers = {
    'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type, X-Titulos-App',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  };
  if(o && ORIGINS.has(o)) headers['Access-Control-Allow-Origin'] = o;
  return headers;
}

function reply(request,data,status=200){
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      ...cors(request)
    }
  });
}

function role(request){
  const o = origin(request).toLowerCase();
  if(o.includes('titulos-administrador.pages.dev')) return 'admin';
  if(o.includes('titulos-coordinadores.pages.dev')) return 'coordinator';
  if(o.includes('titulos.pages.dev')) return 'student';
  if(o === 'null' || o.includes('localhost') || o.includes('127.0.0.1')){
    const app = appId(request);
    if(app === 'administrador' || app === 'admin') return 'admin';
    if(app === 'coordinadores' || app === 'coordinador' || app === 'coordinator') return 'coordinator';
  }
  return 'student';
}

function allowed(r,a){
  return r === 'admin' ? ADMIN.has(a) : r === 'coordinator' ? COORDINATOR.has(a) : STUDENT.has(a);
}

function action(value){ return text(value).toUpperCase().replace(/[^A-Z0-9_]/g,''); }
function boolean(value){
  if(value === false) return false;
  return !['false','0','no','inactivo'].includes(text(value).toLowerCase());
}

function validarEndpoint(value){
  const raw = text(value);
  if(!raw) return '';
  const url = new URL(raw);
  if(url.protocol !== 'https:' || !['script.google.com','script.googleusercontent.com'].includes(url.hostname)){
    throw new Error('La URL de Apps Script no es válida.');
  }
  return url.toString();
}

function limitePromesa(promesa,ms,mensaje){
  return Promise.race([
    promesa,
    new Promise((_,reject)=>setTimeout(()=>reject(new Error(mensaje)),ms))
  ]);
}

async function config(env){
  const endpointDirecto = validarEndpoint(
    env.APPS_SCRIPT_URL || env.SHEETS_WEB_APP_URL || env.APPS_SCRIPT_ENDPOINT
  );

  if(endpointDirecto){
    return {
      endpoint:endpointDirecto,
      activo:boolean(env.SHEETS_ACTIVO === undefined ? true : env.SHEETS_ACTIVO),
      timeoutMs:Math.min(60000,Math.max(5000,Number(env.SHEETS_TIMEOUT_MS || 45000))),
      nombre:text(env.SHEETS_NOMBRE || 'Google Sheets Titulación'),
      origenConfig:'variable-local'
    };
  }

  let item;
  try{
    item = await limitePromesa(
      getDocument(env,text(env.SHEETS_CONFIG_DOC) || 'app_config/titulos_sheets',{allowPublic:true}),
      12000,
      'La lectura de configuración en Firebase superó el tiempo máximo.'
    );
  }catch(error){
    throw new Error(
      'No se pudo obtener la configuración de Google Sheets. ' +
      'Para pruebas locales configura APPS_SCRIPT_URL en el archivo .dev.vars. ' +
      'Detalle: ' + (error.message || String(error))
    );
  }

  if(!item){
    throw new Error(
      'No existe la configuración de Google Sheets. ' +
      'Configura APPS_SCRIPT_URL en .dev.vars o crea app_config/titulos_sheets en Firebase.'
    );
  }

  const endpoint = validarEndpoint(
    item.endpoint || item.url || item.webAppUrl || item.appsScriptUrl || item.sheetsWebAppUrl
  );
  if(!endpoint) throw new Error('No existe la URL de Apps Script.');

  return {
    endpoint,
    activo:boolean(item.activo !== undefined ? item.activo : item.sheetsActivo),
    timeoutMs:Math.min(60000,Math.max(5000,Number(item.timeoutMs || 45000))),
    nombre:text(item.nombre || 'Google Sheets Titulación'),
    origenConfig:'firebase'
  };
}

function serialize(value){
  if(value === null || value === undefined) return '';
  if(Array.isArray(value)) return value.join(',');
  if(typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function getUrl(endpoint,a,payload,secret,r){
  const url = new URL(endpoint);
  url.searchParams.set('accion',a);
  url.searchParams.set('action',a);
  url.searchParams.set('origen',r === 'admin' ? 'administrador' : r === 'coordinator' ? 'coordinadores-mvp' : 'estudiantes-mvp');
  if(secret) url.searchParams.set('token',secret);

  Object.keys(payload || {}).forEach((key)=>{
    if(['accion','action','tipo','datos','token','metodo'].includes(key)) return;
    const value = serialize(payload[key]);
    if(value !== '') url.searchParams.set(key,value);
  });

  return url.toString();
}

async function upstream(response){
  const raw = await response.text();
  let data;
  try{ data = raw ? JSON.parse(raw) : {}; }
  catch(error){ throw new Error('Apps Script respondió en un formato no válido.'); }
  if(!response.ok || data.ok === false){
    throw new Error(text(data.mensaje || data.message || data.error) || 'Apps Script devolvió un error.');
  }
  return data;
}

async function timed(url,options,ms){
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),ms);
  try{ return await fetch(url,{...options,signal:controller.signal}); }
  catch(error){
    if(error && error.name === 'AbortError') throw new Error('La conexión con Apps Script superó el tiempo máximo.');
    throw error;
  }finally{ clearTimeout(timer); }
}

export async function onRequest({request,env}){
  const o = origin(request);
  if(o && !ORIGINS.has(o)) return reply(request,{ok:false,mensaje:'Origen no permitido.'},403);
  if(request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors(request)});
  if(request.method !== 'POST') return reply(request,{ok:false,mensaje:'Método no permitido.'},405);

  try{
    const input = await request.json();
    const a = action(input.accion || input.action || input.tipo);
    const r = role(request);

    if(!a) throw new Error('No se indicó una acción.');
    if(!allowed(r,a)) return reply(request,{ok:false,mensaje:'Acción no permitida para esta pantalla.'},403);

    const cfg = await config(env);
    if(a === 'CONFIGURACION_PUBLICA'){
      return reply(request,{
        ok:true,
        activo:cfg.activo,
        endpoint:cfg.endpoint,
        timeoutMs:cfg.timeoutMs,
        nombre:cfg.nombre,
        origenConfig:cfg.origenConfig
      });
    }
    if(!cfg.activo) throw new Error('Google Sheets está desactivado.');

    /*
      El Apps Script compartido actualmente tiene tokenSecreto vacío.
      Por eso APPS_SCRIPT_TOKEN es opcional. Si luego se configura un token
      en Apps Script, basta con agregar el mismo valor en .dev.vars/Cloudflare.
    */
    const secret = text(env.APPS_SCRIPT_TOKEN);
    const nested = input.datos && typeof input.datos === 'object' ? input.datos : {};
    const payload = {...input,...nested};
    delete payload.token;

    const useGet = READS.has(a) && text(input.metodo).toUpperCase() !== 'POST';
    let response;

    if(useGet){
      response = await timed(
        getUrl(cfg.endpoint,a,payload,secret,r),
        {method:'GET',cache:'no-store'},
        cfg.timeoutMs
      );
    }else{
      const clean = {...payload};
      delete clean.accion;
      delete clean.action;
      delete clean.tipo;
      delete clean.datos;
      delete clean.metodo;

      const datos = {...clean};
      const body = {
        accion:a,
        action:a,
        tipo:a,
        origen:r === 'admin' ? 'administrador' : r === 'coordinator' ? 'coordinadores-mvp' : 'estudiantes-mvp',
        datos,
        ...clean
      };

      if(secret){
        body.token = secret;
        body.datos.token = secret;
      }

      response = await timed(
        cfg.endpoint,
        {
          method:'POST',
          cache:'no-store',
          headers:{'Content-Type':'text/plain;charset=utf-8'},
          body:JSON.stringify(body)
        },
        cfg.timeoutMs
      );
    }

    return reply(request,await upstream(response));
  }catch(error){
    return reply(request,{ok:false,mensaje:error.message || String(error)},502);
  }
}
