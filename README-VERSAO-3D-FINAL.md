# UNO DOS IDOSOS — versão 3D + pódio + cache visual

Base desta entrega: versão `PERSONAGENS-3D-PODIO`, preservando o backend PostgreSQL/Socket.IO e o frontend existente.

## O que está incluído
- Personagem em código/CSS, com categorias de cabelo, roupa, calça, tênis, acessórios, efeitos e títulos.
- Tela de Personagens separada para desbloqueados/bloqueados.
- Partida UNO em mesa, com jogadores, TAG do jogador e mão de cartas.
- Pódio de final de partida com 1º/2º/3º e animação de comemoração.
- Solo e Online mantidos como UNO; matemática não participa da partida.
- Passe de nível 1–100.
- Painel CEO separado para `CeoVelho`.
- Plataforma celular/PC antes do login.
- Layout responsivo e orientação da partida.
- Efeitos sonoros via Web Audio e animações leves.
- Chat global/da sala.
- Cache visual opcional de 5 MB em `assets/cache/visual-cache-5MB.bin`; não é carregado automaticamente para não deixar o jogo pesado no início.

## Teste técnico feito nesta entrega
- `node --check app.js`
- `node --check server.js`
- `node --check migrate.js`

Os três passaram sem erro de sintaxe.

## Deploy
Substitua os arquivos do projeto no GitHub/Render pelo conteúdo desta pasta e mantenha as variáveis do banco. Não apague o PostgreSQL existente.
