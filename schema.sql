CREATE TABLE IF NOT EXISTS profiles (
  id SERIAL PRIMARY KEY,
  username VARCHAR(24) NOT NULL UNIQUE,
  display_name VARCHAR(32) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  bruto_coins INTEGER NOT NULL DEFAULT 500 CHECK (bruto_coins >= 0),
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  skin_atual VARCHAR(255) NOT NULL DEFAULT 'default',
  avatar_url VARCHAR(500),
  last_daily_claim TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS shop_items (
  id SERIAL PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  nome VARCHAR(100) NOT NULL,
  tipo VARCHAR(30) NOT NULL CHECK (tipo IN ('skin','mapa','avatar','efeito')),
  preco_brutocoins INTEGER NOT NULL CHECK (preco_brutocoins >= 0),
  req_xp INTEGER NOT NULL DEFAULT 0 CHECK (req_xp >= 0),
  imagem_url VARCHAR(500),
  descricao VARCHAR(300) NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  user_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES shop_items(id) ON DELETE CASCADE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE IF NOT EXISTS rooms (
  id SERIAL PRIMARY KEY,
  code VARCHAR(6) NOT NULL UNIQUE,
  name VARCHAR(60) NOT NULL,
  host_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  password_hash VARCHAR(255),
  max_players INTEGER NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 2 AND 8),
  map_id VARCHAR(60) NOT NULL DEFAULT 'madeira',
  chat_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  swap_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','playing','paused','finished')),
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms(created_at DESC);

CREATE TABLE IF NOT EXISTS room_players (
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'player' CHECK (role IN ('player','spectator')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_players_user ON room_players(user_id);

CREATE TABLE IF NOT EXISTS games (
  room_id INTEGER PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS game_history (
  id BIGSERIAL PRIMARY KEY,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  winner_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  players_count INTEGER NOT NULL DEFAULT 0,
  map_id VARCHAR(60),
  finished_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS banimentos (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  banned_by INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  reason VARCHAR(300) NOT NULL DEFAULT 'Banimento administrativo',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_banimentos_user_active ON banimentos(user_id, active);

CREATE TABLE IF NOT EXISTS acoes_admin (
  id BIGSERIAL PRIMARY KEY,
  actor_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  action VARCHAR(80) NOT NULL,
  target_user_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
  room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS profiles_updated_at ON profiles;
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS rooms_updated_at ON rooms;
CREATE TRIGGER rooms_updated_at BEFORE UPDATE ON rooms
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO shop_items (slug, nome, tipo, preco_brutocoins, req_xp, imagem_url, descricao)
VALUES
('skin-velho', 'Skin Velho', 'skin', 0, 0, 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Velho', 'A skin clássica do UnoVelho.'),
('skin-neon', 'Neon', 'skin', 250, 20, 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Neon', 'Visual futurista para seu perfil.'),
('skin-ocean', 'Oceano', 'skin', 350, 50, 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Ocean', 'Uma skin com clima marítimo.'),
('skin-lua', 'Lua Roxa', 'skin', 500, 100, 'https://api.dicebear.com/9.x/bottts-neutral/svg?seed=Moon', 'Visual roxo e noturno.'),
('map-madeira', 'Mesa de Madeira', 'mapa', 0, 0, '', 'Mesa aconchegante de madeira.'),
('map-verde', 'Mesa Verde', 'mapa', 200, 0, '', 'Mesa verde clássica para partidas de cartas.'),
('map-western', 'Mesa Western', 'mapa', 300, 40, '', 'Madeira escura e iluminação quente.'),
('map-neon', 'Mesa Neon', 'mapa', 450, 80, '', 'Arena futurista com luzes neon.'),
('efeito-confete', 'Confete de Vitória', 'efeito', 180, 10, '', 'Confetes aparecem quando você vence.')
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  tipo = EXCLUDED.tipo,
  preco_brutocoins = EXCLUDED.preco_brutocoins,
  req_xp = EXCLUDED.req_xp,
  imagem_url = EXCLUDED.imagem_url,
  descricao = EXCLUDED.descricao,
  ativo = TRUE;
