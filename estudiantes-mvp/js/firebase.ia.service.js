/*
  Archivo: firebase.ia.service.js
  Ruta: estudiantes-mvp/js/firebase.ia.service.js
  Funciones principales:
  - Leer proveedores IA configurados desde el administrador.
  - Normalizar proveedores por tipo, prioridad, modelo y endpoint.
  - Ordenar dinámicamente cualquier cantidad de proveedores.
  - Entregar únicamente proveedores activos al motor de titulación.
  - Mantener la pantalla de estudiantes en modo solo lectura.
*/
(function (window) {
  'use strict';

  function obtenerConfig() {
    return window.EstudianteMVPConfig || null;
  }

  function obtenerUtils() {
    return window.EstudianteMVPUtils || null;
  }

  function obtenerFirebase() {
    return window.EstudianteMVPFirebaseCore || null;
  }

  function listarProveedores() {
    var config = obtenerConfig();
    var firebase = obtenerFirebase();
    var coleccion;

    if (!config || !firebase) {
      return Promise.reject(new Error('Faltan módulos base para leer proveedores IA.'));
    }

    coleccion = config.obtenerColeccion('ia') || 'IA';

    return firebase.consultarTodos(coleccion, 50)
      .then(function (docs) {
        return normalizarListaProveedores(docs || []);
      });
  }

  function listarProveedoresActivos() {
    return listarProveedores()
      .then(function (proveedores) {
        return proveedores.filter(function (proveedor) {
          return proveedor.activo === true;
        });
      });
  }

  function leerProveedor(providerId) {
    var config = obtenerConfig();
    var firebase = obtenerFirebase();
    var utils = obtenerUtils();
    var coleccion;
    var id;

    if (!config || !firebase || !utils) {
      return Promise.reject(new Error('Faltan módulos base para leer proveedor IA.'));
    }

    id = utils.normalizarClave(providerId);

    if (!id) {
      return Promise.reject(new Error('No se recibió el ID del proveedor IA.'));
    }

    coleccion = config.obtenerColeccion('ia') || 'IA';

    return firebase.leerDocumento(coleccion, id)
      .then(function (data) {
        if (!data) {
          return null;
        }

        return normalizarProveedor(data, id);
      });
  }

  function normalizarListaProveedores(lista) {
    var config = obtenerConfig();
    var ordenFallback = config && config.data && config.data.ia
      ? config.data.ia.proveedoresOrden || []
      : [];

    return (lista || [])
      .map(function (item) {
        return normalizarProveedor(item || {});
      })
      .filter(function (item) {
        return !!item.id;
      })
      .sort(function (a, b) {
        var prioridadA = Number(a.prioridad || 999);
        var prioridadB = Number(b.prioridad || 999);
        var ordenA;
        var ordenB;

        if (prioridadA !== prioridadB) {
          return prioridadA - prioridadB;
        }

        ordenA = ordenFallback.indexOf(a.id);
        ordenB = ordenFallback.indexOf(b.id);

        if (ordenA === -1) ordenA = 999;
        if (ordenB === -1) ordenB = 999;

        if (ordenA !== ordenB) {
          return ordenA - ordenB;
        }

        return String(a.nombre || a.id).localeCompare(String(b.nombre || b.id), 'es');
      });
  }

  function normalizarProveedor(data, idForzado) {
    var utils = obtenerUtils();
    var proveedor;
    var id;
    var tipo;
    var activo;
    var endpoint;
    var apiKey;
    var key;
    var model;
    var modelo;
    var nombre;
    var prioridad;
    var timeoutMs;
    var maxTokens;
    var temperatura;

    if (!utils) {
      throw new Error('No está disponible EstudianteMVPUtils.');
    }

    data = data || {};

    proveedor = utils.normalizarClave(
      idForzado ||
      data.proveedor ||
      data.id ||
      data.provider ||
      data._id ||
      data.nombre ||
      ''
    );

    id = proveedor;
    tipo = utils.normalizarClave(
      data.tipo ||
      data.protocol ||
      data.protocolo ||
      inferirTipo(id)
    ).replace(/_/g, '-');

    activo = normalizarBooleano(
      data.activo !== undefined ? data.activo : data.active
    );

    endpoint = utils.limpiarTexto(data.endpoint || data.url || data.baseUrl || '');
    apiKey = utils.limpiarTexto(data.apiKey || data.apikey || data.api_key || '');
    key = utils.limpiarTexto(data.key || data.token || apiKey || '');
    model = utils.limpiarTexto(data.model || data.modelo || data.modelName || '');
    modelo = utils.limpiarTexto(data.modelo || data.model || data.modelName || '');
    nombre = utils.limpiarTexto(data.nombre || data.name || proveedor);
    prioridad = numeroSeguro(
      data.prioridad !== undefined ? data.prioridad : data.priority,
      prioridadFallback(id)
    );
    timeoutMs = Math.max(5000, numeroSeguro(data.timeoutMs || data.timeout, 45000));
    maxTokens = Math.max(100, numeroSeguro(data.maxTokens || data.max_tokens, 900));
    temperatura = numeroSeguro(
      data.temperatura !== undefined ? data.temperatura : data.temperature,
      0.4
    );

    return {
      id: id,
      proveedor: proveedor,
      nombre: nombre,
      tipo: tipo,
      activo: activo,
      prioridad: prioridad,
      endpoint: endpoint,
      apiKey: apiKey,
      key: key,
      model: model,
      modelo: modelo,
      timeoutMs: timeoutMs,
      maxTokens: maxTokens,
      temperatura: temperatura,
      descripcion: utils.limpiarTexto(data.descripcion || data.description || ''),
      ultimaPruebaOk: data.ultimaPruebaOk === true,
      ultimaPruebaEn: data.ultimaPruebaEn || null,
      ultimaLatenciaMs: numeroSeguro(data.ultimaLatenciaMs, 0),
      ultimoError: utils.limpiarTexto(data.ultimoError || ''),
      origen: utils.limpiarTexto(data.origen || data.source || ''),
      actualizadoEn: data.actualizadoEn || data.updatedAt || null,
      raw: data
    };
  }

  function prioridadFallback(id) {
    var mapa = {
      gemini: 1,
      groq: 2,
      cerebras: 3,
      cloudflare: 4,
      nvidia: 5,
      github_models: 6,
      openrouter: 7,
      openrouter_qwen: 8,
      openrouter_deepseek: 9,
      huggingface: 10
    };

    return mapa[String(id || '').toLowerCase()] || 999;
  }

  function inferirTipo(id) {
    id = String(id || '').toLowerCase();

    if (id === 'gemini') {
      return 'gemini';
    }

    if (id === 'cloudflare') {
      return 'cloudflare';
    }

    if (
      id === 'groq' ||
      id === 'openrouter' ||
      id === 'openrouter_qwen' ||
      id === 'openrouter_deepseek' ||
      id === 'cerebras' ||
      id === 'nvidia' ||
      id === 'github_models' ||
      id === 'huggingface'
    ) {
      return 'openai-compatible';
    }

    return 'generic';
  }

  function normalizarBooleano(valor) {
    if (valor === true) return true;
    if (valor === false) return false;

    if (typeof valor === 'number') {
      return valor === 1;
    }

    valor = String(valor == null ? '' : valor).toLowerCase().trim();

    return (
      valor === 'true' ||
      valor === 'activo' ||
      valor === '1' ||
      valor === 'si' ||
      valor === 'sí'
    );
  }

  function numeroSeguro(valor, fallback) {
    var numero = Number(valor);

    return Number.isFinite(numero)
      ? numero
      : Number(fallback || 0);
  }

  function obtenerProveedorPreferido(proveedores) {
    proveedores = Array.isArray(proveedores) ? proveedores : [];

    return proveedores
      .filter(function (proveedor) {
        return proveedor.activo;
      })
      .sort(function (a, b) {
        return Number(a.prioridad || 999) - Number(b.prioridad || 999);
      })[0] || null;
  }

  function probarLectura() {
    return listarProveedoresActivos()
      .then(function (proveedores) {
        return {
          ok: true,
          totalActivos: proveedores.length,
          proveedores: proveedores.map(function (proveedor) {
            return {
              id: proveedor.id,
              nombre: proveedor.nombre,
              tipo: proveedor.tipo,
              activo: proveedor.activo,
              prioridad: proveedor.prioridad,
              endpointConfigurado: !!proveedor.endpoint,
              modelo: proveedor.modelo || proveedor.model
            };
          }),
          mensaje: proveedores.length
            ? 'Proveedores IA activos encontrados.'
            : 'No hay proveedores IA activos en Firebase.'
        };
      });
  }

  window.EstudianteMVPFirebaseIA = Object.freeze({
    listarProveedores: listarProveedores,
    listarProveedoresActivos: listarProveedoresActivos,
    leerProveedor: leerProveedor,
    normalizarProveedor: normalizarProveedor,
    obtenerProveedorPreferido: obtenerProveedorPreferido,
    probarLectura: probarLectura
  });
})(window);
