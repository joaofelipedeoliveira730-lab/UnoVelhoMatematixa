-- Garante que a tabela de perfis/usuários possui as colunas essenciais
CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    password_hash VARCHAR(255) NOT NULL,
    is_admin BOOLEAN DEFAULT FALSE,
    bruto_coins INT DEFAULT 0,
    xp INT DEFAULT 0,
    skin_atual VARCHAR(255) DEFAULT 'default_skin.png',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de Salas de Jogo
CREATE TABLE IF NOT EXISTS rooms (
    id SERIAL PRIMARY KEY,
    code VARCHAR(10) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    map VARCHAR(100) NOT NULL,
    max_players INT DEFAULT 4,
    special_rules VARCHAR(100),
    public BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela da Loja para itens, skins e mapas de mesa
CREATE TABLE IF NOT EXISTS loja_itens (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    tipo VARCHAR(50) NOT NULL, -- 'skin', 'mapa', 'objeto'
    preco_brutocoins INT NOT NULL,
    req_xp INT DEFAULT 0,
    imagem_url VARCHAR(255)
);

-- Tabela de Inventário dos Jogadores
CREATE TABLE IF NOT EXISTS inventario (
    user_id INT REFERENCES profiles(id) ON DELETE CASCADE,
    item_id INT REFERENCES loja_itens(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, item_id)
);

-- Tabela de Mensagens de Chat (opcional / integrada ao sistema)
CREATE TABLE IF NOT EXISTS messages (
    id SERIAL PRIMARY KEY,
    room_code VARCHAR(10),
    sender VARCHAR(100),
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
