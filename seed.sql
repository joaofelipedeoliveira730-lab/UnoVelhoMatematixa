-- Limpa os usuários antigos (Cuidado, isso zera as contas!)
DELETE FROM users;

-- SEU LOGIN DE CEO (Com dinheiro infinito e XP no máximo)
INSERT INTO users (username, password, bruto_coins, xp, skin_atual) 
VALUES ('Ceoooo', 'sen', 999999, 5000, 'ceo_skin.png'); 
-- Dica: Troque 'senha123' pela senha criptografada que seu app.js usa!

-- Criando os Mapas (Mesas) e Skins na Loja
INSERT INTO loja_itens (nome, tipo, preco_brutocoins, req_xp, imagem_url) VALUES 
('Mesa de Madeira Rústica', 'mapa', 0, 0, 'mesa_rustica.png'),
('Mesa de Cassino', 'mapa', 500, 100, 'mesa_cassino.png'),
('Mesa de Bar Velho', 'mapa', 1500, 500, 'mesa_bar.png'),
('Revólver de Mesa (Enfeite)', 'objeto', 3000, 1000, 'revolver.png'),
('Skin: Porco Açougueiro', 'skin', 5000, 2000, 'porco.png');
-- Limpa os usuários antigos (Zera as contas do beta)
DELETE FROM users;

-- SEU LOGIN DE CEO (Com dinheiro infinito, XP no máximo e skin exclusiva)
-- A senha 'senha123' está criptografada em bcrypt padrão ($2b$10$...)
INSERT INTO users (username, password, bruto_coins, xp, skin_atual) 
VALUES (
    'Ceoooo', 
    '$2b$10$YourBcryptHashPlaceholderGoesHere1234567890123456789012', 
    999999, 
    5000, 
    'ceo_skin.png'
); 

-- Limpa a loja para evitar duplicatas ao rodar novamente
DELETE FROM loja_itens;

-- Criando os Mapas (Mesas), Objetos e Skins na Loja do UnoVelho
INSERT INTO loja_itens (nome, tipo, preco_brutocoins, req_xp, imagem_url) VALUES 
('Mesa de Madeira Rústica', 'mapa', 0, 0, 'mesa_rustica.png'),
('Mesa de Cassino', 'mapa', 500, 100, 'mesa_cassino.png'),
('Mesa de Bar Velho', 'mapa', 1500, 500, 'mesa_bar.png'),
('Revólver de Mesa (Enfeite)', 'objeto', 3000, 1000, 'revolver.png'),
('Fichas de Poker (Enfeite)', 'objeto', 1200, 300, 'fichas.png'),
('Skin: Porco Açougueiro', 'skin', 5000, 2000, 'porco.png'),
('Skin: Raposa do Cassino', 'skin', 7500, 3500, 'raposa.png');

