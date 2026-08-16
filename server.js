require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const { Pool } = require('pg');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: true, credentials: true } });
const PORT = Number(process.env.PORT || 10000);
const JWT_SECRET = process.env.JWT_SECRET;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '';
const isProduction = process.env.NODE_ENV === 'production';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

if (!JWT_SECRET) console.warn('⚠️ JWT_SECRET não definido. Defina-o no Render antes de usar em produção.');
const jwtSecret = JWT_SECRET || (process.env.DATABASE_URL ? crypto.createHash('sha256').update(process.env.DATABASE_URL).digest('hex') : crypto.createHash('sha256').update('unovelho-local-development-secret').digest('hex'));

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '300kb' }));
// Evita que navegadores/CDNs sirvam HTML, JS e CSS antigos depois de uma atualização.
app.use((req,res,next)=>{ if(req.path==='/' || /\.(html|js|css)$/.test(req.path)){res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');res.setHeader('Pragma','no-cache');res.setHeader('Expires','0');} next(); });
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use((req,res,next)=>{
  if(req.path==='/'||req.path.endsWith('.html')||req.path.endsWith('.js')||req.path.endsWith('.css')){
    res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma','no-cache');
    res.setHeader('Expires','0');
  }
  next();
});
app.use(express.static(path.join(__dirname)));

let pool = null;
let usePostgres = false;
let databaseReady = false;
let databaseReadyError = null;
let databaseReadyPromise = null;
const rooms = new Map();
const socketUsers = new Map();
const loginAttempts = new Map();
const chatRate = new Map();
const localDbPath = path.join(__dirname, 'database.json');

function localDb() {
  if (!fs.existsSync(localDbPath)) {
    const db = { users: [], profiles: {}, inventory: {}, market: [], actions: [], messages: [] };
    fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2));
    return db;
  }
  try { return JSON.parse(fs.readFileSync(localDbPath, 'utf8')); }
  catch { return { users: [], profiles: {}, inventory: {}, market: [], actions: [], messages: [] }; }
}
function saveLocalDb(db) { fs.writeFileSync(localDbPath, JSON.stringify(db, null, 2)); }

async function initDatabase() {
  if (!process.env.DATABASE_URL) {
    console.warn('⚠️ DATABASE_URL ausente. O servidor usará armazenamento local apenas para desenvolvimento.');
    usePostgres = false;
    localDb();
    return;
  }
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 8,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    statement_timeout: 15000,
    query_timeout: 20000
  });
  pool.on('error', err => console.error('❌ PostgreSQL pool:', err.message));
  try {
    await pool.query('SELECT 1');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    const seedPath = path.join(__dirname, 'seed.sql');
    if (fs.existsSync(seedPath)) {
      const seed = fs.readFileSync(seedPath, 'utf8');
      if (seed.trim()) await pool.query(seed);
    }
    await repairLegacySchema();
    await ensureDefaultItems();
    usePostgres = true;
    await ensureCeo();
    console.log('✅ PostgreSQL conectado e schema aplicado.');
  } catch (err) {
    console.error('❌ PostgreSQL/schema indisponível:', err.message);
    try { await pool.end(); } catch {}
    pool = null;
    usePostgres = false;
    if (isProduction || process.env.DATABASE_URL) throw err;
    localDb();
  }
}



async function ensureDefaultItems() {
  if (!pool) return;
  const items = [
    ['hair_basic','Cabelo Básico','hair','Visual padrão','0','0','common','hair_basic',false],
    ['hair_curl','Cabelo Cacheado','hair','Cachos marcantes','900','0','common','hair_curl',false],
    ['hair_long','Cabelo Longo','hair','Estilo longo','1200','0','common','hair_long',false],
    ['hair_mohawk','Moicano','hair','Visual radical','1800','0','rare','hair_mohawk',false],
    ['hair_afro','Afro','hair','Volume e estilo','1500','0','rare','hair_afro',false],
    ['hair_braids','Tranças','hair','Tranças modernas','2200','0','rare','hair_braids',false],
    ['hair_ice','Cabelo Gelo','hair','Visual congelante','3500','0','epic','hair_ice',false],
    ['hair_ceo','Cabelo CEO','hair','Visual exclusivo do CEO','0','0','legendary','hair_ceo',true],
    ['shirt_basic','Camiseta Azul','top','Roupa inicial','0','0','common','shirt_basic',false],
    ['shirt_red','Camiseta Vermelha','top','Clássica e vibrante','700','0','common','shirt_red',false],
    ['shirt_neon','Camiseta Neon','top','Brilha na noite','1600','0','rare','shirt_neon',false],
    ['shirt_gold','Jaqueta Dourada','top','Estilo de campeão','3000','0','epic','shirt_gold',false],
    ['shirt_space','Jaqueta Espacial','top','Explorador das estrelas','4200','0','epic','shirt_space',false],
    ['pants_basic','Calça Azul','oponentetom','Roupa inicial','0','0','common','pants_basic',false],
    ['pants_black','Calça Preta','oponentetom','Combina com tudo','600','0','common','pants_black',false],
    ['pants_neon','Calça Neon','oponentetom','Estilo futurista','1500','0','rare','pants_neon',false],
    ['shoes_basic','Tênis Básico','shoes','Tênis inicial','0','0','common','shoes_basic',false],
    ['shoes_red','Tênis Vermelho','shoes','Tênis veloz','900','0','common','shoes_red',false],
    ['shoes_gold','Tênis Dourado','shoes','Pisando como campeão','2800','0','epic','shoes_gold',false],
    ['glasses_basic','Óculos','accessory','Óculos clássico','500','0','common','glasses_basic',false],
    ['glasses_cyan','Óculos Neon','accessory','Lentes brilhantes','1400','0','rare','glasses_cyan',false],
    ['glasses_gold','Óculos Dourado','accessory','Brilho de campeão','2600','0','epic','glasses_gold',false],
    ['hat_cap','Boné','accessory','Boné casual','800','0','common','hat_cap',false],
    ['hat_cowboy','Chapéu Cowboy','accessory','Para mapas de saloon','1700','0','rare','hat_cowboy',false],
    ['hat_crown','Coroa','accessory','Item exclusivo do CEO','0','0','legendary','hat_crown',true],
    ['mask_math','Máscara Matematixa','accessory','Máscara temática','2400','0','epic','mask_math',false],
    ['backpack_blue','Mochila Azul','accessory','Mochila de aventura','1300','0','rare','backpack_blue',false],
    ['backpack_space','Mochila Espacial','accessory','Mochila futurista','3200','0','epic','backpack_space',false],
    ['aura_blue','Aura Azul','effect','Brilho azul ao redor do personagem','1900','0','rare','aura_blue',false],
    ['aura_gold','Aura Dourada','effect','Aura de campeão','3500','0','epic','aura_gold',false],
    ['aura_rainbow','Aura Arco-íris','effect','Aura colorida','5000','0','legendary','aura_rainbow',false],
    ['emote_wave','Emote Oi','emote','Acene para a mesa','300','0','common','emote_wave',false],
    ['emote_math','Emote Matemática','emote','Comemore uma jogada','900','0','rare','emote_math',false],
    ['emote_fire','Emote Fogo','emote','Fogo na mesa!','1200','0','rare','emote_fire',false],
    ['title_beginner','Iniciante','title','Título padrão','0','0','common','title_beginner',false],
    ['title_calculator','Calculista','title','Título para quem joga bem','1800','0','rare','title_calculator',false],
    ['title_master','Mestre Matematixa','title','Título de mestre','4000','0','epic','title_master',false],
    ['title_ceo','CEO','title','Título exclusivo do CEO','0','0','legendary','title_ceo',true],
    ['deck_classic','Baralho Clássico','deck','Baralho padrão','0','0','common','deck_classic',false],
    ['map_classroom','Sala de Aula','map','Mapa inicial','0','0','common','map_classroom',false]
  ];
  for (const [id,name,category,description,price,xp,rarity,assetId,ceoOnly] of items) {
    await pool.query(`INSERT INTO items(id,name,category,description,price,xp_required,rarity,asset,is_active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,category=EXCLUDED.category,description=EXCLUDED.description,price=EXCLUDED.price,xp_required=EXCLUDED.xp_required,rarity=EXCLUDED.rarity,asset=EXCLUDED.asset,is_active=true`,[
      id,name,category,description,Number(price),Number(xp),rarity,JSON.stringify({image:`/assets/cosmetics/${assetId}.svg`,ceoOnly})
    ]);
  }
  console.log(`🛍️ Loja preparada com ${items.length} itens visuais.`);
}

async function repairLegacySchema() {
  if (!pool) return;

  // Compatibilidade com bancos antigos que possuíam uma tabela "profiles"
  // independente da tabela "users". O servidor atual usa users.id como
  // identidade principal e profiles.user_id como ligação.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_bootstrap (
      key VARCHAR(120) PRIMARY KEY,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS friendships (
      user_a INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_b INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(20) NOT NULL DEFAULT 'accepted',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(user_a,user_b),
      CHECK(user_a < user_b),
      CHECK(status IN ('pending','accepted'))
    );
    CREATE TABLE IF NOT EXISTS friend_invites (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mode VARCHAR(30) NOT NULL DEFAULT 'UNO solo',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      seen BOOLEAN NOT NULL DEFAULT FALSE
    );

    ALTER TABLE profiles
      ADD COLUMN IF NOT EXISTS user_id INTEGER,
      ADD COLUMN IF NOT EXISTS username VARCHAR(50),
      ADD COLUMN IF NOT EXISTS avatar JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS bio VARCHAR(180) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE profiles ALTER COLUMN username DROP NOT NULL;

    ALTER TABLE user_inventory
      ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS acquired_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS item_type VARCHAR(40);

    UPDATE user_inventory ui
       SET item_type = COALESCE(i.category, 'cosmetic')
      FROM items i
     WHERE i.id = ui.item_id
       AND (ui.item_type IS NULL OR ui.item_type = '');

    ALTER TABLE user_inventory ALTER COLUMN item_type SET DEFAULT 'cosmetic';
    ALTER TABLE user_inventory ALTER COLUMN item_type SET NOT NULL;

    ALTER TABLE items
      ADD COLUMN IF NOT EXISTS name VARCHAR(120) NOT NULL DEFAULT 'Item',
      ADD COLUMN IF NOT EXISTS category VARCHAR(40) NOT NULL DEFAULT 'cosmetic',
      ADD COLUMN IF NOT EXISTS description VARCHAR(255) NOT NULL DEFAULT '',
      ADD COLUMN IF NOT EXISTS price BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS xp_required BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rarity VARCHAR(20) NOT NULL DEFAULT 'common',
      ADD COLUMN IF NOT EXISTS asset JSONB NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

    ALTER TABLE player_market
      ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP;

    UPDATE profiles p
       SET user_id = u.id
      FROM users u
     WHERE p.user_id IS NULL
       AND lower(p.username) = lower(u.username);

    UPDATE profiles p
       SET avatar = COALESCE(p.avatar, '{}'::jsonb),
           settings = COALESCE(p.settings, '{}'::jsonb),
           bio = COALESCE(p.bio, ''),
           updated_at = COALESCE(p.updated_at, CURRENT_TIMESTAMP)
     WHERE p.user_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_user_id_unique
      ON profiles(user_id);

    CREATE INDEX IF NOT EXISTS idx_profiles_username
      ON profiles(username);

    CREATE INDEX IF NOT EXISTS idx_inventory_user
      ON user_inventory(user_id);
  `);

  // Perfis novos não dependem de uma linha pré-existente. O registro/login
  // cria o perfil automaticamente.
  console.log('🛠️ Compatibilidade do PostgreSQL verificada/corrigida.');
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS chat_blocked_until TIMESTAMP; CREATE TABLE IF NOT EXISTS login_logs (id BIGSERIAL PRIMARY KEY,user_id INTEGER,username VARCHAR(50),ip VARCHAR(120),created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP); CREATE INDEX IF NOT EXISTS idx_login_logs_created ON login_logs(created_at DESC);`);
}

async function ensureCeo() {
  if (!pool) return;
  try {
    const existing = await pool.query("SELECT id,role FROM users WHERE LOWER(username)=LOWER('CeoVelho') LIMIT 1");
    if (existing.rows.length && existing.rows[0].role !== 'CEO') {
      await pool.query("UPDATE users SET role='CEO' WHERE id=$1",[existing.rows[0].id]);
    }
    if (!existing.rows.length) {
      const password=String(process.env.CEO_INITIAL_PASSWORD||'').trim();
      if(password){
        const hash=await bcrypt.hash(password,12);
        await pool.query("INSERT INTO users(username,password_hash,role,coins,xp,level) VALUES('CeoVelho',$1,'CEO',999999999,9999999,100) ON CONFLICT (username) DO UPDATE SET role='CEO'",[hash]);
        console.log('👑 Conta CEO CeoVelho garantida.');
      } else {
        console.warn('⚠️ CeoVelho não existe. Configure CEO_INITIAL_PASSWORD no Render para criá-lo.');
      }
    }
  } catch(e) {
    console.error('ensureCeo:',e.message);
  }
}
function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, jwtSecret, { expiresIn: '7d' });
}
function setAuthCookie(res, token) {
  res.setHeader('Set-Cookie', `uv_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${isProduction ? '; Secure' : ''}`);
}
function clearAuthCookie(res) {
  res.setHeader('Set-Cookie', `uv_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${isProduction ? '; Secure' : ''}`);
}
function verifyToken(token) { try { return jwt.verify(token, jwtSecret); } catch { return null; } }
function tokenFromRequest(req) {
  const cookies = parseCookies(req);
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  return cookies.uv_session || bearer || null;
}
async function getUserById(id) {
  if (usePostgres) {
    const r = await pool.query('SELECT id,username,role,coins,xp,level,wins,losses,games_played,created_at,last_login_at FROM users WHERE id=$1', [id]);
    return r.rows[0] || null;
  }
  const db = localDb();
  const u = db.users.find(x => x.id === Number(id));
  return u ? { ...u } : null;
}
async function auth(req, res, next) {
  const token = tokenFromRequest(req);
  const payload = token && verifyToken(token);
  if (!payload) return res.status(401).json({ success:false, message:'Sessão expirada. Faça login novamente.' });
  const user = await getUserById(payload.id);
  if (!user) return res.status(401).json({ success:false, message:'Conta não encontrada.' });
  const moderation = await activeModeration(user.id);
  if (moderation?.action === 'ban') return res.status(403).json({ success:false, message:'Sua conta está suspensa.', ban: moderation });
  req.user = user;
  next();
}
function requireRole(...roles) { return (req,res,next) => roles.includes(req.user?.role) ? next() : res.status(403).json({success:false,message:'Permissão insuficiente.'}); }
function cleanText(value, max=500) { return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').trim().slice(0,max); }
function validUsername(v) { return /^[A-Za-z0-9_]{3,24}$/.test(v); }

const PASS_ITEMS = {10:'pass_hat_bronze',25:'pass_title_veteran',40:'pass_hat_silver',55:'pass_title_bebado',70:'pass_hat_gold',85:'title_master',100:'pass_hat_rainbow'};
function passReward(level){
  const n=Math.max(1,Math.min(100,Number(level)||1));
  const coins=35+n*15;
  const itemId=PASS_ITEMS[n]||null;
  const title=n===100?'pass_title_lenda':null;
  return {level:n,coins,itemId,title};
}
function passLevels(){return Array.from({length:100},(_,i)=>passReward(i+1));}

function xpForLevel(level) { return Math.floor(100 * Math.pow(level - 1, 1.45)); }
function levelForXp(xp) { let level=1; while(level<100 && xp >= xpForLevel(level+1)) level++; return level; }
function publicUser(u) { return { id:u.id, username:u.username, role:u.role, coins:Number(u.coins||0), xp:Number(u.xp||0), level:Number(u.level||1), wins:Number(u.wins||0), losses:Number(u.losses||0), gamesPlayed:Number(u.games_played||0) }; }
function defaultAvatar() { return { character:'velhinho', skinColor:'#d59b76', eyes:'#1d2433', hair:'hair_basic', hairColor:'#171717', top:'shirt_basic', oponentetom:'pants_basic', shoes:'shoes_basic', accessory:null, effect:null, emote:'emote_wave', title:'title_beginner' }; }
function defaultSettings() { return { music:true, musicVolume:0.45, sfx:true, sfxVolume:0.75, animations:true, chatWorld:true, chatRoom:true, chatPrivate:true, reducedMotion:false }; }
async function getProfile(userId) {
  if (usePostgres) {
    const r=await pool.query('SELECT avatar,settings,bio,updated_at FROM profiles WHERE user_id=$1',[userId]);
    if (!r.rows[0]) return { avatar:defaultAvatar(), settings:defaultSettings(), bio:'' };
    return { avatar:{...defaultAvatar(),...(r.rows[0].avatar||{})}, settings:{...defaultSettings(),...(r.rows[0].settings||{})}, bio:r.rows[0].bio||'', updatedAt:r.rows[0].updated_at };
  }
  const db=localDb(); const p=db.profiles[userId];
  return p ? { avatar:{...defaultAvatar(),...(p.avatar||{})}, settings:{...defaultSettings(),...(p.settings||{})}, bio:p.bio||'' } : {avatar:defaultAvatar(),settings:defaultSettings(),bio:''};
}
async function saveProfile(userId, profile) {
  const avatar={...defaultAvatar(),...(profile.avatar||{})};
  const settings={...defaultSettings(),...(profile.settings||{})};
  const bio=cleanText(profile.bio,180);
  if (usePostgres) {
    const user=await pool.query('SELECT username FROM users WHERE id=$1',[userId]);
    if(!user.rows[0]) throw new Error('Usuário não encontrado.');
    const username=user.rows[0].username;
    await pool.query(`INSERT INTO profiles(user_id,username,avatar,settings,bio) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(user_id) DO UPDATE SET username=EXCLUDED.username,avatar=EXCLUDED.avatar,settings=EXCLUDED.settings,bio=EXCLUDED.bio,updated_at=CURRENT_TIMESTAMP`,
      [userId,username,JSON.stringify(avatar),JSON.stringify(settings),bio]);
  } else {
    const db=localDb(); db.profiles[userId]={avatar,settings,bio,updatedAt:new Date().toISOString()}; saveLocalDb(db);
  }
  return {avatar,settings,bio};
}
async function activeModeration(userId) {
  if (!usePostgres) return null;
  const r=await pool.query(`SELECT action,reason,expires_at FROM moderation_actions WHERE target_id=$1 AND action IN ('ban','mute') AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP) ORDER BY created_at DESC LIMIT 1`,[userId]);
  return r.rows[0]||null;
}
async function logAdmin(actorId,command,args,result='ok') { if(usePostgres) await pool.query('INSERT INTO admin_logs(actor_id,command,arguments,result) VALUES($1,$2,$3,$4)',[actorId,command,cleanText(args,500),result]); }
async function addEconomy(userId, coinsDelta, xpDelta, result='') {
  if (usePostgres) {
    const r=await pool.query(`UPDATE users SET coins=GREATEST(0,coins+$1),xp=GREATEST(0,xp+$2) WHERE id=$3 RETURNING id,username,role,coins,xp,wins,losses,games_played`,[coinsDelta,xpDelta,userId]);
    if (!r.rows[0]) return null;
    const level = levelForXp(Number(r.rows[0].xp || 0));
    const updated = await pool.query('UPDATE users SET level=$1 WHERE id=$2 RETURNING id,username,role,coins,xp,level,wins,losses,games_played',[level,userId]);
    return updated.rows[0]||r.rows[0];
  }
  const db=localDb(); const u=db.users.find(x=>x.id===Number(userId)); if(!u) return null; u.coins=Math.max(0,(u.coins||0)+coinsDelta); u.xp=Math.max(0,(u.xp||0)+xpDelta); u.level=levelForXp(u.xp); saveLocalDb(db); return u;
}
async function grantItem(userId,itemId) {
  if(usePostgres) {
    await pool.query(`INSERT INTO user_inventory(user_id,item_id,item_type) VALUES($1,$2,COALESCE((SELECT category FROM items WHERE id=$2),'cosmetic'))
      ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+1,item_type=COALESCE(user_inventory.item_type,EXCLUDED.item_type)`,[userId,itemId]);
    return true;
  }
  const db=localDb(); db.inventory[userId]=db.inventory[userId]||{}; db.inventory[userId][itemId]=(db.inventory[userId][itemId]||0)+1; saveLocalDb(db); return true;
}
async function hasItem(userId,itemId) {
  if(usePostgres){const r=await pool.query('SELECT 1 FROM user_inventory WHERE user_id=$1 AND item_id=$2',[userId,itemId]); return !!r.rows.length;}
  const db=localDb(); return !!db.inventory[userId]?.[itemId];
}
async function getItems() { if(usePostgres){try{const r=await pool.query('SELECT * FROM items WHERE is_active=true ORDER BY category,price,id'); return r.rows;}catch(e){console.error('items:',e.message);return [];} } return []; }
async function getInventory(userId) { if(usePostgres){try{const r=await pool.query(`SELECT i.*,ui.quantity,ui.acquired_at FROM user_inventory ui JOIN items i ON i.id=ui.item_id WHERE ui.user_id=$1 ORDER BY i.category,i.name`,[userId]); return r.rows;}catch(e){console.error('inventory:',e.message);return [];} } const db=localDb(); return Object.entries(db.inventory[userId]||{}).map(([item_id,quantity])=>({id:item_id,quantity})); }

async function geminiModerate(text){
  if(!GEMINI_API_KEY) return {allowed:true,reason:'disabled'};
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),2500);
  try{
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':GEMINI_API_KEY,'x-goog-api-client':'unovelho-matematixa/3.0'},body:JSON.stringify({systemInstruction:{parts:[{text:'Você é um moderador de chat de um jogo infantil/familiar. Classifique somente como ALLOW, BLOCK ou REVIEW. BLOCK apenas para ameaça, assédio grave, sexualização, discurso de ódio, incentivo a crime ou spam malicioso. REVIEW para conteúdo suspeito. Responda JSON simples: {"decision":"ALLOW|BLOCK|REVIEW","reason":"breve"}.'}]},contents:[{parts:[{text:cleanText(text,500)}]}],generationConfig:{temperature:0,maxOutputTokens:80}}),signal:controller.signal});
    if(!response.ok)return {allowed:true,reason:'api-error'};
    const data=await response.json();const raw=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('')||'';
    const match=raw.match(/\{[\s\S]*\}/);if(!match)return {allowed:true,reason:'parse'};const parsed=JSON.parse(match[0]);
    return {allowed:parsed.decision!=='BLOCK',review:parsed.decision==='REVIEW',reason:parsed.reason||''};
  }catch{return {allowed:true,reason:'timeout'};}finally{clearTimeout(timer);}
}
function rateLimit(map,key,windowMs,max){const now=Date.now();const arr=(map.get(key)||[]).filter(t=>now-t<windowMs);if(arr.length>=max){map.set(key,arr);return false;}arr.push(now);map.set(key,arr);return true;}

async function dbQuery(text,params=[]){
  if(!pool) throw new Error('PostgreSQL não está disponível.');
  try{return await pool.query(text,params);}catch(err){
    if(!['ECONNRESET','ECONNREFUSED','ETIMEDOUT','57P01','57P02','57P03','08000','08001','08003','08004','08006','08007','08009'].includes(String(err?.code||''))) throw err;
    await new Promise(r=>setTimeout(r,250));
    return pool.query(text,params);
  }
}

app.get('/api/health',async(req,res)=>{
  const ready=databaseReady || (!process.env.DATABASE_URL && databaseReady);
  res.status(ready?200:503).json({ok:ready,postgres:usePostgres,ready,rooms:rooms.size,paused:globalState.paused,error:ready?undefined:'Banco de dados ainda inicializando.'});
});

async function requireDatabase(req,res,next){
  try{
    if(databaseReady)return next();
    if(databaseReadyPromise){
      let timedOut=false;
      await Promise.race([databaseReadyPromise,new Promise(resolve=>setTimeout(()=>{timedOut=true;resolve();},4000))]);
      if(databaseReady)return next();
      if(timedOut)return res.status(503).json({success:false,message:'O servidor ainda está acordando. Tente novamente em alguns segundos.'});
    }
    return res.status(503).json({success:false,message:'Banco de dados temporariamente indisponível.'});
  }catch(err){
    console.error('❌ Banco não pronto:',err.message);
    return res.status(503).json({success:false,message:'Banco de dados temporariamente indisponível.'});
  }
}
app.get('/api/me',auth,async(req,res)=>{const profile=await getProfile(req.user.id);res.json({success:true,user:publicUser(req.user),profile});});
app.post('/api/logout',(req,res)=>{clearAuthCookie(res);res.json({success:true});});

app.post('/api/register',requireDatabase,async(req,res)=>{
  const username=cleanText(req.body.username,24); const password=String(req.body.password||'');
  if(!validUsername(username)||password.length<6||password.length>100) return res.status(400).json({success:false,message:'Usuário deve ter 3-24 caracteres (letras, números ou _), e a senha deve ter 6-100 caracteres.'});
  if (/^(ceovelho|ceo|admin|administrador|staff|sistema|system)$/i.test(username)) return res.status(403).json({success:false,message:'Esse nome de usuário é reservado.'});
  if(!rateLimit(loginAttempts,req.ip,60000,8)) return res.status(429).json({success:false,message:'Muitas tentativas. Aguarde um minuto.'});
  try {
    const hash=await bcrypt.hash(password,12); let user;
    if(usePostgres){const exists=await dbQuery('SELECT id FROM users WHERE LOWER(username)=LOWER($1)',[username]);if(exists.rows.length)return res.status(409).json({success:false,message:'Usuário já existe.'});const r=await dbQuery(`INSERT INTO users(username,password_hash,role,coins,xp,level,games_played) VALUES($1,$2,'user',500,0,1,0) RETURNING *`,[username,hash]);user=r.rows[0];}
    else {const db=localDb();if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({success:false,message:'Usuário já existe.'});user={id:(db.users.reduce((m,u)=>Math.max(m,u.id||0),0)+1),username,password_hash:hash,role:'user',coins:500,xp:0,level:1,wins:0,losses:0,games_played:0,created_at:new Date().toISOString()};db.users.push(user);saveLocalDb(db);}
    const token=signToken(user);setAuthCookie(res,token);
    let profile={avatar:defaultAvatar(),settings:defaultSettings(),bio:''};
    try{
      profile=await saveProfile(user.id,profile);
    }catch(profileErr){
      console.error('profile register:',profileErr.message);
      try{
        await dbQuery(`INSERT INTO profiles(user_id,avatar,settings,bio) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO NOTHING`,
          [user.id,JSON.stringify(defaultAvatar()),JSON.stringify(defaultSettings()),'']);
        profile=await getProfile(user.id);
      }catch(repairProfileErr){
        console.error('profile repair:',repairProfileErr.message);
      }
    }
    for(const id of ['hair_basic','shirt_basic','pants_basic','shoes_basic','emote_wave','title_beginner','deck_classic','map_classroom']) if(usePostgres){try{await grantItem(user.id,id);}catch(itemErr){console.error('starter item:',itemErr.message);}}
    res.json({success:true,message:'Conta criada! Monte seu personagem para continuar.',token,user:publicUser(user),profile,needsCustomization:true});
  } catch(e){console.error(e);res.status(500).json({success:false,message:'Erro ao criar conta.'});}
});

app.post('/api/login',requireDatabase,async(req,res)=>{
  const username=cleanText(req.body.username,24);const password=String(req.body.password||'');
  if(!username||!password)return res.status(400).json({success:false,message:'Informe usuário e senha.'});
  if(!rateLimit(loginAttempts,req.ip,60000,10))return res.status(429).json({success:false,message:'Muitas tentativas de login. Aguarde um minuto.'});
  try {let user=null;if(usePostgres){const r=await dbQuery('SELECT * FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1',[username]);user=r.rows[0]||null;}else{const db=localDb();user=db.users.find(u=>u.username.toLowerCase()===username.toLowerCase())||null;}if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({success:false,message:'Usuário ou senha incorretos.'});
    const mod=await activeModeration(user.id);if(mod?.action==='ban')return res.status(403).json({success:false,message:'Conta suspensa.',ban:mod});
    if(usePostgres)await dbQuery('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id]);
    const token=signToken(user);setAuthCookie(res,token);
    for(const id of ['hair_basic','shirt_basic','pants_basic','shoes_basic','emote_wave','title_beginner','deck_classic','map_classroom']) if(usePostgres){try{await grantItem(user.id,id);}catch(itemErr){console.error('starter item login:',itemErr.message);}}
    let profile;try{profile=await getProfile(user.id);}catch(profileErr){console.error('profile login:',profileErr.message);profile={avatar:defaultAvatar(),settings:defaultSettings(),bio:''};}
    res.json({success:true,message:user.role==='CEO'?'Bem-vindo de volta, CEO!':'Login realizado com sucesso!',token,user:publicUser(user),profile,needsCustomization:!profile.avatar||Object.keys(profile.avatar).length===0});
  }catch(e){console.error(e);res.status(500).json({success:false,message:'Erro no login.'});}
});

app.put('/api/profile',auth,async(req,res)=>{try{const avatar=req.body.avatar||{};const allowed=['character','skinColor','eyes','hair','hairColor','top','oponentetom','shoes','accessory','effect','emote','title'];const cleanAvatar={};for(const k of allowed)cleanAvatar[k]=cleanText(avatar[k],80);const profile=await saveProfile(req.user.id,{avatar:cleanAvatar,settings:req.body.settings||{},bio:req.body.bio||''});res.json({success:true,profile});}catch(e){res.status(500).json({success:false,message:'Não foi possível salvar o personagem.'});}});
app.post('/api/game/solo-finish',auth,async(req,res)=>{
  const win=Boolean(req.body.win);
  const coins=Math.min(1000,Math.max(0,Math.floor(Number(req.body.coins)||0)));
  const xp=Math.min(5000,Math.max(0,Math.floor(Number(req.body.xp)||0)));
  try {
    if(usePostgres){
      const r=await pool.query('UPDATE users SET coins=coins+$1,xp=xp+$2,wins=wins+$3,losses=losses+$4,games_played=games_played+1 WHERE id=$5 RETURNING *',[coins,xp,win?1:0,win?0:1,req.user.id]);
      const u=r.rows[0];
      const lvl=levelForXp(Number(u.xp||0));
      const rr=await pool.query('UPDATE users SET level=$1 WHERE id=$2 RETURNING id,username,role,coins,xp,level,wins,losses,games_played',[lvl,req.user.id]);
      return res.json({success:true,user:publicUser(rr.rows[0]||u)});
    }
    const u=await addEconomy(req.user.id,coins,xp);
    if(u){u.wins=(u.wins||0)+(win?1:0);u.losses=(u.losses||0)+(win?0:1);u.games_played=(u.games_played||0)+1;const db=localDb();const lu=db.users.find(x=>x.id===u.id);Object.assign(lu,{wins:u.wins,losses:u.losses,games_played:u.games_played,level:levelForXp(lu.xp)});saveLocalDb(db);}
    return res.json({success:true,user:publicUser(u)});
  } catch(e){console.error(e);res.status(500).json({success:false,message:'Não foi possível salvar a recompensa.'});}
});
app.get('/api/inventory',auth,async(req,res)=>res.json({success:true,items:await getInventory(req.user.id)}));
app.post('/api/chat/global',auth,async(req,res)=>{
      const text=cleanText(req.body.body,500); if(!text)return res.status(400).json({success:false,message:'Mensagem vazia.'});
      const mod=await activeModeration(req.user.id); if(mod?.action==='mute')return res.status(403).json({success:false,message:'Você está silenciado.'});
      if(usePostgres){
        const r=await pool.query("INSERT INTO chat_messages(channel,sender_id,sender_name,body) VALUES('world',$1,$2,$3) RETURNING id,sender_id AS \"senderId\",sender_name AS \"senderName\",body,created_at AS \"createdAt\"",[req.user.id,req.user.username,text]);
        const m={...r.rows[0],senderId:Number(r.rows[0].senderId),channel:'world'};
        io.emit('chat:message',m);
        return res.json({success:true,message:m});
      }
      const m={channel:'world',senderId:req.user.id,senderName:req.user.username,body:text,createdAt:new Date().toISOString()};
      io.emit('chat:message',m); res.json({success:true,message:m});
    });
app.get('/api/chat/global',auth,async(req,res)=>{
  if(!usePostgres)return res.json({success:true,messages:[]});
  try{const r=await pool.query("SELECT id,sender_id AS \"senderId\",sender_name AS \"senderName\",body,created_at AS \"createdAt\" FROM chat_messages WHERE channel='world' ORDER BY id DESC LIMIT 50");res.json({success:true,messages:r.rows.reverse().map(x=>({...x,senderId:Number(x.senderId)}))});}catch(e){res.status(500).json({success:false,message:'Não foi possível carregar o chat global.'});}
});


app.get('/api/pass',auth,async(req,res)=>{
  try{
    const user=await getUserById(req.user.id);
    const claimed=usePostgres ? (await pool.query('SELECT pass_level FROM user_pass_claims WHERE user_id=$1 ORDER BY pass_level',[req.user.id])).rows.map(r=>Number(r.pass_level)) : [];
    const level=Math.max(1,Math.min(100,Number(user.level)||1));
    res.json({success:true,level,xp:Number(user.xp||0),levels:passLevels(),claimed});
  }catch(e){res.status(500).json({success:false,message:'Não foi possível carregar o passe.'});}
});
app.post('/api/pass/claim',auth,async(req,res)=>{
  const requested=Array.isArray(req.body.levels)?req.body.levels.map(Number):[Number(req.body.level)];
  const unique=[...new Set(requested.filter(n=>Number.isInteger(n)&&n>=1&&n<=100))];
  if(!unique.length)return res.status(400).json({success:false,message:'Nenhum nível válido.'});
  if(!usePostgres)return res.status(503).json({success:false,message:'O Passe de Nível exige PostgreSQL para salvar as recompensas.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const u=(await client.query('SELECT level FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];
    if(!u)throw new Error('Usuário não encontrado.');
    const level=Math.min(100,Number(u.level)||1);
    const claimed=(await client.query('SELECT pass_level FROM user_pass_claims WHERE user_id=$1 AND pass_level=ANY($2::int[])',[req.user.id,unique])).rows.map(r=>Number(r.pass_level));
    const fresh=unique.filter(n=>!claimed.includes(n));
    const locked=fresh.filter(n=>n>level);
    if(locked.length)throw new Error(`Você ainda não chegou ao nível ${Math.min(...locked)}.`);
    let coins=0,items=[];
    for(const n of fresh){
      const reward=passReward(n); coins+=reward.coins;
      if(reward.itemId){await client.query(`INSERT INTO user_inventory(user_id,item_id,item_type) VALUES($1,$2,COALESCE((SELECT category FROM items WHERE id=$2),'cosmetic')) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+1,item_type=COALESCE(user_inventory.item_type,EXCLUDED.item_type)`,[req.user.id,reward.itemId]);items.push(reward.itemId);}
      if(reward.title){await client.query(`INSERT INTO user_inventory(user_id,item_id,item_type) VALUES($1,$2,COALESCE((SELECT category FROM items WHERE id=$2),'cosmetic')) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+1,item_type=COALESCE(user_inventory.item_type,EXCLUDED.item_type)`,[req.user.id,reward.title]);items.push(reward.title);}
      await client.query('INSERT INTO user_pass_claims(user_id,pass_level) VALUES($1,$2) ON CONFLICT DO NOTHING',[req.user.id,n]);
    }
    if(coins)await client.query('UPDATE users SET coins=coins+$1 WHERE id=$2',[coins,req.user.id]);
    await client.query('COMMIT');
    const updated=await getUserById(req.user.id);
    res.json({success:true,message:fresh.length?`🎁 ${fresh.length} recompensa(s) coletada(s)!`:'Nada novo para coletar.',claimed:fresh,items,coins,user:publicUser(updated)});
  }catch(e){try{await client.query('ROLLBACK')}catch{}res.status(400).json({success:false,message:e.message||'Não foi possível coletar o passe.'});}
  finally{client.release();}
});

app.get('/api/items',async(req,res)=>res.json({success:true,items:await getItems()}));

app.get('/api/shop/market',auth,async(req,res)=>{if(!usePostgres)return res.json({success:true,listings:[]});const r=await pool.query(`SELECT m.listing_id,m.price,m.created_at,i.*,u.username seller FROM player_market m JOIN items i ON i.id=m.item_id JOIN users u ON u.id=m.seller_id WHERE m.status='active' ORDER BY m.created_at DESC LIMIT 100`);res.json({success:true,listings:r.rows});});
app.post('/api/shop/buy',auth,async(req,res)=>{
  const itemId=cleanText(req.body.itemId,80);if(!usePostgres)return res.status(503).json({success:false,message:'Loja online exige PostgreSQL.'});
  const client=await pool.connect();try{await client.query('BEGIN');const item=(await client.query('SELECT * FROM items WHERE id=$1 AND is_active=true FOR UPDATE',[itemId])).rows[0];if(!item)throw new Error('Item não encontrado.');if(item.asset?.ceoOnly&&req.user.role!=='CEO')throw new Error('Item exclusivo do CEO.');const own=await client.query('SELECT 1 FROM user_inventory WHERE user_id=$1 AND item_id=$2',[req.user.id,itemId]);if(own.rows.length)throw new Error('Você já possui este item.');const buyer=(await client.query('SELECT coins,xp FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];if(Number(buyer.xp)<Number(item.xp_required))throw new Error(`Você precisa de ${item.xp_required} XP.`);if(Number(buyer.coins)<Number(item.price))throw new Error('Moedas insuficientes.');await client.query('UPDATE users SET coins=coins-$1 WHERE id=$2',[item.price,req.user.id]);await client.query(`INSERT INTO user_inventory(user_id,item_id,item_type) VALUES($1,$2,COALESCE((SELECT category FROM items WHERE id=$2),'cosmetic'))`,[req.user.id,itemId]);await client.query('COMMIT');res.json({success:true,message:'Item desbloqueado!',item});}catch(e){await client.query('ROLLBACK');res.status(400).json({success:false,message:e.message});}finally{client.release();}
});
app.post('/api/shop/market/list',auth,async(req,res)=>{if(!usePostgres)return res.status(503).json({success:false,message:'Loja de jogadores exige PostgreSQL.'});const itemId=cleanText(req.body.itemId,80);const price=Math.floor(Number(req.body.price));if(!itemId||!Number.isFinite(price)||price<10||price>100000000)return res.status(400).json({success:false,message:'Preço inválido.'});const client=await pool.connect();try{await client.query('BEGIN');const own=(await client.query('SELECT quantity FROM user_inventory WHERE user_id=$1 AND item_id=$2 FOR UPDATE',[req.user.id,itemId])).rows[0];if(!own)throw new Error('Você não possui o item.');const active=await client.query("SELECT 1 FROM player_market WHERE seller_id=$1 AND item_id=$2 AND status='active'",[req.user.id,itemId]);if(active.rows.length)throw new Error('Esse item já está anunciado.');await client.query('DELETE FROM user_inventory WHERE user_id=$1 AND item_id=$2',[req.user.id,itemId]);const r=await client.query("INSERT INTO player_market(seller_id,item_id,price) VALUES($1,$2,$3) RETURNING *",[req.user.id,itemId,price]);await client.query('COMMIT');res.json({success:true,listing:r.rows[0]});}catch(e){await client.query('ROLLBACK');res.status(400).json({success:false,message:e.message});}finally{client.release();}});
app.post('/api/shop/market/cancel',auth,async(req,res)=>{if(!usePostgres)return res.status(503).json({success:false,message:'Loja de jogadores exige PostgreSQL.'});const listingId=Number(req.body.listingId);const client=await pool.connect();try{await client.query('BEGIN');const l=(await client.query("SELECT * FROM player_market WHERE listing_id=$1 AND seller_id=$2 AND status='active' FOR UPDATE",[listingId,req.user.id])).rows[0];if(!l)throw new Error('Anúncio não encontrado.');await client.query("UPDATE player_market SET status='cancelled' WHERE listing_id=$1",[listingId]);await client.query(`INSERT INTO user_inventory(user_id,item_id,item_type) VALUES($1,$2,COALESCE((SELECT category FROM items WHERE id=$2),'cosmetic')) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+1,item_type=COALESCE(user_inventory.item_type,EXCLUDED.item_type)`,[req.user.id,l.item_id]);await client.query('COMMIT');res.json({success:true,message:'Anúncio cancelado e item devolvido.'});}catch(e){await client.query('ROLLBACK');res.status(400).json({success:false,message:e.message});}finally{client.release();}});
app.post('/api/shop/market/buy',auth,async(req,res)=>{if(!usePostgres)return res.status(503).json({success:false,message:'Loja de jogadores exige PostgreSQL.'});const listingId=Number(req.body.listingId);const client=await pool.connect();try{await client.query('BEGIN');const l=(await client.query("SELECT m.*,i.name,i.asset FROM player_market m JOIN items i ON i.id=m.item_id WHERE m.listing_id=$1 AND m.status='active' FOR UPDATE",[listingId])).rows[0];if(!l)throw new Error('Anúncio não encontrado.');if(l.seller_id===req.user.id)throw new Error('Você não pode comprar seu próprio anúncio.');const buyer=(await client.query('SELECT coins FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];if(Number(buyer.coins)<Number(l.price))throw new Error('Moedas insuficientes.');const seller=(await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[l.seller_id])).rows[0];if(!seller)throw new Error('Vendedor não encontrado.');await client.query('UPDATE users SET coins=coins-$1 WHERE id=$2',[l.price,req.user.id]);await client.query('UPDATE users SET coins=coins+$1 WHERE id=$2',[l.price,l.seller_id]);await client.query('DELETE FROM user_inventory WHERE user_id=$1 AND item_id=$2',[l.seller_id,l.item_id]);await client.query(`INSERT INTO user_inventory(user_id,item_id,item_type) VALUES($1,$2,COALESCE((SELECT category FROM items WHERE id=$2),'cosmetic')) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+1,item_type=COALESCE(user_inventory.item_type,EXCLUDED.item_type)`,[req.user.id,l.item_id]);await client.query("UPDATE player_market SET status='sold',sold_at=CURRENT_TIMESTAMP WHERE listing_id=$1",[listingId]);await client.query('COMMIT');res.json({success:true,message:'Compra concluída!'});}catch(e){await client.query('ROLLBACK');res.status(400).json({success:false,message:e.message});}finally{client.release();}});

app.get('/api/rank',async(req,res)=>{if(!usePostgres)return res.json({success:true,players:[]});const r=await pool.query(`SELECT username,level,xp,wins,games_played FROM users WHERE role<>'banned' ORDER BY level DESC,xp DESC,wins DESC LIMIT 100`);res.json({success:true,players:r.rows});});
app.get('/api/friends',auth,async(req,res)=>{try{if(!usePostgres)return res.json({success:true,friends:[],invites:[]});const f=await pool.query(`SELECT CASE WHEN f.user_a=$1 THEN ub.id ELSE ua.id END AS id, CASE WHEN f.user_a=$1 THEN ub.username ELSE ua.username END AS username FROM friendships f JOIN users ua ON ua.id=f.user_a JOIN users ub ON ub.id=f.user_b WHERE (f.user_a=$1 OR f.user_b=$1) AND f.status='accepted' ORDER BY username`,[req.user.id]);const online=new Set([...socketUsers.values()].map(x=>Number(x.userId)));const friends=f.rows.map(x=>({id:Number(x.id),username:x.username,status:online.has(Number(x.id))?'online':'offline'}));const inv=await pool.query(`SELECT fi.id,fi.from_user_id,fi.to_user_id,fi.mode,fi.created_at,u.username AS from_username FROM friend_invites fi JOIN users u ON u.id=fi.from_user_id WHERE fi.to_user_id=$1 AND fi.seen=false ORDER BY fi.created_at DESC LIMIT 50`,[req.user.id]);res.json({success:true,friends,invites:inv.rows});}catch(e){res.status(500).json({success:false,message:'Não foi possível carregar os amigos.'});}});
app.post('/api/friends/add',auth,async(req,res)=>{if(!usePostgres)return res.status(503).json({success:false,message:'Amigos exigem PostgreSQL.'});const username=cleanText(req.body.username,24);try{const u=(await pool.query('SELECT id,username FROM users WHERE lower(username)=lower($1) LIMIT 1',[username])).rows[0];if(!u)return res.status(404).json({success:false,message:'Jogador não encontrado.'});if(Number(u.id)===Number(req.user.id))return res.status(400).json({success:false,message:'Você não pode adicionar a si mesmo.'});const a=Math.min(Number(req.user.id),Number(u.id)),b=Math.max(Number(req.user.id),Number(u.id));await pool.query(`INSERT INTO friendships(user_a,user_b,requester_id,status) VALUES($1,$2,$3,'accepted') ON CONFLICT(user_a,user_b) DO UPDATE SET requester_id=EXCLUDED.requester_id,status='accepted'`,[a,b,req.user.id]);res.json({success:true,message:`${u.username} foi adicionado aos seus amigos.`});}catch(e){res.status(400).json({success:false,message:'Não foi possível adicionar o amigo.'});}});
app.post('/api/friends/invite/accept',auth,async(req,res)=>{if(!usePostgres)return res.status(503).json({success:false,message:'Amigos exigem PostgreSQL.'});try{const id=Number(req.body.id);const r=await pool.query('SELECT 1 FROM friend_invites WHERE id=$1 AND to_user_id=$2',[id,req.user.id]);if(!r.rows.length)return res.status(404).json({success:false,message:'Convite não encontrado.'});await pool.query('UPDATE friend_invites SET seen=true WHERE id=$1',[id]);res.json({success:true,message:'Convite aceito.'});}catch(e){res.status(500).json({success:false,message:'Não foi possível aceitar o convite.'});}});
app.post('/api/friends/invite/decline',auth,async(req,res)=>{if(!usePostgres)return res.status(503).json({success:false,message:'Amigos exigem PostgreSQL.'});try{await pool.query('DELETE FROM friend_invites WHERE id=$1 AND to_user_id=$2',[Number(req.body.id),req.user.id]);res.json({success:true});}catch(e){res.status(500).json({success:false,message:'Não foi possível ignorar o convite.'});}});
app.post('/api/report',auth,async(req,res)=>{if(!usePostgres)return res.json({success:true});const target=Number(req.body.targetId);const reason=cleanText(req.body.reason,255);if(!target||!reason)return res.status(400).json({success:false,message:'Denúncia incompleta.'});await pool.query('INSERT INTO reports(reporter_id,target_id,reason) VALUES($1,$2,$3)',[req.user.id,target,reason]);res.json({success:true,message:'Denúncia enviada.'});});

app.get('/api/rooms',auth,(req,res)=>{const mode=['uno','draw','truco','checkers','chess'].includes(String(req.query.mode||''))?String(req.query.mode):null;res.json({success:true,rooms:[...rooms.values()].filter(r=>!r.started&&(!mode||r.options.gameMode===mode)).map(roomSummary)});});
app.post('/api/rooms',auth,async(req,res)=>{if(globalState.paused)return res.status(423).json({success:false,message:globalState.message||'O jogo está paralisado.'});const options=normalizeRoomOptions(req.body);const code=makeRoomCode();const room={code,name:cleanText(req.body.name||`Sala de ${req.user.username}`,40),ownerId:req.user.id,ownerName:req.user.username,password:cleanText(req.body.password,40),options,players:[],started:false,locked:false,game:null,createdAt:Date.now()};room.players.push(makeRoomPlayer(req.user));rooms.set(code,room);res.json({success:true,room:roomSummary(room),roomCode:code});});
app.post('/api/rooms/:code/join',auth,async(req,res)=>{const room=rooms.get(req.params.code.toUpperCase());if(!room)return res.status(404).json({success:false,message:'Sala não encontrada.'});if(room.started)return res.status(409).json({success:false,message:'A partida já começou.'});if(room.players.length>=room.options.maxPlayers)return res.status(409).json({success:false,message:'Sala cheia.'});if(room.password&&room.password!==String(req.body.password||''))return res.status(403).json({success:false,message:'Senha incorreta.'});if(room.players.some(p=>p.userId===req.user.id))return res.json({success:true,room:roomSummary(room)});room.players.push(makeRoomPlayer(req.user));emitRoom(room);res.json({success:true,room:roomSummary(room)});});
app.post('/api/rooms/:code/leave',auth,(req,res)=>{const room=rooms.get(req.params.code.toUpperCase());if(!room)return res.json({success:true});removePlayer(room,req.user.id);res.json({success:true});});
app.post('/api/rooms/:code/start',auth,(req,res)=>{const room=rooms.get(req.params.code.toUpperCase());if(!room)return res.status(404).json({success:false,message:'Sala não encontrada.'});if(room.ownerId!==req.user.id)return res.status(403).json({success:false,message:'Somente o criador inicia a sala.'});if(room.options.gameMode==='draw'&&room.players.length<2)return res.status(400).json({success:false,message:'Adivinha o Desenho precisa de pelo menos 2 jogadores.'});if(globalState.paused)return res.status(423).json({success:false,message:globalState.message||'Jogo paralisado.'});if(room.options.gameMode!=='draw')fillRoomWithHiddenOpponents(room);startRoomGame(room);res.json({success:true,room:roomSummary(room)});});

function normalizeRoomOptions(body){return {gameMode:['uno','draw','truco','checkers','chess'].includes(body.gameMode)?body.gameMode:'uno',maxPlayers:Math.min(8,Math.max(2,Number(body.maxPlayers)||4)),turnSeconds:Math.min(120,Math.max(15,Number(body.turnSeconds)||45)),autoFill:body.autoFill!==false,fillCount:Math.min(7,Math.max(0,Number(body.fillCount)||0)),difficulty:['easy','medium','hard'].includes(body.difficulty)?body.difficulty:'medium',mapId:cleanText(body.mapId||'map_saloon',80),deckId:cleanText(body.deckId||'deck_classic',80),specials:body.specials!==false,math:false,chat:body.chat!==false,worldChat:body.worldChat!==false,privateChat:body.privateChat!==false,stackDraw:body.stackDraw===true,startingCards:Math.min(12,Math.max(5,Number(body.startingCards)||7))};}
function makeRoomCode(){let c;do{c='MATX-'+Math.random().toString(36).slice(2,6).toUpperCase();}while(rooms.has(c));return c;}
function makeRoomPlayer(user,avatar=null){return {userId:user.id,username:user.username,role:user.role,avatar:avatar||defaultAvatar(),connected:true,hand:[],isHousePlayer:false,xp:Number(user.xp)||0};}
function makeHousePlayer(n){return {userId:`oponente-${Date.now()}-${n}`,username:['Calculinho','Fibonacci','Ada','Newton','Gauss','Euler','Turing','Hipátia'][n%8],role:'player',avatar:null,connected:true,hand:[],isHousePlayer:true};}
function roomSummary(room){return {code:room.code,name:room.name,ownerId:room.ownerId,ownerName:room.ownerName,locked:!!room.password,started:room.started,players:room.players.map(p=>({userId:p.userId,username:p.username,role:'player',connected:p.connected,cardCount:p.hand?.length||0,avatar:p.avatar||null})),options:room.options,createdAt:room.createdAt};}
function emitRoom(room){io.to(`room:${room.code}`).emit('room:update',roomSummary(room));io.emit('rooms:update');}
function removePlayer(room,userId){
  const i=room.players.findIndex(p=>String(p.userId)===String(userId));
  if(i<0)return;
  if(room.started){
    const leaving=room.players[i];
    leaving.connected=false;
    leaving.hand=[];
    if(room.game?.timer)clearTimeout(room.game.timer);
    clearTurnGuard(room);
    io.to(`room:${room.code}`).emit('room:system',{message:`${leaving.username} saiu da partida.`});
    const active=room.players.filter(p=>p.connected);
    if(active.length<2){
      room.started=false;
      room.locked=false;
      room.starting=false;
      if(room.game)room.game.winner=null;
      io.to(`room:${room.code}`).emit('game:ended',{reason:'not-enough-players',message:'A partida foi encerrada porque não há jogadores suficientes.'});
      emitRoom(room);
    }else{
      if(room.game&&room.game.currentIndex===i)room.game.currentIndex=nextIndex(room,1);
      if(room.game){room.game.turnStartedAt=Date.now();emitGame(room);scheduleTurnGuard(room);}
      emitRoom(room);
    }
  }else{
    room.players.splice(i,1);
    if(room.ownerId===userId&&room.players.length){room.ownerId=room.players[0].userId;room.ownerName=room.players[0].username;}
    if(!room.players.length)rooms.delete(room.code);else emitRoom(room);
  }
}

const COLORS=['red','yellow','green','blue'];
function buildDeck(){const deck=[];for(const color of COLORS){for(let n=0;n<=9;n++)deck.push({id:crypto.randomUUID(),color,value:String(n),type:'number'});deck.push({id:crypto.randomUUID(),color,value:'🚫',type:'skip'});deck.push({id:crypto.randomUUID(),color,value:'🔄',type:'reverse'});deck.push({id:crypto.randomUUID(),color,value:'+2',type:'draw2'});}for(let i=0;i<4;i++){deck.push({id:crypto.randomUUID(),color:'black',value:'🌈',type:'wild'});deck.push({id:crypto.randomUUID(),color:'black',value:'+4',type:'draw4'});}for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
function playable(card,top,currentColor,hand=[],pendingDraw=0,stackDraw=false){
  if(!card||!top)return false;
  if(pendingDraw>0){
    if(!stackDraw)return false;
    const expected=pendingDraw===2?'draw2':pendingDraw===4?'draw4':null;
    if(!expected||card.type!==expected)return false;
  }
  if(card.type==='draw4'&&Array.isArray(hand)&&hand.some(c=>c.id!==card.id&&c.color!=='black'&&c.color===currentColor))return false;
  return card.color==='black'||card.color===currentColor||card.value===top.value;
}
const DRAW_WORDS=['abacaxi','avião','bicicleta','cachorro','café','castelo','chuva','dinossauro','dragão','elefante','escola','foguete','girafa','hambúrguer','jacaré','lua','navio','palhaço','pizza','robô','sorvete','violão','vulcão','zumbi','pirata','cacto','computador','óculos','guarda-chuva','tubarão'];
function drawingSafe(room,viewerId){const g=room.game;const me=room.players.find(p=>String(p.userId)===String(viewerId));const isDrawer=String(g.drawerId)===String(viewerId);return {mode:'draw',code:room.code,players:room.players.map(p=>({userId:p.userId,username:p.username,role:'player',avatar:p.avatar,points:p.points||0,connected:p.connected})),drawerId:g.drawerId,drawerName:g.drawerName,secretWord:isDrawer?g.secretWord:null,turnSeconds:room.options.turnSeconds,secondsLeft:Math.max(0,Math.ceil((g.turnEndsAt-Date.now())/1000)),round:g.round,guesses:g.guesses||[],isDrawer,wordLength:g.secretWord?.length||0};}
function emitDrawingState(room){for(const p of room.players){if(p.isHousePlayer||!p.connected)continue;for(const [sid,u] of socketUsers){if(String(u.userId)===String(p.userId))io.to(sid).emit('drawing:state',drawingSafe(room,p.userId));}}}
function startDrawingGame(room){room.started=true;room.locked=true;room.players.forEach(p=>{p.hand=[];p.points=p.points||0;});room.game={mode:'draw',drawerIndex:0,drawerId:room.players[0]?.userId,drawerName:room.players[0]?.username,secretWord:DRAW_WORDS[Math.floor(Math.random()*DRAW_WORDS.length)],snapshot:null,round:1,guesses:[],correctIds:new Set(),turnEndsAt:Date.now()+room.options.turnSeconds*1000,startedAt:Date.now(),winner:null};emitDrawingState(room);scheduleDrawingTurn(room);}
function scheduleDrawingTurn(room){clearTimeout(room.game?.timer);if(!room.started||room.options.gameMode!=='draw')return;const ms=Math.max(500,room.game.turnEndsAt-Date.now());room.game.timer=setTimeout(()=>endDrawingTurn(room),ms);}
function endDrawingTurn(room){if(!room.started||room.options.gameMode!=='draw')return;io.to(`room:${room.code}`).emit('drawing:reveal',{word:room.game.secretWord,dataUrl:room.game.snapshot});setTimeout(()=>{if(!room.started)return;room.game.drawerIndex=(room.game.drawerIndex+1)%room.players.length;room.game.drawerId=room.players[room.game.drawerIndex]?.userId;room.game.drawerName=room.players[room.game.drawerIndex]?.username;room.game.secretWord=DRAW_WORDS[Math.floor(Math.random()*DRAW_WORDS.length)];room.game.snapshot=null;room.game.round+=1;room.game.guesses=[];room.game.correctIds=new Set();room.game.turnEndsAt=Date.now()+room.options.turnSeconds*1000;io.to(`room:${room.code}`).emit('drawing:clear');io.to(`room:${room.code}`).emit('drawing:round',{round:room.game.round,drawerId:room.game.drawerId,drawerName:room.game.drawerName});emitDrawingState(room);scheduleDrawingTurn(room);},3500);}

async function persistGameSession(room, eventType='state') {
  if (!usePostgres || !room?.game) return;
  try {
    const state = JSON.parse(JSON.stringify(room.game, (key, value) => {
      if (value instanceof Set) return [...value];
      if (value instanceof Map) return [...value.entries()];
      if (key === 'deck' && Array.isArray(value) && value.length > 120) return value.slice(-120);
      return value;
    }));
    const matchId = room.game.matchId || crypto.randomUUID();
    room.game.matchId = matchId;
    await pool.query(`INSERT INTO game_sessions(match_id,room_code,mode,status,state,updated_at)
      VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
      ON CONFLICT(match_id) DO UPDATE SET room_code=EXCLUDED.room_code,mode=EXCLUDED.mode,status=EXCLUDED.status,state=EXCLUDED.state,updated_at=CURRENT_TIMESTAMP`,
      [matchId, room.code, room.options.gameMode, room.started ? 'active' : 'waiting', JSON.stringify(state)]);
    await pool.query(`INSERT INTO game_moves(match_id,room_code,user_id,username,event_type,payload)
      VALUES($1,$2,$3,$4,$5,$6)`,[matchId,room.code,null,'SYSTEM',eventType,JSON.stringify({at:Date.now()})]).catch(()=>{});
  } catch(e) { console.error('persist game:',e.message); }
}
function modePlayerIds(room){ return room.players.filter(p=>!p.isHousePlayer && p.connected).map(p=>p.userId); }
function startTrucoGame(room){
  room.started=true;room.locked=true;room.options.maxPlayers=Math.min(4,Math.max(2,room.players.length));
  const suits=['♣','♥','♠','♦'], ranks=[['4',1],['5',2],['6',3],['7',4],['Q',5],['J',6],['K',7],['A',8],['2',9],['3',10]];
  const deck=[];for(const [v,r] of ranks)for(const suit of suits)deck.push({id:crypto.randomUUID(),value:v,suit,rank:r});
  for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
  room.players.forEach(p=>{p.hand=[];p.points=p.points||0;});
  for(let n=0;n<3;n++)for(const p of room.players){if(deck.length)p.hand.push(deck.pop());}
  room.game={mode:'truco',matchId:crypto.randomUUID(),deck,currentIndex:0,trick:[],trickWins:Array(room.players.length).fill(0),round:1,handPoints:Array(room.players.length).fill(0),bet:1,askedBy:null,startedAt:Date.now(),winner:null,message:'Valendo 1. Boa sorte!'};
  persistGameSession(room,'start');emitModeGame(room);
  if(room.players[0]?.isHousePlayer)setTimeout(()=>houseModeTurn(room),500);
}
function startCheckersGame(room){
  room.started=true;room.locked=true;room.players=room.players.slice(0,2);const b=Array(64).fill(null);
  for(let r=0;r<3;r++)for(let c=0;c<8;c++)if((r+c)%2)b[r*8+c]='b';
  for(let r=5;r<8;r++)for(let c=0;c<8;c++)if((r+c)%2)b[r*8+c]='w';
  room.game={mode:'checkers',matchId:crypto.randomUUID(),board:b,currentIndex:0,turnColor:'w',startedAt:Date.now(),winner:null,message:'Sua vez.'};
  persistGameSession(room,'start');emitModeGame(room);if(room.players[0]?.isHousePlayer)setTimeout(()=>houseModeTurn(room),500);
}
function startChessGame(room){
  room.started=true;room.locked=true;room.players=room.players.slice(0,2);const b=Array(64).fill(null);const back=['r','n','b','q','k','b','n','r'];
  for(let c=0;c<8;c++){b[c]=back[c];b[8+c]='p';b[48+c]='P';b[56+c]=back[c].toUpperCase();}
  room.game={mode:'chess',matchId:crypto.randomUUID(),board:b,currentIndex:0,turn:'w',startedAt:Date.now(),winner:null,message:'Brancas começam.'};
  persistGameSession(room,'start');emitModeGame(room);if(room.players[0]?.isHousePlayer)setTimeout(()=>houseModeTurn(room),500);
}
function chessColor(piece){return piece&&piece===piece.toUpperCase()?'w':'b';}
function chessPseudoMoves(board,from){
  const piece=board[from];if(!piece)return [];const color=chessColor(piece),type=piece.toLowerCase(),r=Math.floor(from/8),c=from%8,out=[];
  const add=(rr,cc,slide=false)=>{if(rr<0||rr>7||cc<0||cc>7)return false;const to=rr*8+cc;if(!board[to]){out.push(to);return true;}if(chessColor(board[to])!==color)out.push(to);return false;};
  if(type==='p'){const d=color==='w'?-1:1,start=color==='w'?6:1;let rr=r+d;if(rr>=0&&rr<8&&!board[rr*8+c]){out.push(rr*8+c);if(r===start&&!board[(r+2*d)*8+c])out.push((r+2*d)*8+c);}for(const dc of [-1,1]){rr=r+d;const cc=c+dc;if(rr>=0&&rr<8&&cc>=0&&cc<8&&board[rr*8+cc]&&chessColor(board[rr*8+cc])!==color)out.push(rr*8+cc);}return out;}
  if(type==='n'){for(const [dr,dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]])add(r+dr,c+dc);return out;}
  const dirs=type==='b'?[[-1,-1],[-1,1],[1,-1],[1,1]]:type==='r'?[[-1,0],[1,0],[0,-1],[0,1]]:[[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
  for(const [dr,dc] of dirs){let rr=r+dr,cc=c+dc;while(add(rr,cc,true)){if(type==='k')break;rr+=dr;cc+=dc;} }
  return out;
}
function checkersMoves(board,from){const piece=board[from];if(!piece)return [];const color=piece.toLowerCase(),king=piece===piece.toUpperCase(),r=Math.floor(from/8),c=from%8,dirs=[];if(king||color==='w')dirs.push([-1,-1],[-1,1]);if(king||color==='b')dirs.push([1,-1],[1,1]);const out=[];for(const [dr,dc] of dirs){const r1=r+dr,c1=c+dc;if(r1<0||r1>7||c1<0||c1>7)continue;const t=r1*8+c1;if(!board[t])out.push({to:t,capture:null});else if(board[t].toLowerCase()!==color){const r2=r+2*dr,c2=c+2*dc;if(r2>=0&&r2<8&&c2>=0&&c2<8&&!board[r2*8+c2])out.push({to:r2*8+c2,capture:t});}}return out;}
function checkersHasCapture(board,color){for(let i=0;i<64;i++)if(board[i]&&board[i].toLowerCase()===color&&checkersMoves(board,i).some(m=>m.capture!==null))return true;return false;}
function emitModeGame(room){for(const p of room.players){if(p.isHousePlayer||!p.connected)continue;const state=safeModeGameFor(room,p);for(const [sid,u] of socketUsers)if(String(u.userId)===String(p.userId))io.to(sid).emit('mode:state',state);}}
function safeModeGameFor(room,p){const g=room.game;if(!g)return null;if(g.mode==='truco')return {mode:g.mode,code:room.code,players:room.players.map(x=>({userId:x.userId,username:x.username,avatar:x.avatar,cardCount:x.hand.length,points:x.points||0})),currentPlayerId:room.players[g.currentIndex]?.userId,hand:p.hand,bet:g.bet,trick:g.trick,round:g.round,handPoints:g.handPoints,message:g.message};if(g.mode==='checkers')return {mode:g.mode,code:room.code,players:room.players.map(x=>({userId:x.userId,username:x.username,avatar:x.avatar})),currentPlayerId:room.players[g.currentIndex]?.userId,board:g.board,message:g.message,winner:g.winner};return {mode:'chess',code:room.code,players:room.players.map(x=>({userId:x.userId,username:x.username,avatar:x.avatar})),currentPlayerId:room.players[g.currentIndex]?.userId,board:g.board,turn:g.turn,message:g.message,winner:g.winner,unoRequired:!!(p&&p.hand.length===1&&!g.unoCalled?.[p.userId]),unoCalled:!!(p&&g.unoCalled?.[p.userId])};}
function advanceModeTurn(room){room.game.currentIndex=(room.game.currentIndex+1)%room.players.length;}
function houseModeTurn(room){if(!room.started||!room.game)return;const g=room.game,p=room.players[g.currentIndex];if(!p?.isHousePlayer)return;if(g.mode==='truco'){const card=p.hand[0];if(card)applyTrucoCard(room,p,card.id);return;}if(g.mode==='checkers'){const moves=[];for(let i=0;i<64;i++)if(g.board[i]?.toLowerCase()==='b')for(const m of checkersMoves(g.board,i))moves.push({from:i,...m});if(moves.length){const m=moves[Math.floor(Math.random()*moves.length)];applyCheckersMove(room,p.userId,m.from,m.to);}return;}if(g.mode==='chess'){const moves=[];for(let i=0;i<64;i++)if(g.board[i]&&chessColor(g.board[i])===(g.currentIndex===0?'w':'b'))for(const to of chessPseudoMoves(g.board,i))moves.push({from:i,to});if(moves.length)applyChessMove(room,p.userId,moves[Math.floor(Math.random()*moves.length)]);}}
function applyTrucoCard(room,userId,cardId){const g=room.game,p=room.players.find(x=>String(x.userId)===String(userId));if(!p||g.currentIndex!==room.players.indexOf(p))return false;const idx=p.hand.findIndex(c=>c.id===cardId);if(idx<0)return false;const card=p.hand.splice(idx,1)[0];g.trick.push({userId:p.userId,username:p.username,card});if(g.trick.length===room.players.length){const winner=g.trick.reduce((a,b)=>a.card.rank>b.card.rank?a:b);g.handPoints[room.players.findIndex(x=>String(x.userId)===String(winner.userId))]++;g.message=`${winner.username} ganhou a rodada da mão.`;g.trick=[];for(const pl of room.players){if(g.deck.length>=3)pl.hand.push(g.deck.pop());}g.round++;if(g.handPoints[room.players.findIndex(x=>x.userId===winner.userId)]>=2){g.winner=winner.userId;room.started=false;}else{g.currentIndex=room.players.findIndex(x=>String(x.userId)===String(winner.userId));} }else advanceModeTurn(room);persistGameSession(room,'move');emitModeGame(room);if(room.started&&room.players[g.currentIndex]?.isHousePlayer)setTimeout(()=>houseModeTurn(room),220);return true;}
function applyCheckersMove(room,userId,from,to){const g=room.game,p=room.players[g.currentIndex];if(!p||String(p.userId)!==String(userId))return false;const wanted=g.currentIndex===0?'w':'b';const piece=g.board[from];if(!piece||piece.toLowerCase()!==wanted)return false;const moves=checkersMoves(g.board,from);const legal=moves.find(m=>m.to===Number(to));if(!legal)return false;const must=checkersHasCapture(g.board,wanted);if(must&&legal.capture===null)return false;g.board[to]=piece;g.board[from]=null;if(legal.capture!==null)g.board[legal.capture]=null;const r=Math.floor(to/8);if(piece==='w'&&r===0)g.board[to]='W';if(piece==='b'&&r===7)g.board[to]='B';const enemy=wanted==='w'?'b':'w';if(!g.board.some(x=>x?.toLowerCase()===enemy)){g.winner=userId;room.started=false;g.message='Vitória!';}else{advanceModeTurn(room);g.message=`Vez de ${room.players[g.currentIndex].username}.`;}persistGameSession(room,'move');emitModeGame(room);if(room.started&&room.players[g.currentIndex]?.isHousePlayer)setTimeout(()=>houseModeTurn(room),220);return true;}
function applyChessMove(room,userId,move){const g=room.game,p=room.players[g.currentIndex];if(!p||String(p.userId)!==String(userId))return false;const wanted=g.currentIndex===0?'w':'b';const piece=g.board[move.from];if(!piece||chessColor(piece)!==wanted)return false;const legal=chessPseudoMoves(g.board,move.from).includes(Number(move.to));if(!legal)return false;g.board[move.to]=piece;g.board[move.from]=null;if(piece.toLowerCase()==='p'&&Math.floor(move.to/8)===(wanted==='w'?0:7))g.board[move.to]=wanted==='w'?'Q':'q';if(!g.board.includes(wanted==='w'?'k':'K')){g.winner=userId;room.started=false;g.message='Xeque-mate!';}else{advanceModeTurn(room);g.turn=wanted==='w'?'b':'w';g.message=`Vez de ${room.players[g.currentIndex].username}.`;}persistGameSession(room,'move');emitModeGame(room);if(room.started&&room.players[g.currentIndex]?.isHousePlayer)setTimeout(()=>houseModeTurn(room),220);return true;}
function startComingSoonMode(room){if(room.options.gameMode==='truco')return startTrucoGame(room);if(room.options.gameMode==='checkers')return startCheckersGame(room);if(room.options.gameMode==='chess')return startChessGame(room);}
function makeHiddenOpponent(index, room){
  const names=['Rafa','Bia','Dudu','Luna','Nina','Caio','Theo','Malu','Vini','Léo','Jade','Noah'];
  const name=names[(index+Math.floor(Math.random()*names.length))%names.length];
  const id=`oponente-${crypto.randomUUID()}`;
  return {userId:id,username:name,role:'player',avatar:defaultAvatar(),connected:true,hand:[],isHousePlayer:true,hiddenOpponent:true,aiXp:0};
}
function fillRoomWithHiddenOpponents(room){
  if(!room.options.autoFill)return;
  const target=Math.min(room.options.maxPlayers, Math.max(2, Number(room.options.maxPlayers)||4));
  let i=0;
  const owner=room.players.find(p=>String(p.userId)===String(room.ownerId));const baseXp=Number(owner?.xp||0);while(room.players.length<target && i<target){const ai=makeHiddenOpponent(i++,room);ai.aiXp=Math.max(0,baseXp+((i%3)-1)*900);room.players.push(ai);}
}
function startRoomGame(room){if(room.options.gameMode==='draw')return startDrawingGame(room);if(['truco','checkers','chess'].includes(room.options.gameMode))return startComingSoonMode(room);room.started=true;room.locked=true;const deck=buildDeck();room.game={deck,discard:[],currentColor:null,currentIndex:0,direction:1,pendingDraw:0,startedAt:Date.now(),lastAction:Date.now(),turnStartedAt:Date.now(),winner:null,matchId:crypto.randomUUID(),challenges:new Map(),unoCalled:{},afkStreaks:{}};room.players.forEach(p=>p.hand=[]);for(let n=0;n<room.options.startingCards;n++)for(const p of room.players){if(deck.length)p.hand.push(deck.pop());}let top;do{top=deck.pop();}while(top&&top.color==='black');room.game.discard=[top];room.game.currentColor=top.color;emitGame(room);scheduleTurnGuard(room);if(room.players[room.game.currentIndex]?.isHousePlayer)setTimeout(()=>housePlayerTurn(room),450);}
function safeGameFor(player,room){
  const g=room.game;
  const me=player;
  return {
    code:room.code,
    players:room.players.map(p=>({userId:p.userId,username:p.username,role:'player',connected:p.connected,cardCount:p.hand.length,avatar:p.avatar})),
    top:g.discard[g.discard.length-1],
    recentDiscard:g.discard.slice(-6),
    currentColor:g.currentColor,
    currentPlayerId:room.players[g.currentIndex]?.userId,
    direction:g.direction,
    pendingDraw:g.pendingDraw,
    stackDraw:!!room.options.stackDraw,
    deckCount:g.deck.length,
    hand:me?.hand||[],
    unoRequired:!!(me&&me.hand.length===1&&!g.unoCalled?.[me.userId]),
    unoCalled:!!(me&&g.unoCalled?.[me.userId]),
    mapId:room.options.mapId,
    deckId:room.options.deckId,
    startedAt:g.startedAt,
    turnSeconds:room.options.turnSeconds,
    winner:g.winner,
    turnStartedAt:g.turnStartedAt,
    turnRemainingMs:Math.max(0,10000-(Date.now()-(g.turnStartedAt||Date.now())))
  };
}
function emitGame(room){for(const p of room.players){if(p.isHousePlayer)continue;for(const [sid,u] of socketUsers){if(String(u.userId)===String(p.userId))io.to(sid).emit('game:state',safeGameFor(p,room));}}}
function emitGameAction(room,action){io.to(`room:${room.code}`).emit('game:action',{...action,at:Date.now()});}
function nextIndex(room,steps=1){
  const g=room.game;
  const total=room.players.length;
  if(!total)return 0;
  let i=((Number(g.currentIndex)||0)%total+total)%total;
  for(let n=0;n<steps;n++){
    let checked=0;
    do{
      i=(i+g.direction+total)%total;
      checked++;
    }while(room.players[i]&&!room.players[i].connected&&checked<=total);
    if(checked>total)return i;
  }
  return i;
}
function clearTurnGuard(room){if(room?.game?.turnTimer){clearTimeout(room.game.turnTimer);room.game.turnTimer=null;}}
function aiDifficultyFromXp(xp){const n=Math.max(0,Number(xp)||0);return n>=5000?'hard':n>=1500?'medium':'easy';}
function passTurn(room,reason='tempo'){if(!room?.started||!room.game)return;const p=room.players[room.game.currentIndex];if(!p)return;clearTurnGuard(room);if(!p.isHousePlayer){room.game.afkStreaks=room.game.afkStreaks||{};room.game.afkStreaks[p.userId]=(room.game.afkStreaks[p.userId]||0)+1;emitGameAction(room,{type:'pass',playerId:p.userId,username:p.username,reason,streak:room.game.afkStreaks[p.userId]});if(room.game.afkStreaks[p.userId]>=3){const sid=[...socketUsers.entries()].find(([,u])=>String(u.userId)===String(p.userId))?.[0];if(sid)io.to(sid).emit('toast',{type:'error',message:'Você saiu da partida por inatividade (3 turnos de 10 segundos).'});removePlayer(room,p.userId);if(rooms.has(room.code)&&room.started&&room.players.length>=2){room.game.currentIndex=nextIndex(room,1);room.game.turnStartedAt=Date.now();scheduleTurnGuard(room);emitGame(room);if(room.players[room.game.currentIndex]?.isHousePlayer)setTimeout(()=>housePlayerTurn(room),450);}return;}}
room.game.currentIndex=nextIndex(room,1);room.game.turnStartedAt=Date.now();emitGameAction(room,{type:'pass',playerId:p.userId,username:p.username,reason});emitGame(room);scheduleTurnGuard(room);if(room.started&&room.players[room.game.currentIndex]?.isHousePlayer)setTimeout(()=>housePlayerTurn(room),450);}
function scheduleTurnGuard(room){clearTurnGuard(room);if(globalState.paused)return;if(!room?.started||room.options.gameMode!=='uno'||!room.game)return;room.game.turnStartedAt=Date.now();room.game.turnTimer=setTimeout(()=>passTurn(room,'10s'),10000);}
function drawCards(room,player,count){for(let i=0;i<count;i++){if(!room.game.deck.length){const top=room.game.discard.pop();room.game.deck=room.game.discard.splice(0);room.game.discard=[top];for(let j=room.game.deck.length-1;j>0;j--){const k=Math.floor(Math.random()*(j+1));[room.game.deck[j],room.game.deck[k]]=[room.game.deck[k],room.game.deck[j]];}}if(room.game.deck.length)player.hand.push(room.game.deck.pop());}}
function applyCard(room,player,card,chosenColor){const g=room.game;clearTurnGuard(room);g.discard.push(card);g.currentColor=card.color==='black'?(COLORS.includes(chosenColor)?chosenColor:COLORS[Math.floor(Math.random()*4)]):card.color;g.pendingDraw=0;if(card.type==='draw2')g.pendingDraw=2;if(card.type==='draw4')g.pendingDraw=4;if(card.type==='reverse'&&room.players.length>2)g.direction*=-1;let skip=card.type==='skip'||(card.type==='reverse'&&room.players.length===2);g.currentIndex=nextIndex(room,skip?2:1);g.turnStartedAt=Date.now();}
function turnAllowed(room,userId){return !globalState.paused&&room.started&&room.players[room.game.currentIndex]?.userId===userId;}
function housePlayerTurn(room){
  if(globalState.paused)return;
  if(!room.started||room.game.winner||globalState.paused)return;
  const p=room.players[room.game.currentIndex];if(!p?.isHousePlayer)return;
  clearTurnGuard(room);
  const difficulty=aiDifficultyFromXp(p.aiXp||0);
  const delay=difficulty==='hard'?700+Math.floor(Math.random()*1400):difficulty==='medium'?550+Math.floor(Math.random()*1100):400+Math.floor(Math.random()*800);
  p.aiBusy=true;
  p.aiTimer=setTimeout(()=>{
    p.aiBusy=false;if(!room.started||room.game.winner||room.players[room.game.currentIndex]!==p)return;
    let candidates=p.hand.filter(c=>playable(c,room.game.discard.at(-1),room.game.currentColor,p.hand,room.game.pendingDraw,room.options.stackDraw));
    if(room.game.pendingDraw>0&&!room.options.stackDraw)candidates=[];
    const card=candidates.sort((a,b)=>scoreCard(b)-scoreCard(a))[0];
    if(!card){drawCards(room,p,room.game.pendingDraw||1);room.game.pendingDraw=0;emitGameAction(room,{type:'draw',playerId:p.userId,username:p.username,count:1});room.game.currentIndex=nextIndex(room,1);room.game.turnStartedAt=Date.now();emitGame(room);scheduleTurnGuard(room);if(room.started&&room.players[room.game.currentIndex]?.isHousePlayer)setTimeout(()=>housePlayerTurn(room),450);return;}
    p.hand.splice(p.hand.indexOf(card),1);room.game.unoCalled[p.userId]=false;const color=card.color==='black'?chooseHouseColor(p.hand):null;applyCard(room,p,card,color);emitGameAction(room,{type:'play',playerId:p.userId,username:p.username,card:{id:card.id,color:card.color,value:card.value,type:card.type},chosenColor:room.game.currentColor});if(p.hand.length===1)room.game.unoCalled[p.userId]=false;checkRoomWinner(room,p);if(room.started){emitGame(room);scheduleTurnGuard(room);if(room.players[room.game.currentIndex]?.isHousePlayer)setTimeout(()=>housePlayerTurn(room),450);}
  },Math.min(9500,delay));
}
function scoreCard(c){return c.type==='draw4'?100:c.type==='draw2'?80:c.type==='wild'?70:c.type==='skip'?40:c.type==='reverse'?35:10;}
function chooseHouseColor(hand){const counts={red:0,yellow:0,green:0,blue:0};hand.forEach(c=>{if(counts[c.color]!=null)counts[c.color]++;});return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];}
async function checkRoomWinner(room,player){if(player.hand.length!==0)return;clearTurnGuard(room);room.game.winner=player.userId;room.started=false;room.locked=false;const realPlayers=room.players.filter(p=>!p.isHousePlayer);for(const p of realPlayers){const win=String(p.userId)===String(player.userId);await finishMatchPlayer(p,room,win);}emitGame(room);emitRoom(room);io.to(`room:${room.code}`).emit('game:winner',{username:player.username,userId:player.userId});}
async function finishMatchPlayer(p,room,win){
  if(!usePostgres||p.isHousePlayer)return;
  const coins=win?150:25;
  const xp=win?250:60;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const current=(await client.query('SELECT xp FROM users WHERE id=$1 FOR UPDATE',[p.userId])).rows[0];
    if(!current)throw new Error('Jogador não encontrado.');
    const nextXp=Number(current.xp||0)+xp;
    await client.query(
      `UPDATE users SET coins=coins+$1,xp=xp+$2,level=LEAST(100,$3),wins=wins+$4,losses=losses+$5,games_played=games_played+1 WHERE id=$6`,
      [coins,xp,levelForXp(nextXp),win?1:0,win?0:1,p.userId]
    );
    await client.query('COMMIT');
  }catch(err){
    try{await client.query('ROLLBACK')}catch{}
    console.error('finishMatchPlayer:',err.message);
  }finally{client.release();}
}

async function getGlobalState(){if(!usePostgres)return {paused:false,message:''};const r=await pool.query('SELECT paused,message FROM global_game_state WHERE id=1');return r.rows[0]||{paused:false,message:''};}
let globalState={paused:false,message:''};

function broadcastMaintenance(event,payload){
  for(const [sid,u] of socketUsers){
    // A conta CEO permanece fora da tela de manutenção por design.
    if(String(u.username||'').trim().toLowerCase()==='ceovelho' || String(u.role||'').toUpperCase()==='CEO') continue;
    io.to(sid).emit(event,payload);
  }
}

async function setMaintenanceState(paused,message,actorId){
  globalState={paused:Boolean(paused),message:paused?(message||'JOGO EM MANUTENÇÃO.'):''};
  if(usePostgres){
    if(paused) await pool.query('UPDATE global_game_state SET paused=true,message=$1,updated_by=$2,updated_at=CURRENT_TIMESTAMP WHERE id=1',[globalState.message,actorId]);
    else await pool.query("UPDATE global_game_state SET paused=false,message='',updated_by=$1,updated_at=CURRENT_TIMESTAMP WHERE id=1",[actorId]);
  }
  if(paused){
    // Congela também relógios e jogadas automáticas para a partida não avançar durante a manutenção.
    for(const room of rooms.values()){
      if(room?.game?.turnTimer) clearTurnGuard(room);
      for(const player of room.players||[]){
        if(player.aiTimer){ clearTimeout(player.aiTimer); player.aiTimer=null; }
        player.aiBusy=false;
      }
    }
    broadcastMaintenance('global:pause',globalState);
  }else{
    broadcastMaintenance('global:resume',{});
    // Ao voltar, cada mesa continua do mesmo ponto sem perder a partida.
    for(const room of rooms.values()) if(room.started&&room.game&&!room.game.winner){
      if(room.options.gameMode==='uno') scheduleTurnGuard(room);
      if(room.options.gameMode==='uno'&&room.players[room.game.currentIndex]?.isHousePlayer) setTimeout(()=>housePlayerTurn(room),250);
    }
  }
}

io.use(async(socket,next)=>{const token=socket.handshake.auth?.token||parseCookies({headers:socket.handshake.headers}).uv_session;const payload=token&&verifyToken(token);if(!payload)return next(new Error('unauthorized'));const user=await getUserById(payload.id);if(!user)return next(new Error('unauthorized'));const mod=await activeModeration(user.id);if(mod?.action==='ban')return next(new Error('banned'));socketUsers.set(socket.id,{userId:user.id,username:user.username,role:user.role});socket.user=user;next();});

io.on('connection',socket=>{
  const me=socket.user;
  if(globalState.paused && String(me.username||'').trim().toLowerCase()!=='ceovelho' && String(me.role||'').toUpperCase()!=='CEO') socket.emit('global:pause',globalState);
  socket.on('room:join',async({code,password}={})=>{const room=rooms.get(String(code||'').toUpperCase());if(!room)return socket.emit('toast',{type:'error',message:'Sala não encontrada.'});if(room.started)return socket.emit('toast',{type:'error',message:'Partida já iniciada.'});if(room.password&&room.password!==String(password||''))return socket.emit('toast',{type:'error',message:'Senha incorreta.'});if(room.players.length>=room.options.maxPlayers)return socket.emit('toast',{type:'error',message:'Sala cheia.'});if(!room.players.some(p=>p.userId===me.id)){const prof=await getProfile(me.id);room.players.push(makeRoomPlayer(me,prof.avatar));}socket.join(`room:${room.code}`);emitRoom(room);socket.emit('room:joined',roomSummary(room));});
  socket.on('room:leave',()=>{for(const room of rooms.values())if(room.players.some(p=>p.userId===me.id)){socket.leave(`room:${room.code}`);removePlayer(room,me.id);}});
  socket.on('room:start',()=>{for(const room of rooms.values())if(room.ownerId===me.id&&room.players.some(p=>p.userId===me.id)){if(room.starting)return socket.emit('toast',{type:'info',message:'A partida já está começando.'});if(room.options.gameMode==='draw'&&room.players.length<2)return socket.emit('toast',{type:'error',message:'Adivinha o Desenho precisa de pelo menos 2 jogadores.'});if(globalState.paused)return socket.emit('toast',{type:'error',message:globalState.message});if(room.options.gameMode!=='draw')fillRoomWithHiddenOpponents(room);if(['checkers','chess'].includes(room.options.gameMode)&&room.players.length!==2)room.players=room.players.slice(0,2);room.starting=true;emitRoom(room);io.to(`room:${room.code}`).emit('room:countdown',{seconds:5});let sec=5;const tick=setInterval(()=>{sec--;io.to(`room:${room.code}`).emit('room:countdown',{seconds:Math.max(0,sec)});if(sec<=0){clearInterval(tick);if(!rooms.has(room.code))return;room.starting=false;startRoomGame(room);emitRoom(room);}},1000);return;}});
  socket.on('mode:action',({action,from,to,cardId}={})=>{const room=findPlayerRoom(me.id);if(!room||!room.started||!room.game||!['truco','checkers','chess'].includes(room.game.mode))return socket.emit('toast',{type:'error',message:'Partida de modo não encontrada.'});let ok=false;if(room.game.mode==='truco'){if(action==='truco'){if(room.game.currentIndex===room.players.findIndex(p=>String(p.userId)===String(me.id))){room.game.bet=Math.min(12,room.game.bet*2);room.game.askedBy=me.id;room.game.message=`${me.username} pediu TRUCO! Valendo ${room.game.bet}.`;emitModeGame(room);}}else if(action==='play')ok=applyTrucoCard(room,me.id,cardId);}else if(room.game.mode==='checkers'&&action==='move')ok=applyCheckersMove(room,me.id,Number(from),Number(to));else if(room.game.mode==='chess'&&action==='move')ok=applyChessMove(room,me.id,{from:Number(from),to:Number(to)});if(!ok&&action==='play')socket.emit('toast',{type:'error',message:'Jogada inválida.'});});
  socket.on('game:uno',()=>{
    const room=findPlayerRoom(me.id);
    if(!room||!room.started||room.options.gameMode!=='uno'||!room.game)return;
    const p=room.players.find(x=>String(x.userId)===String(me.id));
    if(!p||p.hand.length!==1)return socket.emit('toast',{type:'error',message:'Você só pode gritar UNO quando estiver com 1 carta.'});
    room.game.unoCalled=room.game.unoCalled||{};
    room.game.unoCalled[p.userId]=true;
    io.to(`room:${room.code}`).emit('game:uno',{playerId:p.userId,username:p.username});
    emitGame(room);
  });
  socket.on('game:play',async({cardId,chosenColor}={})=>{
    const room=findPlayerRoom(me.id);
    if(!room||room.options.gameMode!=='uno')return socket.emit('toast',{type:'error',message:'Partida de UNO não encontrada.'});
    if(!turnAllowed(room,me.id))return socket.emit('toast',{type:'error',message:'Não é sua vez.'});
    const p=room.players.find(x=>String(x.userId)===String(me.id));if(!p)return;
    for(const victim of room.players){if(victim.hand.length===1&&!room.game.unoCalled?.[victim.userId]&&String(victim.userId)!==String(me.id)){drawCards(room,victim,2);room.game.unoCalled[victim.userId]=true;emitGameAction(room,{type:'uno-penalty',playerId:victim.userId,username:victim.username,count:2});}}
    if(room.game.pendingDraw>0&&!room.options.stackDraw)return socket.emit('toast',{type:'error',message:`Você precisa comprar ${room.game.pendingDraw} cartas.`});
    const index=p.hand.findIndex(c=>c.id===cardId||c._clientId===cardId);if(index<0)return socket.emit('toast',{type:'error',message:'Carta inválida.'});
    const card=p.hand[index];if(!playable(card,room.game.discard.at(-1),room.game.currentColor,p.hand,room.game.pendingDraw,room.options.stackDraw))return socket.emit('toast',{type:'error',message:'Carta não pode ser jogada.'});
    p.hand.splice(index,1);room.game.unoCalled[p.userId]=false;room.game.afkStreaks=room.game.afkStreaks||{};room.game.afkStreaks[p.userId]=0;applyCard(room,p,card,chosenColor);
    if(p.hand.length===1)room.game.unoCalled[p.userId]=false;
    emitGameAction(room,{type:'play',playerId:p.userId,username:p.username,card:{id:card.id,color:card.color,value:card.value,type:card.type},chosenColor:room.game.currentColor});
    await checkRoomWinner(room,p);if(room.started){emitGame(room);scheduleTurnGuard(room);if(room.players[room.game.currentIndex]?.isHousePlayer)setTimeout(()=>housePlayerTurn(room),450);}
  });
  socket.on('game:draw',()=>{
    const room=findPlayerRoom(me.id);if(!room||room.options.gameMode!=='uno'||!turnAllowed(room,me.id))return;
    const p=room.players.find(x=>String(x.userId)===String(me.id));if(!p)return;
    for(const victim of room.players){if(victim.hand.length===1&&!room.game.unoCalled?.[victim.userId]&&String(victim.userId)!==String(me.id)){drawCards(room,victim,2);room.game.unoCalled[victim.userId]=true;emitGameAction(room,{type:'uno-penalty',playerId:victim.userId,username:victim.username,count:2});}}
    const count=room.game.pendingDraw>0?room.game.pendingDraw:1;drawCards(room,p,count);room.game.pendingDraw=0;room.game.afkStreaks=room.game.afkStreaks||{};room.game.afkStreaks[p.userId]=0;room.game.currentIndex=nextIndex(room,1);room.game.turnStartedAt=Date.now();
    emitGameAction(room,{type:'draw',playerId:p.userId,username:me.username,count});if(room.started){emitGame(room);scheduleTurnGuard(room);if(room.players[room.game.currentIndex]?.isHousePlayer)setTimeout(()=>housePlayerTurn(room),450);}
  });
  socket.on('drawing:snapshot',({roomCode,dataUrl}={})=>{const room=findPlayerRoom(me.id);if(!room||room.options.gameMode!=='draw'||!room.started||String(room.game.drawerId)!==String(me.id))return;if(typeof dataUrl!=='string'||!dataUrl.startsWith('data:image/jpeg;base64,'))return;if(dataUrl.length>900000)return;room.game.snapshot=dataUrl;});
  socket.on('drawing:stroke',({roomCode,x1,y1,x2,y2,color,size,erase}={})=>{const room=findPlayerRoom(me.id);if(!room||room.options.gameMode!=='draw'||!room.started||room.code!==String(roomCode||'').toUpperCase())return;if(String(room.game.drawerId)!==String(me.id))return;const clean={roomCode:room.code,x1:Number(x1),y1:Number(y1),x2:Number(x2),y2:Number(y2),color:/^#[0-9a-f]{6}$/i.test(String(color||''))?String(color):'#111827',size:Math.min(28,Math.max(2,Number(size)||7)),erase:!!erase};if(![clean.x1,clean.y1,clean.x2,clean.y2].every(Number.isFinite))return;io.to(`room:${room.code}`).emit('drawing:stroke',clean);});
  socket.on('drawing:clear',({roomCode}={})=>{const room=findPlayerRoom(me.id);if(!room||room.options.gameMode!=='draw'||!room.started||String(room.game.drawerId)!==String(me.id))return;io.to(`room:${room.code}`).emit('drawing:clear');});
  socket.on('drawing:guess',({roomCode,guess}={})=>{const room=findPlayerRoom(me.id);if(!room||room.options.gameMode!=='draw'||!room.started)return;const text=cleanText(guess,60).toLowerCase();if(!text||String(room.game.drawerId)===String(me.id)||room.game.correctIds?.has(me.id))return;const word=String(room.game.secretWord||'').toLowerCase();const normalize=x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,'').trim();const correct=normalize(text)===normalize(word)||normalize(text).includes(normalize(word));room.game.guesses=room.game.guesses||[];room.game.guesses.push({username:me.username,guess:cleanText(guess,60),correct});if(correct){room.game.correctIds.add(me.id);const player=room.players.find(p=>String(p.userId)===String(me.id));if(player)player.points=(player.points||0)+Math.max(20,100-Math.floor((Date.now()-room.game.startedAt)/1000));const drawer=room.players.find(p=>String(p.userId)===String(room.game.drawerId));if(drawer)drawer.points=(drawer.points||0)+20;}io.to(`room:${room.code}`).emit('drawing:guess',{username:me.username,guess:cleanText(guess,60),correct});if(correct&&room.game.correctIds.size>=Math.max(1,room.players.filter(p=>p.connected&&!p.isHousePlayer&&String(p.userId)!==String(room.game.drawerId)).length)){room.game.turnEndsAt=Math.min(room.game.turnEndsAt,Date.now()+1200);clearTimeout(room.game.timer);room.game.timer=setTimeout(()=>endDrawingTurn(room),1200);}});
  socket.on('chat:typing',({roomCode,typing}={})=>{const room=findPlayerRoom(me.id);if(!room||room.code!==String(roomCode||room.code).toUpperCase())return;io.to(`room:${room.code}`).emit('chat:typing',{playerId:me.id,username:me.username,typing:!!typing});});
  socket.on('game:emote',({emote}={})=>{const allowed=['😀','😂','😎','😍','😡','😱','😭','🔥','👏','🤔','😴','🎉'];const value=allowed.includes(String(emote))?String(emote):'😀';const room=findPlayerRoom(me.id);if(!room||!room.started)return;io.to(`room:${room.code}`).emit('game:emote',{playerId:me.id,username:me.username,emote:value,at:Date.now()});});
  socket.on('chat:send',async({channel,body,roomCode,receiverId}={})=>{try{if(!rateLimit(chatRate,me.id,10000,12))return socket.emit('toast',{type:'error',message:'Você está enviando mensagens rápido demais.'});const text=cleanText(body,500);if(!text)return;const aiModeration=await geminiModerate(text);if(!aiModeration.allowed){if(usePostgres)await pool.query('INSERT INTO reports(reporter_id,target_id,reason,status) VALUES($1,$2,$3,$4)',[me.id,me.id,'Gemini bloqueou mensagem: '+cleanText(aiModeration.reason,220),'ai-block']);return socket.emit('toast',{type:'error',message:'Mensagem bloqueada pela moderação.'});}const mod=await activeModeration(me.id);if(mod?.action==='mute')return socket.emit('toast',{type:'error',message:'Você está silenciado.'});if(text.startsWith('/')&&me.role==='CEO'){const result=await executeAdminCommand(me,text);socket.emit('admin:result',result);return;}const ch=['world','room','private'].includes(channel)?channel:'world';let room=findPlayerRoom(me.id);if(ch==='room'&&(!room||room.code!==String(roomCode||room?.code).toUpperCase()))return;let targetSocket=null;if(ch==='private'){targetSocket=[...socketUsers.entries()].find(([,u])=>Number(u.userId)===Number(receiverId))?.[0];if(!targetSocket)return socket.emit('toast',{type:'error',message:'Jogador offline.'});}const msg={channel:ch,roomCode:room?.code||null,senderId:me.id,senderName:me.username,receiverId:receiverId||null,body:text,createdAt:new Date().toISOString()};if(ch==='room'&&room)io.to(`room:${room.code}`).emit('game:chatAction',{playerId:me.id,username:me.username});if(usePostgres)await pool.query('INSERT INTO chat_messages(channel,room_code,sender_id,receiver_id,sender_name,body) VALUES($1,$2,$3,$4,$5,$6)',[ch,msg.roomCode,me.id,receiverId||null,me.username,text]);if(ch==='world')io.emit('chat:message',msg);else if(ch==='room')io.to(`room:${room.code}`).emit('chat:message',msg);else{socket.emit('chat:message',msg);if(targetSocket)io.to(targetSocket).emit('chat:message',msg);}}catch(err){console.error('chat:send:',err?.message||err);socket.emit('toast',{type:'error',message:'Não foi possível enviar a mensagem.'});}});
  socket.on('friend:invite',async({friendId,mode='UNO solo'}={})=>{if(!usePostgres)return socket.emit('toast',{type:'error',message:'Convites exigem PostgreSQL.'});const fid=Number(friendId);if(!fid||fid===Number(me.id))return;try{const ok=await pool.query(`SELECT 1 FROM friendships WHERE status='accepted' AND ((user_a=$1 AND user_b=$2) OR (user_a=$2 AND user_b=$1))`,[me.id,fid]);if(!ok.rows.length)return socket.emit('toast',{type:'error',message:'Esse jogador ainda não está nos seus amigos.'});const prof=await getProfile(fid);const dnd=prof.settings?.doNotDisturb===true;const ins=await pool.query('INSERT INTO friend_invites(from_user_id,to_user_id,mode) VALUES($1,$2,$3) RETURNING id,from_user_id,to_user_id,mode,created_at',[me.id,fid,cleanText(mode,30)]);const invite={...ins.rows[0],from_username:me.username,silent:dnd};for(const [sid,u] of socketUsers){if(Number(u.userId)===fid)io.to(sid).emit('friend:invite',invite);}socket.emit('toast',{type:'success',message:dnd?'Convite enviado para o correio.':'Convite enviado!'});}catch(e){socket.emit('toast',{type:'error',message:'Não foi possível enviar o convite.'});}});
  socket.on('disconnect',()=>{socketUsers.delete(socket.id);const room=findPlayerRoom(me.id);if(room?.started){const p=room.players.find(x=>String(x.userId)===String(me.id));if(p&&!p.isHousePlayer){p.isHousePlayer=true;p.role='player';p.hiddenOpponent=true;p.connected=true;p.aiXp=Number(p.xp)||0;clearTurnGuard(room);io.to(`room:${room.code}`).emit('room:system',{message:`A mesa reorganizou o lugar de um participante.`});emitGame(room);if(room.players[room.game.currentIndex]?.isHousePlayer)setTimeout(()=>housePlayerTurn(room),450);else scheduleTurnGuard(room);}}});
});
function findPlayerRoom(userId){for(const room of rooms.values())if(room.players.some(p=>String(p.userId)===String(userId)))return room;return null;}

async function executeAdminCommand(me,text){const parts=text.trim().split(/\s+/);const cmd=parts.shift().toLowerCase();const args=parts.join(' ');if(me.role!=='CEO')return {ok:false,message:'Comando restrito.'};try{
  if(cmd==='/help')return {ok:true,message:['/help','/paralisaruno [mensagem]','/desparalisaruno','/anuncio [mensagem]','/kick [usuario]','/ban [usuario] [minutos] [motivo]','/unban [usuario]','/mute [usuario] [minutos]','/unmute [usuario]','/darcoins [usuario] [quantidade]','/darxp [usuario] [quantidade]','/removecoins [usuario] [quantidade]','/criar staff [usuario]','/bloqueiochat','/desbloqueiochat','/status','/salas','/fecharsala [codigo]','/evento [mensagem]'].join('\n')};
  if(cmd==='/paralisaruno'){await setMaintenanceState(true,cleanText(args||'JOGO EM MANUTENÇÃO.',500),me.id);await logAdmin(me.id,cmd,args);return {ok:true,message:'Modo manutenção ativado.'};}
  if(cmd==='/desparalisaruno'){await setMaintenanceState(false,'',me.id);await logAdmin(me.id,cmd,args);return {ok:true,message:'Modo manutenção desativado.'};}
  if(cmd==='/anuncio'||cmd==='/evento'){const m=cleanText(args,500);if(!m)return {ok:false,message:'Informe uma mensagem.'};io.emit('admin:announcement',{message:m,by:me.username});await logAdmin(me.id,cmd,args);return {ok:true,message:'Mensagem enviada.'};}
  if(cmd==='/status')return {ok:true,message:`Salas: ${rooms.size} | Conectados: ${socketUsers.size} | Paralisado: ${globalState.paused}`};
  if(cmd==='/salas')return {ok:true,message:[...rooms.values()].map(r=>`${r.code} ${r.name} ${r.players.length}/${r.options.maxPlayers}`).join('\n')||'Nenhuma sala.'};
  if(cmd==='/fecharsala'){const code=args.toUpperCase();const room=rooms.get(code);if(!room)return {ok:false,message:'Sala não encontrada.'};io.to(`room:${code}`).emit('room:closed',{message:'Sala fechada pelo CEO.'});rooms.delete(code);io.emit('rooms:update');await logAdmin(me.id,cmd,args);return {ok:true,message:'Sala fechada.'};}
  const targetName=parts[0];let target=null;if(targetName){if(usePostgres){const r=await pool.query('SELECT * FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1',[targetName]);target=r.rows[0]||null;}else{target=localDb().users.find(u=>u.username.toLowerCase()===targetName.toLowerCase())||null;}}
  if(['/kick','/ban','/mute','/unban','/unmute','/darcoins','/darxp','/removecoins'].includes(cmd)&&!target)return {ok:false,message:'Usuário não encontrado.'};
  if(cmd==='/kick'){for(const [sid,u] of socketUsers)if(u.userId===target.id)io.to(sid).emit('admin:kick',{message:'Você foi removido pelo CEO.'});const room=findPlayerRoom(target.id);if(room)removePlayer(room,target.id);await logAdmin(me.id,cmd,args);return {ok:true,message:`${target.username} removido.`};}
  if(cmd==='/ban'||cmd==='/mute'){const mins=Math.min(43200,Math.max(1,Number(parts[1])||60));const reason=cleanText(parts.slice(2).join(' ')||'Moderação CEO.',255);if(usePostgres)await pool.query('INSERT INTO moderation_actions(actor_id,target_id,action,reason,expires_at) VALUES($1,$2,$3,$4,CURRENT_TIMESTAMP + ($5 || \' minutes\')::interval)',[me.id,target.id,cmd==='/ban'?'ban':'mute',reason,mins]);if(cmd==='/ban'){for(const [sid,u] of socketUsers)if(u.userId===target.id)io.to(sid).emit('admin:kick',{message:'Sua conta foi suspensa.'});}await logAdmin(me.id,cmd,args);return {ok:true,message:`${target.username} ${cmd==='/ban'?'banido':'silenciado'} por ${mins} minutos.`};}
  if(cmd==='/unban'||cmd==='/unmute'){if(usePostgres)await pool.query("UPDATE moderation_actions SET expires_at=CURRENT_TIMESTAMP WHERE target_id=$1 AND action=$2 AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)",[target.id,cmd==='/unban'?'ban':'mute']);await logAdmin(me.id,cmd,args);return {ok:true,message:'Punição encerrada.'};}
  if(cmd==='/darcoins'||cmd==='/darxp'||cmd==='/removecoins'){const qty=Math.floor(Number(parts[1]));if(!Number.isFinite(qty)||qty<=0)return {ok:false,message:'Quantidade inválida.'};const delta=cmd==='/darxp'?qty:-qty;const coinDelta=cmd==='/darcoins'?qty:cmd==='/removecoins'?-qty:0;await addEconomy(target.id,coinDelta,delta);await logAdmin(me.id,cmd,args);return {ok:true,message:'Economia atualizada.'};}
  if(cmd==='/criar'&&parts[0]?.toLowerCase()==='staff'){const name=cleanText(parts[1],24);if(!validUsername(name))return {ok:false,message:'Usuário inválido.'};const pass=crypto.randomBytes(9).toString('base64url');const hash=await bcrypt.hash(pass,12);if(usePostgres){const r=await pool.query("INSERT INTO users(username,password_hash,role,coins,xp,level) VALUES($1,$2,'staff',5000,5000,10) RETURNING username",[name,hash]);return {ok:true,message:`Staff ${r.rows[0].username} criado. Senha temporária: ${pass}`};}return {ok:false,message:'Criação de staff requer PostgreSQL.'};}
  return {ok:false,message:'Comando desconhecido. Use /help.'};
}catch(e){console.error('admin',e);return {ok:false,message:'Falha no comando administrativo.'};}}

app.use((req,res,next)=>{if(req.path.startsWith('/api/')&&!res.headersSent&&req.method==='GET'&&req.path==='/api/unknown')return res.status(404).json({success:false});next();});

server.listen(PORT,'0.0.0.0',()=>{
  console.log(`🚀 UnoVelho Matematixa ativo na porta ${PORT}`);
  databaseReadyPromise=(async()=>{
    try{
      await initDatabase();
      globalState=await getGlobalState();
      databaseReady=true;
      console.log('✅ Banco de dados pronto para as requisições.');
    }catch(err){
      databaseReadyError=err;
      console.error('❌ Falha ao finalizar inicialização do banco:',err.message);
    }
  })();
});
process.on('SIGTERM',async()=>{try{await pool?.end()}finally{process.exit(0)}});
const CEO_NAME='ceovelho';function requireCEO(req,res,next){if(String(req.user?.username||'').trim().toLowerCase()!==CEO_NAME)return res.status(403).json({success:false,message:'Acesso exclusivo da conta CeoVelho.'});next()}
app.post('/api/ceo/freeze',auth,requireCEO,async(req,res)=>{
  const message=cleanText(req.body.message||'JOGO EM MANUTENÇÃO.',500);
  await setMaintenanceState(true,message,req.user.id);
  res.json({success:true,message:'Modo manutenção ativado.'});
});
app.post('/api/ceo/unfreeze',auth,requireCEO,async(req,res)=>{
  await setMaintenanceState(false,'',req.user.id);
  res.json({success:true,message:'Modo manutenção desativado.'});
});
app.post('/api/ceo/message',auth,requireCEO,async(req,res)=>{
  const message=cleanText(req.body.message,500); if(!message)return res.status(400).json({success:false,message:'Mensagem vazia.'});
  io.emit('chat:message',{channel:'world',senderId:req.user.id,senderName:'👑 CEO',body:message,createdAt:new Date().toISOString()});
  if(usePostgres) await pool.query("INSERT INTO chat_messages(channel,sender_id,sender_name,body) VALUES('world',$1,$2,$3)",[req.user.id,'👑 CEO',message]);
  res.json({success:true,message:'Mensagem enviada para todos.'});
});
app.get('/api/ceo/users',auth,requireCEO,async(req,res)=>{try{const r=await pool.query('SELECT id,username,role,level,xp,coins,last_login_at FROM users ORDER BY last_login_at DESC NULLS LAST LIMIT 200');res.json({success:true,users:r.rows})}catch(e){res.status(500).json({success:false,message:'Não foi possível carregar jogadores.'})}});
app.post('/api/ceo/reset-xp',auth,requireCEO,async(req,res)=>{try{const id=Number(req.body.userId);await pool.query("UPDATE users SET xp=0,level=1 WHERE id=$1 AND LOWER(username)<>$2",[id,CEO_NAME]);res.json({success:true,message:'XP zerado.'})}catch(e){res.status(500).json({message:'Erro ao zerar XP.'})}});
app.post('/api/ceo/reset-coins',auth,requireCEO,async(req,res)=>{try{const id=Number(req.body.userId);if(!id)return res.status(400).json({success:false,message:'ID inválido.'});await pool.query("UPDATE users SET coins=0 WHERE id=$1 AND LOWER(username)<>$2",[id,CEO_NAME]);res.json({success:true,message:'Moedas zeradas.'})}catch(e){res.status(500).json({message:'Erro ao zerar moedas.'})}});
app.post('/api/ceo/clear-inventory',auth,requireCEO,async(req,res)=>{try{const id=Number(req.body.userId);if(!id)return res.status(400).json({success:false,message:'ID inválido.'});await pool.query("DELETE FROM user_inventory WHERE user_id=$1 AND user_id<>(SELECT id FROM users WHERE LOWER(username)=LOWER($2))",[id,CEO_NAME]);res.json({success:true,message:'Inventário limpo.'})}catch(e){res.status(500).json({message:'Erro ao limpar inventário.'})}});
app.post('/api/ceo/chat-unblock',auth,requireCEO,async(req,res)=>{
  const id=Number(req.body.userId); if(!id)return res.status(400).json({success:false,message:'ID inválido.'});
  await pool.query("UPDATE users SET chat_blocked_until=NULL WHERE id=$1 AND LOWER(username)<>$2",[id,CEO_NAME]);
  res.json({success:true,message:'Chat desbloqueado.'});
});
app.post('/api/ceo/chat-block',auth,requireCEO,async(req,res)=>{try{const id=Number(req.body.userId),mins=Math.max(1,Math.min(10080,Number(req.body.minutes)||60));await pool.query("UPDATE users SET chat_blocked_until=NOW()+($2||' minutes')::interval WHERE id=$1 AND LOWER(username)<>$3",[id,mins,CEO_NAME]);res.json({success:true,message:'Chat bloqueado.'})}catch(e){res.status(500).json({message:'Erro ao bloquear chat.'})}});
app.post('/api/ceo/reset-podium',auth,requireCEO,async(req,res)=>{try{await pool.query('UPDATE users SET wins=0,losses=0,games_played=0 WHERE LOWER(username)<>$1',[CEO_NAME]);res.json({success:true,message:'Pódio resetado.'})}catch(e){res.status(500).json({message:'Erro ao resetar pódio.'})}});
app.post('/api/ceo/clear-logins',auth,requireCEO,async(req,res)=>{try{await pool.query('DELETE FROM login_logs');res.json({success:true,message:'Histórico de logins limpo.'})}catch(e){res.status(500).json({message:'Erro ao limpar logins.'})}});

