(function(window,document){
  'use strict';

  var path=String(window.location&&window.location.pathname||'').toLowerCase();
  var required=path.indexOf('/administrador/')>=0?'admin':(path.indexOf('/coordinadores/')>=0?'coordinator':'');
  if(!required)return;

  var apiBase=String(window.TITULOS_API_BASE||'').replace(/\/$/,'');
  var nativeFetch=window.fetch.bind(window);
  var gateResolve;
  var gate=new Promise(function(resolve){gateResolve=resolve;});
  var currentUser=null;
  var currentRole='';
  var ready=false;

  function text(value){return String(value===null||value===undefined?'':value).trim();}
  function allowed(role){return required==='admin'?role==='admin':(role==='coordinator'||role==='admin');}
  function apiUrl(input){
    try{
      var raw=typeof input==='string'?input:(input&&input.url)||'';
      var url=new URL(raw,window.location.href);
      return Boolean(apiBase)&&url.href.indexOf(apiBase+'/api/')===0;
    }catch(_error){return false;}
  }

  window.fetch=function(input,init){
    if(!apiUrl(input))return nativeFetch(input,init);
    return gate.then(function(){
      init=Object.assign({},init||{});
      var headers=new Headers(init.headers||(input instanceof Request?input.headers:undefined)||{});
      if(!currentUser)return nativeFetch(input,Object.assign({},init,{headers:headers}));
      return currentUser.getIdToken().then(function(token){
        headers.set('Authorization','Bearer '+token);
        return nativeFetch(input,Object.assign({},init,{headers:headers}));
      });
    });
  };

  function style(){
    if(document.getElementById('titulos-auth-style'))return;
    var el=document.createElement('style');
    el.id='titulos-auth-style';
    el.textContent=''+
      '#titulos-auth{position:fixed;inset:0;z-index:50000;background:#f4f7fb;display:grid;place-items:center;padding:20px;font-family:system-ui,-apple-system,Segoe UI,sans-serif}'+
      '#titulos-auth[hidden]{display:none}#titulos-auth .card{width:min(430px,94vw);background:#fff;border:1px solid #dbe5f1;border-radius:18px;box-shadow:0 24px 70px rgba(20,46,80,.16);padding:28px}'+
      '#titulos-auth h2{margin:0 0 6px;color:#17395f}#titulos-auth p{color:#60758f;line-height:1.45}#titulos-auth label{display:grid;gap:6px;margin:14px 0;font-weight:700;color:#28486b}'+
      '#titulos-auth input{font:inherit;padding:11px 12px;border:1px solid #cbd9e9;border-radius:10px}#titulos-auth button{width:100%;border:0;border-radius:10px;padding:12px 14px;background:#174a7c;color:#fff;font:700 15px system-ui;cursor:pointer}'+
      '#titulos-auth .msg{min-height:20px;margin-top:12px;color:#a52d24;font-weight:600}#titulos-auth-logout{position:fixed;right:18px;bottom:18px;z-index:49000;border:1px solid #cbd9e9;border-radius:10px;background:#fff;color:#28486b;padding:9px 12px;font:700 13px system-ui;cursor:pointer;box-shadow:0 8px 24px rgba(20,46,80,.12)}';
    document.head.appendChild(el);
  }

  function ensureUi(){
    style();
    var root=document.getElementById('titulos-auth');
    if(root)return root;
    root=document.createElement('section');
    root.id='titulos-auth';
    root.innerHTML='<div class="card"><h2>Acceso protegido</h2><p>'+(required==='admin'?'Administrador de Titulación':'Coordinación de Titulación')+'</p><form id="titulos-auth-form"><label>Correo<input id="titulos-auth-email" type="email" autocomplete="username" required></label><label>Contraseña<input id="titulos-auth-password" type="password" autocomplete="current-password" required></label><button type="submit">Ingresar</button><div class="msg" id="titulos-auth-msg"></div></form></div>';
    document.body.appendChild(root);
    root.querySelector('form').addEventListener('submit',function(event){
      event.preventDefault();
      var email=text(document.getElementById('titulos-auth-email').value);
      var password=document.getElementById('titulos-auth-password').value;
      setMessage('Verificando acceso...');
      window.firebase.auth().signInWithEmailAndPassword(email,password).catch(function(error){
        setMessage(error&&error.message?error.message:'No se pudo iniciar sesión.');
      });
    });
    return root;
  }

  function setMessage(message){
    var el=document.getElementById('titulos-auth-msg');
    if(el)el.textContent=message||'';
  }

  function showLogin(message){
    var root=ensureUi();
    root.hidden=false;
    if(message)setMessage(message);
  }

  function hideLogin(){
    var root=ensureUi();
    root.hidden=true;
    if(!document.getElementById('titulos-auth-logout')){
      var button=document.createElement('button');
      button.id='titulos-auth-logout';
      button.type='button';
      button.textContent='Cerrar sesión';
      button.addEventListener('click',function(){
        window.firebase.auth().signOut().then(function(){window.location.reload();});
      });
      document.body.appendChild(button);
    }
  }

  function verify(user){
    return user.getIdToken().then(function(token){
      return nativeFetch(apiBase+'/api/session',{
        method:'GET',
        cache:'no-store',
        headers:{'Authorization':'Bearer '+token}
      });
    }).then(function(response){
      return response.json().then(function(data){
        if(!response.ok||data.ok===false)throw new Error(data.mensaje||'No se pudo validar la sesión.');
        var role=text(data.role||data.usuario&&data.usuario.role).toLowerCase();
        if(!allowed(role))throw new Error('Tu usuario no tiene permiso para esta pantalla.');
        currentUser=user;
        currentRole=role;
        hideLogin();
        if(!ready){ready=true;gateResolve();}
        window.TITULOS_AUTH={user:data.usuario||{},role:role};
      });
    });
  }

  function init(){
    ensureUi();
    var config=window.TITULOS_FIREBASE_CONFIG||{};
    if(!window.firebase||!window.firebase.initializeApp){
      showLogin('No se pudo cargar Firebase Authentication.');
      return;
    }
    if(!window.firebase.apps.length)window.firebase.initializeApp(config);
    window.firebase.auth().onAuthStateChanged(function(user){
      if(!user){
        currentUser=null;
        currentRole='';
        showLogin('');
        return;
      }
      setMessage('Validando permisos...');
      verify(user).catch(function(error){
        currentUser=null;
        currentRole='';
        showLogin(error&&error.message?error.message:'Acceso no autorizado.');
      });
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})(window,document);
