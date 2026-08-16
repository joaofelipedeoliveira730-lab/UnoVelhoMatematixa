# UNO DOS IDOSOS — correção de inicialização

## Correções desta versão
- Login aparece imediatamente; a inicialização não espera cache, Service Worker, Socket.IO ou PostgreSQL.
- Removido o `await` do limpador de cache que podia deixar a abertura parada.
- Service Worker não cacheia mais o shell do jogo.
- `get`, `post`, `put` e `del` possuem timeout.
- Lobby abre antes de carregar loja/inventário/ranking.
- `CeoVelho` continua sendo a conta exclusiva do CEO.
- O servidor não bloqueia a inicialização só porque `CEO_INITIAL_PASSWORD` não está configurado quando CeoVelho já existe.
- Login retorna erro rápido se o PostgreSQL ainda estiver acordando.

## Deploy
Substitua os arquivos do projeto pelo conteúdo desta pasta e faça um novo deploy no Render.
Não recrie o banco.
