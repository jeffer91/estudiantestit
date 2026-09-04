/* Estado general del Administrador: pendientes reales por coordinador, sin limitar por período ni tipo. */
(function(window, document){
  'use strict';

  var PENDIENTES = [
    'PENDIENTE_REVISION',
    'PENDIENTE_COORDINADOR',
    'PENDIENTE_SYNC',
    'ENVIADO',
    'PENDIENTE'
  ];
  var cargaEnCurso = null;

  function api(){ return window.ADAPIService || null; }
  function $(id){ return document.getElementById(id); }
  function texto(value){ return String(value === null || value === undefined ? '' : value).trim(); }
  function esc(value){
    return texto(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
  function normal(value){
    return texto(value)
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  function estadoNormal(value){ return normal(value).replace(/ /g, '_'); }
  function listaCarreras(value){
    if(Array.isArray(value)) return value.map(texto).filter(Boolean);
    return texto(value).split(/[,;\n|]+/).map(texto).filter(Boolean);
  }
  function activo(value, fallback){
    if(value === true) return true;
    if(value === false) return false;
    var firma = normal(value).replace(/ /g, '_');
    if(['FALSE','0','NO','INACTIVO','INACTIVA'].indexOf(firma) >= 0) return false;
    if(['TRUE','1','SI','SÍ','ACTIVO','ACTIVA','X','OK'].indexOf(firma) >= 0) return true;
    return fallback !== false;
  }
  function tokensCarrera(value){
    var ignorar = {
      UNIVERSITARIA:1, UNIVERSITARIO:1, TECNOLOGIA:1, TECNOLOGO:1,
      SUPERIOR:1, EN:1, DE:1, DEL:1, LA:1, EL:1, Y:1, ONLINE:1, TSU:1
    };
    return normal(value).split(' ').filter(function(token){
      return token.length >= 3 && !ignorar[token];
    });
  }
  function carreraEquivalente(a, b){
    var na = normal(a), nb = normal(b);
    if(!na || !nb) return false;
    if(na === nb || na.indexOf(nb) >= 0 || nb.indexOf(na) >= 0) return true;
    var ta = tokensCarrera(a), tb = tokensCarrera(b);
    if(!ta.length || !tb.length) return false;
    var comunes = ta.filter(function(token){ return tb.indexOf(token) >= 0; });
    var base = Math.min(ta.length, tb.length);
    return comunes.length >= 2 && comunes.length / base >= 0.7;
  }
  function coordinadorNormal(raw, index){
    raw = raw || {};
    var carreras = listaCarreras(raw.carreras || raw.carrerasAsignadas || raw.carrerasNombres);
    var valorActivo = raw.activo !== undefined ? raw.activo : raw.estado;
    return {
      id: texto(raw.id || raw._docId || raw.idRegistro || raw.coordinadorId || raw.nombre || ('coordinador_' + index)),
      nombre: texto(raw.nombre || raw.Nombre || raw.coordinador || raw.id),
      activo: activo(valorActivo, true),
      carreras: carreras
    };
  }
  function carreraEnvio(raw){
    raw = raw || {};
    return texto(raw.carrera || raw.carreraNombre || raw.NombreCarrera || raw.nombreCarrera);
  }
  function codigoCarreraEnvio(raw){
    raw = raw || {};
    return texto(raw.codigoCarrera || raw.carreraCodigo || raw.CodigoCarrera || raw.carreraId);
  }
  function tieneTitulos(raw){
    raw = raw || {};
    return Boolean(
      texto(raw.titulo1 || raw['Título 1']) ||
      texto(raw.titulo2 || raw['Título 2']) ||
      texto(raw.titulo3 || raw['Título 3'])
    );
  }
  function esPendienteCoordinacion(raw){
    raw = raw || {};
    return PENDIENTES.indexOf(estadoNormal(raw.estadoProceso || raw.estado || raw.estadoFinal)) >= 0;
  }
  function perteneceA(raw, coordinador){
    if(!coordinador || !coordinador.carreras.length) return false;
    var valores = [carreraEnvio(raw), codigoCarreraEnvio(raw)].filter(Boolean);
    if(!valores.length) return false;
    return coordinador.carreras.some(function(carrera){
      return valores.some(function(valor){ return carreraEquivalente(valor, carrera); });
    });
  }

  function asegurarInterfaz(){
    var estado = $('ad-seccion-estado');
    if(!estado || $('ad-estado-pendientes-coordinadores')) return;

    var section = document.createElement('section');
    section.id = 'ad-estado-pendientes-coordinadores';
    section.className = 'ad-section';
    section.innerHTML = '' +
      '<div class="ad-section-head">' +
        '<div><p class="ad-eyebrow">Coordinación</p><h3>Pendientes por coordinador</h3></div>' +
      '</div>' +
      '<div class="ad-card">' +
        '<div class="ad-table-wrap">' +
          '<table class="ad-table">' +
            '<thead><tr><th>Coordinador</th><th>Pendientes</th></tr></thead>' +
            '<tbody id="ad-tabla-estado-coordinadores"><tr><td colspan="2" class="ad-empty">Cargando...</td></tr></tbody>' +
          '</table>' +
        '</div>' +
      '</div>';

    estado.appendChild(section);
  }

  function render(rows){
    asegurarInterfaz();
    var body = $('ad-tabla-estado-coordinadores');
    if(!body) return;
    if(!rows.length){
      body.innerHTML = '<tr><td colspan="2" class="ad-empty">No hay coordinadores activos.</td></tr>';
      return;
    }
    body.innerHTML = rows.map(function(item){
      return '<tr>' +
        '<td><strong>' + esc(item.nombre) + '</strong></td>' +
        '<td><strong>' + Number(item.pendientes || 0) + '</strong></td>' +
      '</tr>';
    }).join('');
  }

  function renderError(error){
    asegurarInterfaz();
    var body = $('ad-tabla-estado-coordinadores');
    if(!body) return;
    body.innerHTML = '<tr><td colspan="2" class="ad-empty">No se pudo cargar el resumen de pendientes: ' +
      esc(error && error.message ? error.message : error) + '</td></tr>';
  }

  function cargar(){
    if(cargaEnCurso) return cargaEnCurso;
    asegurarInterfaz();
    var servicio = api();
    if(!servicio){
      renderError(new Error('ADAPIService no está disponible.'));
      return Promise.resolve([]);
    }

    var body = $('ad-tabla-estado-coordinadores');
    if(body) body.innerHTML = '<tr><td colspan="2" class="ad-empty">Cargando...</td></tr>';

    cargaEnCurso = servicio.listarCoordinadores().then(function(result){
      var coordinadores = servicio.extraerCoordinadores(result)
        .map(coordinadorNormal)
        .filter(function(item){ return item.activo && item.nombre; });

      var carreras = [];
      coordinadores.forEach(function(item){
        item.carreras.forEach(function(carrera){
          if(carreras.some(function(actual){ return normal(actual) === normal(carrera); })) return;
          carreras.push(carrera);
        });
      });

      if(!carreras.length){
        var vacios = coordinadores.map(function(item){
          return { id:item.id, nombre:item.nombre, pendientes:0 };
        });
        render(vacios);
        return vacios;
      }

      /* El backend interpreta PENDIENTE_REVISION como toda la cola pendiente de
         Coordinación y consulta esos estados por índice. Así evitamos leer todos
         los títulos históricos únicamente para construir este resumen. */
      return servicio.listarTitulos({
        carreras: carreras,
        carrera: '',
        estado: 'PENDIENTE_REVISION',
        periodo: '',
        periodoId: '',
        tipoTrabajo: ''
      }).then(function(titlesResult){
        var envios = servicio.extraerTitulos(titlesResult).filter(function(item){
          return tieneTitulos(item) && esPendienteCoordinacion(item);
        });

        var resumen = coordinadores.map(function(item){
          return {
            id: item.id,
            nombre: item.nombre,
            pendientes: envios.filter(function(envio){ return perteneceA(envio, item); }).length
          };
        }).sort(function(a, b){
          return b.pendientes - a.pendientes || a.nombre.localeCompare(b.nombre, 'es');
        });

        render(resumen);
        return resumen;
      });
    }).catch(function(error){
      renderError(error);
      return [];
    }).finally(function(){
      cargaEnCurso = null;
    });

    return cargaEnCurso;
  }

  function enlazar(){
    document.addEventListener('click', function(event){
      var target = event.target && event.target.closest ? event.target.closest('[data-action],[data-ad-view-target]') : null;
      if(!target) return;
      var action = target.getAttribute('data-action');
      var view = target.getAttribute('data-ad-view-target');
      if(action === 'refrescar' || view === 'ad-seccion-estado'){
        window.setTimeout(cargar, 0);
      }
    });
  }

  function init(){
    asegurarInterfaz();
    enlazar();
    cargar();
  }

  window.ADCoordinadoresPendientesEstado = Object.freeze({
    cargar: cargar,
    carreraEquivalente: carreraEquivalente,
    esPendienteCoordinacion: esPendienteCoordinacion
  });

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window, document);
