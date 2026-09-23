import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const output = path.join(root, '.github-pages-site');
const parts = (process.env.GITHUB_REPOSITORY || 'jeffer91/estudiantestit').split('/');
const owner = parts[0] || 'jeffer91';
const repository = parts[1] || 'estudiantestit';
const basePath = '/' + repository;
const siteOrigin = 'https://' + owner + '.github.io';
const siteBase = siteOrigin + basePath;
const buildId = String(process.env.GITHUB_SHA || 'v4').slice(0, 12);

const apps = [
  ['estudiantes-mvp', 'estudiantes'],
  ['trabajo-titulacion-mvp', 'trabajo-titulacion'],
  ['coordinadores-mvp', 'coordinadores'],
  ['investigadores-mvp', 'investigadores'],
  ['administrador', 'administrador']
];

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const [sourceName, targetName] of apps) {
  const source = path.join(root, sourceName);
  const target = path.join(output, targetName);
  if (!fs.existsSync(source)) throw new Error('No se encontró ' + sourceName);
  fs.cpSync(source, target, { recursive: true, force: true });
}

fs.mkdirSync(path.join(output, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'github-pages', 'runtime-config.js'), path.join(output, 'assets', 'runtime-config.js'));
fs.copyFileSync(path.join(root, 'github-pages', 'firebase-auth-client.js'), path.join(output, 'assets', 'firebase-auth-client.js'));

function copyEntry(directory, sourceFile) {
  const source = path.join(output, directory, sourceFile);
  const target = path.join(output, directory, 'index.html');
  if (!fs.existsSync(source)) throw new Error('Falta entrada ' + directory + '/' + sourceFile);
  if (source !== target) fs.copyFileSync(source, target);
}
copyEntry('estudiantes', 'estudiante.html');
copyEntry('coordinadores', 'coordinador.html');
copyEntry('administrador', 'ad-index.html');

function removeCloudflareFiles(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory() && ['.wrangler', 'node_modules', '.git'].includes(item.name)) {
      fs.rmSync(full, { recursive: true, force: true });
      continue;
    }
    if (item.isDirectory()) removeCloudflareFiles(full);
    else if (['_headers', '_redirects', '_routes.json'].includes(item.name)) fs.rmSync(full, { force: true });
  }
}
removeCloudflareFiles(output);

function patchText(value) {
  let out = value;
  out = out.replace(/https:\/\/titulos-administrador\.pages\.dev/g, siteBase + '/administrador');
  out = out.replace(/https:\/\/titulos-coordinadores\.pages\.dev/g, siteBase + '/coordinadores');
  out = out.replace(/https:\/\/titulos-investigadores\.pages\.dev/g, siteBase + '/investigadores');
  out = out.replace(/https:\/\/titulos\.pages\.dev/g, siteBase);
  for (const route of ['estudiantes', 'trabajo-titulacion', 'coordinadores', 'investigadores', 'administrador']) {
    out = out.split('"/' + route + '/').join('"' + basePath + '/' + route + '/');
    out = out.split("'/" + route + "/").join("'" + basePath + '/' + route + '/');
    out = out.split('`/' + route + '/').join('`' + basePath + '/' + route + '/');
  }
  return out;
}

function cacheBust(html) {
  return html.replace(
    /(src|href)=(["'])(?!https?:\/\/|\/\/|data:|#)([^"'?#]+\.(?:js|css))(?:\?[^"']*)?\2/gi,
    function(_match, attr, quote, url) {
      return attr + '=' + quote + url + '?v=' + buildId + quote;
    }
  );
}

function inject(html, protectedPanel) {
  const common = [
    '<script src="' + basePath + '/assets/runtime-config.js"></script>'
  ];
  if (protectedPanel) {
    common.push('<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js"></script>');
    common.push('<script src="https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js"></script>');
    common.push('<script src="' + basePath + '/assets/firebase-auth-client.js"></script>');
  }
  const block = '\n  ' + common.join('\n  ') + '\n';
  return html.includes('</head>') ? html.replace('</head>', block + '</head>') : block + html;
}

function patchDirectory(directory) {
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, item.name);
    if (item.isDirectory()) {
      patchDirectory(full);
      continue;
    }
    if (!/\.(?:html|js|css|md|json)$/i.test(item.name)) continue;
    let value = fs.readFileSync(full, 'utf8');
    value = patchText(value);
    if (item.name.endsWith('.html')) {
      const relative = path.relative(output, full).replace(/\\/g, '/');
      const isProtected = relative.startsWith('administrador/') || relative.startsWith('coordinadores/');
      value = inject(value, isProtected);
      value = cacheBust(value);
    }
    fs.writeFileSync(full, value, 'utf8');
  }
}
patchDirectory(output);

const rootIndex = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Titulación</title>
  <style>body{font-family:system-ui,sans-serif;max-width:760px;margin:48px auto;padding:0 20px;color:#17395f}a{display:block;margin:12px 0;padding:14px;border:1px solid #dbe5f1;border-radius:12px;text-decoration:none;color:#174a7c;font-weight:700}</style>
</head>
<body>
  <h1>Sistema de Titulación</h1>
  <a href="${basePath}/estudiantes/">Estudiantes</a>
  <a href="${basePath}/trabajo-titulacion/">Trabajo de Titulación</a>
  <a href="${basePath}/coordinadores/">Coordinadores</a>
  <a href="${basePath}/investigadores/">Investigación</a>
  <a href="${basePath}/administrador/">Administrador</a>
</body>
</html>`;
fs.writeFileSync(path.join(output, 'index.html'), rootIndex, 'utf8');

const notFound = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Página no encontrada</title></head><body><script>location.replace('${basePath}/');</script><p><a href="${basePath}/">Volver al sistema</a></p></body></html>`;
fs.writeFileSync(path.join(output, '404.html'), notFound, 'utf8');

console.log('[GitHub Pages] Sitio generado en .github-pages-site');
console.log('[GitHub Pages] URL prevista: ' + siteBase + '/');
console.log('[GitHub Pages] Build ID: ' + buildId);
