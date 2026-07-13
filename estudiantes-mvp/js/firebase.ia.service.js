/*
  Archivo: firebase.ia.service.js
  Ruta: estudiantes-mvp/js/firebase.ia.service.js
  Funciones principales:
  - Leer proveedores IA desde Firebase, colección IA.
  - Normalizar proveedores como gemini, groq y cloudflare.
  - Ordenar proveedores según configuración del MVP.
  - Guardar o actualizar proveedores IA desde config.html.
  - Entregar proveedores activos al servicio de IA de Titulación.
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

  function guardarProveedor(proveedor) {
    var config = obtenerConfig();
    var firebase = obtenerFirebase();
    var utils = obtenerUtils();
    var coleccion;
    var normalizado;
    var id;
    var data;

    if (!config || !firebase || !utils) {
      return Promise.reject(new Error('Faltan módulos base para guardar proveedor IA.'));
    }

    normalizado = normalizarProveedor(proveedor || {});
    id = normalizado.id || normalizado.proveedor;

    if (!id) {
      return Promise.reject(new Error('No se pudo identificar el proveedor IA.'));
    }

    coleccion = config.obtenerColeccion('ia') || 'IA';

    data = {
      id: id,
      proveedor: id,
      nombre: normalizado.nombre,
      activo: normalizado.activo,
      endpoint: normalizado.endpoint,
      apiKey: normalizado.apiKey,
      key: normalizado.key,
      model: normalizado.model,
      modelo: normalizado.modelo,
      origen: normalizado.origen || 'config-mvp',
      actualizadoEnLocal: utils.fechaIso(),
      actualizadoEn: firebase.serverTimestamp()
    };

    return firebase.guardarDocumento(coleccion, id, data, { merge: true })
      .then(function (resultado) {
        resultado.proveedor = normalizado;
        return resultado;
      });
  }

  function desactivarProveedor(providerId) {
    var config = obtenerConfig();
    var firebase = obtenerFirebase();
    var utils = obtenerUtils();
    var coleccion;
    var id;

    if (!config || !firebase || !utils) {
      return Promise.reject(new Error('Faltan módulos base para desactivar proveedor IA.'));
    }

    id = utils.normalizarClave(providerId);

    if (!id) {
      return Promise.reject(new Error('No se recibió el ID del proveedor IA.'));
    }

    coleccion = config.obtenerColeccion('ia') || 'IA';

    return firebase.guardarDocumento(coleccion, id, {
      activo: false,
      actualizadoEnLocal: utils.fechaIso(),
      actualizadoEn: firebase.serverTimestamp()
    }, { merge: true });
  }

  function normalizarListaProveedores(lista) {
    var config = obtenerConfig();
    var orden = config && config.data && config.data.ia
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
        var ia = orden.indexOf(a.id);
        var ib = orden.indexOf(b.id);

        if (ia === -1) ia = 999;
        if (ib === -1) ib = 999;

        if (ia !== ib) {
          return ia - ib;
        }

        return String(a.nombre || a.id).localeCompare(String(b.nombre || b.id));
      });
  }

  function normalizarProveedor(data, idForzado) {
    var utils = obtenerUtils();
    var id;
    var activo;
    var endpoint;
    var apiKey;
    var key;
    var model;
    var modelo;
    var nombre;
    var proveedor;

    if (!utils) {
      throw new Error('No está disponible EstudianteMVPUtils.');
    }

    data = data || {};

    proveedor = utils.normalizarClave(
      idForzado ||
      data.proveedor ||
      data.id ||
      data.provider ||
      data.nombre ||
      ''
    );

    id = proveedor;

    activo = normalizarBooleano(
      data.activo !== undefined ? data.activo : data.active
    );

    endpoint = utils.limpiarTexto(data.endpoint || data.url || data.baseUrl || '');
    apiKey = utils.limpiarTexto(data.apiKey || data.apikey || data.api_key || '');
    key = utils.limpiarTexto(data.key || data.token || apiKey || '');
    model = utils.limpiarTexto(data.model || data.modelo || data.modelName || '');
    modelo = utils.limpiarTexto(data.modelo || data.model || data.modelName || '');
    nombre = utils.limpiarTexto(data.nombre || data.name || proveedor);

    return {
      id: id,
      proveedor: proveedor,
      nombre: nombre,
      activo: activo,
      endpoint: endpoint,
      apiKey: apiKey,
      key: key,
      model: model,
      modelo: modelo,
      origen: utils.limpiarTexto(data.origen || data.source || ''),
      actualizadoEn: data.actualizadoEn || data.updatedAt || null,
      raw: data
    };
  }

  function normalizarBooleano(valor) {
    if (valor === true) return true;
    if (valor === false) return false;

    if (typeof valor === 'number') {
      return valor === 1;
    }

    valor = String(valor == null ? '' : valor).toLowerCase().trim();

    if (valor === 'true' || valor === 'activo' || valor === '1' || valor === 'si' || valor === 'sí') {
      return true;
    }

    return false;
  }

  function obtenerProveedorPreferido(proveedores) {
    var config = obtenerConfig();
    var principal = config && config.data && config.data.ia
      ? config.data.ia.proveedorPrincipal
      : 'gemini';

    proveedores = Array.isArray(proveedores) ? proveedores : [];

    return proveedores.find(function (proveedor) {
      return proveedor.id === principal && proveedor.activo;
    }) || proveedores.find(function (proveedor) {
      return proveedor.activo;
    }) || null;
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
              activo: proveedor.activo,
              endpoint: proveedor.endpoint,
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
    guardarProveedor: guardarProveedor,
    desactivarProveedor: desactivarProveedor,
    normalizarProveedor: normalizarProveedor,
    obtenerProveedorPreferido: obtenerProveedorPreferido,
    probarLectura: probarLectura
  });
})(window);
