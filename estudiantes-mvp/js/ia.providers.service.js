/* Cliente seguro de IA de Titulación. El navegador no conoce marcas, modelos ni credenciales. */
(function(window,document){
  'use strict';

  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function numero(v,f){var n=Number(typeof v==='string'?v.replace(',','.'):v);return Number.isFinite(n)?n:Number(f||0);}
  function esLocal(){var h=texto(window.location&&window.location.hostname).toLowerCase();return ['localhost','127.0.0.1','0.0.0.0','::1','[::1]'].indexOf(h)>=0;}
  function esArchivo(){return texto(window.location&&window.location.protocol).toLowerCase()==='file:';}
  function proxyUrl(){
    var forzada=texto(window.ESTUDIANTE_IA_PROXY_URL||'');
    var origen;
    if(forzada)return forzada;
    if(esLocal())return 'http://127.0.0.1:8788/api/ia';
    if(esArchivo())return 'https://titulos.pages.dev/api/ia';
    origen=texto(window.location&&window.location.origin);
    return (origen&&origen!=='null'?origen.replace(/\/$/,''):'https://titulos.pages.dev')+'/api/ia';
  }

  function normalizarMotor(motor){
    motor=motor||{};
    var id=texto(motor.id||motor.motor||motor.proveedor||'motor_1').toLowerCase().replace(/[^a-z0-9_-]/g,'');
    return{
      id:id||'motor_1',
      proveedor:id||'motor_1',
      nombre:'Motor interno',
      tipo:'interno',
      activo:motor.activo!==false,
      prioridad:numero(motor.prioridad,1),
      timeoutMs:Math.max(5000,numero(motor.timeoutMs,45000)),
      maxTokens:Math.max(100,numero(motor.maxTokens,3000)),
      temperatura:numero(motor.temperatura,0.3),
      modelo:'',
      model:''
    };
  }

  function mensajeErrorPublico(json,status){
    return texto(json&&(json.mensaje||json.error||json.message))||
      ('No fue posible completar la solicitud de IA. Código HTTP '+status+'.');
  }

  function generarTexto(motor,prompt,opciones){
    var p=normalizarMotor(motor);
    opciones=opciones||{};

    if(!texto(prompt)){
      return Promise.reject(new Error('No se recibió información para generar las sugerencias.'));
    }

    return fetch(proxyUrl(),{
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'X-Titulos-App':'estudiantes'
      },
      body:JSON.stringify({
        motorId:p.id,
        prompt:prompt,
        options:{
          timeoutMs:numero(opciones.timeoutMs||p.timeoutMs,45000),
          temperatura:opciones.temperatura!==undefined
            ?numero(opciones.temperatura,p.temperatura)
            :p.temperatura,
          maxTokens:numero(opciones.maxTokens||p.maxTokens,3000)
        }
      })
    }).then(function(resp){
      return resp.text().then(function(body){
        var json={};
        try{json=body?JSON.parse(body):{};}
        catch(error){throw new Error('El servicio de IA respondió en un formato no válido.');}
        if(!resp.ok||json.ok===false){
          throw new Error(mensajeErrorPublico(json,resp.status));
        }
        if(!texto(json.text)){
          throw new Error('El servicio de IA respondió sin contenido utilizable.');
        }
        return json.text;
      });
    });
  }

  function descripcionEstado(estado){
    var mapa={
      probando:'Consultando la IA de Titulación',
      respuesta:'Respuesta recibida; validando títulos',
      correcto:'Opciones finales preparadas',
      error:'No se pudo completar este intento'
    };
    return mapa[estado]||'Procesando la solicitud';
  }

  function limpiarPunto(punto){
    var descripcion;
    if(!punto||!punto.matches||!punto.matches('.ia-diagnostico__punto'))return;
    descripcion=descripcionEstado(punto.getAttribute('data-estado')||'');
    if(punto.getAttribute('title')!==descripcion)punto.setAttribute('title',descripcion);
    if(punto.getAttribute('aria-label')!==descripcion)punto.setAttribute('aria-label',descripcion);
  }

  function limpiarMensaje(elemento){
    var limpio;
    if(!elemento||!elemento.matches||!elemento.matches('[data-ia-detalle],[data-ia-etapa-visible]'))return;
    limpio=texto(elemento.textContent)
      .replace(/Proveedor actual\s*:[^.]+\.?/ig,'')
      .replace(/Otra IA/ig,'Una revisión interna')
      .replace(/Una segunda IA/ig,'Una revisión interna')
      .replace(/otro par de proveedores/ig,'otro proceso interno')
      .replace(/No fue posible conectar con los proveedores/ig,'No fue posible completar la generación')
      .replace(/No se obtuvieron tres opciones válidas/ig,'Las opciones necesitan una nueva revisión');
    if(limpio&&limpio!==elemento.textContent)elemento.textContent=limpio;
  }

  function limpiarInterfazPublica(raiz){
    raiz=raiz&&raiz.nodeType===1?raiz:document;

    limpiarPunto(raiz);
    limpiarMensaje(raiz);

    Array.prototype.forEach.call(
      raiz.querySelectorAll?raiz.querySelectorAll('.ia-diagnostico__punto'):[],
      limpiarPunto
    );

    Array.prototype.forEach.call(
      raiz.querySelectorAll?raiz.querySelectorAll('[data-ia-detalle],[data-ia-etapa-visible]'):[],
      limpiarMensaje
    );
  }

  function instalarPrivacidadUI(){
    if(!document.body)return;
    limpiarInterfazPublica(document);
    new MutationObserver(function(cambios){
      cambios.forEach(function(cambio){
        if(cambio.target&&cambio.target.nodeType===1)limpiarInterfazPublica(cambio.target);
        Array.prototype.forEach.call(cambio.addedNodes||[],function(nodo){
          if(nodo&&nodo.nodeType===1)limpiarInterfazPublica(nodo);
        });
      });
    }).observe(document.body,{
      childList:true,
      subtree:true,
      attributes:true,
      attributeFilter:['data-estado','title','aria-label']
    });
  }

  function cargar(src){
    if(document.readyState==='loading'){
      document.write('<script src="'+src+'"><\/script>');
      return;
    }
    var script=document.createElement('script');
    script.src=src;
    script.async=false;
    document.head.appendChild(script);
  }

  function asegurarBase(){
    if(window.EstudianteMVPIATitulacion)return;
    function desactivado(){
      return Promise.reject(new Error('Utiliza la generación de sugerencias por propuesta.'));
    }
    window.EstudianteMVPIATitulacion=Object.freeze({
      generarTitulosPorPropuesta:desactivado,
      generarTresTitulos:desactivado,
      modo:'esperando_motor_por_propuesta',
      version:'6.0.4'
    });
  }

  asegurarBase();
  cargar('js/ia.diagnostico.service.js?v=4.0.0');
  cargar('js/ia.nueve.core.js?v=2.0.0');
  cargar('js/ia.nueve.sanitizador.js?v=1.0.0');
  cargar('js/ia.nueve.ajustes.js?v=1.1.0');
  cargar('js/ia.titulacion.robusto.service.js?v=5.1.0');
  cargar('js/ia.recomendacion.ui.js?v=4.0.0');
  cargar('js/ia.recomendacion.variable.patch.js?v=1.0.0');
  cargar('js/ia.nueve.integracion.js?v=3.1.0');
  cargar('js/estudiante.arquitectura.v2.js?v=2.1.0');
  cargar('js/estudiante.envio.modal.js?v=1.0.1');

  window.EstudianteMVPIAProviders=Object.freeze({
    generarTexto:generarTexto,
    normalizarProveedorRuntime:normalizarMotor,
    proxyUrl:proxyUrl
  });

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',instalarPrivacidadUI,{once:true});
  }else{
    instalarPrivacidadUI();
  }
})(window,document);
