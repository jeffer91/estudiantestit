/*
  Archivo: estudiante.modales.js
  Ruta: estudiantes-mvp/js/estudiante.modales.js
  Funciones principales:
  - Mostrar modal informativo al consultar cédula.
  - Mostrar modal tecnológico mientras se generan sugerencias IA.
  - Mostrar títulos generados por IA en un modal separado.
  - Mostrar confirmación bonita cuando el estudiante ya tiene un título definido.
  - Extraer correctamente el texto de sugerencias IA aunque lleguen como objetos.
  - Colorear el marco según el proveedor IA usado:
    Gemini azul, Groq verde, OpenRouter morado, Cloudflare naranja.
*/
(function (window, document) {
  'use strict';

  var STYLE_ID = 'estudianteModalesStyles';
  var MODAL_CONSULTA_ID = 'modalConsultaTitulos';
  var MODAL_IA_LOADING_ID = 'modalGenerandoIA';
  var MODAL_TITULOS_ID = 'modalTitulosIA';
  var MODAL_CONFIRMACION_TITULO_ID = 'modalConfirmacionTituloDefinido';

  var proveedores = {
    gemini: {
      nombre: 'Gemini',
      clase: 'student-modal--gemini',
      color: '#2563eb'
    },
    groq: {
      nombre: 'Groq',
      clase: 'student-modal--groq',
      color: '#16a34a'
    },
    openrouter: {
      nombre: 'OpenRouter',
      clase: 'student-modal--openrouter',
      color: '#7c3aed'
    },
    cloudflare: {
      nombre: 'Cloudflare',
      clase: 'student-modal--cloudflare',
      color: '#f97316'
    }
  };

  function asegurarEstilos() {
    var style;

    if (document.getElementById(STYLE_ID)) {
      return;
    }

    style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '.student-modal{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:18px;font-family:inherit;}',
      '.student-modal[hidden]{display:none;}',
      '.student-modal__backdrop{position:absolute;inset:0;background:rgba(15,23,42,.72);backdrop-filter:blur(8px);}',
      '.student-modal__card{position:relative;width:min(760px,100%);max-height:90vh;overflow:auto;border-radius:28px;background:linear-gradient(145deg,#ffffff,#f8fbff);box-shadow:0 30px 90px rgba(15,23,42,.32);padding:30px;border:1px solid rgba(148,163,184,.35);}',
      '.student-modal__card--tech{background:radial-gradient(circle at top left,rgba(124,58,237,.20),transparent 35%),radial-gradient(circle at bottom right,rgba(37,99,235,.16),transparent 35%),linear-gradient(145deg,#0f172a,#111827);color:#fff;border:1px solid rgba(167,139,250,.45);}',
      '.student-modal__kicker{display:inline-flex;align-items:center;gap:8px;margin:0 0 10px;padding:7px 13px;border-radius:999px;background:rgba(124,58,237,.12);color:#6d28d9;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;}',
      '.student-modal__card--tech .student-modal__kicker{background:rgba(255,255,255,.12);color:#e9d5ff;}',
      '.student-modal__title{margin:0 0 12px;font-size:clamp(24px,4vw,36px);line-height:1.05;color:#111827;}',
      '.student-modal__card--tech .student-modal__title{color:#fff;}',
      '.student-modal__text{margin:0 0 18px;color:#475569;font-size:16px;line-height:1.6;}',
      '.student-modal__card--tech .student-modal__text{color:#dbeafe;}',
      '.student-modal__list{display:grid;gap:12px;margin:20px 0 0;padding:0;list-style:none;}',
      '.student-modal__list li{display:flex;gap:12px;align-items:flex-start;padding:14px 15px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;color:#334155;}',
      '.student-modal__list strong{display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;font-size:13px;}',
      '.student-modal__actions{display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end;margin-top:24px;}',
      '.student-modal__btn{border:0;border-radius:999px;padding:12px 22px;font-weight:800;cursor:pointer;font-size:15px;transition:transform .18s ease,box-shadow .18s ease,opacity .18s ease;}',
      '.student-modal__btn:hover{transform:translateY(-1px);box-shadow:0 14px 30px rgba(15,23,42,.18);}',
      '.student-modal__btn--primary{background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;}',
      '.student-modal__btn--secondary{background:#e2e8f0;color:#0f172a;}',
      '.student-modal__btn--gold{background:linear-gradient(135deg,#c9ad63,#d8bd73);color:#111827;}',
      '.student-modal__close{position:absolute;top:16px;right:16px;width:38px;height:38px;border:0;border-radius:50%;background:rgba(15,23,42,.08);color:#0f172a;font-size:22px;line-height:1;cursor:pointer;}',
      '.student-modal__card--tech .student-modal__close{background:rgba(255,255,255,.12);color:#fff;}',
      '.student-modal__loader{display:grid;place-items:center;margin:24px 0;}',
      '.student-modal__orb{width:116px;height:116px;border-radius:50%;background:conic-gradient(from 0deg,#7c3aed,#2563eb,#06b6d4,#7c3aed);animation:studentOrbSpin 1.4s linear infinite;display:grid;place-items:center;box-shadow:0 0 45px rgba(124,58,237,.55);}',
      '.student-modal__orb::after{content:"IA";width:82px;height:82px;border-radius:50%;background:#0f172a;display:grid;place-items:center;color:#fff;font-size:26px;font-weight:900;letter-spacing:.04em;}',
      '.student-modal__scan{height:9px;border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden;margin-top:20px;}',
      '.student-modal__scan span{display:block;width:42%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#a78bfa,#60a5fa,#22d3ee);animation:studentScan 1.2s ease-in-out infinite;}',
      '.student-modal__provider{display:flex;align-items:center;gap:10px;margin:0 0 18px;padding:13px 15px;border-radius:18px;background:rgba(255,255,255,.78);border:2px solid var(--student-provider-color,#2563eb);color:#0f172a;font-weight:800;}',
      '.student-modal__provider-dot{width:14px;height:14px;border-radius:50%;background:var(--student-provider-color,#2563eb);box-shadow:0 0 0 6px rgba(37,99,235,.12);}',
      '.student-modal__titles{display:grid;gap:14px;margin-top:14px;}',
      '.student-modal__title-card{padding:16px;border-radius:20px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 10px 24px rgba(15,23,42,.06);}',
      '.student-modal__title-card h3{margin:0 0 8px;font-size:14px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;}',
      '.student-modal__title-card p{margin:0;color:#111827;font-weight:800;line-height:1.45;font-size:17px;}',
      '.student-modal__title-card .student-modal__actions{margin-top:14px;justify-content:flex-start;}',
      '.student-modal__empty{padding:16px;border-radius:18px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-weight:700;}',
      '.student-modal__notice{margin:16px 0 0;padding:16px;border-radius:20px;background:linear-gradient(135deg,#fff6df,#ffffff);border:1px solid rgba(201,173,99,.65);color:#334155;}',
      '.student-modal__notice strong{display:block;margin-bottom:6px;color:#8a6b24;font-size:13px;text-transform:uppercase;letter-spacing:.08em;}',
      '.student-modal__preview{margin-top:14px;padding:16px;border-radius:18px;background:#f8fafc;border:1px solid #d8e0ec;color:#0b2345;font-size:17px;font-weight:900;line-height:1.45;}',
      '.student-modal__warning{margin-top:14px;padding:14px 16px;border-radius:18px;background:#fff7e6;border:1px solid #f3d28b;color:#8a5a00;font-weight:800;line-height:1.45;}',
      '.student-modal--confirmacion .student-modal__card{border:3px solid #c9ad63;}',
      '.student-modal--gemini .student-modal__card{border:3px solid #2563eb;}',
      '.student-modal--groq .student-modal__card{border:3px solid #16a34a;}',
      '.student-modal--openrouter .student-modal__card{border:3px solid #7c3aed;}',
      '.student-modal--cloudflare .student-modal__card{border:3px solid #f97316;}',
      '@keyframes studentOrbSpin{to{transform:rotate(360deg);}}',
      '@keyframes studentScan{0%{transform:translateX(-110%);}50%{transform:translateX(90%);}100%{transform:translateX(250%);}}',
      '@media (max-width:560px){.student-modal__card{padding:24px 18px;border-radius:24px;}.student-modal__actions{justify-content:stretch;}.student-modal__btn{width:100%;}}'
    ].join('\n');

    document.head.appendChild(style);
  }

  function limpiarTexto(valor) {
    return String(valor == null ? '' : valor)
      .replace(/\s+/g, ' ')
      .trim();
  }

  function extraerTextoSugerencia(sugerencia) {
    var claves = [
      'titulo',
      'tituloFinal',
      'tituloMejorado',
      'title',
      'texto',
      'text',
      'propuesta'
    ];
    var i;
    var clave;
    var valor;

    if (typeof sugerencia === 'string') {
      return limpiarTexto(sugerencia);
    }

    if (!sugerencia || typeof sugerencia !== 'object') {
      return '';
    }

    for (i = 0; i < claves.length; i += 1) {
      clave = claves[i];

      if (Object.prototype.hasOwnProperty.call(sugerencia, clave)) {
        valor = sugerencia[clave];

        if (typeof valor === 'string') {
          valor = limpiarTexto(valor);

          if (valor) {
            return valor;
          }
        }

        if (valor && typeof valor === 'object') {
          valor = extraerTextoSugerencia(valor);

          if (valor) {
            return valor;
          }
        }
      }
    }

    return '';
  }

  function normalizarProveedor(valor) {
    var texto = String(valor || '')
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9_-]/g, '');

    if (texto.indexOf('openrouter') !== -1) return 'openrouter';
    if (texto.indexOf('cloudflare') !== -1) return 'cloudflare';
    if (texto.indexOf('groq') !== -1) return 'groq';
    if (texto.indexOf('gemini') !== -1) return 'gemini';

    return 'gemini';
  }

  function eliminarModal(id) {
    var modal = document.getElementById(id);

    if (modal && modal.parentNode) {
      modal.parentNode.removeChild(modal);
    }
  }

  function cerrarModal(id) {
    eliminarModal(id);
  }

  function cerrarTodos() {
    eliminarModal(MODAL_CONSULTA_ID);
    eliminarModal(MODAL_IA_LOADING_ID);
    eliminarModal(MODAL_TITULOS_ID);
    eliminarModal(MODAL_CONFIRMACION_TITULO_ID);
  }

  function crearModalBase(id, opciones) {
    var modal;
    var backdrop;
    var card;

    opciones = opciones || {};
    asegurarEstilos();
    eliminarModal(id);

    modal = document.createElement('div');
    modal.id = id;
    modal.className = 'student-modal' + (opciones.claseModal ? ' ' + opciones.claseModal : '');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    backdrop = document.createElement('div');
    backdrop.className = 'student-modal__backdrop';

    card = document.createElement('div');
    card.className = 'student-modal__card' + (opciones.tech ? ' student-modal__card--tech' : '');

    modal.appendChild(backdrop);
    modal.appendChild(card);
    document.body.appendChild(modal);

    if (opciones.cerrarConFondo) {
      backdrop.addEventListener('click', function () {
        cerrarModal(id);
      });
    }

    return {
      modal: modal,
      card: card
    };
  }

  function crearBoton(texto, clase, alClick) {
    var boton = document.createElement('button');

    boton.type = 'button';
    boton.className = 'student-modal__btn ' + (clase || 'student-modal__btn--primary');
    boton.textContent = texto;

    if (typeof alClick === 'function') {
      boton.addEventListener('click', alClick);
    }

    return boton;
  }

  function mostrarConsulta() {
    var base;
    var card;
    var kicker;
    var titulo;
    var texto;
    var lista;
    var acciones;
    var puntos = [
      'Aquí debes mandar tus títulos de titulación.',
      'El coordinador revisará tus propuestas antes de avanzar.',
      'Tendrás una IA de Titulación para ayudarte a generar mejores ideas.',
      'Solo puedes enviar una vez, por eso debes revisar todo con calma.',
      'Fíjate bien en tus títulos: de eso depende la calidad de tu investigación.'
    ];

    base = crearModalBase(MODAL_CONSULTA_ID, {
      cerrarConFondo: false
    });

    card = base.card;

    kicker = document.createElement('p');
    kicker.className = 'student-modal__kicker';
    kicker.textContent = 'Antes de continuar';

    titulo = document.createElement('h2');
    titulo.className = 'student-modal__title';
    titulo.textContent = 'Revisa bien tus títulos académicos';

    texto = document.createElement('p');
    texto.className = 'student-modal__text';
    texto.textContent = 'Mientras consultamos tus datos, recuerda estas reglas importantes del proceso.';

    lista = document.createElement('ul');
    lista.className = 'student-modal__list';

    puntos.forEach(function (punto, index) {
      var item = document.createElement('li');
      var numero = document.createElement('strong');
      var contenido = document.createElement('span');

      numero.textContent = String(index + 1);
      contenido.textContent = punto;

      item.appendChild(numero);
      item.appendChild(contenido);
      lista.appendChild(item);
    });

    acciones = document.createElement('div');
    acciones.className = 'student-modal__actions';
    acciones.appendChild(crearBoton('Entendido', 'student-modal__btn--primary', function () {
      cerrarModal(MODAL_CONSULTA_ID);
    }));

    card.appendChild(kicker);
    card.appendChild(titulo);
    card.appendChild(texto);
    card.appendChild(lista);
    card.appendChild(acciones);
  }

  function mostrarConfirmacionTituloDefinido(opciones) {
    var base;
    var card;
    var cerrar;
    var kicker;
    var titulo;
    var texto;
    var aviso;
    var preview;
    var advertencia;
    var acciones;
    var numeroPropuesta;
    var tituloEscrito;
    var camposFaltantes;

    opciones = opciones || {};
    numeroPropuesta = Number(opciones.numeroPropuesta || 0);
    tituloEscrito = limpiarTexto(opciones.titulo || '');
    camposFaltantes = Array.isArray(opciones.camposFaltantes)
      ? opciones.camposFaltantes
      : [];

    base = crearModalBase(MODAL_CONFIRMACION_TITULO_ID, {
      claseModal: 'student-modal--confirmacion',
      cerrarConFondo: false
    });

    card = base.card;

    cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'student-modal__close';
    cerrar.setAttribute('aria-label', 'Cerrar');
    cerrar.textContent = '×';
    cerrar.addEventListener('click', function () {
      cerrarModal(MODAL_CONFIRMACION_TITULO_ID);

      if (typeof opciones.alCancelar === 'function') {
        opciones.alCancelar();
      }
    });

    kicker = document.createElement('p');
    kicker.className = 'student-modal__kicker';
    kicker.textContent = 'Título definido';

    titulo = document.createElement('h2');
    titulo.className = 'student-modal__title';
    titulo.textContent = '¿Quieres continuar solo con este título?';

    texto = document.createElement('p');
    texto.className = 'student-modal__text';
    texto.textContent =
      'Ya tienes un título escrito para la propuesta ' + numeroPropuesta +
      '. Puedes continuar sin llenar los campos usados para generar sugerencias con IA.';

    aviso = document.createElement('div');
    aviso.className = 'student-modal__notice';

    aviso.innerHTML =
      '<strong>Título escrito por el estudiante</strong>' +
      '<div class="student-modal__preview"></div>';

    preview = aviso.querySelector('.student-modal__preview');
    preview.textContent = tituloEscrito || 'Sin título visible';

    advertencia = document.createElement('div');
    advertencia.className = 'student-modal__warning';
    advertencia.textContent =
      camposFaltantes.length
        ? 'Si continúas, el sistema aprobará esta propuesta con el título actual y no usará los campos faltantes para sugerencias de IA.'
        : 'Si continúas, el sistema aprobará esta propuesta con el título actual.';

    acciones = document.createElement('div');
    acciones.className = 'student-modal__actions';

    acciones.appendChild(crearBoton('Volver y completar campos', 'student-modal__btn--secondary', function () {
      cerrarModal(MODAL_CONFIRMACION_TITULO_ID);

      if (typeof opciones.alCancelar === 'function') {
        opciones.alCancelar();
      }
    }));

    acciones.appendChild(crearBoton('Sí, continuar con este título', 'student-modal__btn--gold', function () {
      cerrarModal(MODAL_CONFIRMACION_TITULO_ID);

      if (typeof opciones.alConfirmar === 'function') {
        opciones.alConfirmar();
      }
    }));

    card.appendChild(cerrar);
    card.appendChild(kicker);
    card.appendChild(titulo);
    card.appendChild(texto);
    card.appendChild(aviso);
    card.appendChild(advertencia);
    card.appendChild(acciones);
  }

  function mostrarGenerandoIA() {
    var base;
    var card;
    var kicker;
    var titulo;
    var texto;
    var loader;
    var orb;
    var scan;
    var scanBar;

    base = crearModalBase(MODAL_IA_LOADING_ID, {
      tech: true,
      cerrarConFondo: false
    });

    card = base.card;

    kicker = document.createElement('p');
    kicker.className = 'student-modal__kicker';
    kicker.textContent = 'IA de Titulación activa';

    titulo = document.createElement('h2');
    titulo.className = 'student-modal__title';
    titulo.textContent = 'Generando sugerencias con IA de Titulación';

    texto = document.createElement('p');
    texto.className = 'student-modal__text';
    texto.textContent = 'Estamos analizando tu tema, contexto, problema y objetivo para crear títulos más claros y académicos.';

    loader = document.createElement('div');
    loader.className = 'student-modal__loader';

    orb = document.createElement('div');
    orb.className = 'student-modal__orb';

    scan = document.createElement('div');
    scan.className = 'student-modal__scan';

    scanBar = document.createElement('span');
    scan.appendChild(scanBar);

    loader.appendChild(orb);

    card.appendChild(kicker);
    card.appendChild(titulo);
    card.appendChild(texto);
    card.appendChild(loader);
    card.appendChild(scan);
  }

  function cerrarGenerandoIA() {
    cerrarModal(MODAL_IA_LOADING_ID);
  }

  function mostrarTitulosIA(opciones) {
    var proveedorId;
    var proveedorInfo;
    var base;
    var card;
    var cerrar;
    var kicker;
    var titulo;
    var proveedor;
    var punto;
    var proveedorTexto;
    var contenedorTitulos;
    var accionesFinales;
    var sugerencias;
    var numeroPropuesta;
    var totalPintados;

    opciones = opciones || {};
    sugerencias = Array.isArray(opciones.sugerencias) ? opciones.sugerencias : [];
    numeroPropuesta = Number(opciones.numeroPropuesta || 0);
    proveedorId = normalizarProveedor(opciones.proveedor || opciones.proveedorNombre);
    proveedorInfo = proveedores[proveedorId] || proveedores.gemini;
    totalPintados = 0;

    base = crearModalBase(MODAL_TITULOS_ID, {
      claseModal: proveedorInfo.clase,
      cerrarConFondo: true
    });

    card = base.card;
    card.style.setProperty('--student-provider-color', proveedorInfo.color);

    cerrar = document.createElement('button');
    cerrar.type = 'button';
    cerrar.className = 'student-modal__close';
    cerrar.setAttribute('aria-label', 'Cerrar');
    cerrar.textContent = '×';
    cerrar.addEventListener('click', function () {
      cerrarModal(MODAL_TITULOS_ID);
    });

    kicker = document.createElement('p');
    kicker.className = 'student-modal__kicker';
    kicker.textContent = 'Sugerencias generadas';

    titulo = document.createElement('h2');
    titulo.className = 'student-modal__title';
    titulo.textContent = 'Elige el título que más te convenga';

    proveedor = document.createElement('div');
    proveedor.className = 'student-modal__provider';

    punto = document.createElement('span');
    punto.className = 'student-modal__provider-dot';

    proveedorTexto = document.createElement('span');
    proveedorTexto.textContent = 'IA utilizada: ' + (opciones.proveedorNombre || proveedorInfo.nombre);

    proveedor.appendChild(punto);
    proveedor.appendChild(proveedorTexto);

    contenedorTitulos = document.createElement('div');
    contenedorTitulos.className = 'student-modal__titles';

    sugerencias.forEach(function (sugerencia, index) {
      var tarjeta;
      var etiqueta;
      var texto;
      var acciones;
      var botonUsar;
      var tituloLimpio;

      tituloLimpio = extraerTextoSugerencia(sugerencia);

      if (!tituloLimpio) {
        return;
      }

      totalPintados += 1;

      tarjeta = document.createElement('div');
      etiqueta = document.createElement('h3');
      texto = document.createElement('p');
      acciones = document.createElement('div');
      botonUsar = document.createElement('button');

      tarjeta.className = 'student-modal__title-card';

      etiqueta.textContent = 'Título sugerido ' + totalPintados;
      texto.textContent = tituloLimpio;

      acciones.className = 'student-modal__actions';

      botonUsar.type = 'button';
      botonUsar.className = 'student-modal__btn student-modal__btn--primary';
      botonUsar.textContent = 'Usar este título';
      botonUsar.setAttribute('data-accion', 'usar-sugerencia');
      botonUsar.setAttribute('data-propuesta', String(numeroPropuesta));
      botonUsar.setAttribute('data-sugerencia', String(index + 1));

      botonUsar.addEventListener('click', function () {
        window.setTimeout(function () {
          cerrarModal(MODAL_TITULOS_ID);
        }, 80);
      });

      acciones.appendChild(botonUsar);
      tarjeta.appendChild(etiqueta);
      tarjeta.appendChild(texto);
      tarjeta.appendChild(acciones);

      contenedorTitulos.appendChild(tarjeta);
    });

    if (!totalPintados) {
      var aviso = document.createElement('div');
      aviso.className = 'student-modal__empty';
      aviso.textContent = 'La IA respondió, pero no se pudo leer el texto de los títulos generados.';
      contenedorTitulos.appendChild(aviso);
    }

    accionesFinales = document.createElement('div');
    accionesFinales.className = 'student-modal__actions';
    accionesFinales.appendChild(crearBoton('Cerrar', 'student-modal__btn--secondary', function () {
      cerrarModal(MODAL_TITULOS_ID);
    }));

    card.appendChild(cerrar);
    card.appendChild(kicker);
    card.appendChild(titulo);
    // No se muestra la caja "IA utilizada" para ocultar el proveedor al estudiante.
    card.appendChild(contenedorTitulos);
    card.appendChild(accionesFinales);
  }

  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape') {
      eliminarModal(MODAL_TITULOS_ID);
      eliminarModal(MODAL_CONFIRMACION_TITULO_ID);
    }
  });

  window.EstudianteMVPModales = Object.freeze({
    mostrarConsulta: mostrarConsulta,
    mostrarConfirmacionTituloDefinido: mostrarConfirmacionTituloDefinido,
    mostrarGenerandoIA: mostrarGenerandoIA,
    cerrarGenerandoIA: cerrarGenerandoIA,
    mostrarTitulosIA: mostrarTitulosIA,
    cerrarTodos: cerrarTodos
  });
})(window, document);