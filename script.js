require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '/')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Estado global em memória para otimizar o beta (Salas, Jogo Congelado, Chats)
let gameState = {
  isFrozen: false,
  freezeMessage: '',
  chatGlobalOn: true,
  chatPrivateOn: true,
  rooms: {}
};

// Inicialização segura da conta ADM principal (Velho)
async function initAdmin() {
  try {
    const res = await pool.query("SELECT * FROM users WHERE username = 'Velho'");
    if (res.rows.length === 0) {
      const hash = await bcrypt.hash('AdministradorVelho', 10);
      await pool.query(
        "INSERT INTO users (username, password_hash, role, coins) VALUES ($1, $2, $3, $4)",
        ['Velho', hash, 'admin', 999999]
      );
      console.log('Conta Administrador Velho criada com segurança.');
    }
  } catch (err) {
    console.error('Erro ao inicializar ADM:', err);
  }
}
initAdmin();

// Gerenciamento de Conexões e Comandos via Socket.io
io.on('connection', (socket) => {
  console.log('Usuário conectado:', socket.id);

  // Envia o estado atual do jogo para quem acabou de entrar
  socket.emit('gameStatus', gameState);

  // Sistema de Login / Identificação
  socket.on('loginUser', async (data) => {
    try {
      const { username, password } = data;
      const userRes = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
      
      if (userRes.rows.length === 0) {
        return socket.emit('loginError', 'Usuário não encontrado.');
      }

      const user = userRes.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);

      if (!match) {
        return socket.emit('loginError', 'Senha incorreta.');
      }

      const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, process.env.JWT_SECRET || 'secretkey');
      socket.user = { id: user.id, username: user.username, role: user.role };
      
      socket.emit('loginSuccess', { token, user: socket.user });
    } catch (e) {
      socket.emit('loginError', 'Erro interno no login.');
    }
  });

  // Chat Global e Comandos Administrativos
  socket.on('chatMessage', async (data) => {
    const { message } = data;

    // Verificar se o jogo está congelado para mensagens comuns
    if (gameState.isFrozen && socket.user?.role !== 'admin' && socket.user?.role !== 'staff') {
      return socket.emit('systemMessage', 'O jogo está congelado pelo Administrador.');
    }

    // Processamento de Comandos de ADM e Staff
    if (message.startsWith('/') && socket.user && (socket.user.role === 'admin' || socket.user.role === 'staff')) {
      const args = message.split(' ');
      const cmd = args[0].toLowerCase();

      if (cmd === '/chatglobal' && socket.user.role === 'admin') {
        gameState.chatGlobalOn = (args[1] === 'on');
        io.emit('gameStatus', gameState);
        return io.emit('systemMessage', `Chat global foi ligado/desligado: ${args[1]}`);
      }

      if (cmd === '/congelar') {
        gameState.isFrozen = true;
        gameState.freezeMessage = message.replace('/congelar msg: ', '') || 'Jogo Congelado!';
        io.emit('gameStatus', gameState);
        return;
      }

      if (cmd === '/descongelar') {
        gameState.isFrozen = false;
        gameState.freezeMessage = '';
        io.emit('gameStatus', gameState);
        return;
      }

      if (cmd === '/all') {
        const socketsOnline = Array.from(io.sockets.sockets.values()).map((s, idx) => `[ID 00${idx + 1}] ${s.user?.username || 'Convidado'}`);
        return socket.emit('systemMessage', `Jogadores online:\n` + socketsOnline.join('\n'));
      }
    }

    // Envio normal de chat global se permitido
    if (!gameState.chatGlobalOn && socket.user?.role === 'player') {
      return socket.emit('systemMessage', 'O chat global está desativado no momento.');
    }

    io.emit('chatMessage', { user: socket.user?.username || 'Visitante', message });
  });

  socket.on('disconnect', () => {
    console.log('Usuário desconectado:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor UnoVelho rodando na porta ${PORT}`);
});
