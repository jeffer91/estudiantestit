/* Devoluciones administrativas: solo Google Sheets. */
(function(window,document){
  'use strict';
  function texto(v){return String(v===null||v===undefined?'':v).trim();}
  function cedula(v){return texto(v).replace(/\D/g,'');}
  function elemento(id){return document.getElementById(id);}
  function valor(id){var e=elemento(id);return e?texto(e.value):'';}
  function mostrar(id,mensaje){var e=elemento(id);if(e)e.textContent=mensaje;}
  function cargar(id,ruta){return new Promise(function(resolve,reject){var s=document.getElementById(id);if(s){resolve(s);return;}s=document.createElement('script');s.id=id;s.src=ruta;s.async=false;s.onload=function(){resolve(s);};s.onerror=function(){reject(new Error('No se pudo cargar '+ruta));};document.body.appendChild(s);});}
  function asegurarSheets(){if(window.ADSheetsService)return Promise.resolve(window.ADSheetsService);return cargar('ad-sheets-service-script','./ad-js/ad-sheets.service.js?v=2.0.0').then(function(){if(!window.ADSheetsService)throw new Error('Google Sheets no está disponible.');return window.ADSheetsService;});}
  function devolverTitulo(cedulaValor,motivoValor){var id=cedula(cedulaValor);var motivo=texto(motivoValor)||'Reinicio de intento desde administración';if(!id)return Promise.reject(new Error('Ingresa la cédula.'));return asegurarSheets().then(function(sheets){return sheets.enviarPost('ADMIN_DEVOLVER_TITULOS',{cedula:id,numeroIdentificacion:id,motivo:motivo,observacion:motivo,administrador:'administrador',origen:'administrador'});}).then(function(resultado){return{ok:true,cedula:id,resultado:resultado};});}
  function ejecutar(evento){if(evento){evento.preventDefault();evento.stopPropagation();if(evento.stopImmediatePropagation)evento.stopImmediatePropagation();}mostrar('ad-resultado-devolver','Procesando devolución...');return devolverTitulo(valor('ad-devolver-cedula'),valor('ad-devolver-motivo')).then(function(r){mostrar('ad-resultado-devolver','Título devuelto correctamente.\nCédula: '+r.cedula);mostrar('ad-panel-diagnostico','Devolución registrada en Google Sheets.');}).catch(function(error){mostrar('ad-resultado-devolver','Error al devolver título:\n'+(error.message||String(error)));mostrar('ad-panel-diagnostico','No se realizó ningún cambio.');});}
  function conectar(){var boton=elemento('ad-btn-devolver-titulo');if(boton)boton.addEventListener('click',ejecutar,true);}
  document.addEventListener('DOMContentLoaded',conectar);
  cargar('ad-fuente-principal-script','./ad-js/ad-fuente-principal.patch.js?v=2.0.0').catch(function(){});
  window.ADDevolverApp={devolverTitulo:devolverTitulo,ejecutar:ejecutar};
})(window,document);
