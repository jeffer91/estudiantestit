import { getPublicStatus, runService } from '../_lib/claves.js';
import { corsHeaders, jsonReply, normalizeAction, readJson, rejectUnknownOrigin, role } from '../_lib/http.js';

const STUDENT=new Set(['PING','CONFIGURACION_PUBLICA','CONSULTAR_ENVIO_CEDULA','VERIFICAR_ENVIO','ENVIO_ESTUDIANTE']);
const COORDINATOR=new Set(['PING','CONFIGURACION_PUBLICA','LISTAR_COORDINADORES','LISTAR_ENVIOS_COORDINADOR','LISTAR_ENVIOS_POR_CARRERA','VERIFICAR_ENVIO','CONSULTAR_ENVIO_CEDULA','APROBAR_ENVIO_COORDINADOR','DEVOLVER_ENVIO_COORDINADOR','GUARDAR_REVISION_COORDINADOR','GUARDAR_RESOLUCION','MOVER_DEVUELTO_COORDINADOR','GUARDAR_LOG']);
const ADMIN=new Set([...STUDENT,...COORDINATOR,'RESUMEN_ADMINISTRADOR','LISTAR_BASE_ESTUDIANTES','GUARDAR_COORDINADOR','ACTUALIZAR_COORDINADOR','CAMBIAR_ESTADO_COORDINADOR','ASIGNAR_CARRERA','SINCRONIZAR_COORDINADORES','ADMIN_DEVOLVER_TITULOS','ADMIN_ELIMINAR_TITULOS','LISTAR_PENDIENTES_SYNC','LISTAR_HISTORIAL_REPARACIONES','LISTAR_LOGS','ANALIZAR_GOOGLE_SHEETS','CORREGIR_GOOGLE_SHEETS','CONSULTAR_ESTUDIANTE']);
function allowed(r,a){return r==='admin'?ADMIN.has(a):r==='coordinator'?COORDINATOR.has(a):STUDENT.has(a);}
function publicService(status,key){const list=Array.isArray(status.servicios)?status.servicios:[];return list.find(x=>String(x.clave||x.key||'').toUpperCase()===key)||null;}

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
      const item=publicService(await getPublicStatus(env),'TITULOS');
      if(!item)throw new Error('TITULOS no está configurado en Claves.');
      return jsonReply(request,{ok:true,activo:item.activo===true,nombre:item.nombre||'RESPALDO TITULOS APP',version:item.version||'',estado:item.estado||'',mensaje:item.mensaje||'',origenConfig:'claves'});
    }
    const nested=input.datos&&typeof input.datos==='object'?input.datos:{};
    const payload={...input,...nested};delete payload.token;delete payload.acceso;
    const result=await runService(env,'TITULOS',action,input.metodo||'POST',payload,userRole);
    return jsonReply(request,result.respuesta||result.data||result);
  }catch(error){return jsonReply(request,{ok:false,servicio:'TITULOS',mensaje:error.message||String(error)},502);}
}
