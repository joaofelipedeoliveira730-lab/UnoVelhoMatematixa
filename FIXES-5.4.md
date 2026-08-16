# Uno Velho Matematixa — 5.4 HARDENED

## Principais correções
- Turno automático protegido por limite de 10 segundos.
- 3 turnos consecutivos sem ação causam saída automática por AFK.
- A compra normal tira apenas 1 carta e passa a vez; cartas de penalidade continuam respeitando a regra especial.
- IA automática mais rápida, com tempo de decisão curto e limite absoluto abaixo de 10s.
- Dificuldade da partida clássica é calculada pelo XP do jogador: XP baixo = fácil, XP intermediário = médio, XP alto = difícil.
- Treinamento separado com escolha manual de dificuldade.
- Chat isolado dos controles da partida para impedir que interação com o chat navegue/abandone a mesa.
- Handlers de Socket.IO que estavam ausentes foram restaurados para evitar falha silenciosa do multiplayer.
- Centro da mesa reposicionado e cartas centrais configuradas em orientação horizontal com perspectiva 3D.
- Tela de carregamento com universo visual animado usando os próprios mapas/assets do jogo.
- Cache/versionamento atualizado para 5.4.0.
