import { text } from './firestore-fixed.js';

const GRUPOS = Object.freeze([
  Object.freeze({
    canonica: 'UNIVERSITARIA EN DESARROLLO SOFTWARE Y CIBERSEGURIDAD',
    aliases: Object.freeze([
      'UNIVERSITARIA EN DESARROLLO SOFTWARE Y CIBERSEGURIDAD',
      'UNIVERSITARIA EN DESARROLLO DE SOFTWARE Y CIBERSEGURIDAD',
      'UNIVERSITARIA EN SOFTWARE Y CIBERSEGURIDAD',
      'DESARROLLO DE SOFTWARE Y CIBERSEGURIDAD',
      'DESARROLLO SOFTWARE Y CIBERSEGURIDAD'
    ])
  })
]);

function firma(value) {
  return text(value).toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function grupoDe(value) {
  const objetivo = firma(value);
  if (!objetivo) return null;
  return GRUPOS.find((grupo) => [grupo.canonica, ...grupo.aliases]
    .some((nombre) => firma(nombre) === objetivo)) || null;
}

export function carreraCanonica(value) {
  const grupo = grupoDe(value);
  return grupo ? grupo.canonica : text(value).replace(/\s+/g, ' ').trim();
}

export function aliasCarrera(value) {
  const grupo = grupoDe(value);
  if (!grupo) return carreraCanonica(value) ? [carreraCanonica(value)] : [];
  return [...new Set([grupo.canonica, ...grupo.aliases].map((item) => text(item)).filter(Boolean))];
}

export function mismaCarrera(a, b) {
  const ca = carreraCanonica(a);
  const cb = carreraCanonica(b);
  return Boolean(ca && cb && firma(ca) === firma(cb));
}

export function canonizarListaCarreras(rows = []) {
  const salida = [];
  const vistos = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const original = text(row && (row.nombre || row.NombreCarrera || row.nombreCarrera || row.carrera || row.id));
    const nombre = carreraCanonica(original);
    const key = firma(nombre);
    if (!nombre || vistos.has(key)) continue;
    vistos.add(key);
    salida.push({
      ...row,
      nombreOriginal: original,
      nombre,
      NombreCarrera: nombre,
      nombreCarrera: nombre,
      carrera: nombre
    });
  }
  return salida;
}

export const CARRERAS_CANONICAS = GRUPOS;
