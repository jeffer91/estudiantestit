/*
  Indicadores públicos de motores internos utilizados.
  Muestra un punto por cada motor que realmente participó, sin revelar marcas,
  modelos ni credenciales.
*/
(function (window, document) {
  'use strict';

  var servicio = window.EstudianteMVPIAProviders;
  var ejecucion = null;
  var instalado = false;

  if (!servicio || typeof servicio.generarTexto !== 'function') return;

  function instalar() {
    if (instalado) return;
    instalarEstilos();
    instalarEventos();
    envolverServicio();
    instalado = true;
  }

  function instalarEstilos() {
    if (document.getElementById('ia-indicadores-motores-estilos')) return;

    var style = document.createElement('style');
    style.id = 'ia-indicadores-motores-estilos';
    style.textContent = [
      '.ia-diagnostico__puntos{flex-wrap:wrap}',
      '.ia-motores-contador{font-size:11px;font-weight:700;color:#64748b;text-align:center;margin-top:1px}',
      '.ia-diagnostico__punto[data-motor-usado="true"]{width:10px;height:10px}',
      '.ia-diagnostico__punto[data-estado="probando"]{background:#eab308}',
      '.ia-diagnostico__punto[data-estado="respuesta"],.ia-diagnostico__punto[data-estado="correcto"]{background:#16a34a}',
      '.ia-diagnostico__punto[data-estado="error"]{background:#dc2626}'
    ].join('');
    document.head.appendChild(style);
  }

  function instalarEventos() {
    document.addEventListener('ia-titulacion:3x3-inicio', function (evento) {
      iniciar(evento && evento.detail || {});
    });

    document.addEventListener('ia-titulacion:3x3-exito', function (evento) {
      finalizarCorrecto(evento && evento.detail || {});
    });

    document.addEventListener('ia-titulacion:3x3-error', function () {
      actualizarContador();
    });
  }

  function envolverServicio() {
    var original = servicio.generarTexto.bind(servicio);

    window.EstudianteMVPIAProviders = Object.freeze(Object.assign({}, servicio, {
      generarTexto: function (motor, prompt, opciones) {
        var id = idMotor(motor);
        marcar(id, 'probando');

        return original(motor, prompt, opciones).then(
          function (respuesta) {
            marcar(id, 'correcto');
            return respuesta;
          },
          function (error) {
            marcar(id, 'error');
            throw error;
          }
        );
      }
    }));
  }

  function iniciar(detalle) {
    var propuesta = Number(detalle.numeroPropuesta || 1);
    var bloque = obtenerBloque(propuesta);
    var puntos = bloque ? bloque.querySelector('[data-ia-puntos]') : null;

    ejecucion = {
      propuesta: propuesta,
      proceso: 1,
      maxProcesos: Number(detalle.maxProcesos || 3),
      motores: {}
    };

    if (puntos) puntos.innerHTML = '';
    asegurarContador(bloque);
    actualizarContador();
  }

  function marcar(id, estado) {
    var bloque;
    var contenedor;
    var punto;
    var indice;

    if (!ejecucion) iniciar({ numeroPropuesta: 1, maxProcesos: 3 });

    id = id || 'motor_1';
    bloque = obtenerBloque(ejecucion.propuesta);
    contenedor = bloque ? bloque.querySelector('[data-ia-puntos]') : null;
    if (!contenedor) return;

    if (!ejecucion.motores[id]) {
      indice = Object.keys(ejecucion.motores).length + 1;
      ejecucion.motores[id] = { indice: indice, estado: estado };
    } else {
      ejecucion.motores[id].estado = estado;
      indice = ejecucion.motores[id].indice;
    }

    punto = contenedor.querySelector('[data-ia-proveedor="' + escaparSelector(id) + '"]');
    if (!punto) {
      punto = document.createElement('span');
      punto.className = 'ia-diagnostico__punto';
      punto.setAttribute('data-ia-proveedor', id);
      punto.setAttribute('role', 'img');
      contenedor.appendChild(punto);
    }

    punto.setAttribute('data-motor-usado', 'true');
    punto.setAttribute('data-estado', estado);
    punto.setAttribute('title', 'Motor interno ' + indice + ': ' + descripcionEstado(estado));
    punto.setAttribute('aria-label', 'Motor interno ' + indice + ': ' + descripcionEstado(estado));

    actualizarContador();
  }

  function finalizarCorrecto(detalle) {
    var cantidad = Number(detalle.cantidadOpciones || 0);
    var bloque = ejecucion ? obtenerBloque(ejecucion.propuesta) : null;
    var etapa = bloque ? bloque.querySelector('[data-ia-etapa-visible]') : null;
    var usados = ejecucion ? Object.keys(ejecucion.motores).length : 0;

    actualizarContador();

    if (etapa) {
      etapa.textContent =
        'Proceso ' + Number(detalle.procesoUsado || detalle.proceso || 1) +
        ' de ' + Number(detalle.maxProcesos || ejecucion && ejecucion.maxProcesos || 3) +
        ' · ' + cantidad + ' ' + (cantidad === 1 ? 'opción lista' : 'opciones listas') +
        ' · ' + usados + ' ' + (usados === 1 ? 'motor utilizado' : 'motores utilizados');
    }
  }

  function asegurarContador(bloque) {
    var contador;
    var puntos;

    if (!bloque) return null;
    contador = bloque.querySelector('[data-ia-motores-contador]');
    if (contador) return contador;

    puntos = bloque.querySelector('[data-ia-puntos]');
    contador = document.createElement('div');
    contador.className = 'ia-motores-contador';
    contador.setAttribute('data-ia-motores-contador', '');

    if (puntos) puntos.insertAdjacentElement('afterend', contador);
    else bloque.appendChild(contador);
    return contador;
  }

  function actualizarContador() {
    var bloque = ejecucion ? obtenerBloque(ejecucion.propuesta) : null;
    var contador = asegurarContador(bloque);
    var usados = ejecucion ? Object.keys(ejecucion.motores).length : 0;

    if (!contador) return;
    contador.textContent = usados
      ? usados + ' ' + (usados === 1 ? 'motor interno utilizado' : 'motores internos utilizados')
      : 'Esperando motores internos';
  }

  function idMotor(motor) {
    motor = motor || {};
    return String(motor.id || motor.proveedor || motor.motor || 'motor_1')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '') || 'motor_1';
  }

  function descripcionEstado(estado) {
    var mapa = {
      probando: 'consultando',
      respuesta: 'respondió',
      correcto: 'respondió correctamente',
      error: 'no respondió'
    };
    return mapa[estado] || 'procesando';
  }

  function obtenerBloque(numeroPropuesta) {
    return document.querySelector('[data-ia-diagnostico="' + Number(numeroPropuesta || 0) + '"]');
  }

  function escaparSelector(valor) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(valor);
    return String(valor).replace(/(["\\])/g, '\\$1');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }

  window.EstudianteMVPIAIndicadoresMotores = Object.freeze({
    version: '1.0.0'
  });
})(window, document);
