const TEXTO_ANTERIOR =
  'Ingresa solo tu número de cédula. La app consultará tus datos académicos en Firebase.';

const TEXTO_PUBLICO =
  'Ingresa tu número de cédula para consultar tus datos académicos.';

export async function onRequest(context) {
  let response = await context.next();

  if (!response.ok && context.env && context.env.ASSETS) {
    const url = new URL(context.request.url);
    url.pathname = '/estudiantes/estudiante.html';

    response = await context.env.ASSETS.fetch(
      new Request(url.toString(), context.request)
    );
  }

  const contentType = response.headers.get('content-type') || '';

  if (!response.ok || !contentType.includes('text/html')) {
    return response;
  }

  const html = (await response.text()).replace(
    TEXTO_ANTERIOR,
    TEXTO_PUBLICO
  );

  const headers = new Headers(response.headers);
  headers.set('content-type', 'text/html; charset=UTF-8');
  headers.set('cache-control', 'no-cache');

  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
