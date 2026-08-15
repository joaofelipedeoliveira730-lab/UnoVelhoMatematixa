BEGIN;

INSERT INTO maps (name, slug, description, config)
VALUES
('Taberna Medieval', 'taberna-medieval', 'Mesa de madeira, tochas e ambiente de taverna medieval.', '{"table":"wood","lighting":"torches","atmosphere":"tavern"}'),
('Salão Neon', 'salao-neon', 'Mesa futurista com luzes neon.', '{"table":"neon","lighting":"neon","atmosphere":"cyber"}'),
('Biblioteca Antiga', 'biblioteca-antiga', 'Biblioteca silenciosa com madeira escura e livros.', '{"table":"oak","lighting":"warm","atmosphere":"library"}'),
('Praia ao Entardecer', 'praia-entardecer', 'Mesa à beira-mar durante o pôr do sol.', '{"table":"sand","lighting":"sunset","atmosphere":"beach"}'),
('Floresta Mística', 'floresta-mistica', 'Floresta fantástica com luz suave.', '{"table":"moss","lighting":"moonlight","atmosphere":"forest"}'),
('Estação Espacial', 'estacao-espacial', 'Mesa futurista dentro de uma estação orbital.', '{"table":"metal","lighting":"cool","atmosphere":"space"}'),
('Castelo', 'castelo', 'Salão de pedra com decoração de castelo.', '{"table":"stone","lighting":"fire","atmosphere":"castle"}'),
('Deserto', 'deserto', 'Mesa em um acampamento no deserto.', '{"table":"sandstone","lighting":"sun","atmosphere":"desert"}'),
('Arcade', 'arcade', 'Sala de jogos colorida e retrô.', '{"table":"arcade","lighting":"pixels","atmosphere":"retro"}'),
('Templo', 'templo', 'Templo antigo com iluminação tranquila.', '{"table":"stone","lighting":"lanterns","atmosphere":"temple"}')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO configuracoes_jogo (key, value)
VALUES
('room_min_players', '2'),
('room_code_length', '4'),
('max_chat_length', '300'),
('initial_hand_size', '7'),
('default_max_players', '4')
ON CONFLICT (key) DO NOTHING;

COMMIT;
