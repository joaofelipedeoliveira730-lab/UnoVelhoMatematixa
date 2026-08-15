// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const app = express();
const server = http.createServer(app);

const JWT_SECRET = process.env.JWT_SECRET || 'matematixa_super_secret_key_2026';

// Configuração do Banco de Dados
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

app.use(express.json());
app.use(express.static(path.join(__dirname, './')));

// Inicialização e Seed do CEO
async function initDatabase() {
  try {
    const ceoCheck = await pool.query("SELECT * FROM users WHERE username = 'CeoVelho'");
    if (ceoCheck.rows.length === 0) {
      const ceoHash = await bcrypt.hash('Velho2026', 10);
      await pool.query(
        "INSERT INTO users (username, password_hash, role, coins) VALUES ($1, $2, $3, $4)",
        ['CeoVelho', ceoHash, 'CEO', 999999]
      );
      console.log(' Conta de CEO criada com sucesso!');
    }
  } catch (err) {
    console.error('Aviso ao verificar banco de dados:', err.message);
  }
}
initDatabase();

// --- ROTAS DE AUTENTICAÇÃO ---

// Registro de Usuários
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Usuário e senha são obrigatórios.' });
  }

  try {
    const userExists = await pool.query("SELECT id FROM users WHERE LOWER(username) = LOWER($1)", [username]);
    if (userExists.rows.length > 0) {
      return res.status(400).json({ success: false, message: 'Este nome de usuário já está em uso.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      "INSERT INTO users (username, password_hash, role) VALUES ($1, $2, 'user') RETURNING id, username, role, coins",
      [username, hashedPassword]
    );

    const token = jwt.sign({ id: newUser.rows[0].id, username: newUser.rows[0].username, role: 'user' }, JWT_SECRET, { expiresIn: '7d' });

    return res.json({ success: true, message: 'Conta criada com sucesso!', token, user: newUser.rows[0] });
  } catch (error) {
    console.error('Erro no registro:', error);
    return res.status(500).json({ success: false, message: 'Erro interno no servidor ao criar conta.' });
  }
});

// Login de Usuários e CEO
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Preencha usuário e senha.' });
  }

  try {
    const result = await pool.query("SELECT * FROM users WHERE LOWER(username) = LOWER($1)", [username]);
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
      message: user.role === 'CEO' ? 'Acesso concedido: Bem-vindo, CEO!' : 'Login realizado com sucesso!',
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        coins: user.coins
      }
    });
  } catch (error) {
    console.error('Erro no login:', error);
    return res.status(500).json({ success: false, message: 'Erro interno ao realizar login.' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
