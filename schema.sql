-- schema.sql
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'user',
    coins INT DEFAULT 500,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS characters (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    perk VARCHAR(255) NOT NULL,
    price INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS skins (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    theme_class VARCHAR(50) NOT NULL,
    price INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maps (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    bg_class VARCHAR(50) NOT NULL,
    price INT DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_inventory (
    id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(id) ON DELETE CASCADE,
    item_type VARCHAR(20) NOT NULL, -- 'character', 'skin', 'map'
    item_id VARCHAR(50) NOT NULL,
    UNIQUE(user_id, item_type, item_id)
);
