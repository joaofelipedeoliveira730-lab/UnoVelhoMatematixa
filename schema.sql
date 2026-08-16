-- UnoVelho Matematixa - PostgreSQL schema (não destrutivo)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user',
  coins BIGINT NOT NULL DEFAULT 500 CHECK (coins >= 0),
  xp BIGINT NOT NULL DEFAULT 0 CHECK (xp >= 0),
  level INT NOT NULL DEFAULT 1 CHECK (level >= 1),
  wins INT NOT NULL DEFAULT 0,
  losses INT NOT NULL DEFAULT 0,
  games_played INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN IF NOT EXISTS coins BIGINT NOT NULL DEFAULT 500;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp BIGINT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wins INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS losses INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS games_played INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_blocked_until TIMESTAMP;

CREATE TABLE IF NOT EXISTS profiles (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  bio VARCHAR(180) NOT NULL DEFAULT '',
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Migração segura de instalações antigas.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username VARCHAR(50);
ALTER TABLE profiles ALTER COLUMN username DROP NOT NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio VARCHAR(180) NOT NULL DEFAULT '';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS items (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(40) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  price BIGINT NOT NULL DEFAULT 0 CHECK (price >= 0),
  xp_required BIGINT NOT NULL DEFAULT 0 CHECK (xp_required >= 0),
  rarity VARCHAR(20) NOT NULL DEFAULT 'common',
  asset JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_inventory (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(80) NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  quantity INT NOT NULL DEFAULT 1 CHECK (quantity > 0),
  acquired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_id)
);

-- Migração segura de inventário antigo: garante as colunas usadas pelo backend.
ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS item_type VARCHAR(40);
ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS quantity INT;
ALTER TABLE user_inventory ALTER COLUMN quantity SET DEFAULT 1;
UPDATE user_inventory ui SET item_type=COALESCE(i.category,'cosmetic') FROM items i WHERE i.id=ui.item_id AND (ui.item_type IS NULL OR ui.item_type='');
ALTER TABLE user_inventory ALTER COLUMN item_type SET DEFAULT 'cosmetic';
ALTER TABLE user_inventory ALTER COLUMN item_type SET NOT NULL;
UPDATE user_inventory SET quantity=1 WHERE quantity IS NULL OR quantity < 1;
ALTER TABLE user_inventory ADD COLUMN IF NOT EXISTS acquired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS player_market (
  listing_id SERIAL PRIMARY KEY,
  seller_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id VARCHAR(80) NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  price BIGINT NOT NULL CHECK (price > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sold_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS achievements (
  id VARCHAR(80) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL,
  icon VARCHAR(20) NOT NULL DEFAULT '🏆',
  xp_reward BIGINT NOT NULL DEFAULT 0,
  coin_reward BIGINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id VARCHAR(80) NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS matches (
  id UUID PRIMARY KEY,
  mode VARCHAR(20) NOT NULL,
  difficulty VARCHAR(20),
  map_id VARCHAR(80),
  room_code VARCHAR(30),
  winner_user_id INT REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS match_players (
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  username_snapshot VARCHAR(50) NOT NULL,
  position INT,
  result VARCHAR(20),
  coins_earned BIGINT NOT NULL DEFAULT 0,
  xp_earned BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (match_id, username_snapshot)
);


CREATE TABLE IF NOT EXISTS user_pass_claims (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pass_level INT NOT NULL CHECK (pass_level BETWEEN 1 AND 100),
  claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, pass_level)
);

CREATE INDEX IF NOT EXISTS idx_user_pass_claims_user ON user_pass_claims(user_id, pass_level);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  channel VARCHAR(20) NOT NULL,
  room_code VARCHAR(30),
  sender_id INT REFERENCES users(id) ON DELETE SET NULL,
  receiver_id INT REFERENCES users(id) ON DELETE SET NULL,
  sender_name VARCHAR(50) NOT NULL,
  body VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id BIGSERIAL PRIMARY KEY,
  actor_id INT REFERENCES users(id) ON DELETE SET NULL,
  target_id INT REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(40) NOT NULL,
  reason VARCHAR(255) NOT NULL DEFAULT '',
  expires_at TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_bootstrap (
  key VARCHAR(80) PRIMARY KEY,
  completed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS global_game_state (
  id INT PRIMARY KEY CHECK (id = 1),
  paused BOOLEAN NOT NULL DEFAULT FALSE,
  message VARCHAR(500) NOT NULL DEFAULT '',
  updated_by INT REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_id INT REFERENCES users(id) ON DELETE SET NULL,
  command VARCHAR(80) NOT NULL,
  arguments VARCHAR(500) NOT NULL DEFAULT '',
  result VARCHAR(40) NOT NULL DEFAULT 'ok',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id BIGSERIAL PRIMARY KEY,
  reporter_id INT REFERENCES users(id) ON DELETE SET NULL,
  target_id INT REFERENCES users(id) ON DELETE SET NULL,
  reason VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_level ON users(level DESC, xp DESC);
CREATE INDEX IF NOT EXISTS idx_users_coins ON users(coins DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_user ON user_inventory(user_id);
CREATE INDEX IF NOT EXISTS idx_market_status ON player_market(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_channel_room ON chat_messages(channel, room_code, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_receiver ON chat_messages(receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_started ON matches(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON admin_logs(created_at DESC);

INSERT INTO global_game_state(id, paused, message)
VALUES (1, FALSE, '')
ON CONFLICT (id) DO NOTHING;

-- Compatibilidade com instalações antigas: migração de nomes usados em versões anteriores.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='bruto_coins') THEN
    EXECUTE 'UPDATE users SET coins = GREATEST(coins, bruto_coins) WHERE bruto_coins IS NOT NULL';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='xp') THEN
    EXECUTE 'UPDATE users SET level = GREATEST(1, FLOOR(xp / 250)::int + 1)';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Sistema persistente dos modos de jogo.
CREATE TABLE IF NOT EXISTS game_sessions (
  match_id UUID PRIMARY KEY,
  room_code VARCHAR(30) NOT NULL,
  mode VARCHAR(20) NOT NULL CHECK (mode IN ('uno','draw','truco','checkers','chess')),
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  state JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS game_moves (
  id BIGSERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES game_sessions(match_id) ON DELETE CASCADE,
  room_code VARCHAR(30) NOT NULL,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50) NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_game_sessions_room ON game_sessions(room_code, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_sessions_mode ON game_sessions(mode, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_moves_match ON game_moves(match_id, created_at DESC);


CREATE TABLE IF NOT EXISTS login_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE SET NULL,
  username VARCHAR(50) NOT NULL,
  ip VARCHAR(120) NOT NULL DEFAULT '',
  user_agent VARCHAR(500) NOT NULL DEFAULT '',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_login_logs_user ON login_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at DESC);
