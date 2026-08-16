# UNO Velho Matematixa — Reforma 6.0 / Mesa Viva

## Objetivo
Reforma visual e de experiência sobre a base existente, preservando os contratos de API e a integração PostgreSQL.

## O que mudou
- Nova direção visual: madeira, papel, feltro, vermelho, verde e tons quentes.
- Lobby, login, seleção de plataforma, navegação e painéis receberam uma linguagem visual unificada.
- Mesa de partida ganhou acabamento de bar artesanal, profundidade, sombras e estados mais claros.
- Cartas ganharam aparência de cartas físicas, hover/seleção e leitura mais limpa.
- Personagens receberam microanimações e acabamento visual adicional sem substituir o sistema de avatar existente.
- Responsividade revisada para desktop, tablet e celular.
- Sons ambientais procedurais leves por tema de mapa quando a música estiver habilitada; não substituem a música existente.
- Versão visual marcada como 6.0 / Mesa Viva.

## Banco de dados
`server.js`, `schema.sql`, `seed.sql`, `diagnostico.sql`, `migrate.js` e os contratos de conexão não foram alterados nesta reforma visual.

## Testes executados
- `node --check app.js` — OK
- `node --check server.js` — OK
- Estrutura do ZIP extraída e conferida — OK
- Dependências npm não estavam instaladas no pacote recebido; portanto não foi declarado teste real de multiplayer/PostgreSQL de ponta a ponta.

## Limitação importante
Uma validação 100% de multiplayer exige iniciar o servidor com as dependências instaladas e conectar múltiplos clientes a uma instância PostgreSQL funcional. Não foi inventado um resultado para essa etapa.
