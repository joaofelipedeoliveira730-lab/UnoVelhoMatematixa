// server.js - Correção para adicionar colunas faltantes no PostgreSQL
require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'matematixa_super_secret_key_2026';
const JSON_DB_FILE = path.join(__dirname, 'database.json');

let usePostgres = false;
let pool = null;

function getLocalDB() {
  if (!fs.existsSync(JSON_DB_FILE)) {
    const ceoHash = bcrypt.hashSync('Velho2026', 10);
    const initialData = {
      users: [{ id: 1, username: 'CeoVelho', password_hash: ceoHash, role: 'CEO', coins: 999999, created_at: new Date().toISOString() }]
    };
    fs.writeFileSync(JSON_DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  return JSON.parse(fs.readFileSync(JSON_DB_FILE, 'utf8'));
}

function saveLocalDB(data) {
  fs.writeFileSync(JSON_DB_FILE, JSON.stringify(data, null, 2));
}

async function initDatabase() {
  if (process.env.DATABASE_URL) {
    try {
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
      });

      // 1. Garante que a tabela existe
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) DEFAULT 'user',
          coins INT DEFAULT 500,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // 2. CORREÇÃO: Força a adição das colunas role e coins caso a tabela seja antiga
      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS coins INT DEFAULT 500;
      `);

      usePostgres = true;
      console.log('✅ Conectado ao PostgreSQL e estrutura de tabelas atualizada!');

      // 3. Garante a conta especial do CEO
      const ceoCheck = await pool.query("SELECT * FROM users WHERE LOWER(username) = 'ceovelho'");
      if (ceoCheck.rows.length === 0) {
        const ceoHash = await bcrypt.hash('Velho2026', 10);
        await pool.query(
          "INSERT INTO users (username, password_hash, role, coins) VALUES ($1, $2, $3, $4)",
          ['CeoVelho', ceoHash, 'CEO', 999999]
        );
        console.log('👑 Conta CEO (CeoVelho) registrada no banco.');
      }
      return;
    } catch (err) {
      console.warn('⚠️ Erro no PostgreSQL, usando banco local JSON:', err.message);
    }
  }

  usePostgres = false;
  getLocalDB();
  console.log('✅ Usando Banco Local (database.json).');
}

app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });

  const cleanUsername = username.trim();
  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    if (usePostgres) {
      const userExists = await pool.query("SELECT id FROM users WHERE LOWER(username) = LOWER($1)", [cleanUsername]);
      if (userExists.rows.length > 0) return res.status(400).json({ success: false, message: 'Usuário já existe.' });

      const newUser = await pool.query(
        "INSERT INTO users (username, password_hash, role, coins) VALUES ($1, $2, 'user', 500) RETURNING id, username, role, coins",
        [cleanUsername, hashedPassword]
      );
      const user = newUser.rows[0];
      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, message: 'Conta criada!', token, user });
    } else {
      const db = getLocalDB();
      if (db.users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
        return res.status(400).json({ success: false, message: 'Usuário já existe.' });
      }
      const newUser = { id: db.users.length + 1, username: cleanUsername, password_hash: hashedPassword, role: 'user', coins: 500, created_at: new Date().toISOString() };
      db.users.push(newUser);
      saveLocalDB(db);
      const token = jwt.sign({ id: newUser.id, username: newUser.username, role: newUser.role }, JWT_SECRET, { expiresIn: '7d' });
      return res.json({ success: true, message: 'Conta criada!', token, user: { id: newUser.id, username: newUser.username, role: newUser.role, coins: newUser.coins } });
    }
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro no servidor.' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ success: false, message: 'Informe usuário e senha.' });

  const cleanUsername = username.trim();
  try {
    let user = null;
    if (usePostgres) {
      const result = await pool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [cleanUsername.toLowerCase()]);
      if (result.rows.length > 0) user = result.rows[0];
    } else {
      const db = getLocalDB();
      user = db.users.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
    }

    if (!user) return res.status(401).json({ success: false, message: 'Usuário ou senha incorretos.' });

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return res.status(401).json({ success: false, message: 'Usuário ou senha incorretos.' });

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      success: true,
      message: user.role === 'CEO' ? 'Bem-vindo de volta, CEO!' : 'Login realizado com sucesso!',
      token,
      user: { id: user.id, username: user.username, role: user.role, coins: user.coins }
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Erro no login.' });
  }
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, async () => {
  await initDatabase();
  console.log(`🚀 Servidor ativo na porta ${PORT}`);
});
