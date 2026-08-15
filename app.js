/* UnoVelho Matematixa 3.0 - frontend completo */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const API = '/api';

const refs = {
  maps: [
    {id:'map_saloon',name:'Saloon Clássico',thumb:'assets/reference-arena.jpg',theme:'saloon'},
    {id:'map_classroom',name:'Sala de Aula',thumb:'assets/reference-lobby.jpg',theme:'classroom'},
    {id:'map_geometry',name:'Laboratório Geométrico',theme:'geometry'},
    {id:'map_neon_city',name:'Cidade Neon',theme:'neon'},
    {id:'map_forest',name:'Floresta Matemática',theme:'forest'},
    {id:'map_desert',name:'Deserto Dourado',theme:'desert'},
    {id:'map_ice',name:'Montanha Congelada',theme:'ice'},
    {id:'map_space',name:'Estação Espacial',theme:'space'},
    {id:'map_math_dimension',name:'Dimensão Matemática',theme:'math'},
    {id:'map_ceo',name:'Dimensão CEO',theme:'ceo'}
  ],
  hair: ['hair_basic','hair_curl','hair_long','hair_mohawk','hair_afro','hair_braids','hair_ice','hair_ceo'],
  top: ['shirt_basic','shirt_red','shirt_neon','shirt_gold','shirt_space'],
  bottom: ['pants_basic','pants_black','pants_neon'],
  shoes: ['shoes_basic','shoes_red','shoes_gold'],
  accessory: ['glasses_basic','glasses_cyan','glasses_gold','hat_cap','hat_cowboy','hat_crown','mask_math','backpack_blue','backpack_space'],
  effect: ['aura_blue','aura_gold','aura_rainbow'],
  emote: ['emote_wave','emote_math','emote_fire'],
  title: ['title_beginner','title_calculator','title_master','title_ceo']
};

const state = {
  user:null,
  profile:null,
  token:null,
  items:[],
  inventory:[],
  socket:null,
  currentView:'lobby',
  previousView:'lobby',
  currentRoom:null,
  currentChat:'world',
  pendingCard:null,
  pendingChallenge:null,
  pendingSoloCard:null,
  solo:null,
  settings:null,
  terms:false,
  audio:null,
  musicNode:null,
  muted:false,
  roomToJoin:null,
  shopMode:'official',
  inventoryMode:'items',
  selectedPrivateUser:null
};

const SOLO_COLORS=['red','yellow','green','blue'];
const SOLO_NAMES={red:'VERMELHO',yellow:'AMARELO',green:'VERDE',blue:'AZUL'};

const SoundFX = {
  ctx:null,
  enabled:true,
  volume:.75,
  init(){try{if(!this.ctx)this.ctx=new(window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume();}catch{}},
  tone(freq,d=.12,type='sine',gain=.07){if(!this.enabled)return;try{this.init();const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.value=freq;g.gain.setValueAtTime(Math.max(.001,gain*this.volume),this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+d);o.connect(g);g.connect(this.ctx.destination);o.start();o.stop(this.ctx.currentTime+d);}catch{}},
  card(){this.tone(430,.08,'triangle',.08)},
  click(){this.tone(720,.06,'sine',.05)},
  ok(){this.tone(620,.12);setTimeout(()=>this.tone(880,.18),80)},
  bad(){this.tone(130,.25,'sawtooth',.08)},
  win(){[523,659,783,1046].forEach((f,i)=>setTimeout(()=>this.tone(f,.2),i*110))},
  lose(){[260,200,140].forEach((f,i)=>setTimeout(()=>this.tone(f,.22,'triangle'),i*120))}
};

const BackgroundMusic={ctx:null,master:null,timer:null,step:0,enabled:true,volume:.45,started:false,init(){try{if(!this.ctx)this.ctx=new(window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume();if(!this.master){this.master=this.ctx.createGain();this.master.gain.value=this.volume*.08;this.master.connect(this.ctx.destination);}}catch{}},start(){if(this.started)return;this.init();if(!this.ctx||!this.master)return;this.started=true;this.schedule();},schedule(){if(!this.started||!this.ctx)return;const notes=[261.63,329.63,392,523.25,392,329.63,293.66,349.23,440,587.33,440,349.23];const n=notes[this.step%notes.length];const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type='triangle';o.frequency.value=n;g.gain.setValueAtTime(.0001,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.055,this.ctx.currentTime+.025);g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+.30);o.connect(g);g.connect(this.master);o.start();o.stop(this.ctx.currentTime+.32);this.step++;this.timer=setTimeout(()=>this.schedule(),330);},stop(){this.started=false;if(this.timer)clearTimeout(this.timer);this.timer=null;},setEnabled(v){this.enabled=v;if(v)this.start();else this.stop();},setVolume(v){this.volume=Number(v)||0;if(this.master)this.master.gain.value=this.volume*.08;}};
function startBackgroundMusic(){if(state.profile?.settings?.music!==false){BackgroundMusic.setVolume(state.profile?.settings?.musicVolume??.45);BackgroundMusic.start();}}

function toast(message,type='info',duration=2800){const el=document.createElement('div');el.className=`toast ${type}`;el.innerHTML=`<span>${type==='error'?'⚠️':type==='success'?'✓':'ℹ️'}</span><div>${escapeHtml(message).replace(/\n/g,'<br>')}</div>`;$('#toastContainer').appendChild(el);setTimeout(()=>el.classList.add('out'),duration-350);setTimeout(()=>el.remove(),duration);}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[m]));}
function show(id){$(id)?.classList.remove('hidden')}
function hide(id){$(id)?.classList.add('hidden')}
function setMessage(id,msg,type='info'){const el=$(id);if(!el)return;el.textContent=msg;el.className=`form-message ${type}`;}
function authHeaders(extra={}){const h={...(extra||{})};if(state.token)h.Authorization=`Bearer ${state.token}`;return h;}
function postJSON(url,body,opts={}){return fetch(API+url,{method:opts.method||'POST',headers:authHeaders({'Content-Type':'application/json',...(opts.headers||{})}),body:body===undefined?undefined:JSON.stringify(body),credentials:'include'}).then(async r=>{let d={};try{d=await r.json()}catch{};if(!r.ok)throw Object.assign(new Error(d.message||`Erro ${r.status} de comunicação com o servidor.`),{data:d,status:r.status});return d;});}
async function getJSON(url){const r=await fetch(API+url,{credentials:'include',headers:authHeaders()});let d={};try{d=await r.json()}catch{};if(!r.ok)throw Object.assign(new Error(d.message||`Erro ${r.status} ao carregar o jogo.`),{data:d,status:r.status});return d;}
async function cacheGameResources(){
  const progress=$('#downloadProgress');
  const urls=['/','/index.html','/style.css','/app.js','/assets/reference-arena.jpg','/assets/reference-cards.jpg','/assets/reference-lobby.jpg'];
  try{
    if(!('caches' in window)){if(progress)progress.textContent='NAVEGADOR OK';return;}
    const cache=await caches.open('unovelho-matx-v4');
    let done=0;
    for(const url of urls){try{await cache.add(url);}catch{}done++;if(progress)progress.textContent=`${Math.round(done/urls.length*100)}%`; }
    if(progress)progress.textContent='BAIXADO';
  }catch{if(progress)progress.textContent='PRONTO';}
}


function init(){
  document.documentElement.style.setProperty('--motion',localStorage.getItem('uv_reduced_motion')==='1'?'0':'1');
  bindStaticEvents();
  setTimeout(async()=>{
    hide('#bootScreen');
    if(!localStorage.getItem('uno_terms_accepted'))show('#termsModal');else await bootAuth();
  },350);
}

async function bootAuth(){
  try{const d=await getJSON('/me');state.user=d.user;state.profile=d.profile;state.settings=d.profile.settings;await enterApp();}
  catch{show('#authScreen');}
}

function bindStaticEvents(){
  $('#termsCheck').addEventListener('change',e=>$('#btnAcceptTerms').disabled=!e.target.checked);
  $('#btnAcceptTerms').onclick=async()=>{
    if(!$('#termsCheck').checked)return;
    const btn=$('#btnAcceptTerms');btn.disabled=true;btn.textContent='⏳ BAIXANDO RECURSOS...';
    await cacheGameResources();
    localStorage.setItem('uno_terms_accepted','1');state.terms=true;
    hide('#termsModal');
    startBackgroundMusic();
    await bootAuth();
  };
  $('#formLogin').onsubmit=login;
  $('#formRegister').onsubmit=register;
  $('#brandHome').onclick=()=>navigate('lobby');
  $('#btnPlay').onclick=()=>navigate('play');
  $('#btnShop').onclick=()=>openShop('official');
  $('#btnInventory').onclick=()=>openInventory('items');
  $('#btnCustomize').onclick=()=>openCustomize();
  $('#btnOpenProfile').onclick=()=>openInventory('items');
  $('#btnOpenSettings').onclick=()=>navigate('settings');
  $('#btnRankSmall').onclick=()=>openRank();
  $('#btnMapsPreview').onclick=()=>openShop('official');
  $('#btnSolo').onclick=()=>navigate('solo');
  $('#btnOnline').onclick=()=>openRooms();
  $('#btnRank').onclick=()=>openRank();
  $$('.back-btn[data-back]').forEach(b=>b.onclick=()=>navigate(b.dataset.back));
  $$('.close-modal').forEach(b=>b.onclick=()=>hide(`#${b.dataset.close}`));
  $('#btnCancelMath').onclick=()=>hide('#mathModal');
  $('#btnSubmitMath').onclick=submitMath;
  $('#mathAnswer').addEventListener('keydown',e=>{if(e.key==='Enter')submitMath();});
  $$('.difficulty').forEach(b=>b.onclick=()=>startSolo(b.dataset.difficulty));
  $('#btnRefreshRooms').onclick=loadRooms;
  $('#btnCreateRoom').onclick=()=>{populateRoomMaps();show('#createRoomModal');};
  $('#btnConfirmCreateRoom').onclick=createRoom;
  $('#btnConfirmJoinRoom').onclick=joinSelectedRoom;
  $('#btnStartRoom').onclick=()=>state.socket?.emit('room:start');
  $('#btnLeaveRoom').onclick=leaveRoom;
  $('#roomChatForm').onsubmit=e=>{e.preventDefault();sendChat($('#roomChatInput').value,'room');$('#roomChatInput').value='';};
  $('#gameChatForm').onsubmit=e=>{e.preventDefault();sendChat($('#gameChatInput').value,state.currentChat);$('#gameChatInput').value='';};
  $$('.chat-tab').forEach(b=>b.onclick=()=>switchChat(b.dataset.chat));
  $('#drawStack').onclick=()=>soloOrOnlineDraw();
  $('#btnUno').onclick=callUno;
  $('#btnBackGame').onclick=exitGame;
  $('#btnSound').onclick=toggleMute;
  $('#btnGameSettings').onclick=()=>navigate('settings');
  $('#btnLogout').onclick=logout;
  $$('.shop-tab').forEach(b=>b.onclick=()=>openShop(b.dataset.shop));
  $$('.inventory-tab').forEach(b=>b.onclick=()=>openInventory(b.dataset.inv));
  $$('.color-picker button').forEach(b=>b.onclick=()=>chooseColor(b.dataset.color));
  $$('.swatch').forEach(b=>b.onclick=()=>{state.profile.avatar.skinColor=b.dataset.value;renderCharacter('#customCharacter',state.profile.avatar);});
  $('#btnSaveCharacter').onclick=saveCharacter;
  ['setMusic','setMusicVol','setSfx','setSfxVol','setAnimations','setReducedMotion','setWorldChat','setRoomChat','setPrivateChat'].forEach(id=>$( '#'+id)?.addEventListener('change',saveSettingsFromUI));
  $('#setMusicVol')?.addEventListener('input',saveSettingsFromUI);
  $('#setSfxVol')?.addEventListener('input',saveSettingsFromUI);
  window.addEventListener('beforeunload',()=>{try{state.socket?.disconnect()}catch{}});
}

async function login(e){e.preventDefault();const fd=new FormData(e.target);try{setMessage('#loginMessage','Entrando...');const d=await postJSON('/login',{username:fd.get('username'),password:fd.get('password')});state.token=d.token||state.token;state.user=d.user;state.profile=d.profile||{avatar:{},settings:{}};state.settings=state.profile.settings;setMessage('#loginMessage',d.message,'success');await enterApp();}catch(err){setMessage('#loginMessage',err.message,'error');SoundFX.bad();}}
async function register(e){e.preventDefault();const fd=new FormData(e.target);try{setMessage('#registerMessage','Criando conta...');const d=await postJSON('/register',{username:fd.get('regUsername'),password:fd.get('regPassword')});state.token=d.token||state.token;state.user=d.user;state.profile=d.profile||{avatar:{},settings:{}};state.settings=state.profile.settings;setMessage('#registerMessage',d.message,'success');await enterApp(true);}catch(err){setMessage('#registerMessage',err.message,'error');SoundFX.bad();}}

async function enterApp(forceCustomize=false){
  hide('#authScreen');show('#appScreen');
  if(!state.profile)state.profile={avatar:{},settings:{}};
  if(!state.profile.avatar)state.profile.avatar={};
  if(!state.profile.settings)state.profile.settings=defaultClientSettings();
  try{state.items=(await getJSON('/items')).items||[];}catch(e){state.items=[];toast('Catálogo temporariamente indisponível. O jogo continuará funcionando.','error',3500);}
  try{state.inventory=(await getJSON('/inventory')).items||[];}catch(e){state.inventory=[];toast('Inventário ainda não pôde ser carregado.','error',3500);}
  updateUserUI();
  connectSocket();
  renderCharacter('#heroCharacter',state.profile.avatar);renderCharacter('#profileCharacterLarge',state.profile.avatar);renderCharacter('#customCharacter',state.profile.avatar);
  loadMiniRank();renderMapPreview();loadAchievementsPreview();populateCustomizer();applySettings();
  if(forceCustomize||!state.profile.avatar?.hair)openCustomize();
  navigate('lobby');
  startBackgroundMusic();
}
function defaultClientSettings(){return {music:true,musicVolume:.45,sfx:true,sfxVolume:.75,animations:true,chatWorld:true,chatRoom:true,chatPrivate:true,reducedMotion:false};}

function updateUserUI(){const u=state.user;if(!u)return;$('#coinValue').textContent=formatNum(u.coins);$('#levelValue').textContent=u.level;$('#heroName').textContent=u.username;$('#winsValue').textContent=u.wins||0;$('#xpValue').textContent=formatNum(u.xp);$('#profileName').textContent=u.username;$('#profileLevel').textContent=u.level;$('#profileWins').textContent=u.wins||0;$('#profileGames').textContent=u.gamesPlayed||0;$('#accountInfo').innerHTML=`<b>${escapeHtml(u.username)}</b><br>Cargo: ${escapeHtml(u.role)}<br>🪙 ${formatNum(u.coins)} • ⭐ ${formatNum(u.xp)} XP`;const pct=Math.min(100,Math.max(0,((u.xp-(u.level>1?xpForLevelClient(u.level):0))/Math.max(1,xpForLevelClient(u.level+1)-(u.level>1?xpForLevelClient(u.level):0)))*100));$('#xpBar').style.width=pct+'%';const title=itemName(state.profile?.avatar?.title)||'INICIANTE';$('#profileTitle').textContent=title.toUpperCase();$('#customNamePreview').textContent=u.username;$('#customTitlePreview').textContent=title.toUpperCase();$('#avatarMiniFace').textContent='🙂';}
function formatNum(n){return new Intl.NumberFormat('pt-BR').format(Number(n||0));}
function xpForLevelClient(level){return Math.floor(100*Math.pow(Math.max(0,level-1),1.45));}
function itemName(id){return state.items.find(x=>x.id===id)?.name||({title_beginner:'Iniciante',title_calculator:'Calculista',title_master:'Mestre Matematixa',title_ceo:'CEO'}[id]||id||'');}

function navigate(view){
  if(view==='lobby'&&!state.user)return;
  $$('.view').forEach(v=>v.classList.add('hidden'));const target=$(`#${view}View`);if(target)target.classList.remove('hidden');state.previousView=state.currentView;state.currentView=view;window.scrollTo({top:0,behavior:'smooth'});
}

function connectSocket(){
  if(state.socket?.connected)return;
  state.socket=io({withCredentials:true,auth:state.token?{token:state.token}:{}});
  state.socket.on('connect',()=>toast('Conectado ao servidor online.','success',1800));
  state.socket.on('connect_error',e=>toast('Conexão online indisponível: '+(e.message||'erro'),'error'));
  state.socket.on('rooms:update',()=>{if(state.currentView==='rooms')loadRooms();});
  state.socket.on('room:joined',room=>{state.currentRoom=room;renderRoom(room);navigate('room');});
  state.socket.on('room:update',room=>{if(state.currentRoom?.code===room.code){state.currentRoom=room;renderRoom(room);}});
  state.socket.on('room:system',m=>toast(m.message));
  state.socket.on('room:closed',m=>{toast(m.message,'error');state.currentRoom=null;navigate('rooms');});
  state.socket.on('toast',m=>toast(m.message,m.type||'info'));
  state.socket.on('chat:message',renderChatMessage);
  state.socket.on('game:state',renderOnlineGame);
  state.socket.on('math:challenge',c=>{state.pendingChallenge=c;openMathForOnline(c);});
  state.socket.on('math:result',r=>{hide('#mathModal');state.pendingChallenge=null;state.pendingCard=null;if(!r.ok){SoundFX.bad();toast('Resposta errada. Você não pode jogar essa carta.','error');}});
  state.socket.on('game:winner',m=>{SoundFX.win();toast(`🏆 ${m.username} venceu a partida!`,'success',5000);});
  state.socket.on('global:pause',m=>{show('#globalPauseBanner');$('#globalPauseBanner').textContent='⏸ '+m.message;});
  state.socket.on('global:resume',()=>hide('#globalPauseBanner'));
  state.socket.on('admin:announcement',m=>toast(`📢 ${m.by}: ${m.message}`,'success',6500));
  state.socket.on('admin:result',m=>toast(m.message,m.ok?'success':'error',5000));
  state.socket.on('admin:kick',m=>{toast(m.message,'error');state.currentRoom=null;exitGame();navigate('lobby');});
}

function renderMapPreview(){const el=$('#mapPreview');el.innerHTML=refs.maps.slice(0,4).map(m=>`<button class="map-tile map-${m.theme}" style="${m.thumb?`background-image:linear-gradient(180deg,transparent,rgba(2,10,35,.8)),url('${m.thumb}')`:''}" data-map="${m.id}"><b>${escapeHtml(m.name)}</b></button>`).join('');el.querySelectorAll('[data-map]').forEach(b=>b.onclick=()=>openShop('official'));}
async function loadMiniRank(){try{const d=await getJSON('/rank');$('#miniRank').innerHTML=(d.players||[]).slice(0,5).map((p,i)=>`<div class="rank-mini-row"><span>${i+1}</span><b>${escapeHtml(p.username)}</b><small>Nível ${p.level} • ${formatNum(p.wins)} vit.</small></div>`).join('')||'<p class="muted">Ranking ainda vazio.</p>';}catch{}}
function loadAchievementsPreview(){const a=[['🏆','Primeira Vitória'],['🧠','Mente Matemática'],['🌎','Primeiro Online'],['🎒','Colecionador']];$('#achievementPreview').innerHTML=a.map(x=>`<div class="achievement-chip"><span>${x[0]}</span><b>${x[1]}</b></div>`).join('');}

function populateRoomMaps(){const s=$('#roomMap');s.innerHTML=refs.maps.filter(m=>m.id!=='map_ceo'||state.user.role==='CEO').map(m=>`<option value="${m.id}">${m.name}</option>`).join('');}
async function openRooms(){navigate('rooms');await loadRooms();}
async function loadRooms(){try{const d=await getJSON('/rooms');const rooms=d.rooms||[];$('#roomsList').innerHTML=rooms.length?rooms.map(r=>`<article class="room-card glass"><div class="room-cover map-${roomTheme(r.options.mapId)}"><span>${r.locked?'🔒':'🌎'}</span></div><div class="room-card-body"><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.ownerName)} • ${r.players.length}/${r.options.maxPlayers} jogadores</small></div><div class="room-tags"><span>${r.locked?'COM SENHA':'ABERTA'}</span><span>${r.options.turnSeconds}s</span><span>${r.options.difficulty}</span></div><button class="btn btn-primary btn-wide join-room" data-code="${r.code}">${r.locked?'🔒 ENTRAR':'ENTRAR'}</button></div></article>`).join(''):'<div class="empty-state glass"><span>🌌</span><b>Nenhuma sala aberta agora.</b><small>Crie a primeira mesa!</small></div>';$$('.join-room').forEach(b=>b.onclick=()=>selectRoom(b.dataset.code));}catch(e){toast(e.message,'error');}}
function roomTheme(id){return refs.maps.find(m=>m.id===id)?.theme||'classroom';}
async function createRoom(){try{const body={name:$('#roomName').value||`Mesa de ${state.user.username}`,password:$('#roomPassword').value,maxPlayers:Number($('#roomMax').value),turnSeconds:Number($('#roomTime').value),difficulty:$('#roomDifficulty').value,botFill:Number($('#roomBots').value),mapId:$('#roomMap').value,startingCards:Number($('#roomCards').value),allowBots:$('#roomAllowBots').checked,specials:$('#roomSpecials').checked,stackDraw:$('#roomStack').checked,chat:$('#roomChat').checked};const d=await postJSON('/rooms',body);hide('#createRoomModal');state.currentRoom=d.room;state.socket.emit('room:join',{code:d.roomCode,password:body.password});}catch(e){toast(e.message,'error');}}
async function selectRoom(code){try{const d=await getJSON('/rooms');const room=(d.rooms||[]).find(r=>r.code===code);if(!room)return;state.roomToJoin=room;$('#joinRoomInfo').innerHTML=`<b>${escapeHtml(room.name)}</b><br>${escapeHtml(room.ownerName)} • ${room.players.length}/${room.options.maxPlayers} • ${room.locked?'🔒 Sala com senha':'🌎 Sala aberta'}`;$('#joinRoomPassword').value='';show('#joinRoomModal');}catch(e){toast(e.message,'error');}}
function joinSelectedRoom(){if(!state.roomToJoin)return;const r=state.roomToJoin;state.socket.emit('room:join',{code:r.code,password:$('#joinRoomPassword').value});hide('#joinRoomModal');}
function renderRoom(room){$('#roomTitle').textContent=room.name;$('#roomCodeBadge').textContent=room.code;$('#roomOptionsText').textContent=`${room.players.length}/${room.options.maxPlayers} jogadores • ${room.options.turnSeconds}s • ${room.options.difficulty} • ${room.options.math?'Matemática':''}`;$('#btnStartRoom').style.display=String(room.ownerId)===String(state.user.id)&&!room.started?'inline-flex':'none';$('#roomPlayers').innerHTML=room.players.map((p,i)=>`<div class="room-player ${String(p.userId)===String(room.ownerId)?'host':''}"><div class="player-avatar">${p.isBot?'🤖':'🙂'}</div><div><b>${escapeHtml(p.username)}</b><small>${String(p.userId)===String(room.ownerId)?'👑 Criador':'Jogador'}</small></div><span>${p.connected?'●':'○'}</span></div>`).join('');$('#roomMapBanner').className=`room-map-banner map-${roomTheme(room.options.mapId)}`;$('#roomMapBanner').innerHTML=`<div><span>🗺️ MAPA</span><b>${escapeHtml(refs.maps.find(m=>m.id===room.options.mapId)?.name||room.options.mapId)}</b></div>`;}
function leaveRoom(){if(state.socket)state.socket.emit('room:leave');state.currentRoom=null;navigate('rooms');loadRooms();}

function startSolo(difficulty){SoundFX.click();state.solo=createSolo(difficulty);navigate('game');$('#arenaShell').className=`arena-shell solo-arena map-${state.solo.mapTheme}`;$('.arena-reference').style.display='block';renderSoloGame();toast(`Modo ${difficulty==='easy'?'Fácil':difficulty==='medium'?'Médio':'Difícil'} iniciado.`,'success');}
function createSolo(difficulty){const deck=createDeck();const player=deck.splice(0,7);const bot=deck.splice(0,7);let top=deck.pop();while(top.color==='black'){deck.unshift(top);top=deck.pop();}return{difficulty,deck,player,bot,discard:top,_discardPile:[],color:top.color,turn:'player',pending:null,botName:difficulty==='hard'?'Calculinho Supremo':difficulty==='medium'?'Calculinho':'Treininho',mapTheme:['saloon','neon','geometry'][Math.floor(Math.random()*3)],uno:false,round:1};}
function createDeck(){const d=[];for(const color of SOLO_COLORS){for(let n=0;n<=9;n++)d.push({id:crypto.randomUUID(),color,value:String(n),type:'number'});d.push({id:crypto.randomUUID(),color,value:'🚫',type:'skip'});d.push({id:crypto.randomUUID(),color,value:'🔄',type:'reverse'});d.push({id:crypto.randomUUID(),color,value:'+2',type:'draw2'});}for(let i=0;i<4;i++){d.push({id:crypto.randomUUID(),color:'black',value:'🌈',type:'wild'});d.push({id:crypto.randomUUID(),color:'black',value:'+4',type:'draw4'});}return shuffle(d);}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function isPlayable(c,game){return c.color==='black'||c.color===game.color||c.value===game.discard.value;}
function renderSoloGame(){const g=state.solo;if(!g)return;$('#roundText').textContent='1 / 1';$('#turnStatus').textContent=g.turn==='player'?'SUA VEZ!':'VEZ DO BOT';$('#turnStatus').classList.toggle('bot',g.turn!=='player');$('#discardPile').className=`uno-card card-${g.color} big-card`;$('#discardPile').textContent=g.discard.value;$('#colorIndicator').textContent=SOLO_NAMES[g.color];$('#deckCount').textContent=g.deck.length;$('#opponents').innerHTML=`<div class="opponent-card"><div class="opponent-avatar">🤖</div><div><b>${escapeHtml(g.botName)}</b><small>${g.bot.length} cartas</small></div><div class="mini-hand">${Array.from({length:Math.min(g.bot.length,7)}).map(()=>'<span class="back-mini">UNO</span>').join('')}</div></div>`;$('#playerHand').innerHTML=g.player.map((c,i)=>`<button class="uno-card card-${c.color} hand-card" data-index="${i}"><i>${c.value}</i><span>${c.value}</span><em>${c.type==='number'?'MAT':c.type.toUpperCase()}</em></button>`).join('');$$('#playerHand .hand-card').forEach(b=>b.onclick=()=>attemptSoloCard(Number(b.dataset.index)));}
function attemptSoloCard(i){const g=state.solo;if(!g||g.turn!=='player')return;const card=g.player[i];if(!isPlayable(card,g)){SoundFX.bad();toast('Essa carta não combina com a mesa.','error');return;}state.pendingSoloCard={index:i,card};openMathForSolo(card);}
function soloChallenge(card){let a,b,op;if(card.type==='draw2'||card.type==='draw4'){a=2+Math.floor(Math.random()*8);b=2+Math.floor(Math.random()*8);op='×';}else if(card.type==='skip'||card.type==='reverse'){a=15+Math.floor(Math.random()*30);b=1+Math.floor(Math.random()*Math.min(15,a-1));op='−';}else{a=5+Math.floor(Math.random()*35);b=1+Math.floor(Math.random()*25);op='+';}return{a,b,op,answer:op==='×'?a*b:op==='−'?a-b:a+b};}
function openMathForSolo(card){state.pendingChallenge=soloChallenge(card);$('#mathQuestion').textContent=`Quanto é ${state.pendingChallenge.a} ${state.pendingChallenge.op} ${state.pendingChallenge.b}?`;$('#mathAnswer').value='';$('#mathFeedback').textContent='';show('#mathModal');setTimeout(()=>$('#mathAnswer').focus(),100);}
function openMathForOnline(c){state.pendingCard=c;$('#mathQuestion').textContent=`Quanto é ${c.a} ${c.op} ${c.b}?`;$('#mathAnswer').value='';$('#mathFeedback').textContent='';show('#mathModal');setTimeout(()=>$('#mathAnswer').focus(),100);}
function submitMath(){const answer=Number($('#mathAnswer').value);if(!Number.isFinite(answer))return;const g=state.solo;if(g&&state.pendingSoloCard){const c=state.pendingChallenge;if(answer!==c.answer){SoundFX.bad();hide('#mathModal');state.pendingSoloCard=null;toast('Conta errada! Você compra uma carta e perde a vez.','error');soloDraw();return;}hide('#mathModal');const card=state.pendingSoloCard.card;state.pendingSoloCard=null;playSoloCard(card);return;}if(state.pendingCard&&state.socket){state.pendingCard._answer=answer;hide('#mathModal');if(state.pendingCard.value==='🌈'||state.pendingCard.type==='draw4'){show('#colorModal');}else{state.socket.emit('game:play',{cardId:state.pendingCard.cardId||state.pendingCard.id,answer});state.pendingCard=null;}}}
function playSoloCard(card){const g=state.solo;const i=g.player.findIndex(x=>x.id===card.id);if(i<0)return;g.player.splice(i,1);g._discardPile.push(g.discard);g.discard=card;if(card.color==='black'){g.color=SOLO_COLORS[Math.floor(Math.random()*4)];toast(`Coringa! Cor escolhida: ${SOLO_NAMES[g.color]}`,'success');}else g.color=card.color;SoundFX.card();if(card.type==='draw2'){drawFromDeck(g,g.bot,2);toast('Bot comprou +2!');}if(card.type==='draw4'){drawFromDeck(g,g.bot,4);toast('Bot comprou +4!');}if(g.player.length===0){finishSolo(true);return;}if(card.type==='skip'||card.type==='reverse'){renderSoloGame();return;}g.turn='bot';renderSoloGame();setTimeout(botSoloTurn,900);}
function drawFromDeck(g,hand,count){for(let n=0;n<count;n++){if(!g.deck.length)recycleSolo(g);if(g.deck.length)hand.push(g.deck.pop());}}
function recycleSolo(g){const top=g.discard;const pile=[...g._discardPile||[]];if(!pile.length)return;g.deck=shuffle(pile);g._discardPile=[];g.discard=top;}
function soloDraw(){const g=state.solo;if(!g||g.turn!=='player')return;drawFromDeck(g,g.player,1);g.turn='bot';renderSoloGame();setTimeout(botSoloTurn,800);}
function botSoloTurn(){const g=state.solo;if(!g||g.turn!=='bot')return;let candidates=g.bot.filter(c=>isPlayable(c,g));let card;if(g.difficulty==='easy')card=candidates[0];else if(g.difficulty==='medium')card=candidates.sort((a,b)=>cardValue(b)-cardValue(a))[0];else card=candidates.sort((a,b)=>botScore(g,b)-botScore(g,a))[0];if(!card){drawFromDeck(g,g.bot,1);g.turn='player';renderSoloGame();return;}g.bot.splice(g.bot.indexOf(card),1);g._discardPile.push(g.discard);g.discard=card;g.color=card.color==='black'?chooseBotColor(g.bot):card.color;SoundFX.card();if(card.type==='draw2')drawFromDeck(g,g.player,2);if(card.type==='draw4')drawFromDeck(g,g.player,4);if(g.bot.length===0){finishSolo(false);return;}if(card.type==='skip'||card.type==='reverse'){renderSoloGame();setTimeout(botSoloTurn,900);return;}g.turn='player';renderSoloGame();}
function cardValue(c){return c.type==='draw4'?100:c.type==='draw2'?80:c.type==='wild'?70:c.type==='skip'?50:c.type==='reverse'?45:Number(c.value)||0;}
function botScore(g,c){let score=cardValue(c);if(c.color===g.color)score+=20;if(g.player.length<=3&&c.type!=='number')score+=25;return score;}
function chooseBotColor(hand){const counts={red:0,yellow:0,green:0,blue:0};hand.forEach(c=>{if(counts[c.color]!=null)counts[c.color]++;});return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];}
async function finishSolo(win){const g=state.solo;if(!g)return;win?SoundFX.win():SoundFX.lose();const coins=win?100:15;const xp=win?180:50;toast(win?`🏆 Vitória! +${coins} moedas e +${xp} XP.`:`Partida encerrada. +${coins} moedas e +${xp} XP.` ,win?'success':'info',5000);try{const d=await postJSON('/game/solo-finish',{win,coins,xp,difficulty:g.difficulty});if(d.user){state.user=d.user;updateUserUI();}}catch{}setTimeout(()=>{state.solo=null;navigate('lobby');},1200);}
function soloOrOnlineDraw(){if(state.solo){soloDraw();return;}if(state.currentRoom?.started)state.socket?.emit('game:draw');}
function callUno(){if(state.solo){if(state.solo.player.length===1){state.solo.uno=true;SoundFX.ok();toast('📣 UNO!','success');}else toast('Você só pode chamar UNO com uma carta.','error');}else{state.socket?.emit('chat:send',{channel:'room',roomCode:state.currentRoom?.code,body:'📣 UNO!'});SoundFX.ok();}}
function exitGame(){state.solo=null;state.pendingCard=null;state.pendingSoloCard=null;hide('#mathModal');hide('#colorModal');navigate(state.currentRoom?'room':'lobby');}
function toggleMute(){state.muted=!state.muted;SoundFX.enabled=!state.muted&&state.settings?.sfx!==false;$('#btnSound').textContent=state.muted?'🔇':'🔊';}

function renderOnlineGame(game){if(!game)return;navigate('game');$('#arenaShell').className=`arena-shell online-arena map-${roomTheme(game.mapId)}`;$('#roundText').textContent='ONLINE';const mine=String(game.currentPlayerId)===String(state.user.id);$('#turnStatus').textContent=mine?'SUA VEZ!':'VEZ DO OPONENTE';$('#turnStatus').classList.toggle('bot',!mine);$('#discardPile').className=`uno-card card-${game.currentColor} big-card`;$('#discardPile').textContent=game.top?.value||'?';$('#colorIndicator').textContent=SOLO_NAMES[game.currentColor]||game.currentColor;$('#deckCount').textContent=game.deckCount;$('#playerHand').innerHTML=(game.hand||[]).map((c,i)=>`<button class="uno-card card-${c.color} hand-card" data-index="${i}"><i>${c.value}</i><span>${c.value}</span><em>${c.type==='number'?'MAT':c.type.toUpperCase()}</em></button>`).join('');$$('#playerHand .hand-card').forEach((b,i)=>b.onclick=()=>{const c=game.hand[i];if(!mine)return toast('Aguarde sua vez.');if(!isPlayable(c,{color:game.currentColor,discard:game.top}))return toast('Essa carta não pode ser jogada.','error');state.pendingCard={...c,cardId:c.id};state.socket.emit('game:challenge',{cardId:c.id});});$('#opponents').innerHTML=game.players.filter(p=>String(p.userId)!==String(state.user.id)).map(p=>`<div class="opponent-card ${String(p.userId)===String(game.currentPlayerId)?'active':''}"><div class="opponent-avatar">${p.isBot?'🤖':'🙂'}</div><div><b>${escapeHtml(p.username)}</b><small>${p.cardCount} cartas</small></div><div class="mini-hand">${Array.from({length:Math.min(p.cardCount,7)}).map(()=>'<span class="back-mini">UNO</span>').join('')}</div></div>`).join('');renderCharacter('#gameAvatar',state.profile.avatar);$('#gamePlayerName').textContent=state.user.username;$('#gamePlayerTitle').textContent=itemName(state.profile.avatar.title).toUpperCase();}
function chooseColor(color){hide('#colorModal');if(state.pendingCard&&state.socket){state.socket.emit('game:play',{cardId:state.pendingCard.cardId||state.pendingCard.id,answer:state.pendingCard._answer,chosenColor:color});state.pendingCard=null;}}

function sendChat(body,channel='world'){const text=String(body||'').trim();if(!text)return;state.socket?.emit('chat:send',{channel,body:text,roomCode:state.currentRoom?.code,receiverId:state.selectedPrivateUser});}
function switchChat(ch){state.currentChat=ch;$$('.chat-tab').forEach(b=>b.classList.toggle('active',b.dataset.chat===ch));$('#gameChatMessages').innerHTML='';$('#gameChatInput').placeholder=ch==='private'?'Mensagem privada...':'Mensagem...';}
function renderChatMessage(m){if(m.channel==='room'&&state.currentRoom?.code!==m.roomCode)return;if(m.channel==='private'&&Number(m.senderId)!==Number(state.selectedPrivateUser)&&Number(m.receiverId)!==Number(state.user.id))return;const targets=[$('#roomChatMessages'),$('#gameChatMessages')];targets.forEach(box=>{if(!box)return;const item=document.createElement('div');item.className=`chat-line ${Number(m.senderId)===Number(state.user.id)?'mine':''}`;item.innerHTML=`<b>${escapeHtml(m.senderName)}</b><span>${escapeHtml(m.body)}</span>`;box.appendChild(item);box.scrollTop=box.scrollHeight;});}

async function openShop(mode='official'){state.shopMode=mode;navigate('shop');$$('.shop-tab').forEach(b=>b.classList.toggle('active',b.dataset.shop===mode));try{if(mode==='market'){const d=await getJSON('/shop/market');renderMarket(d.listings||[]);}else{renderOfficialShop();}}catch(e){toast(e.message,'error');}}
function renderOfficialShop(){const owned=new Set(state.inventory.map(x=>x.id));const list=state.items.filter(i=>i.is_active!==false&&!i.asset?.ceoOnly||i.asset?.ceoOnly&&state.user.role==='CEO');$('#shopGrid').innerHTML=list.map(item=>itemCard(item,owned.has(item.id))).join('');$$('.buy-item').forEach(b=>b.onclick=()=>buyItem(b.dataset.id));}
function itemCard(i,owned=false){const asset=i.asset||{};const visual=asset.theme||asset.style||'item';return `<article class="item-card glass rarity-${i.rarity}"><div class="item-visual ${visual}">${i.category==='map'?'🗺️':i.category==='deck'?'🎴':i.category==='hair'?'💇':i.category==='clothing'?'👕':i.category==='accessory'?'🕶️':i.category==='effect'?'✨':i.category==='emote'?'🎭':i.category==='title'?'🏷️':'🧩'}</div><div class="item-info"><span class="item-category">${escapeHtml(i.category)}</span><b>${escapeHtml(i.name)}</b><small>${escapeHtml(i.description||'')}</small><div class="item-buy"><span>${i.xp_required?`⭐ ${formatNum(i.xp_required)} XP`:'Disponível'}</span>${owned?'<button class="btn btn-owned" disabled>DESBLOQUEADO</button>':`<button class="btn btn-primary buy-item" data-id="${i.id}">${i.price?'🪙 '+formatNum(i.price):'GRÁTIS'}</button>`}</div></div></article>`;}
async function buyItem(id){try{const d=await postJSON('/shop/buy',{itemId:id});toast(d.message,'success');state.inventory=(await getJSON('/inventory')).items||[];const me=await getJSON('/me');state.user=me.user;state.profile=me.profile;updateUserUI();renderOfficialShop();}catch(e){toast(e.message,'error');}}
function renderMarket(list){$('#shopGrid').innerHTML=list.length?list.map(l=>`<article class="item-card glass rarity-${l.rarity}"><div class="item-visual generated">🧑‍🤝‍🧑</div><div class="item-info"><span class="item-category">VENDA DE JOGADOR</span><b>${escapeHtml(l.name)}</b><small>Vendedor: ${escapeHtml(l.seller)}</small><div class="item-buy"><span>🪙 ${formatNum(l.price)}</span><button class="btn btn-primary market-buy" data-id="${l.listing_id}">COMPRAR</button></div></div></article>`).join(''):'<div class="empty-state glass"><span>🛍️</span><b>Nenhum anúncio ativo.</b><small>Tenha itens duplicados e coloque-os à venda.</small></div>';$$('.market-buy').forEach(b=>b.onclick=()=>buyMarket(b.dataset.id));}
async function buyMarket(id){try{const d=await postJSON('/shop/market/buy',{listingId:Number(id)});toast(d.message,'success');openShop('market');}catch(e){toast(e.message,'error');}}

async function openInventory(mode='items'){state.inventoryMode=mode;navigate('inventory');state.inventory=(await getJSON('/inventory')).items||[];$$('.inventory-tab').forEach(b=>b.classList.toggle('active',b.dataset.inv===mode));renderCharacter('#profileCharacterLarge',state.profile.avatar);if(mode==='items')renderInventoryItems();else renderAchievements();}
function renderInventoryItems(){const by={};state.inventory.forEach(i=>(by[i.category]??=[]).push(i));$('#inventoryContent').innerHTML=Object.keys(by).length?Object.entries(by).map(([cat,arr])=>`<div class="inventory-section"><h3>${cat.toUpperCase()}</h3><div class="inventory-grid">${arr.map(i=>`<div class="owned-item"><div class="owned-icon">${i.category==='hair'?'💇':i.category==='clothing'?'👕':i.category==='accessory'?'🕶️':i.category==='map'?'🗺️':i.category==='deck'?'🎴':'✨'}</div><b>${escapeHtml(i.name)}</b><small>x${i.quantity||1}</small><button class="mini-sell" data-sell="${i.id}">VENDER</button></div>`).join('')}</div></div>`).join(''):'<div class="empty-state"><span>🎒</span><b>Seu inventário está esperando sua primeira conquista.</b></div>';}
document.addEventListener('click',async e=>{const b=e.target.closest('[data-sell]');if(!b)return;const price=prompt('Preço em moedas para este item (mínimo 10):','500');if(price===null)return;try{await postJSON('/shop/market/list',{itemId:b.dataset.sell,price:Number(price)});toast('Item anunciado na loja de jogadores!','success');state.inventory=(await getJSON('/inventory')).items||[];renderInventoryItems();}catch(err){toast(err.message,'error');}});

function renderAchievements(){const arr=[['first_win','🏆','Primeira Vitória','Vença sua primeira partida.'],['math_10','🧠','Mente Matemática','Acerte 10 desafios.'],['online_first','🌎','Primeiro Online','Finalize uma partida online.'],['collector','🎒','Colecionador','Desbloqueie 10 itens.'],['level_10','⭐','Nível 10','Alcance o nível 10.'],['level_25','💎','Nível 25','Alcance o nível 25.']];$('#inventoryContent').innerHTML=`<div class="achievement-list">${arr.map(a=>`<div class="achievement-card"><span>${a[1]}</span><div><b>${a[2]}</b><small>${a[3]}</small></div><em>EM PROGRESSO</em></div>`).join('')}</div>`;}

function populateCustomizer(){
  const categories={hair:'#customHair',top:'#customTop',bottom:'#customBottom',shoes:'#customShoes',accessory:'#customAccessory',effect:'#customEffect',emote:'#customEmote',title:'#customTitle'};
  for(const [cat,sel] of Object.entries(categories)){const el=$(sel);if(!el)continue;const allowed=new Set(state.inventory.map(i=>i.id));const ids=refs[cat]||[];const opts=ids.filter(id=>allowed.has(id)||state.user.role==='CEO'&&state.items.find(i=>i.id===id)?.asset?.ceoOnly).map(id=>({id,name:itemName(id)}));el.innerHTML=opts.map(o=>`<option value="${o.id}">${escapeHtml(o.name)}</option>`).join('')||`<option value="${ids[0]||''}">${escapeHtml(itemName(ids[0]||''))}</option>`;el.value=state.profile.avatar[cat]||ids[0]||'';el.onchange=()=>{state.profile.avatar[cat]=el.value;renderCharacter('#customCharacter',state.profile.avatar);};}
  $('#customEyes').value=state.profile.avatar.eyes||'#1d2433';$('#customHairColor').value=state.profile.avatar.hairColor||'#171717';$('#customEyes').onchange=e=>{state.profile.avatar.eyes=e.target.value;renderCharacter('#customCharacter',state.profile.avatar)};$('#customHairColor').onchange=e=>{state.profile.avatar.hairColor=e.target.value;renderCharacter('#customCharacter',state.profile.avatar)};
}
function openCustomize(){populateCustomizer();show('#customizeModal');renderCharacter('#customCharacter',state.profile.avatar);}
async function saveCharacter(){try{const d=await postJSON('/profile',{avatar:state.profile.avatar,settings:state.profile.settings,bio:state.profile.bio||''},{method:'PUT'});state.profile=d.profile;hide('#customizeModal');renderCharacter('#heroCharacter',state.profile.avatar);renderCharacter('#profileCharacterLarge',state.profile.avatar);toast('Personagem salvo!','success');}catch(e){toast(e.message,'error');}}
async function saveSettingsFromUI(){if(!state.profile)return;state.profile.settings={music:$('#setMusic').checked,musicVolume:Number($('#setMusicVol').value),sfx:$('#setSfx').checked,sfxVolume:Number($('#setSfxVol').value),animations:$('#setAnimations').checked,reducedMotion:$('#setReducedMotion').checked,chatWorld:$('#setWorldChat').checked,chatRoom:$('#setRoomChat').checked,chatPrivate:$('#setPrivateChat').checked};SoundFX.enabled=state.profile.settings.sfx;SoundFX.volume=state.profile.settings.sfxVolume;BackgroundMusic.setVolume(state.profile.settings.musicVolume);BackgroundMusic.setEnabled(state.profile.settings.music);localStorage.setItem('uv_reduced_motion',state.profile.settings.reducedMotion?'1':'0');document.documentElement.style.setProperty('--motion',state.profile.settings.reducedMotion?'0':'1');try{const d=await postJSON('/profile',{avatar:state.profile.avatar,settings:state.profile.settings,bio:state.profile.bio||''},{method:'PUT'});state.profile=d.profile;}catch{}}
function applySettings(){const s=state.profile.settings||defaultClientSettings();state.settings=s;$('#setMusic').checked=s.music;$('#setMusicVol').value=s.musicVolume;$('#setSfx').checked=s.sfx;$('#setSfxVol').value=s.sfxVolume;$('#setAnimations').checked=s.animations;$('#setReducedMotion').checked=s.reducedMotion;$('#setWorldChat').checked=s.chatWorld;$('#setRoomChat').checked=s.chatRoom;$('#setPrivateChat').checked=s.chatPrivate;SoundFX.enabled=s.sfx;SoundFX.volume=s.sfxVolume;}

function renderCharacter(selector,a){const el=typeof selector==='string'?$(selector):selector;if(!el||!a)return;const hair=a.hair||'hair_basic';const hairColor=a.hairColor||'#171717';el.innerHTML=`<div class="char-aura ${a.effect||''}"></div><div class="char-body" style="--skin:${a.skinColor||'#d59b76'};--eyes:${a.eyes||'#1d2433'}"><div class="char-head"><div class="char-hair ${hair}" style="--hair:${hairColor}"></div><div class="char-eye left"></div><div class="char-eye right"></div><div class="char-mouth"></div></div><div class="char-torso ${a.top||'shirt_basic'}"></div><div class="char-bottom ${a.bottom||'pants_basic'}"></div><div class="char-shoes ${a.shoes||'shoes_basic'}"></div><div class="char-accessory ${a.accessory||''}"></div></div>`;}

async function openRank(){navigate('rank');try{const d=await getJSON('/rank');$('#rankRows').innerHTML=(d.players||[]).map((p,i)=>`<div class="rank-row ${p.username===state.user.username?'me':''}"><span>${i+1}</span><b>${escapeHtml(p.username)}</b><span>${p.level}</span><span>${formatNum(p.xp)}</span><span>${formatNum(p.wins)}</span></div>`).join('')||'<div class="empty-state">Nenhum jogador.</div>';}catch(e){toast(e.message,'error');}}
async function logout(){try{await postJSON('/logout',undefined);}catch{}try{state.socket?.disconnect()}catch{}state.user=null;state.profile=null;state.token=null;BackgroundMusic.stop();hide('#appScreen');show('#authScreen');}

function setupShopTabs(){/* reservado */}

// Seleção de uma carta online: servidor gera o desafio e só então a carta pode ser enviada.
// O cliente nunca recebe a resposta correta do desafio.

window.addEventListener('DOMContentLoaded',init);
