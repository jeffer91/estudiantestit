import { consultarHistorialTitulos } from '../_lib/titulos-historial.js';
import {
  corsHeaders,
  jsonReply,
  readJson,
  rejectUnknownOrigin,
  text
} from '../_lib/http.js';

export async function onRequest({ request, env }) {
  const badOrigin = rejectUnknownOrigin(request);
  if (badOrigin) return badOrigin;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') {
    return jsonReply(request, { ok: false, mensaje: 'Método no permitido.' }, 405);
  }

  try {
    const input = await readJson(request);
    const nested = input.datos && typeof input.datos === 'object' ? input.datos : {};
    const payload = { ...input, ...nested };
    const hasId = text(payload.envioId || payload.idRegistro || payload.tituloId || payload.id);
    const hasCedula = text(
      payload.cedula || payload.numeroIdentificacion || payload.identificacion
    ).replace(/\D/g, '');

    if (!hasId && !hasCedula) {
      return jsonReply(request, {
        ok: true,
        encontrado: false,
        existe: false,
        numeroEnvios: 0,
        numeroReenvios: 0,
        numeroRevisiones: 0,
        versiones: [],
        revisiones: []
      });
    }

    const result = await consultarHistorialTitulos(payload, env);
    return jsonReply(request, result);
  } catch (error) {
    /* El historial es informativo y nunca debe bloquear la pantalla principal
       ni provocar reintentos agresivos. Devuelve una respuesta válida y deja
       el diagnóstico en `advertencia` para que el estado principal pueda seguir
       consultándose directamente desde `envios`. */
    return jsonReply(request, {
      ok: true,
      encontrado: false,
      existe: false,
      numeroEnvios: 0,
      numeroReenvios: 0,
      numeroRevisiones: 0,
      versiones: [],
      revisiones: [],
      historialDisponible: false,
      advertencia: error && error.message || 'No fue posible consultar el historial.'
    });
  }
}
