(() => {
  "use strict";

  const CFG = window.VELHO_CONFIG || {};
  const API = String(CFG.API_URL || "").replace(/\/$/, "");
  const SOCKET_URL = String(CFG.SOCKET_URL || "");

  let token = localStorage.getItem("uv_token") || "";
  let me = safeJSON(localStorage.getItem("uv_me"));
  let socket = null;
  let currentRoom = null;
  let currentState = null;
  let currentView = "viewAuth";
  let shopItems = [];
  let shopFilter = "all";
  let settings = {
    sound: true,
    music: false,
    brightness: 100,
    graphics: "high",
    platform: localStorage.getItem("uv_platform") || ""
  };
  let audioContext = null;

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

  function safeJSON(value) {
    try { return value ? JSON.parse(value) : null; } catch { return null; }
  }

  function saveSession() {
    localStorage.setItem("uv_token", token);
    localStorage.setItem("uv_me", JSON.stringify(me));
  }

  function clearSession() {
    localStorage.removeItem("uv_token");
    localStorage.removeItem("uv_me");
    token = "";
    me = null;
    disconnectSocket();
  }

  async function api(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(API + path, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && token) {
        clearSession();
        showView("viewAuth");
      }
      throw new Error(data.error || "Erro de comunicação.");
    }
    return data;
  }

  function toast(message, type = "normal") {
    const element = $("#toast");
    if (!element) return;
    element.textContent = message;
    element.className = `toast show ${type}`;
    window.clearTimeout(toast.timer);
    toast.timer = window.setTimeout(() => element.classList.remove("show"), 2600);
  }

  function showView(id) {
    $$(".view").forEach((view) => view.classList.add("hidden"));
    const target = $("#" + id);
    if (!target) return;
    target.classList.remove("hidden");
    currentView = id;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openModal(html) {
    $("#modalContent").innerHTML = html;
    $("#modal").classList.remove("hidden");
  }

  function closeModal() {
    $("#modal").classList.add("hidden");
  }

  function setConnection(online, text = online ? "online" : "offline") {
    const dot = $("#connectionDot");
    const label = $("#connectionText");
    if (dot) dot.classList.toggle("online", online);
    if (label) label.textContent = text;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("pt-BR");
  }

  function updateHUD() {
    if (!me) return;
    $("#hudXp").textContent = formatNumber(me.xp);
    $("#hudCoins").textContent = formatNumber(me.bruto_coins);
    $("#welcomeText").textContent = `Olá, ${me.display_name}!`;
    $("#adminBadge").classList.toggle("hidden", !me.is_admin);
    $("#podiumName").textContent = me.display_name;
    $("#podiumWins").textContent = formatNumber(me.wins);
    $("#podiumPoints").textContent = formatNumber(me.points);
    const seed = encodeURIComponent(me.skin_atual || me.username || "Velho");
    const avatar = me.avatar_url || `https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${seed}`;
    $("#podiumAvatar").src = avatar;
    $("#myAvatar").src = avatar;
    $("#profileAvatar").src = avatar;
    $("#myName").textContent = me.display_name;
    $("#profileName").textContent = me.display_name;
    $("#profileUsername").textContent = `@${me.username}`;
    $("#profileXp").textContent = formatNumber(me.xp);
    $("#profileWins").textContent = formatNumber(me.wins);
    $("#profilePoints").textContent = formatNumber(me.points);
    $("#profileCoins").textContent = formatNumber(me.bruto_coins);
  }

  function sound(type = "click") {
    if (!settings.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const frequencies = { click: 420, card: 240, win: 660, error: 130 };
      osc.frequency.value = frequencies[type] || 420;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.035, audioContext.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.12);
      osc.connect(gain).connect(audioContext.destination);
      osc.start();
      osc.stop(audioContext.currentTime + 0.13);
    } catch {}
  }

  function setPlatform(mode) {
    settings.platform = mode === "mobile" ? "mobile" : "desktop";
    localStorage.setItem("uv_platform", settings.platform);
    document.body.classList.remove("platform-mobile", "platform-desktop");
    document.body.classList.add(`platform-${settings.platform}`);
    $("#platformGate")?.remove();
  }

  function initPlatform() {
    const saved = localStorage.getItem("uv_platform");
    if (saved) {
      setPlatform(saved);
      return;
    }
    $("#platformGate")?.querySelectorAll("[data-platform]").forEach((button) => {
      button.addEventListener("click", () => setPlatform(button.dataset.platform));
    });
    $("#autoPlatform")?.addEventListener("click", () => {
      const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || matchMedia("(max-width: 760px)").matches;
      setPlatform(mobile ? "mobile" : "desktop");
    });
  }

  function connectSocket() {
    if (!token) return;
    disconnectSocket();
    socket = io(SOCKET_URL || undefined, {
      auth: { token },
      transports: ["websocket", "polling"]
    });

    socket.on("connect", () => {
      setConnection(true, "online");
      if (currentRoom) socket.emit("request_state", { room_id: currentRoom.id });
    });

    socket.on("disconnect", () => setConnection(false, "offline"));
    socket.on("connect_error", (error) => {
      setConnection(false, "erro");
      console.warn(error.message);
    });

    socket.on("room_state", (state) => {
      currentState = state;
      currentRoom = { id: state.id, code: state.code, name: state.name, map: state.map, map_name: state.map_name };
      if (currentView === "viewGame") renderGame(state);
      else if (currentView === "viewLobby") renderLobby(state);
    });

    socket.on("room_public_state", (state) => {
      if (!currentRoom || Number(currentRoom.id) !== Number(state.id)) return;
      if (currentView === "viewGame") renderGame(state, true);
      if (currentView === "viewLobby") renderLobby(state);
    });

    socket.on("card_played", (event) => {
      sound("card");
      if (Number(event.player_id) !== Number(me?.id)) toast(`${event.player_name} jogou ${cardLabel(event.card)}.`);
    });

    socket.on("card_drawn", () => sound("card"));
    socket.on("uno_called", (event) => toast(`🔥 ${event.player_name} chamou UNO!`));
    socket.on("uno_penalty", (event) => toast(`${event.player_name} recebeu +${event.amount} cartas por não chamar UNO.`, "warning"));
    socket.on("game_finished", (event) => {
      sound("win");
      toast(`🏆 ${event.winner_name} venceu! +${event.reward.bruto_coins} BrutoCoins`, "success");
      refreshMe();
    });
    socket.on("map_changed", (event) => {
      toast(`Mapa alterado para ${event.map_name}.`);
      if (currentState) currentState.map = event.map;
      updateTableMap(event.map);
    });
    socket.on("chat_message", (event) => appendChat(event, false));
    socket.on("global_chat", (event) => appendChat(event, true));
    socket.on("global_settings", (value) => {
      if (value) {
        if (currentState) {
          currentState.paused = !!value.frozen;
          currentState.freeze_message = value.freezeMessage || "";
        }
        if (value.frozen) toast(value.freezeMessage || "Jogo congelado.", "warning");
      }
    });
    socket.on("kicked", () => {
      currentRoom = null;
      currentState = null;
      toast("Você foi retirado da sala.", "warning");
      showView("viewMenu");
    });
    socket.on("error_message", (message) => toast(message, "error"));
  }

  function disconnectSocket() {
    if (!socket) return;
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    setConnection(false, "offline");
  }

  async function refreshMe() {
    if (!token) return;
    try {
      const data = await api("/api/auth/me");
      me = data.user;
      saveSession();
      updateHUD();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function login(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: $("#loginUsername").value, password: $("#loginPassword").value })
      });
      token = data.token;
      me = data.user;
      saveSession();
      updateHUD();
      connectSocket();
      showView("viewMenu");
      toast(`Bem-vindo, ${me.display_name}!`, "success");
      await loadRooms();
    } catch (error) {
      sound("error");
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function register(event) {
    event.preventDefault();
    const button = event.submitter;
    button.disabled = true;
    try {
      const data = await api("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({
          username: $("#registerUsername").value,
          display_name: $("#registerDisplayName").value,
          password: $("#registerPassword").value
        })
      });
      token = data.token;
      me = data.user;
      saveSession();
      updateHUD();
      connectSocket();
      showView("viewMenu");
      toast("Conta criada com sucesso!", "success");
    } catch (error) {
      sound("error");
      toast(error.message, "error");
    } finally {
      button.disabled = false;
    }
  }

  async function loadRooms() {
    if (!token) return;
    try {
      const data = await api("/api/rooms");
      renderRooms(data.rooms || []);
      $("#onlineRooms").textContent = data.rooms?.length || 0;
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function renderRooms(roomsList) {
    const container = $("#roomsList");
    if (!roomsList.length) {
      container.innerHTML = `<div class="empty-state panel"><div class="empty-icon">🃏</div><h3>Nenhuma sala aberta</h3><p>Crie a primeira mesa e chame seus amigos.</p><button class="btn btn-green" data-empty-create>Criar partida</button></div>`;
      container.querySelector("[data-empty-create]")?.addEventListener("click", openCreateRoom);
      return;
    }
    container.innerHTML = roomsList.map((room) => `
      <article class="room-card">
        <div class="room-card-top"><span class="map-pill ${esc(room.map)}">${esc(room.map_name || room.map)}</span>${room.protected ? "🔒" : "🌐"}</div>
        <h3>${esc(room.name)}</h3>
        <div class="room-meta"><span>👥 ${room.players}/${room.max_players}</span><span>🎴 ${room.status === "waiting" ? "aguardando" : "em jogo"}</span></div>
        <div class="room-code">${esc(room.code)}</div>
        <button class="btn btn-blue full" data-join-code="${esc(room.code)}">ENTRAR</button>
      </article>`).join("");
    container.querySelectorAll("[data-join-code]").forEach((button) => button.addEventListener("click", () => joinRoomPrompt(button.dataset.joinCode)));
  }

  function joinRoomPrompt(code) {
    openModal(`
      <div class="modal-title"><span class="eyebrow">ENTRAR</span><h2>Sala ${esc(code)}</h2><p>Se a sala tiver senha, informe abaixo.</p></div>
      <form id="joinRoomForm" class="stack-form">
        <input id="joinPassword" type="password" placeholder="Senha da sala (opcional)">
        <button class="btn btn-green full">ENTRAR NA SALA</button>
      </form>`);
    $("#joinRoomForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const password = $("#joinPassword").value;
      closeModal();
      await joinRoom(code, password);
    });
  }

  function openCreateRoom() {
    openModal(`
      <div class="modal-title"><span class="eyebrow">NOVA MESA</span><h2>Criar partida</h2><p>Escolha o mapa, limite de jogadores e opções.</p></div>
      <form id="createRoomForm" class="stack-form">
        <label>Nome da mesa<input id="createName" maxlength="60" value="Mesa do Velho"></label>
        <label>Mapa<select id="createMap"><option value="madeira">Mesa de Madeira — grátis</option><option value="verde">Mesa Verde — grátis</option><option value="western">Mesa Western — loja</option><option value="neon">Mesa Neon — loja</option></select></label>
        <label>Jogadores<select id="createMax"><option value="2">2</option><option value="3">3</option><option value="4" selected>4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option></select></label>
        <label>Senha <input id="createPassword" type="password" maxlength="50" placeholder="Opcional"></label>
        <label class="check-row"><input id="createChat" type="checkbox" checked> Chat da sala</label>
        <button class="btn btn-blue full">CRIAR SALA</button>
      </form>`);

    $("#createRoomForm").addEventListener("submit", (event) => {
      event.preventDefault();
      createRoom();
    });
  }

  function createRoom() {
    if (!socket) connectSocket();
    const payload = {
      name: $("#createName").value,
      map: $("#createMap").value,
      max_players: Number($("#createMax").value),
      password: $("#createPassword").value,
      chat_enabled: $("#createChat").checked
    };
    socket?.emit("create_room", payload, (response) => {
      if (!response?.ok) return toast(response?.error || "Não foi possível criar a sala.", "error");
      closeModal();
      currentRoom = response.room;
      joinRoomById(response.room.id);
    });
  }

  function joinRoomById(id) {
    api(`/api/rooms/${encodeURIComponent(currentRoom?.code || "")}`).catch(() => {});
    if (!socket) connectSocket();
    socket?.emit("request_state", { room_id: id });
    showView("viewLobby");
  }

  function joinRoom(code, password) {
    if (!socket) connectSocket();
    socket?.emit("join_room", { code, password }, (response) => {
      if (!response?.ok) return toast(response?.error || "Não foi possível entrar.", "error");
      currentRoom = response.room;
      currentState = response.state;
      renderLobby(currentState);
      showView("viewLobby");
      sound("click");
    });
  }

  function renderLobby(state) {
    if (!state) return;
    currentRoom = { id: state.id, code: state.code, name: state.name, map: state.map, map_name: state.map_name };
    $("#lobbyTitle").textContent = state.name;
    $("#lobbyMeta").textContent = `${state.players.length} jogador(es) • ${state.map_name} • código ${state.code}`;
    $("#lobbyRoomCode").textContent = state.code;
    $("#lobbyMapName").textContent = state.map_name;
    updateLobbyMap(state.map);
    const players = state.players || [];
    $("#lobbyPlayers").innerHTML = players.map((player) => `
      <div class="player-row ${player.id === state.current_player_id ? "active" : ""}">
        <img src="https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(player.id)}" alt="">
        <div class="player-row-info"><strong>${esc(player.display_name)}</strong><small>${player.is_host ? "👑 anfitrião" : player.is_admin ? "🛡️ admin" : player.role === "spectator" ? "👀 espectador" : "jogador"}</small></div>
        <span>${player.cards_count} 🃏</span>
      </div>`).join("");
    $("#btnStartGame").disabled = !(state.is_host || state.is_admin) || players.filter((p) => p.role !== "spectator").length < 2;
  }

  function updateLobbyMap(map) {
    const element = $("#lobbyMapPreview");
    element.className = `lobby-map ${esc(map || "madeira")}`;
  }

  function updateTableMap(map) {
    const table = $("#gameTable");
    if (!table) return;
    table.classList.remove("madeira", "verde", "western", "neon");
    table.classList.add(map || "madeira");
  }

  function renderGame(state, publicOnly = false) {
    if (!state) return;
    currentState = state;
    currentRoom = { id: state.id, code: state.code, name: state.name, map: state.map, map_name: state.map_name };
    showView("viewGame");
    updateTableMap(state.map);
    $("#gameRoomName").textContent = state.name || "Mesa";
    $("#gameMapName").textContent = state.map_name || "Mesa";
    $("#gameCode").textContent = state.code || "------";
    $("#directionBadge").textContent = state.direction === -1 ? "↺" : "↻";
    $("#deckCount").textContent = state.deck_count ?? "0";
    $("#turnBanner").textContent = state.current_player_id === me?.id ? "SUA VEZ!" : `Vez de ${state.current_player_name || "jogador"}`;
    $("#turnBanner").classList.toggle("your-turn", Number(state.current_player_id) === Number(me?.id));
    $("#myHandCount").textContent = `${state.my_hand?.length || 0} carta(s)`;
    $("#myName").textContent = me?.display_name || "Você";
    renderTopCard(state.top_card);
    renderOpponents(state);
    if (!publicOnly) renderHand(state);
    else if (state.my_hand) renderHand(state);
  }

  function cardLabel(card) {
    if (!card) return "carta";
    const labels = { skip: "Bloqueio", reverse: "Inverter", draw2: "+2", draw4: "+4", wild: "Coringa" };
    return labels[card.value] || card.value;
  }

  function cardHTML(card, index = -1, playable = false) {
    const value = card.value === "skip" ? "⊘" : card.value === "reverse" ? "↻" : card.value === "draw2" ? "+2" : card.value === "draw4" ? "+4" : card.value === "wild" ? "★" : esc(card.value);
    const className = `card face ${esc(card.color)} ${playable ? "playable" : ""}`;
    return `<button class="${className}" data-card-index="${index}" title="${esc(cardLabel(card))}"><span class="corner">${value}</span><strong>${value}</strong><span class="corner bottom">${value}</span></button>`;
  }

  function renderTopCard(card) {
    const target = $("#topCard");
    if (!card) {
      target.innerHTML = `<div class="card-placeholder">?</div>`;
      return;
    }
    const value = card.value === "skip" ? "⊘" : card.value === "reverse" ? "↻" : card.value === "draw2" ? "+2" : card.value === "draw4" ? "+4" : card.value === "wild" ? "★" : esc(card.value);
    target.innerHTML = `<div class="card face ${esc(card.color)}"><span class="corner">${value}</span><strong>${value}</strong><span class="corner bottom">${value}</span></div>`;
  }

  function renderOpponents(state) {
    const opponents = (state.players || []).filter((p) => Number(p.id) !== Number(me?.id));
    $("#opponents").innerHTML = opponents.map((player) => `
      <div class="opponent ${Number(player.id) === Number(state.current_player_id) ? "active" : ""}">
        <div class="opponent-avatar"><img src="https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(player.id)}" alt=""></div>
        <strong>${esc(player.display_name)}</strong>
        <span>${player.cards_count} cartas</span>
        ${player.uno_called ? `<small class="uno-tag">UNO!</small>` : ""}
      </div>`).join("");
  }

  function renderHand(state) {
    const hand = state.my_hand || [];
    const canPlay = Number(state.current_player_id) === Number(me?.id) && state.status === "playing" && !state.paused;
    $("#myHand").innerHTML = hand.map((card, index) => cardHTML(card, index, canPlay && canPlayCardClient(state, card))).join("");
    $("#myHand").querySelectorAll("[data-card-index]").forEach((button) => {
      button.addEventListener("click", () => tryPlayCard(Number(button.dataset.cardIndex)));
    });
  }

  function canPlayCardClient(state, card) {
    const top = state.top_card;
    if (!top) return false;
    return card.color === "wild" || card.color === state.current_color || card.color === top.color || card.value === top.value;
  }

  function tryPlayCard(index) {
    if (!currentState || !socket) return;
    const card = currentState.my_hand?.[index];
    if (!card) return;
    if (!canPlayCardClient(currentState, card)) return toast("Essa carta não pode ser jogada agora.", "error");

    if (card.color === "wild") {
      openColorPicker((color) => playCard(index, color));
      return;
    }
    playCard(index, null);
  }

  function playCard(index, chosenColor) {
    socket?.emit("play_card", { room_id: currentRoom.id, card_index: index, chosen_color: chosenColor }, (response) => {
      if (!response?.ok) return toast(response?.error || "Não foi possível jogar.", "error");
      sound("card");
    });
  }

  function openColorPicker(callback) {
    const picker = $("#colorPicker");
    picker.classList.remove("hidden");
    picker.querySelectorAll("[data-color]").forEach((button) => {
      button.onclick = () => {
        picker.classList.add("hidden");
        callback(button.dataset.color);
      };
    });
  }

  function appendChat(event, global) {
    const container = global ? $("#gameChatMessages") : $("#chatMessages");
    if (!container) return;
    const line = document.createElement("div");
    line.className = "chat-line";
    line.innerHTML = `<strong>${esc(event.player_name)}</strong><span>${esc(event.message)}</span>`;
    container.appendChild(line);
    while (container.children.length > 80) container.removeChild(container.firstChild);
    container.scrollTop = container.scrollHeight;
  }

  async function openShop() {
    showView("viewShop");
    try {
      const data = await api("/api/shop/items");
      shopItems = data.items || [];
      renderShop();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function renderShop() {
    const items = shopItems.filter((item) => shopFilter === "all" || item.tipo === shopFilter);
    $("#shopGrid").innerHTML = items.map((item) => {
      const image = item.imagem_url ? `<img src="${esc(item.imagem_url)}" alt="${esc(item.nome)}">` : `<div class="shop-map-preview ${esc(item.slug.replace("map-", ""))}"></div>`;
      const action = item.owned
        ? `<button class="btn btn-dark full" data-equip="${esc(item.slug)}">${item.tipo === "skin" ? "EQUIPAR" : "ADQUIRIDO"}</button>`
        : `<button class="btn btn-orange full" data-buy="${esc(item.slug)}">${item.preco_brutocoins === 0 ? "PEGAR GRÁTIS" : `COMPRAR • ${formatNumber(item.preco_brutocoins)} 🪙`}</button>`;
      return `<article class="shop-card"><div class="shop-art">${image}</div><div class="shop-info"><span class="item-type">${esc(item.tipo)}</span><h3>${esc(item.nome)}</h3><p>${esc(item.descricao)}</p>${item.req_xp ? `<small>Requer ${formatNumber(item.req_xp)} XP</small>` : ""}${action}</div></article>`;
    }).join("");

    $("#shopGrid").querySelectorAll("[data-buy]").forEach((button) => button.addEventListener("click", () => buyItem(button.dataset.buy)));
    $("#shopGrid").querySelectorAll("[data-equip]").forEach((button) => button.addEventListener("click", () => equipItem(button.dataset.equip)));
  }

  async function buyItem(slug) {
    try {
      const data = await api("/api/shop/buy", { method: "POST", body: JSON.stringify({ slug }) });
      me = data.user;
      saveSession();
      updateHUD();
      toast(data.message, "success");
      await openShop();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function equipItem(slug) {
    try {
      const data = await api("/api/profile/equip", { method: "POST", body: JSON.stringify({ slug }) });
      me.skin_atual = data.skin_atual;
      saveSession();
      updateHUD();
      toast(data.message, "success");
      await loadCollection();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function loadCollection() {
    try {
      const data = await api("/api/shop/items");
      const skins = data.items.filter((item) => item.tipo === "skin" && item.owned);
      $("#skinCollection").innerHTML = skins.map((skin) => `<button class="collection-item ${me.skin_atual === skin.slug ? "equipped" : ""}" data-equip-profile="${esc(skin.slug)}"><img src="${esc(skin.imagem_url || CFG.DEFAULT_AVATAR)}" alt=""><strong>${esc(skin.nome)}</strong><small>${me.skin_atual === skin.slug ? "Equipado" : "Equipar"}</small></button>`).join("");
      $("#skinCollection").querySelectorAll("[data-equip-profile]").forEach((button) => button.addEventListener("click", () => equipItem(button.dataset.equipProfile)));
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function openProfile() {
    showView("viewProfile");
    updateHUD();
    await loadCollection();
  }

  async function openRanking() {
    showView("viewRanking");
    try {
      const data = await api("/api/ranking");
      $("#rankingList").innerHTML = (data.ranking || []).map((player, index) => `<div class="ranking-row"><span class="rank">${index + 1}</span><img src="https://api.dicebear.com/9.x/bottts-neutral/svg?seed=${encodeURIComponent(player.id)}" alt=""><div><strong>${esc(player.display_name)}</strong><small>${formatNumber(player.wins)} vitórias • ${formatNumber(player.xp)} XP</small></div><strong class="rank-points">${formatNumber(player.points)}</strong></div>`).join("") || `<div class="empty-state">Ainda não há jogadores no ranking.</div>`;
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function claimDaily() {
    try {
      const data = await api("/api/rewards/daily", { method: "POST" });
      await refreshMe();
      toast(data.message, "success");
    } catch (error) {
      toast(error.message, "warning");
    }
  }

  function openRules() {
    openModal(`<div class="modal-title"><span class="eyebrow">REGRAS RÁPIDAS</span><h2>Como jogar UNO</h2></div><div class="rules-list"><div><b>1.</b><span>Na sua vez, jogue uma carta que combine com a cor, número ou símbolo da carta do topo.</span></div><div><b>2.</b><span>Cartas coringa podem ser jogadas em qualquer momento e permitem escolher uma cor.</span></div><div><b>3.</b><span>+2 e +4 fazem o próximo jogador comprar cartas.</span></div><div><b>4.</b><span>Bloqueio pula a vez e Inverter muda a direção.</span></div><div><b>5.</b><span>Quando ficar com uma carta, chame UNO. Caso contrário, a regra automática pode aplicar penalidade.</span></div><div><b>6.</b><span>O primeiro jogador a ficar sem cartas vence a partida.</span></div></div>`);
  }

  function openSettings() {
    openModal(`<div class="modal-title"><span class="eyebrow">CONFIGURAÇÕES</span><h2>Preferências</h2></div><div class="settings-list"><label class="setting-row"><span>🔊 Som</span><input id="setSound" type="checkbox" ${settings.sound ? "checked" : ""}></label><label class="setting-row"><span>🎵 Música</span><input id="setMusic" type="checkbox" ${settings.music ? "checked" : ""}></label><label class="setting-row"><span>☀️ Brilho <b id="brightnessValue">${settings.brightness}%</b></span><input id="setBrightness" type="range" min="60" max="130" value="${settings.brightness}"></label><label class="setting-row"><span>🎮 Gráficos</span><select id="setGraphics"><option value="high" ${settings.graphics === "high" ? "selected" : ""}>Alto</option><option value="medium" ${settings.graphics === "medium" ? "selected" : ""}>Médio</option><option value="low" ${settings.graphics === "low" ? "selected" : ""}>Baixo</option></select></label><button id="btnLogout" class="btn btn-red full">SAIR DA CONTA</button></div>`);
    $("#setSound").onchange = (event) => { settings.sound = event.target.checked; saveSettings(); };
    $("#setMusic").onchange = (event) => { settings.music = event.target.checked; saveSettings(); };
    $("#setBrightness").oninput = (event) => { settings.brightness = Number(event.target.value); $("#brightnessValue").textContent = `${settings.brightness}%`; applyBrightness(); saveSettings(); };
    $("#setGraphics").onchange = (event) => { settings.graphics = event.target.value; saveSettings(); applyGraphics(); };
    $("#btnLogout").onclick = logout;
  }

  function saveSettings() {
    localStorage.setItem("uv_settings", JSON.stringify(settings));
  }

  function loadSettings() {
    const saved = safeJSON(localStorage.getItem("uv_settings"));
    if (saved) settings = { ...settings, ...saved };
    applyBrightness();
    applyGraphics();
  }

  function applyBrightness() {
    document.documentElement.style.setProperty("--ui-brightness", `${settings.brightness}%`);
  }

  function applyGraphics() {
    document.body.dataset.graphics = settings.graphics;
  }

  function logout() {
    clearSession();
    closeModal();
    showView("viewAuth");
    toast("Você saiu da conta.");
  }

  async function openAdmin() {
    if (!me?.is_admin) return;
    showView("viewAdmin");
    try {
      const data = await api("/api/admin/stats");
      $("#adminUsers").textContent = formatNumber(data.users);
      $("#adminRooms").textContent = formatNumber(data.rooms);
      $("#adminGames").textContent = formatNumber(data.games);
      $("#adminCoins").textContent = formatNumber(data.bruto_coins);
    } catch (error) {
      toast(error.message, "error");
    }
  }

  async function runAdminCommand(command) {
    try {
      const data = await api("/api/admin/command", { method: "POST", body: JSON.stringify({ command }) });
      toast(data.message, "success");
      openAdmin();
    } catch (error) {
      toast(error.message, "error");
    }
  }

  function bindEvents() {
    $("#loginForm").addEventListener("submit", login);
    $("#registerForm").addEventListener("submit", register);
    $$("[data-auth-tab]").forEach((tab) => tab.addEventListener("click", () => {
      $$("[data-auth-tab]").forEach((x) => x.classList.remove("active"));
      tab.classList.add("active");
      $("#loginForm").classList.toggle("hidden", tab.dataset.authTab !== "login");
      $("#registerForm").classList.toggle("hidden", tab.dataset.authTab !== "register");
    }));

    $("#brandButton").onclick = () => { if (me) showView("viewMenu"); };
    $("#btnPlay").onclick = async () => { showView("viewRooms"); await loadRooms(); };
    $("#btnCreate").onclick = openCreateRoom;
    $("#btnShop").onclick = openShop;
    $("#btnCharacter").onclick = openProfile;
    $("#btnProfile").onclick = () => me && openProfile();
    $("#btnSettings").onclick = openSettings;
    $("#btnDaily").onclick = claimDaily;
    $("#btnRanking").onclick = openRanking;
    $("#btnRules").onclick = openRules;
    $("#btnRefreshRooms").onclick = loadRooms;
    $("#btnShopBack").onclick = () => showView("viewMenu");
    $("#btnProfileBack").onclick = () => showView("viewMenu");
    $("#btnRankingBack").onclick = () => showView("viewMenu");
    $("#btnAdminBack").onclick = () => showView("viewMenu");
    $("#btnStartGame").onclick = startGame;
    $("#btnLeaveLobby").onclick = leaveRoom;
    $("#btnGameBack").onclick = () => showView("viewLobby");
    $("#btnGameMenu").onclick = openGameMenu;
    $("#btnDraw").onclick = drawCard;
    $("#btnUno").onclick = callUno;
    $("#btnLobbySettings").onclick = openLobbyOptions;
    $("#chatForm").addEventListener("submit", sendChat);
    $("#btnAdminCommand").onclick = () => runAdminCommand($("#adminCommandInput").value.trim());
    $$("[data-command]").forEach((button) => button.onclick = () => runAdminCommand(button.dataset.command));
    $$("[data-close-modal]").forEach((element) => element.addEventListener("click", closeModal));
    $$("[data-shop-filter]").forEach((button) => button.addEventListener("click", () => {
      $$("[data-shop-filter]").forEach((x) => x.classList.remove("active"));
      button.classList.add("active");
      shopFilter = button.dataset.shopFilter;
      renderShop();
    }));
  }

  function startGame() {
    if (!currentRoom || !socket) return;
    socket.emit("start_game", { room_id: currentRoom.id }, (response) => {
      if (!response?.ok) return toast(response?.error || "Não foi possível iniciar.", "error");
      showView("viewGame");
      sound("click");
    });
  }

  function leaveRoom() {
    if (!currentRoom || !socket) return;
    socket.emit("leave_room", { room_id: currentRoom.id }, () => {
      currentRoom = null;
      currentState = null;
      $("#chatMessages").innerHTML = "";
      showView("viewMenu");
      loadRooms();
    });
  }

  function drawCard() {
    if (!currentRoom || !socket) return;
    socket.emit("draw_card", { room_id: currentRoom.id }, (response) => {
      if (!response?.ok) return toast(response?.error || "Não foi possível comprar.", "error");
    });
  }

  function callUno() {
    if (!currentRoom || !socket) return;
    socket.emit("call_uno", { room_id: currentRoom.id }, (response) => {
      if (!response?.ok) return toast(response?.error || "Não foi possível chamar UNO.", "error");
      toast("🔥 UNO!", "success");
    });
  }

  function sendChat(event) {
    event.preventDefault();
    const input = $("#chatInput");
    const message = input.value.trim();
    if (!message || !currentRoom || !socket) return;
    socket.emit("chat_message", { room_id: currentRoom.id, message }, (response) => {
      if (!response?.ok) return toast(response?.error || "Chat indisponível.", "error");
      input.value = "";
    });
  }

  function openGameMenu() {
    openModal(`<div class="modal-title"><span class="eyebrow">PARTIDA</span><h2>Opções da mesa</h2></div><div class="stack-actions"><button id="modalGameLobby" class="btn btn-blue full">Voltar para a sala</button><button id="modalGameRules" class="btn btn-dark full">Ver regras</button><button id="modalGameLeave" class="btn btn-red full">Sair da partida</button></div>`);
    $("#modalGameLobby").onclick = () => { closeModal(); showView("viewLobby"); };
    $("#modalGameRules").onclick = () => { closeModal(); openRules(); };
    $("#modalGameLeave").onclick = () => { closeModal(); leaveRoom(); };
  }

  function openLobbyOptions() {
    if (!currentRoom) return;
    openModal(`<div class="modal-title"><span class="eyebrow">MESA</span><h2>Opções da sala</h2></div><div class="stack-actions"><button id="changeMapButton" class="btn btn-blue full">Trocar mapa</button><button id="pauseButton" class="btn btn-dark full">Pausar / retomar</button>${me?.is_admin || currentState?.is_host ? `<button id="adminLobbyButton" class="btn btn-purple full">Painel administrativo</button>` : ""}</div>`);
    $("#changeMapButton").onclick = () => {
      closeModal();
      openModal(`<div class="modal-title"><span class="eyebrow">MAPA</span><h2>Escolha a mesa</h2></div><div class="map-choice-grid"><button data-map-choice="madeira">🌳<strong>Madeira</strong><small>Grátis</small></button><button data-map-choice="verde">🟢<strong>Verde</strong><small>Grátis</small></button><button data-map-choice="western">🪵<strong>Western</strong><small>Loja</small></button><button data-map-choice="neon">💠<strong>Neon</strong><small>Loja</small></button></div>`);
      $$("[data-map-choice]").forEach((button) => button.onclick = () => {
        socket?.emit("change_map", { room_id: currentRoom.id, map: button.dataset.mapChoice }, (response) => {
          if (!response?.ok) return toast(response?.error || "Não foi possível trocar o mapa.", "error");
          closeModal();
        });
      });
    };
    $("#pauseButton").onclick = () => {
      socket?.emit("pause_room", { room_id: currentRoom.id, paused: !currentState?.paused }, (response) => {
        if (!response?.ok) return toast(response?.error || "Não foi possível alterar a pausa.", "error");
        closeModal();
      });
    };
    $("#adminLobbyButton")?.addEventListener("click", () => { closeModal(); openAdmin(); });
  }

  async function boot() {
    initPlatform();
    loadSettings();
    bindEvents();

    if (me && token) {
      try {
        await refreshMe();
        connectSocket();
        showView("viewMenu");
        updateHUD();
      } catch {
        showView("viewAuth");
      }
    } else {
      showView("viewAuth");
    }
  }

  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });

  boot();
})();
