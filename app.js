(() => {
"use strict";
const CFG = window.VELHO_CONFIG || {}, API = (CFG.API_URL || "").replace(/\/$/, "");
let token = localStorage.getItem("uv_token") || "", me = JSON.parse(localStorage.getItem("uv_me") || "null"), socket = null;
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? "").replace(/[&<>"']/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

function save() { localStorage.setItem("uv_token", token); localStorage.setItem("uv_me", JSON.stringify(me)); }
function clear() { localStorage.removeItem("uv_token"); localStorage.removeItem("uv_me"); token = ""; me = null; }

async function api(path, opts = {}) {
  const r = await fetch(API + path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}), ...(token ? { "Authorization": "Bearer " + token } : {}) }
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.error || "Erro de comunicação");
  return d;
}

function toast(t) { const x = $("#toast"); x.textContent = t; x.classList.add("show"); setTimeout(() => x.classList.remove("show"), 2400); }
function panel(html) { $("#modalContent").innerHTML = html; $("#modal").classList.remove("hidden"); }
function close() { $("#modal").classList.add("hidden"); }

function setPlatform(mode) {
  const p = mode === "mobile" ? "mobile" : "desktop";
  document.body.classList.remove("platform-mobile", "platform-desktop");
  document.body.classList.add("platform-" + p);
  localStorage.setItem("uv_platform", p);
  $("#platformGate")?.remove();
  window.VELHO_PLATFORM = p;
}

function initPlatform() {
  const gate = $("#platformGate");
  if (!gate) return;
  const saved = localStorage.getItem("uv_platform");
  if (saved) { setPlatform(saved); return; }
  gate.querySelectorAll("[data-platform]").forEach(b => b.onclick = () => setPlatform(b.dataset.platform));
  $("#autoPlatform").onclick = () => setPlatform(/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || matchMedia("(max-width:760px)").matches ? "mobile" : "desktop");
}

function connect() {
  if (!token || !window.io) return;
  socket = io(API || undefined, { auth: { token }, transports: ["websocket", "polling"] });
  socket.on("connect", () => { if($("#status")) $("#status").textContent = "🟢 online"; refreshStats(); });
  socket.on("disconnect", () => { if($("#status")) $("#status").textContent = "🔴 offline"; });
  socket.on("connect_error", () => { if($("#status")) $("#status").textContent = "🟠 erro"; });
}

function enter() {
  if (!me) return;
  $("#intro")?.classList.add("hidden");
  $("#auth")?.classList.add("hidden");
  $("#app")?.classList.remove("hidden");
  if($("#me")) $("#me").textContent = me.display_name || me.username;
  if($("#admin")) $("#admin").classList.toggle("hidden", !me.is_admin);
  connect();
  refreshStats();
}

async function login(u, p) {
  const d = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: u, password: p }) });
  token = d.token;
  me = d.user;
  save();
  enter();
}

async function register(u, n, p) {
  const d = await api("/api/auth/register", { method: "POST", body: JSON.stringify({ username: u, display_name: n, password: p }) });
  token = d.token;
  me = d.user;
  save();
  enter();
}

async function safeApi(path, opts = {}, fallback) {
  try { return await api(path, opts); } catch (e) { if (fallback !== undefined) return fallback; throw e; }
}

async function refreshStats() {
  const d = await safeApi("/api/rooms", { method: "GET" }, null);
  if (d?.rooms && $("#roomCount")) $("#roomCount").textContent = d.rooms.length;
  const p = await safeApi("/api/online", { method: "GET" }, null);
  if (p?.players && $("#onlineCount")) $("#onlineCount").textContent = p.players.length;
  measurePing();
}

async function measurePing() {
  const t = performance.now();
  try { await fetch((API || "") + "/health", { cache: "no-store" }); if($("#ping")) $("#ping").textContent = Math.round(performance.now() - t); } catch { if($("#ping")) $("#ping").textContent = "--"; }
}

function fpsMeter() {
  let frames = 0, last = performance.now();
  function f(now) {
    frames++;
    if (now - last >= 1000) { if($("#fps")) $("#fps").textContent = frames; frames = 0; last = now; }
    requestAnimationFrame(f);
  }
  requestAnimationFrame(f);
}

async function introThenAuth() {
  if (token) {
    try {
      const d = await api("/api/auth/me");
      me = d.user;
      save();
      setTimeout(enter, 3900);
      return;
    } catch { clear(); }
  }
  setTimeout(() => { $("#intro")?.classList.add("hidden"); $("#auth")?.classList.remove("hidden"); }, 4000);
}

function onlinePanel() {
  panel(`<h2>🌐 Jogar Online</h2><p>Partidas com <b>mínimo de 2 jogadores</b> e mapas imersivos de mesa.</p>
  <div class="card-grid"><button id="createRoom">🚪 Criar porta</button><button id="joinRoom">🔑 Entrar em porta</button><button id="publicRooms">🌎 Salas públicas</button></div><div id="onlineArea" class="cmd">Escolha uma opção.</div>`);
  $("#createRoom").onclick = () => roomCreateUI();
  $("#joinRoom").onclick = () => roomJoinUI();
  $("#publicRooms").onclick = () => roomsUI();
}

function roomCreateUI() {
  panel(`<h2>🚪 Criar porta</h2><div class="card-grid">
  <div><label>Nome da sala<input id="roomName" class="control-input" maxlength="30" placeholder="Mesa do Velho"></label></div>
  <div><label>Mapa de Mesa<select id="map" class="control-select"><option>Mesa de Madeira Rústica</option><option>Mesa de Cassino do Velho</option><option>Mesa de Bar Velho (Western)</option><option>Taberna Medieval</option><option>Salão Neon</option></select></label></div>
  <div><label>Máximo de jogadores<select id="maxPlayers" class="control-select"><option>2</option><option selected>4</option><option>6</option><option>8</option></select></label></div>
  <div><label>Cartas especiais<select id="specials" class="control-select"><option>Normal</option><option>Troca cartas</option><option>Sem +4</option><option>Sem +2</option></select></label></div>
  </div><button class="primary" id="doCreate">CRIAR PORTA</button><div id="roomResult"></div>`);
  $("#doCreate").onclick = async () => {
    try {
      const d = await api("/api/rooms", { method: "POST", body: JSON.stringify({ name: $("#roomName").value.trim() || "Mesa do Velho", map: $("#map").value, max_players: +$("#maxPlayers").value, special_rules: $("#specials").value, public: true }) });
      $("#roomResult").innerHTML = `<div class="cmd">Porta criada: <b>${esc(d.room?.code || d.code || "----")}</b><br>Compartilhe a porta com os jogadores.</div>`;
      refreshStats();
    } catch (e) { $("#roomResult").innerHTML = `<div class="cmd">${esc(e.message)}</div>`; }
  };
}

function roomJoinUI() {
  panel(`<h2>🔑 Entrar em porta</h2><input id="roomCode" class="control-input" maxlength="4" minlength="4" placeholder="AB12" style="text-transform:uppercase"><button class="primary" id="doJoin">ENTRAR</button><div id="joinResult"></div>`);
  $("#doJoin").onclick = async () => {
    const code = $("#roomCode").value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) return toast("A porta precisa ter 4 caracteres.");
    try {
      await api("/api/rooms/" + encodeURIComponent(code) + "/join", { method: "POST" });
      $("#joinResult").innerHTML = "<div class='cmd success'>Entrada autorizada.</div>";
    } catch (e) { $("#joinResult").innerHTML = `<div class="cmd">${esc(e.message)}</div>`; }
  };
}

async function roomsUI() {
  panel("<h2>🌎 Salas públicas</h2><div id='roomsList'>Carregando...</div>");
  try {
    const d = await api("/api/rooms");
    $("#roomsList").innerHTML = (d.rooms || []).map(r => `<div class="room-row"><span><b>${esc(r.name)}</b><br><small>${esc(r.map)} • ${r.players || 0}/${r.max_players}</small></span><button data-room="${esc(r.code)}">ENTRAR</button></div>`).join("") || "<p>Nenhuma sala aberta.</p>";
    $$("[data-room]").forEach(b => b.onclick = async () => {
      try { await api("/api/rooms/" + b.dataset.room + "/join", { method: "POST" }); toast("Entrou na sala."); close(); } catch (e) { toast(e.message); }
    });
  } catch (e) { $("#roomsList").innerHTML = `<div class='cmd'>${esc(e.message)}</div>`; }
}

function soloPanel() {
  panel(`<h2>🤖 Solo</h2><p>Treinamento ou partida contra máquina na mesa.</p><div class="card-grid"><button>🎓 Treinamento</button><button>🤖 Contra máquina</button></div>`);
}

async function shopPanel() {
  panel(`<h2>🛒 Loja BrutoCoins</h2><p>Compre itens e mesas com suas <b>BrutoCoins</b>!</p>
  <div class="card-grid">
    <button onclick="window.comprarItem(1)">🏜️ Mesa de Bar Velho (1500 💰)</button>
    <button onclick="window.comprarItem(2)">🎲 Mesa de Cassino (500 💰)</button>
    <button onclick="window.comprarItem(3)">🔫 Revólver Decorativo (3000 💰)</button>
    <button onclick="window.comprarItem(4)">🐷 Skin Porco Açougueiro (5000 💰)</button>
  </div><div id="shopMsg" class="cmd" style="margin-top:10px;">Selecione um item.</div>`);
}

window.comprarItem = async function(itemId) {
  try {
    const res = await api("/api/shop/buy", { method: "POST", body: JSON.stringify({ item_id: itemId }) });
    $("#shopMsg").innerHTML = `<span style="color:#4caf50;">${esc(res.message || "Comprado com sucesso!")}</span>`;
    refreshStats();
  } catch (e) { $("#shopMsg").innerHTML = `<span style="color:#ff5252;">${esc(e.message)}</span>`; }
};

function characterPanel() {
  panel(`<h2>🧑 Seu personagem</h2><p>Personalize seu visual e skins recolhidas.</p><div class="card-grid"><button>👤 Rosto</button><button>👁️ Olhos</button><button>💇 Cabelo</button></div>`);
}

function settingsPanel() {
  panel(`<h2>⚙️ Configurações</h2><div class="card-grid"><button id="musicToggle">🎵 Música: ${localStorage.getItem("uv_music") !== "off" ? "ON" : "OFF"}</button><button id="soundToggle">🔊 Som: ${localStorage.getItem("uv_sound") !== "off" ? "ON" : "OFF"}</button><button id="graphics">🎮 Gráficos: ${localStorage.getItem("uv_graphics") || "médio"}</button><button id="brightness">☀️ Brilho: ${localStorage.getItem("uv_brightness") || "100"}%</button></div>`);
  $("#musicToggle").onclick = () => { const v = localStorage.getItem("uv_music") === "off" ? "on" : "off"; localStorage.setItem("uv_music", v); settingsPanel(); };
  $("#soundToggle").onclick = () => { const v = localStorage.getItem("uv_sound") === "off" ? "on" : "off"; localStorage.setItem("uv_sound", v); settingsPanel(); };
  $("#graphics").onclick = () => { const a = ["baixo", "médio", "alto"], c = localStorage.getItem("uv_graphics") || "médio", n = a[(a.indexOf(c) + 1) % a.length]; localStorage.setItem("uv_graphics", n); settingsPanel(); };
  $("#brightness").onclick = () => { let n = +(localStorage.getItem("uv_brightness") || 100); n = n >= 100 ? 60 : n + 20; localStorage.setItem("uv_brightness", n); document.documentElement.style.filter = `brightness(${n / 100})`; settingsPanel(); };
}

async function ranking() {
  try {
    const d = await api("/api/ranking");
    panel("<h2>🏆 Pódio</h2>" + (d.ranking || []).map((x, i) => `<div class="cmd">#${i + 1} — ${esc(x.display_name)} · ${x.wins || 0} vitórias</div>`).join("") || "<p>Sem jogadores.</p>");
  } catch (e) { panel(`<h2>🏆 Pódio</h2><div class="cmd">${esc(e.message)}</div>`); }
}

function adminPanel() {
  panel(`<h2>👑 Central do Velho</h2><p>Painel administrativo do CEO.</p><div id="adminOutput" class="cmd">Painel ativo.</div>`);
}

function bind() {
  $$(".tab").forEach(b => b.onclick = () => {
    $$(".tab").forEach(x => x.classList.remove("active"));
    b.classList.add("active");
    $("#loginForm")?.classList.toggle("hidden", b.dataset.tab !== "login");
    $("#registerForm")?.classList.toggle("hidden", b.dataset.tab !== "register");
    if($("#authMsg")) $("#authMsg").textContent = "";
  });

  if($("#loginForm")) $("#loginForm").onsubmit = async e => {
    e.preventDefault();
    if($("#authMsg")) $("#authMsg").textContent = "Entrando...";
    try { await login($("#loginUser").value.trim(), $("#loginPass").value); } catch (x) { if($("#authMsg")) $("#authMsg").textContent = x.message || "Erro ao entrar."; }
  };

  if($("#registerForm")) $("#registerForm").onsubmit = async e => {
    e.preventDefault();
    if($("#authMsg")) $("#authMsg").textContent = "Criando conta...";
    try { await register($("#regUser").value.trim(), $("#regName").value.trim(), $("#regPass").value); } catch (x) { if($("#authMsg")) $("#authMsg").textContent = x.message || "Erro ao registrar."; }
  };

  if($("#logout")) $("#logout").onclick = () => { socket?.disconnect(); clear(); location.reload(); };
  if($("#close")) $("#close").onclick = close;

  if($("#online")) $("#online").onclick = onlinePanel;
  if($("#solo")) $("#solo").onclick = soloPanel;
  if($("#shop")) $("#shop").onclick = shopPanel;
  if($("#character")) $("#character").onclick = characterPanel;
  if($("#settings")) $("#settings").onclick = settingsPanel;
  if($("#ranking")) $("#ranking").onclick = ranking;
  if($("#adminBtn")) $("#adminBtn").onclick = adminPanel;
}

initPlatform();
bind();
fpsMeter();
introThenAuth();
})();
