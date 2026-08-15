require("dotenv").config();

const path = require("path");
const http = require("http");
const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = String(process.env.JWT_SECRET || "");
const FRONTEND_ORIGIN = String(process.env.FRONTEND_ORIGIN || "").trim();
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const ADMIN_INITIAL_USERNAME = String(process.env.ADMIN_INITIAL_USERNAME || "Velho").trim();
const ADMIN_INITIAL_PASSWORD = String(process.env.ADMIN_INITIAL_PASSWORD || "");

if (JWT_SECRET.length < 32) {
  throw new Error("JWT_SECRET deve ter pelo menos 32 caracteres.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não definida.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: IS_PRODUCTION ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

const allowedOrigins = FRONTEND_ORIGIN
  ? FRONTEND_ORIGIN.split(",").map((x) => x.trim()).filter(Boolean)
  : true;

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: "64kb" }));
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use(express.static(__dirname));

const COLORS = ["red", "yellow", "green", "blue"];
const CARD_VALUES = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "skip", "reverse", "draw2"];
const MAPS = {
  madeira: { id: "madeira", name: "Mesa de Madeira", free: true },
  verde: { id: "verde", name: "Mesa Verde", free: true },
  western: { id: "western", name: "Mesa Western", free: false },
  neon: { id: "neon", name: "Mesa Neon", free: false }
};

const loginAttempts = new Map();
const rooms = new Map();
const saveTimers = new Map();
const disconnectTimers = new Map();
const unoTimers = new Map();

const globalSettings = {
  frozen: false,
  freezeMessage: "",
  chatGlobalOn: true,
  chatPrivateOn: true
};

function nowMs() {
  return Date.now();
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .slice(0, 24);
}

function normalizeDisplayName(value) {
  return String(value || "")
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, 32);
}

function cleanRoomName(value) {
  return String(value || "Mesa do Velho")
    .trim()
    .replace(/[<>]/g, "")
    .slice(0, 60) || "Mesa do Velho";
}

function cleanRoomCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);
}

function cleanMap(value) {
  const id = String(value || "madeira").trim().toLowerCase();
  return MAPS[id] ? id : "madeira";
}

function safeInt(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function getClientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function rateLimitLogin(req) {
  const key = getClientIp(req);
  const now = nowMs();
  const entry = loginAttempts.get(key) || { count: 0, resetAt: now + 10 * 60 * 1000 };
  if (entry.resetAt <= now) {
    entry.count = 0;
    entry.resetAt = now + 10 * 60 * 1000;
  }
  entry.count += 1;
  loginAttempts.set(key, entry);
  return entry.count <= 10;
}

function hashRoomPassword(password) {
  const value = String(password || "");
  return value ? bcrypt.hash(value, 10) : Promise.resolve(null);
}

function createRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  while (result.length < 6) {
    const bytes = crypto.randomBytes(6);
    for (const byte of bytes) {
      result += alphabet[byte % alphabet.length];
      if (result.length === 6) break;
    }
  }
  return result;
}

function signUser(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      is_admin: !!user.is_admin
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function getBearer(req) {
  const header = String(req.headers.authorization || "");
  return header.replace(/^Bearer\s+/i, "").trim();
}

function auth(req, res, next) {
  try {
    const token = getBearer(req);
    if (!token) return res.status(401).json({ error: "Não autenticado." });
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }
}

async function isBanned(userId) {
  const result = await pool.query(
    `SELECT 1
       FROM banimentos
      WHERE user_id = $1
        AND active = TRUE
        AND (expires_at IS NULL OR expires_at > NOW())
      LIMIT 1`,
    [userId]
  );
  return result.rowCount > 0;
}

async function ensureNotBanned(userId) {
  return !(await isBanned(userId));
}

async function requireAdmin(req, res, next) {
  auth(req, res, async () => {
    try {
      if (!(await ensureNotBanned(req.user.id))) {
        return res.status(403).json({ error: "Conta banida." });
      }
      const result = await pool.query(
        `SELECT id, is_admin FROM profiles WHERE id = $1 LIMIT 1`,
        [req.user.id]
      );
      if (!result.rowCount || !result.rows[0].is_admin) {
        return res.status(403).json({ error: "Acesso administrativo negado." });
      }
      req.user.is_admin = true;
      next();
    } catch (error) {
      console.error("requireAdmin:", error.message);
      res.status(500).json({ error: "Não foi possível validar o administrador." });
    }
  });
}

async function audit(actorId, action, data = {}) {
  try {
    await pool.query(
      `INSERT INTO acoes_admin (actor_id, action, target_user_id, room_id, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        actorId || null,
        String(action).slice(0, 80),
        data.targetUserId || null,
        data.roomId || null,
        JSON.stringify(data.metadata || {})
      ]
    );
  } catch (error) {
    console.error("audit:", error.message);
  }
}

async function ensureInitialAdmin() {
  if (!ADMIN_INITIAL_PASSWORD) {
    console.warn("ADMIN_INITIAL_PASSWORD não definido; bootstrap do administrador ignorado.");
    return;
  }

  const username = normalizeUsername(ADMIN_INITIAL_USERNAME) || "Velho";
  const existing = await pool.query(
    `SELECT id, is_admin FROM profiles WHERE LOWER(username) = LOWER($1) LIMIT 1`,
    [username]
  );

  if (existing.rowCount) {
    if (!existing.rows[0].is_admin) {
      await pool.query(`UPDATE profiles SET is_admin = TRUE WHERE id = $1`, [existing.rows[0].id]);
    }
    return;
  }

  const passwordHash = await bcrypt.hash(ADMIN_INITIAL_PASSWORD, 12);
  await pool.query(
    `INSERT INTO profiles (username, display_name, password_hash, is_admin)
     VALUES ($1, $2, $3, TRUE)`,
    [username, username, passwordHash]
  );
  console.log(`Administrador inicial criado: ${username}`);
}

function makeCard(color, value, uid) {
  return { uid, color, value };
}

function makeDeck() {
  const deck = [];
  let uid = 1;

  for (const color of COLORS) {
    deck.push(makeCard(color, "0", `c${uid++}`));
    for (let n = 1; n <= 9; n += 1) {
      deck.push(makeCard(color, String(n), `c${uid++}`));
      deck.push(makeCard(color, String(n), `c${uid++}`));
    }
    for (let i = 0; i < 2; i += 1) {
      deck.push(makeCard(color, "skip", `c${uid++}`));
      deck.push(makeCard(color, "reverse", `c${uid++}`));
      deck.push(makeCard(color, "draw2", `c${uid++}`));
    }
  }

  for (let i = 0; i < 4; i += 1) {
    deck.push(makeCard("wild", "wild", `c${uid++}`));
    deck.push(makeCard("wild", "draw4", `c${uid++}`));
  }

  return shuffle(deck);
}

function shuffle(array) {
  const copy = Array.isArray(array) ? array.slice() : [];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function topCard(room) {
  return room.discard[room.discard.length - 1] || null;
}

function drawCards(room, player, amount = 1) {
  const count = Math.max(0, Math.min(20, Number(amount) || 0));
  for (let i = 0; i < count; i += 1) {
    if (!room.deck.length) {
      if (room.discard.length <= 1) break;
      const top = room.discard.pop();
      room.deck = shuffle(room.discard);
      room.discard = top ? [top] : [];
    }
    const card = room.deck.pop();
    if (card) player.hand.push(card);
  }
}

function cardPoints(card) {
  if (!card) return 0;
  if (["skip", "reverse", "draw2"].includes(card.value)) return 20;
  if (["wild", "draw4"].includes(card.value)) return 50;
  return Number(card.value) || 0;
}

function canPlay(room, card) {
  const top = topCard(room);
  if (!top || !card) return false;
  return card.color === "wild" || card.color === room.currentColor || card.color === top.color || card.value === top.value;
}

function nextIndex(room, amount = 1) {
  if (!room.players.length) return;
  const length = room.players.length;
  room.turn = (room.turn + room.direction * amount + length * 100) % length;
}

function currentPlayer(room) {
  return room.players[room.turn] || null;
}

function findPlayer(room, userId) {
  return room.players.find((p) => Number(p.id) === Number(userId)) || null;
}

function playerCanControlRoom(room, userId) {
  return Number(room.hostId) === Number(userId) || room.adminIds.includes(Number(userId));
}

function createRoomObject(data) {
  return {
    id: Number(data.id),
    code: cleanRoomCode(data.code),
    name: cleanRoomName(data.name),
    hostId: Number(data.hostId),
    passwordHash: data.passwordHash || null,
    maxPlayers: safeInt(data.maxPlayers, 4, 2, 8),
    map: cleanMap(data.map),
    chatEnabled: data.chatEnabled !== false,
    swapEnabled: !!data.swapEnabled,
    status: data.status || "waiting",
    paused: false,
    players: [],
    deck: [],
    discard: [],
    turn: 0,
    direction: 1,
    currentColor: "red",
    adminIds: [],
    createdAt: data.createdAt || new Date().toISOString(),
    lastActivity: nowMs(),
    winnerId: null,
    settings: data.settings || {}
  };
}

function publicPlayer(player) {
  return {
    id: player.id,
    display_name: player.display_name,
    is_admin: !!player.is_admin,
    is_host: !!player.is_host,
    role: player.role || "player",
    cards_count: Array.isArray(player.hand) ? player.hand.length : 0,
    score: Number(player.score || 0),
    uno_called: !!player.unoCalled,
    connected: player.connected !== false
  };
}

function publicRoom(room) {
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    map: room.map,
    map_name: MAPS[room.map]?.name || room.map,
    max_players: room.maxPlayers,
    players: room.players.filter((p) => p.role !== "spectator").length,
    spectators: room.players.filter((p) => p.role === "spectator").length,
    status: room.status,
    chat_enabled: room.chatEnabled,
    protected: !!room.passwordHash
  };
}

function stateFor(room, userId) {
  const me = findPlayer(room, userId);
  const active = currentPlayer(room);
  return {
    id: room.id,
    code: room.code,
    name: room.name,
    map: room.map,
    map_name: MAPS[room.map]?.name || room.map,
    status: room.status,
    paused: room.paused || globalSettings.frozen,
    freeze_message: globalSettings.frozen ? globalSettings.freezeMessage : "",
    is_host: Number(room.hostId) === Number(userId),
    is_admin: playerCanControlRoom(room, userId),
    current_player_id: active?.id || null,
    current_player_name: active?.display_name || "",
    current_color: room.currentColor,
    direction: room.direction,
    top_card: topCard(room),
    deck_count: room.deck.length,
    my_hand: me?.hand || [],
    my_id: Number(userId),
    my_uno_called: !!me?.unoCalled,
    players: room.players.map(publicPlayer)
  };
}

function roomStateForAll(room) {
  io.to(`room:${room.id}`).emit("room_public_state", {
    ...publicRoom(room),
    current_player_id: currentPlayer(room)?.id || null,
    current_player_name: currentPlayer(room)?.display_name || "",
    current_color: room.currentColor,
    direction: room.direction,
    top_card: topCard(room),
    deck_count: room.deck.length,
    players: room.players.map(publicPlayer),
    frozen: globalSettings.frozen,
    freeze_message: globalSettings.frozen ? globalSettings.freezeMessage : ""
  });

  for (const player of room.players) {
    io.to(`user:${player.id}`).emit("room_state", stateFor(room, player.id));
  }
}

function scheduleSave(room) {
  const old = saveTimers.get(room.id);
  if (old) clearTimeout(old);
  const timer = setTimeout(() => {
    saveTimers.delete(room.id);
    saveRoomGame(room).catch((err) => console.error("saveRoomGame:", err.message));
  }, 250);
  saveTimers.set(room.id, timer);
}

async function saveRoomGame(room) {
  const state = {
    deck: room.deck,
    discard: room.discard,
    turn: room.turn,
    direction: room.direction,
    currentColor: room.currentColor,
    paused: room.paused,
    map: room.map,
    players: room.players.map((p) => ({
      id: p.id,
      display_name: p.display_name,
      is_admin: !!p.is_admin,
      role: p.role,
      score: p.score,
      hand: p.hand,
      unoCalled: !!p.unoCalled,
      connected: p.connected !== false
    }))
  };

  await pool.query(
    `INSERT INTO games (room_id, state, status, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (room_id) DO UPDATE SET state = EXCLUDED.state, status = EXCLUDED.status, updated_at = NOW()`,
    [room.id, JSON.stringify(state), room.status]
  );

  await pool.query(`UPDATE rooms SET status = $2, map_id = $3 WHERE id = $1`, [room.id, room.status, room.map]);
}

async function loadRoomFromDb(roomId) {
  const roomResult = await pool.query(`SELECT * FROM rooms WHERE id = $1 LIMIT 1`, [roomId]);
  if (!roomResult.rowCount) return null;
  const db = roomResult.rows[0];
  const playerResult = await pool.query(
    `SELECT p.id, p.display_name, p.is_admin, rp.role, rp.joined_at
       FROM room_players rp
       JOIN profiles p ON p.id = rp.user_id
      WHERE rp.room_id = $1
      ORDER BY rp.joined_at ASC`,
    [roomId]
  );
  const gameResult = await pool.query(`SELECT state FROM games WHERE room_id = $1 LIMIT 1`, [roomId]);

  const room = createRoomObject({
    id: db.id,
    code: db.code,
    name: db.name,
    hostId: db.host_id,
    passwordHash: db.password_hash,
    maxPlayers: db.max_players,
    map: db.map_id,
    chatEnabled: db.chat_enabled,
    swapEnabled: db.swap_enabled,
    status: db.status,
    createdAt: db.created_at,
    settings: db.settings
  });

  room.players = playerResult.rows.map((p) => ({
    id: Number(p.id),
    display_name: p.display_name,
    is_admin: !!p.is_admin,
    is_host: Number(p.id) === Number(db.host_id),
    role: p.role,
    hand: [],
    score: 0,
    unoCalled: false,
    connected: false
  }));

  const saved = gameResult.rows[0]?.state;
  if (saved && typeof saved === "object") {
    room.deck = Array.isArray(saved.deck) ? saved.deck : [];
    room.discard = Array.isArray(saved.discard) ? saved.discard : [];
    room.turn = Number.isInteger(saved.turn) ? saved.turn : 0;
    room.direction = saved.direction === -1 ? -1 : 1;
    room.currentColor = COLORS.includes(saved.currentColor) ? saved.currentColor : "red";
    room.paused = !!saved.paused;
    if (Array.isArray(saved.players)) {
      for (const savedPlayer of saved.players) {
        const current = findPlayer(room, savedPlayer.id);
        if (!current) continue;
        current.hand = Array.isArray(savedPlayer.hand) ? savedPlayer.hand : [];
        current.score = Number(savedPlayer.score || 0);
        current.unoCalled = !!savedPlayer.unoCalled;
      }
    }
  }

  return room;
}

async function getRoom(roomId) {
  const id = Number(roomId);
  if (!Number.isInteger(id)) return null;
  if (rooms.has(id)) return rooms.get(id);
  const room = await loadRoomFromDb(id);
  if (room) rooms.set(id, room);
  return room;
}

async function getRoomByCode(code) {
  const normalized = cleanRoomCode(code);
  for (const room of rooms.values()) {
    if (room.code === normalized) return room;
  }
  const result = await pool.query(`SELECT id FROM rooms WHERE code = $1 LIMIT 1`, [normalized]);
  if (!result.rowCount) return null;
  return getRoom(result.rows[0].id);
}

async function ensureMapOwned(userId, mapId) {
  const map = cleanMap(mapId);
  if (MAPS[map]?.free) return true;
  const slug = `map-${map}`;
  const result = await pool.query(
    `SELECT 1 FROM inventory i JOIN shop_items s ON s.id = i.item_id WHERE i.user_id = $1 AND s.slug = $2 LIMIT 1`,
    [userId, slug]
  );
  return result.rowCount > 0;
}

async function createRoomInDb({ userId, name, map, maxPlayers, password, chatEnabled, swapEnabled, specialRules }) {
  const safeMap = cleanMap(map);
  if (!(await ensureMapOwned(userId, safeMap))) {
    const error = new Error("Você ainda não possui esse mapa.");
    error.code = "MAP_NOT_OWNED";
    throw error;
  }

  const passwordHash = await hashRoomPassword(password);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let code = null;
    for (let i = 0; i < 25; i += 1) {
      const candidate = createRoomCode();
      const exists = await client.query(`SELECT 1 FROM rooms WHERE code = $1 LIMIT 1`, [candidate]);
      if (!exists.rowCount) {
        code = candidate;
        break;
      }
    }
    if (!code) throw new Error("Não foi possível gerar o código da sala.");

    const inserted = await client.query(
      `INSERT INTO rooms (code, name, host_id, password_hash, max_players, map_id, chat_enabled, swap_enabled, status, settings)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'waiting',$9)
       RETURNING id, code, name, host_id, password_hash, max_players, map_id, chat_enabled, swap_enabled, status, settings, created_at`,
      [
        code,
        cleanRoomName(name),
        userId,
        passwordHash,
        safeInt(maxPlayers, 4, 2, 8),
        safeMap,
        chatEnabled !== false,
        !!swapEnabled,
        JSON.stringify({ special_rules: String(specialRules || "Normal").slice(0, 80) })
      ]
    );

    const db = inserted.rows[0];
    await client.query(`INSERT INTO room_players (room_id, user_id, role) VALUES ($1,$2,'player')`, [db.id, userId]);
    await client.query("COMMIT");

    const room = createRoomObject({
      id: db.id,
      code: db.code,
      name: db.name,
      hostId: db.host_id,
      passwordHash: db.password_hash,
      maxPlayers: db.max_players,
      map: db.map_id,
      chatEnabled: db.chat_enabled,
      swapEnabled: db.swap_enabled,
      status: db.status,
      settings: db.settings,
      createdAt: db.created_at
    });

    room.players.push({
      id: Number(userId),
      display_name: "",
      is_admin: false,
      is_host: true,
      role: "player",
      hand: [],
      score: 0,
      unoCalled: false,
      connected: true
    });
    rooms.set(room.id, room);
    return room;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function hydratePlayer(room, userId) {
  const result = await pool.query(
    `SELECT id, username, display_name, is_admin, bruto_coins, xp, wins, points, skin_atual, avatar_url
       FROM profiles WHERE id = $1 LIMIT 1`,
    [userId]
  );
  if (!result.rowCount) return null;
  const p = result.rows[0];
  let player = findPlayer(room, userId);
  if (!player) {
    player = {
      id: Number(p.id),
      display_name: p.display_name,
      is_admin: !!p.is_admin,
      is_host: Number(room.hostId) === Number(p.id),
      role: "player",
      hand: [],
      score: 0,
      unoCalled: false,
      connected: true
    };
    room.players.push(player);
  } else {
    player.display_name = p.display_name;
    player.is_admin = !!p.is_admin;
    player.is_host = Number(room.hostId) === Number(p.id);
    player.connected = true;
  }
  return { player, profile: p };
}

async function joinRoom({ userId, code, password, spectator = false }) {
  const room = await getRoomByCode(code);
  if (!room) {
    const error = new Error("Sala não encontrada.");
    error.status = 404;
    throw error;
  }

  if (room.passwordHash) {
    const ok = await bcrypt.compare(String(password || ""), room.passwordHash);
    if (!ok) {
      const error = new Error("Senha da sala incorreta.");
      error.status = 401;
      throw error;
    }
  }

  const existing = findPlayer(room, userId);
  if (!existing) {
    const activePlayers = room.players.filter((p) => p.role === "player").length;
    if (!spectator && activePlayers >= room.maxPlayers) {
      const error = new Error("A sala está cheia.");
      error.status = 409;
      throw error;
    }
    if (room.status === "playing" && !spectator) {
      const error = new Error("A partida já começou. Entre como espectador.");
      error.status = 409;
      throw error;
    }
    await pool.query(
      `INSERT INTO room_players (room_id, user_id, role) VALUES ($1,$2,$3) ON CONFLICT (room_id,user_id) DO UPDATE SET role = EXCLUDED.role`,
      [room.id, userId, spectator ? "spectator" : "player"]
    );
  }

  const data = await hydratePlayer(room, userId);
  if (!data) throw new Error("Usuário não encontrado.");
  data.player.role = spectator ? "spectator" : "player";
  room.lastActivity = nowMs();
  return room;
}

function initializeGame(room) {
  room.deck = makeDeck();
  room.discard = [];
  room.turn = 0;
  room.direction = 1;
  room.currentColor = "red";
  room.paused = false;
  room.winnerId = null;

  for (const p of room.players) {
    p.hand = [];
    p.score = 0;
    p.unoCalled = false;
  }

  const first = room.deck.pop();
  if (!first) throw new Error("Não foi possível montar o baralho.");

  if (first.color === "wild") {
    room.deck.unshift(first);
    return initializeGame(room);
  }

  room.discard.push(first);
  room.currentColor = first.color;

  for (const p of room.players.filter((x) => x.role === "player")) {
    drawCards(room, p, 7);
  }

  room.status = "playing";
}

function calculateWinnerScore(room, winnerId) {
  let total = 0;
  for (const p of room.players) {
    if (Number(p.id) === Number(winnerId)) continue;
    for (const card of p.hand) total += cardPoints(card);
  }
  return total;
}

async function finishGame(room, winner) {
  room.status = "finished";
  room.winnerId = Number(winner.id);
  const gained = calculateWinnerScore(room, winner.id);
  winner.score += gained;

  await pool.query(
    `UPDATE profiles
        SET wins = wins + 1,
            points = points + $2,
            xp = xp + 50,
            bruto_coins = bruto_coins + 100
      WHERE id = $1`,
    [winner.id, Math.max(1, gained)]
  );

  await pool.query(
    `INSERT INTO game_history (room_id, winner_id, players_count, map_id) VALUES ($1,$2,$3,$4)`,
    [room.id, winner.id, room.players.filter((p) => p.role === "player").length, room.map]
  );

  await pool.query(`UPDATE rooms SET status = 'finished' WHERE id = $1`, [room.id]);
  io.to(`room:${room.id}`).emit("game_finished", {
    winner_id: winner.id,
    winner_name: winner.display_name,
    score: gained,
    reward: { xp: 50, bruto_coins: 100 }
  });
}

function clearUnoTimer(roomId, userId) {
  const key = `${roomId}:${userId}`;
  const timer = unoTimers.get(key);
  if (timer) clearTimeout(timer);
  unoTimers.delete(key);
}

function startUnoTimer(room, player) {
  clearUnoTimer(room.id, player.id);
  const key = `${room.id}:${player.id}`;
  const timer = setTimeout(async () => {
    unoTimers.delete(key);
    const current = findPlayer(room, player.id);
    if (!current || current.hand.length !== 1 || current.unoCalled) return;
    drawCards(room, current, 2);
    io.to(`room:${room.id}`).emit("uno_penalty", {
      player_id: current.id,
      player_name: current.display_name,
      amount: 2
    });
    current.unoCalled = false;
    roomStateForAll(room);
    scheduleSave(room);
  }, 5000);
  unoTimers.set(key, timer);
}

async function removePlayerFromRoom(room, userId, { hard = false } = {}) {
  const index = room.players.findIndex((p) => Number(p.id) === Number(userId));
  if (index < 0) return false;
  const player = room.players[index];

  if (!hard && room.status === "playing") {
    player.connected = false;
    return true;
  }

  room.players.splice(index, 1);
  await pool.query(`DELETE FROM room_players WHERE room_id = $1 AND user_id = $2`, [room.id, userId]);

  if (Number(room.hostId) === Number(userId)) {
    const nextHost = room.players.find((p) => p.role === "player");
    if (nextHost) {
      room.hostId = nextHost.id;
      nextHost.is_host = true;
      await pool.query(`UPDATE rooms SET host_id = $2 WHERE id = $1`, [room.id, nextHost.id]);
    }
  }

  if (!room.players.length) {
    rooms.delete(room.id);
    await pool.query(`DELETE FROM rooms WHERE id = $1`, [room.id]);
  }
  return true;
}

async function boot() {
  await pool.query("SELECT 1");
  await ensureInitialAdmin();
  console.log("PostgreSQL conectado.");
}

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, app: "UnoVelho", uptime: process.uptime() });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

app.get("/api/config", (req, res) => {
  res.json({
    app_name: "UnoVelho",
    maps: Object.values(MAPS),
    global_settings: globalSettings
  });
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const username = normalizeUsername(req.body.username);
    const displayName = normalizeDisplayName(req.body.display_name || username);
    const password = String(req.body.password || "");

    if (username.length < 3) return res.status(400).json({ error: "Usuário deve ter pelo menos 3 caracteres." });
    if (displayName.length < 2) return res.status(400).json({ error: "Nome deve ter pelo menos 2 caracteres." });
    if (password.length < 6) return res.status(400).json({ error: "A senha deve ter pelo menos 6 caracteres." });

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `INSERT INTO profiles (username, display_name, password_hash)
       VALUES ($1,$2,$3)
       RETURNING id, username, display_name, is_admin, bruto_coins, xp, wins, points, skin_atual, avatar_url`,
      [username, displayName, passwordHash]
    );

    const user = result.rows[0];
    res.status(201).json({ token: signUser(user), user });
  } catch (error) {
    if (error.code === "23505") return res.status(409).json({ error: "Esse usuário já existe." });
    console.error("register:", error.message);
    res.status(500).json({ error: "Não foi possível criar a conta." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    if (!rateLimitLogin(req)) return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });

    const username = normalizeUsername(req.body.username);
    const password = String(req.body.password || "");
    const result = await pool.query(
      `SELECT id, username, display_name, password_hash, is_admin, bruto_coins, xp, wins, points, skin_atual, avatar_url
         FROM profiles WHERE LOWER(username) = LOWER($1) LIMIT 1`,
      [username]
    );

    if (!result.rowCount) return res.status(401).json({ error: "Usuário ou senha incorretos." });
    const user = result.rows[0];
    if (!(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Usuário ou senha incorretos." });
    }
    if (await isBanned(user.id)) return res.status(403).json({ error: "Essa conta está banida." });

    const { password_hash: ignored, ...safeUser } = user;
    res.json({ token: signUser(safeUser), user: safeUser });
  } catch (error) {
    console.error("login:", error.message);
    res.status(500).json({ error: "Erro ao entrar." });
  }
});

app.get("/api/auth/me", auth, async (req, res) => {
  try {
    if (await isBanned(req.user.id)) return res.status(403).json({ error: "Essa conta está banida." });
    const result = await pool.query(
      `SELECT id, username, display_name, is_admin, bruto_coins, xp, wins, points, skin_atual, avatar_url, created_at
         FROM profiles WHERE id = $1 LIMIT 1`,
      [req.user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Conta não encontrada." });
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error("me:", error.message);
    res.status(500).json({ error: "Não foi possível carregar seu perfil." });
  }
});

app.get("/api/ranking", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, display_name, wins, points, xp, skin_atual
         FROM profiles
        ORDER BY points DESC, wins DESC, xp DESC, display_name ASC
        LIMIT 100`
    );
    res.json({ ranking: result.rows });
  } catch (error) {
    console.error("ranking:", error.message);
    res.status(500).json({ error: "Não foi possível carregar o ranking." });
  }
});

app.get("/api/shop/items", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT s.id, s.slug, s.nome, s.tipo, s.preco_brutocoins, s.req_xp, s.imagem_url, s.descricao,
              EXISTS(SELECT 1 FROM inventory i WHERE i.item_id = s.id AND i.user_id = $1) AS owned
         FROM shop_items s
        WHERE s.ativo = TRUE
        ORDER BY s.tipo, s.preco_brutocoins, s.id`,
      [req.user.id]
    );
    res.json({ items: result.rows });
  } catch (error) {
    console.error("shop items:", error.message);
    res.status(500).json({ error: "Não foi possível carregar a loja." });
  }
});

app.post("/api/shop/buy", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const slug = String(req.body.slug || "").trim();
    if (!slug) return res.status(400).json({ error: "Item inválido." });

    await client.query("BEGIN");
    const itemResult = await client.query(
      `SELECT id, slug, nome, tipo, preco_brutocoins, req_xp, imagem_url, descricao
         FROM shop_items WHERE slug = $1 AND ativo = TRUE LIMIT 1`,
      [slug]
    );
    if (!itemResult.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Item não encontrado." });
    }

    const item = itemResult.rows[0];
    const userResult = await client.query(
      `SELECT id, bruto_coins, xp, skin_atual FROM profiles WHERE id = $1 FOR UPDATE`,
      [req.user.id]
    );
    const user = userResult.rows[0];
    if (user.xp < item.req_xp) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: `Você precisa de ${item.req_xp} XP para comprar este item.` });
    }

    const owned = await client.query(`SELECT 1 FROM inventory WHERE user_id = $1 AND item_id = $2`, [req.user.id, item.id]);
    if (owned.rowCount) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "Você já possui este item." });
    }

    if (user.bruto_coins < item.preco_brutocoins) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "BrutoCoins insuficientes." });
    }

    await client.query(`UPDATE profiles SET bruto_coins = bruto_coins - $2 WHERE id = $1`, [req.user.id, item.preco_brutocoins]);
    await client.query(`INSERT INTO inventory (user_id, item_id) VALUES ($1,$2)`, [req.user.id, item.id]);

    if (item.tipo === "skin") {
      await client.query(`UPDATE profiles SET skin_atual = $2 WHERE id = $1`, [req.user.id, item.slug]);
    }

    await client.query("COMMIT");
    const profile = await pool.query(
      `SELECT id, username, display_name, is_admin, bruto_coins, xp, wins, points, skin_atual, avatar_url FROM profiles WHERE id = $1`,
      [req.user.id]
    );
    res.json({ message: `Você comprou ${item.nome}!`, item, user: profile.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("shop buy:", error.message);
    res.status(500).json({ error: "Não foi possível concluir a compra." });
  } finally {
    client.release();
  }
});

app.post("/api/profile/equip", auth, async (req, res) => {
  try {
    const slug = String(req.body.slug || "").trim();
    const result = await pool.query(
      `SELECT s.slug, s.tipo, s.nome
         FROM inventory i JOIN shop_items s ON s.id = i.item_id
        WHERE i.user_id = $1 AND s.slug = $2 LIMIT 1`,
      [req.user.id, slug]
    );
    if (!result.rowCount) return res.status(404).json({ error: "Você não possui esse item." });
    const item = result.rows[0];
    if (item.tipo !== "skin") return res.status(400).json({ error: "Esse item não pode ser equipado como skin." });
    await pool.query(`UPDATE profiles SET skin_atual = $2 WHERE id = $1`, [req.user.id, item.slug]);
    res.json({ message: `${item.nome} equipada.`, skin_atual: item.slug });
  } catch (error) {
    console.error("equip:", error.message);
    res.status(500).json({ error: "Não foi possível equipar o item." });
  }
});

app.post("/api/rewards/daily", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`SELECT id, bruto_coins, last_daily_claim FROM profiles WHERE id = $1 FOR UPDATE`, [req.user.id]);
    if (!result.rowCount) throw new Error("Conta não encontrada.");
    const user = result.rows[0];
    if (user.last_daily_claim && nowMs() - new Date(user.last_daily_claim).getTime() < 24 * 60 * 60 * 1000) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: "A recompensa diária já foi coletada." });
    }
    await client.query(`UPDATE profiles SET bruto_coins = bruto_coins + 75, last_daily_claim = NOW() WHERE id = $1`, [req.user.id]);
    await client.query("COMMIT");
    res.json({ message: "Você recebeu 75 BrutoCoins!", amount: 75 });
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: error.message || "Erro na recompensa diária." });
  } finally {
    client.release();
  }
});

app.get("/api/rooms", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.code, r.name, r.max_players, r.map_id, r.chat_enabled, r.status,
              r.password_hash IS NOT NULL AS protected,
              COUNT(rp.user_id) FILTER (WHERE rp.role = 'player')::int AS players
         FROM rooms r
         LEFT JOIN room_players rp ON rp.room_id = r.id
        WHERE r.status IN ('waiting','playing','paused')
        GROUP BY r.id
        ORDER BY r.created_at DESC
        LIMIT 100`
    );
    res.json({
      rooms: result.rows.map((r) => ({
        ...r,
        code: r.code.trim(),
        map: r.map_id,
        map_name: MAPS[r.map_id]?.name || r.map_id
      }))
    });
  } catch (error) {
    console.error("rooms list:", error.message);
    res.status(500).json({ error: "Não foi possível carregar as salas." });
  }
});

app.post("/api/rooms", auth, async (req, res) => {
  try {
    const room = await createRoomInDb({
      userId: req.user.id,
      name: req.body.name,
      map: req.body.map,
      maxPlayers: req.body.max_players,
      password: req.body.password,
      chatEnabled: req.body.chat_enabled,
      swapEnabled: req.body.swap_enabled,
      specialRules: req.body.special_rules
    });
    const user = await pool.query(`SELECT display_name, is_admin FROM profiles WHERE id = $1`, [req.user.id]);
    room.players[0].display_name = user.rows[0].display_name;
    room.players[0].is_admin = !!user.rows[0].is_admin;
    res.status(201).json({ room: publicRoom(room) });
  } catch (error) {
    console.error("rooms create:", error.message);
    if (error.code === "MAP_NOT_OWNED") return res.status(403).json({ error: error.message });
    res.status(500).json({ error: "Não foi possível criar a sala." });
  }
});

app.get("/api/rooms/:code", auth, async (req, res) => {
  try {
    const room = await getRoomByCode(req.params.code);
    if (!room) return res.status(404).json({ error: "Sala não encontrada." });
    res.json({ room: publicRoom(room) });
  } catch (error) {
    res.status(500).json({ error: "Não foi possível carregar a sala." });
  }
});

app.get("/api/admin/stats", requireAdmin, async (req, res) => {
  try {
    const [users, roomsCount, games, economy] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS value FROM profiles`),
      pool.query(`SELECT COUNT(*)::int AS value FROM rooms WHERE status IN ('waiting','playing','paused')`),
      pool.query(`SELECT COUNT(*)::int AS value FROM game_history`),
      pool.query(`SELECT COALESCE(SUM(bruto_coins),0)::int AS value FROM profiles`)
    ]);
    res.json({
      users: users.rows[0].value,
      rooms: roomsCount.rows[0].value,
      games: games.rows[0].value,
      bruto_coins: economy.rows[0].value,
      global_settings: globalSettings
    });
  } catch (error) {
    console.error("admin stats:", error.message);
    res.status(500).json({ error: "Não foi possível carregar estatísticas." });
  }
});

app.post("/api/admin/command", requireAdmin, async (req, res) => {
  try {
    const command = String(req.body.command || "").trim();
    const lower = command.toLowerCase();

    if (lower === "/congelar") {
      globalSettings.frozen = true;
      globalSettings.freezeMessage = "Jogo temporariamente congelado pelo administrador.";
      io.emit("global_settings", globalSettings);
      await audit(req.user.id, "freeze");
      return res.json({ message: "Jogo congelado." });
    }

    if (lower === "/descongelar") {
      globalSettings.frozen = false;
      globalSettings.freezeMessage = "";
      io.emit("global_settings", globalSettings);
      await audit(req.user.id, "unfreeze");
      return res.json({ message: "Jogo descongelado." });
    }

    if (/^\/chatglobal\s+(on|off)$/i.test(command)) {
      globalSettings.chatGlobalOn = /\bon$/i.test(command);
      io.emit("global_settings", globalSettings);
      await audit(req.user.id, "chat_global", { metadata: { enabled: globalSettings.chatGlobalOn } });
      return res.json({ message: `Chat global ${globalSettings.chatGlobalOn ? "ligado" : "desligado"}.` });
    }

    if (/^\/chat\s+(on|off)$/i.test(command)) {
      globalSettings.chatPrivateOn = /\bon$/i.test(command);
      await audit(req.user.id, "chat_private", { metadata: { enabled: globalSettings.chatPrivateOn } });
      return res.json({ message: `Chat privado ${globalSettings.chatPrivateOn ? "ligado" : "desligado"}.` });
    }

    if (lower.startsWith("/banir ")) {
      const targetId = Number(command.split(/\s+/)[1]);
      if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: "ID inválido." });
      if (targetId === req.user.id) return res.status(400).json({ error: "Você não pode banir a própria conta." });
      await pool.query(`INSERT INTO banimentos (user_id, banned_by, reason) VALUES ($1,$2,$3)`, [targetId, req.user.id, "Banimento administrativo"]);
      for (const socket of io.sockets.sockets.values()) {
        if (Number(socket.user?.id) === targetId) socket.disconnect(true);
      }
      await audit(req.user.id, "ban", { targetUserId: targetId });
      return res.json({ message: `Jogador ${targetId} banido.` });
    }

    if (lower.startsWith("/desbanir ")) {
      const targetId = Number(command.split(/\s+/)[1]);
      if (!Number.isInteger(targetId) || targetId <= 0) return res.status(400).json({ error: "ID inválido." });
      await pool.query(`UPDATE banimentos SET active = FALSE WHERE user_id = $1 AND active = TRUE`, [targetId]);
      await audit(req.user.id, "unban", { targetUserId: targetId });
      return res.json({ message: `Jogador ${targetId} desbanido.` });
    }

    return res.status(400).json({ error: "Comando desconhecido." });
  } catch (error) {
    console.error("admin command:", error.message);
    res.status(500).json({ error: "Não foi possível executar o comando." });
  }
});

io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, "");
    if (!token) return next(new Error("Não autenticado."));
    const user = verifyToken(token);
    if (await isBanned(user.id)) return next(new Error("Conta banida."));
    socket.user = user;
    next();
  } catch {
    next(new Error("Sessão inválida."));
  }
});

io.on("connection", async (socket) => {
  const userId = Number(socket.user.id);
  socket.join(`user:${userId}`);

  socket.emit("global_settings", globalSettings);
  socket.emit("server_time", { now: new Date().toISOString() });

  const userRooms = [];
  for (const room of rooms.values()) {
    if (findPlayer(room, userId)) {
      const p = findPlayer(room, userId);
      p.connected = true;
      userRooms.push(room.id);
      socket.join(`room:${room.id}`);
    }
  }

  if (userRooms.length) {
    for (const roomId of userRooms) {
      const room = rooms.get(roomId);
      if (room) roomStateForAll(room);
    }
  }

  socket.on("create_room", async (payload = {}, ack) => {
    try {
      if (globalSettings.frozen) throw new Error("O jogo está congelado no momento.");
      const room = await createRoomInDb({
        userId,
        name: payload.name,
        map: payload.map,
        maxPlayers: payload.max_players,
        password: payload.password,
        chatEnabled: payload.chat_enabled,
        swapEnabled: payload.swap_enabled,
        specialRules: payload.special_rules
      });
      const profile = await pool.query(`SELECT display_name, is_admin FROM profiles WHERE id = $1`, [userId]);
      room.players[0].display_name = profile.rows[0].display_name;
      room.players[0].is_admin = !!profile.rows[0].is_admin;
      socket.join(`room:${room.id}`);
      if (typeof ack === "function") ack({ ok: true, room: publicRoom(room) });
      roomStateForAll(room);
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
      else socket.emit("error_message", error.message);
    }
  });

  socket.on("join_room", async (payload = {}, ack) => {
    try {
      if (globalSettings.frozen) throw new Error("O jogo está congelado no momento.");
      const room = await joinRoom({ userId, code: payload.code, password: payload.password, spectator: !!payload.spectator });
      socket.join(`room:${room.id}`);
      const delay = disconnectTimers.get(`${room.id}:${userId}`);
      if (delay) {
        clearTimeout(delay);
        disconnectTimers.delete(`${room.id}:${userId}`);
      }
      if (typeof ack === "function") ack({ ok: true, room: publicRoom(room), state: stateFor(room, userId) });
      roomStateForAll(room);
      scheduleSave(room);
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
      else socket.emit("error_message", error.message);
    }
  });

  socket.on("start_game", async (payload = {}, ack) => {
    try {
      const room = await getRoom(payload.room_id);
      if (!room) throw new Error("Sala não encontrada.");
      if (!playerCanControlRoom(room, userId)) throw new Error("Somente o anfitrião ou administrador pode iniciar.");
      if (room.status !== "waiting") throw new Error("A sala não está aguardando início.");
      const players = room.players.filter((p) => p.role === "player");
      if (players.length < 2) throw new Error("São necessários pelo menos 2 jogadores.");
      if (players.length > room.maxPlayers) throw new Error("Limite de jogadores excedido.");
      initializeGame(room);
      await pool.query(`UPDATE rooms SET status = 'playing' WHERE id = $1`, [room.id]);
      roomStateForAll(room);
      scheduleSave(room);
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
    }
  });

  socket.on("play_card", async (payload = {}, ack) => {
    try {
      if (globalSettings.frozen) throw new Error("O jogo está congelado.");
      const room = await getRoom(payload.room_id);
      if (!room) throw new Error("Sala não encontrada.");
      if (room.status !== "playing" || room.paused) throw new Error("A partida não está ativa.");
      const active = currentPlayer(room);
      if (!active || Number(active.id) !== userId) throw new Error("Não é sua vez.");

      const index = Number(payload.card_index);
      if (!Number.isInteger(index) || index < 0 || index >= active.hand.length) throw new Error("Carta inválida.");
      const card = active.hand[index];
      if (!canPlay(room, card)) throw new Error("Essa carta não pode ser jogada agora.");

      const chosenColor = String(payload.chosen_color || "").toLowerCase();
      if (card.color === "wild" && !COLORS.includes(chosenColor)) {
        throw new Error("Escolha uma cor para a carta coringa.");
      }

      active.hand.splice(index, 1);
      room.discard.push(card);
      room.currentColor = card.color === "wild" ? chosenColor : card.color;
      active.unoCalled = false;
      clearUnoTimer(room.id, active.id);
      room.lastActivity = nowMs();

      io.to(`room:${room.id}`).emit("card_played", {
        player_id: active.id,
        player_name: active.display_name,
        card,
        chosen_color: room.currentColor
      });

      if (active.hand.length === 0) {
        await finishGame(room, active);
        roomStateForAll(room);
        scheduleSave(room);
        if (typeof ack === "function") ack({ ok: true, finished: true });
        return;
      }

      if (active.hand.length === 1) startUnoTimer(room, active);

      if (card.value === "skip") {
        nextIndex(room, 2);
      } else if (card.value === "reverse") {
        room.direction *= -1;
        nextIndex(room, room.players.filter((p) => p.role === "player").length === 2 ? 2 : 1);
      } else if (card.value === "draw2") {
        nextIndex(room, 1);
        const target = currentPlayer(room);
        if (target) drawCards(room, target, 2);
        nextIndex(room, 1);
      } else if (card.value === "draw4") {
        nextIndex(room, 1);
        const target = currentPlayer(room);
        if (target) drawCards(room, target, 4);
        nextIndex(room, 1);
      } else {
        nextIndex(room, 1);
      }

      roomStateForAll(room);
      scheduleSave(room);
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
      else socket.emit("error_message", error.message);
    }
  });

  socket.on("draw_card", async (payload = {}, ack) => {
    try {
      if (globalSettings.frozen) throw new Error("O jogo está congelado.");
      const room = await getRoom(payload.room_id);
      if (!room) throw new Error("Sala não encontrada.");
      if (room.status !== "playing" || room.paused) throw new Error("A partida não está ativa.");
      const active = currentPlayer(room);
      if (!active || Number(active.id) !== userId) throw new Error("Não é sua vez.");

      const before = active.hand.length;
      drawCards(room, active, 1);
      const drawn = active.hand.length > before ? active.hand[active.hand.length - 1] : null;
      io.to(`user:${userId}`).emit("card_drawn", { card: drawn });

      if (drawn && canPlay(room, drawn) && payload.play_drawn === true) {
        if (typeof ack === "function") ack({ ok: true, drawn, can_play: true });
        roomStateForAll(room);
        scheduleSave(room);
        return;
      }

      nextIndex(room, 1);
      roomStateForAll(room);
      scheduleSave(room);
      if (typeof ack === "function") ack({ ok: true, drawn, can_play: !!drawn && canPlay(room, drawn) });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
    }
  });

  socket.on("call_uno", async (payload = {}, ack) => {
    try {
      const room = await getRoom(payload.room_id);
      if (!room) throw new Error("Sala não encontrada.");
      const player = findPlayer(room, userId);
      if (!player) throw new Error("Você não está na sala.");
      if (player.hand.length !== 1) throw new Error("Você só pode chamar UNO quando tiver uma carta.");
      player.unoCalled = true;
      clearUnoTimer(room.id, userId);
      io.to(`room:${room.id}`).emit("uno_called", { player_id: player.id, player_name: player.display_name });
      roomStateForAll(room);
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
    }
  });

  socket.on("leave_room", async (payload = {}, ack) => {
    try {
      const room = await getRoom(payload.room_id);
      if (!room) return typeof ack === "function" && ack({ ok: true });
      socket.leave(`room:${room.id}`);
      await removePlayerFromRoom(room, userId, { hard: true });
      if (rooms.has(room.id)) {
        roomStateForAll(room);
        scheduleSave(room);
      }
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
    }
  });

  socket.on("kick_player", async (payload = {}, ack) => {
    try {
      const room = await getRoom(payload.room_id);
      if (!room) throw new Error("Sala não encontrada.");
      if (!playerCanControlRoom(room, userId)) throw new Error("Sem permissão.");
      const targetId = Number(payload.user_id);
      if (targetId === userId) throw new Error("Você não pode expulsar a si mesmo.");
      if (!findPlayer(room, targetId)) throw new Error("Jogador não encontrado.");
      await removePlayerFromRoom(room, targetId, { hard: true });
      io.to(`user:${targetId}`).emit("kicked", { room_id: room.id, reason: "Expulso da sala." });
      roomStateForAll(room);
      scheduleSave(room);
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
    }
  });

  socket.on("pause_room", async (payload = {}, ack) => {
    try {
      const room = await getRoom(payload.room_id);
      if (!room) throw new Error("Sala não encontrada.");
      if (!playerCanControlRoom(room, userId)) throw new Error("Sem permissão.");
      room.paused = !!payload.paused;
      if (room.paused) room.status = "paused";
      else if (room.deck.length) room.status = "playing";
      await pool.query(`UPDATE rooms SET status = $2 WHERE id = $1`, [room.id, room.status]);
      roomStateForAll(room);
      scheduleSave(room);
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
    }
  });

  socket.on("change_map", async (payload = {}, ack) => {
    try {
      const room = await getRoom(payload.room_id);
      if (!room) throw new Error("Sala não encontrada.");
      if (!playerCanControlRoom(room, userId)) throw new Error("Sem permissão.");
      if (room.status !== "waiting") throw new Error("O mapa só pode ser alterado antes da partida.");
      const map = cleanMap(payload.map);
      if (!(await ensureMapOwned(userId, map))) throw new Error("Você não possui esse mapa.");
      room.map = map;
      await pool.query(`UPDATE rooms SET map_id = $2 WHERE id = $1`, [room.id, map]);
      io.to(`room:${room.id}`).emit("map_changed", { map, map_name: MAPS[map].name });
      roomStateForAll(room);
      scheduleSave(room);
      if (typeof ack === "function") ack({ ok: true, map });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
    }
  });

  socket.on("chat_message", async (payload = {}, ack) => {
    try {
      const room = await getRoom(payload.room_id);
      if (!room) throw new Error("Sala não encontrada.");
      if (!room.chatEnabled || !globalSettings.chatPrivateOn) throw new Error("O chat está desativado.");
      const player = findPlayer(room, userId);
      if (!player) throw new Error("Você não está na sala.");
      const message = String(payload.message || "").replace(/[<>]/g, "").trim().slice(0, 240);
      if (!message) throw new Error("Mensagem vazia.");
      io.to(`room:${room.id}`).emit("chat_message", {
        player_id: player.id,
        player_name: player.display_name,
        message,
        at: new Date().toISOString()
      });
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
    }
  });

  socket.on("global_chat", async (payload = {}, ack) => {
    try {
      if (!globalSettings.chatGlobalOn) throw new Error("O chat global está desativado.");
      const message = String(payload.message || "").replace(/[<>]/g, "").trim().slice(0, 240);
      if (!message) throw new Error("Mensagem vazia.");
      io.emit("global_chat", {
        player_id: userId,
        player_name: socket.user.display_name,
        message,
        at: new Date().toISOString()
      });
      if (typeof ack === "function") ack({ ok: true });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
    }
  });

  socket.on("request_state", async (payload = {}, ack) => {
    try {
      const room = await getRoom(payload.room_id);
      if (!room) throw new Error("Sala não encontrada.");
      if (!findPlayer(room, userId)) throw new Error("Você não está na sala.");
      const state = stateFor(room, userId);
      socket.emit("room_state", state);
      if (typeof ack === "function") ack({ ok: true, state });
    } catch (error) {
      if (typeof ack === "function") ack({ ok: false, error: error.message });
    }
  });

  socket.on("disconnect", async () => {
    for (const room of rooms.values()) {
      const player = findPlayer(room, userId);
      if (!player) continue;
      player.connected = false;
      room.lastActivity = nowMs();
      roomStateForAll(room);

      const key = `${room.id}:${userId}`;
      const timer = setTimeout(async () => {
        disconnectTimers.delete(key);
        const current = rooms.get(room.id);
        if (!current) return;
        const p = findPlayer(current, userId);
        if (!p || p.connected) return;
        await removePlayerFromRoom(current, userId, { hard: true }).catch(() => {});
        if (rooms.has(current.id)) {
          roomStateForAll(current);
          scheduleSave(current);
        }
      }, 30000);
      disconnectTimers.set(key, timer);
    }
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled:", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: "Erro interno do servidor." });
});

setInterval(async () => {
  try {
    for (const room of rooms.values()) {
      if (room.status === "waiting" && nowMs() - room.lastActivity > 6 * 60 * 60 * 1000) {
        await pool.query(`DELETE FROM rooms WHERE id = $1`, [room.id]);
        rooms.delete(room.id);
      }
    }
  } catch (error) {
    console.error("cleanup:", error.message);
  }
}, 30 * 60 * 1000).unref();

process.on("SIGTERM", async () => {
  console.log("Encerrando UnoVelho...");
  for (const room of rooms.values()) {
    await saveRoomGame(room).catch(() => {});
  }
  await pool.end().catch(() => {});
  server.close(() => process.exit(0));
});

process.on("SIGINT", async () => {
  console.log("Encerrando UnoVelho...");
  for (const room of rooms.values()) {
    await saveRoomGame(room).catch(() => {});
  }
  await pool.end().catch(() => {});
  server.close(() => process.exit(0));
});

boot()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`UnoVelho online na porta ${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Falha ao iniciar:", error);
    process.exit(1);
  });
