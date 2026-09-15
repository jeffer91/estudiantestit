import { batchGetDocuments, queryEqual, samePeriod, text } from './firestore-fixed.js';

function normal(value) {
  return text(value).toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tipoTrabajo(value) {
  const v = text(value).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (!v) return '';
  if (v.includes('TRABAJO') && v.includes('TITUL')) return 'TRABAJO_TITULACION';
  if (v.includes('ARTICULO')) return 'ARTICULO_ACADEMICO';
  return v;
}

function mismoPeriodo(envio, requested) {
  const target = text(requested);
  if (!target) return true;
  const candidates = [
    envio && envio.periodoId,
    envio && envio.periodo,
    envio && envio.periodoLabel,
    envio && envio.periodoNombre
  ].map(text).filter(Boolean);
  return candidates.some((value) => value === target || samePeriod(value, target));
}

async function cargarEnvios(ids, env) {
  const unique = [...new Set((ids || []).map(text).filter(Boolean))];
  const rows = [];
  for (let offset = 0; offset < unique.length; offset += 100) {
    const slice = unique.slice(offset, offset + 100);
    const batch = await batchGetDocuments(
      'TITULOS',
      slice.map((documentId) => ({ collectionName: 'envios', documentId })),
      env
    );
    rows.push(...batch);
  }
  return rows;
}

function clasificarRevision(item) {
  const result = text(item.resultado).toUpperCase();
  const action = text(item.accion).toUpperCase();
  const combined = result + ' ' + action;
  if (combined.includes('DEVUEL')) return 'DEVUELTO';
  if (combined.includes('CORRECC') || combined.includes('CORREG')) return 'CORREGIDO';
  if (combined.includes('SIN_CAMBIOS') || combined.includes('SIN CAMBIOS')) return 'SIN_CAMBIOS';
  if (combined.includes('APROBAD') || combined.includes('VALIDAR') || combined.includes('VALIDADO')) return 'SIN_CAMBIOS';
  return 'OTRO';
}

function reviewerKey(row) {
  return text(row.revisorId) || normal(row.revisorNombre) || 'sin-responsable';
}

function agrupar(revisiones) {
  const map = new Map();
  revisiones.forEach((item) => {
    const key = reviewerKey(item);
    if (!map.has(key)) {
      map.set(key, {
        revisorKey: key,
        revisorId: text(item.revisorId),
        revisorNombre: text(item.revisorNombre) || 'Sin responsable',
        revisiones: 0,
        estudiantesUnicos: new Set(),
        sinCambios: 0,
        corregidos: 0,
        devueltos: 0,
        otros: 0,
        ultimaRevision: ''
      });
    }
    const group = map.get(key);
    group.revisiones += 1;
    group.estudiantesUnicos.add(text(item.cedula) || text(item.envioId));
    const classification = clasificarRevision(item);
    if (classification === 'SIN_CAMBIOS') group.sinCambios += 1;
    else if (classification === 'CORREGIDO') group.corregidos += 1;
    else if (classification === 'DEVUELTO') group.devueltos += 1;
    else group.otros += 1;
    if ((Date.parse(item.fecha || '') || 0) > (Date.parse(group.ultimaRevision || '') || 0)) {
      group.ultimaRevision = item.fecha;
    }
  });

  return [...map.values()].map((item) => ({
    ...item,
    estudiantesUnicos: item.estudiantesUnicos.size
  })).sort((a, b) =>
    b.revisiones - a.revisiones || a.revisorNombre.localeCompare(b.revisorNombre, 'es')
  );
}

export async function buildAdminReviewReport(payload = {}, env) {
  const rol = text(payload.rol || payload.role).toUpperCase();
  if (!['COORDINADOR', 'INVESTIGADOR'].includes(rol)) {
    throw new Error('El reporte solo admite COORDINADOR o INVESTIGADOR.');
  }

  const eventos = await queryEqual('TITULOS', 'workflow_eventos', 'rol', rol, 10000, env);
  const envios = await cargarEnvios(eventos.map((item) => item.envioId), env);
  const enviosById = new Map(envios.map((item) => [text(item.id), item]));

  const requestedPeriod = text(payload.periodoId || payload.periodo || payload.periodoLabel);
  const requestedCareer = normal(payload.carrera || payload.nombreCarrera);
  const requestedType = tipoTrabajo(payload.tipoTrabajo || payload.tipo);
  const requestedReviewer = text(payload.revisorId || payload.responsableId);
  const requestedSearch = normal(payload.buscar || payload.search);

  const revisiones = eventos.map((event) => {
    const envioId = text(event.envioId);
    const envio = enviosById.get(envioId) || {};
    const row = {
      id: text(event.id || event._id || event._docId),
      envioId,
      rol,
      revisorId: text(event.revisorId),
      revisorNombre: text(event.revisorNombre),
      accion: text(event.accion),
      resultado: text(event.resultado),
      tituloAntes: text(event.tituloAntes),
      tituloDespues: text(event.tituloDespues),
      observacion: text(event.observacion),
      fecha: text(event.fecha || event.actualizadoEn || event._updateTime),
      cedula: text(envio.cedula || envio.numeroIdentificacion),
      estudiante: text(envio.nombres || envio.estudiante || envio.nombreCompleto),
      carrera: text(envio.carreraNombre || envio.carrera),
      periodoId: text(envio.periodoId),
      periodo: text(envio.periodoLabel || envio.periodoNombre || envio.periodo || envio.periodoId),
      tipoTrabajo: tipoTrabajo(envio.tipoTrabajo),
      tipoTrabajoLabel: tipoTrabajo(envio.tipoTrabajo) === 'TRABAJO_TITULACION' ? 'Trabajo de Titulación' : 'Artículo académico'
    };
    row.clasificacion = clasificarRevision(row);
    return row;
  }).filter((row) => {
    const envio = enviosById.get(row.envioId) || {};
    if (!mismoPeriodo(envio, requestedPeriod)) return false;
    if (requestedCareer && normal(row.carrera) !== requestedCareer) return false;
    if (requestedType && row.tipoTrabajo !== requestedType) return false;
    if (requestedReviewer && row.revisorId !== requestedReviewer && reviewerKey(row) !== requestedReviewer) return false;
    if (requestedSearch) {
      const haystack = normal([
        row.revisorNombre,
        row.revisorId,
        row.estudiante,
        row.cedula,
        row.carrera,
        row.periodo,
        row.tituloAntes,
        row.tituloDespues,
        row.observacion,
        row.resultado
      ].join(' '));
      if (!haystack.includes(requestedSearch)) return false;
    }
    return true;
  }).sort((a, b) => (Date.parse(b.fecha || '') || 0) - (Date.parse(a.fecha || '') || 0));

  const revisores = agrupar(revisiones);
  const resumen = revisiones.reduce((out, row) => {
    out.revisiones += 1;
    out.estudiantes.add(row.cedula || row.envioId);
    if (row.clasificacion === 'SIN_CAMBIOS') out.sinCambios += 1;
    else if (row.clasificacion === 'CORREGIDO') out.corregidos += 1;
    else if (row.clasificacion === 'DEVUELTO') out.devueltos += 1;
    else out.otros += 1;
    return out;
  }, { revisiones: 0, estudiantes: new Set(), sinCambios: 0, corregidos: 0, devueltos: 0, otros: 0 });

  return {
    ok: true,
    rol,
    filtros: {
      periodo: requestedPeriod,
      carrera: text(payload.carrera || payload.nombreCarrera),
      tipoTrabajo: requestedType,
      revisorId: requestedReviewer,
      buscar: text(payload.buscar || payload.search)
    },
    resumen: {
      revisiones: resumen.revisiones,
      estudiantesUnicos: resumen.estudiantes.size,
      sinCambios: resumen.sinCambios,
      corregidos: resumen.corregidos,
      devueltos: resumen.devueltos,
      otros: resumen.otros
    },
    revisores,
    revisiones
  };
}
