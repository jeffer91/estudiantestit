import fs from 'node:fs';

const path = 'functions/api/acceso-estudiante.js';
let source = fs.readFileSync(path, 'utf8');

source = source.replace(
  "  const nested = item.envio && typeof item.envio === 'object';\n  return Boolean(direct || nested);",
  "  return Boolean(direct);"
);
source = source.replace(
  "  const nested = item.resolucion && typeof item.resolucion === 'object';\n  return Boolean((state && evidence) || nested);",
  "  return Boolean(state && evidence);"
);

const oldHelpers = `function fulfilledValues(settledList) {
  return settledList
    .filter((item) => item.status === 'fulfilled' && item.value)
    .map((item) => item.value);
}

function sourceErrors(settledList, label) {
  if (settledList.some((item) => item.status === 'fulfilled')) return [];
  return settledList
    .filter((item) => item.status === 'rejected')
    .map((item) => ({
      fuente: label,
      mensaje: text(item.reason && item.reason.message) || 'Consulta no disponible.'
    }));
}
`;

const newHelpers = `function querySourceWithCompatibility(primaryPromise, legacyPromise, predicate, cedula, period, kind) {
  const promises = [primaryPromise, legacyPromise];
  return new Promise((resolve, reject) => {
    const fulfilled = [];
    const errors = [];
    let pending = promises.length;

    promises.forEach((promise) => {
      Promise.resolve(promise).then((value) => {
        fulfilled.push(value);
        if (selectRecord(value, predicate, cedula, period, kind)) {
          resolve(fulfilled.slice());
          return;
        }
        pending -= 1;
        if (pending === 0) {
          if (fulfilled.length) resolve(fulfilled);
          else reject(errors[0] || new Error('Consulta no disponible.'));
        }
      }).catch((error) => {
        errors.push(error);
        pending -= 1;
        if (pending === 0) {
          if (fulfilled.length) resolve(fulfilled);
          else reject(errors[0] || new Error('Consulta no disponible.'));
        }
      });
    });
  });
}
`;

if (!source.includes(oldHelpers)) throw new Error('No se encontró el bloque de compatibilidad anterior.');
source = source.replace(oldHelpers, newHelpers);

const oldTasks = `    const legacyPromise = queryTitles(env, 'CONSULTAR_ENVIO_CEDULA', cedula, requestedPeriod);
    const envioTask = Promise.allSettled([
      queryTitles(env, 'CONSULTAR_ENVIO_BASE_CEDULA', cedula, requestedPeriod),
      legacyPromise
    ]);
    const resolutionTask = Promise.allSettled([
      queryTitles(env, 'CONSULTAR_RESOLUCION_CEDULA', cedula, requestedPeriod),
      legacyPromise
    ]);
`;

const newTasks = `    const legacyPromise = queryTitles(env, 'CONSULTAR_ENVIO_CEDULA', cedula, requestedPeriod);
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
`;

if (!source.includes(oldTasks)) throw new Error('No se encontró el bloque de consultas paralelas.');
source = source.replace(oldTasks, newTasks);

const oldSources = `    const envioSources = envioSettled.status === 'fulfilled'
      ? fulfilledValues(envioSettled.value)
      : [];
    const resolutionSources = resolutionSettled.status === 'fulfilled'
      ? fulfilledValues(resolutionSettled.value)
      : [];

    failures.push(...sourceErrors(
      envioSettled.status === 'fulfilled' ? envioSettled.value : [],
      'ENVIOS'
    ));
    failures.push(...sourceErrors(
      resolutionSettled.status === 'fulfilled' ? resolutionSettled.value : [],
      'RESOLUCIONES'
    ));
`;

const newSources = `    const envioSources = envioSettled.status === 'fulfilled' && Array.isArray(envioSettled.value)
      ? envioSettled.value
      : [];
    const resolutionSources = resolutionSettled.status === 'fulfilled' && Array.isArray(resolutionSettled.value)
      ? resolutionSettled.value
      : [];
`;

if (!source.includes(oldSources)) throw new Error('No se encontró el bloque de fuentes consolidadas.');
source = source.replace(oldSources, newSources);

fs.writeFileSync(path, source, 'utf8');
console.log('[Compatibilidad] Se usa la primera respuesta válida sin esperar una acción vacía.');
