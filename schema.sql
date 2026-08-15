BEGIN;

CREATE TABLE IF NOT EXISTS profiles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(24) NOT NULL,
    display_name VARCHAR(32) NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
    points BIGINT NOT NULL DEFAULT 0 CHECK (points >= 0),
    coins BIGINT NOT NULL DEFAULT 0 CHECK (coins >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username_lower
    ON profiles (LOWER(username));
CREATE INDEX IF NOT EXISTS idx_profiles_ranking
    ON profiles (points DESC, wins DESC, display_name ASC);

CREATE TABLE IF NOT EXISTS rooms (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code CHAR(4) NOT NULL,
    name VARCHAR(40) NOT NULL DEFAULT 'Mesa do Velho',
    host_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    password_hash TEXT,
    max_players SMALLINT NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 2 AND 10),
    map_id BIGINT,
    chat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    swap_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(16) NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'playing', 'paused', 'finished', 'closed')),
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_rooms_code ON rooms (code);
CREATE INDEX IF NOT EXISTS idx_rooms_status_created ON rooms (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON rooms (host_id);

CREATE TABLE IF NOT EXISTS room_players (
    room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL DEFAULT 'player'
        CHECK (role IN ('player', 'spectator')),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_players_user ON room_players (user_id, joined_at DESC);

CREATE TABLE IF NOT EXISTS games (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id BIGINT NOT NULL UNIQUE REFERENCES rooms(id) ON DELETE CASCADE,
    state JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(16) NOT NULL DEFAULT 'waiting'
        CHECK (status IN ('waiting', 'playing', 'paused', 'finished', 'closed')),
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_games_status_updated ON games (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    room_id BIGINT REFERENCES rooms(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES profiles(id) ON DELETE SET NULL,
    channel VARCHAR(16) NOT NULL DEFAULT 'room'
        CHECK (channel IN ('global', 'room', 'private', 'group', 'admin')),
    message VARCHAR(300) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_room_created
    ON messages (room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_user_created
    ON messages (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS maps (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(48) NOT NULL UNIQUE,
    slug VARCHAR(64) NOT NULL UNIQUE,
    description VARCHAR(300),
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    asset_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by BIGINT REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS skins (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,
    type VARCHAR(24) NOT NULL DEFAULT 'character',
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    asset_url TEXT,
    price BIGINT NOT NULL DEFAULT 0 CHECK (price >= 0),
    available BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_skins_available_price ON skins (available, price);

CREATE TABLE IF NOT EXISTS inventario (
    user_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    item_type VARCHAR(24) NOT NULL,
    item_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    equipped BOOLEAN NOT NULL DEFAULT FALSE,
    acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, item_type, item_id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_user_equipped
    ON inventario (user_id, equipped);

CREATE TABLE IF NOT EXISTS personalizacao (
    user_id BIGINT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS transacoes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    amount BIGINT NOT NULL,
    balance_after BIGINT,
    type VARCHAR(24) NOT NULL,
    reference_type VARCHAR(32),
    reference_id BIGINT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_created
    ON transacoes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_reference
    ON transacoes (reference_type, reference_id);

CREATE TABLE IF NOT EXISTS presentes (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sender_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    recipient_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    item_type VARCHAR(24) NOT NULL,
    item_id BIGINT,
    coins BIGINT NOT NULL DEFAULT 0 CHECK (coins >= 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gifts_recipient_created
    ON presentes (recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS staff (
    user_id BIGINT PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
    created_by BIGINT REFERENCES profiles(id) ON DELETE SET NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS staff_permissions (
    user_id BIGINT NOT NULL REFERENCES staff(user_id) ON DELETE CASCADE,
    permission VARCHAR(48) NOT NULL,
    granted_by BIGINT REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, permission)
);

CREATE TABLE IF NOT EXISTS banimentos (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
    banned_by BIGINT REFERENCES profiles(id) ON DELETE SET NULL,
    reason VARCHAR(300),
    expires_at TIMESTAMPTZ,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bans_user_active ON banimentos (user_id, active);

CREATE TABLE IF NOT EXISTS acoes_admin (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id BIGINT REFERENCES profiles(id) ON DELETE SET NULL,
    action VARCHAR(64) NOT NULL,
    target_user_id BIGINT REFERENCES profiles(id) ON DELETE SET NULL,
    room_id BIGINT REFERENCES rooms(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created
    ON acoes_admin (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_actor
    ON acoes_admin (actor_id, created_at DESC);

CREATE TABLE IF NOT EXISTS configuracoes_jogo (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by BIGINT REFERENCES profiles(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
    key VARCHAR(64) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Adicionando colunas na tabela de usuários existente (não apague as chaves que já existem!)
ALTER TABLE users ADD COLUMN bruto_coins INT DEFAULT 0;
ALTER TABLE users ADD COLUMN xp INT DEFAULT 0;
ALTER TABLE users ADD COLUMN skin_atual VARCHAR(255) DEFAULT 'padrao.png';

-- Tabela para a Loja
CREATE TABLE IF NOT EXISTS loja_itens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- 'skin', 'mapa', 'objeto'
    preco_brutocoins INT NOT NULL,
    req_xp INT DEFAULT 0,
    imagem_url VARCHAR(255)
);

-- Tabela de Inventário (O que o jogador já comprou)
CREATE TABLE IF NOT EXISTS inventario (
    user_id INT,
    item_id INT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (item_id) REFERENCES loja_itens(id),
    PRIMARY KEY (user_id, item_id)
);

-- Garante que a coluna is_admin exista na tabela de perfis/usuários
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Garante as colunas de economia que você pediu
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bruto_coins INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skin_atual VARCHAR(255) DEFAULT 'default_skin.png';






COMMIT;
