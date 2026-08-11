/* Recibe la cédula desde el formulario de Artículo Académico y ejecuta
 * automáticamente la consulta en la pantalla correcta.
 */
(function (window, document) {
  'use strict';

  function cedula(value) {
    var digits = String(value || '').replace(/\D/g, '');
    if (digits.length === 9) digits = '0' + digits;
    return digits.length === 10 ? digits : '';
  }

  function run() {
    var params;
    var id;
    var input;
    var form;
    try {
      params = new URLSearchParams(window.location.search || '');
      id = cedula(params.get('cedula'));
    } catch (_error) {
      return;
    }
    if (!id) return;

    input = document.getElementById('cedulaInput');
    form = document.getElementById('consultaForm');
    if (!input || !form) return;

    input.value = id;
    window.setTimeout(function () {
      if (typeof form.requestSubmit === 'function') form.requestSubmit();
      else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    }, 0);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
})(window, document);
