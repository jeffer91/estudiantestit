const ALLOWED_HOSTS = new Set([
  "generativelanguage.googleapis.com",
  "api.groq.com",
  "api.cerebras.ai",
  "integrate.api.nvidia.com",
  "models.github.ai",
  "openrouter.ai",
  "router.huggingface.co",
  "api.cloudflare.com"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function text(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function number(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function safeEndpoint(value) {
  const raw = text(value);
  if (!raw) throw new Error("El proveedor no tiene endpoint configurado.");

  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("El endpoint debe utilizar HTTPS.");
  }

  const hostname = url.hostname.toLowerCase();
  const allowed = ALLOWED_HOSTS.has(hostname) ||
    hostname.endsWith(".workers.dev") ||
    hostname.endsWith(".pages.dev");

  if (!allowed) {
    throw new Error("El dominio del endpoint no está permitido por el proxy IA.");
  }

  return url.toString();
}

function inferType(provider) {
  const id = text(provider.id || provider.proveedor).toLowerCase();
  const configured = text(provider.tipo || provider.protocol || provider.protocolo)
    .toLowerCase()
    .replace(/_/g, "-");

  if (configured) return configured;
  if (id === "gemini") return "gemini";
  if (id === "cloudflare") return "cloudflare";
  return "openai-compatible";
}

function geminiEndpoint(provider, apiKey) {
  const configured = text(provider.endpoint);
  if (configured) return safeEndpoint(configured);

  const model = text(provider.modelo || provider.model || "gemini-2.0-flash");
  if (!apiKey) throw new Error("Gemini no tiene API key configurada.");

  return "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);
}

function openAiHeaders(provider, apiKey) {
  if (!apiKey) throw new Error("El proveedor no tiene API key o token configurado.");

  const headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer " + apiKey
  };

  const id = text(provider.id || provider.proveedor).toLowerCase();
  if (id.startsWith("openrouter")) {
    headers["HTTP-Referer"] = "https://titulos.pages.dev";
    headers["X-Title"] = "Titulacion ITSQMET";
  }
  if (id === "github_models") {
    headers.Accept = "application/vnd.github+json";
  }

  return headers;
}

function extractGemini(data) {
  return data && data.candidates && data.candidates[0] &&
    data.candidates[0].content && data.candidates[0].content.parts &&
    data.candidates[0].content.parts[0] &&
    data.candidates[0].content.parts[0].text;
}

function extractOpenAi(data) {
  if (data && data.choices && data.choices[0]) {
    const first = data.choices[0];
    if (first.message && first.message.content) return first.message.content;
    if (first.text) return first.text;
  }
  return data && (data.output_text || data.text);
}

function extractCloudflare(data) {
  if (data && data.result) {
    if (data.result.response) return data.result.response;
    if (data.result.text) return data.result.text;
  }
  return data && (data.response || data.text) || extractOpenAi(data);
}

function extractGeneric(data) {
  if (!data) return "";
  if (data.sugerencias) return JSON.stringify(data);
  const value = data.text || data.output || data.response || data.respuesta || data.message;
  if (typeof value === "string") return value;
  if (value) return JSON.stringify(value);
  return JSON.stringify(data);
}

async function readUpstream(response) {
  const raw = await response.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch (error) {
    data = { text: raw, rawText: raw };
  }

  if (!response.ok) {
    const detail = data && data.error && (data.error.message || data.error) ||
      data && (data.message || data.mensaje) ||
      "HTTP " + response.status;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }

  return data;
}

async function callProvider(provider, prompt, options) {
  const type = inferType(provider);
  const apiKey = text(provider.apiKey || provider.key || provider.token);
  const model = text(provider.modelo || provider.model);
  const temperature = number(
    options.temperatura !== undefined ? options.temperatura : provider.temperatura,
    0.4
  );
  const maxTokens = Math.max(100, number(options.maxTokens || provider.maxTokens, 900));
  let endpoint;
  let headers;
  let body;

  if (type === "gemini") {
    endpoint = geminiEndpoint(provider, apiKey);
    headers = { "Content-Type": "application/json" };
    body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens
      }
    };
  } else if (type === "openai-compatible") {
    endpoint = safeEndpoint(provider.endpoint);
    if (!model) throw new Error("El proveedor no tiene modelo configurado.");
    headers = openAiHeaders(provider, apiKey);
    body = {
      model,
      messages: [
        {
          role: "system",
          content: "Eres una IA de titulación académica. Responde únicamente JSON válido."
        },
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: maxTokens,
      stream: false
    };
  } else if (type === "cloudflare") {
    endpoint = safeEndpoint(provider.endpoint);
    headers = openAiHeaders(provider, apiKey);
    body = {
      model,
      messages: [
        {
          role: "system",
          content: "Eres una IA de titulación académica. Responde únicamente JSON válido."
        },
        { role: "user", content: prompt }
      ],
      temperature,
      max_tokens: maxTokens
    };
  } else {
    endpoint = safeEndpoint(provider.endpoint);
    headers = { "Content-Type": "application/json" };
    if (apiKey) headers.Authorization = "Bearer " + apiKey;
    body = {
      prompt,
      model,
      temperature,
      max_tokens: maxTokens
    };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
  const data = await readUpstream(response);
  let output;

  if (type === "gemini") output = extractGemini(data);
  else if (type === "openai-compatible") output = extractOpenAi(data);
  else if (type === "cloudflare") output = extractCloudflare(data);
  else output = extractGeneric(data);

  if (!text(output)) {
    throw new Error("El proveedor respondió correctamente, pero no devolvió texto utilizable.");
  }

  return {
    text: output,
    status: response.status
  };
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Allow": "POST, OPTIONS",
      "Cache-Control": "no-store"
    }
  });
}

export async function onRequestPost(context) {
  const request = context.request;

  try {
    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return json({ ok: false, error: "Se esperaba application/json." }, 415);
    }

    const origin = request.headers.get("Origin");
    if (origin && new URL(origin).origin !== new URL(request.url).origin) {
      return json({ ok: false, error: "Origen no autorizado." }, 403);
    }

    const payload = await request.json();
    const provider = payload && payload.provider || {};
    const prompt = text(payload && payload.prompt);
    const options = payload && payload.options || {};

    if (!text(provider.id || provider.proveedor)) {
      return json({ ok: false, error: "Falta el ID del proveedor." }, 400);
    }
    if (!prompt) {
      return json({ ok: false, error: "Falta el prompt." }, 400);
    }

    const startedAt = Date.now();
    const result = await callProvider(provider, prompt, options);

    return json({
      ok: true,
      provider: text(provider.id || provider.proveedor),
      text: result.text,
      latencyMs: Date.now() - startedAt
    });
  } catch (error) {
    return json({
      ok: false,
      error: error && error.message ? error.message : String(error)
    }, 502);
  }
}

export function onRequestGet() {
  return json({
    ok: true,
    service: "IA proxy",
    message: "Utiliza POST para ejecutar un proveedor IA."
  });
}
