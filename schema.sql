-- Garante que a tabela de perfis/usuários possui as colunas essenciais
-- Garante a compatibilidade com a tabela 'users' se o server.js procurar por ela
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    password VARCHAR(255),
    password_hash VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    bruto_coins INT DEFAULT 0,
    xp INT DEFAULT 0,
    skin_atual VARCHAR(255) DEFAULT 'default_skin.png',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Caso a tabela se chame 'profiles' em alguma parte do código
CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(100),
    password_hash VARCHAR(255),
    is_admin BOOLEAN DEFAULT FALSE,
    bruto_coins INT DEFAULT 0,
    xp INT DEFAULT 0,
    skin_atual VARCHAR(255) DEFAULT 'default_skin.png',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Adiciona colunas de segurança e economia caso as tabelas já existam sem elas
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bruto_coins INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS skin_atual VARCHAR(255) DEFAULT 'default_skin.png';

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bruto_coins INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS xp INT DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS skin_atual VARCHAR(255) DEFAULT 'default_skin.png';

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
    tipo VARCHAR(50) NOT NULL,
    preco_brutocoins INT NOT NULL,
    req_xp INT DEFAULT 0,
    imagem_url VARCHAR(255)
);

-- Tabela de Inventário dos Jogadores
CREATE TABLE IF NOT EXISTS inventario (
    user_id INT,
    item_id INT,
    PRIMARY KEY (user_id, item_id)
);






