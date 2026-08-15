const CFG=window.VELHO_CONFIG||{};
const API=(CFG.API_URL||"").replace(/\/$/,"");
let token=localStorage.getItem("vu_token")||"";
let me=JSON.parse(localStorage.getItem("vu_me")||"null");
let socket=null,room=null,pendingWild=null;

const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
function toast(t){let e=document.createElement("div");e.className="toast";e.textContent=t;document.body.appendChild(e);setTimeout(()=>e.remove(),2300)}
function view(id){$$(".view").forEach(x=>x.classList.add("hidden"));$(id).classList.remove("hidden")}
function authHeaders(){return token?{"Authorization":"Bearer "+token,"Content-Type":"application/json"}:{"Content-Type":"application/json"}}
async function api(path,opt={}){let r=await fetch(API+path,{...opt,headers:{...authHeaders(),...(opt.headers||{})}});let d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Erro de comunicação");return d}
function save(){localStorage.setItem("vu_token",token);localStorage.setItem("vu_me",JSON.stringify(me))}
function clear(){localStorage.removeItem("vu_token");localStorage.removeItem("vu_me");token="";me=null}
function cardClass(c){return c.color==="wild"?"wild":c.color}
function cardLabel(c){return ({skip:"⊘",reverse:"↻",draw2:"+2",wild:"★",draw4:"+4"}[c.value]||c.value)}
function renderGame(s){
  room=s;
  $("#roomCodeLabel").textContent=s.code;
  $("#pauseBanner").classList.toggle("hidden",!s.paused);
  $("#turnText").textContent=s.status==="waiting"?"Aguardando jogadores...":s.status==="finished"?"🏆 Partida encerrada":s.current_user_id===me.id?"🔥 SUA VEZ!":"Vez de "+(s.current_player_name||"outro jogador");
  $("#players").innerHTML=s.players.map(p=>`<div class="player ${p.id===s.current_player_id?"active":""}"><span>${escapeHtml(p.display_name)} ${p.is_host?"👑":""}</span><span>${p.cards_count} cartas · ${p.score} pts</span></div>`).join("");
  let top=s.top_card;
  $("#topCard").className="card top "+cardClass(top);
  $("#topCard").textContent=cardLabel(top);
  let hand=s.my_hand||[];
  $("#hand").innerHTML=hand.map((c,i)=>`<button class="card ${cardClass(c)}" data-i="${i}" ${s.current_user_id===me.id&&!s.paused&&s.status==="playing"?"":"disabled"}>${cardLabel(c)}</button>`).join("");
  $$("#hand .card").forEach(b=>b.onclick=()=>playCard(+b.dataset.i));
  $("#startGameBtn").classList.toggle("hidden",!s.is_host||s.status!=="waiting");
  $("#pauseBtn").classList.toggle("hidden",!s.is_admin||s.status!=="playing");
}
function escapeHtml(t){let d=document.createElement("div");d.textContent=t;return d.innerHTML}
async function connectSocket(){
  if(!API||API.includes("SEU-BACKEND")){toast("Configure a URL do backend em config.js.");return}
  socket=io(API,{auth:{token}});
  socket.on("connect",()=>{$("#connection").textContent="● online";$("#connection").className="status online"});
  socket.on("disconnect",()=>{$("#connection").textContent="● offline";$("#connection").className="status offline"});
  socket.on("room_state",renderGame);
  socket.on("chat_message",m=>addChat(m));
  socket.on("room_closed",()=>{toast("A sala foi encerrada.");room=null;view("#menu")});
  socket.on("error_message",m=>toast(m));
}
function addChat(m){let d=document.createElement("div");d.className="chat-msg";d.innerHTML=`<b>${escapeHtml(m.display_name)}:</b> ${escapeHtml(m.message)}`;$("#chatLog").appendChild(d);$("#chatLog").scrollTop=999999}
async function login(u,p){let d=await api("/api/auth/login",{method:"POST",body:JSON.stringify({username:u,password:p})});token=d.token;me=d.user;save();enterApp()}
async function register(u,n,p){let d=await api("/api/auth/register",{method:"POST",body:JSON.stringify({username:u,display_name:n,password:p})});token=d.token;me=d.user;save();enterApp()}
async function enterApp(){$("#intro").classList.add("hidden");$("#auth").classList.add("hidden");$("#app").classList.remove("hidden");$("#me").textContent="👤 "+me.display_name;view("#menu");connectSocket()}
function leaveRoom(){if(socket&&room)socket.emit("leave_room");room=null;$("#chatLog").innerHTML="";view("#menu")}
async function playCard(i){if(!room)return;let c=room.my_hand[i];if(c.color==="wild"){pendingWild=i;$("#colorPicker").classList.remove("hidden");return}socket.emit("play_card",{room_id:room.id,index:i})}
$$(".tab").forEach(b=>b.onclick=()=>{$$(".tab").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#loginForm").classList.toggle("hidden",b.dataset.tab!=="login");$("#registerForm").classList.toggle("hidden",b.dataset.tab!=="register");$("#authMsg").textContent=""});
$("#startBtn").onclick=()=>{$("#intro").classList.add("hidden");$("#auth").classList.remove("hidden")};
$("#loginForm").onsubmit=async e=>{e.preventDefault();try{await login($("#loginUser").value.trim(),$("#loginPass").value)}catch(x){$("#authMsg").textContent=x.message}};
$("#registerForm").onsubmit=async e=>{e.preventDefault();try{await register($("#regUser").value.trim(),$("#regName").value.trim(),$("#regPass").value)}catch(x){$("#authMsg").textContent=x.message}};
$("#logoutBtn").onclick=()=>{if(socket)socket.disconnect();clear();location.reload()};
$("#homeBtn").onclick=()=>view("#menu");
$("#onlineBtn").onclick=()=>view("#rooms");
$("#rankBtn").onclick=async()=>{try{let d=await api("/api/ranking");$("#rankingList").innerHTML='<div class="rank-row"><span>#</span><span>Jogador</span><span>Vitórias</span><span>Pontos</span></div>'+d.ranking.map((x,i)=>`<div class="rank-row"><span>${i+1}</span><span>${escapeHtml(x.display_name)}</span><span>${x.wins}</span><span>${x.points}</span></div>`).join("");view("#ranking")}catch(e){toast(e.message)}};
$("#settingsBtn").onclick=()=>view("#settings");
$("#soloBtn").onclick=()=>toast("O modo solo ficará disponível no próximo módulo; o online já usa o servidor.");
$("#createRoomBtn").onclick=()=>{if(!socket)return toast("Backend não configurado.");socket.emit("create_room",{max_players:+$("#maxPlayers").value,password:$("#roomPassword").value,chat_enabled:$("#chatEnabled").checked,swap_enabled:$("#swapEnabled").checked})};
$("#joinRoomBtn").onclick=()=>{if(!socket)return toast("Backend não configurado.");socket.emit("join_room",{code:$("#roomCode").value.trim().toUpperCase(),password:$("#joinPassword").value})};
$("#startGameBtn").onclick=()=>socket.emit("start_game",{room_id:room.id});
$("#pauseBtn").onclick=()=>socket.emit("toggle_pause",{room_id:room.id});
$("#leaveRoomBtn").onclick=leaveRoom;
$("#drawBtn").onclick=()=>socket.emit("draw_card",{room_id:room.id});
$("#unoBtn").onclick=()=>socket.emit("say_uno",{room_id:room.id});
$("#colorPicker").onclick=e=>{let c=e.target.dataset.color;if(!c||pendingWild===null)return;socket.emit("play_card",{room_id:room.id,index:pendingWild,color:c});pendingWild=null;$("#colorPicker").classList.add("hidden")};
$("#chatForm").onsubmit=e=>{e.preventDefault();let m=$("#chatInput").value.trim();if(!m||!room)return;socket.emit("chat",{room_id:room.id,message:m});$("#chatInput").value=""};
$$(".back").forEach(b=>b.onclick=()=>view("#menu"));
if(token&&me)enterApp();