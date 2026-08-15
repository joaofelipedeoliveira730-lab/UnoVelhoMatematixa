# UnoVelho

Jogo online UnoVelho com frontend responsivo, backend Node.js/Express, Socket.IO e PostgreSQL.

## Segurança

Segredos ficam somente nas variáveis de ambiente do Render. Nunca publique `.env`, `DATABASE_URL`, `JWT_SECRET` ou a senha inicial do administrador.

## Banco

O arquivo `schema.sql` contém a estrutura inicial compatível com o backend. Ele usa `CREATE TABLE IF NOT EXISTS` e índices não destrutivos.

## Execução local

1. Copie `.env.example` para `.env`.
2. Preencha `DATABASE_URL` e `JWT_SECRET`.
3. Instale as dependências com `npm install`.
4. Execute `npm run migrate` no ambiente que possui acesso ao PostgreSQL.
5. Opcionalmente execute `psql "$DATABASE_URL" -f seed.sql` para inserir os 10 mapas iniciais.
6. Inicie com `npm start`.

## Render

O serviço precisa das variáveis `DATABASE_URL` e `JWT_SECRET`. `FRONTEND_ORIGIN` pode ser definido com a origem pública do frontend; se o frontend for servido pelo próprio backend, pode ficar vazio.

## Arquivos removidos

`script.js` não faz parte da versão atual: ele era uma segunda implementação de servidor/socket e conflitava conceitualmente com `server.js`.
