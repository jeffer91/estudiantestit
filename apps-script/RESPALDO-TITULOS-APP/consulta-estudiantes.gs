/*
  Módulo de consultas separadas para RESPALDO TITULOS APP.
  No declara doGet ni doPost. Debe utilizarse junto con Código.gs.
*/

function procesarConsultaSeparadaPorAccion(payload, accion) {
  if (accion === 'CONSULTAR_ENVIO_BASE_CEDULA') {
    return consultarEnvioBasePorCedula(payload);
  }
  if (accion === 'CONSULTAR_RESOLUCION_CEDULA') {
    return consultarResolucionPorCedula(payload);
  }
  return null;
}

function obtenerCedulaYPeriodoConsulta(payload) {
  var datos = obtenerDatos(payload);
  return {
    cedula: limpiarCedula(
      payload.cedula ||
      payload.numeroIdentificacion ||
      datos.cedula ||
      datos.numeroIdentificacion ||
      datos.identificacion ||
      datos.documento
    ),
    periodo: texto(
      payload.periodo ||
      payload.periodoLabel ||
      payload.periodoId ||
      datos.periodo ||
      datos.periodoLabel ||
      datos.periodoId ||
      ''
    )
  };
}

function consultarEnvioBasePorCedula(payload) {
  var ss = obtenerSpreadsheet();
  var consulta = obtenerCedulaYPeriodoConsulta(payload);

  if (!consulta.cedula) {
    throw new Error('No se recibió una cédula válida para consultar Envios.');
  }

  var hoja = prepararHoja(
    ss,
    TITULOS_APP_CONFIG.hojas.envios,
    TITULOS_APP_CONFIG.headers.envios
  );
  var envio = buscarEnvioRegistrado(
    hoja,
    consulta.cedula,
    consulta.periodo
  );

  if (!envio && consulta.periodo) {
    envio = buscarEnvioRegistrado(hoja, consulta.cedula, '');
  }

  return {
    ok: true,
    tipo: 'CONSULTAR_ENVIO_BASE_CEDULA',
    accion: 'CONSULTAR_ENVIO_BASE_CEDULA',
    existe: Boolean(envio),
    encontrado: Boolean(envio),
    tieneEnvio: Boolean(envio),
    cedula: consulta.cedula,
    periodo: envio ? envio.periodo : consulta.periodo,
    periodoId: envio ? envio.periodoId : consulta.periodo,
    periodoLabel: envio ? envio.periodoLabel : consulta.periodo,
    envio: envio,
    registro: envio,
    envios: envio ? [envio] : [],
    mensaje: envio
      ? 'Envío recuperado directamente desde la hoja Envios.'
      : 'No existe un envío previo para esta cédula y período.',
    version: TITULOS_APP_CONFIG.version,
    fechaServidor: new Date().toISOString()
  };
}

function consultarResolucionPorCedula(payload) {
  var ss = obtenerSpreadsheet();
  var consulta = obtenerCedulaYPeriodoConsulta(payload);

  if (!consulta.cedula) {
    throw new Error('No se recibió una cédula válida para consultar Resoluciones.');
  }

  var resolucion = buscarUltimaResolucionPorCedula(
    ss,
    consulta.cedula,
    consulta.periodo
  );

  if (!resolucion && consulta.periodo) {
    resolucion = buscarUltimaResolucionPorCedula(ss, consulta.cedula, '');
  }

  return {
    ok: true,
    tipo: 'CONSULTAR_RESOLUCION_CEDULA',
    accion: 'CONSULTAR_RESOLUCION_CEDULA',
    existe: Boolean(resolucion),
    encontrado: Boolean(resolucion),
    tieneResolucion: Boolean(resolucion),
    permiteReenvio: Boolean(resolucion && resolucion.permitirReenvio),
    cedula: consulta.cedula,
    periodo: resolucion ? resolucion.periodo : consulta.periodo,
    periodoId: resolucion ? resolucion.periodoId : consulta.periodo,
    periodoLabel: resolucion ? resolucion.periodoLabel : consulta.periodo,
    estado: resolucion ? resolucion.estadoFinal : '',
    estadoFinal: resolucion ? resolucion.estadoFinal : '',
    resolucion: resolucion,
    registro: resolucion,
    resoluciones: resolucion ? [resolucion] : [],
    mensaje: resolucion
      ? 'Resolución recuperada directamente desde la hoja Resoluciones.'
      : 'No existe una resolución para esta cédula y período.',
    version: TITULOS_APP_CONFIG.version,
    fechaServidor: new Date().toISOString()
  };
}

function buscarUltimaResolucionPorCedula(ss, cedula, periodo) {
  var documento = limpiarCedula(cedula);
  var periodoBuscado = texto(periodo);
  var hoja = prepararHoja(
    ss,
    TITULOS_APP_CONFIG.hojas.resoluciones,
    TITULOS_APP_CONFIG.headers.resoluciones
  );
  var ultimaFila = hoja.getLastRow();

  if (!documento || ultimaFila < 2) return null;

  var valores = hoja.getRange(
    2,
    1,
    ultimaFila - 1,
    TITULOS_APP_CONFIG.headers.resoluciones.length
  ).getValues();

  for (var i = valores.length - 1; i >= 0; i -= 1) {
    var resolucion = convertirFilaResolucion(valores[i], i + 2);
    if (resolucion.cedula !== documento) continue;
    if (
      periodoBuscado &&
      !coincidePeriodo(resolucion.periodo, periodoBuscado) &&
      firmaPeriodo(resolucion.periodoId) !== firmaPeriodo(periodoBuscado)
    ) {
      continue;
    }
    return resolucion;
  }

  return null;
}
