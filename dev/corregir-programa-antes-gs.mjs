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

// 1. Backend del programa: usar únicamente el flujo que hoy está publicado.
{
  const path = 'functions/api/acceso-estudiante.js';
  let source = read(path);

  source = replaceExact(
    source,
    "  const evidence = flexible(item, [\n    'resolucionId', 'fechaResolucion', 'coordinador', 'comentarioCoordinador', 'tituloCorregido'\n  ]);",
    "  const evidence = flexible(item, [\n    'resolucionId', 'fechaResolucion', 'Fecha resolución', 'coordinador',\n    'comentarioCoordinador', 'observacion', 'Observación', 'comentario',\n    'tituloCorregido', 'tituloElegido', 'Título elegido'\n  ]);",
    'evidencias de resolución'
  );

  const oldInitial = `    /*
      Flujo normal: exactamente tres consultas iniciales y simultáneas.
      La compatibilidad antigua solo se usa después, si una fuente no devuelve
      un registro válido para el período académico del estudiante.
    */
    const [academicSettled, envioSettled, resolutionSettled] = await Promise.allSettled([
      lookupStudent(env, cedula, requestedPeriod),
      queryTitles(env, 'CONSULTAR_ENVIO_BASE_CEDULA', cedula, requestedPeriod),
      queryTitles(env, 'CONSULTAR_RESOLUCION_CEDULA', cedula, requestedPeriod)
    ]);`;

  const newInitial = `    /*
      Primera fase: el programa utiliza únicamente la acción de Títulos que ya
      fue comprobada en producción. La separación de Apps Script se realizará
      en la fase siguiente sin cambiar nuevamente el contrato del frontend.
    */
    const [academicSettled, titlesSettled] = await Promise.allSettled([
      lookupStudent(env, cedula, requestedPeriod),
      queryTitles(env, 'CONSULTAR_ENVIO_CEDULA', cedula, requestedPeriod)
    ]);`;

  source = replaceExact(source, oldInitial, newInitial, 'consultas iniciales del programa');

  const failurePattern = /    const failures = \[\];[\s\S]*?    const academic = normalizeStudentResult\(academicSettled\.value, cedula, requestedPeriod\);/;
  if (!failurePattern.test(source)) throw new Error('No se encontró el manejo de fuentes.');
  source = source.replace(failurePattern, `    const failures = [];
    if (academicSettled.status === 'rejected') {
      failures.push({
        fuente: 'REQUISITOS',
        mensaje: text(academicSettled.reason && academicSettled.reason.message) || 'Consulta no disponible.'
      });
    }
    if (titlesSettled.status === 'rejected') {
      failures.push({
        fuente: 'TITULOS',
        mensaje: text(titlesSettled.reason && titlesSettled.reason.message) || 'Consulta no disponible.'
      });
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

    const academic = normalizeStudentResult(academicSettled.value, cedula, requestedPeriod);`);

  source = source.replace(
    "        consultas: { requisitos: 'ok', envios: 'ok', resoluciones: 'ok' },",
    "        consultas: { requisitos: 'ok', titulos: 'ok' },"
  );

  const selectionPattern = /    let envio = selectRecord\([\s\S]*?    const envioCombinado = envio \? mergeNonEmpty\(envio, resolucion \|\| \{\}\) : null;/;
  if (!selectionPattern.test(source)) throw new Error('No se encontró la selección de Envíos y Resoluciones.');
  source = source.replace(selectionPattern, `    const titlesResult = titlesSettled.value;
    const envio = selectRecord(titlesResult, looksLikeEnvio, cedula, academicPeriod, 'envio');
    const resolucion = selectRecord(titlesResult, looksLikeResolution, cedula, academicPeriod, 'resolution');
    const decision = effectiveState(envio, resolucion);
    const permiteReenvio = decision.estado === 'DEVUELTO';
    const tieneEnvio = Boolean(envio);
    const tieneResolucion = Boolean(resolucion);
    const envioCombinado = envio ? mergeNonEmpty(envio, resolucion || {}) : null;`);

  const oldResponse = `      consultaPeriodoReforzada: compatibilidadTitulos && Boolean(academicPeriod),
      consultas: {
        requisitos: 'ok',
        envios: envioSettled.status === 'fulfilled' ? 'ok' : (compatibilidadDisponible ? 'compatibilidad' : 'error'),
        resoluciones: resolutionSettled.status === 'fulfilled' ? 'ok' : (compatibilidadDisponible ? 'compatibilidad' : 'error')
      },
      fuente: academic.fuente || 'CONSULTA_ACCESO_PARALELA',
      fuenteEnvio: 'RESPALDO_TITULOS_APP_ENVÍOS',
      fuenteResolucion: 'RESPALDO_TITULOS_APP_RESOLUCIONES',
      compatibilidadTitulos,`;

  const newResponse = `      consultas: {
        requisitos: 'ok',
        titulos: 'ok',
        envios: tieneEnvio ? 'encontrado' : 'sin_registro',
        resoluciones: tieneResolucion ? 'encontrada' : 'sin_registro'
      },
      fuente: academic.fuente || 'CONSULTA_ACCESO_PROGRAMA',
      fuenteEnvio: 'RESPALDO_TITULOS_APP',
      fuenteResolucion: 'RESPALDO_TITULOS_APP',
      flujoTitulos: 'CONSULTAR_ENVIO_CEDULA',`;

  source = replaceExact(source, oldResponse, newResponse, 'respuesta consolidada');
  source = source.replace(
    "            : 'Estudiante encontrado. No registra envíos anteriores.',",
    "            : 'Estudiante encontrado. No registra envíos anteriores en este período.',"
  );

  write(path, source);
}

// 2. El frontend nunca debe convertir una respuesta contradictoria en estudiante nuevo.
{
  const path = 'estudiantes-mvp/js/estudiante.consulta.revision.js';
  let source = read(path);
  source = replaceExact(
    source,
    "    resolucion = resultado.resolucion || null;\n    estado = estadoEfectivo(resultado) || 'SIN_ENVIO';",
    "    resolucion = resultado.resolucion ||\n      (resultado.envio && resultado.envio.resolucion) ||\n      null;\n    estado = estadoEfectivo(resultado) || 'SIN_ENVIO';\n\n    if (\n      estado === 'SIN_ENVIO' &&\n      (resultado.tieneEnvio === true || resultado.tieneResolucion === true)\n    ) {\n      throw new Error('El servidor encontró antecedentes, pero no pudo interpretar su estado. Intenta nuevamente.');\n    }",
    'protección contra falso SIN_ENVIO'
  );
  write(path, source);
}

// 3. Verificaciones alineadas con esta primera fase.
{
  const path = 'dev/verificar-apps.mjs';
  let source = read(path);
  source = replaceExact(
    source,
    `assert(/Promise\\.allSettled/.test(accessApi), 'La API unificada no ejecuta consultas paralelas.');
assert(/CONSULTAR_ENVIO_BASE_CEDULA/.test(accessApi), 'La API unificada no consulta Envios de forma independiente.');
assert(/CONSULTAR_RESOLUCION_CEDULA/.test(accessApi), 'La API unificada no consulta Resoluciones de forma independiente.');
assert(/CONSULTAR_ENVIO_CEDULA/.test(accessApi), 'La API unificada no conserva el fallback de compatibilidad.');
assert(!/legacyPromise/.test(accessApi), 'La compatibilidad antigua todavía se inicia en todas las consultas.');
assert(/Fallback único y condicional/.test(accessApi), 'La compatibilidad no está limitada a un fallback condicional.');`,
    `assert(/Promise\\.allSettled/.test(accessApi), 'La API unificada no ejecuta las consultas del programa en paralelo.');
assert(/CONSULTAR_ENVIO_CEDULA/.test(accessApi), 'La API unificada no utiliza el flujo de Títulos actualmente publicado.');
assert(!/CONSULTAR_ENVIO_BASE_CEDULA/.test(accessApi), 'El programa todavía depende de una acción de Apps Script aún no migrada.');
assert(!/CONSULTAR_RESOLUCION_CEDULA/.test(accessApi), 'El programa todavía depende de una acción de Apps Script aún no migrada.');
assert(/flujoTitulos:\s*['\"]CONSULTAR_ENVIO_CEDULA['\"]/.test(accessApi), 'La respuesta no identifica el flujo real de Títulos.');`,
    'verificaciones del flujo publicado'
  );
  source = source.replace(
    "console.log('[Apps] Estudiantes: controlador único, tres consultas iniciales, fallback condicional y jerarquía correctos.');",
    "console.log('[Apps] Estudiantes: controlador único, Requisitos y flujo publicado de Títulos correctamente integrados.');"
  );
  write(path, source);
}

// 4. Versión del programa.
for (const path of [
  'dev/preparar-pages-estudiantes.mjs',
  'dev/preparar-pages-local.mjs',
  'estudiantes-mvp/estudiante.html'
]) {
  let source = read(path);
  source = source.replace(/2\.4\.1/g, '2.4.2');
  write(path, source);
}

console.log('[Programa] Consulta estabilizada con el Apps Script actualmente publicado.');
console.log('[Programa] Los archivos .gs no fueron modificados.');
