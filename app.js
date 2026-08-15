// app.js - Uno Velho Matematixa Completo (Skins, Sons, Cartas Especiais e Economia)

// --- SINTETIZADOR DE SOM (Web Audio API - 0 arquivos extras para baixar) ---
const SoundFX = {
  ctx: null,
  init() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
  play(freq, type = 'sine', duration = 0.15) {
    try {
      this.init();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.00001, this.ctx.currentTime + duration);
    } catch(e) {}
  },
  cardPlay() { this.play(440, 'triangle', 0.1); },
  correctAnswer() { this.play(587, 'sine', 0.2); setTimeout(() => this.play(880, 'sine', 0.3), 150); },
  wrongAnswer() { this.play(150, 'sawtooth', 0.4); },
  victory() { [523, 659, 783, 1046].forEach((f, i) => setTimeout(() => this.play(f, 'sine', 0.3), i * 150)); }
};

// --- BANCO LOCAL INDEXEDDB ---
const AssetCache = {
  dbName: "UnoVelhoAssetsDB",
  storeName: "heavy_assets",
  async open() {
    return new Promise(r => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore(this.storeName);
      req.onsuccess = () => r(req.result);
    });
  },
  async save(key, val) {
    const db = await this.open();
    db.transaction(this.storeName, "readwrite").objectStore(this.storeName).put(val, key);
  },
  async get(key) {
    const db = await this.open();
    return new Promise(r => {
      const req = db.transaction(this.storeName, "readonly").objectStore(this.storeName).get(key);
      req.onsuccess = () => r(req.result);
    });
  }
};

const GAME_ASSETS = {
  characters: [
    { id: "pitagoras", name: "Prof. Pitágoras", perk: "Contas mais simples (+, -)", icon: "🧙‍♂️" },
    { id: "algebrica", name: "Dona Algébrica", perk: "Ganhe +20% moedas", icon: "👩‍🏫" },
    { id: "ceo_master", name: "Mestre CEO Supremo", perk: "Visual Ouro + Moedas x2", icon: "👑", ceoOnly: true }
  ],
  skins: [
    { id: "skin_classic", name: "Baralho Clássico" },
    { id: "skin_cyber", name: "Baralho Cyber Neon" },
    { id: "skin_gold", name: "Baralho CEO Ouro", ceoOnly: true }
  ],
  maps: [
    { id: "map_classroom", name: "Sala de Aula Clássica", cssClass: "map-classroom" },
    { id: "map_geometry", name: "Laboratório de Geometria", cssClass: "map-geometry" },
    { id: "map_ceo_arena", name: "Dimensão Pi CEO", cssClass: "map-ceo", ceoOnly: true }
  ]
};

let gameState = {
  deck: [],
  discardCard: null,
  playerHand: [],
  botHand: [],
  isPlayerTurn: true,
  currentColor: "red",
  pendingCardIndex: null,
  mathTarget: 0,
  user: null
};

document.addEventListener("DOMContentLoaded", () => {
  checkTermsModal();
  setupAuth();
  setupGameEvents();
});

function checkTermsModal() {
  if (!localStorage.getItem("uno_terms_accepted")) {
    document.getElementById("termsModal").style.display = "flex";
  } else {
    loadAssets();
  }
  document.getElementById("btnAcceptTerms").onclick = () => {
    localStorage.setItem("uno_terms_accepted", "true");
    document.getElementById("termsModal").style.display = "none";
    loadAssets();
  };
}

async function loadAssets() {
  await AssetCache.save("pack", GAME_ASSETS);
  renderSelectors();
}

function setupAuth() {
  const authMsg = document.getElementById("authMessage");
  
  document.getElementById("formLogin").onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: e.target.username.value, password: e.target.password.value })
    });
    const data = await res.json();
    authMsg.innerText = data.message;
    authMsg.style.color = data.success ? "#00ff88" : "#ff4444";
    if (data.success) showDashboard(data.user);
  };

  document.getElementById("formRegister").onsubmit = async (e) => {
    e.preventDefault();
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: e.target.regUsername.value, password: e.target.regPassword.value })
    });
    const data = await res.json();
    authMsg.innerText = data.message;
    authMsg.style.color = data.success ? "#00ff88" : "#ff4444";
    if (data.success) showDashboard(data.user);
  };
}

function showDashboard(user) {
  gameState.user = user;
  localStorage.setItem("uno_user", JSON.stringify(user));
  document.getElementById("authSection").style.display = "none";
  document.getElementById("gameDashboard").style.display = "block";
  document.getElementById("userInfo").innerText = `Usuário: ${user.username} | Cargo: ${user.role} | 🪙 ${user.coins} Moedas`;
  if (user.role === "CEO") document.getElementById("ceoBadge").style.display = "inline-block";
  renderSelectors();
}

function renderSelectors() {
  const user = gameState.user || JSON.parse(localStorage.getItem("uno_user") || "{}");
  const isCeo = user.role === "CEO";

  const charSelect = document.getElementById("characterSelect");
  const skinSelect = document.getElementById("skinSelect");
  const mapSelect = document.getElementById("mapSelect");

  if (!charSelect) return;

  charSelect.innerHTML = GAME_ASSETS.characters.filter(c => !c.ceoOnly || isCeo)
    .map(c => `<option value="${c.id}">${c.icon} ${c.name} (${c.perk})</option>`).join("");
  skinSelect.innerHTML = GAME_ASSETS.skins.filter(s => !s.ceoOnly || isCeo)
    .map(s => `<option value="${s.id}">${s.name}</option>`).join("");
  mapSelect.innerHTML = GAME_ASSETS.maps.filter(m => !m.ceoOnly || isCeo)
    .map(m => `<option value="${m.id}">${m.name}</option>`).join("");
}

// --- MONTAGEM E CRIAÇÃO DO BARALHO COMPLETO ---
function createFullDeck() {
  const colors = ["red", "blue", "green", "yellow"];
  let deck = [];

  colors.forEach(color => {
    // Cartas Numéricas (0-9)
    for (let i = 0; i <= 9; i++) deck.push({ color, value: i.toString(), type: "number" });
    // Cartas Especiais Coloridas
    deck.push({ color, value: "🚫", type: "skip" });
    deck.push({ color, value: "🔄", type: "reverse" });
    deck.push({ color, value: "+2", type: "draw2" });
  });

  // Cartas Coringas Pretas
  for (let i = 0; i < 4; i++) {
    deck.push({ color: "black", value: "🌈", type: "wild" });
    deck.push({ color: "black", value: "+4", type: "draw4" });
  }

  return deck.sort(() => Math.random() - 0.5);
}

function setupGameEvents() {
  document.getElementById("btnStartGame").onclick = startUnoGame;
  document.getElementById("btnBackLobby").onclick = () => {
    document.getElementById("gameBoard").style.display = "none";
    document.getElementById("gameDashboard").style.display = "block";
  };
  document.getElementById("drawPile").onclick = playerDrawCard;
  document.getElementById("btnSubmitMath").onclick = validateMathAnswer;
  document.getElementById("btnUno").onclick = () => {
    SoundFX.correctAnswer();
    alert("🚨 VOCÊ GRITOU UNO!");
  };
}

function startUnoGame() {
  document.getElementById("gameDashboard").style.display = "none";
  const board = document.getElementById("gameBoard");
  board.style.display = "block";

  // Aplicar Tema Visual do Mapa Selecionado
  const mapId = document.getElementById("mapSelect").value;
  const mapObj = GAME_ASSETS.maps.find(m => m.id === mapId);
  board.className = `card game-arena ${mapObj ? mapObj.cssClass : 'map-classroom'}`;

  gameState.deck = createFullDeck();
  gameState.playerHand = gameState.deck.splice(0, 7);
  gameState.botHand = gameState.deck.splice(0, 7);
  
  // Primeira carta da mesa não pode ser especial preta
  do {
    gameState.discardCard = gameState.deck.pop();
  } while (gameState.discardCard.color === "black");

  gameState.currentColor = gameState.discardCard.color;
  gameState.isPlayerTurn = true;

  updateRender();
}

function updateRender() {
  const discardEl = document.getElementById("discardPile");
  discardEl.className = `uno-card card-${gameState.currentColor}`;
  discardEl.innerText = gameState.discardCard.value;

  document.getElementById("botProfile").innerText = `🤖 Calculinho Bot (${gameState.botHand.length} cartas)`;

  // Renderizar Cartas do Jogador
  const handEl = document.getElementById("playerHand");
  handEl.innerHTML = "";
  gameState.playerHand.forEach((card, index) => {
    const cardDiv = document.createElement("div");
    cardDiv.className = `uno-card card-${card.color}`;
    cardDiv.innerText = card.value;
    cardDiv.onclick = () => attemptPlayCard(index);
    handEl.appendChild(cardDiv);
  });

  document.getElementById("turnStatus").innerText = gameState.isPlayerTurn ? "Sua Vez!" : "Vez do Bot...";
}

function attemptPlayCard(index) {
  if (!gameState.isPlayerTurn) return;
  const card = gameState.playerHand[index];

  // Regra de Validação do Uno
  const isMatchColor = card.color === gameState.currentColor;
  const isMatchValue = card.value === gameState.discardCard.value;
  const isWild = card.color === "black";

  if (isMatchColor || isMatchValue || isWild) {
    gameState.pendingCardIndex = index;
    openMathChallenge(card);
  } else {
    SoundFX.wrongAnswer();
    alert("Esta carta não pode ser jogada sobre o monte atual!");
  }
}

// --- DESAFIOS MATEMÁTICOS VARIADOS POR CARTA ---
function openMathChallenge(card) {
  let n1, n2, op;
  
  if (card.type === "draw4" || card.type === "draw2") {
    // Multiplicação para cartas +2 e +4
    n1 = Math.floor(Math.random() * 8) + 2;
    n2 = Math.floor(Math.random() * 8) + 2;
    op = "x";
    gameState.mathTarget = n1 * n2;
  } else if (card.type === "skip" || card.type === "reverse") {
    // Subtração para bloqueio e inverter
    n1 = Math.floor(Math.random() * 30) + 10;
    n2 = Math.floor(Math.random() * 10) + 1;
    op = "-";
    gameState.mathTarget = n1 - n2;
  } else {
    // Adição para cartas normais
    n1 = Math.floor(Math.random() * 20) + 1;
    n2 = Math.floor(Math.random() * 20) + 1;
    op = "+";
    gameState.mathTarget = n1 + n2;
  }

  document.getElementById("mathQuestion").innerText = `Quanto é ${n1} ${op} ${n2}?`;
  document.getElementById("mathAnswer").value = "";
  document.getElementById("mathModal").style.display = "flex";
}

function validateMathAnswer() {
  const ans = parseInt(document.getElementById("mathAnswer").value);
  document.getElementById("mathModal").style.display = "none";

  if (ans === gameState.mathTarget) {
    SoundFX.correctAnswer();
    SoundFX.cardPlay();

    const playedCard = gameState.playerHand.splice(gameState.pendingCardIndex, 1)[0];
    gameState.discardCard = playedCard;

    // Se for Coringa/Preta, sorteia uma nova cor
    if (playedCard.color === "black") {
      const colors = ["red", "blue", "green", "yellow"];
      gameState.currentColor = colors[Math.floor(Math.random() * colors.length)];
      alert(`Cor alterada para: ${gameState.currentColor.toUpperCase()}!`);
    } else {
      gameState.currentColor = playedCard.color;
    }

    // Ações Especiais das Cartas
    if (playedCard.type === "draw2") {
      for (let i = 0; i < 2; i++) if (gameState.deck.length) gameState.botHand.push(gameState.deck.pop());
      alert("Bot comprou +2 cartas!");
    } else if (playedCard.type === "draw4") {
      for (let i = 0; i < 4; i++) if (gameState.deck.length) gameState.botHand.push(gameState.deck.pop());
      alert("Bot comprou +4 cartas!");
    }

    // Checa Vitória
    if (gameState.playerHand.length === 0) {
      SoundFX.victory();
      alert("🏆 PARABÉNS! Você venceu e ganhou +100 Moedas!");
      document.getElementById("btnBackLobby").click();
      return;
    }

    // Se a carta for Bloqueio ou Inverter, joga de novo!
    if (playedCard.type === "skip" || playedCard.type === "reverse") {
      alert("Você bloqueou/inverteu a vez do Bot! Jogue novamente.");
      updateRender();
    } else {
      gameState.isPlayerTurn = false;
      updateRender();
      setTimeout(botPlay, 1500);
    }
  } else {
    SoundFX.wrongAnswer();
    alert("❌ Conta errada! Perdeu a vez e comprou +1 carta.");
    playerDrawCard();
  }
}

function playerDrawCard() {
  if (!gameState.isPlayerTurn) return;
  if (gameState.deck.length > 0) {
    gameState.playerHand.push(gameState.deck.pop());
  }
  gameState.isPlayerTurn = false;
  updateRender();
  setTimeout(botPlay, 1500);
}

// --- INTELIGÊNCIA ARTIFICIAL DO BOT ---
function botPlay() {
  const playableIndex = gameState.botHand.findIndex(c => 
    c.color === gameState.currentColor || c.value === gameState.discardCard.value || c.color === "black"
  );

  if (playableIndex !== -1) {
    SoundFX.cardPlay();
    const played = gameState.botHand.splice(playableIndex, 1)[0];
    gameState.discardCard = played;

    if (played.color === "black") {
      const colors = ["red", "blue", "green", "yellow"];
      gameState.currentColor = colors[Math.floor(Math.random() * colors.length)];
    } else {
      gameState.currentColor = played.color;
    }

    if (played.type === "draw2") {
      for (let i = 0; i < 2; i++) if (gameState.deck.length) gameState.playerHand.push(gameState.deck.pop());
      alert("🤖 O Bot te mandou um +2!");
    } else if (played.type === "draw4") {
      for (let i = 0; i < 4; i++) if (gameState.deck.length) gameState.playerHand.push(gameState.deck.pop());
      alert("🤖 O Bot te mandou um +4!");
    }

    if (gameState.botHand.length === 0) {
      SoundFX.wrongAnswer();
      alert("🤖 O Bot venceu a partida! Tente novamente.");
      document.getElementById("btnBackLobby").click();
      return;
    }

    if (played.type === "skip" || played.type === "reverse") {
      alert("🤖 O Bot te bloqueou! Ele joga de novo.");
      setTimeout(botPlay, 1500);
      return;
    }
  } else if (gameState.deck.length > 0) {
    gameState.botHand.push(gameState.deck.pop());
  }

  gameState.isPlayerTurn = true;
  updateRender();
}
