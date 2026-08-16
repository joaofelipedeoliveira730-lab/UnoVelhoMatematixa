-- Seed idempotente: NÃO apaga usuários.
INSERT INTO achievements(id,name,description,icon,xp_reward,coin_reward) VALUES
('first_win','Primeira Vitória','Vença sua primeira partida.','🏆',100,100),
('math_10','Mente Matemática','Acerte 10 desafios matemáticos.','🧠',150,150),
('math_50','Calculista','Acerte 50 desafios matemáticos.','📐',500,500),
('uno_call','UNO!','Grite UNO na hora certa.','📣',80,80),
('online_first','Primeiro Online','Finalize uma partida online.','🌎',200,200),
('online_win','Campeão Online','Vença uma partida online.','👑',400,400),
('collector','Colecionador','Desbloqueie 10 itens.','🎒',350,350),
('level_10','Nível 10','Alcance o nível 10.','⭐',500,500),
('level_25','Nível 25','Alcance o nível 25.','💎',1000,1000),
('level_50','Nível 50','Alcance o nível 50.','🔥',2000,2000),
('market_first','Mercador','Faça sua primeira venda na loja de jogadores.','🛍️',250,250),
('survivor','Sobrevivente','Termine uma partida com 1 carta na mão.','🃏',250,250)
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, icon=EXCLUDED.icon, xp_reward=EXCLUDED.xp_reward, coin_reward=EXCLUDED.coin_reward;

-- 120 itens: catálogo leve, sem imagens pesadas; o frontend gera os visuais com CSS.
INSERT INTO items(id,name,category,description,price,xp_required,rarity,asset) VALUES
('map_saloon','Saloon Clássico','map','Arena inspirada na mesa da referência enviada.',0,0,'rare','{"theme":"saloon","image":"assets/maps/saloon.svg"}'),
('map_classroom','Sala de Aula','map','Mapa matemático clássico.',0,0,'common','{"theme":"classroom","image":"assets/maps/classroom.svg"}'),
('map_geometry','Laboratório Geométrico','map','Formas, neon e matemática.',900,250,'rare','{"theme":"geometry","image":"assets/maps/geometry.svg"}'),
('map_neon_city','Cidade Neon','map','Arena azul neon futurista.',1800,800,'epic','{"theme":"neon","image":"assets/maps/neon.svg"}'),
('map_forest','Floresta Matemática','map','Mesa em meio à floresta.',1500,600,'rare','{"theme":"forest","image":"assets/maps/forest.svg"}'),
('map_desert','Deserto Dourado','map','Arena quente e dourada.',2200,1200,'epic','{"theme":"desert","image":"assets/maps/desert.svg"}'),
('map_ice','Montanha Congelada','map','Mesa de gelo com brilho azul.',2600,1600,'epic','{"theme":"ice","image":"assets/maps/ice.svg"}'),
('map_space','Estação Espacial','map','Arena fora da Terra.',3200,2200,'legendary','{"theme":"space","image":"assets/maps/space.svg"}'),
('map_math_dimension','Dimensão Matemática','map','Portal matemático animado.',4000,3000,'legendary','{"theme":"math","image":"assets/maps/math.svg"}'),
('map_ceo','Dimensão CEO','map','Arena exclusiva do CEO.',0,0,'legendary','{"theme":"ceo","image":"assets/maps/ceo.svg","ceoOnly":true}'),
('deck_classic','Baralho Clássico','deck','Visual tradicional.',0,0,'common','{"theme":"classic"}'),
('deck_white','Baralho White Glass','deck','Cartas brancas com contorno luminoso.',700,200,'rare','{"theme":"white"}'),
('deck_cyber','Baralho Cyber Neon','deck','Cartas neon futuristas.',1600,700,'epic','{"theme":"cyber"}'),
('deck_gold','Baralho Ouro CEO','deck','Baralho dourado exclusivo.',0,0,'legendary','{"theme":"gold","ceoOnly":true}'),
('hair_basic','Cabelo Básico','hair','Visual inicial.',0,0,'common','{"style":"short","color":"black"}'),
('hair_curl','Cabelo Cacheado','hair','Cacheado volumoso.',350,0,'common','{"style":"curl","color":"brown"}'),
('hair_long','Cabelo Longo','hair','Cabelo longo.',450,0,'common','{"style":"long","color":"black"}'),
('hair_mohawk','Moicano Neon','hair','Moicano brilhante.',1200,500,'rare','{"style":"mohawk","color":"cyan"}'),
('hair_afro','Afro Dourado','hair','Afro estilizado.',1100,450,'rare','{"style":"afro","color":"gold"}'),
('hair_braids','Tranças Azure','hair','Tranças azuladas.',1400,700,'epic','{"style":"braids","color":"blue"}'),
('hair_ice','Cabelo Gelo','hair','Cabelo azul cristalino.',2100,1500,'epic','{"style":"long","color":"ice"}'),
('hair_ceo','Coroa Capilar CEO','hair','Visual exclusivo do CEO.',0,0,'legendary','{"style":"crown","color":"gold","ceoOnly":true}'),
('shirt_basic','Camiseta Azul','clothing','Roupa inicial.',0,0,'common','{"style":"shirt","color":"blue"}'),
('shirt_red','Camiseta Vermelha','clothing','Roupa vibrante.',300,0,'common','{"style":"shirt","color":"red"}'),
('shirt_neon','Jaqueta Neon','clothing','Jaqueta futurista.',1000,400,'rare','{"style":"jacket","color":"cyan"}'),
('shirt_gold','Jaqueta Ouro','clothing','Jaqueta dourada.',1700,900,'epic','{"style":"jacket","color":"gold"}'),
('shirt_space','Traje Espacial','clothing','Traje de astronauta.',2800,2000,'legendary','{"style":"space","color":"white"}'),
('pants_basic','Calça Azul','clothing','Calça inicial.',0,0,'common','{"style":"pants","color":"blue"}'),
('pants_black','Calça Preta','clothing','Calça clássica.',250,0,'common','{"style":"pants","color":"black"}'),
('pants_neon','Calça Neon','clothing','Calça futurista.',900,350,'rare','{"style":"pants","color":"cyan"}'),
('shoes_basic','Tênis Branco','shoes','Tênis inicial.',0,0,'common','{"style":"sneaker","color":"white"}'),
('shoes_red','Tênis Vermelho','shoes','Tênis vibrante.',300,0,'common','{"style":"sneaker","color":"red"}'),
('shoes_gold','Tênis Dourado','shoes','Tênis de colecionador.',1500,800,'epic','{"style":"sneaker","color":"gold"}'),
('glasses_basic','Óculos Redondos','accessory','Óculos clássicos.',300,0,'common','{"style":"round","color":"black"}'),
('glasses_cyan','Óculos Cyber','accessory','Óculos neon.',900,300,'rare','{"style":"cyber","color":"cyan"}'),
('glasses_gold','Óculos CEO','accessory','Óculos dourados.',0,0,'legendary','{"style":"gold","color":"gold","ceoOnly":true}'),
('hat_cap','Boné Azul','accessory','Boné simples.',250,0,'common','{"style":"cap","color":"blue"}'),
('hat_cowboy','Chapéu Cowboy','accessory','Chapéu de arena.',800,250,'rare','{"style":"cowboy","color":"brown"}'),
('hat_crown','Coroa Real','accessory','Coroa dourada.',2200,1500,'legendary','{"style":"crown","color":"gold"}'),
('mask_math','Máscara Matemática','accessory','Máscara com símbolos.',1000,500,'rare','{"style":"mask","color":"cyan"}'),
('backpack_blue','Mochila Azul','accessory','Mochila escolar.',450,100,'common','{"style":"backpack","color":"blue"}'),
('backpack_space','Mochila Espacial','accessory','Mochila futurista.',1700,1000,'epic','{"style":"backpack","color":"purple"}'),
('aura_blue','Aura Azul','effect','Aura neon.',1300,700,'rare','{"style":"aura","color":"cyan"}'),
('aura_gold','Aura Dourada','effect','Aura de ouro.',2500,1600,'epic','{"style":"aura","color":"gold"}'),
('aura_rainbow','Aura Arco-Íris','effect','Aura multicolorida.',3500,2500,'legendary','{"style":"aura","color":"rainbow"}'),
('emote_wave','Emote Aceno','emote','Aceno de entrada.',150,0,'common','{"style":"wave"}'),
('emote_math','Emote Matemático','emote','Comemoração matemática.',600,200,'rare','{"style":"math"}'),
('emote_fire','Emote Fogo','emote','Comemoração flamejante.',1400,800,'epic','{"style":"fire"}'),
('title_beginner','Título: Iniciante','title','Título inicial.',0,0,'common','{"text":"INICIANTE"}'),
('title_calculator','Título: Calculista','title','Título para quem domina contas.',900,600,'rare','{"text":"CALCULISTA"}'),
('title_master','Título: Mestre Matematixa','title','Título lendário.',3000,2500,'legendary','{"text":"MESTRE MATEMATIXA"}'),
('title_ceo','Título: CEO','title','Título exclusivo.',0,0,'legendary','{"text":"CEO","ceoOnly":true}'),
('table_blue','Mesa Blue Blur','table','Mesa azul glass.',800,300,'rare','{"theme":"blue"}'),
('table_red','Mesa Rubi','table','Mesa rubi.',1200,600,'rare','{"theme":"ruby"}'),
('table_gold','Mesa Ouro','table','Mesa dourada.',2500,1500,'epic','{"theme":"gold"}'),
('table_ceo','Mesa CEO','table','Mesa exclusiva.',0,0,'legendary','{"theme":"ceo","image":"assets/maps/ceo.svg","ceoOnly":true}')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, category=EXCLUDED.category, description=EXCLUDED.description, price=EXCLUDED.price, xp_required=EXCLUDED.xp_required, rarity=EXCLUDED.rarity, asset=EXCLUDED.asset;

-- Gera mais itens cosméticos até ultrapassar 100 itens sem imagens pesadas.
DO $$
DECLARE i INT;
BEGIN
  FOR i IN 1..75 LOOP
    INSERT INTO items(id,name,category,description,price,xp_required,rarity,asset)
    VALUES(
      'cosmetic_'||LPAD(i::text,3,'0'),
      CASE WHEN i % 5 = 0 THEN 'Skin Especial #'||i ELSE 'Acessório Matematixa #'||i END,
      CASE WHEN i % 5 = 0 THEN 'skin' ELSE 'accessory' END,
      'Item cosmético leve gerado pelo catálogo.',
      200 + i*90,
      CASE WHEN i < 10 THEN 0 ELSE i*75 END,
      CASE WHEN i % 10 = 0 THEN 'legendary' WHEN i % 5 = 0 THEN 'epic' WHEN i % 2 = 0 THEN 'rare' ELSE 'common' END,
      jsonb_build_object('style','generated','variant',i,'image','assets/cosmetics/cosmetic_'||LPAD(i::text,3,'0')||'.svg')
    ) ON CONFLICT (id) DO NOTHING;
  END LOOP;
END $$;

-- Itens iniciais são concedidos por login/registro pelo servidor.

-- Recompensas do Passe de Nível: itens leves, sem imagens pesadas.
INSERT INTO items(id,name,category,description,price,xp_required,rarity,asset) VALUES
('pass_hat_bronze','Boné Bronze do Passe','accessory','Recompensa do Passe de Nível.',0,0,'common','{"style":"pass_hat","color":"bronze","pass":true}'),
('pass_hat_silver','Boné Prata do Passe','accessory','Recompensa do Passe de Nível.',0,0,'rare','{"style":"pass_hat","color":"silver","pass":true}'),
('pass_hat_gold','Boné Ouro do Passe','accessory','Recompensa do Passe de Nível.',0,0,'epic','{"style":"pass_hat","color":"gold","pass":true}'),
('pass_hat_rainbow','Boné Arco-Íris do Passe','accessory','Recompensa do Passe de Nível 100.',0,0,'legendary','{"style":"pass_hat","color":"rainbow","pass":true}'),
('pass_title_veteran','Título: Veterano do Bar','title','Recompensa do Passe.',0,0,'rare','{"text":"VETERANO DO BAR","pass":true}'),
('pass_title_bebado','Título: Bebum Profissional','title','Recompensa do Passe.',0,0,'epic','{"text":"BEBUM PROFISSIONAL","pass":true}'),
('pass_title_lenda','Título: Lenda da Mesa','title','Recompensa do Passe 100.',0,0,'legendary','{"text":"LENDA DA MESA","pass":true}')
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,rarity=EXCLUDED.rarity,asset=EXCLUDED.asset;
