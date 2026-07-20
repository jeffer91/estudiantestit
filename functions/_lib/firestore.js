let tokenCache = null;

function text(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function projectId(env) {
  return text(env && env.FIREBASE_PROJECT_ID) || "utet-4387a";
}

function base64UrlFromBytes(bytes) {
  let binary = "";
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlFromText(value) {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function pemToArrayBuffer(pem) {
  const clean = text(pem)
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  if (!clean) throw new Error("FIREBASE_PRIVATE_KEY no está configurada.");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function hasServiceAccount(env) {
  return Boolean(text(env && env.FIREBASE_CLIENT_EMAIL) && text(env && env.FIREBASE_PRIVATE_KEY));
}

async function createAccessToken(env) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.token && tokenCache.expiresAt > nowSeconds + 60) return tokenCache.token;

  const email = text(env && env.FIREBASE_CLIENT_EMAIL);
  const privateKey = text(env && env.FIREBASE_PRIVATE_KEY);
  if (!email || !privateKey) throw new Error("Faltan FIREBASE_CLIENT_EMAIL o FIREBASE_PRIVATE_KEY en Cloudflare.");

  const header = base64UrlFromText(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlFromText(JSON.stringify({
    iss: email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: nowSeconds,
    exp: nowSeconds + 3600
  }));
  const unsigned = header + "." + claims;
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );
  const assertion = unsigned + "." + base64UrlFromBytes(signature);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "No se pudo autenticar con Firestore.");

  tokenCache = { token: data.access_token, expiresAt: nowSeconds + Number(data.expires_in || 3600) };
  return tokenCache.token;
}

function encodePath(path) {
  return text(path).split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function documentUrl(env, path) {
  return "https://firestore.googleapis.com/v1/projects/" +
    encodeURIComponent(projectId(env)) +
    "/databases/(default)/documents/" + encodePath(path);
}

function decodeValue(value) {
  if (!value || typeof value !== "object") return null;
  if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
  if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
  if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return value.booleanValue;
  if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return Number(value.integerValue);
  if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.prototype.hasOwnProperty.call(value, "timestampValue")) return value.timestampValue;
  if (Object.prototype.hasOwnProperty.call(value, "referenceValue")) return value.referenceValue;
  if (Object.prototype.hasOwnProperty.call(value, "geoPointValue")) return value.geoPointValue;
  if (Object.prototype.hasOwnProperty.call(value, "bytesValue")) return value.bytesValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(decodeValue);
  if (value.mapValue) return decodeFields(value.mapValue.fields || {});
  return null;
}

function decodeFields(fields) {
  const result = {};
  Object.keys(fields || {}).forEach((key) => { result[key] = decodeValue(fields[key]); });
  return result;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "string") return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === "object") {
    const fields = {};
    Object.keys(value).forEach((key) => { fields[key] = encodeValue(value[key]); });
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
}

function encodeFields(data) {
  const fields = {};
  Object.keys(data || {}).forEach((key) => {
    if (data[key] !== undefined) fields[key] = encodeValue(data[key]);
  });
  return fields;
}

async function authHeaders(env, allowPublic) {
  if (!hasServiceAccount(env)) {
    if (allowPublic) return {};
    throw new Error("La cuenta de servicio de Firebase no está configurada en Cloudflare.");
  }
  return { Authorization: "Bearer " + await createAccessToken(env) };
}

async function getDocument(env, path, options = {}) {
  const response = await fetch(documentUrl(env, path), {
    method: "GET",
    headers: await authHeaders(env, options.allowPublic === true)
  });
  if (response.status === 404) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error && data.error.message || "No se pudo leer Firestore.");
  const decoded = decodeFields(data.fields || {});
  decoded._docId = text(data.name).split("/").pop();
  decoded._name = data.name || "";
  return decoded;
}

async function listDocuments(env, collectionPath, options = {}) {
  const pageSize = Math.min(300, Math.max(1, Number(options.pageSize || 100)));
  let pageToken = "";
  const all = [];
  do {
    const url = new URL(documentUrl(env, collectionPath));
    url.searchParams.set("pageSize", String(pageSize));
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url.toString(), { headers: await authHeaders(env, options.allowPublic === true) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(data.error && data.error.message || "No se pudo listar Firestore.");
    }
    (data.documents || []).forEach((doc) => {
      const decoded = decodeFields(doc.fields || {});
      decoded._docId = text(doc.name).split("/").pop();
      decoded._name = doc.name || "";
      all.push(decoded);
    });
    pageToken = data.nextPageToken || "";
  } while (pageToken && all.length < Number(options.max || 500));
  return all.slice(0, Number(options.max || 500));
}

async function setDocument(env, path, data, options = {}) {
  const existing = options.merge === false ? {} : (await getDocument(env, path).catch(() => null) || {});
  delete existing._docId;
  delete existing._name;
  const merged = options.merge === false ? { ...(data || {}) } : { ...existing, ...(data || {}) };
  const response = await fetch(documentUrl(env, path), {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...(await authHeaders(env, false)) },
    body: JSON.stringify({ fields: encodeFields(merged) })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error && result.error.message || "No se pudo guardar en Firestore.");
  const decoded = decodeFields(result.fields || {});
  decoded._docId = text(result.name).split("/").pop();
  return decoded;
}

export { text, projectId, hasServiceAccount, getDocument, listDocuments, setDocument, decodeFields };