import http from 'node:http';
import { onRequest } from '../functions/api/ia.js';

const HOST = process.env.IA_PROXY_HOST || '127.0.0.1';
const PORT = Number(process.env.IA_PROXY_PORT || 8787);
const MAX_BODY_BYTES = 2 * 1024 * 1024;

function escribirJson(res, status, data, origin = '*') {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Vary': 'Origin'
  });
  res.end(JSON.stringify(data));
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const partes = [];
    let total = 0;

    req.on('data', (parte) => {
      total += parte.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('La solicitud supera el tamaño máximo permitido.'));
        req.destroy();
        return;
      }
      partes.push(parte);
    });

    req.on('end', () => {
      resolve(Buffer.concat(partes));
    });

    req.on('error', reject);
  });
}

function convertirHeaders(headersNode) {
  const headers = new Headers();

  Object.entries(headersNode || {}).forEach(([nombre, valor]) => {
    if (Array.isArray(valor)) {
      valor.forEach((item) => headers.append(nombre, String(item)));
      return;
    }

    if (valor !== undefined) {
      headers.set(nombre, String(valor));
    }
  });

  return headers;
}

async function responderDesdeFetch(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((valor, nombre) => {
    res.setHeader(nombre, valor);
  });

  const cuerpo = Buffer.from(await response.arrayBuffer());
  res.end(cuerpo);
}

const servidor = http.createServer(async (req, res) => {
  const origin = String(req.headers.origin || '*');

  try {
    const hostHeader = req.headers.host || `${HOST}:${PORT}`;
    const url = new URL(req.url || '/', `http://${hostHeader}`);

    if (url.pathname === '/') {
      escribirJson(res, 200, {
        ok: true,
        servicio: 'Proxy IA local',
        endpoint: '/api/ia',
        puerto: PORT,
        mensaje: 'El proxy local está activo.'
      }, origin);
      return;
    }

    if (url.pathname !== '/api/ia' && url.pathname !== '/api/ia/') {
      escribirJson(res, 404, {
        ok: false,
        error: 'Ruta no encontrada.',
        ruta: url.pathname
      }, origin);
      return;
    }

    const metodo = String(req.method || 'GET').toUpperCase();
    const cuerpo = metodo === 'GET' || metodo === 'HEAD' || metodo === 'OPTIONS'
      ? undefined
      : await leerCuerpo(req);

    const request = new Request(`http://${HOST}:${PORT}${url.pathname}${url.search}`, {
      method: metodo,
      headers: convertirHeaders(req.headers),
      body: cuerpo && cuerpo.length ? cuerpo : undefined
    });

    const response = await onRequest({
      request,
      env: {},
      params: {},
      data: {}
    });

    await responderDesdeFetch(res, response);
  } catch (error) {
    escribirJson(res, 500, {
      ok: false,
      error: error && error.message ? error.message : String(error),
      code: 'LOCAL_PROXY_ERROR'
    }, origin);
  }
});

servidor.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    console.error(`\nEl puerto ${PORT} ya está ocupado.`);
    console.error('Cierra el proxy anterior o usa IA_PROXY_PORT con otro puerto.\n');
    process.exitCode = 1;
    return;
  }

  console.error(error);
  process.exitCode = 1;
});

servidor.listen(PORT, HOST, () => {
  console.log('');
  console.log('Proxy IA local iniciado correctamente.');
  console.log(`Prueba: http://${HOST}:${PORT}/api/ia`);
  console.log('Mantén esta ventana abierta mientras usas Live Server.');
  console.log('Presiona Ctrl + C para detenerlo.');
  console.log('');
});
