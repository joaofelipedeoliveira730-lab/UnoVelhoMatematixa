/* Uno dos Idosos — frontend integrado
 * Compatível com o server.js atual do projeto.
 * Não depende de Service Worker, cache de recursos ou IDs opcionais para iniciar.
 */
'use strict';

const API = '/api';
const VERSION = '6.0.0';
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];

const MAPS = [
  ['map_saloon','Saloon Clássico','saloon'],['map_medieval_tavern','Taverna Medieval','medieval'],['map_pirate_ship','Navio Pirata','pirate'],['map_modern_home','Casa Moderna','modern'],
  ['map_classroom','Sala de Aula','classroom'],['map_geometry','Laboratório Geométrico','geometry'],['map_neon_city','Cidade Neon','neon'],['map_forest','Floresta Matemática','forest'],['map_desert','Deserto Dourado','desert'],
  ['map_ice','Montanha Congelada','ice'],['map_space','Estação Espacial','space'],['map_math_dimension','Dimensão Matemática','math'],['map_ceo','Dimensão CEO','ceo']
].map(([id,name,theme])=>({id,name,theme,asset:`assets/maps/${theme}.svg`}));
const IMMERSIVE_MAPS=[
  {id:'map_velho_bar',name:'Bar do Velho',theme:'velho-bar'},
  {id:'map_quintal',name:'Quintal da Vó',theme:'quintal'},
  {id:'map_pier',name:'Pier do Baralho',theme:'pier'}
];
MAPS.push(...IMMERSIVE_MAPS.map(m=>({...m,asset:`assets/maps/${m.theme}.svg`})));
const MAP_PERSONALITY={
  saloon:{label:'Saloon clássico',music:'saloon',decor:'🍺 🕯️ 🪵'},medieval:{label:'Taverna medieval',music:'medieval',decor:'🍺 🕯️ 🛡️'},pirate:{label:'Navio pirata',music:'pirate',decor:'🏴‍☠️ 🍺 ⚓'},modern:{label:'Casa moderna',music:'modern',decor:'☕ 🪴 💡'},classroom:{label:'Sala de aula',music:'modern',decor:'📚 🧮 ✏️'},neon:{label:'Cidade neon',music:'modern',decor:'🌃 ✨ 💡'},forest:{label:'Floresta',music:'forest',decor:'🌲 🍃 ✨'},desert:{label:'Deserto',music:'saloon',decor:'🏜️ 🔥'},ice:{label:'Montanha congelada',music:'modern',decor:'❄️ 🧊'},space:{label:'Estação espacial',music:'modern',decor:'🚀 🪐'},math:{label:'Dimensão Matematixa',music:'modern',decor:'∞ ✨ 🔢'},ceo:{label:'Dimensão CEO',music:'modern',decor:'👑 💎 🥂'},
  'velho-bar':{label:'Bar do Velho',music:'saloon',decor:'🍺 🥜 🕯️ 🪵 🎱'},
  quintal:{label:'Quintal da Vó',music:'modern',decor:'🪴 🍉 🐓 🧉 🌻'},
  pier:{label:'Pier do Baralho',music:'modern',decor:'🌊 🐟 🪣 🥤 ⚓'}
};

const COSMETICS = {
  hair:['hair_basic','hair_curl','hair_long','hair_mohawk','hair_afro','hair_braids','hair_ice','hair_ceo'],
  top:['shirt_basic','shirt_red','shirt_neon','shirt_gold','shirt_space'], oponentetom:['pants_basic','pants_black','pants_neon'],
  shoes:['shoes_basic','shoes_red','shoes_gold'], accessory:['glasses_basic','glasses_cyan','glasses_gold','hat_cap','hat_cowboy','hat_crown','mask_math','backpack_blue','backpack_space'],
  effect:['aura_blue','aura_gold','aura_rainbow'], emote:['emote_wave','emote_math','emote_fire'], title:['title_beginner','title_calculator','title_master','title_ceo']
};
const COLORS = ['red','yellow','green','blue'];
const COLOR_NAME = {red:'VERMELHO',yellow:'AMARELO',green:'VERDE',blue:'AZUL'};
const DEFAULT_AVATAR = {character:'velhinho',skinColor:'#d59b76',eyes:'#1d2433',hair:'hair_basic',hairColor:'#171717',top:'shirt_basic',oponentetom:'pants_basic',shoes:'shoes_basic',accessory:'',effect:'',emote:'emote_wave',title:'title_beginner'};
const DEFAULT_SETTINGS = {music:false,musicVolume:.35,sfx:true,sfxVolume:.7,animations:true,reducedMotion:false,chatWorld:true,chatRoom:true,chatPrivate:true,doNotDisturb:false};

const SAVED_PLATFORM = localStorage.getItem('uv_platform_version')===VERSION ? localStorage.getItem('uv_platform') : localStorage.getItem('uv_platform') || null;
const state = {
  user:null, profile:null, token:null, items:[], inventory:[], socket:null, currentView:'lobby', previousView:'lobby',
  currentRoom:null, roomToJoin:null, selectedGameMode:'uno', selectedFormat:'quad', selectedPrivateUser:null, currentChat:'world', shopMode:'official', inventoryMode:'items',
  maintenance:false, solo:null, pendingChallenge:null, pendingSoloCard:null, pendingCard:null, unoTimer:null, muted:false, platform:SAVED_PLATFORM, currentMapTheme:'saloon', cameraYaw:0, cameraPitch:0, cameraDragging:false, cameraPointerId:null, actionTimers:new Map(), typingTimer:null, musicTimer:null, globalChatOpen:false, passData:null, friends:[], invites:[], soloIsTraining:false, aiTimer:null, turnGuardTimer:null, bootTimer:null
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
// Mantidos separados do fetch bruto para evitar oponenteões presos e erros de referência.
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

function showUniverseLoading(){const el=$('#bootScreen');if(!el)return;const worlds=[...document.querySelectorAll('#bootScreen .universe-shot')];worlds.forEach((x,i)=>x.style.setProperty('--delay',`${i*1.25}s`));el.classList.remove('hidden');clearTimeout(state.bootTimer);}
function hideUniverseLoading(){clearTimeout(state.bootTimer);hide('#bootScreen');}

async function init(){
  window.__UV_APP_READY__=true;
  document.documentElement.style.setProperty('--motion',localStorage.getItem('uv_reduced_motion')==='1'?'0':'1');
  bindEvents();
  hide('#bootScreen'); hide('#appScreen'); hide('#authScreen');
  // Sempre mostra a escolha de plataforma ANTES do login.
  const initialPlatform=state.platform || (window.matchMedia('(pointer:coarse)').matches?'mobile':'computer');
  applyPlatform(initialPlatform);
  document.body.classList.toggle('mobile-adapted',initialPlatform==='mobile');
  document.body.classList.toggle('desktop-adapted',initialPlatform==='computer');
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
  document.body.classList.toggle('mobile-adapted',platform==='mobile');
  document.body.classList.toggle('desktop-adapted',platform==='computer');
  document.body.classList.remove('landscape-mode','game-portrait-fallback');
  hide('#orientationGuard');
  Sound.init();
  document.body.classList.add('platform-ready');
  await continueAfterPlatform();
}
async function requestLandscape(){ document.body.classList.remove('landscape-mode'); hide('#orientationGuard'); }
async function forceLandscape(){ hide('#orientationGuard'); updateOrientationGuard(); }

function enterGameViewport(){
  document.body.classList.add('in-game'); if(state.platform==='computer') document.body.classList.add('landscape-mode'); else document.body.classList.remove('landscape-mode');
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
  // Ilha de chat: captura de submit/click antes de qualquer navegação global.
  document.addEventListener('submit',(e)=>{
    const form=e.target?.closest?.('#gameChatForm,#roomChatForm,#globalChatFormLobby');
    if(!form)return;
    e.preventDefault();e.stopImmediatePropagation();
    if(form.id==='gameChatForm'){
      const input=$('#gameChatInput');
      const text=input?.value||'';
      if(text.trim()) sendChat(text,'world');
      if(input)input.value='';
      try{state.socket?.emit('chat:typing',{roomCode:state.currentRoom?.code,typing:false});}catch{}
    }else if(form.id==='roomChatForm'){
      const input=$('#roomChatInput');
      const text=input?.value||'';
      if(text.trim()) sendChat(text,'room');
      if(input)input.value='';
    }else if(form.id==='globalChatFormLobby'){
      const input=$('#globalChatInputLobby');
      const text=input?.value||'';
      if(text.trim()) sendChat(text,'world');
      if(input)input.value='';
    }
  },true);
  document.addEventListener('click',(e)=>{
    const chat=e.target?.closest?.('#gameGlobalChat,#gameGlobalChat *,#gameChatForm,#gameChatForm *,#roomChatForm,#roomChatForm *,#globalChatPanel,#globalChatPanel *');
    if(chat){ e.stopImmediatePropagation(); }
  },true);
  // Navegação universal: qualquer botão de retorno usa o alvo declarado ou o mapa de fallback.
  document.addEventListener('click',(e)=>{
    const target=e.target.closest?.('.back-btn,[data-back],#btnBackGameAlt,#btnBackGame,#btnBackModeGame,#btnBackDraw,#btnLeaveRoom');
    if(!target)return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if(target.matches('#btnBackGameAlt,#btnBackGame')) return exitGame();
    if(target.matches('#btnBackModeGame')) return exitModeGame();
    if(target.matches('#btnBackDraw')) return leaveDrawingGame();
    if(target.matches('#btnLeaveRoom')) return leaveRoom();
    return navigateBack(target.dataset.back||null);
  },true);
  // Auth
  $$('.auth-tab').forEach(b=>b.addEventListener('click',()=>switchAuth(b.dataset.auth)));
  on('#formLogin','submit',login);on('#formRegister','submit',register);
  on('#btnPlatformMobile','click',()=>choosePlatform('mobile'));
  on('#btnPlatformComputer','click',()=>choosePlatform('computer'));
  on('#orientationGuard','click',()=>forceLandscape());on('#btnForceLandscape','click',()=>forceLandscape());

  // Navegação principal — todos os oponenteões são ligados aqui, sem depender de outros componentes.
  on('#brandHome','click',()=>navigate('lobby'));
  on('#btnPlay','click',()=>navigate('play'));on('#btnMail','click',openMail);on('#btnTerms','click',()=>show('#termsModal'));on('#btnAddFriend','click',()=>show('#addFriendModal'));on('#btnConfirmAddFriend','click',addFriend);
  on('#btnShop','click',()=>openShop('official'));on('#btnBattlePass','click',openBattlePass);
  on('#btnInventory','click',()=>openInventory('items'));
  on('#btnCharacters','click',openCharacters);
  on('#btnCustomize','click',openCustomize);
  on('#btnEditCharacterFromCharacters','click',openCustomize);
  on('#btnOpenProfile','click',()=>openInventory('items'));
  on('#btnOpenSettings','click',()=>navigate('settings'));on('#btnOpenSettingsRail','click',()=>navigate('settings'));
  on('#btnRankSmall','click',openRank);
  on('#btnClassic','click',()=>navigate('classic'));
  on('#btnTraining','click',()=>navigate('training'));
  $$('.classic-mode-card').forEach(b=>b.addEventListener('click',()=>{
    const format=b.dataset.classicFormat;
    if(format==='solo'){
      const difficulty=xpDifficulty(Number(state.user?.xp)||0);
      state.soloDifficulty=difficulty;state.soloIsTraining=false;
      startSolo(difficulty);
    } else selectOnlineMode('uno',format);
  }));
  $$('.solo-mode-card').forEach(b=>b.addEventListener('click',()=>startSoloMode(b.dataset.soloMode,state.soloDifficulty||'medium')));
  $$('.difficulty').forEach(b=>b.addEventListener('click',()=>{state.soloDifficulty=b.dataset.difficulty;$$('.difficulty').forEach(x=>x.classList.toggle('active',x===b));if(state.currentView==='training'){state.soloIsTraining=true;startSolo(state.soloDifficulty);}}));
  on('#soloView','click',e=>{const invite=e.target.closest('[data-invite-friend]');if(invite)inviteFriend(invite.dataset.inviteFriend);});
  on('#btnBackModeGame','click',exitModeGame);
  on('#btnOnline','click',()=>{state.selectedGameMode='uno';openOnlineModes();});
  on('#btnRank','click',openRank);
  $$('.online-mode-card').forEach(b=>b.addEventListener('click',()=>selectOnlineMode(b.dataset.onlineMode,b.dataset.format||'quad')));
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
  on('#btnReportPlayer','click',reportCurrentOpponent);
  on('#btnUno','click',callUno);
  on('#btnBackGame','click',exitGame);on('#btnBackGameAlt','click',exitGame);
  on('#btnSound','click',toggleMute);
  on('#btnLogout','click',logout);on('#btnLogoutTop','click',(e)=>{e.preventDefault();e.stopImmediatePropagation();logout();});on('#btnLogoutGame','click',(e)=>{e.preventDefault();e.stopImmediatePropagation();logout();});
  on('#btnCEO','click',e=>{e.preventDefault();e.stopPropagation();openCEOPanel();});on('#btnCEOFloat','click',e=>{e.preventDefault();e.stopPropagation();openCEOPanel();});on('#btnCloseCEO','click',()=>hide('#ceoPanel'));on('#btnMaintenance','click',e=>{e.preventDefault();e.stopPropagation();toggleMaintenance();});

  $$('.close-modal').forEach(b=>b.addEventListener('click',()=>hide(`#${b.dataset.close}`)));
  $$('.shop-tab').forEach(b=>b.addEventListener('click',()=>openShop(b.dataset.shop)));
  $$('.inventory-tab').forEach(b=>b.addEventListener('click',()=>openInventory(b.dataset.inv)));
  state.currentChat='world';
  $$('.swatch').forEach(b=>b.addEventListener('click',()=>{state.profile.avatar.skinColor=b.dataset.skin;renderCharacter('#customCharacter',state.profile.avatar);if(state.currentView==='customize')renderCustomPage();persistCharacterSilently();}));
  ['setMusic','setMusicVol','setSfx','setSfxVol','setAnimations','setReducedMotion','setWorldChat','setRoomChat','setPrivateChat'].forEach(id=>on('#'+id,'change',saveSettings));
  on('#setMusicVol','input',saveSettings);on('#setSfxVol','input',saveSettings);
  on('#roomChatForm','submit',e=>{e.preventDefault();e.stopImmediatePropagation();});
  on('#gameChatForm','submit',e=>{e.preventDefault();e.stopImmediatePropagation();});
  ['#gameGlobalChat','#gameChatInput','#gameChatForm','#gameChatMessages'].forEach(sel=>{const el=$(sel);if(el){['pointerdown','mousedown','touchstart','click'].forEach(ev=>el.addEventListener(ev,e=>e.stopPropagation(),{passive:ev==='touchstart'}));}});
  $$('#emoteTray [data-emote]').forEach(b=>b.addEventListener('click',()=>sendEmote(b.dataset.emote)));
  on('#gameChatInput','input',()=>{state.socket?.emit('chat:typing',{roomCode:state.currentRoom?.code,typing:true});clearTimeout(state.typingTimer);state.typingTimer=setTimeout(()=>state.socket?.emit('chat:typing',{roomCode:state.currentRoom?.code,typing:false}),900);});
  on('#gameChatInput','blur',()=>state.socket?.emit('chat:typing',{roomCode:state.currentRoom?.code,typing:false}));

  // Fallback de clique para o painel CEO: funciona mesmo se o oponenteão foi recriado/atualizado pelo lobby.
  document.addEventListener('click',e=>{
    const close=e.target.closest('.close-modal,[data-close]');
    if(close){const id=close.dataset.close||close.closest('.modal-overlay')?.id;if(id){hide('#'+id);return;}}
    const overlay=e.target.classList?.contains('modal-overlay')?e.target:null;if(overlay){hide('#'+overlay.id);return;}
    const ceo=e.target.closest('#btnCEO, #btnCEOFloat');
    if(ceo){ e.preventDefault(); e.stopPropagation(); openCEOPanel(); return; }
    const ai=e.target.closest('[data-accept-invite]');if(ai){acceptInvite(ai.dataset.acceptInvite);return;}
    const di=e.target.closest('[data-decline-invite]');if(di){declineInvite(di.dataset.declineInvite);return;}
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
  showUniverseLoading();
  // O login normal também precisa habilitar imediatamente o painel da conta CeoVelho.
  updateCEOButton();
  // Abre o lobby primeiro. Loja, inventário e ranking são carregados em segundo plano.
  updateUserUI();applySettings();renderCharacter('#heroCharacter',state.profile.avatar);renderCharacter('#profileCharacterLarge',state.profile.avatar);renderCharacter('#customCharacter',state.profile.avatar);populateCustomizer();
  renderMapPreview();renderAchievementsPreview();void loadFriends();void connectSocket();navigate('lobby');
  void Promise.allSettled([get('/items'),get('/inventory')]).then(([itemsRes,inventoryRes])=>{
    state.items=itemsRes.status==='fulfilled'?(itemsRes.value.items||[]):[];
    state.inventory=inventoryRes.status==='fulfilled'?(inventoryRes.value.items||[]):[];
    updateUserUI();renderCharacter('#heroCharacter',state.profile.avatar);renderCharacter('#profileCharacterLarge',state.profile.avatar);renderCharacter('#customCharacter',state.profile.avatar);populateCustomizer();
  });
  void loadMiniRank();
  setTimeout(()=>hideUniverseLoading(),1100);
  if(forceCustomize)setTimeout(openCustomize,1150);
}
function updateUserUI(){
  const u=state.user;if(!u)return;const a=state.profile.avatar||DEFAULT_AVATAR;const title=itemName(a.title);
  $$('[id=coinValue], [id=coinValueTop]').forEach(el=>el.textContent=fmt(u.coins));$$('[id=levelValue], [id=levelValueTop]').forEach(el=>el.textContent=u.level||1);$('#heroName')&&( $('#heroName').textContent=u.username);$('#winsValue')&&( $('#winsValue').textContent=u.wins||0);$('#xpValue')&&( $('#xpValue').textContent=fmt(u.xp));
  $('#profileName')&&($('#profileName').textContent=u.username);$('#profileLevel')&&($('#profileLevel').textContent=u.level||1);$('#profileWins')&&($('#profileWins').textContent=u.wins||0);$('#profileGames')&&($('#profileGames').textContent=u.gamesPlayed||0);$('#profileTitle')&&($('#profileTitle').textContent=title.toUpperCase());$('#customNamePreview')&&($('#customNamePreview').textContent=u.username);$('#customTitlePreview')&&($('#customTitlePreview').textContent=title.toUpperCase());$('#accountInfo')&&($('#accountInfo').innerHTML=`<b>${escapeHtml(u.username)}</b><br>Cargo: ${escapeHtml(u.role||'user')}<br>🪙 ${fmt(u.coins)} • ⭐ ${fmt(u.xp)} XP`);
  const level=Math.max(1,Number(u.level)||1),base=xpLevel(level),next=xpLevel(level+1);const pct=Math.max(0,Math.min(100,((Number(u.xp)||0)-base)/Math.max(1,next-base)*100));$('#xpBar')&&($('#xpBar').style.width=pct+'%');
}
function xpLevel(level){return Math.floor(100*Math.pow(Math.max(0,level-1),1.45));}

function navigateBack(explicitTarget){
  const fallback={
    play:'lobby',classic:'play',training:'play',onlineModeView:'play',solo:'classic',rooms:'onlineModeView',room:'rooms',
    characters:'lobby',customize:'characters',battlePass:'lobby',shop:'lobby',inventory:'lobby',
    rank:'play',settings:'lobby',modeGameView:'solo',draw:'rooms',game:'solo'
  };
  const target=explicitTarget||fallback[state.currentView]||state.previousView||'lobby';
  if(state.currentView==='game') return exitGame();
  if(state.currentView==='modeGameView') return exitModeGame();
  if(state.currentView==='draw') return leaveDrawingGame();
  if(state.currentView==='room' && !explicitTarget) return leaveRoom();
  navigate(target);
}

function navigate(view){
  if(!state.user)return;
  const normalized=String(view||'').replace(/View$/,'');
  const target=$(`#${normalized}View`)||$(`#${view}`);
  if(!target){toast(`Tela "${view}" não encontrada.`,'error');return;}
  const nextView=target.id.replace(/View$/,'');
  if(nextView===state.currentView)return;
  const oldView=state.currentView;
  $$('.view').forEach(v=>v.classList.add('hidden'));target.classList.remove('hidden');state.previousView=oldView;state.currentView=nextView;
  document.body.classList.toggle('in-game',view==='game');
  if(view==='game'){ enterGameViewport(); } else { document.body.classList.remove('game-portrait-fallback'); }
  updateOrientationGuard();
  window.scrollTo({top:0,behavior:'smooth'});
  if(view==='lobby'){renderCharacter('#heroCharacter',state.profile.avatar);loadMiniRank();void loadFriends();}
  if(view==='solo')void loadFriends();
  if(view==='characters'){renderCharactersPage();}
  if(view==='settings')applySettings();
  try{history.replaceState({uvView:nextView},'',`#${nextView}`);}catch{}
}
if(!window.__UV_HISTORY_BOUND__){window.__UV_HISTORY_BOUND__=true;window.addEventListener('popstate',()=>{if(state.user)navigateBack();});}

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
  state.socket.on('rooms:update',()=>{if(state.currentView==='rooms')loadRooms();});state.socket.on('friend:invite',m=>{state.invites=[m,...state.invites.filter(x=>x.id!==m.id)];updateMailBadge();vibrate([160,80,160]);Sound.ok();toast(m.silent?'✉️ Convite guardado no correio.':'✉️ Novo convite!','success',4500);});state.socket.on('friends:update',()=>loadFriends());
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
  state.socket.on('game:ended',m=>{state._onlineGame=null;toast(m?.message||'A partida foi encerrada.', 'info', 4200);if(state.currentRoom){state.socket?.emit('room:leave');state.currentRoom=null;}navigate('rooms');});state.socket.on('game:winner',m=>{Sound.win();toast(`🏆 ${m.username} venceu!`,'success',5000);const game=state._onlineGame;const players=(game?.players||[]).slice().sort((a,b)=>(Number(a.cardCount)||0)-(Number(b.cardCount)||0));const entries=players.slice(0,3).map((p,i)=>({name:p.username||'Jogador',avatar:p.avatar||DEFAULT_AVATAR,label:i===0?'CAMPEÃO':`${i+1}º lugar`}));if(entries.length)showPodium(entries);});
  state.socket.on('global:pause',m=>applyMaintenance(true,m?.message));state.socket.on('global:resume',()=>applyMaintenance(false,''));
  state.socket.on('admin:announcement',m=>toast(`📢 ${m.by}: ${m.message}`,'success',6000));state.socket.on('admin:result',m=>toast(m.message,m.ok?'success':'error',5000));
  state.socket.on('admin:kick',m=>{toast(m.message,'error');state.currentRoom=null;navigate('lobby');});
}

function renderMapPreview(){const el=$('#mapPreview');if(!el)return;el.innerHTML=MAPS.slice(0,4).map(m=>`<button class="map-tile map-${m.theme}" data-map="${m.id}" type="button"><b>${escapeHtml(m.name)}</b></button>`).join('');}
async function loadMiniRank(){const el=$('#miniRank');if(!el)return;try{const d=await get('/rank');el.innerHTML=(d.players||[]).slice(0,5).map((p,i)=>`<div class="rank-mini-row"><span>${i+1}</span><b>${escapeHtml(p.username)}</b><small>Nível ${p.level} • ${fmt(p.wins)} vit.</small></div>`).join('')||'<p class="muted">Ranking ainda vazio.</p>';}catch{el.innerHTML='<p class="muted">Ranking indisponível.</p>';}}
function renderAchievementsPreview(){const el=$('#achievementPreview');if(!el)return;el.innerHTML=[['🏆','Primeira Vitória'],['🔥','Sequência de Vitórias'],['🌎','Primeiro Online'],['🎒','Colecionador']].map(a=>`<div class="achievement-chip"><span>${a[0]}</span><b>${a[1]}</b></div>`).join('');}

const GAME_MODES={uno:{label:'UNO',name:'Uno dos Idosos',icon:'🃏'}};
function openOnlineModes(){state.selectedGameMode='uno';navigate('onlineModeView');}
function selectOnlineMode(mode,format='quad'){state.selectedGameMode='uno';state.selectedFormat=format;navigate('rooms');renderRoomsHeader();loadRooms();}
function renderRoomsHeader(){const m=GAME_MODES[state.selectedGameMode]||GAME_MODES.uno;const f={duo:'DUO • 2 jogadores',trio:'TRIO • 3 jogadores',quad:'QUARTETO • 4 jogadores'}[state.selectedFormat]||'QUARTETO';if($('#roomsHeading'))$('#roomsHeading').textContent=`${f} • SALAS DE ${m.label}`;if($('#roomsModeSubtitle'))$('#roomsModeSubtitle').textContent=`${m.icon} ${m.name} • salas rápidas e matchmaking automático.`;}
function openCreateRoom(){if(!state.socket)connectSocket();populateRoomMaps();if($('#roomGameMode'))$('#roomGameMode').value=state.selectedGameMode||'uno';const max={duo:2,trio:3,quad:4}[state.selectedFormat]||4;if($('#roomMax'))$('#roomMax').value=String(max);show('#createRoomModal');}
function populateRoomMaps(){const el=$('#roomMap');if(!el)return;el.innerHTML=MAPS.filter(m=>m.id!=='map_ceo'||state.user?.role==='CEO').map(m=>`<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');}
async function openRooms(){state.selectedGameMode=state.selectedGameMode||'uno';navigate('rooms');renderRoomsHeader();await loadRooms();}
async function loadRooms(){const el=$('#roomsList');if(!el)return;try{const d=await get('/rooms?mode='+encodeURIComponent(state.selectedGameMode||'uno'));const rooms=d.rooms||[];const mode=GAME_MODES[state.selectedGameMode]||GAME_MODES.uno;el.innerHTML=rooms.length?rooms.map(r=>`<article class="room-card glass"><div class="room-cover map-${mapTheme(r.options?.mapId)}">${r.locked?'🔒':mode.icon}</div><div class="room-card-body"><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.ownerName)} • ${r.players.length}/${r.options.maxPlayers}</small></div><div class="room-tags"><span>${escapeHtml(mode.label)}</span><span>${r.locked?'COM SENHA':'ABERTA'}</span><span>${r.options.turnSeconds}s</span></div><button class="btn btn-primary btn-wide" data-join-room="${r.code}" type="button">${r.locked?'🔒 ENTRAR':'ENTRAR'}</button></div></article>`).join(''):`<div class="empty-state glass"><span>${mode.icon}</span><b>Nenhuma sala de ${escapeHtml(mode.label)} aberta.</b><small>Crie a primeira mesa desse modo.</small></div>`;}catch(e){el.innerHTML=`<div class="empty-state glass"><span>⚠️</span><b>Não foi possível carregar as salas.</b><small>${escapeHtml(e.message)}</small></div>`;}}
function mapTheme(id){return MAPS.find(m=>m.id===id)?.theme||'classroom';}
async function selectRoom(code){try{const d=await get('/rooms?mode='+encodeURIComponent(state.selectedGameMode||'uno'));const room=(d.rooms||[]).find(r=>r.code===code);if(!room)return toast('Sala não encontrada.','error');state.roomToJoin=room;$('#joinRoomInfo')&&($('#joinRoomInfo').innerHTML=`<b>${escapeHtml(room.name)}</b><br>${escapeHtml(room.ownerName)} • ${room.players.length}/${room.options.maxPlayers} • ${room.locked?'🔒 Com senha':'🌎 Aberta'}`);if($('#joinRoomPassword'))$('#joinRoomPassword').value='';show('#joinRoomModal');}catch(e){toast(e.message,'error');}}
function joinSelectedRoom(){const r=state.roomToJoin;if(!r)return;if(!state.socket)connectSocket();state.socket?.emit('room:join',{code:r.code,password:$('#joinRoomPassword')?.value||''});hide('#joinRoomModal');}
async function createRoom(){try{const body={name:$('#roomName')?.value||`Mesa de ${state.user.username}`,password:$('#roomPassword')?.value||'',gameMode:(['uno','draw','truco','checkers','chess'].includes($('#roomGameMode')?.value)?$('#roomGameMode').value:(state.selectedGameMode||'uno')),maxPlayers:Number($('#roomMax')?.value||4),turnSeconds:Number($('#roomTime')?.value||45),difficulty:$('#roomDifficulty')?.value||'medium',fillCount:4,mapId:$('#roomMap')?.value||'map_saloon',startingCards:Number($('#roomCards')?.value||7),autoFill:true,specials:$('#roomSpecials')?.checked!==false,stackDraw:$('#roomStack')?.checked===true,chat:$('#roomChat')?.checked!==false};if(body.gameMode==='draw')body.turnSeconds=Math.max(30,Number(body.turnSeconds)||45);state.selectedGameMode=body.gameMode;const d=await post('/rooms',body);hide('#createRoomModal');if(!state.socket)connectSocket();state.socket?.emit('room:join',{code:d.roomCode,password:body.password});}catch(e){toast(e.message,'error');}}
function leaveDrawingGame(){
  if(state.socket&&state.currentRoom)state.socket.emit('room:leave');
  state.currentRoom=null;state._drawingGame=null;stopDrawingTimer();if(drawSnapshotTimer)clearInterval(drawSnapshotTimer);drawSnapshotTimer=null;clearDrawingCanvas();navigate('lobby');
}
function renderRoom(room){
  if(!room)return;$('#roomTitle')&&($('#roomTitle').textContent=room.name);$('#roomCodeBadge')&&($('#roomCodeBadge').textContent=room.code);$('#roomOptionsText')&&($('#roomOptionsText').textContent=`${GAME_MODES[room.options?.gameMode]?.icon||'🎮'} ${GAME_MODES[room.options?.gameMode]?.label||'JOGO'} • ${room.players.length}/${room.options.maxPlayers} jogadores • ${room.options.turnSeconds}s`);if($('#btnStartRoom'))$('#btnStartRoom').style.display=String(room.ownerId)===String(state.user.id)&&!room.started?'inline-flex':'none';
  const list=$('#roomPlayers');if(list)list.innerHTML=room.players.map(p=>`<div class="room-player ${String(p.userId)===String(room.ownerId)?'host':''}"><div class="player-avatar">🙂</div><div><b>${escapeHtml(p.username)}</b><small>${String(p.userId)===String(room.ownerId)?'👑 Criador':'Jogador'} </small></div><span>${p.connected?'●':'○'}</span></div>`).join('');
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
  overlay.classList.remove('hidden');overlay.innerHTML=`<div class="game-start-card"><div class="game-start-kicker">${opts.online?'🌎 PARTIDA ONLINE':'🎯 PARTIDA'}</div><div id="gameStartNumber" class="game-start-number">5</div><div class="game-start-label">PREPARE A MESA!</div><div id="gameStartDeck" class="game-start-deck" aria-hidden="true">${Array.from({length:10},(_,i)=>`<span style="--d:${i}">${['7','+2','3','🌈','9','0','+4','5','↻','2'][i]}</span>`).join('')}</div></div>`;
  const n=$('#gameStartNumber');let value=5;playCountdownSound();
  const timer=setInterval(()=>{
    value--;
    if(value>0){n.textContent=String(value);n.classList.remove('pulse');void n.offsetWidth;n.classList.add('pulse');playCountdownSound();return;}
    clearInterval(timer);n.textContent='GO!';n.classList.add('go');playCountdownSound('go');
    overlay.classList.add('dealing');
    setTimeout(()=>{overlay.classList.add('hidden');overlay.classList.remove('dealing');gameIntroBusy=false;onDone?.();},1250);
  },900);
}
let soloMatchTimer=null;
function vibrate(pattern=[180,80,180]){try{navigator.vibrate?.(pattern)}catch{}}
function speakMatchFound(){try{if('speechSynthesis' in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance('Partida encontrada!');u.lang='pt-BR';u.rate=.92;u.pitch=1.05;window.speechSynthesis.speak(u);}}catch{}}
function showSoloMatchmaking(onFound){
  const overlay=$('#gameStartOverlay');if(!overlay){onFound?.();return;}
  if(soloMatchTimer)clearTimeout(soloMatchTimer);
  const limit=700+Math.floor(Math.random()*900);
  const started=Date.now();
  overlay.classList.remove('hidden');overlay.innerHTML=`<div class="game-start-card matchmaking-card"><div class="game-start-kicker">🎯 BUSCANDO MESA</div><div class="matchmaking-spinner">🃏</div><div class="matchmaking-title">Procurando uma mesa...</div><div id="matchmakingSeconds" class="matchmaking-seconds">${Math.ceil(limit/1000)}s</div><div class="matchmaking-bar"><i></i></div></div>`;
  const tick=setInterval(()=>{const left=Math.max(0,limit-(Date.now()-started));const el=$('#matchmakingSeconds');if(el)el.textContent=`${Math.ceil(left/1000)}s`;if(left<=0)clearInterval(tick);},120);
  soloMatchTimer=setTimeout(()=>{clearInterval(tick);overlay.innerHTML=`<div class="game-start-card match-found-card"><div class="game-start-kicker">🎯 OPONENTE ENCONTRADO</div><div class="match-found-icon">✓</div><div class="matchmaking-title">PARTIDA ENCONTRADA!</div><div class="match-found-sub">Preparando a mesa...</div></div>`;vibrate([250,100,250,100,400]);speakMatchFound();Sound.ok();setTimeout(()=>{showGameIntro(onFound,{online:false});},850);},limit);
}
function startSoloIntroAndGame(g,difficulty){
  navigate('game');setupTableCamera();$('#arenaShell')?.classList.add('solo-arena');
  const pick=IMMERSIVE_MAPS[Math.floor(Math.random()*IMMERSIVE_MAPS.length)];
  state.currentMapTheme=pick.theme;
  applyMapScene(pick.id);
  showSoloMatchmaking(()=>{state.solo=g;renderSolo();Sound.card();toast(`${state.soloIsTraining?`Treinamento • ${difficulty==='easy'?'Fácil':difficulty==='medium'?'Médio':'Difícil'} • `:''}${pick.name}`,'success');});
}

// ---------------- SOLO ----------------
function makeDeck(){const d=[];for(const color of COLORS){for(let n=0;n<=9;n++)d.push({id:crypto.randomUUID(),color,value:String(n),type:'number'});d.push({id:crypto.randomUUID(),color,value:'🚫',type:'skip'});d.push({id:crypto.randomUUID(),color,value:'🔄',type:'reverse'});d.push({id:crypto.randomUUID(),color,value:'+2',type:'draw2'});}for(let i=0;i<4;i++){d.push({id:crypto.randomUUID(),color:'black',value:'🌈',type:'wild'});d.push({id:crypto.randomUUID(),color:'black',value:'+4',type:'draw4'});}for(let i=d.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return d;}
function playable(card,top,color,hand=[],pendingDraw=0,stackDraw=false){
  if(!card||!top)return false;
  if(pendingDraw>0){
    if(!stackDraw)return false;
    const expected=pendingDraw===2?'draw2':pendingDraw===4?'draw4':null;
    if(!expected||card.type!==expected)return false;
  }
  if(card.type==='draw4'&&Array.isArray(hand)&&hand.some(c=>c!==card&&c.color!=='black'&&c.color===color))return false;
  return card.color==='black'||card.color===color||card.value===top.value;
}
let soloMode='uno';
function xpDifficulty(xp=0){const n=Math.max(0,Number(xp)||0);if(n>=5000)return 'hard';if(n>=1500)return 'medium';return 'easy';}
function startSoloMode(mode,difficulty='medium'){
  state.soloDifficulty=difficulty;
  if(mode==='uno'){ startSolo(difficulty); return; }
  if(mode==='draw'){ startLocalDrawGame(difficulty); return; }
  startTableSolo(mode,difficulty);
}
function startLocalDrawGame(difficulty){state._localDraw={mode:'draw',difficulty,round:1,score:0,word:['cachorro','avião','pizza','violão','robô','sorvete'][Math.floor(Math.random()*6)],drawing:false};navigate('modeGameView');renderLocalDraw();}
function startTableSolo(mode,difficulty){state._tableSolo={mode,difficulty,turn:'player',selected:null,opponentName:mode==='truco'?'Mestre da Mesa':mode==='checkers'?'Estrategista':'Mestre do Tabuleiro',message:'Começou! Faça sua jogada.'};navigate('modeGameView');renderTableSolo();}
function exitModeGame(){state._tableSolo=null;state._localDraw=null;navigate(state.currentRoom?'room':'solo');}
function renderLocalDraw(){const g=state._localDraw;if(!g)return;$('#modeGameBadge').textContent='🎨 GARTIC SOLO';$('#modeGameTitle').textContent='Adivinha o Desenho';$('#modeGameTurn').textContent='VOCÊ DESENHA';$('#modeGameMessage').textContent=`Palavra secreta: ${g.word} • desenhe e depois clique em REVELAR.`;$('#modeGameBody').innerHTML=`<div class="local-draw-board glass"><div class="local-draw-toolbar"><span>🎨 Quadro</span><button id="localReveal" class="btn btn-primary">REVELAR</button><button id="localClear" class="btn btn-secondary">LIMPAR</button></div><canvas id="localDrawCanvas" width="1000" height="560"></canvas><div id="localDrawReveal" class="local-reveal hidden"></div></div>`;const c=$('#localDrawCanvas'),ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height);let down=false;const pos=e=>{const r=c.getBoundingClientRect();const p=e.touches?.[0]||e;return{x:(p.clientX-r.left)*c.width/r.width,y:(p.clientY-r.top)*c.height/r.height}};const start=e=>{down=true;const p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y)};const move=e=>{if(!down)return;const p=pos(e);ctx.lineTo(p.x,p.y);ctx.strokeStyle='#111827';ctx.lineWidth=9;ctx.lineCap='round';ctx.stroke()};['mousedown','touchstart'].forEach(x=>c.addEventListener(x,start,{passive:true}));['mousemove','touchmove'].forEach(x=>c.addEventListener(x,move,{passive:true}));['mouseup','mouseleave','touchend'].forEach(x=>c.addEventListener(x,()=>down=false));on('#localClear','click',()=>{ctx.clearRect(0,0,c.width,c.height);ctx.fillStyle='#fff';ctx.fillRect(0,0,c.width,c.height)});on('#localReveal','click',()=>{const r=$('#localDrawReveal');r.classList.remove('hidden');r.textContent=`🔎 Era: ${g.word}`;g.round++;setTimeout(()=>{g.word=['cachorro','avião','pizza','violão','robô','sorvete'][Math.floor(Math.random()*6)];renderLocalDraw()},1800)});}
function renderTableSolo(){const g=state._tableSolo;if(!g)return;const labels={truco:['🂡 TRUCO','Truco do Velho'],checkers:['⚫ DAMAS','Damas de Botecão'],chess:['♟️ XADREZ','Xadrez do Bar']};$('#modeGameBadge').textContent=labels[g.mode][0];$('#modeGameTitle').textContent=labels[g.mode][1];$('#modeGameTurn').textContent=g.turn==='player'?'SUA VEZ':'OPONENTE PENSANDO';$('#modeGameMessage').textContent=g.message;const body=$('#modeGameBody');if(g.mode==='truco'){body.innerHTML=`<div class="truco-solo-board glass"><div class="table-opponent"><div class="solo-code-character">🤠</div><b>${g.opponentName}</b><small>Nível • ${g.difficulty}</small></div><div class="truco-center">🃏<strong>TRUCO!</strong><small>Rodada ${Math.floor(Math.random()*3)+1}</small></div><div class="truco-hand">${['A♥','K♣','7♦'].map((x,i)=>`<button class="playing-card-mini" data-card="${i}">${x}</button>`).join('')}</div><button id="callTruco" class="btn btn-primary">TRUCO!</button></div>`;$$('[data-card]').forEach(b=>b.onclick=()=>{g.message=`Você jogou ${b.textContent}. O oponente está pensando...`;g.turn='oponente';renderTableSolo();setTimeout(()=>{g.turn='player';g.message='Sua vez!';renderTableSolo()},520)});on('#callTruco','click',()=>{g.message='VOCÊ GRITOU TRUCO! O oponente está decidindo...';g.turn='oponente';renderTableSolo();setTimeout(()=>{g.turn='player';g.message=Math.random()>.35?'O oponente aceitou! Sua vez.':'O oponente recuou! Você ganhou a mão.';renderTableSolo()},520)});return;}const pieces=g.mode==='chess'?['♜','♞','♝','♛','♚','♝','♞','♜']:['⚫','⚫','⚫','⚫','⚫','⚫','⚫','⚫'];body.innerHTML=`<div class="board-solo glass"><div class="board-grid ${g.mode}">${Array.from({length:64},(_,i)=>`<button class="board-cell ${((Math.floor(i/8)+i)%2?'dark':'light')}" data-cell="${i}">${g.mode==='chess'&&i<8?pieces[i]:g.mode==='chess'&&i>=48?['♜','♞','♝','♛','♚','♝','♞','♜'][i-48]:g.mode==='checkers'&&(Math.floor(i/8)<3||Math.floor(i/8)>4)&&((Math.floor(i/8)+i)%2)?'⚫':''}</button>`).join('')}</div></div>`;$$('.board-cell').forEach(b=>b.onclick=()=>{g.message=`Jogada em ${Number(b.dataset.cell)+1}. O oponente está analisando a jogada...`;g.turn='oponente';renderTableSolo();setTimeout(()=>{g.turn='player';g.message='Sua vez! Escolha outra casa.';renderTableSolo()},2500)});}
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
function makeSolo(difficulty){const deck=makeDeck(),player=[],oponente=[];for(let i=0;i<7;i++){player.push(deck.pop());oponente.push(deck.pop());}let top=deck.pop();while(top.color==='black'){deck.unshift(top);top=deck.pop();}const names=['Zé do Baralho','Dona Cartolina','Mestre 7','Vó do UNO','Neto Relâmpago','Capitão Coringa'];return{difficulty,deck,player,oponente,discard:top,pile:[],color:top.color,pendingDraw:0,turn:'player',opponentName:names[Math.floor(Math.random()*names.length)]};}
function renderSolo(){
  const g=state.solo;if(!g)return;
  $('#roundText')&&($('#roundText').textContent='2 JOGADORES');
  $('#turnStatus')&&($('#turnStatus').textContent=g.turn==='player'?'SUA VEZ!':'VEZ DO OPONENTE');
  $('#turnStatus')?.classList.remove('oponente');
  renderArenaCard(g.discard,g.color);
  $('#deckCount')&&($('#deckCount').textContent=g.deck.length);
  if($('#opponents'))$('#opponents').innerHTML=`<div class="opponent-seat player-seat seat-0 solo-opponent" data-player-id="opponent">
    <div class="player-emote" data-emote-for="opponent"></div>
    ${gamePortraitMarkup(DEFAULT_AVATAR,g.opponentName)}
    <div class="player-nameplate"><b>${escapeHtml(g.opponentName)}</b><small>${g.oponente.length} CARTAS</small></div>
    <div class="mini-hand">${Array.from({length:Math.min(7,g.oponente.length)},()=>'<span class="back-mini">UNO</span>').join('')}</div>
  </div>`;
  const hand=$('#playerHand');
  if(hand){
    const cards=Array.isArray(g.player)?g.player:[];
    hand.innerHTML=cards.length?cards.map((c,i)=>cardHtml(c,i,cards.length)).join(''):'<div class="hand-empty">AGUARDE SUAS CARTAS...</div>';
    bindRenderedHand();
  }
  updateUnoButton(!!(g.player.length===1&&g.unoDeadline&&Date.now()<g.unoDeadline),g.unoDeadline);
  if(g.player.length!==1)clearUnoTimer();
  applyCamera();
}
function renderArenaCard(card,color){
  const el=$('#discardPile');if(el){
    const value=String(card?.value??'?');
    el.className=`uno-card card-${color||'red'} big-card center-card face-up-card`;
    el.innerHTML=`<span class="card-corner top">${escapeHtml(value)}</span><span class="card-symbol">${escapeHtml(value)}</span><span class="card-corner oponentetom">${escapeHtml(value)}</span>`;
    el.setAttribute('aria-label',`Carta na mesa: ${value}`);
  }
  if($('#colorIndicator'))$('#colorIndicator').textContent=COLOR_NAME[color]||color||'';
}

function cardHtml(c,i,n=7){const center=(n-1)/2;const delta=i-center;const rot=(delta*5).toFixed(2);const lift=Math.min(12,Math.abs(delta)*2).toFixed(1);return `<button class="uno-card card-${c.color} hand-card" data-index="${i}" style="--rot:${rot}deg;--lift:${lift}px;--z:${20+i};--i:${i}" type="button" aria-label="Jogar carta ${escapeHtml(c.value)}"><i>${escapeHtml(c.value)}</i><span>${escapeHtml(c.value)}</span><em>${c.type==='number'?'UNO':c.type.toUpperCase()}</em></button>`;}
function bindRenderedHand(){const hand=$('#playerHand');if(!hand)return;hand.querySelectorAll('.hand-card').forEach((el)=>{el.onclick=(ev)=>{ev.preventDefault();ev.stopPropagation();const index=Number(el.dataset.index);if(Number.isInteger(index))playHandCard(index);};});}
function playHandCard(index){if(state.solo)return playSoloCardAt(index);if(state.currentRoom)return playOnlineCardAt(index);}
function playSoloCardAt(index){const g=state.solo;if(!g||g.turn!=='player')return;Sound.click();const card=g.player[index];if(!playable(card,g.discard,g.color,g.player,g.pendingDraw,g.stackDraw))return toast('Essa carta não combina com a mesa.','error');if(card.color==='black'){state.pendingSoloCard={card};show('#colorModal');return;}applySoloCard(card);}
function applySoloCard(card,chosenColor){const g=state.solo;const i=g.player.findIndex(x=>x.id===card.id);if(i<0)return;g.player.splice(i,1);g.pile.push(g.discard);g.discard=card;g.pendingDraw=card.type==='draw2'?2:card.type==='draw4'?4:0;g.color=card.color==='black'?(COLORS.includes(chosenColor)?chosenColor:COLORS[Math.floor(Math.random()*4)]):card.color;Sound.card();if(card.type==='draw2')drawSolo(g.oponente,2);if(card.type==='draw4')drawSolo(g.oponente,4);Sound.play();if(['draw2','draw4','wild','skip','reverse'].includes(card.type))Sound.special();if(g.player.length===0)return finishSolo(true);if(g.player.length===1){g.unoDeadline=Date.now()+3200;}if(card.type==='skip'||card.type==='reverse'){g.turn='oponente';renderSolo();scheduleSoloOpponent(g);return;}g.turn='oponente';renderSolo();scheduleSoloOpponent(g);}
function drawSolo(hand,n){const g=state.solo;for(let i=0;i<n;i++){if(!g.deck.length){if(g.pile.length){g.deck=g.pile.splice(0);for(let j=g.deck.length-1;j>0;j--){const k=Math.floor(Math.random()*(j+1));[g.deck[j],g.deck[k]]=[g.deck[k],g.deck[j]];}}}if(g.deck.length)hand.push(g.deck.pop());}}
function drawGameCard(){
  if(state.solo){soloDraw();return;}
  const game=state._onlineGame;if(!game)return;
  const mine=String(game.currentPlayerId)===String(state.user?.id);if(!mine)return toast('Aguarde sua vez.','info');
  Sound.cardDraw();state.socket?.emit('game:draw');
}
async function reportCurrentOpponent(){
  const game=state._onlineGame;
  const opponents=Array.isArray(game?.players)?game.players.filter(p=>String(p.userId)!==String(state.user?.id)):[];
  const target=opponents[0];
  if(!target?.userId || !Number.isFinite(Number(target.userId))){
    return toast('A denúncia fica disponível quando houver outro jogador identificado na mesa.','info',2600);
  }
  const reason=window.prompt(`Por que você quer denunciar ${target.username||'este jogador'}?`, 'Comportamento inadequado na partida');
  if(reason===null)return;
  const clean=String(reason).trim().slice(0,255);
  if(!clean)return toast('Informe um motivo para a denúncia.','error');
  try{
    await post('/report',{targetId:Number(target.userId),reason:clean});
    toast('Denúncia enviada para análise.','success',3000);
  }catch(err){
    toast(err.message||'Não foi possível enviar a denúncia.','error',3200);
  }
}

function exitGame(){
  if(soloMatchTimer){clearTimeout(soloMatchTimer);soloMatchTimer=null;}
  clearTimeout(state.aiTimer);clearTimeout(state.turnGuardTimer);
  if(gameIntroBusy){gameIntroBusy=false;hide('#gameStartOverlay');}
  state.solo=null;state.soloIsTraining=false;state._onlineGame=null;state._pendingOnlineGame=null;
  if(state.currentRoom){state.socket?.emit('room:leave');state.currentRoom=null;navigate('rooms');return;}
  navigate('solo');
}
function soloDraw(){const g=state.solo;if(!g||g.turn!=='player')return;const count=g.pendingDraw>0?g.pendingDraw:1;drawSolo(g.player,count);g.pendingDraw=0;Sound.cardDraw();g.message=count>1?`Você comprou ${count} cartas e passou a vez.`:'Você comprou 1 carta e passou a vez.';g.turn='oponente';renderSolo();scheduleSoloOpponent(g);}
function opponentDelay(difficulty='medium'){const ranges={easy:[450,850],medium:[600,1100],hard:[800,1500]};const [min,max]=ranges[difficulty]||ranges.medium;return min+Math.floor(Math.random()*(max-min+1));}
function scheduleSoloOpponent(g){clearTimeout(state.aiTimer);state.aiTimer=setTimeout(()=>housePlayerTurn(),Math.min(9000,opponentDelay(g.difficulty)));}

function housePlayerTurn(){
  const g=state.solo;if(!g||g.turn!=='oponente')return;
  clearTimeout(state.aiTimer);
  const started=Date.now();
  const delay=Math.min(9000,opponentDelay(g.difficulty));
  setTimeout(()=>{
    if(!state.solo||state.solo!==g||g.turn!=='oponente')return;
    let cards=g.oponente.filter(c=>playable(c,g.discard,g.color,g.oponente,g.pendingDraw,g.stackDraw));
    if(g.pendingDraw>0)cards=[];
    let card=null;
    if(g.difficulty==='easy')card=cards[Math.floor(Math.random()*cards.length)]||null;
    else if(g.difficulty==='hard')card=cards.sort((a,b)=>opponentScore(g,b)-opponentScore(g,a))[0]||null;
    else card=cards.sort((a,b)=>cardScore(b)-cardScore(a))[0]||null;
    if(!card){drawSolo(g.oponente,g.pendingDraw||1);g.pendingDraw=0;g.turn='player';Sound.cardDraw();g.message='Oponente comprou e passou a vez.';renderSolo();return;}
    g.oponente.splice(g.oponente.indexOf(card),1);g.pile.push(g.discard);g.discard=card;g.pendingDraw=card.type==='draw2'?2:card.type==='draw4'?4:0;g.color=card.color==='black'?chooseOpponentColor(g.oponente):card.color;
    if(card.type==='draw2')drawSolo(g.player,2);if(card.type==='draw4')drawSolo(g.player,4);
    Sound.play();if(['draw2','draw4','wild','skip','reverse'].includes(card.type))Sound.special();
    if(g.oponente.length===0)return finishSolo(false);if(g.oponente.length===1){toast(`📣 ${g.opponentName} gritou UNO!`,'success',1800);Sound.uno();}
    g.turn='player';g.message=`${g.opponentName} jogou ${card.value}. Sua vez.`;renderSolo();
  },delay);
}
function cardScore(c){return c.type==='draw4'?100:c.type==='draw2'?80:c.type==='wild'?70:c.type==='skip'?50:c.type==='reverse'?40:Number(c.value)||0;}
function opponentScore(g,c){let n=cardScore(c);if(c.color===g.color)n+=20;if(g.player.length<=3&&c.type!=='number')n+=25;return n;}
function chooseOpponentColor(hand){const count={red:0,yellow:0,green:0,blue:0};hand.forEach(c=>{if(count[c.color]!=null)count[c.color]++;});return Object.entries(count).sort((a,b)=>b[1]-a[1])[0][0];}
function dancePodiumCharacters(entries){
  return entries.map((e,i)=>`<div class="podium-slot place-${i+1}"><div class="podium-confetti">${i===0?'👑':'✨'}</div><div class="podium-dancer">${characterMarkup(e.avatar||DEFAULT_AVATAR,e.name||'Jogador')}</div><div class="podium-base"><strong>${i+1}º</strong><b>${escapeHtml(e.name||'Jogador')}</b><small>${escapeHtml(e.label||'')}</small></div></div>`).join('');
}
function showPodium(entries){
  const overlay=$('#podiumOverlay');if(!overlay)return;const top=[...entries].slice(0,3);overlay.innerHTML=`<div class="podium-card"><button class="podium-close" id="btnClosePodium" type="button">×</button><span class="pill">🏆 PARTIDA ENCERRADA</span><h2>O PÓDIO DO BARALHO!</h2><p>Os campeões estão comemorando!</p><div class="podium-stage">${dancePodiumCharacters(top)}</div><button class="btn btn-primary btn-wide" id="btnPodiumLobby" type="button">🏠 VOLTAR AO LOBBY</button></div>`;overlay.classList.remove('hidden');Sound.win();[0,1,2].forEach(i=>setTimeout(()=>Sound.emote(),i*180));on('#btnClosePodium','click',closePodium);on('#btnPodiumLobby','click',closePodium);}
function closePodium(){hide('#podiumOverlay');state.solo=null;state._onlineGame=null;if(state.currentRoom){state.socket?.emit('room:leave');state.currentRoom=null;}navigate('lobby');}
async function finishSolo(win){const g=state.solo;if(!g)return;Sound.win();const coins=win?100:15,xp=win?180:50;toast(win?`🏆 Vitória! +${coins} moedas e +${xp} XP.`:`Partida encerrada. +${coins} moedas e +${xp} XP.`,win?'success':'info',5000);try{const d=await post('/game/solo-finish',{win,coins,xp,difficulty:g.difficulty});if(d.user){state.user=d.user;updateUserUI();}}catch{}const playerEntry={name:state.user?.username||'Jogador',avatar:state.profile?.avatar||DEFAULT_AVATAR,label:win?'CAMPEÃO':'JOGADOR'};const oponenteAvatar={...DEFAULT_AVATAR,character:['barman','rei','astronauta'][Math.floor(Math.random()*3)]};const others=[{name:'Oponente',avatar:oponenteAvatar,label:'Vice-campeão'},{name:'Oponente',avatar:{...DEFAULT_AVATAR,character:['rainha','astronauta','velhinho'][Math.floor(Math.random()*3)]},label:'3º lugar'}];const entries=win?[playerEntry,others[0],others[1]]:[others[0],playerEntry,others[1]];showPodium(entries);}

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
function playOnlineCardAt(index){const game=state._onlineGame;if(!game)return;const mine=String(game.currentPlayerId)===String(state.user.id);if(!mine)return toast('Aguarde sua vez.');const card=game.hand?.[index];if(!card)return;if(!playable(card,game.top,game.currentColor,game.hand,game.pendingDraw,game.stackDraw))return toast(game.pendingDraw>0?'Só vale empilhar a mesma carta de compra.':'Essa carta não pode ser jogada.','error');const chosenColor=card.color==='black'?chooseOpponentColor(game.hand):undefined;const source=$(`#playerHand .hand-card[data-index=\"${index}\"]`);source?.classList.add('card-selected-to-play');setTimeout(()=>source?.classList.remove('card-selected-to-play'),450);state.socket?.emit('game:play',{cardId:card.id,chosenColor});}

function renderTypingIndicator(m={}){const el=$('#gameChatTyping');if(!el)return;el.textContent=m.typing?`${escapeHtml(m.username||'Jogador')} está digitando...`:'';el.classList.toggle('hidden',!m.typing);}
function handleChatAction(m={}){ /* evento visual de chat; nunca altera turno ou navegação */ }
function handleGameAction(action={}){
  if(action.type==='play'){Sound.play();toast(`🃏 ${escapeHtml(action.username||'Jogador')} jogou uma carta.`,'info',1200);}
  else if(action.type==='draw'){Sound.cardDraw();}
  else if(action.type==='uno-penalty'){Sound.bad();toast(`⚠️ ${escapeHtml(action.username||'Jogador')} recebeu ${action.count||2} cartas.`,'error',1800);}
}
function handleGameEmote(m={}){
  const id=String(m.playerId||'');
  const target=$$('#opponents [data-emote-for]').find(el=>String(el.dataset.emoteFor||'')===id)||$('.self-emote');
  if(target){target.textContent=m.emote||'😀';target.classList.add('show');setTimeout(()=>target.classList.remove('show'),1600);}
}

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
function applyMapScene(mapId='map_velho_bar'){
  const shell=$('#arenaShell'); const scene=$('#mapScene'); const decor=$('#mapDecor');
  const theme=mapTheme(mapId); if(!shell||!scene)return;
  shell.dataset.mapTheme=theme;
  scene.className=`first-person-map map-${theme}`;
  const info=MAP_PERSONALITY[theme]||MAP_PERSONALITY.saloon;
  if(decor)decor.innerHTML=`<div class="map-atmosphere"><span class="atm-particle p1"></span><span class="atm-particle p2"></span><span class="atm-particle p3"></span></div><div class="map-props">${info.decor||''}</div>`;
  const sign=$('.map-sign'); if(sign)sign.textContent=info.label.toUpperCase();
  const cups=$$('.table-cup',scene); cups.forEach((c,i)=>c.textContent=theme==='quintal'?(i?'🧉':'🍉'):theme==='pier'?(i?'🥤':'🪣'):'🍺');
}
function startMapMusic(mapMusic='saloon'){
  // Paisagem sonora procedural leve: não depende de arquivos externos e não interfere no SQL/rede.
  try{
    if(!state.profile?.settings?.music) return;
    if(Sound.ambientTimer) clearInterval(Sound.ambientTimer);
    const presets={saloon:[196,247,294],modern:[220,277,330],forest:[174,220,261],medieval:[147,196,247],pirate:[165,208,247]};
    const notes=presets[mapMusic]||presets.saloon; let i=0;
    Sound.ambientTimer=setInterval(()=>{ if(document.hidden||!Sound.enabled)return; Sound.tone(notes[i++%notes.length],.28,'sine'); },3600);
  }catch{}
}
function renderPlayedCards(cards=[]){
  const el=$('#playedCards'); if(!el)return;
  const recent=Array.isArray(cards)?cards.slice(-5):[];
  el.innerHTML=recent.map((c,i)=>`<div class="played-mini uno-card card-${c.color||'red'}" style="--i:${i}"><span>${escapeHtml(c.value??'?')}</span></div>`).join('');
}
function applyCamera(){
  const seats=$$('#opponents .opponent-seat');
  const positions=[[-50,-3],[3,42],[82,42],[50,72]];
  seats.forEach((el,i)=>{const pos=positions[i%positions.length];el.style.setProperty('--seat-x',pos[0]+'%');el.style.setProperty('--seat-y',pos[1]+'%');el.style.setProperty('--seat-scale','1');el.style.zIndex=String(30+i);el.classList.remove('camera-near');});
}
function setupTableCamera(){state.cameraYaw=0;state.cameraPitch=0;state.cameraDragging=false;applyCamera();}

function gamePortraitMarkup(avatar,name='Jogador',count=''){
  return `<div class="avatar-photo-frame" aria-label="${escapeHtml(name)}">
    <div class="avatar-photo-bg"></div>
    <div class="avatar-photo-art">${characterMarkup(avatar||DEFAULT_AVATAR,name)}</div>
    <div class="avatar-photo-shine"></div>
  </div>`;
}
function renderOnlineGame(game){
  state._onlineGame=game;state.solo=null;
  if(state.currentView!=='game')navigate('game');
  setupTableCamera();
  const players=Array.isArray(game.players)?game.players:[];
  const playerCount=Math.max(2,players.length);
  $('#roundText')&&($('#roundText').textContent=playerCount===4?'2 VS 2':`${playerCount} JOGADORES`);
  const mine=String(game.currentPlayerId)===String(state.user.id);
  $('#turnStatus')&&($('#turnStatus').textContent=mine?'SUA VEZ!':'VEZ DO OPONENTE');
  $('#turnStatus')?.classList.remove('oponente');
  const theme=MAP_PERSONALITY[mapTheme(game.mapId)]||MAP_PERSONALITY.saloon;
  state.currentMapTheme=theme.music||'saloon';
  applyMapScene(game.mapId);startMapMusic(theme.music||'saloon');
  renderArenaCard(game.top,game.currentColor);
  $('#deckCount')&&($('#deckCount').textContent=game.deckCount);
  renderPlayedCards(game.recentDiscard||[]);
  const hand=$('#playerHand');
  if(hand){
    const cards=Array.isArray(game.hand)?game.hand:[];
    hand.innerHTML=cards.length?cards.map((c,i)=>cardHtml(c,i,cards.length)).join(''):'<div class="hand-empty">AGUARDE SUAS CARTAS...</div>';
    bindRenderedHand();
  }
  const ops=$('#opponents');
  if(ops){
    const others=players.filter(p=>String(p.userId)!==String(state.user.id));
    ops.innerHTML=others.slice(0,3).map((p,i)=>{
      const seat=i%3;
      const active=String(p.userId)===String(game.currentPlayerId);
      const char=gamePortraitMarkup(p.avatar||DEFAULT_AVATAR,p.username);
      return `<div class="opponent-seat player-seat seat-${seat} ${active?'active':''}" data-player-id="${escapeHtml(p.userId)}">
        <div class="player-emote" data-emote-for="${escapeHtml(p.userId)}"></div>
        ${char}
        <div class="player-nameplate"><b>${escapeHtml(p.username)}</b><small>${p.cardCount||0} CARTAS</small></div>
        <div class="mini-hand">${Array.from({length:Math.min(7,p.cardCount||0)},()=>'<span class="back-mini">UNO</span>').join('')}</div>
      </div>`;
    }).join('');
  }
  const self=$('.player-self');
  if(self){self.dataset.playerId=state.user.id;self.querySelector('.player-emote')?.setAttribute('data-emote-for','self');}
  updateUnoButton(!!game.unoRequired,game.unoRequired?Date.now()+3200:null);
  renderCharacter('#gameAvatar',state.profile.avatar);
  $('#gamePlayerName')&&($('#gamePlayerName').textContent=state.user.username);
  $('#gamePlayerId')&&($('#gamePlayerId').textContent='ID: '+state.user.id);
}
function characterMarkup(a,name=''){
  const x={...DEFAULT_AVATAR,...(a||{})};
  const seed=String(name||'Jogador').split('').reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);
  const hue=seed%360;
  const skin=escapeHtml(x.skinColor||'#d59b76');
  const hair=escapeHtml(x.hairColor||'#171717');
  const eyes=escapeHtml(x.eyes||'#1d2433');
  const chars={
    velhinho:{name:'Velhinho',power:'Compra sortuda',shirt:'#2f80ed',pants:'#23324a',accent:'#73d6ff'},
    barman:{name:'Barman',power:'+1 compra especial',shirt:'#9b5a2e',pants:'#34251d',accent:'#ffd166'},
    rainha:{name:'Rainha da Mesa',power:'Aura de sorte',shirt:'#8b5cf6',pants:'#3b2d75',accent:'#f0abfc'},
    astronauta:{name:'Astronauta',power:'Efeito espacial',shirt:'#e8eef7',pants:'#64748b',accent:'#60a5fa'},
    rei:{name:'Rei do Baralho',power:'Título dourado',shirt:'#b7791f',pants:'#4a2808',accent:'#fde68a'}
  };
  const ch=chars[x.character]||chars.velhinho;
  const tops={shirt_basic:'#2f80ed',shirt_red:'#ef4444',shirt_neon:'#06b6d4',shirt_gold:'#eab308',shirt_space:'#64748b'};
  const pantsMap={pants_basic:'#23324a',pants_black:'#111827',pants_neon:'#16a34a'};
  const shoesMap={shoes_basic:'#e5e7eb',shoes_red:'#ef4444',shoes_gold:'#facc15'};
  const shirt=tops[x.top]||ch.shirt, pants=pantsMap[x.oponentetom]||ch.pants, shoes=shoesMap[x.shoes]||'#e5e7eb';
  const glasses=['glasses_basic','glasses_cyan','glasses_gold'].includes(x.accessory);
  const gc=x.accessory==='glasses_cyan'?'#22d3ee':x.accessory==='glasses_gold'?'#facc15':'#111827';
  const backpack=x.accessory?.startsWith('backpack_') ? `<path d="M18 67 Q10 71 13 88 Q15 95 22 94 L28 91 L27 68Z" fill="${x.accessory==='backpack_space'?'#64748b':'#2563eb'}" stroke="#fff3" stroke-width="1.2"/>` : '';
  let hairShape=`<path d="M26 42 Q27 17 50 18 Q73 17 74 42 Q68 30 50 30 Q32 30 26 42Z" fill="${hair}"/>`;
  if(x.hair==='hair_curl') hairShape=`<path d="M26 43 Q20 29 29 19 Q38 10 47 19 Q55 7 65 19 Q80 17 74 43 Q67 30 50 30 Q33 30 26 43Z" fill="${hair}"/><circle cx="30" cy="20" r="5" fill="${hair}"/><circle cx="43" cy="14" r="5" fill="${hair}"/><circle cx="57" cy="14" r="5" fill="${hair}"/><circle cx="70" cy="22" r="5" fill="${hair}"/>`;
  if(x.hair==='hair_long') hairShape=`<path d="M25 44 Q24 14 50 17 Q76 14 75 44 L68 70 L61 66 V33 Q50 27 39 33 V66 L32 70Z" fill="${hair}"/>`;
  if(x.hair==='hair_mohawk') hairShape=`<path d="M30 40 L35 19 L41 27 L46 8 L51 27 L57 6 L61 27 L68 17 L71 40 Q62 30 50 30 Q38 30 30 40Z" fill="${hair}"/>`;
  if(x.hair==='hair_afro') hairShape=`<circle cx="50" cy="29" r="23" fill="${hair}"/><circle cx="31" cy="27" r="8" fill="${hair}"/><circle cx="69" cy="27" r="8" fill="${hair}"/>`;
  if(x.hair==='hair_ice') hairShape=`<path d="M26 41 Q30 14 48 19 L55 9 L61 20 L73 16 L74 42 Q65 30 50 30 Q34 30 26 41Z" fill="#e6fbff" stroke="#67e8f9" stroke-width="2"/>`;
  const crown=(x.character==='rei'||x.accessory==='hat_crown')?`<path d="M31 25 L34 11 L43 20 L50 7 L57 20 L66 11 L69 25Z" fill="#facc15" stroke="#fff0a3" stroke-width="2"/>`:'';
  const cap=x.accessory==='hat_cap'?`<path d="M27 28 Q50 9 73 28 L73 34 H27Z" fill="#263b67" stroke="#8ecbff" stroke-width="1.5"/>`:'';
  const glassesMarkup=glasses?`<g fill="#05070b" stroke="${gc}" stroke-width="2"><rect x="28" y="40" width="18" height="11" rx="4"/><rect x="54" y="40" width="18" height="11" rx="4"/><path d="M46 44 H54"/></g>`:'';
  const aura=x.effect?`<div class="char-aura ${escapeHtml(x.effect)}"></div>`:'';
  const uid=`c${seed}${String(x.character||'velhinho').replace(/\W/g,'')}`;
  return `<div class="chibi-3d-live char-3d-live code-character character-${escapeHtml(x.character||'velhinho')}" style="--avatar-hue:${hue}deg;--char-accent:${ch.accent}">${aura}<div class="chibi-ground"></div><svg viewBox="0 0 100 112" aria-label="${escapeHtml(name||ch.name)}" role="img"><defs><linearGradient id="${uid}" x1="0" x2="1" y1="0" y2="1"><stop stop-color="${shirt}"/><stop offset=".55" stop-color="${ch.accent}"/><stop offset="1" stop-color="#101827"/></linearGradient><radialGradient id="${uid}skin"><stop stop-color="#fff6"/><stop offset="1" stop-color="#0000"/></radialGradient></defs><ellipse cx="50" cy="106" rx="25" ry="5" fill="#0008"/><g class="chibi-backpack">${backpack}</g><path class="chibi-arm arm-left" d="M31 70 Q20 74 20 87 Q20 94 26 95 Q32 95 34 88 L38 78Z" fill="url(#${uid})" stroke="#fff3" stroke-width="1.3"/><path class="chibi-arm arm-right" d="M69 70 Q80 74 80 87 Q80 94 74 95 Q68 95 66 88 L62 78Z" fill="url(#${uid})" stroke="#fff3" stroke-width="1.3"/><path class="chibi-body" d="M31 67 Q50 61 69 67 L67 92 Q50 100 33 92Z" fill="url(#${uid})" stroke="#fff4" stroke-width="1.5"/><path d="M39 70 Q50 76 61 70" fill="none" stroke="#fff8" stroke-width="2"/><path d="M37 91 L47 91 L46 104 L34 104Z" fill="${pants}"/><path d="M53 91 L63 91 L66 104 L54 104Z" fill="${pants}"/><path d="M32 101 Q39 99 47 103 L47 108 Q37 109 30 106Z" fill="${shoes}"/><path d="M53 103 Q61 99 69 103 L71 106 Q62 110 52 108Z" fill="${shoes}"/><circle class="chibi-head" cx="50" cy="45" r="25" fill="${skin}"/><circle cx="50" cy="45" r="25" fill="url(#${uid}skin)"/>${hairShape}${cap}${crown}<circle cx="41" cy="45" r="3.1" fill="${eyes}"/><circle cx="59" cy="45" r="3.1" fill="${eyes}"/><path d="M41 57 Q50 65 59 57" fill="none" stroke="#5b3026" stroke-width="2.7" stroke-linecap="round"/>${glassesMarkup}<circle cx="32" cy="51" r="2" fill="#e89b87" opacity=".45"/><circle cx="68" cy="51" r="2" fill="#e89b87" opacity=".45"/></svg></div>`;
}
const ORIGINAL_CHARACTERS={
  velhinho:{name:'Velhinho',icon:'🧓',power:'Compra sortuda',req:'Inicial',unlock:true},
  barman:{name:'Barman',icon:'🍺',power:'+1 compra especial',req:'Loja • 650 moedas'},
  rainha:{name:'Rainha da Mesa',icon:'👑',power:'Aura de sorte',req:'Passe • nível 25'},
  astronauta:{name:'Astronauta',icon:'🚀',power:'Efeito espacial',req:'Loja • 1.200 moedas'},
  rei:{name:'Rei do Baralho',icon:'🃏',power:'Título dourado',req:'Passe • nível 75'}
};
function characterOwned(id){
  if(id==='velhinho'||state.user?.role==='CEO')return true;
  const u=state.user||{};const inv=new Set((state.inventory||[]).map(i=>i.id));
  if(id==='barman')return inv.has('character_barman')||Number(u.coins||0)>=650;
  if(id==='rainha')return inv.has('character_rainha')||Number(u.level||1)>=25;
  if(id==='astronauta')return inv.has('character_astronauta')||Number(u.coins||0)>=1200;
  if(id==='rei')return inv.has('character_rei')||Number(u.level||1)>=75;
  return false;
}
function openCharacters(){if(!state.profile)return toast('Perfil ainda não carregado.','error');navigate('characters');renderCharactersPage();}
function renderCharactersPage(){
  if(!state.profile)return;renderCharacter('#charactersPreview',state.profile.avatar);if($('#charactersPreviewName'))$('#charactersPreviewName').textContent=ORIGINAL_CHARACTERS[state.profile.avatar.character]?.name||'Velhinho';if($('#charactersPreviewPower'))$('#charactersPreviewPower').textContent=`Poder: ${ORIGINAL_CHARACTERS[state.profile.avatar.character]?.power||'Nenhum'}`;
  const el=$('#charactersCatalog');if(!el)return;el.innerHTML=Object.entries(ORIGINAL_CHARACTERS).map(([id,c])=>{const own=characterOwned(id),sel=(state.profile.avatar.character||'velhinho')===id;return `<button type="button" class="character-card-3d ${own?'unlocked':'locked'} ${sel?'selected':''}" data-character-id="${id}"><div class="character-card-visual">${characterMarkup({...state.profile.avatar,character:id},c.name)}</div><div class="character-card-info"><div><b>${c.icon} ${c.name}</b><span>${own?'DESBLOQUEADO':'🔒 BLOQUEADO'}</span></div><small>⚡ ${c.power}</small><em>${own?'Toque para usar':c.req}</em></div></button>`;}).join('');
  el.querySelectorAll('[data-character-id]').forEach(b=>b.onclick=()=>selectCharacter(b.dataset.characterId));
}
async function selectCharacter(id){const c=ORIGINAL_CHARACTERS[id];if(!c)return;if(!characterOwned(id)){toast(`🔒 ${c.name}: ${c.req}`,'info');return;}state.profile.avatar.character=id;renderCharactersPage();renderCharacter('#heroCharacter',state.profile.avatar);await persistCharacterSilently();Sound.ok();toast(`${c.name} equipado!`,'success');}

function populateCustomizer(){for(const [cat,id] of Object.entries({hair:'customHair',top:'customTop',oponentetom:'customOponentetom',shoes:'customShoes',accessory:'customAccessory',effect:'customEffect',emote:'customEmote',title:'customTitle'})){const el=$('#'+id);if(!el)continue;const owned=new Set(state.inventory.map(i=>i.id));const ids=(COSMETICS[cat]||[]).filter(x=>owned.has(x)||state.user?.role==='CEO');if(!ids.length)ids.push(COSMETICS[cat]?.[0]);el.innerHTML=ids.filter(Boolean).map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(itemName(x))}</option>`).join('');el.value=state.profile.avatar[cat]||ids[0]||'';el.onchange=()=>{state.profile.avatar[cat]=el.value;renderCharacter('#customCharacter',state.profile.avatar);};}
  if($('#customEyes')){$('#customEyes').value=state.profile.avatar.eyes||DEFAULT_AVATAR.eyes;$('#customEyes').onchange=e=>{state.profile.avatar.eyes=e.target.value;renderCharacter('#customCharacter',state.profile.avatar);};}
  if($('#customHairColor')){$('#customHairColor').value=state.profile.avatar.hairColor||DEFAULT_AVATAR.hairColor;$('#customHairColor').onchange=e=>{state.profile.avatar.hairColor=e.target.value;renderCharacter('#customCharacter',state.profile.avatar);};}
}
async function loadFriends(){try{const d=await get('/friends');state.friends=d.friends||[];state.invites=d.invites||[];renderFriends();updateMailBadge();}catch{state.friends=[];state.invites=[];renderFriends();updateMailBadge();}}
function renderFriends(){const el=$('#friendsList');if(!el)return;if(!state.friends.length){el.innerHTML='<div class="empty-state"><span>👥</span><b>Nenhum amigo ainda.</b><small>Use ＋ ADICIONAR para chamar um jogador.</small></div>';return;}el.innerHTML=state.friends.map(f=>`<div class="friend-row"><div class="friend-avatar">🙂</div><div class="friend-info"><b>${escapeHtml(f.username)}</b><small>ID: ${escapeHtml(f.id)}</small></div><span class="presence ${escapeHtml(f.status)}">${f.status==='online'?'● ONLINE':f.status==='away'?'● AUSENTE':'● OFFLINE'}</span>${f.status==='online'?`<button class="friend-invite" data-invite-friend="${f.id}" type="button">＋</button>`:'<span></span>'}</div>`).join('');}
function updateMailBadge(){const b=$('#mailBadge');if(!b)return;const n=state.invites.length;b.textContent=n;b.classList.toggle('hidden',n===0);}
function openMail(){renderMail();show('#mailModal');}
function renderMail(){const el=$('#mailContent');if(!el)return;if(!state.invites.length){el.innerHTML='<div class="empty-state glass"><span>📭</span><b>Correio vazio.</b><small>Nenhum convite pendente.</small></div>';return;}el.innerHTML=state.invites.map(i=>`<article class="mail-row glass"><div class="mail-icon">🎮</div><div><b>${escapeHtml(i.from_username||'Jogador')}</b><small>Convite para jogar ${escapeHtml(i.mode||'UNO')}.</small></div><button class="btn btn-primary" data-accept-invite="${i.id}" type="button">ACEITAR</button><button class="btn btn-secondary" data-decline-invite="${i.id}" type="button">IGNORAR</button></article>`).join('');}
async function addFriend(){const input=$('#friendUsername');if(!input)return;try{setMsg('#friendMessage','Adicionando...');const d=await post('/friends/add',{username:input.value});setMsg('#friendMessage',d.message||'Amigo adicionado!','success');input.value='';await loadFriends();}catch(e){setMsg('#friendMessage',e.message,'error');}}
function inviteFriend(id){if(!state.socket?.connected)return toast('Multiplayer ainda conectando.','error');state.socket.emit('friend:invite',{friendId:Number(id),mode:'UNO solo'});toast('Convite enviado!','success');}
async function acceptInvite(id){try{await post('/friends/invite/accept',{id:Number(id)});await loadFriends();renderMail();toast('Convite aceito!','success');}catch(e){toast(e.message,'error');}}
async function declineInvite(id){try{await post('/friends/invite/decline',{id:Number(id)});await loadFriends();renderMail();}catch(e){toast(e.message,'error');}}

async function toggleMaintenance(){
  const isCEO=String(state.user?.username||'').trim().toLowerCase()==='ceovelho' || String(state.user?.role||'').trim().toUpperCase()==='CEO';
  if(!isCEO)return;
  const btn=$('#btnMaintenance');
  const active=state.maintenance===true;
  try{
    if(active){
      await post('/ceo/unfreeze',{});
      hide('#maintenanceOverlay'); hide('#globalPauseBanner');
      state.maintenance=false;
      if(btn)btn.textContent='🛠️ ATIVAR MODO MANUTENÇÃO';
      if($('#maintenanceStatus'))$('#maintenanceStatus').textContent='Jogo normal';
      toast('Modo manutenção desativado.','success');
    }else{
      await post('/ceo/freeze',{message:'JOGO EM MANUTENÇÃO.'});
      // CEO não recebe o bloqueio, portanto continua vendo o painel normalmente.
      state.maintenance=true;
      if(btn)btn.textContent='▶️ LIBERAR O JOGO';
      if($('#maintenanceStatus'))$('#maintenanceStatus').textContent='Manutenção ativa para os jogadores';
      toast('Modo manutenção ativado para os jogadores.','success');
    }
  }catch(e){toast(e.message||'Não foi possível alterar a manutenção.','error');}
}

function applyMaintenance(paused,message){
  const isCEO=String(state.user?.username||'').trim().toLowerCase()==='ceovelho' || String(state.user?.role||'').trim().toUpperCase()==='CEO';
  state.maintenance=Boolean(paused);
  if(isCEO){ hide('#maintenanceOverlay'); hide('#globalPauseBanner'); return; }
  const overlay=$('#maintenanceOverlay');
  if(paused){
    if($('#maintenanceMessage'))$('#maintenanceMessage').textContent=message||'Estamos fazendo melhorias na mesa.';
    show('#maintenanceOverlay');
    if($('#globalPauseBanner'))$('#globalPauseBanner').textContent='🛠️ JOGO EM MANUTENÇÃO';
    show('#globalPauseBanner');
  }else{ hide('#maintenanceOverlay'); hide('#globalPauseBanner'); }
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
  try{
    const h=await get('/health');
    state.maintenance=Boolean(h?.paused);
    const btn=$('#btnMaintenance');
    if(btn)btn.textContent=state.maintenance?'▶️ LIBERAR O JOGO':'🛠️ ATIVAR MODO MANUTENÇÃO';
    if($('#maintenanceStatus'))$('#maintenanceStatus').textContent=state.maintenance?'Manutenção ativa para os jogadores':'Jogo normal';
  }catch{}
  void loadCEOUsers();
}
async function ceoAction(path,body){try{const d=await post(path,body||{});toast(d.message||'Comando executado.','success');loadCEOUsers()}catch(e){toast(e.message,'error')}}
async function loadCEOUsers(){const box=document.querySelector('#ceoUsers');if(!box)return;box.innerHTML='<div class="loading">Carregando...</div>';try{const d=await get('/ceo/users');box.innerHTML=(d.users||[]).map(u=>`<div class="ceo-user-row"><div><b>${escapeHtml(u.username)}</b><small>ID ${u.id} • Nível ${u.level} • ${u.xp} XP • 🪙 ${u.coins}</small></div><div class="ceo-user-actions"><button data-xp="${u.id}" type="button">ZERAR XP</button><button data-coins="${u.id}" type="button">ZERAR MOEDAS</button><button data-inventory="${u.id}" type="button">LIMPAR INVENTÁRIO</button></div></div>`).join('')||'<div>Nenhum jogador.</div>';box.querySelectorAll('[data-xp]').forEach(b=>b.onclick=()=>ceoAction('/ceo/reset-xp',{userId:Number(b.dataset.xp)}));box.querySelectorAll('[data-coins]').forEach(b=>b.onclick=()=>ceoAction('/ceo/reset-coins',{userId:Number(b.dataset.coins)}));box.querySelectorAll('[data-inventory]').forEach(b=>b.onclick=()=>ceoAction('/ceo/clear-inventory',{userId:Number(b.dataset.inventory)}));}catch(e){box.innerHTML='<div class="error">'+escapeHtml(e.message)+'</div>'}}

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
  const slots=[['top','👕'],['hair','💇'],['oponentetom','👖'],['shoes','👟'],['accessory','🕶️']];
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
function applySettings(){const s={...defaults(),...(state.profile?.settings||{})};const ids=[['setMusic',s.music],['setSfx',s.sfx],['setAnimations',s.animations],['setReducedMotion',s.reducedMotion],['setWorldChat',s.chatWorld],['setRoomChat',s.chatRoom],['setPrivateChat',s.chatPrivate],['setDnd',s.doNotDisturb]];ids.forEach(([id,v])=>{if($('#'+id))$('#'+id).checked=!!v;});if($('#setMusicVol'))$('#setMusicVol').value=s.musicVolume;if($('#setSfxVol'))$('#setSfxVol').value=s.sfxVolume;Sound.enabled=s.sfx!==false;Sound.volume=Number(s.sfxVolume)||.7;document.documentElement.style.setProperty('--motion',s.reducedMotion?'0':'1');}
let settingsSaveTimer=null;function saveSettings(){if(!state.profile)return;const s={music:!!$('#setMusic')?.checked,musicVolume:Number($('#setMusicVol')?.value||.35),sfx:!!$('#setSfx')?.checked,sfxVolume:Number($('#setSfxVol')?.value||.7),animations:!!$('#setAnimations')?.checked,reducedMotion:!!$('#setReducedMotion')?.checked,chatWorld:!!$('#setWorldChat')?.checked,chatRoom:!!$('#setRoomChat')?.checked,chatPrivate:!!$('#setPrivateChat')?.checked,doNotDisturb:!!$('#setDnd')?.checked};state.profile.settings=s;applySettings();clearTimeout(settingsSaveTimer);settingsSaveTimer=setTimeout(async()=>{try{await put('/profile',{avatar:state.profile.avatar,settings:s,bio:state.profile.bio||''});}catch{}},400);}

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
async function logout(){
  try{if(state.currentRoom?.code)state.socket?.emit('room:leave');}catch{}
  try{await post('/logout');}catch{}
  try{state.socket?.disconnect();}catch{}
  clearTimeout(state.aiTimer);clearTimeout(state.turnGuardTimer);clearTimeout(soloMatchTimer);soloMatchTimer=null;
  state.solo=null;state._onlineGame=null;state._pendingOnlineGame=null;state.currentRoom=null;
  localStorage.removeItem('uv_token');state.user=null;state.profile=null;state.token=null;
  hide('#appScreen');show('#authScreen');switchAuth('login');
}

window.addEventListener('DOMContentLoaded',init);
window.addEventListener('load',updateOrientationGuard);

