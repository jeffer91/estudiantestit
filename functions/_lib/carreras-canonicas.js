import { text } from './firestore-fixed.js';

const GRUPOS = Object.freeze([
  Object.freeze({
    canonica: 'UNIVERSITARIA EN DESARROLLO SOFTWARE Y CIBERSEGURIDAD',
    identificadores: Object.freeze([
      '560613D01-P-1701',
      'carrera_a622d13fbc34'
    ]),
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

function valores(value) {
  if (!value || typeof value !== 'object') return [text(value)].filter(Boolean);
  return [
    value.id,
    value._id,
    value.carreraId,
    value.carreraCodigo,
    value.codigoCarrera,
    value.CodigoCarrera,
    value.codigo,
    value.nombre,
    value.NombreCarrera,
    value.nombreCarrera,
    value.carrera,
    value.carreraNombre
  ].map(text).filter(Boolean);
}

function nombreVisible(value) {
  if (!value || typeof value !== 'object') return text(value).replace(/\s+/g, ' ').trim();
  return text(
    value.nombre || value.NombreCarrera || value.nombreCarrera ||
    value.carrera || value.carreraNombre || value.id
  ).replace(/\s+/g, ' ').trim();
}

function grupoDe(value) {
  const objetivos = valores(value).map(firma).filter(Boolean);
  if (!objetivos.length) return null;
  return GRUPOS.find((grupo) => {
    const permitidos = [grupo.canonica, ...(grupo.aliases || []), ...(grupo.identificadores || [])]
      .map(firma)
      .filter(Boolean);
    return objetivos.some((objetivo) => permitidos.includes(objetivo));
  }) || null;
}

export function carreraCanonica(value) {
  const grupo = grupoDe(value);
  return grupo ? grupo.canonica : nombreVisible(value);
}

export function aliasCarrera(value) {
  const grupo = grupoDe(value);
  if (!grupo) {
    const nombre = carreraCanonica(value);
    return nombre ? [nombre] : [];
  }
  return [...new Set([
    grupo.canonica,
    ...(grupo.aliases || []),
    ...(grupo.identificadores || [])
  ].map((item) => text(item)).filter(Boolean))];
}

export function mismaCarrera(a, b) {
  const ga = grupoDe(a);
  const gb = grupoDe(b);
  if (ga || gb) return Boolean(ga && gb && ga.canonica === gb.canonica);

  const va = valores(a).map(firma).filter(Boolean);
  const vb = new Set(valores(b).map(firma).filter(Boolean));
  return va.some((item) => vb.has(item));
}

export function canonizarListaCarreras(rows = []) {
  const salida = [];
  const vistos = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const original = nombreVisible(row);
    const nombre = carreraCanonica(row);
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
