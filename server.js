require("dotenv").config();

const path = require("path");
const crypto = require("crypto");
const express = require("express");
const http = require("http");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || null;
const PORT = process.env.PORT || 3000;

const io = new Server(server, {
    cors: {
        origin: FRONTEND_ORIGIN || true,
        methods: ["GET", "POST"]
    }
});

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    max: 5
});

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error("JWT_SECRET ausente");
}
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET ausente ou muito curto (mínimo 32 caracteres)");
}

const ADMIN_INITIAL_USERNAME = process.env.ADMIN_INITIAL_USERNAME || "Velho";
const ADMIN_INITIAL_PASSWORD = process.env.ADMIN_INITIAL_PASSWORD || "";

const loginAttempts = new Map();
const globalSettings = {
    chatGlobalOn: true,
    chatPrivateOn: true,
    frozen: false,
    freezeMessage: ""
};

function normalizeUsername(value) {
    return String(value || "").trim().slice(0, 24);
}

function normalizeDisplayName(value) {
    return String(value || "").trim().slice(0, 32);
}

function getClientIp(req) {
    return String(req.ip || req.socket?.remoteAddress || "unknown");
}

function rateLimitLogin(req) {
    const key = getClientIp(req);
    const now = Date.now();
    const current = loginAttempts.get(key) || { count: 0, resetAt: now + 10 * 60 * 1000 };
    if (current.resetAt <= now) {
        current.count = 0;
        current.resetAt = now + 10 * 60 * 1000;
    }
    current.count += 1;
    loginAttempts.set(key, current);
    return current.count <= 10;
}

async function isBanned(userId) {
    const result = await pool.query(
        `SELECT 1 FROM banimentos
         WHERE user_id = $1 AND active = TRUE
         AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [userId]
    );
    return result.rowCount > 0;
}

async function audit(actorId, action, data = {}) {
    try {
        await pool.query(
            `INSERT INTO acoes_admin (actor_id, action, target_user_id, room_id, metadata)
             VALUES ($1, $2, $3, $4, $5)`,
            [
                actorId || null,
                action,
                data.targetUserId || null,
                data.roomId || null,
                JSON.stringify(data.metadata || {})
            ]
        );
    } catch (error) {
        console.error("Erro na auditoria:", error.message);
    }
}

async function ensureInitialAdmin() {
    if (!ADMIN_INITIAL_PASSWORD) {
        console.warn("ADMIN_INITIAL_PASSWORD não definido; bootstrap do ADM ignorado.");
        return;
    }

    const username = normalizeUsername(ADMIN_INITIAL_USERNAME) || "Velho";
    const existing = await pool.query(
        `SELECT id, is_admin FROM profiles WHERE lower(username) = lower($1) LIMIT 1`,
        [username]
    );

    if (existing.rowCount) {
        if (!existing.rows[0].is_admin) {
            await pool.query(`UPDATE profiles SET is_admin = TRUE, updated_at = NOW() WHERE id = $1`, [existing.rows[0].id]);
        }
        return;
    }

    const hash = await bcrypt.hash(ADMIN_INITIAL_PASSWORD, 12);
    await pool.query(
        `INSERT INTO profiles (username, display_name, password_hash, is_admin)
         VALUES ($1, $2, $3, TRUE)`,
        [username, username, hash]
    );
    console.log(`ADM inicial ${username} criado com hash bcrypt.`);
}

async function requireAdmin(req, res, next) {
    auth(req, res, async () => {
        try {
            if (await isBanned(req.user.id)) {
                return res.status(403).json({ error: "Conta banida." });
            }
            if (!req.user.is_admin) {
                return res.status(403).json({ error: "Acesso administrativo negado." });
            }
            next();
        } catch (error) {
            console.error("Erro ao validar administrador:", error.message);
            res.status(500).json({ error: "Não foi possível validar a permissão." });
        }
    });
}

/* =========================================================
   EXPRESS
========================================================= */

app.use(
    cors({
        origin: FRONTEND_ORIGIN || true
    })
);

app.use(express.json({ limit: "32kb" }));

/*
    Seus arquivos estão na mesma pasta do servidor.js:

    index.html
    estilo.css
    script.js
    config.js
    servidor.js
*/

app.use(express.static(__dirname));

/* =========================================================
   PÁGINA PRINCIPAL
========================================================= */

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            ok: true,
            message: "velhoUNO online"
        });
    } catch (error) {
        console.error("Erro no health check:", error);

        res.status(500).json({
            ok: false
        });
    }
});

/* =========================================================
   AUTENTICAÇÃO
========================================================= */

function sign(user) {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            is_admin: user.is_admin
        },
        JWT_SECRET,
        {
            expiresIn: "7d"
        }
    );
}

function auth(req, res, next) {
    try {
        const token = (req.headers.authorization || "")
            .replace(/^Bearer /, "");

        req.user = jwt.verify(token, JWT_SECRET);

        next();
    } catch (error) {
        res.status(401).json({
            error: "Não autenticado"
        });
    }
}

/* =========================================================
   UTILIDADES
========================================================= */

function cleanCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let code = "";
    while (code.length < 4) {
        const byte = crypto.randomBytes(1)[0];
        code += alphabet[byte % alphabet.length];
    }
    return code;
}

const rooms = new Map();

const COLORS = [
    "red",
    "green",
    "blue",
    "yellow"
];

/* =========================================================
   BARALHO
========================================================= */

function makeDeck() {
    const deck = [];

    for (const color of COLORS) {
        deck.push({
            color,
            value: "0"
        });

        for (let n = 1; n <= 9; n++) {
            deck.push({
                color,
                value: String(n)
            });

            deck.push({
                color,
                value: String(n)
            });
        }

        for (let i = 0; i < 2; i++) {
            deck.push({
                color,
                value: "skip"
            });

            deck.push({
                color,
                value: "reverse"
            });

            deck.push({
                color,
                value: "draw2"
            });
        }
    }

    for (let i = 0; i < 4; i++) {
        deck.push({
            color: "wild",
            value: "wild"
        });

        deck.push({
            color: "wild",
            value: "draw4"
        });
    }

    return shuffle(deck);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));

        [array[i], array[j]] = [
            array[j],
            array[i]
        ];
    }

    return array;
}

/* =========================================================
   PONTUAÇÃO
========================================================= */

function cardPoints(card) {
    if (
        ["skip", "reverse", "draw2"].includes(card.value)
    ) {
        return 20;
    }

    if (
        ["wild", "draw4"].includes(card.value)
    ) {
        return 50;
    }

    return Number(card.value) || 0;
}

/* =========================================================
   COMPRAR CARTAS
========================================================= */

function draw(room, player, amount = 1) {
    for (let i = 0; i < amount; i++) {
        if (!room.deck.length) {
            if (room.discard.length <= 1) {
                return;
            }

            const top = room.discard.pop();

            room.deck = shuffle(room.discard);

            room.discard = [top];
        }

        const card = room.deck.pop();

        if (card) {
            player.hand.push(card);
        }
    }
}

/* =========================================================
   VALIDAR CARTA
========================================================= */

function valid(room, card) {
    const top = room.discard.at(-1);

    if (!top) {
        return true;
    }

    return (
        card.color === "wild" ||
        card.color === room.color ||
        card.color === top.color ||
        card.value === top.value
    );
}

/* =========================================================
   PRÓXIMO JOGADOR
========================================================= */

function next(room, amount = 1) {
    if (!room.players.length) {
        return;
    }

    room.turn =
        (
            room.turn +
            room.direction * amount +
            room.players.length * 10
        ) %
        room.players.length;
}

/* =========================================================
   ESTADO DA SALA
========================================================= */

function state(room, userId) {
    const currentPlayer =
        room.players[room.turn];

    const me =
        room.players.find(
            player => player.id === userId
        );

    return {
        id: room.id,

        code: room.code,

        status: room.status,

        paused: room.paused,

        is_host:
            room.host_id === userId,

        is_admin:
            room.host_id === userId ||
            !!room.admin_ids?.includes(userId),

        current_player_id:
            currentPlayer?.id,

        current_player_name:
            currentPlayer?.display_name,

        current_user_id:
            currentPlayer?.id === userId
                ? userId
                : currentPlayer?.id,

        top_card:
            room.discard.at(-1),

        my_hand:
            me?.hand || [],

        players:
            room.players.map(player => ({
                id: player.id,

                display_name:
                    player.display_name,

                is_host:
                    player.id === room.host_id,

                is_admin:
                    !!player.is_admin,

                cards_count:
                    player.hand.length,

                score:
                    player.score
            }))
    };
}

/* =========================================================
   SALVAR JOGO
========================================================= */

async function saveGame(room) {
    try {
        await pool.query(
            `
            INSERT INTO games
            (
                room_id,
                state,
                status,
                updated_at
            )
            VALUES
            (
                $1,
                $2,
                $3,
                now()
            )
            ON CONFLICT(room_id)
            DO UPDATE SET
                state = excluded.state,
                status = excluded.status,
                updated_at = now()
            `,
            [
                room.id,

                JSON.stringify({
                    players: room.players,
                    deck: room.deck,
                    discard: room.discard,
                    turn: room.turn,
                    direction: room.direction,
                    color: room.color,
                    paused: room.paused,
                    name: room.name,
                    map: room.map
                }),

                room.status
            ]
        );
    } catch (error) {
        console.error(
            "Erro ao salvar jogo:",
            error.message
        );
    }
}

/* =========================================================
   TRANSMITIR ESTADO
========================================================= */

const saveTimers = new Map();

function scheduleSaveGame(room) {
    const existing = saveTimers.get(room.id);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(async () => {
        saveTimers.delete(room.id);
        await saveGame(room);
    }, 350);
    saveTimers.set(room.id, timer);
}

async function broadcast(room) {
    io.to(`room:${room.id}`).emit("room_state_public", {
        id: room.id,
        code: room.code,
        name: room.name,
        map: room.map,
        status: room.status,
        paused: room.paused || globalSettings.frozen,
        freeze_message: globalSettings.frozen ? globalSettings.freezeMessage : "",
        current_player_id: room.players[room.turn]?.id,
        current_player_name: room.players[room.turn]?.display_name,
        top_card: room.discard.at(-1),
        players: room.players.map(player => ({
            id: player.id,
            display_name: player.display_name,
            is_host: player.id === room.host_id,
            is_admin: !!player.is_admin,
            cards_count: player.hand.length,
            score: player.score,
            role: player.role || "player"
        }))
    });

    for (const player of room.players) {
        io.to(`user:${player.id}`).emit("room_state", state(room, player.id));
    }

    scheduleSaveGame(room);
}

/* =========================================================
   REGISTRO
========================================================= */

app.post(
    "/api/auth/register",
    async (req, res) => {
        try {
            const username = normalizeUsername(req.body.username);
            const display_name = normalizeDisplayName(req.body.display_name);
            const password = String(req.body.password || "");

            if (
                !username ||
                !display_name ||
                !password ||
                password.length < 6
            ) {
                return res.status(400).json({
                    error:
                        "Preencha usuário, nome e senha de 6+ caracteres."
                });
            }

            const hash =
                await bcrypt.hash(
                    password,
                    12
                );

            const result =
                await pool.query(
                    `
                    INSERT INTO profiles
                    (
                        username,
                        display_name,
                        password_hash
                    )
                    VALUES
                    (
                        $1,
                        $2,
                        $3
                    )
                    RETURNING
                        id,
                        username,
                        display_name,
                        is_admin
                    `,
                    [
                        username,
                        display_name,
                        hash
                    ]
                );

            const user =
                result.rows[0];

            res.json({
                token: sign(user),
                user
            });
        } catch (error) {
            console.error(
                "Erro no registro:",
                error
            );

            res.status(400).json({
                error:
                    error.code === "23505"
                        ? "Usuário já existe."
                        : "Não foi possível cadastrar."
            });
        }
    }
);

/* =========================================================
   LOGIN
========================================================= */

app.post(
    "/api/auth/login",
    async (req, res) => {
        try {
            if (!rateLimitLogin(req)) {
                return res.status(429).json({ error: "Muitas tentativas. Tente novamente em alguns minutos." });
            }

            const username = normalizeUsername(req.body.username);
            const password = String(req.body.password || "");

            const result =
                await pool.query(
                    `
                    SELECT
                        id,
                        username,
                        display_name,
                        password_hash,
                        is_admin
                    FROM profiles
                    WHERE lower(username)
                    =
                    lower($1)
                    `,
                    [
                        username
                    ]
                );

            const user =
                result.rows[0];

            if (
                !user ||
                !(
                    await bcrypt.compare(
                        req.body.password || "",
                        user.password_hash
                    )
                )
            ) {
                return res.status(401).json({
                    error:
                        "Usuário ou senha incorretos."
                });
            }

            const {
                password_hash,
                ...safeUser
            } = user;

            res.json({
                token: sign(safeUser),
                user: safeUser
            });
        } catch (error) {
            console.error(
                "Erro no login:",
                error
            );

            res.status(500).json({
                error: "Erro no login."
            });
        }
    }
);

/* =========================================================
   SESSÃO ATUAL
========================================================= */

app.get("/api/auth/me", auth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, username, display_name, is_admin, wins, points, coins
             FROM profiles WHERE id = $1 LIMIT 1`,
            [req.user.id]
        );
        if (!result.rowCount) return res.status(401).json({ error: "Conta não encontrada." });
        if (await isBanned(req.user.id)) return res.status(403).json({ error: "Conta banida." });
        res.json({ user: result.rows[0] });
    } catch (error) {
        console.error("Erro ao validar sessão:", error.message);
        res.status(500).json({ error: "Não foi possível validar a sessão." });
    }
});

/* =========================================================
   RANKING
========================================================= */

app.get(
    "/api/ranking",
    async (req, res) => {
        try {
            const result =
                await pool.query(
                    `
                    SELECT
                        display_name,
                        wins,
                        points
                    FROM profiles
                    ORDER BY
                        points DESC,
                        wins DESC,
                        display_name ASC
                    LIMIT 100
                    `
                );

            res.json({
                ranking: result.rows
            });
        } catch (error) {
            console.error(
                "Erro no ranking:",
                error
            );

            res.status(500).json({
                error:
                    "Erro ao carregar ranking."
            });
        }
    }
);


/* =========================================================
   API - SALAS / ONLINE / ADMIN
========================================================= */

function roomPublic(room) {
    return {
        id: room.id,
        code: room.code,
        name: room.name || "Mesa do Velho",
        map: room.map || "Taberna Medieval",
        players: room.players?.length || 0,
        max_players: room.max_players,
        status: room.status,
        chat_enabled: room.chat_enabled
    };
}

function createRoomObject({ id, code, name, map, hostId, maxPlayers, chatEnabled, swapEnabled }) {
    return {
        id,
        code,
        name: name || "Mesa do Velho",
        map: map || "Taberna Medieval",
        host_id: hostId,
        max_players: maxPlayers,
        chat_enabled: chatEnabled,
        swap_enabled: swapEnabled,
        status: "waiting",
        paused: false,
        players: [],
        deck: [],
        discard: [],
        turn: 0,
        direction: 1,
        color: "red",
        admin_ids: []
    };
}

async function loadRoomFromDb(roomId) {
    const roomResult = await pool.query(`SELECT * FROM rooms WHERE id = $1`, [roomId]);
    const db = roomResult.rows[0];
    if (!db) return null;

    const gameResult = await pool.query(`SELECT state, status FROM games WHERE room_id = $1`, [roomId]);
    const playerResult = await pool.query(
        `SELECT p.id, p.display_name, p.is_admin, rp.role
         FROM room_players rp JOIN profiles p ON p.id = rp.user_id
         WHERE rp.room_id = $1 ORDER BY rp.joined_at ASC`,
        [roomId]
    );

    let room = createRoomObject({
        id: db.id,
        code: db.code.trim(),
        name: db.name,
        map: db.map_id,
        hostId: db.host_id,
        maxPlayers: db.max_players,
        chatEnabled: db.chat_enabled,
        swapEnabled: db.swap_enabled
    });
    room.status = db.status;
    room.players = playerResult.rows.map(p => ({
        id: p.id,
        display_name: p.display_name,
        is_admin: !!p.is_admin,
        role: p.role,
        score: 0,
        hand: []
    }));

    const saved = gameResult.rows[0]?.state;
    if (saved && typeof saved === "object") {
        room.deck = Array.isArray(saved.deck) ? saved.deck : [];
        room.discard = Array.isArray(saved.discard) ? saved.discard : [];
        room.turn = Number.isInteger(saved.turn) ? saved.turn : 0;
        room.direction = saved.direction === -1 ? -1 : 1;
        room.color = COLORS.includes(saved.color) ? saved.color : "red";
        room.paused = !!saved.paused;
        if (Array.isArray(saved.players)) {
            for (const savedPlayer of saved.players) {
                const current = room.players.find(p => p.id === savedPlayer.id);
                if (current) {
                    current.hand = Array.isArray(savedPlayer.hand) ? savedPlayer.hand : [];
                    current.score = Number(savedPlayer.score) || 0;
                }
            }
        }
    }
    return room;
}

async function getOrLoadRoom(roomId) {
    const current = rooms.get(roomId);
    if (current) return current;
    const room = await loadRoomFromDb(roomId);
    if (room) rooms.set(room.id, room);
    return room;
}

app.get("/api/rooms", auth, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT r.id, r.code, r.name, r.max_players, r.chat_enabled, r.status,
                    COUNT(rp.user_id)::int AS players
             FROM rooms r
             LEFT JOIN room_players rp ON rp.room_id = r.id AND rp.role = 'player'
             WHERE r.status IN ('waiting', 'playing', 'paused')
             GROUP BY r.id
             ORDER BY r.created_at DESC
             LIMIT 100`
        );
        res.json({
            rooms: result.rows.map(r => ({
                ...r,
                code: r.code.trim(),
                map: "Taberna Medieval"
            }))
        });
    } catch (error) {
        console.error("Erro ao listar salas:", error.message);
        res.status(500).json({ error: "Não foi possível carregar as salas." });
    }
});

app.post("/api/rooms", auth, async (req, res) => {
    const client = await pool.connect();
    try {
        const maxPlayers = Math.max(2, Math.min(10, Number(req.body.max_players) || 4));
        const name = normalizeDisplayName(req.body.name) || "Mesa do Velho";
        const map = String(req.body.map || "Taberna Medieval").trim().slice(0, 48);
        const password = String(req.body.password || "");
        const chatEnabled = req.body.chat_enabled !== false;
        const swapEnabled = !!req.body.swap_enabled;
        const passwordHash = password ? await bcrypt.hash(password, 12) : null;

        await client.query("BEGIN");
        let code;
        for (let attempt = 0; attempt < 20; attempt++) {
            const candidate = cleanCode();
            const exists = await client.query("SELECT 1 FROM rooms WHERE code = $1", [candidate]);
            if (!exists.rowCount) { code = candidate; break; }
        }
        if (!code) throw new Error("Não foi possível gerar uma porta única.");

        const inserted = await client.query(
            `INSERT INTO rooms (code, name, host_id, password_hash, max_players, chat_enabled, swap_enabled, status, settings)
             VALUES ($1,$2,$3,$4,$5,$6,$7,'waiting',$8)
             RETURNING id, code, name, max_players, chat_enabled, status`,
            [code, name, req.user.id, passwordHash, maxPlayers, chatEnabled, swapEnabled, JSON.stringify({ map, special_rules: req.body.special_rules || "Normal" })]
        );
        const roomRow = inserted.rows[0];
        await client.query(
            `INSERT INTO room_players (room_id, user_id, role) VALUES ($1,$2,'player')`,
            [roomRow.id, req.user.id]
        );
        await client.query("COMMIT");

        const room = createRoomObject({
            id: roomRow.id, code, name, map,
            hostId: req.user.id, maxPlayers,
            chatEnabled, swapEnabled
        });
        room.players.push({ id: req.user.id, display_name: req.user.display_name, is_admin: !!req.user.is_admin, role: "player", score: 0, hand: [] });
        rooms.set(room.id, room);
        res.status(201).json({ room: roomPublic(room) });
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        console.error("Erro ao criar sala REST:", error.message);
        res.status(400).json({ error: "Não foi possível criar a sala." });
    } finally {
        client.release();
    }
});

app.post("/api/rooms/:code/join", auth, async (req, res) => {
    try {
        const code = String(req.params.code || "").trim().toUpperCase();
        if (!/^[A-Z0-9]{4}$/.test(code)) return res.status(400).json({ error: "Porta inválida." });
        const dbResult = await pool.query(`SELECT * FROM rooms WHERE code = $1 AND status = 'waiting' LIMIT 1`, [code]);
        const db = dbResult.rows[0];
        if (!db) return res.status(404).json({ error: "Sala não encontrada." });

        if (db.password_hash) {
            const ok = await bcrypt.compare(String(req.body.password || ""), db.password_hash);
            if (!ok) return res.status(403).json({ error: "Senha da sala incorreta." });
        }

        const count = await pool.query(`SELECT COUNT(*)::int AS count FROM room_players WHERE room_id = $1 AND role = 'player'`, [db.id]);
        if (count.rows[0].count >= db.max_players) return res.status(409).json({ error: "Sala cheia." });

        await pool.query(
            `INSERT INTO room_players (room_id, user_id, role) VALUES ($1,$2,'player') ON CONFLICT (room_id,user_id) DO UPDATE SET role='player'`,
            [db.id, req.user.id]
        );
        const room = await getOrLoadRoom(db.id);
        if (room && !room.players.some(p => p.id === req.user.id)) {
            room.players.push({ id: req.user.id, display_name: req.user.display_name, is_admin: !!req.user.is_admin, role: "player", score: 0, hand: [] });
        }
        res.json({ room: room ? roomPublic(room) : { id: db.id, code } });
    } catch (error) {
        console.error("Erro ao entrar na sala REST:", error.message);
        res.status(500).json({ error: "Não foi possível entrar na sala." });
    }
});

app.get("/api/online", auth, (req, res) => {
    const unique = new Map();
    for (const s of io.sockets.sockets.values()) {
        if (!s.user) continue;
        unique.set(String(s.user.id), { id: s.user.id, username: s.user.username, display_name: s.user.display_name });
    }
    res.json({ players: [...unique.values()] });
});

app.post("/api/admin/command", requireAdmin, async (req, res) => {
    const command = String(req.body.command || "").trim();
    const lower = command.toLowerCase();
    try {
        if (lower === "/help") {
            return res.json({ message: "Comandos: /all, /ver partida, /chatglobal on/off, /chat on/off, /congelar msg: texto, /descongelar, /banir id, /expulsar id, /renunciarpódio. Comandos de criação serão ativados nas próximas etapas." });
        }
        if (lower === "/all") {
            const players = [...new Map([...io.sockets.sockets.values()].filter(s => s.user).map(s => [String(s.user.id), s.user])).values()];
            await audit(req.user.id, "list_online", { metadata: { count: players.length } });
            return res.json({ message: players.map(p => `[ID ${String(p.id).padStart(3, "0")}] ${p.display_name || p.username}`).join("\n") || "Nenhum jogador online." });
        }
        if (lower === "/ver partida") {
            const result = await pool.query(`SELECT r.id, r.code, r.status, r.max_players, COUNT(rp.user_id)::int AS players FROM rooms r LEFT JOIN room_players rp ON rp.room_id=r.id AND rp.role='player' WHERE r.status IN ('waiting','playing','paused') GROUP BY r.id ORDER BY r.created_at DESC LIMIT 100`);
            await audit(req.user.id, "list_games", { metadata: { count: result.rowCount } });
            return res.json({ message: result.rows.map(r => `#${r.id} ${r.code.trim()} • ${r.status} • ${r.players}/${r.max_players}`).join("\n") || "Nenhuma partida aberta." });
        }
        if (lower === "/descongelar") {
            globalSettings.frozen = false;
            globalSettings.freezeMessage = "";
            io.emit("uno:unfreeze");
            await audit(req.user.id, "unfreeze");
            return res.json({ message: "Jogo descongelado." });
        }
        if (lower.startsWith("/congelar")) {
            const message = command.replace(/^\/congelar\s*(msg:\s*)?/i, "").trim().slice(0, 300) || "Jogo congelado pelo administrador.";
            globalSettings.frozen = true;
            globalSettings.freezeMessage = message;
            io.emit("uno:freeze", { message });
            await audit(req.user.id, "freeze", { metadata: { message } });
            return res.json({ message: `Jogo congelado: ${message}` });
        }
        if (/^\/chatglobal\s+(on|off)$/i.test(command)) {
            const on = /\bon$/i.test(command);
            globalSettings.chatGlobalOn = on;
            io.emit("game_settings", { chatGlobalOn: on });
            await audit(req.user.id, "chat_global", { metadata: { enabled: on } });
            return res.json({ message: `Chat global ${on ? "ligado" : "desligado"}.` });
        }
        if (/^\/chat\s+(on|off)$/i.test(command)) {
            const on = /\bon$/i.test(command);
            globalSettings.chatPrivateOn = on;
            await audit(req.user.id, "chat_private", { metadata: { enabled: on } });
            return res.json({ message: `Chat privado ${on ? "ligado" : "desligado"}.` });
        }
        if (lower === "/renunciarpódio" || lower === "/renunciapódio" || lower === "/reiniciarpodio") {
            await audit(req.user.id, "podium_command_requested", { metadata: { note: "Reset destrutivo não executado sem regra final do pódio." } });
            return res.json({ message: "Comando recebido. O reset do pódio ainda não altera pontuações até definirmos a regra final." });
        }
        if (lower.startsWith("/banir ")) {
            const targetId = Number(command.split(/\s+/)[1]);
            if (!Number.isSafeInteger(targetId) || targetId <= 0) return res.status(400).json({ error: "ID inválido." });
            if (targetId === req.user.id) return res.status(400).json({ error: "O administrador não pode se banir." });
            await pool.query(`INSERT INTO banimentos (user_id, banned_by, reason) VALUES ($1,$2,$3)`, [targetId, req.user.id, "Banimento administrativo"]);
            for (const s of io.sockets.sockets.values()) if (Number(s.user?.id) === targetId) s.disconnect(true);
            await audit(req.user.id, "ban", { targetUserId: targetId });
            return res.json({ message: `Jogador ${targetId} banido.` });
        }
        if (lower.startsWith("/expulsar ")) {
            const targetId = Number(command.split(/\s+/)[1]);
            if (!Number.isSafeInteger(targetId) || targetId <= 0) return res.status(400).json({ error: "ID inválido." });
            for (const room of rooms.values()) {
                const playerIndex = room.players.findIndex(p => Number(p.id) === targetId);
                if (playerIndex >= 0) {
                    room.players.splice(playerIndex, 1);
                    await pool.query(`DELETE FROM room_players WHERE room_id=$1 AND user_id=$2`, [room.id, targetId]);
                    io.to(`user:${targetId}`).emit("kicked", { room_id: room.id });
                    await audit(req.user.id, "kick", { targetUserId: targetId, roomId: room.id });
                    return res.json({ message: `Jogador ${targetId} expulso da sala ${room.code}.` });
                }
            }
            return res.status(404).json({ error: "Jogador não está em uma sala ativa." });
        }
        return res.status(400).json({ error: "Comando ainda não implementado nesta etapa." });
    } catch (error) {
        console.error("Erro no comando administrativo:", error.message);
        res.status(500).json({ error: "Não foi possível executar o comando." });
    }
});

/* =========================================================
   SOCKET.IO - AUTENTICAÇÃO
========================================================= */

io.use(
    (socket, nextAuth) => {
        try {
            socket.user =
                jwt.verify(
                    socket.handshake.auth?.token || "",
                    JWT_SECRET
                );

            isBanned(socket.user.id).then((banned) => {
                if (banned) return nextAuth(new Error("Conta banida"));
                nextAuth();
            }).catch(() => nextAuth(new Error("Falha de autenticação")));
        } catch (error) {
            nextAuth(
                new Error("Não autenticado")
            );
        }
    }
);

/* =========================================================
   CONEXÃO SOCKET.IO
========================================================= */

io.on(
    "connection",
    socket => {
        console.log(
            "Usuário conectado:",
            socket.user.username
        );
        socket.join(`user:${socket.user.id}`);

        /* =====================================================
           CRIAR SALA
        ===================================================== */

        socket.on(
            "create_room",
            async ({
                max_players,
                password,
                chat_enabled,
                swap_enabled
            } = {}) => {
                try {
                    max_players =
                        Math.max(
                            2,
                            Math.min(
                                10,
                                Number(max_players) || 5
                            )
                        );

                    let code =
                        cleanCode();

                    while (
                        [...rooms.values()]
                            .some(
                                room =>
                                    room.code === code
                            )
                    ) {
                        code =
                            cleanCode();
                    }

                    const passwordHash =
                        password
                            ? await bcrypt.hash(
                                password,
                                10
                            )
                            : null;

                    const result =
                        await pool.query(
                            `
                            INSERT INTO rooms
                            (
                                code,
                                host_id,
                                password_hash,
                                max_players,
                                chat_enabled,
                                swap_enabled,
                                status
                            )
                            VALUES
                            (
                                $1,
                                $2,
                                $3,
                                $4,
                                $5,
                                $6,
                                'waiting'
                            )
                            RETURNING id
                            `,
                            [
                                code,
                                socket.user.id,
                                passwordHash,
                                max_players,
                                !!chat_enabled,
                                !!swap_enabled
                            ]
                        );

                    const roomId =
                        result.rows[0].id;

                    const room = {
                        id: roomId,

                        code,

                        host_id:
                            socket.user.id,

                        max_players,

                        chat_enabled:
                            !!chat_enabled,

                        swap_enabled:
                            !!swap_enabled,

                        status: "waiting",

                        paused: false,

                        players: [
                            {
                                id:
                                    socket.user.id,

                                display_name:
                                    socket.user.display_name,

                                is_admin:
                                    !!socket.user.is_admin,

                                score: 0,

                                hand: []
                            }
                        ],

                        deck: [],

                        discard: [],

                        turn: 0,

                        direction: 1,

                        color: "red",

                        admin_ids: []
                    };

                    rooms.set(
                        room.id,
                        room
                    );

                    await pool.query(
                        `
                        INSERT INTO room_players
                        (
                            room_id,
                            user_id
                        )
                        VALUES
                        (
                            $1,
                            $2
                        )
                        ON CONFLICT DO NOTHING
                        `,
                        [
                            room.id,
                            socket.user.id
                        ]
                    );

                    socket.join(
                        `room:${room.id}`
                    );

                    await broadcast(room);
                } catch (error) {
                    console.error(
                        "Erro ao criar sala:",
                        error
                    );

                    socket.emit(
                        "error_message",
                        "Não foi possível criar a sala."
                    );
                }
            }
        );

        /* =====================================================
           ENTRAR NA SALA
        ===================================================== */

        socket.on(
            "join_room",
            async ({
                code,
                password
            } = {}) => {
                try {
                    const roomCode =
                        String(
                            code || ""
                        )
                            .trim()
                            .toUpperCase();

                    const result =
                        await pool.query(
                            `
                            SELECT *
                            FROM rooms
                            WHERE code = $1
                            AND status = 'waiting'
                            `,
                            [
                                roomCode
                            ]
                        );

                    const db =
                        result.rows[0];

                    if (!db) {
                        return socket.emit(
                            "error_message",
                            "Sala não encontrada."
                        );
                    }

                    if (
                        db.password_hash &&
                        !(
                            await bcrypt.compare(
                                password || "",
                                db.password_hash
                            )
                        )
                    ) {
                        return socket.emit(
                            "error_message",
                            "Senha da sala incorreta."
                        );
                    }

                    let room =
                        rooms.get(db.id);

                    if (!room) {
                        room = {
                            id: db.id,

                            code: db.code,

                            host_id:
                                db.host_id,

                            max_players:
                                db.max_players,

                            chat_enabled:
                                db.chat_enabled,

                            swap_enabled:
                                db.swap_enabled,

                            status:
                                db.status,

                            paused: false,

                            players: [],

                            deck: [],

                            discard: [],

                            turn: 0,

                            direction: 1,

                            color: "red",

                            admin_ids: []
                        };

                        const playersResult =
                            await pool.query(
                                `
                                SELECT
                                    p.id,
                                    p.display_name,
                                    p.is_admin
                                FROM room_players rp
                                JOIN profiles p
                                ON p.id = rp.user_id
                                WHERE rp.room_id = $1
                                `,
                                [
                                    db.id
                                ]
                            );

                        room.players =
                            playersResult.rows.map(
                                player => ({
                                    ...player,

                                    score: 0,

                                    hand: []
                                })
                            );

                        rooms.set(
                            db.id,
                            room
                        );
                    }

                    if (
                        room.players.length >=
                        room.max_players
                    ) {
                        return socket.emit(
                            "error_message",
                            "Sala cheia."
                        );
                    }

                    if (
                        !room.players.some(
                            player =>
                                player.id ===
                                socket.user.id
                        )
                    ) {
                        room.players.push({
                            id:
                                socket.user.id,

                            display_name:
                                socket.user.display_name,

                            is_admin:
                                !!socket.user.is_admin,

                            score: 0,

                            hand: []
                        });
                    }

                    await pool.query(
                        `
                        INSERT INTO room_players
                        (
                            room_id,
                            user_id
                        )
                        VALUES
                        (
                            $1,
                            $2
                        )
                        ON CONFLICT DO NOTHING
                        `,
                        [
                            room.id,
                            socket.user.id
                        ]
                    );

                    socket.join(
                        `room:${room.id}`
                    );

                    await broadcast(room);
                } catch (error) {
                    console.error(
                        "Erro ao entrar na sala:",
                        error
                    );

                    socket.emit(
                        "error_message",
                        "Não foi possível entrar."
                    );
                }
            }
        );

        /* =====================================================
           INICIAR JOGO
        ===================================================== */

        socket.on(
            "start_game",
            async ({
                room_id
            } = {}) => {
                try {
                    const room =
                        rooms.get(room_id);

                    if (!room) {
                        return;
                    }

                    if (
                        room.host_id !==
                        socket.user.id
                    ) {
                        return;
                    }

                    if (
                        room.players.length < 2
                    ) {
                        return;
                    }

                    if (
                        room.status !==
                        "waiting"
                    ) {
                        return;
                    }

                    room.deck =
                        makeDeck();

                    room.discard = [
                        room.deck.pop()
                    ];

                    /*
                        Evita começar com carta coringa.
                    */
                    while (
                        room.discard[0] &&
                        room.discard[0].color ===
                            "wild"
                    ) {
                        room.deck.unshift(
                            room.discard.pop()
                        );

                        room.discard = [
                            room.deck.pop()
                        ];
                    }

                    room.color =
                        room.discard[0].color;

                    room.turn = 0;

                    room.direction = 1;

                    room.status =
                        "playing";

                    room.paused = false;

                    for (
                        const player of
                        room.players
                    ) {
                        player.hand = [];

                        player.score = 0;

                        draw(
                            room,
                            player,
                            7
                        );
                    }

                    await pool.query(
                        `
                        UPDATE rooms
                        SET status = 'playing'
                        WHERE id = $1
                        `,
                        [
                            room.id
                        ]
                    );

                    await broadcast(room);
                } catch (error) {
                    console.error(
                        "Erro ao iniciar jogo:",
                        error
                    );
                }
            }
        );

        /* =====================================================
           JOGAR CARTA
        ===================================================== */

        socket.on(
            "play_card",
            async ({
                room_id,
                index,
                color
            } = {}) => {
                try {
                    const room =
                        rooms.get(room_id);

                    const player =
                        room?.players.find(
                            p =>
                                p.id ===
                                socket.user.id
                        );

                    if (!room || !player) {
                        return;
                    }

                    if (
                        globalSettings.frozen ||
                        room.paused ||
                        room.status !==
                            "playing"
                    ) {
                        return;
                    }

                    if (
                        !room.players[
                            room.turn
                        ] ||
                        room.players[
                            room.turn
                        ].id !== player.id
                    ) {
                        return;
                    }

                    const card =
                        player.hand[index];

                    if (!card) {
                        return;
                    }

                    if (
                        !valid(
                            room,
                            card
                        )
                    ) {
                        return;
                    }

                    if (
                        card.color ===
                            "wild" &&
                        ![
                            "red",
                            "green",
                            "blue",
                            "yellow"
                        ].includes(color)
                    ) {
                        return;
                    }

                    player.hand.splice(
                        index,
                        1
                    );

                    room.discard.push(
                        card
                    );

                    room.color =
                        card.color ===
                            "wild"
                            ? color
                            : card.color;

                    /*
                        Jogador venceu.
                    */
                    if (
                        player.hand.length ===
                        0
                    ) {
                        room.status =
                            "finished";

                        const points =
                            room.players
                                .filter(
                                    p =>
                                        p.id !==
                                        player.id
                                )
                                .reduce(
                                    (
                                        total,
                                        other
                                    ) =>
                                        total +
                                        other.hand.reduce(
                                            (
                                                sum,
                                                c
                                            ) =>
                                                sum +
                                                cardPoints(
                                                    c
                                                ),
                                            0
                                        ),
                                    0
                                );

                        player.score +=
                            points;

                        await pool.query(
                            `
                            UPDATE profiles
                            SET
                                wins = wins + 1,
                                points = points + $1
                            WHERE id = $2
                            `,
                            [
                                player.score,
                                player.id
                            ]
                        );

                        await pool.query(
                            `
                            UPDATE rooms
                            SET status = 'finished'
                            WHERE id = $1
                            `,
                            [
                                room.id
                            ]
                        );

                        await broadcast(
                            room
                        );

                        return;
                    }

                    /*
                        Efeitos das cartas.
                    */
                    if (
                        card.value ===
                        "skip"
                    ) {
                        next(room, 2);
                    } else if (
                        card.value ===
                        "reverse"
                    ) {
                        room.direction *=
                            -1;

                        if (
                            room.players.length ===
                            2
                        ) {
                            next(room, 2);
                        } else {
                            next(room, 1);
                        }
                    } else if (
                        card.value ===
                        "draw2"
                    ) {
                        next(room);

                        if (
                            room.players[
                                room.turn
                            ]
                        ) {
                            draw(
                                room,
                                room.players[
                                    room.turn
                                ],
                                2
                            );
                        }

                        next(room);
                    } else if (
                        card.value ===
                        "draw4"
                    ) {
                        next(room);

                        if (
                            room.players[
                                room.turn
                            ]
                        ) {
                            draw(
                                room,
                                room.players[
                                    room.turn
                                ],
                                4
                            );
                        }

                        next(room);
                    } else {
                        next(room);
                    }

                    await broadcast(room);
                } catch (error) {
                    console.error(
                        "Erro ao jogar carta:",
                        error
                    );
                }
            }
        );

        /* =====================================================
           COMPRAR CARTA
        ===================================================== */

        socket.on(
            "draw_card",
            async ({
                room_id
            } = {}) => {
                try {
                    const room =
                        rooms.get(room_id);

                    const player =
                        room?.players.find(
                            p =>
                                p.id ===
                                socket.user.id
                        );

                    if (!room || !player) {
                        return;
                    }

                    if (
                        globalSettings.frozen ||
                        room.paused ||
                        room.status !==
                            "playing"
                    ) {
                        return;
                    }

                    if (
                        !room.players[
                            room.turn
                        ] ||
                        room.players[
                            room.turn
                        ].id !== player.id
                    ) {
                        return;
                    }

                    draw(
                        room,
                        player,
                        1
                    );

                    next(room);

                    await broadcast(room);
                } catch (error) {
                    console.error(
                        "Erro ao comprar carta:",
                        error
                    );
                }
            }
        );

        /* =====================================================
           UNO
        ===================================================== */

        socket.on(
            "say_uno",
            () => {
                io.to(
                    `room:${socket.user.id}`
                );
            }
        );

        /* =====================================================
           PAUSAR / CONTINUAR
        ===================================================== */

        socket.on(
            "toggle_pause",
            async ({
                room_id
            } = {}) => {
                try {
                    const room =
                        rooms.get(room_id);

                    if (!room) {
                        return;
                    }

                    const isAdmin =
                        room.host_id ===
                            socket.user.id ||
                        !!socket.user.is_admin ||
                        !!room.admin_ids?.includes(
                            socket.user.id
                        );

                    if (!isAdmin) {
                        return;
                    }

                    room.paused =
                        !room.paused;

                    await broadcast(room);
                } catch (error) {
                    console.error(
                        "Erro ao pausar jogo:",
                        error
                    );
                }
            }
        );

        /* =====================================================
           CHAT
        ===================================================== */

        socket.on(
            "chat",
            async ({
                room_id,
                message
            } = {}) => {
                try {
                    const room =
                        rooms.get(room_id);

                    const text =
                        String(
                            message || ""
                        )
                            .trim()
                            .slice(0, 300);

                    if (
                        !room ||
                        !room.chat_enabled ||
                        !text
                    ) {
                        return;
                    }

                    const result =
                        await pool.query(
                            `
                            INSERT INTO messages
                            (
                                room_id,
                                user_id,
                                message
                            )
                            VALUES
                            (
                                $1,
                                $2,
                                $3
                            )
                            RETURNING created_at
                            `,
                            [
                                room.id,
                                socket.user.id,
                                text
                            ]
                        );

                    io.to(
                        `room:${room.id}`
                    ).emit(
                        "chat_message",
                        {
                            display_name:
                                socket.user.display_name,

                            message:
                                text,

                            created_at:
                                result.rows[0]
                                    .created_at
                        }
                    );
                } catch (error) {
                    console.error(
                        "Erro no chat:",
                        error
                    );
                }
            }
        );

        /* =====================================================
           SAIR DA SALA
        ===================================================== */

        socket.on(
            "leave_room",
            async () => {
                try {
                    for (
                        const room of
                        rooms.values()
                    ) {
                        const index =
                            room.players.findIndex(
                                player =>
                                    player.id ===
                                    socket.user.id
                            );

                        if (index < 0) {
                            continue;
                        }

                        room.players.splice(
                            index,
                            1
                        );

                        await pool.query(
                            `
                            DELETE FROM room_players
                            WHERE room_id = $1
                            AND user_id = $2
                            `,
                            [
                                room.id,
                                socket.user.id
                            ]
                        );

                        if (
                            room.players.length ===
                            0
                        ) {
                            rooms.delete(
                                room.id
                            );

                            await pool.query(
                                `
                                DELETE FROM rooms
                                WHERE id = $1
                                `,
                                [
                                    room.id
                                ]
                            );
                        } else {
                            if (
                                room.host_id ===
                                socket.user.id
                            ) {
                                room.host_id =
                                    room.players[0]
                                        .id;

                                await pool.query(
                                    `
                                    UPDATE rooms
                                    SET host_id = $1
                                    WHERE id = $2
                                    `,
                                    [
                                        room.host_id,
                                        room.id
                                    ]
                                );
                            }

                            if (
                                room.turn >=
                                room.players.length
                            ) {
                                room.turn = 0;
                            }

                            await broadcast(
                                room
                            );
                        }

                        break;
                    }
                } catch (error) {
                    console.error(
                        "Erro ao sair da sala:",
                        error
                    );
                }
            }
        );

        /* =====================================================
           DESCONEXÃO
        ===================================================== */

        socket.on(
            "disconnect",
            reason => {
                console.log(
                    "Usuário desconectado:",
                    socket.user.username,
                    reason
                );
            }
        );
    }
);

/* =========================================================
   ERROS GERAIS
========================================================= */

app.use(
    (err, req, res, next) => {
        console.error(
            "Erro interno:",
            err
        );

        if (res.headersSent) {
            return next(err);
        }

        res.status(500).json({
            error:
                "Erro interno do servidor."
        });
    }
);

/* =========================================================
   INICIAR SERVIDOR
========================================================= */

async function start() {
    await pool.query("SELECT 1");
    await ensureInitialAdmin();
    server.listen(PORT, "0.0.0.0", () => {
        console.log(`velhoUNO backend online na porta ${PORT}`);
    });
}

start().catch((error) => {
    console.error("Falha ao iniciar UnoVelho:", error);
    process.exit(1);
});
