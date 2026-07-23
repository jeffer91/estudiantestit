import fs from 'node:fs';

const ruta = 'functions/api/acceso-estudiante.js';
const actual = fs.readFileSync(ruta, 'utf8');

const antiguo = `function selectRecord(result, predicate, cedula, academicPeriod, kind) {
  let list = candidates(result, predicate);
  const byCedula = list.filter((item) => sameCedula(item, cedula));
  if (byCedula.length) list = byCedula;

  const target = normalizePeriod(academicPeriod);
  if (target) {
    const exact = list.filter((item) => normalizePeriod(recordPeriod(item)) === target);
    if (exact.length) return latest(exact, kind);
  }

  if (list.length === 1) return list[0];
  return latest(list, kind);
}`;

const corregido = `function selectRecord(result, predicate, cedula, academicPeriod, kind) {
  let list = candidates(result, predicate);
  if (!list.length) return null;

  const identificables = list.filter((item) => rawCedula(flexible(item || {}, [
    'cedula',
    'numeroIdentificacion',
    'NumeroIdentificacion',
    'identificacion',
    'Cédula'
  ])));

  if (identificables.length) {
    const exactCedula = identificables.filter((item) => sameCedula(item, cedula));
    if (!exactCedula.length) return null;
    list = exactCedula;
  }

  const target = normalizePeriod(academicPeriod);
  if (target) {
    const exactPeriod = list.filter((item) => normalizePeriod(recordPeriod(item)) === target);
    if (exactPeriod.length) return latest(exactPeriod, kind);

    const conPeriodo = list.filter((item) => normalizePeriod(recordPeriod(item)));
    if (conPeriodo.length > 1) return null;
  }

  if (list.length === 1) return list[0];
  return latest(list, kind);
}`;

if (actual.includes(corregido)) {
  console.log('[Corrección] La selección segura ya está aplicada.');
  process.exit(0);
}

if (!actual.includes(antiguo)) {
  throw new Error('No se encontró el bloque esperado de selectRecord.');
}

fs.writeFileSync(ruta, actual.replace(antiguo, corregido), 'utf8');
console.log('[Corrección] Se evitó cruzar cédulas y períodos ambiguos.');
