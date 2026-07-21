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
    return texto(json&&(
      json.mensaje||json.error||json.message
    ))||('No fue posible completar la solicitud de IA. Código HTTP '+status+'.');
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
      version:'6.0.0'
    });
  }

  asegurarBase();
  cargar('js/ia.diagnostico.service.js?v=4.0.0');
  cargar('js/ia.nueve.core.js?v=2.0.0');
  cargar('js/ia.nueve.ajustes.js?v=1.1.0');
  cargar('js/ia.titulacion.robusto.service.js?v=5.0.0');
  cargar('js/ia.recomendacion.ui.js?v=4.0.0');
  cargar('js/ia.nueve.integracion.js?v=3.0.0');
  cargar('js/estudiante.arquitectura.v2.js?v=2.1.0');
  cargar('js/estudiante.envio.modal.js?v=1.0.1');

  window.EstudianteMVPIAProviders=Object.freeze({
    generarTexto:generarTexto,
    normalizarProveedorRuntime:normalizarMotor,
    proxyUrl:proxyUrl
  });
})(window,document);
