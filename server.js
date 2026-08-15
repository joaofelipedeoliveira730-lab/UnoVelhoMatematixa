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
const PORT = process.env.PORT || 3000;

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

/* =========================================================
   EXPRESS
========================================================= */

app.use(
    cors({
        origin: FRONTEND_ORIGIN
    })
);

app.use(express.json());

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

/* =========================================================
   TRANSMITIR ESTADO
========================================================= */

async function broadcast(room) {
    for (const player of room.players) {
        io.to(`room:${room.id}`).emit(
            "room_state",
            state(room, player.id)
        );
    }

    await saveGame(room);
}

/* =========================================================
   REGISTRO
========================================================= */

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
                        req.body.username
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

            nextAuth();
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

server.listen(
    PORT,
    "0.0.0.0",
    () => {
        console.log(
            `velhoUNO backend online na porta ${PORT}`
        );
    }
);
