/* =========================================================
Archivo: ad-coordinadores.app.js
Ruta: /administrador/ad-js/ad-coordinadores.app.js
Función:
- Conectar la administración de coordinadores con la pantalla.
- Mostrar las carreras en una tabla independiente.
- Permitir seleccionar y guardar un coordinador en cada fila.
========================================================= */

(function(window, document){
  "use strict";

  var coordinadores = [];
  var carreras = [];
  var carrerasCargadas = false;
  var cargandoCarrerasPromise = null;

  function $(id){ return document.getElementById(id); }

  function texto(valor){
    return String(valor === null || valor === undefined ? "" : valor).trim();
  }

  function html(valor){
    return texto(valor)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setTexto(id, valor){
    var el = $(id);
    if (el) el.textContent = valor;
  }

  function setHtml(id, valor){
    var el = $(id);
    if (el) el.innerHTML = valor;
  }

  function valor(id){
    var el = $(id);
    return el ? texto(el.value) : "";
  }

  function setValor(id, valorNuevo){
    var el = $(id);
    if (el) el.value = valorNuevo || "";
  }

  function diagnostico(mensaje){
    setTexto("ad-panel-diagnostico", mensaje);
  }

  function service(){
    if (!window.ADCoordinadoresService) {
      throw new Error("ADCoordinadoresService no está disponible.");
    }
    return window.ADCoordinadoresService;
  }

  function titulos(){
    if (!window.ADTitulosService) {
      throw new Error("ADTitulosService no está disponible.");
    }
    return window.ADTitulosService;
  }

  function inyectarEstilosCarreras(){
    var style;

    if ($("ad-carreras-estilos")) return;

    style = document.createElement("style");
    style.id = "ad-carreras-estilos";
    style.textContent = [
      ".ad-carreras-status{margin:0 0 16px;padding:12px 14px;border:1px solid var(--ad-border);border-radius:12px;background:var(--ad-surface-soft);color:var(--ad-muted);line-height:1.45;}",
      ".ad-carreras-status.is-loading{background:#eef5ff;color:var(--ad-info);border-color:#cfe0fb;}",
      ".ad-carreras-status.is-success{background:#e8f7ee;color:var(--ad-success);border-color:#ccebd7;}",
      ".ad-carreras-status.is-error{background:#fff1f0;color:var(--ad-danger);border-color:#f0cbc7;}",
      ".ad-tabla-carreras{min-width:760px;}",
      ".ad-tabla-carreras th:nth-child(1){width:44%;}",
      ".ad-tabla-carreras th:nth-child(2){width:38%;}",
      ".ad-tabla-carreras th:nth-child(3){width:18%;}",
      ".ad-carrera-nombre strong{display:block;color:var(--ad-text);font-size:15px;line-height:1.35;}",
      ".ad-carrera-nombre small{display:block;margin-top:4px;color:var(--ad-muted);}",
      ".ad-carrera-select{min-width:240px;}",
      ".ad-carrera-accion{min-width:145px;}",
      ".ad-carrera-accion .ad-btn{width:100%;}",
      ".ad-carrera-estado{display:block;min-height:18px;margin-top:6px;color:var(--ad-muted);font-size:12px;line-height:1.35;}",
      ".ad-carrera-fila.is-saving{background:#f7faff;}",
      ".ad-carrera-fila.is-success{background:#f2fbf5;}",
      ".ad-carrera-fila.is-error{background:#fff7f6;}",
      ".ad-carrera-fila.is-success .ad-carrera-estado{color:var(--ad-success);font-weight:700;}",
      ".ad-carrera-fila.is-error .ad-carrera-estado{color:var(--ad-danger);font-weight:700;}",
      ".ad-carrera-fila select:disabled,.ad-carrera-fila button:disabled{cursor:not-allowed;opacity:.7;}",
      "@media(max-width:840px){.ad-tabla-carreras{min-width:680px;}.ad-carrera-select{min-width:210px;}}"
    ].join("");

    document.head.appendChild(style);
  }

  function prepararVistaCarreras(){
    var seccion = $("ad-seccion-carreras");
    var card;

    if (!seccion) return;

    card = seccion.querySelector(".ad-card");
    if (!card || card.getAttribute("data-tabla-carreras-lista") === "true") return;

    card.setAttribute("data-tabla-carreras-lista", "true");
    card.innerHTML = [
      '<div id="ad-estado-carreras" class="ad-carreras-status">',
      '  Abre esta sección para cargar las carreras y sus coordinadores.',
      '</div>',
      '<div class="ad-table-wrap">',
      '  <table class="ad-table ad-tabla-carreras">',
      '    <thead>',
      '      <tr>',
      '        <th>Carrera</th>',
      '        <th>Coordinador</th>',
      '        <th>Guardar</th>',
      '      </tr>',
      '    </thead>',
      '    <tbody id="ad-tabla-carreras">',
      '      <tr>',
      '        <td colspan="3" class="ad-empty">Cargando información...</td>',
      '      </tr>',
      '    </tbody>',
      '  </table>',
      '</div>'
    ].join("");

    inyectarEstilosCarreras();
  }

  function mostrarEstadoCarreras(mensaje, tipo){
    var el = $("ad-estado-carreras");
    if (!el) return;

    el.classList.remove("is-loading", "is-success", "is-error");
    if (tipo) el.classList.add("is-" + tipo);
    el.textContent = mensaje || "";
  }

  function renderCoordinadores(renderizarCarreras){
    var filas = [];

    coordinadores.forEach(function(item){
      var id = item._docId || item.id || "";
      var activo = item.activo !== false;
      var totalCarreras = Array.isArray(item.carreras) ? item.carreras.length : 0;

      filas.push(
        "<tr>" +
          "<td><strong>" + html(item.nombre || id) + "</strong><br><small>" + html(id) + "</small></td>" +
          "<td>" + html(item.telegram || item.Telegram || "") + "</td>" +
          "<td><span class='ad-badge " + (activo ? "ad-badge-success" : "ad-badge-warning") + "'>" + (activo ? "Activo" : "Inactivo") + "</span></td>" +
          "<td>" + totalCarreras + "</td>" +
          "<td><button class='ad-btn ad-btn-secondary ad-coord-editar' type='button' data-id='" + html(id) + "'>Editar</button> " +
          "<button class='ad-btn " + (activo ? "ad-btn-danger" : "ad-btn-primary") + " ad-coord-estado' type='button' data-id='" + html(id) + "' data-activo='" + (activo ? "0" : "1") + "'>" + (activo ? "Desactivar" : "Activar") + "</button></td>" +
        "</tr>"
      );
    });

    setHtml(
      "ad-tabla-coordinadores",
      filas.length
        ? filas.join("")
        : '<tr><td colspan="5" class="ad-empty">No se encontraron coordinadores.</td></tr>'
    );

    setTexto("ad-kpi-coordinadores", String(coordinadores.length));

    if (renderizarCarreras !== false && carreras.length) {
      renderTablaCarreras();
    }
  }

  function cargarCoordinadores(){
    return service().listarCoordinadores(200).then(function(resp){
      coordinadores = resp.coordinadores || [];
      renderCoordinadores();
      return resp;
    }).catch(function(error){
      diagnostico("Error al cargar coordinadores:\n" + (error.message || String(error)));
      throw error;
    });
  }

  function guardarCoordinador(evento){
    if (evento) {
      evento.preventDefault();
      evento.stopImmediatePropagation();
    }

    diagnostico("Guardando coordinador...");

    return service().guardarCoordinador({
      id: valor("ad-coordinador-id"),
      nombre: valor("ad-coordinador-nombre"),
      telegram: valor("ad-coordinador-telegram")
    }).then(function(item){
      setValor("ad-coordinador-id", item && (item._docId || item.id) || "");
      diagnostico("Coordinador guardado correctamente.");
      return cargarCoordinadores();
    }).catch(function(error){
      diagnostico("Error al guardar coordinador:\n" + (error.message || String(error)));
    });
  }

  function accionesTabla(evento){
    var target = evento.target;
    var editar = target && target.closest ? target.closest(".ad-coord-editar") : null;
    var estado = target && target.closest ? target.closest(".ad-coord-estado") : null;

    if (!editar && !estado) return;

    evento.preventDefault();
    evento.stopImmediatePropagation();

    if (editar) {
      var idEditar = editar.getAttribute("data-id");
      var item = coordinadores.find(function(coordinador){
        return (coordinador._docId || coordinador.id) === idEditar;
      });

      if (!item) return;

      setValor("ad-coordinador-id", item._docId || item.id || "");
      setValor("ad-coordinador-nombre", item.nombre || "");
      setValor("ad-coordinador-telegram", item.telegram || item.Telegram || "");
      diagnostico("Coordinador cargado para edición: " + (item.nombre || idEditar));
      return;
    }

    if (estado) {
      var idEstado = estado.getAttribute("data-id");
      var nuevoEstado = estado.getAttribute("data-activo") === "1";

      service().cambiarEstado(idEstado, nuevoEstado).then(function(){
        diagnostico("Estado actualizado.");
        return cargarCoordinadores();
      }).catch(function(error){
        diagnostico("Error al cambiar estado:\n" + (error.message || String(error)));
      });
    }
  }

  function carreraCoincide(itemAsignado, carrera){
    if (service().coincideCarrera) {
      return service().coincideCarrera(itemAsignado, carrera);
    }

    return texto(itemAsignado).toLowerCase() === texto(carrera && (carrera.nombreCarrera || carrera.key)).toLowerCase();
  }

  function coordinadorTieneCarrera(coordinador, carrera){
    var listaNombres = Array.isArray(coordinador.carreras) ? coordinador.carreras : [];
    var listaDetalle = Array.isArray(coordinador.carrerasAsignadas) ? coordinador.carrerasAsignadas : [];

    return listaNombres.some(function(item){
      return carreraCoincide(item, carrera);
    }) || listaDetalle.some(function(item){
      return carreraCoincide(item, carrera);
    });
  }

  function buscarCoordinadorAsignado(carrera){
    return coordinadores.find(function(coordinador){
      return coordinadorTieneCarrera(coordinador, carrera);
    }) || null;
  }

  function construirOpcionesCoordinadores(carrera){
    var asignado = buscarCoordinadorAsignado(carrera);
    var asignadoId = asignado ? texto(asignado._docId || asignado.id) : "";
    var opciones = ['<option value="">Seleccionar coordinador</option>'];

    coordinadores.forEach(function(item){
      var id = texto(item._docId || item.id);
      var activo = item.activo !== false;
      var seleccionado = id && id === asignadoId;

      if (!activo && !seleccionado) return;

      opciones.push(
        '<option value="' + html(id) + '"' +
        (seleccionado ? ' selected' : '') +
        '>' + html(item.nombre || id) + (activo ? "" : " (inactivo)") + '</option>'
      );
    });

    return opciones.join("");
  }

  function claveVisualCarrera(carrera, indice){
    return texto(
      carrera && (
        carrera.key ||
        carrera.codigoCarrera ||
        carrera.nombreCarrera
      )
    ) || String(indice);
  }

  function renderTablaCarreras(exitoKey, errorKey, errorMensaje){
    var tbody = $("ad-tabla-carreras");
    var filas = [];

    if (!tbody) return;

    carreras.forEach(function(item, indice){
      var key = claveVisualCarrera(item, indice);
      var claseEstado = key === exitoKey
        ? " is-success"
        : key === errorKey
          ? " is-error"
          : "";
      var mensajeEstado = key === exitoKey
        ? "Asignación guardada correctamente."
        : key === errorKey
          ? (errorMensaje || "No se pudo guardar.")
          : "";
      var nombre = item.nombreCarrera || item.codigoCarrera || item.key || "Carrera sin nombre";
      var codigo = item.codigoCarrera || "";

      filas.push(
        '<tr class="ad-carrera-fila' + claseEstado + '" data-carrera-index="' + indice + '">' +
          '<td class="ad-carrera-nombre">' +
            '<strong>' + html(nombre) + '</strong>' +
            (codigo && texto(codigo) !== texto(nombre) ? '<small>' + html(codigo) + '</small>' : '') +
          '</td>' +
          '<td>' +
            '<select class="ad-carrera-select" aria-label="Coordinador de ' + html(nombre) + '">' +
              construirOpcionesCoordinadores(item) +
            '</select>' +
          '</td>' +
          '<td class="ad-carrera-accion">' +
            '<button class="ad-btn ad-btn-primary ad-carrera-guardar" type="button" data-carrera-index="' + indice + '">Guardar</button>' +
            '<small class="ad-carrera-estado">' + html(mensajeEstado) + '</small>' +
          '</td>' +
        '</tr>'
      );
    });

    tbody.innerHTML = filas.length
      ? filas.join("")
      : '<tr><td colspan="3" class="ad-empty">No se encontraron carreras.</td></tr>';

    setTexto("ad-kpi-carreras", String(carreras.length));
  }

  function cargarCarreras(forzar){
    if (cargandoCarrerasPromise) return cargandoCarrerasPromise;

    if (carrerasCargadas && !forzar) {
      renderTablaCarreras();
      return Promise.resolve({ carreras: carreras, totalCarreras: carreras.length });
    }

    mostrarEstadoCarreras(
      "Detectando carreras desde los títulos enviados y cruzando la información con Estudiantes...",
      "loading"
    );

    setHtml(
      "ad-tabla-carreras",
      '<tr><td colspan="3" class="ad-empty">Cargando carreras...</td></tr>'
    );

    cargandoCarrerasPromise = titulos().detectarCarrerasDesdeTitulos(300).then(function(resp){
      carreras = resp.carreras || [];
      carrerasCargadas = true;
      renderTablaCarreras();

      mostrarEstadoCarreras(
        carreras.length
          ? "Se cargaron " + carreras.length + " carreras. Selecciona un coordinador y presiona Guardar en la fila correspondiente."
          : "No se encontraron carreras para asignar.",
        carreras.length ? "success" : "error"
      );

      diagnostico(
        "Carreras detectadas: " + resp.totalCarreras +
        "\nTítulos leídos: " + resp.totalTitulosLeidos +
        "\nCon estudiante encontrado: " + resp.totalConEstudiante +
        "\nSin carrera: " + resp.totalSinCarrera
      );

      return resp;
    }).catch(function(error){
      var mensaje = error.message || String(error);
      carrerasCargadas = false;
      setHtml(
        "ad-tabla-carreras",
        '<tr><td colspan="3" class="ad-empty">No se pudieron cargar las carreras.</td></tr>'
      );
      mostrarEstadoCarreras("Error al cargar carreras: " + mensaje, "error");
      diagnostico("Error al cargar carreras:\n" + mensaje);
      throw error;
    }).then(function(resultado){
      cargandoCarrerasPromise = null;
      return resultado;
    }, function(error){
      cargandoCarrerasPromise = null;
      throw error;
    });

    return cargandoCarrerasPromise;
  }

  function cargarDatosCarreras(forzar){
    var promesaCoordinadores = coordinadores.length
      ? Promise.resolve()
      : cargarCoordinadores();

    return promesaCoordinadores.then(function(){
      return cargarCarreras(forzar === true);
    });
  }

  function guardarCarreraFila(evento){
    var boton = evento.currentTarget || evento.target;
    var fila = boton && boton.closest ? boton.closest(".ad-carrera-fila") : null;
    var indice = Number(boton && boton.getAttribute("data-carrera-index"));
    var carrera = carreras[indice];
    var selector = fila ? fila.querySelector(".ad-carrera-select") : null;
    var estadoFila = fila ? fila.querySelector(".ad-carrera-estado") : null;
    var coordinadorId = selector ? texto(selector.value) : "";
    var key = claveVisualCarrera(carrera, indice);

    evento.preventDefault();
    evento.stopImmediatePropagation();

    if (!fila || !carrera) return;

    fila.classList.remove("is-success", "is-error");

    if (!coordinadorId) {
      fila.classList.add("is-error");
      if (estadoFila) estadoFila.textContent = "Selecciona un coordinador.";
      if (selector) selector.focus();
      return;
    }

    fila.classList.add("is-saving");
    selector.disabled = true;
    boton.disabled = true;
    boton.textContent = "Guardando...";
    if (estadoFila) estadoFila.textContent = "Guardando asignación...";

    service().guardarAsignacionCarrera(coordinadorId, carrera).then(function(resultado){
      diagnostico(
        "Asignación guardada correctamente.\nCarrera: " +
        (carrera.nombreCarrera || carrera.codigoCarrera || carrera.key) +
        "\nCoordinador: " +
        (resultado.coordinador && resultado.coordinador.nombre || coordinadorId)
      );

      return service().listarCoordinadores(200);
    }).then(function(resp){
      coordinadores = resp.coordinadores || [];
      renderCoordinadores(false);
      renderTablaCarreras(key);
      mostrarEstadoCarreras("Asignación actualizada correctamente.", "success");
    }).catch(function(error){
      var mensaje = error.message || String(error);
      fila.classList.remove("is-saving");
      fila.classList.add("is-error");
      selector.disabled = false;
      boton.disabled = false;
      boton.textContent = "Guardar";
      if (estadoFila) estadoFila.textContent = mensaje;
      mostrarEstadoCarreras("No se pudo guardar la asignación.", "error");
      diagnostico("Error al asignar carrera:\n" + mensaje);
    });
  }

  function accionesTablaCarreras(evento){
    var target = evento.target;
    var boton = target && target.closest ? target.closest(".ad-carrera-guardar") : null;

    if (!boton) return;
    guardarCarreraFila({
      currentTarget: boton,
      target: boton,
      preventDefault: function(){ evento.preventDefault(); },
      stopImmediatePropagation: function(){ evento.stopImmediatePropagation(); }
    });
  }

  function conectar(){
    var btnGuardar = $("ad-btn-coordinador-guardar");
    var tablaCoordinadores = $("ad-tabla-coordinadores");
    var tablaCarreras;
    var enlaceCarreras;

    prepararVistaCarreras();

    tablaCarreras = $("ad-tabla-carreras");
    enlaceCarreras = document.querySelector('[data-ad-view-target="ad-seccion-carreras"]');

    if (btnGuardar) btnGuardar.addEventListener("click", guardarCoordinador, true);
    if (tablaCoordinadores) tablaCoordinadores.addEventListener("click", accionesTabla, true);
    if (tablaCarreras) tablaCarreras.addEventListener("click", accionesTablaCarreras, true);

    if (enlaceCarreras) {
      enlaceCarreras.addEventListener("click", function(){
        window.setTimeout(function(){
          cargarDatosCarreras(false).catch(function(){});
        }, 0);
      });
    }

    window.setTimeout(function(){
      cargarCoordinadores().catch(function(){}).then(function(){
        var seccion = $("ad-seccion-carreras");
        if (seccion && !seccion.hidden) {
          cargarDatosCarreras(false).catch(function(){});
        }
      });
    }, 800);
  }

  document.addEventListener("DOMContentLoaded", conectar);

  window.ADCoordinadoresApp = {
    cargarCoordinadores: cargarCoordinadores,
    cargarCarreras: cargarCarreras,
    cargarDatosCarreras: cargarDatosCarreras,
    renderTablaCarreras: renderTablaCarreras
  };
})(window, document);
