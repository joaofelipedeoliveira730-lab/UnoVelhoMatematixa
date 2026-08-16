# UnoVelho — Render / Etapa 1

## Environment Variables

No Web Service do Render, mantenha/adicionar:

- `DATABASE_URL` — fornecida pelo PostgreSQL do Render. Não publicar.
- `JWT_SECRET` — segredo aleatório com pelo menos 32 caracteres. Não publicar.
- `FRONTEND_ORIGIN` — deixe vazio se o frontend for servido pelo mesmo Web Service; caso use outro domínio, informe a origem completa.
- `ADMIN_INITIAL_USERNAME` — `Velho`.
- `ADMIN_INITIAL_PASSWORD` — a senha inicial do ADM, somente como variável secreta do Render.

## Ordem segura

1. Não apague nem recrie o banco.
2. Faça um backup do PostgreSQL antes de qualquer alteração estrutural.
3. Verifique as tabelas atuais com `diagnostico.sql`.
4. Se o banco estiver vazio ou compatível, execute `npm run migrate`.
5. Depois, opcionalmente execute `seed.sql` para cadastrar os 10 mapas iniciais.
6. Faça um novo deploy do Web Service.
7. Teste `/health`, cadastro e login antes de testar comandos administrativos.

## Importante

A Etapa 1 não contém `DROP TABLE`, `TRUNCATE`, exclusão de jogadores ou reset de pontuação.

O bootstrap do ADM só cria a conta se o usuário ainda não existir. Se `Velho` já existir, o backend não substitui a senha existente; apenas garante `is_admin = TRUE`.

## Modos persistentes
A versão atual inclui `game_sessions` e `game_moves` para registrar o estado e o histórico das partidas de UNO, Gartic, Truco, Damas e Xadrez. O estado de uma partida ativa continua em memória para baixa latência e cada ação relevante é persistida no PostgreSQL.
