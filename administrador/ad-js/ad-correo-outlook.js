/* Recordatorios formales por Outlook para estudiantes que no han enviado títulos. */
(function(window,document){
  'use strict';

  function texto(value){return String(value===null||value===undefined?'':value).trim();}
  function esc(value){return texto(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');}
  function cedula(value){var digits=texto(value).replace(/\D/g,'');return digits.length===9?'0'+digits:digits;}
  function correoValido(value){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto(value));}

  function estadisticas(){return window.ADAdminStatisticsLast||{};}
  function estudiantePorCedula(value){
    var target=cedula(value);
    return (estadisticas().faltantes||[]).find(function(item){return cedula(item.cedula)===target;})||null;
  }

  function correosDe(student){
    var list=[texto(student&&student.correoInstitucional).toLowerCase(),texto(student&&student.correoPersonal).toLowerCase()]
      .filter(correoValido);
    return list.filter(function(item,index){return list.indexOf(item)===index;});
  }

  function periodoActual(){
    var data=estadisticas();
    var select=document.getElementById('ad-estadisticas-periodo');
    if(select&&select.selectedIndex>=0){
      var label=texto(select.options[select.selectedIndex]&&select.options[select.selectedIndex].textContent);
      if(label)return label;
    }
    return texto(data.periodo)||'el período académico vigente';
  }

  function mensajeFormal(student,periodo){
    return [
      'Estimado/a '+(texto(student.nombres)||'estudiante')+':',
      '',
      'Reciba un cordial saludo.',
      '',
      'Por medio del presente, le recordamos que aún no registra sus tres propuestas de titulación correspondientes al período '+periodo+'. Agradecemos ingresar a la plataforma de titulación y completar el envío a la brevedad posible.',
      '',
      'Enlace de acceso:',
      'https://titulos.pages.dev/estudiantes/estudiante',
      '',
      'En caso de haber realizado el registro recientemente, por favor omita este mensaje.',
      '',
      'Atentamente,',
      'Coordinación de Titulación',
      'ITSQMET'
    ].join('\n');
  }

  function abrirOutlook(student){
    var emails=correosDe(student);
    if(!emails.length){
      window.alert('El estudiante no tiene un correo institucional ni personal válido registrado en UTET.');
      return;
    }
    var period=periodoActual();
    var subject='Recordatorio de registro de propuestas de titulación – '+period;
    var body=mensajeFormal(student,period);
    var params=new URLSearchParams({to:emails.join(','),subject:subject,body:body});
    window.open('https://outlook.office.com/mail/deeplink/compose?'+params.toString(),'_blank','noopener,noreferrer');
  }

  function cabecera(){
    var tbody=document.getElementById('ad-tabla-faltantes');
    var row=tbody&&tbody.closest('table')&&tbody.closest('table').querySelector('thead tr');
    if(!row)return;
    row.innerHTML='<th>Cédula</th><th>Estudiante</th><th>Carrera</th><th>Celular</th><th>Correos</th><th>Avisos</th>';
  }

  function contenidoCorreos(student){
    var institutional=texto(student&&student.correoInstitucional);
    var personal=texto(student&&student.correoPersonal);
    if(!institutional&&!personal)return '<span class="ad-muted">Sin correo</span>';
    var output=[];
    if(institutional)output.push('<small><strong>Institucional:</strong><br>'+esc(institutional)+'</small>');
    if(personal)output.push('<small><strong>Personal:</strong><br>'+esc(personal)+'</small>');
    return output.join('<br>');
  }

  function decorarFilas(){
    cabecera();
    var tbody=document.getElementById('ad-tabla-faltantes');
    if(!tbody)return;
    Array.prototype.forEach.call(tbody.querySelectorAll('tr'),function(row){
      var cells=row.querySelectorAll('td');
      if(cells.length===1){cells[0].setAttribute('colspan','6');return;}
      if(cells.length<5)return;
      var id=cedula(cells[0].textContent);
      var student=estudiantePorCedula(id);
      if(!student)return;

      var mailCell=row.querySelector('[data-ad-correos]');
      if(!mailCell){
        mailCell=document.createElement('td');
        mailCell.setAttribute('data-ad-correos','true');
        row.insertBefore(mailCell,cells[cells.length-1]);
      }
      mailCell.innerHTML=contenidoCorreos(student);

      var actions=row.lastElementChild;
      actions.classList.add('ad-icon-actions');
      var button=actions.querySelector('[data-action="correo-faltante"]');
      if(!button){
        button=document.createElement('button');
        button.type='button';
        button.className='ad-icon-btn ad-icon-btn--email';
        button.setAttribute('data-action','correo-faltante');
        button.setAttribute('data-cedula',student.cedula);
        button.setAttribute('title','Preparar correo formal en Outlook');
        button.setAttribute('aria-label','Preparar correo formal en Outlook');
        button.textContent='✉️';
        actions.appendChild(button);
      }
      button.disabled=correosDe(student).length===0;
    });
  }

  function estilos(){
    if(document.getElementById('ad-correo-outlook-estilos'))return;
    var style=document.createElement('style');
    style.id='ad-correo-outlook-estilos';
    style.textContent=''+
      '.ad-icon-btn--email{background:#eef2ff;color:#243b8f;border-color:rgba(36,59,143,.2)}'+
      '#ad-tabla-faltantes td[data-ad-correos]{min-width:220px;line-height:1.35}'+
      '#ad-tabla-faltantes td.ad-icon-actions{display:flex;gap:7px;align-items:center}';
    document.head.appendChild(style);
  }

  function iniciar(){
    estilos();
    var tbody=document.getElementById('ad-tabla-faltantes');
    if(tbody){
      new MutationObserver(decorarFilas).observe(tbody,{childList:true,subtree:true});
      decorarFilas();
    }
    document.addEventListener('click',function(event){
      var button=event.target&&event.target.closest?event.target.closest('[data-action="correo-faltante"]'):null;
      if(!button)return;
      event.preventDefault();
      event.stopPropagation();
      var student=estudiantePorCedula(button.getAttribute('data-cedula'));
      if(student)abrirOutlook(student);
    },true);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})(window,document);
