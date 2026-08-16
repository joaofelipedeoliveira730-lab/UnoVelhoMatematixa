# QA e Polimento — Uno Velho Matematixa

## Revisão executada
- Corrigido erro crítico no estado multiplayer de UNO que podia interromper a renderização da partida.
- Corrigidas regras de empilhamento de cartas de compra no servidor e no cliente.
- Corrigida validação de +4 para respeitar a cor atual.
- Evitada inicialização duplicada de partida por cliques repetidos.
- Melhorada a troca de turno para ignorar participantes desconectados sem entrar em loop.
- Partida online agora encerra de forma limpa quando ficam jogadores insuficientes.
- Refeito o fechamento de recompensa da partida com transação PostgreSQL real usando o mesmo client.
- Adicionado tratamento visual quando o servidor encerra uma partida por falta de jogadores.
- Adicionado polimento de interação: foco de teclado, estados de botão, hover, cartas com feedback de seleção, destaque do jogador da vez e suporte a redução de movimento.

## Banco de dados
A conexão PostgreSQL existente foi preservada. Não foi trocado o mecanismo de banco nem removida a estrutura SQL existente.

## Validação
- `node --check server.js` — OK
- `node --check app.js` — OK
- `node --check config.js` — OK
- Testes isolados das regras de UNO — OK
- Instalação das dependências não foi possível neste ambiente porque os pacotes npm não estavam disponíveis em cache e o acesso ao registry expirou. Portanto, não seria correto declarar um teste de multiplayer real como executado.

## Observação
O visual foi refinado sobre a identidade já existente do projeto, mantendo a mesa, personagens, mapas e identidade do Uno Velho Matematixa em vez de substituir o projeto por um template genérico.
