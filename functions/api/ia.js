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

function corsHeaders(request) {
  const origin = request && request.headers
    ? request.headers.get("Origin")
    : "";

  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(request)
    }
  });
}

function text(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function number(value, fallback) {
  const normalized = typeof value === "string"
    ? value.replace(",", ".")
    : value;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function providerError(message, httpStatus = 0, code = "PROVIDER_ERROR") {
  const error = new Error(text(message) || "Error del proveedor IA.");
  error.httpStatus = number(httpStatus, 0);
  error.code = text(code) || "PROVIDER_ERROR";
  return error;
}

function safeEndpoint(value) {
  const raw = text(value);
  if (!raw) throw providerError("El proveedor no tiene endpoint configurado.", 0, "ENDPOINT_MISSING");

  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw providerError("El endpoint debe utilizar HTTPS.", 0, "ENDPOINT_NOT_HTTPS");
  }

  const hostname = url.hostname.toLowerCase();
  const allowed = ALLOWED_HOSTS.has(hostname) ||
    hostname.endsWith(".workers.dev") ||
    hostname.endsWith(".pages.dev");

  if (!allowed) {
    throw providerError("El dominio del endpoint no está permitido por el proxy IA.", 0, "ENDPOINT_NOT_ALLOWED");
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
  if (!apiKey) throw providerError("Gemini no tiene API key configurada.", 0, "API_KEY_MISSING");

  return "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) +
    ":generateContent?key=" +
    encodeURIComponent(apiKey);
}

function openAiHeaders(provider, apiKey) {
  if (!apiKey) throw providerError("El proveedor no tiene API key o token configurado.", 0, "API_KEY_MISSING");

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
      data && (data.message || data.mensaje || data.detail) ||
      "HTTP " + response.status;
    throw providerError(
      typeof detail === "string" ? detail : JSON.stringify(detail),
      response.status,
      "HTTP_" + response.status
    );
  }

  return data;
}

async function fetchWithTimeout(endpoint, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(endpoint, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw providerError("El proveedor superó el tiempo máximo de espera.", 0, "TIMEOUT");
    }
    if (error && error.message === "Failed to fetch") {
      throw providerError("No fue posible conectar con el proveedor.", 0, "FAILED_TO_FETCH");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
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
  const timeoutMs = Math.max(5000, number(options.timeoutMs || provider.timeoutMs, 45000));
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
    if (!model) throw providerError("El proveedor no tiene modelo configurado.", 0, "MODEL_MISSING");
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

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  }, timeoutMs);
  const data = await readUpstream(response);
  let output;

  if (type === "gemini") output = extractGemini(data);
  else if (type === "openai-compatible") output = extractOpenAi(data);
  else if (type === "cloudflare") output = extractCloudflare(data);
  else output = extractGeneric(data);

  if (!text(output)) {
    throw providerError(
      "El proveedor respondió correctamente, pero no devolvió texto utilizable.",
      response.status,
      "EMPTY_OUTPUT"
    );
  }

  return {
    text: output,
    status: response.status,
    type,
    model
  };
}

async function handlePost(request) {
  const contentType = request.headers.get("Content-Type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return json(request, { ok: false, error: "Se esperaba application/json.", code: "INVALID_CONTENT_TYPE" }, 415);
  }

  const payload = await request.json();
  const provider = payload && payload.provider || {};
  const providerId = text(provider.id || provider.proveedor);
  const model = text(provider.modelo || provider.model);
  const prompt = text(payload && payload.prompt);
  const options = payload && payload.options || {};

  if (!providerId) {
    return json(request, { ok: false, error: "Falta el ID del proveedor.", code: "PROVIDER_ID_MISSING" }, 400);
  }
  if (!prompt) {
    return json(request, { ok: false, error: "Falta el prompt.", code: "PROMPT_MISSING" }, 400);
  }

  const startedAt = Date.now();

  try {
    const result = await callProvider(provider, prompt, options);

    return json(request, {
      ok: true,
      provider: providerId,
      model: result.model || model,
      type: result.type,
      text: result.text,
      latencyMs: Date.now() - startedAt,
      httpStatus: result.status
    });
  } catch (error) {
    error.providerId = providerId;
    error.model = model;
    error.latencyMs = Date.now() - startedAt;
    throw error;
  }
}

export async function onRequest(context) {
  const request = context.request;
  const method = request.method.toUpperCase();

  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(request),
        "Cache-Control": "no-store"
      }
    });
  }

  if (method === "GET") {
    return json(request, {
      ok: true,
      service: "IA proxy",
      version: "1.3.0",
      message: "Utiliza POST para ejecutar un proveedor IA."
    });
  }

  if (method !== "POST") {
    return json(request, {
      ok: false,
      error: "Método no permitido. Utiliza POST.",
      code: "METHOD_NOT_ALLOWED"
    }, 405);
  }

  try {
    return await handlePost(request);
  } catch (error) {
    return json(request, {
      ok: false,
      provider: text(error && error.providerId),
      model: text(error && error.model),
      error: error && error.message ? error.message : String(error),
      code: text(error && error.code || "PROVIDER_ERROR"),
      httpStatus: number(error && error.httpStatus, 0),
      latencyMs: number(error && error.latencyMs, 0)
    }, 502);
  }
}
