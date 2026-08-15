require("dotenv").config();

const path = require("path");
const express = require("express");
const http = require("http");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "*";

const io = new Server(server, {
    cors: {
        origin: FRONTEND_ORIGIN,
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

/* =========================
   CONFIGURAÇÃO DO EXPRESS
========================= */

app.use(cors({
    origin: FRONTEND_ORIGIN
}));

app.use(express.json());

/*
   IMPORTANTE:
   Serve index.html, estilo.css, script.js etc.
*/
app.use(express.static(path.join(__dirname)));

/* =========================
   PÁGINA PRINCIPAL
========================= */

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

/* =========================
   HEALTH CHECK
========================= */

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        res.json({
            ok: true,
            message: "velhoUNO online"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            ok: false
        });
    }
});

/* =========================
   AUTENTICAÇÃO
========================= */

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

    } catch {

        res.status(401).json({
            error: "Não autenticado"
        });
    }
}

/* =========================
   UTILIDADES
========================= */

function cleanCode() {

    return Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase();
}

const rooms = new Map();

const COLORS = [
    "red",
    "green",
    "blue",
    "yellow"
];

/* =========================
   BARALHO
========================= */

function makeDeck() {

    let deck = [];

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

        const j = Math.floor(
            Math.random() * (i + 1)
        );

        [
            array[i],
            array[j]
        ] = [
            array[j],
            array[i]
        ];
    }

    return array;
}

/* =========================
   PONTUAÇÃO
========================= */

function cardPoints(card) {

    if (
        ["skip", "reverse", "draw2"]
            .includes(card.value)
    ) {
        return 20;
    }

    if (
        ["wild", "draw4"]
            .includes(card.value)
    ) {
        return 50;
    }

    return Number(card.value) || 0;
}

/* =========================
   COMPRAR CARTAS
========================= */

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

/* =========================
   VALIDAR CARTA
========================= */

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

/* =========================
   PRÓXIMO JOGADOR
========================= */

function next(room, amount = 1) {

    room.turn =
        (
            room.turn +
            room.direction * amount +
            room.players.length * 10
        ) %
        room.players.length;
}

/* =========================
   ESTADO DA SALA
========================= */

function state(room, userId) {

    const currentPlayer =
        room.players[room.turn];

    const me =
        room.players.find(
            p => p.id === userId
        );

    return {

        id: room.id,

        code: room.code,

        status: room.status,

        paused: room.paused,

        is_host:
            room.host_id === userId,

        is_admin:
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

/* =========================
   SALVAR JOGO
========================= */

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
                    paused: room.paused
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

/* =========================
   TRANSMITIR ESTADO
========================= */

async function broadcast(room) {

    for (const player of room.players) {

        io.to(`room:${room.id}`)
            .emit(
                "room_state",
                state(room, player.id)
            );
    }

    await saveGame(room);
}

/* =========================
   REGISTRO
========================= */

app.post(
    "/api/auth/register",
    async (req, res) => {

        try {

            const {
                username,
                display_name,
                password
            } = req.body;

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
                    ($1,$2,$3)
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

            console.error(error);

            res.status(400).json({
                error:
                    error.code === "23505"
                        ? "Usuário já existe."
                        : "Não foi possível cadastrar."
            });
        }
    }
);

/* =========================
   LOGIN
========================= */

app.post(
    "/api/auth/login",
    async (req, res) => {

        try {

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
                    [req.body.username]
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

            console.error(error);

            res.status(500).json({
                error: "Erro no login."
            });
        }
    }
);

/* =========================
   RANKING
========================= */

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

            console.error(error);

            res.status(500).json({
                error:
                    "Erro ao carregar ranking."
            });
        }
    }
);

/* =========================
   SOCKET.IO
========================= */

io.use(
    (socket, nextAuth) => {

        try {

            socket.user =
                jwt.verify(
                    socket.handshake.auth?.token || "",
                    JWT_SECRET
                );

            nextAuth();

        } catch {

            nextAuth(
                new Error("Não autenticado")
            );
        }
    }
);

/* =========================
   CONEXÃO
========================= */

io.on(
    "connection",
    socket => {

        console.log(
            "Usuário conectado:",
            socket.user.username
        );

        /* =====================
           CRIAR SALA
        ===================== */

        socket.on(
            "create_room",
            async ({
                max_players,
                password,
                chat_enabled,
                swap_enabled
            }) => {

                try {

                    max_players =
                        Math.max(
                            2,
                            Math.min(
                                10,
                                Number(max_players) || 5
                            )
