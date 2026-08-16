# UnoVelho — versão completa

Projeto full-stack de um jogo de cartas estilo UNO com:

- Node.js + Express
- Socket.IO para partidas em tempo real
- PostgreSQL
- JWT + bcryptjs
- Loja de itens cosméticos usando BrutoCoins virtuais
- Mapas de mesa selecionáveis
- Salas públicas/privadas
- Ranking, XP, vitórias e pontos
- Recompensa diária
- Perfil e coleção de skins
- Painel administrativo
- Chat de sala e chat global
- Responsividade para celular e computador
- Persistência do estado da partida no PostgreSQL

## 1. Instalação

```bash
npm install
```

Copie `.env.example` para `.env` e preencha:

```env
PORT=3000
DATABASE_URL=sua_url_do_postgresql
JWT_SECRET=uma_chave_com_mais_de_32_caracteres
FRONTEND_ORIGIN=
ADMIN_INITIAL_USERNAME=Velho
ADMIN_INITIAL_PASSWORD=uma_senha_forte
NODE_ENV=production
```

## 2. Banco

```bash
npm run migrate
```

O `schema.sql` cria as tabelas e insere os itens iniciais da loja.

## 3. Rodar

```bash
npm start
```

Depois abra a URL do serviço.

## Render

Use um serviço Web Service com:

- Build Command: `npm install`
- Start Command: `npm start`

Configure `DATABASE_URL`, `JWT_SECRET`, `ADMIN_INITIAL_USERNAME` e `ADMIN_INITIAL_PASSWORD` como variáveis secretas do Render.

## Estrutura

```text
unovelho_complete/
├── app.js
├── config.js
├── index.html
├── migrate.js
├── package.json
├── schema.sql
├── server.js
├── style.css
└── .env.example
```

## Observação de segurança

BrutoCoins são somente moeda virtual interna para itens cosméticos. O projeto não implementa apostas, dinheiro real ou mecânicas de jogo de azar.

As mesas são apenas temas visuais para o jogo de cartas.

## Atualização UNO — Passe, chat e personagens

- Jogo focado em UNO, com Solo/Online.
- Dificuldade Solo: Fácil, Médio e Difícil.
- Personagens desenhados em SVG/CSS/JS, sem fotos de personagens.
- Roupa, pele, cabelo, calçado e acessórios alteram o personagem em tempo real.
- Chat global compacto, com histórico dos últimos 50 registros.
- Passe de Nível do 1 ao 100, com curva de XP progressiva.
- Recompensas de moedas, títulos e acessórios.
- Botão "COLETAR TUDO" para recompensas desbloqueadas.
- Nova tabela PostgreSQL: `user_pass_claims`.

Depois de atualizar o projeto no Render, rode `npm run migrate` uma vez para aplicar o `schema.sql` e `seed.sql` atualizados.
