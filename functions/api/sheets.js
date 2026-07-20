import { getDocument, text } from "../_lib/firestore.js";

function respond(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return respond({}, 204);
  if (request.method !== "POST") return respond({ ok: false, mensaje: "Método no permitido." }, 405);

  try {
    const config = await getDocument(env, "app_config/titulos_sheets", { allowPublic: true });
    const endpoint = text(config && (config.endpoint || config.url));
    const accessToken = text(env.APPS_SCRIPT_TOKEN);
    if (!endpoint) throw new Error("No existe la URL de Apps Script.");
    if (!accessToken) throw new Error("No está configurado el acceso privado de Apps Script.");

    const input = await request.json();
    const details = input && input.datos && typeof input.datos === "object" ? input.datos : {};
    const body = {
      ...(input || {}),
      token: accessToken,
      datos: { ...details, token: accessToken }
    };

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    });
    const output = await upstream.text();
    return new Response(output, {
      status: upstream.status,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch (error) {
    return respond({ ok: false, mensaje: error.message || String(error) }, 502);
  }
}
