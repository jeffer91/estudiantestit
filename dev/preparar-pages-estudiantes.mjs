import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const source = path.join(root, 'estudiantes-mvp');
const output = path.join(root, '.pages-estudiantes');
const publicStudent = path.join(output, 'estudiantes');
const VERSION = '2.3.6';

if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) {
  throw new Error('No se encontró la carpeta estudiantes-mvp.');
}

const studentEntry = path.join(source, 'estudiante.html');
if (!fs.existsSync(studentEntry)) {
  throw new Error('No se encontró estudiantes-mvp/estudiante.html.');
}

const runtimeFix = path.join(source, 'js', 'estudiante.devolucion.runtime.js');
if (!fs.existsSync(runtimeFix)) {
  throw new Error('No se encontró estudiante.devolucion.runtime.js. Ejecuta git pull origin main.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

/*
  Se publica solamente la aplicación de estudiantes.
  Coordinadores y administrador permanecen fuera de los archivos estáticos.
*/
fs.cpSync(source, publicStudent, {
  recursive: true,
  force: true
});

/*
  La consulta optimizada se carga después de sheets.service.js y antes del
  controlador de revisión. El runtime de devolución se carga al final para
  combinar datos académicos, Envios y Resoluciones incluso si una respuesta
  de Apps Script llega como JSON anidado.
*/
const copiedEntry = path.join(publicStudent, 'estudiante.html');
let studentHtml = fs.readFileSync(copiedEntry, 'utf8');
studentHtml = studentHtml.replace(/\?v=2\.3\.\d+/g, `?v=${VERSION}`);

const optimizedScript = `  <script src="js/estudiante.consulta.optimizada.js?v=${VERSION}"></script>\n`;
if (!studentHtml.includes('estudiante.consulta.optimizada.js')) {
  const revisionScript = /\s*<script src="js\/estudiante\.consulta\.revision\.js[^>]*><\/script>/;
  if (revisionScript.test(studentHtml)) {
    studentHtml = studentHtml.replace(revisionScript, `\n${optimizedScript}$&`);
  } else {
    studentHtml = studentHtml.replace('</body>', `${optimizedScript}</body>`);
  }
}

const runtimeScript = `  <script src="js/estudiante.devolucion.runtime.js?v=${VERSION}"></script>\n`;
if (!studentHtml.includes('estudiante.devolucion.runtime.js')) {
  studentHtml = studentHtml.replace('</body>', `${runtimeScript}</body>`);
}

if (!studentHtml.includes('estado de tus propuestas')) {
  throw new Error('El estudiante.html local está desactualizado. Ejecuta git pull origin main antes de desplegar.');
}
if (!studentHtml.includes('estudiante.devolucion.runtime.js')) {
  throw new Error('No se pudo insertar el runtime de devoluciones.');
}

fs.writeFileSync(copiedEntry, studentHtml, 'utf8');

const indexHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="refresh" content="0;url=/estudiantes/estudiante">
  <title>Registro de Títulos Académicos</title>
  <link rel="canonical" href="/estudiantes/estudiante">
</head>
<body>
  <p>Abriendo el registro de títulos académicos…</p>
  <p><a href="/estudiantes/estudiante">Continuar al formulario</a></p>
</body>
</html>`;

const notFoundHtml = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Página no encontrada</title>
</head>
<body>
  <h1>Página no encontrada</h1>
  <p><a href="/estudiantes/estudiante">Ir al registro de títulos académicos</a></p>
</body>
</html>`;

const headers = `/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
  Cache-Control: no-cache, no-store, must-revalidate

/estudiantes/*
  Cache-Control: no-cache, no-store, must-revalidate
`;

fs.writeFileSync(path.join(output, 'index.html'), indexHtml, 'utf8');
fs.writeFileSync(path.join(output, '404.html'), notFoundHtml, 'utf8');
fs.writeFileSync(path.join(output, '_headers'), headers, 'utf8');

const forbidden = [
  path.join(output, 'coordinadores-mvp'),
  path.join(output, 'administrador')
];

for (const directory of forbidden) {
  if (fs.existsSync(directory)) {
    throw new Error(`Se incluyó una carpeta privada por error: ${directory}`);
  }
}

console.log('[Pages estudiantes] Carpeta preparada en .pages-estudiantes.');
console.log('[Pages estudiantes] Ruta pública: /estudiantes/estudiante');
console.log(`[Pages estudiantes] Consulta y devolución activas (${VERSION}).`);
console.log('[Pages estudiantes] Coordinadores y administrador no fueron copiados.');
console.log('[Pages estudiantes] La carpeta functions permanece en la raíz para habilitar /api/*.');
