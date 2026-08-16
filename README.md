# UNO DOS IDOSOS — edição CHIBI 3D

Projeto web multiplayer de UNO com personagens chibi 3D desenhados em SVG/CSS, personalização, passe de nível, loja, inventário, chat, salas online e painel CEO.

## Destaques desta edição
- Personagens baixos, fofos e encorpados, com animação idle e reação ao toque.
- Personalização preservada: cabelo, roupa, calça, tênis, acessórios, efeitos e personagem.
- Carta descartada central maior para leitura rápida.
- Baralho de compra separado ao lado da carta da mesa.
- Mão do jogador otimizada para toque no celular.
- Arena responsiva: celular em tela cheia e desktop em paisagem.
- Pódio animado com 1º, 2º e 3º lugar.
- UNO como modo principal da interface; outras rotinas antigas do servidor continuam isoladas para compatibilidade.
- Sem desafio de matemática na experiência principal.
- Áudio procedural leve, sem biblioteca pesada de efeitos.

## Deploy
1. Suba os arquivos no GitHub.
2. No Render, mantenha `npm install` e `npm start`.
3. Configure `DATABASE_URL` e `JWT_SECRET`.
4. Rode a migração SQL antes do primeiro uso.

## Desempenho
O pacote não foi inflado artificialmente para atingir 5 MB. O objetivo é entregar mais qualidade visual sem obrigar o celular a baixar arquivos inúteis. Os personagens são vetoriais e as animações usam CSS/SVG, mantendo o download pequeno e o jogo mais liso.
