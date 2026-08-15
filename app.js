// app.js - Lógica Principal, Cache Local e Autenticação

// Database Local IndexedDB para evitar carga no servidor
const AssetCache = {
  dbName: "UnoVelhoAssetsDB",
  storeName: "heavy_assets",

  open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async save(key, value) {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, "readwrite");
      tx.objectStore(this.storeName).put(value, key);
      tx.oncomplete = () => resolve(true);
    });
  },

  async get(key) {
    const db = await this.open();
    return new Promise((resolve) => {
      const tx = db.transaction(this.storeName, "readonly");
      const req = tx.objectStore(this.storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }
};

// Dados Pesados do Jogo (Armazenados no Navegador após Aceite)
const GAME_DATABASE = {
  characters: [
    { id: "pitagoras", name: "Prof. Pitágoras", perk: "+10% de tempo nas equações", icon: "🧙‍♂️" },
    { id: "algebrica", name: "Dona Algébrica", perk: "Revela 1 carta aleatória do oponente", icon: "👩‍🏫" },
    { id: "calculinho", name: "Calculinho Bot", perk: "Anula a primeira compra de carta +2", icon: "🤖" },
    { id: "ceo_master", name: "Mestre CEO Supremo", perk: "Visual Ouro + Pontos em Dobro", icon: "👑", ceoOnly: true }
  ],
  skins: [
    { id: "skin_classic", name: "Baralho Clássico", class: "theme-classic" },
    { id: "skin_cyber", name: "Baralho Neon Cyber-Math", class: "theme-cyber" },
    { id: "skin_gold", name: "Baralho Supremo de Ouro (CEO)", class: "theme-gold", ceoOnly: true }
  ],
  maps: [
    { id: "map_classroom", name: "Sala de Aula Clássica", cssClass: "bg-classroom" },
    { id: "map_geometry", name: "Laboratório de Geometria 3D", cssClass: "bg-geometry" },
    { id: "map_ceo_arena", name: "Dimensão Pi (Arena CEO)", cssClass: "bg-ceo-arena", ceoOnly: true }
  ]
};

// Inicialização da Aplicação
document.addEventListener("DOMContentLoaded", () => {
  checkTermsModal();
  setupAuthForms();
});

// Verificação do Aceite dos Termos de Armazenamento Local
function checkTermsModal() {
  const termsAccepted = localStorage.getItem("uno_terms_accepted");
  const modal = document.getElementById("termsModal");

  if (!termsAccepted) {
    modal.style.display = "flex";
  } else {
    loadHeavyAssets();
  }

  document.getElementById("btnAcceptTerms").addEventListener("click", async () => {
    localStorage.setItem("uno_terms_accepted", "true");
    modal.style.display = "none";
    await loadHeavyAssets();
  });
}

// Carrega pacotes gráficos no IndexedDB
async function loadHeavyAssets() {
  const statusEl = document.getElementById("assetLoadingStatus");
  if (statusEl) statusEl.innerText = "Carregando pacotes visuais no navegador...";

  await AssetCache.save("game_pack", GAME_DATABASE);
  
  if (statusEl) statusEl.innerText = "Recursos pesados salvos no cache local com sucesso!";
  renderInventorySelectors();
}

// Configuração dos formulários de Login e Cadastro
function setupAuthForms() {
  const formLogin = document.getElementById("formLogin");
  const formRegister = document.getElementById("formRegister");
  const authMsg = document.getElementById("authMessage");

  formLogin.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const password = e.target.password.value;

    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    authMsg.innerText = data.message;
    authMsg.style.color = data.success ? "#00ff88" : "#ff4444";

    if (data.success) {
      localStorage.setItem("uno_token", data.token);
      localStorage.setItem("uno_user", JSON.stringify(data.user));
      showDashboard(data.user);
    }
  });

  formRegister.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = e.target.regUsername.value;
    const password = e.target.regPassword.value;

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    authMsg.innerText = data.message;
    authMsg.style.color = data.success ? "#00ff88" : "#ff4444";

    if (data.success) {
      localStorage.setItem("uno_token", data.token);
      localStorage.setItem("uno_user", JSON.stringify(data.user));
      showDashboard(data.user);
    }
  });
}

function showDashboard(user) {
  document.getElementById("authSection").style.display = "none";
  document.getElementById("gameDashboard").style.display = "block";
  document.getElementById("userInfo").innerText = `Usuário: ${user.username} | Cargo: ${user.role} | Moedas: ${user.coins}`;
  
  if (user.role === "CEO") {
    document.getElementById("ceoBadge").style.display = "inline-block";
  }
}

// Renderiza seletores de Skins, Personagens e Mapas
async function renderInventorySelectors() {
  const assets = await AssetCache.get("game_pack") || GAME_DATABASE;
  const user = JSON.parse(localStorage.getItem("uno_user") || "{}");
  const isCeo = user.role === "CEO";

  const charContainer = document.getElementById("characterSelect");
  const skinContainer = document.getElementById("skinSelect");
  const mapContainer = document.getElementById("mapSelect");

  if (!charContainer) return;

  charContainer.innerHTML = assets.characters
    .filter(c => !c.ceoOnly || isCeo)
    .map(c => `<option value="${c.id}">${c.icon} ${c.name} (${c.perk})</option>`).join("");

  skinContainer.innerHTML = assets.skins
    .filter(s => !s.ceoOnly || isCeo)
    .map(s => `<option value="${s.id}">${s.name}</option>`).join("");

  mapContainer.innerHTML = assets.maps
    .filter(m => !m.ceoOnly || isCeo)
    .map(m => `<option value="${m.id}">${m.name}</option>`).join("");
}
