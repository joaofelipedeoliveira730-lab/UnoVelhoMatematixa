// server.js - Versão com criação automática de tabelas e diagnostico de erros
require('dotenv').config(); // Carrega variáveis do arquivo .env se existir
const express = require('express');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'matematixa_super_secret_key_2026';

// Conexão com o PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/unovelho',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

// Inicialização Automática do Banco de Dados
async function initDatabase() {
  try {
    // 1. Cria a tabela de usuários se não existir
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

    // 2. Garante a criação da conta CEO (CeoVelho / Velho2026)
    const ceoCheck = await pool.query("SELECT * FROM users WHERE username = 'CeoVelho'");
    if (ceoCheck.rows.length === 0) {
      const ceoHash = await bcrypt.hash('Velho2026', 10);
      await pool.query(
        "INSERT INTO users (username, password_hash, role, coins) VALUES ($1, $2, $3, $4)",
        ['CeoVelho', ceoHash, 'CEO', 999999]
      );
      console.log('✅ Tabela verificada e Conta de CEO configurada com sucesso!');
    } else {
      console.log('✅ Banco de dados conectado e pronto.');
    }
  } catch (err) {
    console.error('⚠️ Erro ao conectar/inicializar banco de dados:', err.message);
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

// ROTA DE REGISTRO
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
  }

  try {
    // Verifica se usuário já existe
    const userExists = await pool.query("SELECT id FROM users WHERE LOWER(username) = LOWER($1)", [username.trim()]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Este nome de usuário já está em uso.' });
    }

    // Criptografa a senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insere no banco
    const newUser = await pool.query(
      "INSERT INTO users (username, password_hash, role, coins) VALUES ($1, $2, 'user', 500) RETURNING id, username, role, coins",
      [username.trim(), hashedPassword]
    );

    const user = newUser.rows[0];
    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({ success: true, message: 'Conta criada com sucesso!', token, user });
  } catch (error) {
    console.error('Erro detalhado no registro:', error);
    return res.status(500).json({ 
      success: false, 
      message: `Erro no banco de dados: ${error.message || 'Falha ao criar conta'}` 
    });
  }
});

// ROTA DE LOGIN
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Preencha usuário e senha.' });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [username.trim().toLowerCase()]);
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Usuário ou senha inválidos.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({
      success: true,
      message: user.role === 'CEO' ? 'Bem-vindo, CEO!' : 'Login realizado com sucesso!',
      token,
      user: { id: user.id, username: user.username, role: user.role, coins: user.coins }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ success: false, message: `Erro ao logar: ${error.message}` });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
  await initDatabase();
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
