/*
  Archivo: ia.recomendacion.ui.js
  Funciones principales:
  - Mostrar siempre las tres sugerencias generadas o corregidas por IA.
  - Marcar visualmente la mejor sin aplicarla automáticamente.
  - Mantener la decisión final en manos del estudiante.
*/
(function (window, document) {
  'use strict';

  var instalado = false;
  var intentosInstalacion = 0;

  function instalarEstilos() {
    var style;

    if (document.getElementById('ia-recomendacion-estilos')) return;

    style = document.createElement('style');
    style.id = 'ia-recomendacion-estilos';
    style.textContent = [
      '.suggestion-card.is-recommended{border:2px solid #c9ad63;box-shadow:0 14px 34px rgba(138,107,36,.14)}',
      '.ia-recommended-badge{display:inline-flex;align-items:center;margin-left:8px;padding:4px 9px;border-radius:999px;background:#fff4cf;color:#7a5a09;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}',
      '.student-modal__title-card.is-recommended{border:2px solid #c9ad63;background:linear-gradient(145deg,#fffdf7,#ffffff)}',
      '.student-modal__recommendation{margin:9px 0 0;color:#7a5a09;font-size:13px;font-weight:800;line-height:1.4}'
    ].join('');

    document.head.appendChild(style);
  }

  function instalar() {
    var ui = window.EstudianteMVPUI || null;
    var modales = window.EstudianteMVPModales || null;

    if (instalado) return;

    if (!ui || !modales) {
      intentosInstalacion += 1;
      if (intentosInstalacion < 40) window.setTimeout(instalar, 50);
      return;
    }

    instalarEstilos();
    envolverUI(ui);
    envolverModales(modales);
    instalado = true;
  }

  function envolverUI(ui) {
    var pintarOriginal;

    if (ui.__recomendacionInstalada || typeof ui.pintarSugerencias !== 'function') return;
    pintarOriginal = ui.pintarSugerencias.bind(ui);

    window.EstudianteMVPUI = Object.freeze(Object.assign({}, ui, {
      pintarSugerencias: function (numeroPropuesta, sugerencias) {
        var resultado = pintarOriginal(numeroPropuesta, sugerencias);

        window.setTimeout(function () {
          marcarTarjetasPagina(numeroPropuesta, sugerencias);
        }, 0);

        return resultado;
      },
      __recomendacionInstalada: true
    }));
  }

  function envolverModales(modales) {
    var mostrarOriginal;

    if (modales.__recomendacionInstalada || typeof modales.mostrarTitulosIA !== 'function') return;
    mostrarOriginal = modales.mostrarTitulosIA.bind(modales);

    window.EstudianteMVPModales = Object.freeze(Object.assign({}, modales, {
      mostrarTitulosIA: function (opciones) {
        var resultado = mostrarOriginal(opciones);

        window.setTimeout(function () {
          marcarTarjetasModal(opciones && opciones.sugerencias || []);
        }, 0);

        return resultado;
      },
      __recomendacionInstalada: true
    }));
  }

  function marcarTarjetasPagina(numeroPropuesta, sugerencias) {
    (Array.isArray(sugerencias) ? sugerencias : []).forEach(function (item, index) {
      var numero = Number(item.numero || index + 1);
      var tarjeta = document.querySelector(
        '[data-sugerencia-card="' + Number(numeroPropuesta) + '-' + numero + '"]'
      );
      var cabecera;
      var fuerte;

      if (!tarjeta) return;
      tarjeta.classList.toggle(
        'is-recommended',
        item.recomendada === true || item.recomendado === true
      );
      cabecera = tarjeta.querySelector('.suggestion-card__head');
      fuerte = cabecera ? cabecera.querySelector('strong') : null;

      if (fuerte) fuerte.textContent = 'Sugerencia ' + numero;
      if (cabecera && (item.recomendada === true || item.recomendado === true)) {
        agregarBadge(cabecera);
      }
    });
  }

  function marcarTarjetasModal(sugerencias) {
    var modal = document.getElementById('modalTitulosIA');
    var tarjetas = modal ? modal.querySelectorAll('.student-modal__title-card') : [];

    Array.prototype.forEach.call(tarjetas, function (tarjeta, index) {
      var item = sugerencias[index] || {};
      var etiqueta = tarjeta.querySelector('h3');
      var textoJustificacion;
      var acciones = tarjeta.querySelector('.student-modal__actions');

      if (etiqueta) etiqueta.textContent = 'Título sugerido ' + (index + 1);

      if (item.recomendada === true || item.recomendado === true) {
        tarjeta.classList.add('is-recommended');
        if (etiqueta) agregarBadge(etiqueta);
      }

      if (item.justificacion && acciones) {
        textoJustificacion = document.createElement('p');
        textoJustificacion.className = 'student-modal__recommendation';
        textoJustificacion.textContent = item.justificacion;
        tarjeta.insertBefore(textoJustificacion, acciones);
      }
    });
  }

  function agregarBadge(contenedor) {
    var badge;

    if (!contenedor || contenedor.querySelector('.ia-recommended-badge')) return;
    badge = document.createElement('span');
    badge.className = 'ia-recommended-badge';
    badge.textContent = 'Recomendada';
    contenedor.appendChild(badge);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', instalar, { once: true });
  } else {
    instalar();
  }
})(window, document);
