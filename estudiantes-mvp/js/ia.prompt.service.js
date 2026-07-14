/*
  Archivo: ia.prompt.service.js
  Ruta: estudiantes-mvp/js/ia.prompt.service.js
  Funciones principales:
  - Construir el prompt académico para la IA de Titulación.
  - Pedir exactamente 3 alternativas para cada propuesta.
  - Mantener el enfoque propio de la propuesta 1, 2 o 3.
  - Seleccionar automáticamente la mejor alternativa de cada propuesta.
  - Ocultar errores técnicos al estudiante.
  - Permitir un nuevo envío cuando Firebase marque DEVUELTO o NO_ENVIO administrativo.
*/
(function (window, document) {
  'use strict';

  var MENSAJE_ERROR_IA =
    'No te preocupes. No fue posible generar las sugerencias en este momento. ' +
    'Puedes intentarlo más tarde o mañana. Si el inconveniente continúa, ' +
    'comunícate con tu coordinador para recibir apoyo.';

  var ETAPAS = Object.freeze([
    {
      numero: 1,
      codigo: 'inicial',
      nombre: 'Diagnóstico inicial',
      descripcion: 'Identificar, analizar o diagnosticar la situación inicial del problema, sin afirmar que una solución ya fue ejecutada.'
    },
    {
      numero: 2,
      codigo: 'proceso',
      nombre: 'Proceso o propuesta de mejora',
      descripcion: 'Plantear una propuesta, plan, estrategia, modelo, sistema o mejora viable, sin afirmar que ya fue implementada.'
    },
    {
      numero: 3,
      codigo: 'final',
      nombre: 'Evaluación o resultado esperado',
      descripcion: 'Evaluar o analizar resultados e impacto esperado, sin inventar resultados reales ni afirmar que ya fueron obtenidos.'
    }
  ]);

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function obtenerEtapaPropuesta(numero) {
    numero = Number(numero || 1);
    return ETAPAS.find(function (item) {
      return Number(item.numero) === numero;
    }) || ETAPAS[0];
  }

  function construirPromptTitulos(params) {
    var utils = obtenerUtils();
    var contexto;
    var etapa;

    if (!utils) {
      throw new Error('No está disponible EstudianteMVPUtils.');
    }

    contexto = normalizarContexto(params || {});
    etapa = obtenerEtapaPropuesta(contexto.propuesta.numero);

    return [
      construirRol(),
      '',
      construirReglasGenerales(contexto, etapa),
      '',
      construirDatosEstudiante(contexto),
      '',
      construirDatosPropuesta(contexto),
      '',
      construirEtapaObjetivo(etapa),
      '',
      construirFormatoRespuesta(etapa)
    ].join('\n');
  }

  function construirRol() {
    return [
      'Actúa como una IA de Titulación académica para estudiantes de educación superior.',
      'Tu tarea es redactar alternativas de títulos de investigación claras, viables y relacionadas con la carrera del estudiante.',
      'Debes escribir títulos académicos sencillos, formales, específicos y aplicables.'
    ].join('\n');
  }

  function construirReglasGenerales(contexto, etapa) {
    var carrera = contexto && contexto.estudiante
      ? contexto.estudiante.carrera
      : 'la carrera del estudiante';

    return [
      'REGLAS OBLIGATORIAS:',
      '1. Genera exactamente 3 títulos alternativos para esta misma propuesta.',
      '2. Los 3 títulos deben conservar el mismo enfoque: ' + etapa.nombre + '.',
      '3. No mezcles las tres etapas del proceso dentro de esta respuesta.',
      '4. La carrera del estudiante es el criterio principal y obligatorio: ' + carrera + '.',
      '5. Todos los títulos deben pertenecer claramente a la carrera del estudiante.',
      '6. Si el tema pertenece a otra área, adáptalo al campo profesional de la carrera sin cambiar el contexto entregado.',
      '7. Conserva, cuando estén disponibles, el tema, lugar, grupo de estudio, problema, objetivo y período.',
      '8. Las tres alternativas deben ser distintas entre sí, pero responder a los mismos datos.',
      '9. No propongas títulos genéricos que podrían servir para cualquier carrera.',
      '10. No inventes instituciones, empresas, lugares, fechas, poblaciones, intervenciones ejecutadas ni resultados obtenidos.',
      '11. Cada título debe tener entre 15 y 25 palabras.',
      '12. No superes las 25 palabras por título bajo ninguna circunstancia.',
      '13. Evita títulos confusos, repetitivos o con palabras innecesarias.',
      '14. No uses comillas al inicio o al final del título.',
      '15. La respuesta debe ser únicamente JSON válido, sin explicación externa y sin markdown.'
    ].join('\n');
  }

  function construirDatosEstudiante(contexto) {
    return [
      'DATOS DEL ESTUDIANTE:',
      '- Nombres: ' + contexto.estudiante.nombres,
      '- Cédula: ' + contexto.estudiante.cedula,
      '- Carrera: ' + contexto.estudiante.carrera,
      '- Código de carrera: ' + contexto.estudiante.codigoCarrera,
      '- Sede: ' + contexto.estudiante.sede,
      '- Modalidad: ' + contexto.estudiante.modalidadDetectada,
      '- Período: ' + contexto.estudiante.periodoLabel + ' (' + contexto.estudiante.periodoId + ')'
    ].join('\n');
  }

  function construirDatosPropuesta(contexto) {
    return [
      'DATOS DE LA PROPUESTA ' + contexto.propuesta.numero + ':',
      '- Título escrito por el estudiante: ' + contexto.propuesta.tituloBase,
      '- Tema general: ' + contexto.propuesta.temaGeneral,
      '- Lugar o contexto: ' + contexto.propuesta.lugarContexto,
      '- Grupo de estudio: ' + contexto.propuesta.grupoEstudio,
      '- Problema o necesidad: ' + contexto.propuesta.problemaNecesidad,
      '- Objetivo: ' + contexto.propuesta.objetivo,
      '- Año o período de revisión: ' + contexto.propuesta.anioPeriodo
    ].join('\n');
  }

  function construirEtapaObjetivo(etapa) {
    return [
      'ENFOQUE ÚNICO DE ESTA PROPUESTA:',
      '- Etapa: ' + etapa.nombre + '.',
      '- Orientación: ' + etapa.descripcion,
      '- Genera 3 maneras diferentes de redactar un buen título para este mismo enfoque.'
    ].join('\n');
  }

  function construirFormatoRespuesta(etapa) {
    return [
      'FORMATO DE RESPUESTA OBLIGATORIO:',
      'Antes de responder, cuenta las palabras de cada título. Si supera 25 palabras, reescríbelo completo y más corto.',
      '{',
      '  "sugerencias": [',
      '    {',
      '      "numero": 1,',
      '      "etapa": "' + etapa.codigo + '",',
      '      "nombreEtapa": "' + etapa.nombre + '",',
      '      "titulo": "Primera alternativa académica completa de 15 a 25 palabras",',
      '      "justificacion": "Explicación breve de su claridad y viabilidad"',
      '    },',
      '    {',
      '      "numero": 2,',
      '      "etapa": "' + etapa.codigo + '",',
      '      "nombreEtapa": "' + etapa.nombre + '",',
      '      "titulo": "Segunda alternativa académica completa de 15 a 25 palabras",',
      '      "justificacion": "Explicación breve de su claridad y viabilidad"',
      '    },',
      '    {',
      '      "numero": 3,',
      '      "etapa": "' + etapa.codigo + '",',
      '      "nombreEtapa": "' + etapa.nombre + '",',
      '      "titulo": "Tercera alternativa académica completa de 15 a 25 palabras",',
      '      "justificacion": "Explicación breve de su claridad y viabilidad"',
      '    }',
      '  ]',
      '}'
    ].join('\n');
  }

  function normalizarContexto(params) {
    var utils = obtenerUtils();
    var estudiante = params.estudiante || {};
    var propuesta = params.propuesta || {};

    return {
      estudiante: {
        nombres: limpiarDato(estudiante.nombres),
        cedula: limpiarDato(estudiante.cedula || estudiante.numeroIdentificacion),
        carrera: limpiarDato(estudiante.nombreCarrera || estudiante.carrera),
        codigoCarrera: limpiarDato(estudiante.codigoCarrera),
        sede: limpiarDato(estudiante.sede),
        modalidadDetectada: limpiarDato(estudiante.modalidadDetectada),
        periodoId: limpiarDato(estudiante.periodoId),
        periodoLabel: limpiarDato(estudiante.periodoLabel)
      },
      propuesta: {
        numero: Number(propuesta.numero || params.numeroPropuesta || 1),
        tituloBase: limpiarDato(propuesta.tituloFinal || propuesta.titulo || propuesta.tituloBase),
        temaGeneral: limpiarDato(propuesta.temaGeneral || propuesta.tema),
        lugarContexto: limpiarDato(propuesta.lugarContexto || propuesta.contexto || propuesta.lugar),
        grupoEstudio: limpiarDato(propuesta.grupoEstudio || propuesta.grupo || propuesta.poblacion),
        problemaNecesidad: limpiarDato(propuesta.problemaNecesidad || propuesta.problema || propuesta.necesidad),
        objetivo: limpiarDato(propuesta.objetivo || propuesta.objetivoGeneral),
        anioPeriodo: limpiarDato(propuesta.anioPeriodo || propuesta.periodo || propuesta.tiempo)
      },
      raw: utils.clonar(params || {})
    };
  }

  function limpiarDato(valor) {
    var utils = obtenerUtils();
    var textoLimpio = utils
      ? utils.limpiarTexto(valor)
      : String(valor || '').replace(/\s+/g, ' ').trim();

    return textoLimpio || 'No especificado';
  }

  function obtenerEtapas() {
    return ETAPAS.slice();
  }

  function estadoPermiteReenvio(registro) {
    var estado;
    registro = registro || {};
    estado = String(
      registro.estado ||
      registro.estadoFinal ||
      registro.estadoFirebase ||
      registro.estadoProceso ||
      ''
    ).toUpperCase().trim();

    return registro.permitirReenvio === true || [
      'DEVUELTO',
      'NO_ENVIO',
      'ELIMINADO',
      'ELIMINADO_ADMIN',
      'BORRADO'
    ].indexOf(estado) >= 0;
  }

  function consultarPermisoFirebase(cedula) {
    var firebaseCore = window.EstudianteMVPFirebaseCore || null;
    var config = window.EstudianteMVPConfig || null;
    var coleccion = config && typeof config.obtenerColeccion === 'function'
      ? config.obtenerColeccion('titulos') || 'titulos'
      : 'titulos';
    var cedulaLimpia = String(cedula || '').replace(/\D/g, '');

    if (!firebaseCore || !cedulaLimpia) return Promise.resolve(false);

    return firebaseCore.leerDocumento(coleccion, cedulaLimpia)
      .then(function(documento){
        if (documento && estadoPermiteReenvio(documento)) return true;
        if (documento) return false;
        return firebaseCore.consultarPorCampo(coleccion,'cedula','==',cedulaLimpia,5)
          .then(function(lista){
            return (lista || []).some(estadoPermiteReenvio);
          });
      })
      .catch(function(){ return false; });
  }

  function instalarPermisoReenvio() {
    var sheets = window.EstudianteMVPSheets || null;
    var consultaOriginal;
    var reemplazo;

    if (!sheets || sheets.__permisoReenvioInstalado || typeof sheets.consultarEnvioPorCedula !== 'function') return;

    consultaOriginal = sheets.consultarEnvioPorCedula.bind(sheets);
    reemplazo = Object.assign({},sheets,{
      consultarEnvioPorCedula:function(cedula){
        return consultarPermisoFirebase(cedula).then(function(permitido){
          if (permitido) {
            return {
              ok:true,
              encontrado:false,
              reenvioPermitido:true,
              cedula:String(cedula || '').replace(/\D/g,''),
              mensaje:'Firebase permite un nuevo envío.'
            };
          }

          return consultaOriginal(cedula).then(function(resultado){
            resultado = resultado || {};
            if (resultado.encontrado && estadoPermiteReenvio(resultado.envio || resultado)) {
              resultado.encontrado = false;
              resultado.reenvioPermitido = true;
            }
            return resultado;
          });
        });
      }
    });

    Object.defineProperty(reemplazo,'__permisoReenvioInstalado',{
      value:true,
      enumerable:false
    });
    window.EstudianteMVPSheets = Object.freeze(reemplazo);
  }

  function normalizarClaveLocal(valor) {
    return String(valor == null ? '' : valor)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function contarPalabras(valor) {
    var limpio = String(valor || '')
      .replace(/[“”"']/g,' ')
      .replace(/[.,;:¿?¡!()[\]{}]/g,' ')
      .replace(/\s+/g,' ')
      .trim();
    return limpio ? limpio.split(' ').filter(Boolean).length : 0;
  }

  function palabrasSignificativas(valor) {
    var ignorar = {
      para:1, como:1, con:1, del:1, las:1, los:1, una:1, uno:1,
      por:1, que:1, sus:1, sin:1, sobre:1, entre:1, desde:1, hacia:1,
      no:1, especificado:1, durante:1, mediante:1
    };

    return normalizarClaveLocal(valor)
      .split('_')
      .filter(function(palabra){
        return palabra.length >= 4 && !ignorar[palabra];
      });
  }

  function puntuarSugerencia(sugerencia, params, indice) {
    var contexto = normalizarContexto(params || {});
    var etapa = obtenerEtapaPropuesta(contexto.propuesta.numero);
    var titulo = String(sugerencia && (sugerencia.titulo || sugerencia.tituloFinal) || '');
    var claveTitulo = normalizarClaveLocal(titulo);
    var palabras = contarPalabras(titulo);
    var datos = [
      contexto.estudiante.carrera,
      contexto.propuesta.temaGeneral,
      contexto.propuesta.lugarContexto,
      contexto.propuesta.grupoEstudio,
      contexto.propuesta.problemaNecesidad,
      contexto.propuesta.objetivo,
      contexto.propuesta.anioPeriodo
    ];
    var terminos = [];
    var coincidencias = 0;
    var puntaje = 0;
    var verbosEtapa;

    datos.forEach(function(dato){
      palabrasSignificativas(dato).forEach(function(palabra){
        if (terminos.indexOf(palabra) === -1) terminos.push(palabra);
      });
    });

    terminos.forEach(function(termino){
      if (claveTitulo.indexOf(termino) >= 0) coincidencias += 1;
    });

    if (palabras >= 15 && palabras <= 25) puntaje += 25;
    if (palabras >= 18 && palabras <= 23) puntaje += 8;
    puntaje += Math.min(coincidencias * 5,35);

    if (etapa.numero === 1) {
      verbosEtapa = /identificacion|diagnostico|analisis|caracterizacion|evaluacion|determinacion/;
    } else if (etapa.numero === 2) {
      verbosEtapa = /propuesta|diseno|plan|estrategia|modelo|optimizacion|mejora|desarrollo/;
    } else {
      verbosEtapa = /evaluacion|analisis|impacto|efectividad|resultados|estimacion|valoracion/;
    }

    if (verbosEtapa.test(claveTitulo)) puntaje += 20;
    if (/[0-9]{4}/.test(titulo)) puntaje += 4;
    if (/no_especificado|titulo_academico_completo|primera_alternativa|segunda_alternativa|tercera_alternativa/.test(claveTitulo)) puntaje -= 40;
    if (/implementado|ejecutado|obtenidos|demostrado/.test(claveTitulo)) puntaje -= 12;

    puntaje += Math.max(0,3 - Number(indice || 0)) * 0.01;
    return puntaje;
  }

  function seleccionarMejorSugerencia(sugerencias, params) {
    var etapa = obtenerEtapaPropuesta(
      params && params.propuesta ? params.propuesta.numero : params && params.numeroPropuesta
    );
    var evaluadas = (Array.isArray(sugerencias) ? sugerencias : []).map(function(item,index){
      return {
        item:item,
        indice:index,
        puntaje:puntuarSugerencia(item,params,index)
      };
    });

    evaluadas.sort(function(a,b){
      return b.puntaje - a.puntaje || a.indice - b.indice;
    });

    if (!evaluadas.length) return null;

    return Object.assign({},evaluadas[0].item,{
      etapa:etapa.codigo,
      nombreEtapa:etapa.nombre,
      puntajeSeleccion:evaluadas[0].puntaje,
      seleccionadaAutomaticamente:true
    });
  }

  function instalarSeleccionAutomaticaIA() {
    var ia = window.EstudianteMVPIATitulacion || null;
    var state = window.EstudianteMVPState || null;
    var ui = window.EstudianteMVPUI || null;

    if (window.__ESTUDIANTE_IA_SELECCION_INSTALADA__) return;
    window.__ESTUDIANTE_IA_SELECCION_INSTALADA__ = true;

    if (ia && typeof ia.generarTitulosPorPropuesta === 'function') {
      (function(){
        var original = ia.generarTitulosPorPropuesta.bind(ia);

        function generar(params){
          return original(params).then(function(resultado){
            var candidatos = resultado && Array.isArray(resultado.sugerencias)
              ? resultado.sugerencias.slice(0,3)
              : [];
            var mejor = seleccionarMejorSugerencia(candidatos,params || {});

            if (!mejor) throw new Error('No se pudo seleccionar un título válido.');

            return Object.assign({},resultado,{
              candidatosIA:candidatos,
              mejorSugerencia:mejor,
              sugerencias:[mejor],
              mensaje:'Se generó y aplicó automáticamente el título recomendado para esta propuesta.'
            });
          }).catch(function(error){
            if (window.console && typeof window.console.warn === 'function') {
              window.console.warn('[IA Titulación] Detalle interno:',error);
            }
            throw new Error(MENSAJE_ERROR_IA);
          });
        }

        window.EstudianteMVPIATitulacion = Object.freeze(Object.assign({},ia,{
          generarTitulosPorPropuesta:generar,
          generarTresTitulos:generar,
          seleccionarMejorSugerencia:seleccionarMejorSugerencia,
          mensajeErrorPublico:MENSAJE_ERROR_IA
        }));
      })();
    }

    if (state && typeof state.setSugerenciasIA === 'function' && typeof state.seleccionarSugerencia === 'function') {
      (function(){
        var setOriginal = state.setSugerenciasIA.bind(state);
        var seleccionarOriginal = state.seleccionarSugerencia.bind(state);

        window.EstudianteMVPState = Object.freeze(Object.assign({},state,{
          setSugerenciasIA:function(numero,sugerencias,proveedor){
            var resultado = setOriginal(numero,sugerencias,proveedor);
            var lista = Array.isArray(sugerencias) ? sugerencias : [];
            var sugerencia = lista[0] || null;

            if (sugerencia) {
              seleccionarOriginal(numero,Number(sugerencia.numero || sugerencia.id || 1));
            }
            return resultado;
          }
        }));
      })();
    }

    ui = window.EstudianteMVPUI || ui;
    if (ui && typeof ui.pintarSugerencias === 'function') {
      (function(){
        var pintarOriginal = ui.pintarSugerencias.bind(ui);
        var escribirOriginal = typeof ui.escribirPropuestaEnFormulario === 'function'
          ? ui.escribirPropuestaEnFormulario.bind(ui)
          : null;
        var marcarOriginal = typeof ui.marcarSugerenciaUsada === 'function'
          ? ui.marcarSugerenciaUsada.bind(ui)
          : null;

        window.EstudianteMVPUI = Object.freeze(Object.assign({},ui,{
          pintarSugerencias:function(numeroPropuesta,sugerencias){
            var resultado = pintarOriginal(numeroPropuesta,sugerencias);
            var lista = Array.isArray(sugerencias) ? sugerencias : [];
            var sugerencia = lista[0] || null;
            var estadoActual = window.EstudianteMVPState || null;
            var propuesta;
            var contenedor;
            var tituloCabecera;
            var boton;

            if (sugerencia && estadoActual && typeof estadoActual.obtenerPropuesta === 'function') {
              propuesta = estadoActual.obtenerPropuesta(numeroPropuesta);
              if (propuesta && escribirOriginal) escribirOriginal(propuesta);
              if (marcarOriginal) marcarOriginal(numeroPropuesta,Number(sugerencia.numero || sugerencia.id || 1));

              contenedor = document.getElementById('p' + numeroPropuesta + 'Sugerencias');
              if (contenedor) {
                tituloCabecera = contenedor.querySelector('.suggestion-card__head strong');
                boton = contenedor.querySelector('[data-accion="usar-sugerencia"]');
                if (tituloCabecera) tituloCabecera.textContent = 'Título recomendado por IA';
                if (boton) {
                  boton.textContent = 'Aplicado automáticamente';
                  boton.disabled = true;
                  boton.removeAttribute('data-accion');
                }
              }
            }

            return resultado;
          }
        }));
      })();
    }
  }

  window.EstudianteMVPIAPrompt = Object.freeze({
    construirPromptTitulos: construirPromptTitulos,
    normalizarContexto: normalizarContexto,
    obtenerEtapas: obtenerEtapas,
    obtenerEtapaPropuesta: obtenerEtapaPropuesta
  });

  instalarPermisoReenvio();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded',instalarSeleccionAutomaticaIA,{ once:true });
  } else {
    window.setTimeout(instalarSeleccionAutomaticaIA,0);
  }
})(window, document);
