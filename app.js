/* UnoVelho Matematixa — frontend integrado
 * Compatível com o server.js atual do projeto.
 * Não depende de Service Worker, cache de recursos ou IDs opcionais para iniciar.
 */
'use strict';

const API = '/api';
const VERSION = '20260816-6';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const MAPS = [
  ['map_saloon','Saloon Clássico','saloon'],['map_medieval_tavern','Taverna Medieval','medieval'],['map_pirate_ship','Navio Pirata','pirate'],['map_modern_home','Casa Moderna','modern'],
  ['map_classroom','Sala de Aula','classroom'],['map_geometry','Laboratório Geométrico','geometry'],['map_neon_city','Cidade Neon','neon'],['map_forest','Floresta Matemática','forest'],['map_desert','Deserto Dourado','desert'],
  ['map_ice','Montanha Congelada','ice'],['map_space','Estação Espacial','space'],['map_math_dimension','Dimensão Matemática','math'],['map_ceo','Dimensão CEO','ceo']
].map(([id,name,theme])=>({id,name,theme,asset:`assets/maps/${theme}.svg`}));
const MAP_PERSONALITY={
  saloon:{label:'Saloon clássico',music:'saloon',decor:'🍺 🕯️ 🪵'},medieval:{label:'Taverna medieval',music:'medieval',decor:'🍺 🕯️ 🛡️'},pirate:{label:'Navio pirata',music:'pirate',decor:'🏴‍☠️ 🍺 ⚓'},modern:{label:'Casa moderna',music:'modern',decor:'☕ 🪴 💡'},classroom:{label:'Sala de aula',music:'modern',decor:'📚 🧮 ✏️'},neon:{label:'Cidade neon',music:'modern',decor:'🌃 ✨ 💡'},forest:{label:'Floresta',music:'forest',decor:'🌲 🍃 ✨'},desert:{label:'Deserto',music:'saloon',decor:'🏜️ 🔥'},ice:{label:'Montanha congelada',music:'modern',decor:'❄️ 🧊'},space:{label:'Estação espacial',music:'modern',decor:'🚀 🪐'},math:{label:'Dimensão Matematixa',music:'modern',decor:'∞ ✨ 🔢'},ceo:{label:'Dimensão CEO',music:'modern',decor:'👑 💎 🥂'}
};

const COSMETICS = {
  hair:['hair_basic','hair_curl','hair_long','hair_mohawk','hair_afro','hair_braids','hair_ice','hair_ceo'],
  top:['shirt_basic','shirt_red','shirt_neon','shirt_gold','shirt_space'], bottom:['pants_basic','pants_black','pants_neon'],
  shoes:['shoes_basic','shoes_red','shoes_gold'], accessory:['glasses_basic','glasses_cyan','glasses_gold','hat_cap','hat_cowboy','hat_crown','mask_math','backpack_blue','backpack_space'],
  effect:['aura_blue','aura_gold','aura_rainbow'], emote:['emote_wave','emote_math','emote_fire'], title:['title_beginner','title_calculator','title_master','title_ceo']
};
const COLORS = ['red','yellow','green','blue'];
const COLOR_NAME = {red:'VERMELHO',yellow:'AMARELO',green:'VERDE',blue:'AZUL'};
const DEFAULT_AVATAR = {skinColor:'#d59b76',eyes:'#1d2433',hair:'hair_basic',hairColor:'#171717',top:'shirt_basic',bottom:'pants_basic',shoes:'shoes_basic',accessory:'',effect:'',emote:'emote_wave',title:'title_beginner'};
const DEFAULT_SETTINGS = {music:false,musicVolume:.35,sfx:true,sfxVolume:.7,animations:true,reducedMotion:false,chatWorld:true,chatRoom:true,chatPrivate:true};

const SAVED_PLATFORM = localStorage.getItem('uv_platform_version')===VERSION ? localStorage.getItem('uv_platform') : localStorage.getItem('uv_platform') || null;
const state = {
  user:null, profile:null, token:null, items:[], inventory:[], socket:null, currentView:'lobby', previousView:'lobby',
  currentRoom:null, roomToJoin:null, selectedGameMode:'uno', selectedPrivateUser:null, currentChat:'world', shopMode:'official', inventoryMode:'items',
  solo:null, pendingChallenge:null, pendingSoloCard:null, pendingCard:null, unoTimer:null, muted:false, platform:SAVED_PLATFORM, currentMapTheme:'saloon', actionTimers:new Map(), typingTimer:null, musicTimer:null, globalChatOpen:false, passData:null
};

const Sound = {
  enabled:true, volume:.7, ctx:null,
  init(){try{if(!this.ctx)this.ctx=new (window.AudioContext||window.webkitAudioContext)();if(this.ctx.state==='suspended')this.ctx.resume();}catch{}},
  tone(f,d=.1,type='sine'){if(!this.enabled)return;try{this.init();if(!this.ctx)return;const o=this.ctx.createOscillator(),g=this.ctx.createGain();o.type=type;o.frequency.value=f;g.gain.setValueAtTime(.0001,this.ctx.currentTime);g.gain.exponentialRampToValueAtTime(.04*this.volume,this.ctx.currentTime+.01);g.gain.exponentialRampToValueAtTime(.0001,this.ctx.currentTime+d);o.connect(g);g.connect(this.ctx.destination);o.start();o.stop(this.ctx.currentTime+d);}catch{}},
  click(){this.tone(700,.06)}, ok(){this.tone(650,.12);setTimeout(()=>this.tone(880,.12),80)}, bad(){this.tone(130,.2,'sawtooth')}, card(){this.tone(420,.07,'triangle');setTimeout(()=>this.tone(620,.05,'sine'),35)}, play(){this.tone(520,.06,'triangle');setTimeout(()=>this.tone(760,.08,'square'),45)}, special(){this.tone(260,.08,'sawtooth');setTimeout(()=>this.tone(520,.09,'triangle'),75);setTimeout(()=>this.tone(820,.12,'sine'),145)}, uno(){[740,880,1040,1320].forEach((f,i)=>setTimeout(()=>this.tone(f,.1,'square'),i*55))}, win(){[523,659,784,1046].forEach((f,i)=>setTimeout(()=>this.tone(f,.18),i*90))},
  cardDraw(){this.tone(240,.08,'triangle');setTimeout(()=>this.tone(330,.09,'triangle'),80)},
  emote(){this.tone(760,.06,'sine');setTimeout(()=>this.tone(980,.08,'sine'),65)}
};

function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[m]));}
function fmt(n){return new Intl.NumberFormat('pt-BR').format(Number(n)||0);}
function toast(message,type='info',ms=3000){const box=$('#toastContainer');if(!box)return;const el=document.createElement('div');el.className=`toast ${type}`;el.innerHTML=`<span>${type==='error'?'⚠️':type==='success'?'✓':'ℹ️'}</span><div>${escapeHtml(message).replace(/\n/g,'<br>')}</div>`;box.appendChild(el);setTimeout(()=>el.classList.add('out'),Math.max(300,ms-350));setTimeout(()=>el.remove(),ms);}
function setMsg(id,msg,type='info'){const el=$(id);if(el){el.textContent=msg;el.className=`form-message ${type}`;}}
function show(id){const el=typeof id==='string'?$(id):id;if(el)el.classList.remove('hidden');}
function hide(id){const el=typeof id==='string'?$(id):id;if(el)el.classList.add('hidden');}
function on(id,event,fn){const el=$(id);if(el)el.addEventListener(event,fn);}
function authHeaders(extra={}){return {...extra,...(state.token?{Authorization:`Bearer ${state.token}`}:{})};}
async function api(url,options={}){const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),9000);try{const opts={credentials:'include',signal:controller.signal,...options,headers:authHeaders({'Content-Type':'application/json',...(options.headers||{})})};const res=await fetch(API+url,opts);let data={};try{data=await res.json()}catch{}if(!res.ok)throw Object.assign(new Error(data.message||`Erro ${res.status} de comunicação com o servidor.`),{status:res.status,data});return data}catch(e){if(e.name==='AbortError')throw new Error('O servidor demorou demais. Tente novamente.');throw e}finally{clearTimeout(timeout)}}
// Helpers HTTP usados por login, loja, inventário, salas e painel CEO.
// Mantidos separados do fetch bruto para evitar botões presos e erros de referência.
async function get(url){ return api(url,{method:'GET',headers:{}}); }
async function post(url,body={}){ return api(url,{method:'POST',body:JSON.stringify(body)}); }
async function put(url,body={}){ return api(url,{method:'PUT',body:JSON.stringify(body)}); }
async function del(url,body={}){ return api(url,{method:'DELETE',body:JSON.stringify(body)}); }
// Expondo os helpers também no window evita qualquer falha causada por cache antigo/handlers legados.
window.get=window.get||get; window.post=window.post||post; window.put=window.put||put; window.del=window.del||del;
function defaults(){return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));}
function normalizeProfile(profile){const p=profile||{};p.avatar={...DEFAULT_AVATAR,...(p.avatar||{})};p.settings={...defaults(),...(p.settings||{})};p.bio=p.bio||'';return p;}
function itemName(id){const item=state.items.find(x=>x.id===id);if(item?.name)return item.name;return ({title_beginner:'Iniciante',title_calculator:'Calculista',title_master:'Mestre Matematixa',title_ceo:'CEO'}[id]||id||'Iniciante');}

async function clearOldClientCache(){
  try{if('serviceWorker' in navigator){const regs=await navigator.serviceWorker.getRegistrations();for(const r of regs)await r.unregister();}}catch{}
  try{if('caches' in window){const keys=await caches.keys();for(const k of keys)if(k.toLowerCase().includes('unovelho'))await caches.delete(k);}}catch{}
}

async function init(){
  window.__UV_APP_READY__=true;
  document.documentElement.style.setProperty('--motion',localStorage.getItem('uv_reduced_motion')==='1'?'0':'1');
  bindEvents();
  hide('#bootScreen'); hide('#appScreen'); hide('#authScreen');
  // Sempre mostra a escolha de plataforma ANTES do login.
  applyPlatform(state.platform || (window.matchMedia('(pointer:coarse)').matches?'mobile':'computer'));
  show('#platformScreen');
  const savedToken=localStorage.getItem('uv_token');
  if(savedToken){
    // Não entra automaticamente: primeiro confirma plataforma.
    state.token=savedToken;
  }
}

async function continueAfterPlatform(){
  hide('#platformScreen');
  const savedToken=localStorage.getItem('uv_token');
  if(savedToken){
    state.token=savedToken;
    try{
      const me=await get('/me');
      state.user=me.user;
      state.profile=normalizeProfile(me.profile);
      updateCEOButton();
      await enterApp(false);
      return;
    }catch{
      localStorage.removeItem('uv_token');
      state.token=null; state.user=null; state.profile=null;
    }
  }
  hide('#appScreen'); show('#authScreen'); switchAuth('login');
}

function applyPlatform(platform){
  document.body.dataset.platform=platform||'';
  document.documentElement.dataset.platform=platform||'';
}

async function choosePlatform(platform){
  state.platform=platform;
  localStorage.setItem('uv_platform',platform);localStorage.setItem('uv_platform_version',VERSION);
  applyPlatform(platform);
  Sound.init();
  // No celular, mantenha a partida em tela cheia na orientação atual.
  // O navegador nem sempre permite lock/fullscreen programático antes de um gesto.
  await continueAfterPlatform();
}

async function requestLandscape(){
  try{ if(document.documentElement.requestFullscreen && !document.fullscreenElement) await document.documentElement.requestFullscreen({navigationUI:'hide'}); }catch{}
  try{ if(screen.orientation?.lock) await screen.orientation.lock('landscape'); }catch{}
  updateOrientationGuard();
}
async function forceLandscape(){
  if(state.platform!=='mobile')return;
  try{if(document.documentElement.requestFullscreen&&!document.fullscreenElement)await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch{}
  enterGameViewport();
}

function enterGameViewport(){
  document.body.classList.add('in-game');
  document.body.classList.remove('game-portrait-fallback');
  const gv=$('#gameView');
  if(gv){gv.style.width='100vw';gv.style.height='100dvh';gv.style.maxWidth='none';gv.style.minWidth='100vw';}
  const stage=$('.first-person-stage',gv||document);
  if(stage){stage.style.width='100vw';stage.style.minWidth='100vw';stage.style.maxWidth='none';stage.style.height='100dvh';}
  // O celular usa o viewport inteiro; PC continua naturalmente em paisagem.
  if(state.platform==='mobile') document.documentElement.style.setProperty('--game-vw','100vw');
}

function updateOrientationGuard(){
  // No celular a partida agora ocupa o viewport inteiro na orientação atual.
  // Não exibimos uma camada obrigando rotação: isso era o que deixava a mesa espremida.
  document.body.classList.remove('game-portrait-fallback');
  hide('#orientationGuard');
}

function bindEvents(){
  // Auth
  $$('.auth-tab').forEach(b=>b.addEventListener('click',()=>switchAuth(b.dataset.auth)));
  on('#formLogin','submit',login);on('#formRegister','submit',register);
  on('#btnPlatformMobile','click',()=>choosePlatform('mobile'));
  on('#btnPlatformComputer','click',()=>choosePlatform('computer'));
  on('#orientationGuard','click',()=>forceLandscape());on('#btnForceLandscape','click',()=>forceLandscape());

  // Navegação principal — todos os botões são ligados aqui, sem depender de outros componentes.
  on('#brandHome','click',()=>navigate('lobby'));
  on('#btnPlay','click',()=>navigate('play'));
  on('#btnShop','click',()=>openShop('official'));on('#btnBattlePass','click',openBattlePass);
  on('#btnInventory','click',()=>openInventory('items'));
  on('#btnCustomize','click',openCustomize);
  on('#btnOpenProfile','click',()=>openInventory('items'));
  on('#btnOpenSettings','click',()=>navigate('settings'));on('#btnOpenSettingsRail','click',()=>navigate('settings'));
  on('#btnRankSmall','click',openRank);
  on('#btnSolo','click',()=>{state.soloDifficulty=state.soloDifficulty||'medium';navigate('solo');$$('.difficulty').forEach(x=>x.classList.toggle('active',x.dataset.difficulty===state.soloDifficulty));});
  $$('.solo-mode-card').forEach(b=>b.addEventListener('click',()=>startSoloMode(b.dataset.soloMode,state.soloDifficulty||'medium')));
  $$('.difficulty').forEach(b=>b.addEventListener('click',()=>{state.soloDifficulty=b.dataset.difficulty;$$('.difficulty').forEach(x=>x.classList.toggle('active',x===b));}));
  on('#btnBackModeGame','click',exitModeGame);
  on('#btnOnline','click',()=>{state.selectedGameMode='uno';openOnlineModes();});
  on('#btnRank','click',openRank);
  $$('.online-mode-card').forEach(b=>b.addEventListener('click',()=>selectOnlineMode(b.dataset.onlineMode)));
  on('#btnBackDraw','click',leaveDrawingGame);
  on('#btnDrawClear','click',()=>state.socket?.emit('drawing:clear',{roomCode:state.currentRoom?.code}));
  on('#btnDrawEraser','click',()=>toggleDrawEraser());
  on('#drawGuessForm','submit',e=>{e.preventDefault();const input=$('#drawGuessInput');const text=input?.value.trim();if(!text)return;state.socket?.emit('drawing:guess',{roomCode:state.currentRoom?.code,guess:text});if(input)input.value='';});
  initDrawingCanvas();
  on('#btnRefreshRooms','click',loadRooms);
  on('#btnCreateRoom','click',openCreateRoom);
  on('#btnCreateRoomLobby','click',openCreateRoom);
  on('#btnGlobalChat','click',openGlobalChat);on('#btnGlobalChatOpen','click',openGlobalChat);on('#btnGameGlobalChat','click',openGlobalChat);on('#btnCloseGlobalChat','click',closeGlobalChat);on('#btnCloseGlobalChatLobby','click',closeGlobalChat);on('#globalChatFormLobby','submit',e=>{e.preventDefault();const input=$('#globalChatInputLobby');sendChat(input?.value,'world');if(input)input.value='';});on('#btnClaimAllPass','click',()=>claimPass(true));
  on('#btnOpenProfileMenu','click',()=>openInventory('items'));
  on('#btnMapsPreview','click',openCreateRoom);
  on('#btnConfirmCreateRoom','click',createRoom);
  on('#btnConfirmJoinRoom','click',joinSelectedRoom);
  on('#btnStartRoom','click',()=>{state._onlineIntroShown=false;state._pendingOnlineGame=null;state.socket?.emit('room:start');});
  on('#btnLeaveRoom','click',leaveRoom);
  on('#btnSaveCharacter','click',saveCharacter);on('#btnSaveCharacterTop','click',saveCharacter);on('#btnSaveCharacterModal','click',saveCharacter);
  on('#drawStack','click',drawGameCard);
  on('#btnUno','click',callUno);
  on('#btnBackGame','click',exitGame);
  on('#btnSound','click',toggleMute);
  on('#btnLogout','click',logout);
  on('#btnCEO','click',e=>{e.preventDefault();e.stopPropagation();openCEOPanel();});on('#btnCEOFloat','click',e=>{e.preventDefault();e.stopPropagation();openCEOPanel();});on('#btnCloseCEO','click',()=>hide('#ceoPanel'));on('#ceoFreeze','click',()=>ceoAction('/api/ceo/freeze',{message:$('#ceoMessage')?.value||'Jogo temporariamente paralisado pelo CEO.'}));on('#ceoUnfreeze','click',()=>ceoAction('/api/ceo/unfreeze'));on('#ceoResetPodium','click',()=>ceoAction('/api/ceo/reset-podium'));on('#ceoClearLogins','click',()=>ceoAction('/api/ceo/clear-logins'));on('#ceoSendMessage','click',()=>{const msg=$('#ceoMessage')?.value?.trim();if(msg)ceoAction('/api/ceo/message',{message:msg});});

  $$('.close-modal').forEach(b=>b.addEventListener('click',()=>hide(`#${b.dataset.close}`)));
  $$('.back-btn[data-back]').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.back)));
  $$('.shop-tab').forEach(b=>b.addEventListener('click',()=>openShop(b.dataset.shop)));
  $$('.inventory-tab').forEach(b=>b.addEventListener('click',()=>openInventory(b.dataset.inv)));
  state.currentChat='world';
  $$('.swatch').forEach(b=>b.addEventListener('click',()=>{state.profile.avatar.skinColor=b.dataset.skin;renderCharacter('#customCharacter',state.profile.avatar);if(state.currentView==='customize')renderCustomPage();persistCharacterSilently();}));
  ['setMusic','setMusicVol','setSfx','setSfxVol','setAnimations','setReducedMotion','setWorldChat','setRoomChat','setPrivateChat'].forEach(id=>on('#'+id,'change',saveSettings));
  on('#setMusicVol','input',saveSettings);on('#setSfxVol','input',saveSettings);
  on('#roomChatForm','submit',e=>{e.preventDefault();sendChat($('#roomChatInput')?.value,'room');if($('#roomChatInput'))$('#roomChatInput').value='';});
  on('#gameChatForm','submit',e=>{e.preventDefault();const input=$('#gameChatInput');sendChat(input?.value,'world');if(input){input.value='';state.socket?.emit('chat:typing',{roomCode:state.currentRoom?.code,typing:false});}});
  $$('#emoteTray [data-emote]').forEach(b=>b.addEventListener('click',()=>sendEmote(b.dataset.emote)));
  on('#gameChatInput','input',()=>{state.socket?.emit('chat:typing',{roomCode:state.currentRoom?.code,typing:true});clearTimeout(state.typingTimer);state.typingTimer=setTimeout(()=>state.socket?.emit('chat:typing',{roomCode:state.currentRoom?.code,typing:false}),900);});
  on('#gameChatInput','blur',()=>state.socket?.emit('chat:typing',{roomCode:state.currentRoom?.code,typing:false}));

  // Fallback de clique para o painel CEO: funciona mesmo se o botão foi recriado/atualizado pelo lobby.
  document.addEventListener('click',e=>{
    const ceo=e.target.closest('#btnCEO, #btnCEOFloat');
    if(ceo){ e.preventDefault(); e.stopPropagation(); openCEOPanel(); return; }
    const map=e.target.closest('[data-map]');if(map){openShop('official');return;}
    const join=e.target.closest('[data-join-room]');if(join){selectRoom(join.dataset.joinRoom);return;}
    const buy=e.target.closest('[data-buy-item]');if(buy){buyItem(buy.dataset.buyItem);return;}
    const market=e.target.closest('[data-buy-market]');if(market){buyMarket(market.dataset.buyMarket);return;}
    const custom=e.target.closest('[data-custom-item]');if(custom){equipCustomItem(custom.dataset.customItem,custom.dataset.customSlot);return;}
    const invEquip=e.target.closest('[data-inventory-equip]');if(invEquip){
      const item=state.items.find(x=>x.id===invEquip.dataset.inventoryEquip)||state.inventory.find(x=>x.id===invEquip.dataset.inventoryEquip);
      const slot=item?.category==='hair'?'hair':item?.category==='clothing'?'top':item?.category==='shoes'?'shoes':item?.category==='accessory'?'accessory':item?.category==='effect'?'effect':item?.category==='emote'?'emote':item?.category==='title'?'title':null;
      if(slot) equipCustomItem(invEquip.dataset.inventoryEquip,slot); else toast('Este item não é equipável no personagem.','info'); return;
    }
    const cat=e.target.closest('[data-custom-cat]');if(cat){$$('.custom-cat').forEach(b=>b.classList.toggle('active',b===cat));renderCustomCatalog(cat.dataset.customCat);return;}
    const sell=e.target.closest('[data-sell]');if(sell){sellItem(sell.dataset.sell);return;}const pass=e.target.closest('[data-pass-level]');if(pass){claimPass(false,pass.dataset.passLevel);return;}
    const hand=e.target.closest('#playerHand .hand-card');if(hand){playHandCard(Number(hand.dataset.index));return;}
    const back=e.target.closest('[data-color]');if(back&&$('#colorModal')&&!$('#colorModal').classList.contains('hidden')){chooseColor(back.dataset.color);return;}
  });
}

  window.addEventListener('resize',updateOrientationGuard,{passive:true});
  window.addEventListener('orientationchange',updateOrientationGuard,{passive:true});
  document.addEventListener('fullscreenchange',updateOrientationGuard);

function switchAuth(mode){
  $$('.auth-tab').forEach(b=>b.classList.toggle('active',b.dataset.auth===mode));
  $('#formLogin')?.classList.toggle('hidden',mode!=='login');$('#formRegister')?.classList.toggle('hidden',mode!=='register');
}
async function login(e){
  e.preventDefault();const fd=new FormData(e.currentTarget);const btn=e.submitter;try{if(btn)btn.disabled=true;setMsg('#loginMessage','Entrando...');const d=await post('/login',{username:fd.get('username'),password:fd.get('password')});state.token=d.token||null;if(state.token)localStorage.setItem('uv_token',state.token);state.user=d.user;state.profile=normalizeProfile(d.profile);await enterApp(false);setMsg('#loginMessage','Login realizado!','success');Sound.ok();}catch(err){setMsg('#loginMessage',err.message,'error');Sound.bad();}finally{if(btn)btn.disabled=false;}}
async function register(e){
  e.preventDefault();const fd=new FormData(e.currentTarget);const btn=e.submitter;try{if(btn)btn.disabled=true;setMsg('#registerMessage','Criando conta...');const d=await post('/register',{username:fd.get('regUsername'),password:fd.get('regPassword')});state.token=d.token||null;if(state.token)localStorage.setItem('uv_token',state.token);state.user=d.user;state.profile=normalizeProfile(d.profile);await enterApp(true);Sound.ok();}catch(err){setMsg('#registerMessage',err.message,'error');Sound.bad();}finally{if(btn)btn.disabled=false;}}

async function enterApp(forceCustomize=false){
  hide('#authScreen');show('#appScreen');state.profile=normalizeProfile(state.profile);
  // O login normal também precisa habilitar imediatamente o painel da conta CeoVelho.
  updateCEOButton();
  // Abre o lobby primeiro. Loja, inventário e ranking são carregados em segundo plano.
  updateUserUI();applySettings();renderCharacter('#heroCharacter',state.profile.avatar);renderCharacter('#profileCharacterLarge',state.profile.avatar);renderCharacter('#customCharacter',state.profile.avatar);populateCustomizer();
  renderMapPreview();renderAchievementsPreview();void connectSocket();navigate('lobby');
  void Promise.allSettled([get('/items'),get('/inventory')]).then(([itemsRes,inventoryRes])=>{
    state.items=itemsRes.status==='fulfilled'?(itemsRes.value.items||[]):[];
    state.inventory=inventoryRes.status==='fulfilled'?(inventoryRes.value.items||[]):[];
    updateUserUI();renderCharacter('#heroCharacter',state.profile.avatar);renderCharacter('#profileCharacterLarge',state.profile.avatar);renderCharacter('#customCharacter',state.profile.avatar);populateCustomizer();
  });
  void loadMiniRank();
  if(forceCustomize)setTimeout(openCustomize,0);
}
function updateUserUI(){
  const u=state.user;if(!u)return;const a=state.profile.avatar||DEFAULT_AVATAR;const title=itemName(a.title);
  $$('[id=coinValue], [id=coinValueTop]').forEach(el=>el.textContent=fmt(u.coins));$$('[id=levelValue], [id=levelValueTop]').forEach(el=>el.textContent=u.level||1);$('#heroName')&&( $('#heroName').textContent=u.username);$('#winsValue')&&( $('#winsValue').textContent=u.wins||0);$('#xpValue')&&( $('#xpValue').textContent=fmt(u.xp));
  $('#profileName')&&($('#profileName').textContent=u.username);$('#profileLevel')&&($('#profileLevel').textContent=u.level||1);$('#profileWins')&&($('#profileWins').textContent=u.wins||0);$('#profileGames')&&($('#profileGames').textContent=u.gamesPlayed||0);$('#profileTitle')&&($('#profileTitle').textContent=title.toUpperCase());$('#customNamePreview')&&($('#customNamePreview').textContent=u.username);$('#customTitlePreview')&&($('#customTitlePreview').textContent=title.toUpperCase());$('#accountInfo')&&($('#accountInfo').innerHTML=`<b>${escapeHtml(u.username)}</b><br>Cargo: ${escapeHtml(u.role||'user')}<br>🪙 ${fmt(u.coins)} • ⭐ ${fmt(u.xp)} XP`);
  const level=Math.max(1,Number(u.level)||1),base=xpLevel(level),next=xpLevel(level+1);const pct=Math.max(0,Math.min(100,((Number(u.xp)||0)-base)/Math.max(1,next-base)*100));$('#xpBar')&&($('#xpBar').style.width=pct+'%');
}
function xpLevel(level){return Math.floor(100*Math.pow(Math.max(0,level-1),1.45));}

function navigate(view){
  if(!state.user)return;
  const target=$(`#${view}View`);if(!target){toast(`Tela "${view}" não encontrada.`,'error');return;}
  $$('.view').forEach(v=>v.classList.add('hidden'));target.classList.remove('hidden');state.previousView=state.currentView;state.currentView=view;
  document.body.classList.toggle('in-game',view==='game');
  if(view==='game'){ enterGameViewport(); } else { document.body.classList.remove('game-portrait-fallback'); }
  updateOrientationGuard();
  window.scrollTo({top:0,behavior:'smooth'});
  if(view==='lobby'){renderCharacter('#heroCharacter',state.profile.avatar);loadMiniRank();}
  if(view==='settings')applySettings();
}

let socketLoaderPromise=null;
function loadSocketIO(){
  if(window.io)return Promise.resolve(true);
  if(socketLoaderPromise)return socketLoaderPromise;
  socketLoaderPromise=new Promise(resolve=>{
    const script=document.createElement('script');
    let done=false;
    const finish=ok=>{if(done)return;done=true;clearTimeout(timer);resolve(ok);};
    const timer=setTimeout(()=>finish(false),4500);
    script.src='/socket.io/socket.io.js';
    script.async=true;
    script.onload=()=>finish(!!window.io);
    script.onerror=()=>finish(false);
    document.head.appendChild(script);
  });
  return socketLoaderPromise;
}
async function connectSocket(){
  if(!state.token||state.socket?.connected)return;
  const loaded=await loadSocketIO();
  if(!loaded||!window.io)return;
  try{state.socket=window.io({withCredentials:true,auth:{token:state.token},transports:['websocket','polling']});}catch(e){toast('Não foi possível iniciar o multiplayer.','error');return;}
  state.socket.on('connect',()=>{});state.socket.on('connect_error',e=>toast('Multiplayer indisponível: '+(e.message||'erro'),'error',3500));
  state.socket.on('rooms:update',()=>{if(state.currentView==='rooms')loadRooms();});
  state.socket.on('room:joined',room=>{state.currentRoom=room;renderRoom(room);navigate('room');if(room.started&&room.options?.gameMode==='draw')navigate('draw');else if(room.started&&['truco','checkers','chess'].includes(room.options?.gameMode))navigate('modeGameView');});
  state.socket.on('room:update',room=>{if(state.currentRoom?.code===room.code){state.currentRoom=room;renderRoom(room);if(room.started&&room.options?.gameMode==='draw')navigate('draw');else if(room.started&&['truco','checkers','chess'].includes(room.options?.gameMode))navigate('modeGameView');}});
  state.socket.on('room:countdown',m=>{if(Number(m?.seconds)!==5||gameIntroBusy)return;state._onlineIntroShown=true;showGameIntro(()=>{if(state._pendingOnlineGame){const g=state._pendingOnlineGame;state._pendingOnlineGame=null;renderOnlineGame(g);}}, {online:true});});state.socket.on('room:system',m=>toast(m.message));state.socket.on('room:closed',m=>{toast(m.message,'error');state.currentRoom=null;navigate('rooms');});
  state.socket.on('toast',m=>toast(m.message,m.type||'info'));state.socket.on('chat:message',renderChatMessage);state.socket.on('chat:typing',renderTypingIndicator);state.socket.on('game:chatAction',handleChatAction);
  state.socket.on('game:action',handleGameAction);state.socket.on('game:uno',m=>{Sound.ok();toast(`📣 ${m.username} GRITOU UNO!`,'success',1800);});state.socket.on('game:emote',handleGameEmote);
  state.socket.on('game:countdown',m=>{if(Number(m?.seconds)===5&&!gameIntroBusy){state._onlineIntroShown=true;showGameIntro(()=>{if(state._pendingOnlineGame){const g=state._pendingOnlineGame;state._pendingOnlineGame=null;renderOnlineGame(g);}}, {online:true});}});state.socket.on('game:state',game=>{state._pendingOnlineGame=game;if(gameIntroBusy)return;if(state._onlineIntroShown){state._pendingOnlineGame=null;renderOnlineGame(game);return;}state._onlineIntroShown=true;showGameIntro(()=>{const g=state._pendingOnlineGame||game;state._pendingOnlineGame=null;renderOnlineGame(g);},{online:true});});state.socket.on('mode:state',renderModeGameState);
  state.socket.on('drawing:state',renderDrawingState);
  state.socket.on('drawing:stroke',receiveDrawingStroke);
  state.socket.on('drawing:clear',clearDrawingCanvas);
  state.socket.on('drawing:reveal',renderDrawingReveal);
  state.socket.on('drawing:guess',renderDrawingGuess);
  state.socket.on('drawing:turn',renderDrawingTurn);
  state.socket.on('drawing:round',renderDrawingRound);
  state.socket.on('game:winner',m=>{Sound.win();toast(`🏆 ${m.username} venceu!`,'success',5000);});
  state.socket.on('global:pause',m=>{show('#globalPauseBanner');if($('#globalPauseBanner'))$('#globalPauseBanner').textContent='⏸ '+m.message;});state.socket.on('global:resume',()=>hide('#globalPauseBanner'));
  state.socket.on('admin:announcement',m=>toast(`📢 ${m.by}: ${m.message}`,'success',6000));state.socket.on('admin:result',m=>toast(m.message,m.ok?'success':'error',5000));
  state.socket.on('admin:kick',m=>{toast(m.message,'error');state.currentRoom=null;navigate('lobby');});
}

function renderMapPreview(){const el=$('#mapPreview');if(!el)return;el.innerHTML=MAPS.slice(0,4).map(m=>`<button class="map-tile map-${m.theme}" data-map="${m.id}" type="button"><b>${escapeHtml(m.name)}</b></button>`).join('');}
async function loadMiniRank(){const el=$('#miniRank');if(!el)return;try{const d=await get('/rank');el.innerHTML=(d.players||[]).slice(0,5).map((p,i)=>`<div class="rank-mini-row"><span>${i+1}</span><b>${escapeHtml(p.username)}</b><small>Nível ${p.level} • ${fmt(p.wins)} vit.</small></div>`).join('')||'<p class="muted">Ranking ainda vazio.</p>';}catch{el.innerHTML='<p class="muted">Ranking indisponível.</p>';}}
function renderAchievementsPreview(){const el=$('#achievementPreview');if(!el)return;el.innerHTML=[['🏆','Primeira Vitória'],['🧠','Mente Matemática'],['🌎','Primeiro Online'],['🎒','Colecionador']].map(a=>`<div class="achievement-chip"><span>${a[0]}</span><b>${a[1]}</b></div>`).join('');}

const GAME_MODES={uno:{label:'UNO',name:'UNO Velho Matematixa',icon:'🃏'},draw:{label:'GARTIC',name:'Adivinha o Desenho',icon:'🎨'},truco:{label:'TRUCO',name:'Truco do Velho',icon:'🂡'},checkers:{label:'DAMAS',name:'Damas de Botecão',icon:'⚫'},chess:{label:'XADREZ',name:'Xadrez do Bar',icon:'♟️'}};
function openOnlineModes(){state.selectedGameMode='uno';navigate('onlineModeView');}
function selectOnlineMode(mode){state.selectedGameMode='uno';navigate('rooms');renderRoomsHeader();loadRooms();}
function renderRoomsHeader(){const m=GAME_MODES[state.selectedGameMode]||GAME_MODES.uno;if($('#roomsHeading'))$('#roomsHeading').textContent=`SALAS DE ${m.label}`;if($('#roomsModeSubtitle'))$('#roomsModeSubtitle').textContent=`${m.icon} ${m.name} • escolha uma mesa ou crie a sua.`;}
function openCreateRoom(){if(!state.socket)connectSocket();populateRoomMaps();if($('#roomGameMode'))$('#roomGameMode').value=state.selectedGameMode||'uno';show('#createRoomModal');}
function populateRoomMaps(){const el=$('#roomMap');if(!el)return;el.innerHTML=MAPS.filter(m=>m.id!=='map_ceo'||state.user?.role==='CEO').map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');}
async function openRooms(){state.selectedGameMode=state.selectedGameMode||'uno';navigate('rooms');renderRoomsHeader();await loadRooms();}
async function loadRooms(){const el=$('#roomsList');if(!el)return;try{const d=await get('/rooms?mode='+encodeURIComponent(state.selectedGameMode||'uno'));const rooms=d.rooms||[];const mode=GAME_MODES[state.selectedGameMode]||GAME_MODES.uno;el.innerHTML=rooms.length?rooms.map(r=>`<article class="room-card glass"><div class="room-cover map-${mapTheme(r.options?.mapId)}">${r.locked?'🔒':mode.icon}</div><div class="room-card-body"><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.ownerName)} • ${r.players.length}/${r.options.maxPlayers}</small></div><div class="room-tags"><span>${escapeHtml(mode.label)}</span><span>${r.locked?'COM SENHA':'ABERTA'}</span><span>${r.options.turnSeconds}s</span></div><button class="btn btn-primary btn-wide" data-join-room="${r.code}" type="button">${r.locked?'🔒 ENTRAR':'ENTRAR'}</button></div></article>`).join(''):`<div class="empty-state glass"><span>${mode.icon}</span><b>Nenhuma sala de ${escapeHtml(mode.label)} aberta.</b><small>Crie a primeira mesa desse modo.</small></div>`;}catch(e){el.innerHTML=`<div class="empty-state glass"><span>⚠️</span><b>Não foi possível carregar as salas.</b><small>${escapeHtml(e.message)}</small></div>`;}}
function mapTheme(id){return MAPS.find(m=>m.id===id)?.theme||'classroom';}
async function selectRoom(code){try{const d=await get('/rooms?mode='+encodeURIComponent(state.selectedGameMode||'uno'));const room=(d.rooms||[]).find(r=>r.code===code);if(!room)return toast('Sala não encontrada.','error');state.roomToJoin=room;$('#joinRoomInfo')&&($('#joinRoomInfo').innerHTML=`<b>${escapeHtml(room.name)}</b><br>${escapeHtml(room.ownerName)} • ${room.players.length}/${room.options.maxPlayers} • ${room.locked?'🔒 Com senha':'🌎 Aberta'}`);if($('#joinRoomPassword'))$('#joinRoomPassword').value='';show('#joinRoomModal');}catch(e){toast(e.message,'error');}}
function joinSelectedRoom(){const r=state.roomToJoin;if(!r)return;if(!state.socket)connectSocket();state.socket?.emit('room:join',{code:r.code,password:$('#joinRoomPassword')?.value||''});hide('#joinRoomModal');}
async function createRoom(){try{const body={name:$('#roomName')?.value||`Mesa de ${state.user.username}`,password:$('#roomPassword')?.value||'',gameMode:'uno',maxPlayers:Number($('#roomMax')?.value||4),turnSeconds:Number($('#roomTime')?.value||45),difficulty:$('#roomDifficulty')?.value||'medium',botFill:Number($('#roomBots')?.value||4),mapId:$('#roomMap')?.value||'map_saloon',startingCards:Number($('#roomCards')?.value||7),allowBots:$('#roomAllowBots')?.checked!==false,specials:$('#roomSpecials')?.checked!==false,stackDraw:$('#roomStack')?.checked===true,chat:$('#roomChat')?.checked!==false};if(body.gameMode==='draw')body.turnSeconds=Math.max(30,Number(body.turnSeconds)||45);state.selectedGameMode=body.gameMode;const d=await post('/rooms',body);hide('#createRoomModal');if(!state.socket)connectSocket();state.socket?.emit('room:join',{code:d.roomCode,password:body.password});}catch(e){toast(e.message,'error');}}
function leaveDrawingGame(){
  if(state.socket&&state.currentRoom)state.socket.emit('room:leave');
  state.currentRoom=null;state._drawingGame=null;stopDrawingTimer();if(drawSnapshotTimer)clearInterval(drawSnapshotTimer);drawSnapshotTimer=null;clearDrawingCanvas();navigate('lobby');
}
function renderRoom(room){
  if(!room)return;$('#roomTitle')&&($('#roomTitle').textContent=room.name);$('#roomCodeBadge')&&($('#roomCodeBadge').textContent=room.code);$('#roomOptionsText')&&($('#roomOptionsText').textContent=`${GAME_MODES[room.options?.gameMode]?.icon||'🎮'} ${GAME_MODES[room.options?.gameMode]?.label||'JOGO'} • ${room.players.length}/${room.options.maxPlayers} jogadores • ${room.options.turnSeconds}s`);if($('#btnStartRoom'))$('#btnStartRoom').style.display=String(room.ownerId)===String(state.user.id)&&!room.started?'inline-flex':'none';
  const list=$('#roomPlayers');if(list)list.innerHTML=room.players.map(p=>`<div class="room-player ${String(p.userId)===String(room.ownerId)?'host':''}"><div class="player-avatar">${p.isBot?'🤖':'🙂'}</div><div><b>${escapeHtml(p.username)}</b><small>${String(p.userId)===String(room.ownerId)?'👑 Criador':'Jogador'}</small></div><span>${p.connected?'●':'○'}</span></div>`).join('');
  const banner=$('#roomMapBanner');if(banner){banner.className=`room-map-banner map-${mapTheme(room.options.mapId)}`;banner.innerHTML=`<div><span>🗺️ MAPA</span><b>${escapeHtml(MAPS.find(m=>m.id===room.options.mapId)?.name||room.options.mapId)}</b></div>`;}
}
function leaveRoom(){state.socket?.emit('room:leave');state.currentRoom=null;navigate('rooms');renderRoomsHeader();loadRooms();}

// ---------------- INÍCIO DE PARTIDA ----------------
let gameIntroBusy=false;
function playCountdownSound(kind='tick'){
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    const ac=window.__unoAudio||(window.__unoAudio=new AC());if(ac.state==='suspended')ac.resume().catch(()=>{});
    const o=ac.createOscillator(),g=ac.createGain();o.type=kind==='go'?'square':'sine';o.frequency.value=kind==='go'?740:420;
    g.gain.setValueAtTime(.0001,ac.currentTime);g.gain.exponentialRampToValueAtTime(kind==='go'?.08:.045,ac.currentTime+.015);g.gain.exponentialRampToValueAtTime(.0001,ac.currentTime+.16);
    o.connect(g);g.connect(ac.destination);o.start();o.stop(ac.currentTime+.18);
  }catch{}
}
function showGameIntro(onDone,opts={}){
  if(gameIntroBusy){onDone?.();return;}
  gameIntroBusy=true;
  const overlay=$('#gameStartOverlay');if(!overlay){gameIntroBusy=false;onDone?.();return;}
  overlay.classList.remove('hidden');overlay.innerHTML=`<div class="game-start-card"><div class="game-start-kicker">${opts.online?'🌎 PARTIDA ONLINE':'🤖 PARTIDA SOLO'}</div><div id="gameStartNumber" class="game-start-number">5</div><div class="game-start-label">PREPARE A MESA!</div><div id="gameStartDeck" class="game-start-deck" aria-hidden="true">${Array.from({length:10},(_,i)=>`<span style="--d:${i}">${['7','+2','3','🌈','9','0','+4','5','↻','2'][i]}</span>`).join('')}</div></div>`;
  const n=$('#gameStartNumber');let value=5;playCountdownSound();
  const timer=setInterval(()=>{
    value--;
    if(value>0){n.textContent=String(value);n.classList.remove('pulse');void n.offsetWidth;n.classList.add('pulse');playCountdownSound();return;}
    clearInterval(timer);n.textContent='GO!';n.classList.add('go');playCountdownSound('go');
    overlay.classList.add('dealing');
    setTimeout(()=>{overlay.classList.add('hidden');overlay.classList.remove('dealing');gameIntroBusy=false;onDone?.();},1250);
  },900);
}
function startSoloIntroAndGame(g,difficulty){
  navigate('game');$('#arenaShell')?.classList.add('solo-arena');
  showGameIntro(()=>{state.solo=g;renderSolo();Sound.card();toast(`Modo ${difficulty==='easy'?'Fácil':difficulty==='medium'?'Médio':'Difícil'} iniciado.`,'success');},{online:false});
}

// ---------------- SOLO ----------------
function makeDeck(){const d=[];for(const color of COLORS){for(let n=0;n<=9;n++)d.push({id:crypto.randomUUID(),color,value:String(n),type:'number'});d.push({id:crypto.randomUUID(),color,value:'🚫',type:'skip'});d.push({id:crypto.randomUUID(),color,value:'🔄',type:'reverse'});d.push({id:crypto.randomUUID(),color,value:'+2',type:'draw2'});}for(let i=0;i<4;i++){d.push({id:crypto.randomUUID(),color:'black',value:'🌈',type:'wild'});d.push({id:crypto.randomUUID(),color:'black',value:'+4',type:'draw4'});}for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
function playable(card,top,color){return !!card&&(card.color==='black'||card.color===color||card.value===top?.value);}
let soloMode='uno';
function startSoloMode(mode,difficulty='medium'){
  state.soloDifficulty=difficulty;
  if(mode==='uno'){ startSolo(difficulty); return; }
  if(mode==='draw'){ startLocalDrawGame(difficulty); return; }
  startTableSolo(mode,difficulty);
}
function startLocalDrawGame(difficulty){state._localDraw={mode:'draw',difficulty,round:1,score:0,word:['cachorro','avião','pizza','violão','robô','sorvete'][Math.floor(Math.random()*6)],drawing:false};navigate('modeGameView');renderLocalDraw();}
function startTableSolo(mode,difficulty){state._tableSolo={mode,difficulty,turn:'player',selected:null,botName:mode==='truco'?'Truquinho':mode==='checkers'?'Daminha': 'Xadrezinho',message:'Começou! Faça sua jogada.'};navigate('modeGameView');renderTableSolo();}
function exitModeGame(){state._tableSolo=null;state._localDraw=null;navigate(state.currentRoom?'room':'solo');}
function renderLocalDraw(){const g=state._localDraw;if(!g)return;$('#modeGameBadge').textContent='🎨 GARTIC SOLO';$('#modeGameTitle').textContent='Adivinha o Desenho';$('#modeGameTurn').textContent='VOCÊ DESENHA';$('#modeGameMessage').textContent=`Palavra secreta: ${g.word} • desenhe e depois clique em REVELAR.`;$('#modeGameBody').innerHTML=`<div class="local-draw-board glass"><div class="local-draw-toolbar"><span>🎨 Quadro</span><button id="localReveal" class="btn btn-primary">REVELAR</button><button id="localClear" class="btn btn-secondary">LIMPAR</button></div><canvas id="localDrawCanvas" width="1000" height="560"></canvas><div id="localDrawReveal" class="local-reveal hidden"></div></div>`;const c=$('#localDrawCanvas'),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);let down=false;const pos=e=>{const r=c.getBoundingClientRect();const p=e.touches?.[0]||e;return{x:(p.clientX-r.left)*c.width/r.width,y:(p.clientY-r.top)*c.height/r.height}};const start=e=>{down=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};const move=e=>{if(!down)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.strokeStyle='#111827';ctx.lineWidth=9;ctx.lineCap='round';ctx.stroke()};['mousedown','touchstart'].forEach(x=>c.addEventListener(x,start,{passive:true}));['mousemove','touchmove'].forEach(x=>c.addEventListener(x,move,{passive:true}));['mouseup','mouseleave','touchend'].forEach(x=>c.addEventListener(x,()=>down=false));on('#localClear','click',()=>{ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height)});on('#localReveal','click',()=>{const r=$('#localDrawReveal');r.classList.remove('hidden');r.textContent=`🔎 Era: ${g.word}`;g.round++;setTimeout(()=>{g.word=['cachorro','avião','pizza','violão','robô','sorvete'][Math.floor(Math.random()*6)];renderLocalDraw()},1800)});}
function renderTableSolo(){const g=state._tableSolo;if(!g)return;const labels={truco:['🂡 TRUCO','Truco do Velho'],checkers:['⚫ DAMAS','Damas de Botecão'],chess:['♟️ XADREZ','Xadrez do Bar']};$('#modeGameBadge').textContent=labels[g.mode][0];$('#modeGameTitle').textContent=labels[g.mode][1];$('#modeGameTurn').textContent=g.turn==='player'?'SUA VEZ':'BOT PENSANDO';$('#modeGameMessage').textContent=g.message;const body=$('#modeGameBody');if(g.mode==='truco'){body.innerHTML=`<div class="truco-solo-board glass"><div class="table-opponent"><div class="solo-code-character">🤠</div><b>${g.botName}</b><small>Bot • ${g.difficulty}</small></div><div class="truco-center">🃏<strong>TRUCO!</strong><small>Rodada ${Math.floor(Math.random()*3)+1}</small></div><div class="truco-hand">${['A♥','K♣','7♦'].map((x,i)=>`<button class="playing-card-mini" data-card="${i}">${x}</button>`).join('')}</div><button id="callTruco" class="btn btn-primary">TRUCO!</button></div>`;$$('[data-card]').forEach(b=>b.onclick=()=>{g.message=`Você jogou ${b.textContent}. O bot está pensando...`;g.turn='bot';renderTableSolo();setTimeout(()=>{g.turn='player';g.message='Sua vez!';renderTableSolo()},3000)});on('#callTruco','click',()=>{g.message='VOCÊ GRITOU TRUCO! O bot está decidindo...';g.turn='bot';renderTableSolo();setTimeout(()=>{g.turn='player';g.message=Math.random()>.35?'O bot aceitou! Sua vez.':'O bot correu! Você ganhou a mão.';renderTableSolo()},3000)});return;}const pieces=g.mode==='chess'?['♜','♞','♝','♛','♚','♝','♞','♜']:['⚫','⚫','⚫','⚫','⚫','⚫','⚫','⚫'];body.innerHTML=`<div class="board-solo glass"><div class="board-grid ${g.mode}">${Array.from({length:64},(_,i)=>`<button class="board-cell ${((Math.floor(i/8)+i)%2?'dark':'light')}" data-cell="${i}">${g.mode==='chess'&&i<8?pieces[i]:g.mode==='chess'&&i>=48?['♜','♞','♝','♛','♚','♝','♞','♜'][i-48]:g.mode==='checkers'&&(Math.floor(i/8)<3||Math.floor(i/8)>4)&&((Math.floor(i/8)+i)%2)?'⚫':''}</button>`).join('')}</div></div>`;$$('.board-cell').forEach(b=>b.onclick=()=>{g.message=`Jogada em ${Number(b.dataset.cell)+1}. O bot pensa por alguns segundos...`;g.turn='bot';renderTableSolo();setTimeout(()=>{g.turn='player';g.message='Sua vez! Escolha outra casa.';renderTableSolo()},2500)});}
async function startSolo(difficulty){
  try {
    const g=makeSolo(difficulty);
    state.solo=null;
    state._onlineGame=null;
    state._tableSolo=null;
    state._localDraw=null;
    startSoloIntroAndGame(g,difficulty);
  } catch(e) {
    console.error('Erro ao iniciar UNO solo:',e);
    state.solo=null;
    toast('Não foi possível iniciar o UNO. Tente novamente.','error',4500);
  }
}
function makeSolo(difficulty){const deck=makeDeck(),player=[],bot=[];for(let i=0;i<7;i++){player.push(deck.pop());bot.push(deck.pop());}let top=deck.pop();while(top.color==='black'){deck.unshift(top);top=deck.pop();}return{difficulty,deck,player,bot,discard:top,pile:[],color:top.color,pendingDraw:0,turn:'player',botName:difficulty==='hard'?'Calculinho Supremo':difficulty==='medium'?'Calculinho':'Treininho'};}
function renderSolo(){const g=state.solo;if(!g)return;$('#roundText')&&($('#roundText').textContent='SOLO');$('#turnStatus')&&($('#turnStatus').textContent=g.turn==='player'?'SUA VEZ!':'VEZ DO BOT');$('#turnStatus')?.classList.toggle('bot',g.turn!=='player');renderArenaCard(g.discard,g.color);$('#deckCount')&&($('#deckCount').textContent=g.deck.length);$('#opponents')&&($('#opponents').innerHTML=`<div class="opponent-seat player-seat seat-0 solo-bot" data-player-id="bot"><div class="player-emote" data-emote-for="bot"></div><div class="player-character">${characterMarkup(DEFAULT_AVATAR,g.botName)}</div><div class="player-nameplate"><b>${escapeHtml(g.botName)}</b><small>${g.bot.length} cartas</small></div><div class="mini-hand">${Array.from({length:Math.min(7,g.bot.length)},()=>'<span class="back-mini">UNO</span>').join('')}</div></div>`);const hand=$('#playerHand');if(hand){const cards=Array.isArray(g.player)?g.player:[];hand.innerHTML=cards.length?cards.map((c,i)=>cardHtml(c,i,cards.length)).join(''):'<div class="hand-empty">AGUARDE SUAS CARTAS...</div>';bindRenderedHand();}updateUnoButton(!!(g.player.length===1&&g.unoDeadline&&Date.now()<g.unoDeadline),g.unoDeadline);if(g.player.length!==1)clearUnoTimer();}
function renderArenaCard(card,color){if($('#discardPile')){$('#discardPile').className=`uno-card card-${color} big-card`;$('#discardPile').textContent=card?.value||'?';}if($('#colorIndicator'))$('#colorIndicator').textContent=COLOR_NAME[color]||color||'';}
function cardHtml(c,i,n=7){const center=(n-1)/2;const delta=i-center;const rot=(delta*5).toFixed(2);const lift=Math.min(12,Math.abs(delta)*2).toFixed(1);return `<button class="uno-card card-${c.color} hand-card" data-index="${i}" style="--rot:${rot}deg;--lift:${lift}px;--z:${20+i};--i:${i}" type="button" aria-label="Jogar carta ${escapeHtml(c.value)}"><i>${escapeHtml(c.value)}</i><span>${escapeHtml(c.value)}</span><em>${c.type==='number'?'UNO':c.type.toUpperCase()}</em></button>`;}
function bindRenderedHand(){const hand=$('#playerHand');if(!hand)return;hand.querySelectorAll('.hand-card').forEach((el)=>{el.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();const index=Number(el.dataset.index);if(Number.isInteger(index))playHandCard(index);};});}
function playHandCard(index){if(state.solo)return playSoloCardAt(index);if(state.currentRoom)return playOnlineCardAt(index);}
function playSoloCardAt(index){const g=state.solo;if(!g||g.turn!=='player')return;const card=g.player[index];if(!playable(card,g.discard,g.color))return toast('Essa carta não combina com a mesa.','error');if(card.color==='black'){state.pendingSoloCard={card};show('#colorModal');return;}applySoloCard(card);}
function applySoloCard(card,chosenColor){const g=state.solo;const i=g.player.findIndex(x=>x.id===card.id);if(i<0)return;g.player.splice(i,1);g.pile.push(g.discard);g.discard=card;g.pendingDraw=card.type==='draw2'?2:card.type==='draw4'?4:0;g.color=card.color==='black'?(COLORS.includes(chosenColor)?chosenColor:COLORS[Math.floor(Math.random()*4)]):card.color;Sound.card();if(card.type==='draw2')drawSolo(g.bot,2);if(card.type==='draw4')drawSolo(g.bot,4);Sound.play();if(['draw2','draw4','wild','skip','reverse'].includes(card.type))Sound.special();if(g.player.length===0)return finishSolo(true);if(g.player.length===1){g.unoDeadline=Date.now()+3200;}if(card.type==='skip'||card.type==='reverse'){g.turn='bot';renderSolo();setTimeout(botTurn,3000+Math.floor(Math.random()*7001));return;}g.turn='bot';renderSolo();setTimeout(botTurn,3000+Math.floor(Math.random()*7001));}
function drawSolo(hand,n){const g=state.solo;for(let i=0;i<n;i++){if(!g.deck.length){if(g.pile.length){g.deck=g.pile.splice(0);for(let j=g.deck.length-1;j>0;j--){const k=Math.floor(Math.random()*(j+1));[g.deck[j],g.deck[k]]=[g.deck[k],g.deck[j]];}}}if(g.deck.length)hand.push(g.deck.pop());}}
function soloDraw(){const g=state.solo;if(!g||g.turn!=='player')return;const count=g.pendingDraw||1;drawSolo(g.player,count);g.pendingDraw=0;Sound.cardDraw();const drawn=g.player[g.player.length-1];if(count===1&&drawn&&playable(drawn,g.discard,g.color)){g.message='Você comprou uma carta jogável. Escolha se quer jogar.';renderSolo();return;}g.turn='bot';renderSolo();setTimeout(botTurn,3000+Math.floor(Math.random()*7001));}
function botTurn(){
  const g=state.solo;if(!g||g.turn!=='bot')return;
  const delay=g.difficulty==='easy'?3000+Math.floor(Math.random()*7001):g.difficulty==='hard'?3000+Math.floor(Math.random()*5001):3000+Math.floor(Math.random()*7001);
  toast(`🤔 ${g.botName} está pensando...`,'info',Math.min(2200,delay-200));
  setTimeout(()=>{
    if(!state.solo||state.solo!==g||g.turn!=='bot')return;
    let cards=g.bot.filter(c=>playable(c,g.discard,g.color));if(g.pendingDraw>0)cards=[];let card=null;
    if(g.difficulty==='easy')card=cards[Math.floor(Math.random()*cards.length)]||null;
    else if(g.difficulty==='hard')card=cards.sort((a,b)=>botScore(g,b)-botScore(g,a))[0]||null;
    else card=cards.sort((a,b)=>cardScore(b)-cardScore(a))[0]||null;
    if(!card){drawSolo(g.bot,g.pendingDraw||1);g.pendingDraw=0;g.turn='player';Sound.cardDraw();renderSolo();return;}
    g.bot.splice(g.bot.indexOf(card),1);g.pile.push(g.discard);g.discard=card;g.pendingDraw=card.type==='draw2'?2:card.type==='draw4'?4:0;g.color=card.color==='black'?chooseColorBot(g.bot):card.color;
    g.pendingDraw=card.type==='draw2'?2:card.type==='draw4'?4:0;
    if(card.type==='draw2')drawSolo(g.player,2);if(card.type==='draw4')drawSolo(g.player,4);
    Sound.play();if(['draw2','draw4','wild','skip','reverse'].includes(card.type))Sound.special();
    if(g.bot.length===0)return finishSolo(false);if(g.bot.length===1){toast(`📣 ${g.botName} gritou UNO!`,'success',1800);Sound.uno();}
    g.turn='player';renderSolo();
  },delay);
}
function cardScore(c){return c.type==='draw4'?100:c.type==='draw2'?80:c.type==='wild'?70:c.type==='skip'?50:c.type==='reverse'?40:Number(c.value)||0;}
function botScore(g,c){let n=cardScore(c);if(c.color===g.color)n+=20;if(g.player.length<=3&&c.type!=='number')n+=25;return n;}
function chooseColorBot(hand){const count={red:0,yellow:0,green:0,blue:0};hand.forEach(c=>{if(count[c.color]!=null)count[c.color]++;});return Object.entries(count).sort((a,b)=>b[1]-a[1])[0][0];}
async function finishSolo(win){const g=state.solo;if(!g)return;Sound.win();const coins=win?100:15,xp=win?180:50;toast(win?`🏆 Vitória! +${coins} moedas e +${xp} XP.`:`Partida encerrada. +${coins} moedas e +${xp} XP.`,win?'success':'info',5000);try{const d=await post('/game/solo-finish',{win,coins,xp,difficulty:g.difficulty});if(d.user){state.user=d.user;updateUserUI();}}catch{}setTimeout(()=>{state.solo=null;navigate('lobby');},1000);}

// ---------------- ADIVINHA O DESENHO ----------------
const DRAW_COLORS=['#111827','#ef4444','#f59e0b','#22c55e','#3b82f6','#8b5cf6','#ec4899','#ffffff'];
let drawCtx=null,projectorCtx=null,drawPainting=false,drawLast=null,drawColor='#111827',drawEraser=false,drawTimerHandle=null,drawSnapshotTimer=null;
function initDrawingCanvas(){
  const canvas=$('#drawCanvas');if(!canvas)return;
  drawCtx=canvas.getContext('2d');drawCtx.lineCap='round';drawCtx.lineJoin='round';const pc=$('#projectorCanvas');projectorCtx=pc?.getContext('2d');if(projectorCtx){projectorCtx.lineCap='round';projectorCtx.lineJoin='round';}clearDrawingCanvas();startDrawingSnapshotTimer();
  const point=e=>{const r=canvas.getBoundingClientRect();return{x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height)}};
  const start=e=>{if(!state._drawingGame?.isDrawer)return;drawPainting=true;drawLast=point(e);drawSegment(drawLast,drawLast,true);canvas.setPointerCapture?.(e.pointerId);};
  const move=e=>{if(!drawPainting||!state._drawingGame?.isDrawer)return;const p=point(e);drawSegment(drawLast,p,false);drawLast=p;};
  const end=e=>{drawPainting=false;drawLast=null;try{canvas.releasePointerCapture?.(e.pointerId)}catch{}};
  canvas.addEventListener('pointerdown',start);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);canvas.addEventListener('pointerleave',()=>{if(drawPainting)drawPainting=false;});
  const palette=$('#drawPalette');if(palette)palette.innerHTML=DRAW_COLORS.map(c=>`<button type="button" class="draw-color ${c===drawColor?'active':''}" data-draw-color="${c}" style="--c:${c}"></button>`).join('');
  palette?.addEventListener('click',e=>{const b=e.target.closest('[data-draw-color]');if(!b)return;drawColor=b.dataset.drawColor;drawEraser=false;$('#btnDrawEraser')?.classList.remove('active');$$('.draw-color').forEach(x=>x.classList.toggle('active',x===b));});
  on('#drawBrush','input',()=>{});
}
function drawSegment(a,b,emit=true){if(!drawCtx)return;const size=Number($('#drawBrush')?.value||7);drawCtx.strokeStyle=drawEraser?'#ffffff':drawColor;drawCtx.lineWidth=size;drawCtx.beginPath();drawCtx.moveTo(a.x,a.y);drawCtx.lineTo(b.x,b.y);drawCtx.stroke();if(emit&&state.socket&&state.currentRoom){state.socket.emit('drawing:stroke',{roomCode:state.currentRoom.code,x1:a.x,y1:a.y,x2:b.x,y2:b.y,color:drawColor,size,erase:drawEraser});}}
function receiveDrawingStroke(d){const draw=(ctx)=>{if(!ctx)return;const old=ctx.strokeStyle,ow=ctx.lineWidth;ctx.strokeStyle=d.erase?'#ffffff':d.color;ctx.lineWidth=Number(d.size)||7;ctx.beginPath();ctx.moveTo(Number(d.x1),Number(d.y1));ctx.lineTo(Number(d.x2),Number(d.y2));ctx.stroke();ctx.strokeStyle=old;ctx.lineWidth=ow;};draw(drawCtx);draw(projectorCtx);$('#projectorEmpty')?.classList.add('hidden');}
function clearDrawingCanvas(){for(const ctx of [drawCtx,projectorCtx]){if(!ctx)continue;ctx.save();ctx.fillStyle='#ffffff';ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);ctx.restore();}$('#projectorEmpty')?.classList.remove('hidden');}
function toggleDrawEraser(){drawEraser=!drawEraser;$('#btnDrawEraser')?.classList.toggle('active',drawEraser);}
function stopDrawingTimer(){if(drawTimerHandle)clearInterval(drawTimerHandle);drawTimerHandle=null;}
function startDrawingSnapshotTimer(){if(drawSnapshotTimer)clearInterval(drawSnapshotTimer);drawSnapshotTimer=setInterval(()=>{if(!state._drawingGame?.isDrawer||!state.currentRoom||!drawCtx||!state.socket)return;try{const data=drawCtx.canvas.toDataURL('image/jpeg',.48);state.socket.emit('drawing:snapshot',{roomCode:state.currentRoom.code,dataUrl:data});}catch{}},3500);}
function startDrawingTimer(seconds){stopDrawingTimer();let left=Math.max(0,Number(seconds)||45);const el=$('#drawTimer');if(el)el.textContent=left;drawTimerHandle=setInterval(()=>{left--;if(el)el.textContent=Math.max(0,left);if(left<=0)stopDrawingTimer();},1000);}
function renderDrawingState(g){
  state._drawingGame=g;state.solo=null;if(state.currentView!=='draw')navigate('draw');
  const mine=String(g.drawerId)===String(state.user?.id);const title=$('#drawTurnLabel');if(title)title.textContent=mine?'✏️ SUA VEZ DE DESENHAR':'👀 '+(g.drawerName||'Jogador')+' está desenhando';
  $('#drawWordHint')&&( $('#drawWordHint').textContent=mine?'Você vê a palavra. Não escreva o nome no desenho!':'A palavra está escondida. Seja rápido para adivinhar!');
  const secret=$('#drawSecretWord');if(secret)secret.textContent=mine?(g.secretWord||'...'):'???';
  $('#drawWordCard')?.classList.toggle('hidden',!mine);$('#drawCanvasLock')?.classList.toggle('hidden',mine);
  const canvas=$('#drawCanvas');if(canvas)canvas.classList.toggle('drawer-active',mine);startDrawingTimer(g.secondsLeft||g.turnSeconds||45);
  const players=$('#drawPlayers');if(players)players.innerHTML=(g.players||[]).map(p=>`<div class="draw-player ${String(p.userId)===String(g.drawerId)?'drawing-now':''}"><span class="draw-avatar">${p.avatar?.emoji||'👤'}</span><div><b>${escapeHtml(p.username)}</b><small>${p.points||0} pts${String(p.userId)===String(g.drawerId)?' • DESENHANDO':''}</small></div></div>`).join('');
  const feed=$('#drawGuessFeed');if(feed&&g.guesses){feed.innerHTML=g.guesses.map(x=>`<div class="guess-line ${x.correct?'correct':''}"><b>${escapeHtml(x.username)}</b><span>${escapeHtml(x.guess)}</span>${x.correct?'<em>✓ ACERTOU</em>':''}</div>`).join('');feed.scrollTop=feed.scrollHeight;}
}
function renderDrawingTurn(g){renderDrawingState({...state._drawingGame,...g});clearDrawingCanvas();}
function renderDrawingRound(g){renderDrawingState({...state._drawingGame,...g});if($('#projectorScreen'))$('#projectorScreen').innerHTML='<canvas id="projectorCanvas" width="1200" height="700"></canvas><div class="projector-empty" id="projectorEmpty">🎥<b>PROJETOR</b><small>O desenho aparecerá aqui para todos.</small></div>';projectorCtx=$('#projectorCanvas')?.getContext('2d');if(projectorCtx){projectorCtx.lineCap='round';projectorCtx.lineJoin='round';}clearDrawingCanvas();hide('#drawReveal');}
function renderDrawingReveal(g){
  const box=$('#drawReveal');if(box){$('#drawRevealWord').textContent=g.word||'...';box.classList.remove('hidden');}
  const screen=$('#projectorScreen');if(screen&&g.dataUrl){screen.innerHTML=`<img src="${escapeHtml(g.dataUrl)}" alt="Desenho revelado">`;}
  toast(`🔎 Era: ${g.word||'???'}`,'success',4500);
}
function renderDrawingGuess(g){
  const feed=$('#drawGuessFeed');if(!feed)return;const line=document.createElement('div');line.className=`guess-line ${g.correct?'correct':''}`;line.innerHTML=`<b>${escapeHtml(g.username)}</b><span>${escapeHtml(g.guess)}</span>${g.correct?'<em>✓ ACERTOU</em>':''}`;feed.appendChild(line);feed.scrollTop=feed.scrollHeight;if(g.correct)Sound.ok();
}

// ---------------- ONLINE ----------------
function playOnlineCardAt(index){const game=state._onlineGame;if(!game)return;const mine=String(game.currentPlayerId)===String(state.user.id);if(!mine)return toast('Aguarde sua vez.');const card=game.hand?.[index];if(!card)return;if(!playable(card,game.top,game.currentColor))return toast('Essa carta não pode ser jogada.','error');const chosenColor=card.color==='black'?chooseColorBot(game.hand):undefined;const source=$(`#playerHand .hand-card[data-index=\"${index}\"]`);source?.classList.add('card-selected-to-play');setTimeout(()=>source?.classList.remove('card-selected-to-play'),450);state.socket?.emit('game:play',{cardId:card.id,chosenColor});}

function renderModeGameState(g){
  if(!g)return; state._modeGame=g; state.solo=null; if(state.currentView!=='modeGameView')navigate('modeGameView');
  const labels={truco:['🂡 TRUCO','Truco do Velho'],checkers:['⚫ DAMAS','Damas de Botecão'],chess:['♟️ XADREZ','Xadrez do Bar']};
  const meta=labels[g.mode]||['🎮 JOGO','Mesa'];
  $('#modeGameBadge')&&($('#modeGameBadge').textContent=meta[0]);$('#modeGameTitle')&&($('#modeGameTitle').textContent=meta[1]);
  const mine=String(g.currentPlayerId)===String(state.user?.id);$('#modeGameTurn')&&($('#modeGameTurn').textContent=mine?'SUA VEZ':'VEZ DO OPONENTE');$('#modeGameMessage')&&($('#modeGameMessage').textContent=g.message||'');
  const body=$('#modeGameBody');if(!body)return;
  if(g.mode==='truco'){
    const hand=g.hand||[];body.innerHTML=`<div class="online-mode-board truco-online-board"><div class="mode-scorebar">${(g.players||[]).map((p,i)=>`<div class="mode-player-chip"><div class="mode-player-char">${characterMarkup(p.avatar||DEFAULT_AVATAR,p.username)}</div><div><b>${escapeHtml(p.username)}</b><small>${p.points||0} mãos</small></div></div>`).join('')}<div class="truco-bet">VALENDO <b>${g.bet||1}</b></div></div><div class="mode-center-table"><div class="trick-cards">${(g.trick||[]).map(x=>`<div class="playing-card-mini"><b>${escapeHtml(x.card.value)}</b><span>${escapeHtml(x.card.suit)}</span><small>${escapeHtml(x.username)}</small></div>`).join('')||'<div class="mode-empty">🃏 Jogue uma carta</div>'}</div></div><div class="mode-hand-row">${hand.map(c=>`<button class="playing-card-big" data-mode-card="${escapeHtml(c.id)}" type="button"><b>${escapeHtml(c.value)}</b><span>${escapeHtml(c.suit)}</span></button>`).join('')}</div><div class="mode-actions"><button class="btn btn-primary" id="modeTruco" type="button">🔥 TRUCO!</button></div></div>`;
    body.querySelectorAll('[data-mode-card]').forEach(b=>b.onclick=()=>state.socket?.emit('mode:action',{action:'play',cardId:b.dataset.modeCard}));$('#modeTruco')?.addEventListener('click',()=>state.socket?.emit('mode:action',{action:'truco'}));return;
  }
  const isChess=g.mode==='chess';const board=g.board||[];const pieces=isChess?{'r':'♜','n':'♞','b':'♝','q':'♛','k':'♚','p':'♟','R':'♖','N':'♘','B':'♗','Q':'♕','K':'♔','P':'♙'}:{'w':'⚪','W':'👑','b':'⚫','B':'👑'};
  body.innerHTML=`<div class="online-mode-board strategy-online-board"><div class="strategy-head"><div>${(g.players||[]).map((p,i)=>`<div class="mode-player-chip"><div class="mode-player-char">${characterMarkup(p.avatar||DEFAULT_AVATAR,p.username)}</div><b>${escapeHtml(p.username)}</b></div>`).join('')}</div><span>${isChess?(g.turn==='w'?'BRANCAS':'PRETAS'):'VEZ: '+escapeHtml((g.players||[]).find(p=>String(p.userId)===String(g.currentPlayerId))?.username||'')}</span></div><div class="strategy-board ${isChess?'chess-board':'checkers-board'}" id="onlineStrategyBoard">${board.map((piece,i)=>`<button type="button" class="strategy-cell ${((Math.floor(i/8)+i)%2)?'dark':'light'} ${piece?'occupied':''}" data-cell="${i}">${piece?pieces[piece]:''}</button>`).join('')}</div><div class="strategy-help">Toque em uma peça e depois na casa de destino.</div></div>`;
  let selected=null;body.querySelectorAll('[data-cell]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.cell),piece=board[i];if(selected===null){if(!piece)return;selected=i;body.querySelectorAll('[data-cell]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');return;}if(selected===i){selected=null;b.classList.remove('selected');return;}state.socket?.emit('mode:action',{action:'move',from:selected,to:i});selected=null;body.querySelectorAll('[data-cell]').forEach(x=>x.classList.remove('selected'));});
}
function renderOnlineGame(game){
  state._onlineGame=game;state.solo=null;if(state.currentView!=='game')navigate('game');
  $('#roundText')&&($('#roundText').textContent='AO VIVO');
  const mine=String(game.currentPlayerId)===String(state.user.id);
  $('#turnStatus')&&($('#turnStatus').textContent=mine?'SUA VEZ!':'VEZ DO OPONENTE');$('#turnStatus')?.classList.toggle('bot',!mine);
  const theme=MAP_PERSONALITY[mapTheme(game.mapId)]||MAP_PERSONALITY.saloon;state.currentMapTheme=theme.music||'saloon';applyMapScene(game.mapId);startMapMusic(theme.music||'saloon');
  renderArenaCard(game.top,game.currentColor);$('#deckCount')&&($('#deckCount').textContent=game.deckCount);
  renderPlayedCards(game.recentDiscard||[]);
  const hand=$('#playerHand');if(hand){const cards=Array.isArray(game.hand)?game.hand:[];hand.innerHTML=cards.length?cards.map((c,i)=>cardHtml(c,i,cards.length)).join(''):'<div class="hand-empty">AGUARDE SUAS CARTAS...</div>';bindRenderedHand();}
  const ops=$('#opponents');
  if(ops){const others=(game.players||[]).filter(p=>String(p.userId)!==String(state.user.id));ops.innerHTML=others.map((p,i)=>{
    const seat=i%4;const active=String(p.userId)===String(game.currentPlayerId);const char=characterMarkup(p.avatar||DEFAULT_AVATAR,p.username);return `<div class="opponent-seat player-seat seat-${seat} ${active?'active':''}" data-player-id="${escapeHtml(p.userId)}"><div class="player-emote" data-emote-for="${escapeHtml(p.userId)}"></div><div class="player-character">${char}</div><div class="player-nameplate"><b>${escapeHtml(p.username)}</b><small>${p.cardCount} cartas</small></div><div class="mini-hand">${Array.from({length:Math.min(7,p.cardCount||0)},()=>'<span class="back-mini">UNO</span>').join('')}</div></div>`;
  }).join('');}
  const self=$('.player-self');if(self){self.dataset.playerId=state.user.id;self.querySelector('.player-emote')?.setAttribute('data-emote-for','self');}
  updateUnoButton(!!game.unoRequired,game.unoRequired?Date.now()+3200:null);renderCharacter('#gameAvatar',state.profile.avatar);$('#gamePlayerName')&&($('#gamePlayerName').textContent=state.user.username);$('#gamePlayerTitle')&&($('#gamePlayerTitle').textContent=itemName(state.profile.avatar.title).toUpperCase());
}
function characterMarkup(a,name=''){
  const x={...DEFAULT_AVATAR,...(a||{})};
  const seed=String(name).split('').reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);
  const hue=seed%360, skin=escapeHtml(x.skinColor||'#d59b76'), hair=escapeHtml(x.hairColor||'#171717'), eyes=escapeHtml(x.eyes||'#1d2433');
  const tops={shirt_basic:'#2563eb',shirt_red:'#dc2626',shirt_neon:'#06b6d4',shirt_gold:'#eab308',shirt_space:'#475569'};
  const pantsMap={pants_basic:'#263449',pants_black:'#111827',pants_neon:'#22c55e'}, shoesMap={shoes_basic:'#e5e7eb',shoes_red:'#ef4444',shoes_gold:'#facc15'};
  const shirt=tops[x.top]||tops.shirt_basic, pants=pantsMap[x.bottom]||pantsMap.pants_basic, shoes=shoesMap[x.shoes]||shoesMap.shoes_basic;
  const uid=`g${seed}${String(x.top||'').replace(/\W/g,'')}`;
  let hairShape=`<path d="M27 45 Q30 19 50 20 Q72 19 75 45 Q67 30 50 31 Q34 30 27 45Z" fill="${hair}"/>`;
  if(x.hair==='hair_curl') hairShape=`<path d="M27 45 Q20 30 29 20 Q37 10 47 20 Q55 8 65 20 Q79 18 75 45 Q68 30 50 31 Q34 30 27 45Z" fill="${hair}"/><circle cx="31" cy="21" r="5" fill="${hair}"/><circle cx="44" cy="16" r="5" fill="${hair}"/><circle cx="57" cy="15" r="5" fill="${hair}"/><circle cx="70" cy="23" r="5" fill="${hair}"/>`;
  if(x.hair==='hair_long') hairShape=`<path d="M26 48 Q25 15 50 18 Q76 15 75 48 L69 68 H62 V35 Q50 27 38 35 V68 H31Z" fill="${hair}"/>`;
  if(x.hair==='hair_mohawk') hairShape=`<path d="M31 38 L36 19 L41 28 L46 10 L51 28 L57 7 L61 28 L68 17 L71 40 Q62 30 50 31 Q38 30 31 38Z" fill="${hair}"/>`;
  if(x.hair==='hair_afro') hairShape=`<circle cx="50" cy="30" r="23" fill="${hair}"/><circle cx="32" cy="28" r="8" fill="${hair}"/><circle cx="68" cy="28" r="8" fill="${hair}"/>`;
  if(x.hair==='hair_braids') hairShape=`<path d="M27 45 Q29 18 50 20 Q71 18 73 45 Q65 30 50 31 Q35 30 27 45Z" fill="${hair}"/><path d="M28 34 L20 52 L25 60 M72 34 L80 52 L75 60" fill="none" stroke="${hair}" stroke-width="6" stroke-linecap="round"/>`;
  if(x.hair==='hair_ice') hairShape=`<path d="M27 43 Q31 14 49 20 L55 10 L61 21 L73 17 L74 44 Q65 30 50 31 Q34 30 27 43Z" fill="#dff9ff" stroke="#7dd3fc" stroke-width="2"/>`;
  const shirtExtra=x.top==='shirt_neon'?`<path d="M31 79 H69 M31 90 H69" stroke="#67e8f9" stroke-width="3" opacity=".8"/>`:x.top==='shirt_gold'?`<path d="M43 70 L50 82 L57 70" fill="#fff3"/><circle cx="50" cy="92" r="6" fill="#fde68a" opacity=".8"/>`:x.top==='shirt_space'?`<circle cx="42" cy="82" r="2" fill="#fff"/><circle cx="58" cy="94" r="2" fill="#fff"/>`:'';
  const hat=x.accessory==='hat_cap'?`<path d="M25 31 Q50 16 72 30 L80 36 H22Z" fill="#ef4444"/><rect x="21" y="34" width="58" height="5" rx="2" fill="#b91c1c"/>`:x.accessory==='hat_cowboy'?`<ellipse cx="50" cy="31" rx="32" ry="6" fill="#a16207"/><path d="M34 31 Q35 10 50 10 Q65 10 66 31Z" fill="#92400e"/>`:x.accessory==='hat_crown'?`<path d="M30 30 L34 12 L43 22 L50 8 L57 22 L66 12 L70 30Z" fill="#facc15" stroke="#fde68a" stroke-width="2"/>`:'';
  const glasses=['glasses_basic','glasses_cyan','glasses_gold'].includes(x.accessory), gc=x.accessory==='glasses_cyan'?'#22d3ee':x.accessory==='glasses_gold'?'#facc15':'#111827';
  const acc=glasses?`<g fill="#05070b" stroke="${gc}" stroke-width="2.5"><rect x="29" y="40" width="17" height="11" rx="4"/><rect x="54" y="40" width="17" height="11" rx="4"/><path d="M46 44 H54"/></g>`:'';
  const mask=x.accessory==='mask_math'?`<path d="M34 56 Q50 64 66 56 L63 68 Q50 75 37 68Z" fill="#0f172a" stroke="#22d3ee" stroke-width="2"/>`:'';
  const backpack=x.accessory?.startsWith('backpack_')?`<rect x="20" y="70" width="10" height="28" rx="5" fill="${x.accessory==='backpack_space'?'#64748b':'#2563eb'}"/>`:'';
  const aura=x.effect?`<div class="char-aura ${escapeHtml(x.effect)}"></div>`:'';
  return `<div class="char-3d-live code-character" style="--avatar-hue:${hue}deg">${aura}<svg viewBox="0 0 100 120" aria-label="${escapeHtml(name||'Personagem')}"><defs><linearGradient id="${uid}" x1="0" x2="1"><stop stop-color="${shirt}"/><stop offset="1" stop-color="#111827"/></linearGradient></defs><ellipse cx="50" cy="114" rx="32" ry="5" fill="#0008"/>${backpack}<path d="M29 76 Q30 67 39 66 H61 Q70 67 71 76 L68 105 H32Z" fill="url(#${uid})"/>
<path d="M35 73 Q28 75 25 84 L20 101 Q19 105 24 107 Q29 108 31 103 L38 88" fill="${shirt}"/>
<path d="M65 73 Q72 75 75 84 L80 101 Q81 105 76 107 Q71 108 69 103 L62 88" fill="${shirt}"/>
<path d="M38 73 Q50 80 62 73" fill="none" stroke="#ffffff55" stroke-width="2"/>
${shirtExtra}<rect x="37" y="99" width="10" height="15" rx="4" fill="${pants}"/><rect x="53" y="99" width="10" height="15" rx="4" fill="${pants}"/><rect x="35" y="111" width="14" height="5" rx="3" fill="${shoes}"/><rect x="51" y="111" width="14" height="5" rx="3" fill="${shoes}"/><circle cx="50" cy="48" r="25" fill="${skin}"/>${hairShape}${hat}<circle cx="41" cy="47" r="3" fill="${eyes}"/><circle cx="59" cy="47" r="3" fill="${eyes}"/><path d="M43 60 Q50 65 57 60" fill="none" stroke="#5b3026" stroke-width="2" stroke-linecap="round"/>${acc}${mask}</svg></div>`;
}
function populateCustomizer(){for(const [cat,id] of Object.entries({hair:'customHair',top:'customTop',bottom:'customBottom',shoes:'customShoes',accessory:'customAccessory',effect:'customEffect',emote:'customEmote',title:'customTitle'})){const el=$('#'+id);if(!el)continue;const owned=new Set(state.inventory.map(i=>i.id));const ids=(COSMETICS[cat]||[]).filter(x=>owned.has(x)||state.user?.role==='CEO');if(!ids.length)ids.push(COSMETICS[cat]?.[0]);el.innerHTML=ids.filter(Boolean).map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(itemName(x))}</option>`).join('');el.value=state.profile.avatar[cat]||ids[0]||'';el.onchange=()=>{state.profile.avatar[cat]=el.value;renderCharacter('#customCharacter',state.profile.avatar);};}
  if($('#customEyes')){$('#customEyes').value=state.profile.avatar.eyes||DEFAULT_AVATAR.eyes;$('#customEyes').onchange=e=>{state.profile.avatar.eyes=e.target.value;renderCharacter('#customCharacter',state.profile.avatar);};}
  if($('#customHairColor')){$('#customHairColor').value=state.profile.avatar.hairColor||DEFAULT_AVATAR.hairColor;$('#customHairColor').onchange=e=>{state.profile.avatar.hairColor=e.target.value;renderCharacter('#customCharacter',state.profile.avatar);};}
}
function updateCEOButton(){
  const isCEO=String(state.user?.username||'').trim().toLowerCase()==='ceovelho' || String(state.user?.role||'').trim().toUpperCase()==='CEO';
  document.querySelectorAll('#btnCEO').forEach(b=>{b.hidden=!isCEO;b.style.display=isCEO?'grid':'none';b.disabled=!isCEO;b.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();openCEOPanel();};});
  const f=document.querySelector('#btnCEOFloat'); if(f){f.hidden=!isCEO;f.style.display=isCEO?'flex':'none';f.disabled=!isCEO;f.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();openCEOPanel();};}
}
async function openCEOPanel(){
  const isCEO=String(state.user?.username||'').trim().toLowerCase()==='ceovelho' || String(state.user?.role||'').trim().toUpperCase()==='CEO';
  if(!isCEO){toast('Este painel é exclusivo da conta CeoVelho.','error');return;}
  const el=document.querySelector('#ceoPanel');
  if(!el){toast('Painel CEO não encontrado nesta versão.','error');return;}
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden','false');
  void loadCEOUsers();
}
async function ceoAction(path,body){try{const d=await post(path,body||{});toast(d.message||'Comando executado.','success');loadCEOUsers()}catch(e){toast(e.message,'error')}}
async function loadCEOUsers(){const box=document.querySelector('#ceoUsers');if(!box)return;box.innerHTML='<div class="loading">Carregando...</div>';try{const d=await get('/api/ceo/users');box.innerHTML=(d.users||[]).map(u=>`<div class="ceo-user-row"><div><b>${escapeHtml(u.username)}</b><small>ID ${u.id} • Nível ${u.level} • ${u.xp} XP</small></div><div class="ceo-user-actions"><button data-xp="${u.id}" type="button">ZERAR XP</button><button data-chat="${u.id}" type="button">BLOQUEAR CHAT</button><button data-unchat="${u.id}" type="button">DESBLOQUEAR</button></div></div>`).join('')||'<div>Nenhum jogador.</div>';box.querySelectorAll('[data-xp]').forEach(b=>b.onclick=()=>ceoAction('/api/ceo/reset-xp',{userId:Number(b.dataset.xp)}));box.querySelectorAll('[data-chat]').forEach(b=>b.onclick=()=>ceoAction('/api/ceo/chat-block',{userId:Number(b.dataset.chat),minutes:60}));
    box.querySelectorAll('[data-unchat]').forEach(b=>b.onclick=()=>ceoAction('/api/ceo/chat-unblock',{userId:Number(b.dataset.unchat)}));
  }catch(e){box.innerHTML='<div class="error">'+escapeHtml(e.message)+'</div>'}}

function itemVisualIcon(item){
  const cat=String(item?.category||'').toLowerCase();
  const id=String(item?.id||'').toLowerCase();
  if(cat==='hair') return '💇';
  if(cat==='clothing'||cat==='top') return '👕';
  if(cat==='shoes') return '👟';
  if(cat==='accessory') return id.includes('glasses')?'🕶️':id.includes('hat')?'🎩':id.includes('backpack')?'🎒':'✨';
  if(cat==='effect') return '🌈';
  if(cat==='emote') return '😎';
  if(cat==='title') return '🏷️';
  if(cat==='map') return '🗺️';
  if(cat==='deck') return '🃏';
  if(cat==='table') return '🎲';
  return '🎁';
}

async function openShop(mode='official'){
  state.shopMode=mode;
  navigate('shop');
  const grid=$('#shopGrid');
  if(!grid)return;
  grid.innerHTML='<div class="loading glass">🛒 Carregando catálogo...</div>';
  try{
    const [itemsRes,invRes]=await Promise.all([get('/items'),get('/inventory')]);
    state.items=itemsRes.items||[];
    state.inventory=invRes.items||[];
    const owned=new Set(state.inventory.map(x=>x.id));
    const list=state.items.filter(x=>x.is_active!==false && !['map','deck','table'].includes(String(x.category||'')));
    grid.innerHTML=list.map(item=>{
      const ownedNow=owned.has(item.id);
      const ceoOnly=item.asset?.ceoOnly===true;
      const locked=ceoOnly && String(state.user?.username||'').toLowerCase()!=='ceovelho';
      const canBuy=!ownedNow&&!locked;
      return `<article class="item-card glass rarity-${escapeHtml(item.rarity||'common')}">
        <div class="item-visual"><span class="item-generated-icon">${itemVisualIcon(item)}</span><span class="item-rarity">${escapeHtml(String(item.rarity||'common').toUpperCase())}</span></div>
        <div class="item-info"><span class="item-category">${escapeHtml(item.category||'COSMÉTICO')}</span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.description||'Item cosmético leve.')}</small>
        <div class="item-buy"><span>🪙 ${fmt(item.price)}${Number(item.xp_required)>0?` • ${fmt(item.xp_required)} XP`:''}</span>
        <button class="btn ${ownedNow?'btn-secondary':'btn-primary'} item-buy-btn" data-buy-item="${escapeHtml(item.id)}" type="button" ${canBuy?'':'disabled'}>${ownedNow?'✓ POSSUI':locked?'🔒 CEO':'COMPRAR'}</button></div></div>
      </article>`;
    }).join('') || '<div class="empty-state glass">Nenhum item disponível.</div>';
  }catch(e){grid.innerHTML=`<div class="empty-state glass">⚠️ ${escapeHtml(e.message)}</div>`;}
}

async function buyItem(id){
  const item=state.items.find(x=>x.id===id);
  if(!item)return toast('Item não encontrado no catálogo.','error');
  const btn=document.querySelector(`[data-buy-item="${CSS.escape(id)}"]`);
  if(btn)btn.disabled=true;
  try{
    const d=await post('/shop/buy',{itemId:id});
    toast(d.message||'Item comprado!','success');
    const [itemsRes,invRes,meRes]=await Promise.all([get('/items'),get('/inventory'),get('/me')]);
    state.items=itemsRes.items||state.items; state.inventory=invRes.items||state.inventory;
    if(meRes.user)state.user=meRes.user;
    if(meRes.profile)state.profile=normalizeProfile(meRes.profile);
    updateUserUI(); renderCharacter('#heroCharacter',state.profile.avatar); renderCharacter('#profileCharacterLarge',state.profile.avatar); renderCustomPage();
    await openShop(state.shopMode);
  }catch(e){toast(e.message||'Não foi possível comprar.','error');if(btn)btn.disabled=false;}
}

function renderInventoryItems(){
  const el=$('#inventoryContent');if(!el)return;
  if(state.inventoryMode==='achievements'){
    el.innerHTML='<div class="empty-state">🏆 Conquistas serão mostradas conforme você vence partidas.</div>';return;
  }
  if(!state.inventory.length){el.innerHTML='<div class="empty-state">🎒 Seu inventário está vazio. Visite a loja!</div>';return;}
  el.innerHTML=`<div class="inventory-grid">${state.inventory.map(i=>`<article class="inventory-item glass">
    <div class="inventory-item-icon">${itemVisualIcon(i)}</div><b>${escapeHtml(i.name||i.id)}</b><small>${escapeHtml(i.category||'cosmético')} • x${i.quantity||1}</small>
    <button class="btn btn-secondary" type="button" data-inventory-equip="${escapeHtml(i.id)}">EQUIPAR</button>
  </article>`).join('')}</div>`;
}

async function openInventory(mode='items'){
  state.inventoryMode=mode;
  navigate('inventory');
  const el=$('#inventoryContent');if(el)el.innerHTML='<div class="loading">🎒 Carregando inventário...</div>';
  try{
    const [invRes,itemsRes]=await Promise.all([get('/inventory'),get('/items')]);
    state.inventory=invRes.items||[];
    state.items=itemsRes.items||state.items;
    renderInventoryItems();
    updateUserUI();
    renderCharacter('#profileCharacterLarge',state.profile.avatar);
  }catch(e){if(el)el.innerHTML=`<div class="empty-state">⚠️ ${escapeHtml(e.message)}</div>`;}
}

async function claimPass(all=false,level=null){
  const levels=all ? Array.from(document.querySelectorAll('[data-pass-level]')).map(x=>Number(x.dataset.passLevel)).filter(Boolean) : [Number(level)];
  try{
    const d=await post('/pass/claim', all?{levels}:{level:Number(level)});
    if(d.user)state.user=d.user;
    updateUserUI();
    toast(d.message||'Recompensa coletada!','success');
    await renderPass();
  }catch(e){toast(e.message||'Não foi possível coletar a recompensa.','error');}
}

async function renderPass(){
  const grid=$('#passGrid');if(!grid)return;
  try{
    const d=await get('/pass');
    state.passData=d;
    const level=Math.max(1,Number(d.level)||1), xp=Number(d.xp)||0;
    $('#passCurrentLevel')&&( $('#passCurrentLevel').textContent=level );
    $('#passXpText')&&( $('#passXpText').textContent=`${fmt(xp)} XP` );
    const base=xpLevel(level),next=xpLevel(Math.min(100,level+1));
    $('#passNextText')&&( $('#passNextText').textContent=level>=100?'NÍVEL MÁXIMO':'Próximo nível: '+fmt(Math.max(0,next-xp))+' XP' );
    $('#passXpBar')&&( $('#passXpBar').style.width=(level>=100?100:Math.max(0,Math.min(100,((xp-base)/Math.max(1,next-base))*100)))+'%' );
    const claimed=new Set((d.claimed||[]).map(Number));
    grid.innerHTML=(d.levels||[]).map(r=>{
      const unlocked=Number(r.level)<=level, done=claimed.has(Number(r.level));
      const reward=r.itemId||r.title;
      return `<article class="pass-card glass ${unlocked?'unlocked':'locked'} ${done?'claimed':''}">
        <div class="pass-level">NÍVEL ${r.level}</div><div class="pass-reward-icon">${r.itemId?'🎁':r.title?'🏷️':'🪙'}</div>
        <b>${r.itemId?escapeHtml(itemName(r.itemId)):r.title?escapeHtml(itemName(r.title)):'Moedas'}</b>
        <small>🪙 +${fmt(r.coins)}</small>
        <button class="btn ${done?'btn-secondary':'btn-primary'}" data-pass-level="${r.level}" type="button" ${unlocked&&!done?'':'disabled'}>${done?'✓ COLETADO':unlocked?'COLETAR':'🔒'}</button>
      </article>`;
    }).join('');
  }catch(e){grid.innerHTML=`<div class="empty-state">⚠️ ${escapeHtml(e.message)}</div>`;}
}
async function openBattlePass(){
  const target=$('#battlePassView');
  if(!target){toast('Passe de nível não encontrado.','error');return;}
  navigate('battlePass');
  await renderPass();
}

function openCustomize(){
  if(!state.profile)return toast('Perfil ainda não carregado.','error');
  const b=document.querySelector('#btnCustomize'); if(b){b.disabled=true;setTimeout(()=>b.disabled=false,160)}
  state.previousView=state.currentView||'lobby';
  navigate('customize');
  renderCharacter('#customCharacterPage',state.profile.avatar);
  renderCustomPage();
}
function customImage(id){return `/assets/cosmetics/${encodeURIComponent(id)}.svg`;}
function renderCustomPage(){
  if(!state.profile)return;
  renderCharacter('#customCharacterPage',state.profile.avatar);
  const u=state.user||{};
  if($('#customNamePage'))$('#customNamePage').textContent=u.username||'Jogador';
  if($('#customTitlePage'))$('#customTitlePage').textContent=itemName(state.profile.avatar.title||'title_beginner').toUpperCase();
  const owned=new Set((state.inventory||[]).map(i=>i.id));
  if($('#customOwnedCount'))$('#customOwnedCount').textContent=`${owned.size} itens adquiridos`;
  renderEquippedList(owned);
  const active=document.querySelector('.custom-cat.active')?.dataset.customCat||'top';
  renderCustomCatalog(active);
}
function renderEquippedList(owned){
  const el=$('#equippedList');if(!el)return;
  const slots=[['top','👕'],['hair','💇'],['bottom','👖'],['shoes','👟'],['accessory','🕶️']];
  el.innerHTML=slots.map(([slot,icon])=>`<div class="equipped-chip"><span>${icon}</span><div><small>${slot}</small><b>${escapeHtml(itemName(state.profile.avatar[slot]))}</b></div></div>`).join('');
}
function renderCustomCatalog(category){
  const el=$('#customCatalog');if(!el)return;
  const owned=new Set((state.inventory||[]).map(i=>i.id));
  const ids=COSMETICS[category]||[];
  el.innerHTML=ids.map(id=>{
    const item=state.items.find(x=>x.id===id); const canUse=owned.has(id)||state.user?.role==='CEO';
    const price=Number(item?.price||0); const name=item?.name||itemName(id); const desc=item?.description||'Item cosmético';
    return `<button class="custom-item-card ${state.profile.avatar[category]===id?'selected':''} ${canUse?'owned':'locked'}" data-custom-item="${escapeHtml(id)}" data-custom-slot="${escapeHtml(category)}" type="button">
      <div class="custom-photo item-only-photo generated-item-visual"><span>${itemVisualIcon(item||{category:category})}</span><span class="photo-badge">${canUse?'✓ USAR':`🪙 ${fmt(price)}`}</span></div>
      <div class="custom-item-info"><b>${escapeHtml(name)}</b><small>${escapeHtml(desc)}</small>${canUse?'<em>Toque para equipar</em>':`<em>🔒 Compre na loja</em>`}</div>
    </button>`;
  }).join('')||'<div class="empty-state">Nenhuma opção nesta categoria.</div>';
}
async function persistCharacterSilently(){
  if(!state.profile||!state.token)return;
  try{const d=await put('/profile',{avatar:state.profile.avatar,settings:state.profile.settings,bio:state.profile.bio||''});state.profile=normalizeProfile(d.profile);}catch(e){console.warn('autosave personagem:',e.message);}
}
async function equipCustomItem(id,slot){
  const owned=new Set((state.inventory||[]).map(i=>i.id));
  if(!owned.has(id)&&state.user?.role!=='CEO'){
    const item=state.items.find(x=>x.id===id); if(item){toast(`Compre ${item.name} na loja por 🪙 ${fmt(item.price)}.`,'info');openShop('official');}else toast('Item bloqueado.','error');return;
  }
  state.profile.avatar[slot]=id;renderCustomPage();renderCharacter('#customCharacterPage',state.profile.avatar);renderCharacter('#customCharacter',state.profile.avatar);Sound.click();
  await persistCharacterSilently();toast(`${itemName(id)} equipado e salvo!`,'success');
}
async function saveCharacter(){
  try{const d=await put('/profile',{avatar:{...state.profile.avatar},settings:state.profile.settings,bio:state.profile.bio||''});state.profile=normalizeProfile(d.profile);renderCharacter('#heroCharacter',state.profile.avatar);renderCharacter('#profileCharacterLarge',state.profile.avatar);renderCharacter('#customCharacter',state.profile.avatar);renderCharacter('#customCharacterPage',state.profile.avatar);updateUserUI();renderCustomPage();toast('Personagem salvo com sucesso!','success');Sound.ok();}
  catch(e){toast(e.message||'Não foi possível salvar o personagem.','error');Sound.bad();console.error('saveCharacter',e);}
}
function renderCharacter(selector,a){const el=$(selector);if(!el)return;const x={...DEFAULT_AVATAR,...(a||{})};const name=state.user?.username||'Jogador';el.innerHTML=characterMarkup(x,name);el.classList.add('character-3d-container');}
function applySettings(){const s={...defaults(),...(state.profile?.settings||{})};const ids=[['setMusic',s.music],['setSfx',s.sfx],['setAnimations',s.animations],['setReducedMotion',s.reducedMotion],['setWorldChat',s.chatWorld],['setRoomChat',s.chatRoom],['setPrivateChat',s.chatPrivate]];ids.forEach(([id,v])=>{if($('#'+id))$('#'+id).checked=!!v;});if($('#setMusicVol'))$('#setMusicVol').value=s.musicVolume;if($('#setSfxVol'))$('#setSfxVol').value=s.sfxVolume;Sound.enabled=s.sfx!==false;Sound.volume=Number(s.sfxVolume)||.7;document.documentElement.style.setProperty('--motion',s.reducedMotion?'0':'1');}
let settingsSaveTimer=null;function saveSettings(){if(!state.profile)return;const s={music:!!$('#setMusic')?.checked,musicVolume:Number($('#setMusicVol')?.value||.35),sfx:!!$('#setSfx')?.checked,sfxVolume:Number($('#setSfxVol')?.value||.7),animations:!!$('#setAnimations')?.checked,reducedMotion:!!$('#setReducedMotion')?.checked,chatWorld:!!$('#setWorldChat')?.checked,chatRoom:!!$('#setRoomChat')?.checked,chatPrivate:!!$('#setPrivateChat')?.checked};state.profile.settings=s;applySettings();clearTimeout(settingsSaveTimer);settingsSaveTimer=setTimeout(async()=>{try{await put('/profile',{avatar:state.profile.avatar,settings:s,bio:state.profile.bio||''});}catch{}},400);}

async function openRank(){navigate('rank');const el=$('#rankRows');if(!el)return;try{const d=await get('/rank');el.innerHTML=(d.players||[]).map((p,i)=>`<div class="rank-row ${p.username===state.user.username?'me':''}"><span>${i+1}</span><b>${escapeHtml(p.username)}</b><span>${p.level}</span><span>${fmt(p.xp)}</span><span>${fmt(p.wins)}</span></div>`).join('')||'<div class="empty-state">Nenhum jogador.</div>';}catch(e){el.innerHTML=`<div class="empty-state">${escapeHtml(e.message)}</div>`;}}
function switchChat(ch){state.currentChat='world';}
async function sendChat(body,channel){
  const text=String(body||'').trim(); if(!text)return;
  if(channel==='world'&&!state.profile.settings.chatWorld)return toast('Chat mundial desativado.','error');
  if(channel==='room'&&!state.profile.settings.chatRoom)return toast('Chat da sala desativado.','error');
  if(state.socket?.connected){
    state.socket.emit('chat:send',{channel,body:text,roomCode:state.currentRoom?.code,receiverId:state.selectedPrivateUser});
    return;
  }
  if(channel==='world'){
    try{await post('/chat/global',{body:text});}
    catch(e){toast(e.message||'Chat indisponível.','error');}
  }else toast('Conectando ao chat da sala...','error');
}
function renderChatMessage(m){
  if(m.channel==='world'){
    [$('#gameChatMessages'),$('#globalChatMessagesLobby')].forEach(box=>{if(!box)return;const line=document.createElement('div');line.className=`chat-line ${Number(m.senderId)===Number(state.user?.id)?'mine':''}`;line.innerHTML=`<b>${escapeHtml(m.senderName)}</b><span>${escapeHtml(m.body)}</span>`;box.appendChild(line);while(box.children.length>80)box.firstChild.remove();box.scrollTop=box.scrollHeight;});
    const preview=$('#globalChatPreview');if(preview)preview.textContent=`${m.senderName}: ${m.body}`;
    if(!state.globalChatOpen)$('#btnGameGlobalChat')?.classList.add('has-message');return;
  }
  if(m.channel==='room'&&state.currentRoom?.code===m.roomCode){const box=$('#roomChatMessages');if(box){const line=document.createElement('div');line.className=`chat-line ${Number(m.senderId)===Number(state.user?.id)?'mine':''}`;line.innerHTML=`<b>${escapeHtml(m.senderName)}</b><span>${escapeHtml(m.body)}</span>`;box.appendChild(line);box.scrollTop=box.scrollHeight;}}
}
async function loadGlobalChatHistory(){try{const d=await get('/chat/global');const boxes=[$('#gameChatMessages'),$('#globalChatMessagesLobby')];boxes.forEach(box=>{if(!box)return;box.innerHTML='';(d.messages||[]).forEach(m=>{const line=document.createElement('div');line.className=`chat-line ${Number(m.senderId)===Number(state.user?.id)?'mine':''}`;line.innerHTML=`<b>${escapeHtml(m.senderName)}</b><span>${escapeHtml(m.body)}</span>`;box.appendChild(line);});box.scrollTop=box.scrollHeight;});const last=d.messages?.at(-1);if(last&&$('#globalChatPreview'))$('#globalChatPreview').textContent=`${last.senderName}: ${last.body}`;}catch{}}
async function openGlobalChat(){state.globalChatOpen=true;await loadGlobalChatHistory();if(state.currentView==='game'){show('#gameGlobalChat');$('#gameChatInput')?.focus();}else{show('#globalChatPanel');$('#globalChatInputLobby')?.focus();}$('#btnGameGlobalChat')?.classList.remove('has-message');}
function closeGlobalChat(){state.globalChatOpen=false;hide('#gameGlobalChat');hide('#globalChatPanel');}
async function logout(){try{await post('/logout');}catch{}try{state.socket?.disconnect();}catch{}localStorage.removeItem('uv_token');state.user=null;state.profile=null;state.token=null;state.currentRoom=null;hide('#appScreen');show('#authScreen');switchAuth('login');}

window.addEventListener('DOMContentLoaded',init);
window.addEventListener('load',updateOrientationGuard);

