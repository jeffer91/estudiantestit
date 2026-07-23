import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8');
}

function replaceExact(source, before, after, label) {
  if (!source.includes(before)) {
    throw new Error('No se encontró el bloque: ' + label);
  }
  return source.replace(before, after);
}

function replaceRegex(source, expression, replacement, label) {
  if (!expression.test(source)) {
    throw new Error('No se encontró el patrón: ' + label);
  }
  return source.replace(expression, replacement);
}

// 1. Un solo controlador de consulta y contingencia local honesta.
{
  const path = 'estudiantes-mvp/js/estudiante.app.js';
  let source = read(path);

  source = replaceExact(
    source,
    "    var formConsulta;\n    var formTelegram;",
    "    var formTelegram;",
    'declaración formConsulta'
  );

  source = replaceExact(
    source,
    "    formConsulta = document.getElementById('formConsulta');\n    formTelegram = document.getElementById('formTelegram');",
    "    formTelegram = document.getElementById('formTelegram');",
    'asignación formConsulta'
  );

  source = replaceExact(
    source,
    "    if (formConsulta) {\n      formConsulta.addEventListener(\n        'submit',\n        manejarConsulta\n      );\n    }\n\n",
    '',
    'listener antiguo de consulta'
  );

  const pendingOld = `            var resultadoPendiente = {
              ok: true,
              estado: 'PENDIENTE_SYNC',
              firebase: resultadoFirebase,

              errorSheets:
                obtenerMensajeError(
                  errorSheets,
                  'No se pudo completar el envío principal.'
                ),

              mensaje:
                'No se pudo completar el envío principal, pero tu registro quedó guardado como pendiente.'
            };

            state.marcarEnviado(
              resultadoPendiente
            );

            borrarMemoriaGuardada();

            ui.pintarResultadoEnvio(
              resultadoPendiente
            );

            irPaso('enviar');`;

  const pendingNew = `            var resultadoPendiente = {
              ok: false,
              estado: 'PENDIENTE_LOCAL',
              respaldoLocal: resultadoFirebase,

              errorServidor:
                obtenerMensajeError(
                  errorSheets,
                  'No se pudo completar el envío principal.'
                ),

              mensaje:
                'No se envió al servidor. El registro quedó guardado únicamente en este navegador. Conserva esta página y vuelve a intentarlo cuando tengas conexión.'
            };

            /*
              No se marca como enviado ni se borra la memoria: el estudiante
              conserva sus datos hasta confirmar un envío real al servidor.
            */
            guardarAvance({
              pasoActual: 'enviar'
            });

            ui.pintarResultadoEnvio(
              resultadoPendiente
            );

            irPaso('enviar');`;

  source = replaceExact(source, pendingOld, pendingNew, 'contingencia local de envío');
  write(path, source);
}

// 2. Tres consultas iniciales, fallback condicional y períodos equivalentes.
{
  const path = 'functions/api/acceso-estudiante.js';
  let source = read(path);

  const normalizePeriodBlock = `function normalizePeriod(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\\u0300-\\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
}`;

  const periodHelpers = `${normalizePeriodBlock}

const MONTH_NUMBER = Object.freeze({
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
  julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10',
  noviembre: '11', diciembre: '12'
});

function periodSignature(value) {
  const normalized = normalizePeriod(value);
  if (!normalized) return '';

  const numeric = Array.from(normalized.matchAll(/\\b(20\\d{2})\\s+(0?[1-9]|1[0-2])\\b/g))
    .map((match) => match[1] + '-' + String(match[2]).padStart(2, '0'));
  if (numeric.length >= 2) return numeric[0] + '__' + numeric[1];

  const named = Array.from(normalized.matchAll(/\\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\\s+(20\\d{2})\\b/g))
    .map((match) => match[2] + '-' + MONTH_NUMBER[match[1]]);
  return named.length >= 2 ? named[0] + '__' + named[1] : '';
}

function periodEquivalent(left, right) {
  const a = normalizePeriod(left);
  const b = normalizePeriod(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const signatureA = periodSignature(a);
  const signatureB = periodSignature(b);
  return Boolean(signatureA && signatureB && signatureA === signatureB);
}`;

  source = replaceExact(source, normalizePeriodBlock, periodHelpers, 'helpers de período');

  source = replaceExact(
    source,
    `    const exact = list.filter((item) => normalizePeriod(recordPeriod(item)) === target);
    if (exact.length) return latest(exact, kind);
    const withPeriod = list.filter((item) => normalizePeriod(recordPeriod(item)));
    if (withPeriod.length > 1) return null;`,
    `    const exact = list.filter((item) => periodEquivalent(recordPeriod(item), academicPeriod));
    if (exact.length) return latest(exact, kind);
    const withPeriod = list.filter((item) => normalizePeriod(recordPeriod(item)));
    if (withPeriod.length) return null;`,
    'selección estricta de período'
  );

  source = replaceRegex(
    source,
    /function querySourceWithCompatibility\([\s\S]*?\n}\n\nfunction normalizeStudentResult/,
    'function normalizeStudentResult',
    'función de compatibilidad siempre activa'
  );

  const initialOld = `    /*
      Tres consultas lógicas simultáneas. La compatibilidad antigua se comparte
      entre Envíos y Resoluciones para no agregar una segunda espera secuencial.
    */
    const legacyPromise = queryTitles(env, 'CONSULTAR_ENVIO_CEDULA', cedula, requestedPeriod);
    const envioTask = querySourceWithCompatibility(
      queryTitles(env, 'CONSULTAR_ENVIO_BASE_CEDULA', cedula, requestedPeriod),
      legacyPromise,
      looksLikeEnvio,
      cedula,
      requestedPeriod,
      'envio'
    );
    const resolutionTask = querySourceWithCompatibility(
      queryTitles(env, 'CONSULTAR_RESOLUCION_CEDULA', cedula, requestedPeriod),
      legacyPromise,
      looksLikeResolution,
      cedula,
      requestedPeriod,
      'resolution'
    );

    const [academicSettled, envioSettled, resolutionSettled] = await Promise.allSettled([
      lookupStudent(env, cedula, requestedPeriod),
      envioTask,
      resolutionTask
    ]);`;

  const initialNew = `    /*
      Flujo normal: exactamente tres consultas iniciales y simultáneas.
      La compatibilidad antigua solo se usa después, si una fuente no devuelve
      un registro válido para el período académico del estudiante.
    */
    const [academicSettled, envioSettled, resolutionSettled] = await Promise.allSettled([
      lookupStudent(env, cedula, requestedPeriod),
      queryTitles(env, 'CONSULTAR_ENVIO_BASE_CEDULA', cedula, requestedPeriod),
      queryTitles(env, 'CONSULTAR_RESOLUCION_CEDULA', cedula, requestedPeriod)
    ]);`;

  source = replaceExact(source, initialOld, initialNew, 'tres consultas iniciales');

  const failuresOld = `    const failures = [];
    if (academicSettled.status === 'rejected') {
      failures.push({
        fuente: 'REQUISITOS',
        mensaje: text(academicSettled.reason && academicSettled.reason.message) || 'Consulta no disponible.'
      });
    }
    if (envioSettled.status === 'rejected') {
      failures.push({ fuente: 'ENVIOS', mensaje: 'No fue posible consultar los envíos.' });
    }
    if (resolutionSettled.status === 'rejected') {
      failures.push({ fuente: 'RESOLUCIONES', mensaje: 'No fue posible consultar las resoluciones.' });
    }

    const envioSources = envioSettled.status === 'fulfilled' && Array.isArray(envioSettled.value)
      ? envioSettled.value
      : [];
    const resolutionSources = resolutionSettled.status === 'fulfilled' && Array.isArray(resolutionSettled.value)
      ? resolutionSettled.value
      : [];

    if (failures.length) {
      return jsonReply(request, {
        ok: false,
        consultaCompleta: false,
        fuentesFallidas: failures,
        mensaje: 'No fue posible verificar completamente tu registro. Intenta nuevamente.',
        duracionMs: Date.now() - startedAt
      }, 502);
    }`;

  const failuresNew = `    const failures = [];
    if (academicSettled.status === 'rejected') {
      failures.push({
        fuente: 'REQUISITOS',
        mensaje: text(academicSettled.reason && academicSettled.reason.message) || 'Consulta no disponible.'
      });
    }

    const envioSources = envioSettled.status === 'fulfilled' ? [envioSettled.value] : [];
    const resolutionSources = resolutionSettled.status === 'fulfilled' ? [resolutionSettled.value] : [];

    if (failures.length) {
      return jsonReply(request, {
        ok: false,
        consultaCompleta: false,
        fuentesFallidas: failures,
        mensaje: 'No fue posible consultar tus datos académicos. Intenta nuevamente.',
        duracionMs: Date.now() - startedAt
      }, 502);
    }`;

  source = replaceExact(source, failuresOld, failuresNew, 'manejo inicial de fuentes');

  const selectionOld = `    const envio = selectRecord(envioSources, looksLikeEnvio, cedula, academicPeriod, 'envio');
    const resolucion = selectRecord(resolutionSources, looksLikeResolution, cedula, academicPeriod, 'resolution');
    const decision = effectiveState(envio, resolucion);
    const permiteReenvio = decision.estado === 'DEVUELTO';
    const tieneEnvio = Boolean(envio);
    const tieneResolucion = Boolean(resolucion);
    const envioCombinado = envio ? mergeNonEmpty(envio, resolucion || {}) : null;`;

  const selectionNew = `    let envio = selectRecord(envioSources, looksLikeEnvio, cedula, academicPeriod, 'envio');
    let resolucion = selectRecord(resolutionSources, looksLikeResolution, cedula, academicPeriod, 'resolution');
    let compatibilidadTitulos = false;
    let compatibilidadDisponible = false;

    /*
      Fallback único y condicional. También refuerza la búsqueda por período
      cuando el estudiante posee registros históricos de otros ciclos.
    */
    if (!envio || !resolucion || envioSettled.status === 'rejected' || resolutionSettled.status === 'rejected') {
      try {
        const legacy = await queryTitles(env, 'CONSULTAR_ENVIO_CEDULA', cedula, academicPeriod);
        compatibilidadTitulos = true;
        compatibilidadDisponible = true;
        envioSources.push(legacy);
        resolutionSources.push(legacy);
        if (!envio) envio = selectRecord(envioSources, looksLikeEnvio, cedula, academicPeriod, 'envio');
        if (!resolucion) resolucion = selectRecord(resolutionSources, looksLikeResolution, cedula, academicPeriod, 'resolution');
      } catch (_legacyError) {
        compatibilidadTitulos = true;
      }
    }

    if (envioSettled.status === 'rejected' && !envio && !compatibilidadDisponible) {
      failures.push({ fuente: 'ENVIOS', mensaje: 'No fue posible comprobar los títulos enviados.' });
    }
    if (resolutionSettled.status === 'rejected' && !resolucion && !compatibilidadDisponible) {
      failures.push({ fuente: 'RESOLUCIONES', mensaje: 'No fue posible comprobar la resolución del coordinador.' });
    }
    if (failures.length) {
      return jsonReply(request, {
        ok: false,
        consultaCompleta: false,
        fuentesFallidas: failures,
        mensaje: 'No fue posible verificar completamente tu registro. Intenta nuevamente.',
        duracionMs: Date.now() - startedAt
      }, 502);
    }

    const decision = effectiveState(envio, resolucion);
    const permiteReenvio = decision.estado === 'DEVUELTO';
    const tieneEnvio = Boolean(envio);
    const tieneResolucion = Boolean(resolucion);
    const envioCombinado = envio ? mergeNonEmpty(envio, resolucion || {}) : null;`;

  source = replaceExact(source, selectionOld, selectionNew, 'selección y fallback por período');

  source = replaceExact(
    source,
    `      consultaPeriodoReforzada: false,
      consultas: { requisitos: 'ok', envios: 'ok', resoluciones: 'ok' },`,
    `      consultaPeriodoReforzada: compatibilidadTitulos && Boolean(academicPeriod),
      consultas: {
        requisitos: 'ok',
        envios: envioSettled.status === 'fulfilled' ? 'ok' : (compatibilidadDisponible ? 'compatibilidad' : 'error'),
        resoluciones: resolutionSettled.status === 'fulfilled' ? 'ok' : (compatibilidadDisponible ? 'compatibilidad' : 'error')
      },`,
    'estado de consultas'
  );

  source = replaceExact(
    source,
    '      compatibilidadTitulos: true,',
    '      compatibilidadTitulos,',
    'indicador de compatibilidad'
  );

  source = replaceExact(
    source,
    `  selectRecord,
  effectiveState`,
    `  selectRecord,
  effectiveState,
  periodEquivalent`,
    'exportación de prueba de período'
  );

  write(path, source);
}

// 3. Autorizar las nuevas consultas en la API pública de Títulos.
{
  const path = 'functions/api/titulos.js';
  let source = read(path);
  source = replaceExact(
    source,
    `  ACCESS_ACTION,
  'CONSULTAR_ENVIO_CEDULA',`,
    `  ACCESS_ACTION,
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_RESOLUCION_CEDULA',
  'CONSULTAR_ENVIO_CEDULA',`,
    'acciones de estudiante'
  );
  source = replaceExact(
    source,
    `const READ_BY_ID = new Set([ACCESS_ACTION, 'VERIFICAR_ENVIO', 'CONSULTAR_ENVIO_CEDULA']);`,
    `const READ_BY_ID = new Set([
  ACCESS_ACTION,
  'CONSULTAR_ENVIO_BASE_CEDULA',
  'CONSULTAR_RESOLUCION_CEDULA',
  'VERIFICAR_ENVIO',
  'CONSULTAR_ENVIO_CEDULA'
]);`,
    'acciones de lectura por identificación'
  );
  write(path, source);
}

// 4. Textos y versiones coherentes.
{
  const htmlPath = 'estudiantes-mvp/estudiante.html';
  let html = read(htmlPath);
  html = html.replace(/\?v=\d+\.\d+\.\d+/g, '?v=2.4.1');
  write(htmlPath, html);

  for (const path of ['dev/preparar-pages-estudiantes.mjs', 'dev/preparar-pages-local.mjs']) {
    let source = read(path);
    source = source.replace(/2\.3\.9/g, '2.4.1');
    write(path, source);
  }
}

// 5. Pruebas de arquitectura y lógica.
{
  const path = 'dev/verificar-apps.mjs';
  let source = read(path);
  source = replaceExact(
    source,
    `const studentReview = read('estudiantes-mvp/js/estudiante.consulta.revision.js');`,
    `const studentReview = read('estudiantes-mvp/js/estudiante.consulta.revision.js');
const studentApp = read('estudiantes-mvp/js/estudiante.app.js');`,
    'lectura del controlador principal'
  );
  source = replaceExact(
    source,
    `assert(/CONSULTAR_ENVIO_CEDULA/.test(accessApi), 'La API unificada no conserva la compatibilidad de Títulos.');
assert(/legacyPromise/.test(accessApi), 'La compatibilidad antigua no se inicia en paralelo.');`,
    `assert(/CONSULTAR_ENVIO_CEDULA/.test(accessApi), 'La API unificada no conserva el fallback de compatibilidad.');
assert(!/legacyPromise/.test(accessApi), 'La compatibilidad antigua todavía se inicia en todas las consultas.');
assert(/Fallback único y condicional/.test(accessApi), 'La compatibilidad no está limitada a un fallback condicional.');
assert(/periodEquivalent/.test(accessApi), 'La API unificada no compara etiquetas e identificadores de período.');`,
    'validaciones de compatibilidad'
  );
  source = replaceExact(
    source,
    `assert(!/createElement\\(['"]script['"]\\)[\\s\\S]*estudiante\\.consulta\\.revision/.test(studentRequirements), 'Requisitos vuelve a cargar dinámicamente el controlador de consulta.');`,
    `assert(!/createElement\\(['"]script['"]\\)[\\s\\S]*estudiante\\.consulta\\.revision/.test(studentRequirements), 'Requisitos vuelve a cargar dinámicamente el controlador de consulta.');
assert(!/formConsulta\\.addEventListener[\\s\\S]*manejarConsulta/.test(studentApp), 'estudiante.app.js todavía registra un segundo controlador de consulta.');
assert(/No se envió al servidor/.test(studentApp), 'La contingencia local no diferencia un envío real de un respaldo local.');`,
    'controlador único y contingencia'
  );
  source = source.replace(
    '[Apps] Estudiantes: modal inmediato, consulta paralela, compatibilidad y jerarquía correctos.',
    '[Apps] Estudiantes: controlador único, tres consultas iniciales, fallback condicional y jerarquía correctos.'
  );
  write(path, source);
}

{
  const path = 'dev/verificar-logica-acceso.mjs';
  let source = read(path);
  source = replaceExact(
    source,
    `const periodoId = '2025-11__2026-05';`,
    `const periodoId = '2025-11__2026-05';

assert.equal(
  __test.periodEquivalent(periodo, periodoId),
  true,
  'La etiqueta y el identificador del mismo período deben ser equivalentes.'
);`,
    'prueba de equivalencia de período'
  );
  write(path, source);
}

console.log('[Estabilización] Flujo de estudiantes corregido y pruebas actualizadas.');
