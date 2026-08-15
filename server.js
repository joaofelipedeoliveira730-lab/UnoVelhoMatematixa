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
app.use(express.urlencoded({ extended: false, limit: '50kb' }));
app.use(express.static(path.join(__dirname)));

let pool = null;
let usePostgres = false;
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
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 8, idleTimeoutMillis: 30000 });
  try {
    await pool.query('SELECT 1');
    const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schema);
    const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    await pool.query(seed);
    usePostgres = true;
    await ensureCeo();
    console.log('✅ PostgreSQL conectado e schema aplicado.');
  } catch (err) {
    console.error('❌ PostgreSQL indisponível:', err.message);
    try { await pool.end(); } catch {}
    pool = null;
    usePostgres = false;
    localDb();
  }
}

async function ensureCeo() {
  if (!pool) return;
  const found = await pool.query("SELECT id, username, role FROM users WHERE LOWER(username)='ceovelho' LIMIT 1");
  if (found.rows.length) {
    if (found.rows[0].role !== 'CEO') await pool.query("UPDATE users SET role='CEO' WHERE id=$1", [found.rows[0].id]);
    return;
  }
  const initial = process.env.CEO_INITIAL_PASSWORD;
  if (!initial) {
    console.warn('⚠️ CeoVelho não existe. Defina CEO_INITIAL_PASSWORD uma única vez para criar a conta CEO.');
    return;
  }
  const hash = await bcrypt.hash(initial, 12);
  await pool.query("INSERT INTO users(username,password_hash,role,coins,xp,level) VALUES('CeoVelho',$1,'CEO',999999999,9999999,100)", [hash]);
  console.log('👑 Conta CeoVelho criada com CEO_INITIAL_PASSWORD.');
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
function xpForLevel(level) { return Math.floor(100 * Math.pow(level - 1, 1.45)); }
function levelForXp(xp) { let level=1; while(level<100 && xp >= xpForLevel(level+1)) level++; return level; }
function publicUser(u) { return { id:u.id, username:u.username, role:u.role, coins:Number(u.coins||0), xp:Number(u.xp||0), level:Number(u.level||1), wins:Number(u.wins||0), losses:Number(u.losses||0), gamesPlayed:Number(u.games_played||0) }; }
function defaultAvatar() { return { skinColor:'#d59b76', eyes:'#1d2433', hair:'hair_basic', hairColor:'#171717', top:'shirt_basic', bottom:'pants_basic', shoes:'shoes_basic', accessory:null, effect:null, emote:'emote_wave', title:'title_beginner' }; }
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
  const avatar={...defaultAvatar(),...(profile.avatar||{})}; const settings={...defaultSettings(),...(profile.settings||{})}; const bio=cleanText(profile.bio,180);
  if (usePostgres) { await pool.query(`INSERT INTO profiles(user_id,avatar,settings,bio) VALUES($1,$2,$3,$4) ON CONFLICT(user_id) DO UPDATE SET avatar=EXCLUDED.avatar,settings=EXCLUDED.settings,bio=EXCLUDED.bio,updated_at=CURRENT_TIMESTAMP`,[userId,JSON.stringify(avatar),JSON.stringify(settings),bio]); }
  else { const db=localDb(); db.profiles[userId]={avatar,settings,bio,updatedAt:new Date().toISOString()}; saveLocalDb(db); }
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
  if(usePostgres) { await pool.query(`INSERT INTO user_inventory(user_id,item_id) VALUES($1,$2) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+1`,[userId,itemId]); return true; }
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

app.get('/api/health',(req,res)=>res.json({ok:true,postgres:usePostgres,rooms:rooms.size,paused:globalState.paused}));
app.get('/api/me',auth,async(req,res)=>{const profile=await getProfile(req.user.id);res.json({success:true,user:publicUser(req.user),profile});});
app.post('/api/logout',(req,res)=>{clearAuthCookie(res);res.json({success:true});});

app.post('/api/register',async(req,res)=>{
  const username=cleanText(req.body.username,24); const password=String(req.body.password||'');
  if(!validUsername(username)||password.length<6||password.length>100) return res.status(400).json({success:false,message:'Usuário deve ter 3-24 caracteres (letras, números ou _), e a senha deve ter 6-100 caracteres.'});
  if(!rateLimit(loginAttempts,req.ip,60000,8)) return res.status(429).json({success:false,message:'Muitas tentativas. Aguarde um minuto.'});
  try {
    const hash=await bcrypt.hash(password,12); let user;
    if(usePostgres){const exists=await pool.query('SELECT id FROM users WHERE LOWER(username)=LOWER($1)',[username]);if(exists.rows.length)return res.status(409).json({success:false,message:'Usuário já existe.'});const r=await pool.query(`INSERT INTO users(username,password_hash,role,coins,xp,level,games_played) VALUES($1,$2,'user',500,0,1,0) RETURNING *`,[username,hash]);user=r.rows[0];}
    else {const db=localDb();if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({success:false,message:'Usuário já existe.'});user={id:(db.users.reduce((m,u)=>Math.max(m,u.id||0),0)+1),username,password_hash:hash,role:'user',coins:500,xp:0,level:1,wins:0,losses:0,games_played:0,created_at:new Date().toISOString()};db.users.push(user);saveLocalDb(db);}
    const token=signToken(user);setAuthCookie(res,token);
    let profile={avatar:defaultAvatar(),settings:defaultSettings(),bio:''};
    try{profile=await saveProfile(user.id,profile);}catch(profileErr){console.error('profile register:',profileErr.message);}
    for(const id of ['hair_basic','shirt_basic','pants_basic','shoes_basic','emote_wave','title_beginner','deck_classic','map_classroom']) if(usePostgres){try{await grantItem(user.id,id);}catch(itemErr){console.error('starter item:',itemErr.message);}}
    res.json({success:true,message:'Conta criada! Monte seu personagem para continuar.',token,user:publicUser(user),profile,needsCustomization:true});
  } catch(e){console.error(e);res.status(500).json({success:false,message:'Erro ao criar conta.'});}
});

app.post('/api/login',async(req,res)=>{
  const username=cleanText(req.body.username,24);const password=String(req.body.password||'');
  if(!username||!password)return res.status(400).json({success:false,message:'Informe usuário e senha.'});
  if(!rateLimit(loginAttempts,req.ip,60000,10))return res.status(429).json({success:false,message:'Muitas tentativas de login. Aguarde um minuto.'});
  try {let user=null;if(usePostgres){const r=await pool.query('SELECT * FROM users WHERE LOWER(username)=LOWER($1) LIMIT 1',[username]);user=r.rows[0]||null;}else{const db=localDb();user=db.users.find(u=>u.username.toLowerCase()===username.toLowerCase())||null;}if(!user||!(await bcrypt.compare(password,user.password_hash)))return res.status(401).json({success:false,message:'Usuário ou senha incorretos.'});
    const mod=await activeModeration(user.id);if(mod?.action==='ban')return res.status(403).json({success:false,message:'Conta suspensa.',ban:mod});
    if(usePostgres)await pool.query('UPDATE users SET last_login_at=CURRENT_TIMESTAMP WHERE id=$1',[user.id]);
    const token=signToken(user);setAuthCookie(res,token);
    for(const id of ['hair_basic','shirt_basic','pants_basic','shoes_basic','emote_wave','title_beginner','deck_classic','map_classroom']) if(usePostgres){try{await grantItem(user.id,id);}catch(itemErr){console.error('starter item login:',itemErr.message);}}
    let profile;try{profile=await getProfile(user.id);}catch(profileErr){console.error('profile login:',profileErr.message);profile={avatar:defaultAvatar(),settings:defaultSettings(),bio:''};}
    res.json({success:true,message:user.role==='CEO'?'Bem-vindo de volta, CEO!':'Login realizado com sucesso!',token,user:publicUser(user),profile,needsCustomization:!profile.avatar||Object.keys(profile.avatar).length===0});
  }catch(e){console.error(e);res.status(500).json({success:false,message:'Erro no login.'});}
});

app.put('/api/profile',auth,async(req,res)=>{try{const avatar=req.body.avatar||{};const allowed=['skinColor','eyes','hair','hairColor','top','bottom','shoes','accessory','effect','emote','title'];const cleanAvatar={};for(const k of allowed)cleanAvatar[k]=cleanText(avatar[k],80);const profile=await saveProfile(req.user.id,{avatar:cleanAvatar,settings:req.body.settings||{},bio:req.body.bio||''});res.json({success:true,profile});}catch(e){res.status(500).json({success:false,message:'Não foi possível salvar o personagem.'});}});
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
app.get('/api/items',async(req,res)=>res.json({success:true,items:await getItems()}));

app.get('/api/shop/market',auth,async(req,res)=>{if(!usePostgres)return res.json({success:true,listings:[]});const r=await pool.query(`SELECT m.listing_id,m.price,m.created_at,i.*,u.username seller FROM player_market m JOIN items i ON i.id=m.item_id JOIN users u ON u.id=m.seller_id WHERE m.status='active' ORDER BY m.created_at DESC LIMIT 100`);res.json({success:true,listings:r.rows});});
app.post('/api/shop/buy',auth,async(req,res)=>{
  const itemId=cleanText(req.body.itemId,80);if(!usePostgres)return res.status(503).json({success:false,message:'Loja online exige PostgreSQL.'});
  const client=await pool.connect();try{await client.query('BEGIN');const item=(await client.query('SELECT * FROM items WHERE id=$1 AND is_active=true FOR UPDATE',[itemId])).rows[0];if(!item)throw new Error('Item não encontrado.');if(item.asset?.ceoOnly&&req.user.role!=='CEO')throw new Error('Item exclusivo do CEO.');const own=await client.query('SELECT 1 FROM user_inventory WHERE user_id=$1 AND item_id=$2',[req.user.id,itemId]);if(own.rows.length)throw new Error('Você já possui este item.');const buyer=(await client.query('SELECT coins,xp FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];if(Number(buyer.xp)<Number(item.xp_required))throw new Error(`Você precisa de ${item.xp_required} XP.`);if(Number(buyer.coins)<Number(item.price))throw new Error('Moedas insuficientes.');await client.query('UPDATE users SET coins=coins-$1 WHERE id=$2',[item.price,req.user.id]);await client.query('INSERT INTO user_inventory(user_id,item_id) VALUES($1,$2)',[req.user.id,itemId]);await client.query('COMMIT');res.json({success:true,message:'Item desbloqueado!',item});}catch(e){await client.query('ROLLBACK');res.status(400).json({success:false,message:e.message});}finally{client.release();}
});
app.post('/api/shop/market/list',auth,async(req,res)=>{if(!usePostgres)return res.status(503).json({success:false,message:'Loja de jogadores exige PostgreSQL.'});const itemId=cleanText(req.body.itemId,80);const price=Math.floor(Number(req.body.price));if(!itemId||!Number.isFinite(price)||price<10||price>100000000)return res.status(400).json({success:false,message:'Preço inválido.'});const client=await pool.connect();try{await client.query('BEGIN');const own=(await client.query('SELECT quantity FROM user_inventory WHERE user_id=$1 AND item_id=$2 FOR UPDATE',[req.user.id,itemId])).rows[0];if(!own)throw new Error('Você não possui o item.');const active=await client.query("SELECT 1 FROM player_market WHERE seller_id=$1 AND item_id=$2 AND status='active'",[req.user.id,itemId]);if(active.rows.length)throw new Error('Esse item já está anunciado.');await client.query('DELETE FROM user_inventory WHERE user_id=$1 AND item_id=$2',[req.user.id,itemId]);const r=await client.query("INSERT INTO player_market(seller_id,item_id,price) VALUES($1,$2,$3) RETURNING *",[req.user.id,itemId,price]);await client.query('COMMIT');res.json({success:true,listing:r.rows[0]});}catch(e){await client.query('ROLLBACK');res.status(400).json({success:false,message:e.message});}finally{client.release();}});
app.post('/api/shop/market/cancel',auth,async(req,res)=>{if(!usePostgres)return res.status(503).json({success:false,message:'Loja de jogadores exige PostgreSQL.'});const listingId=Number(req.body.listingId);const client=await pool.connect();try{await client.query('BEGIN');const l=(await client.query("SELECT * FROM player_market WHERE listing_id=$1 AND seller_id=$2 AND status='active' FOR UPDATE",[listingId,req.user.id])).rows[0];if(!l)throw new Error('Anúncio não encontrado.');await client.query("UPDATE player_market SET status='cancelled' WHERE listing_id=$1",[listingId]);await client.query('INSERT INTO user_inventory(user_id,item_id) VALUES($1,$2) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+1',[req.user.id,l.item_id]);await client.query('COMMIT');res.json({success:true,message:'Anúncio cancelado e item devolvido.'});}catch(e){await client.query('ROLLBACK');res.status(400).json({success:false,message:e.message});}finally{client.release();}});
app.post('/api/shop/market/buy',auth,async(req,res)=>{if(!usePostgres)return res.status(503).json({success:false,message:'Loja de jogadores exige PostgreSQL.'});const listingId=Number(req.body.listingId);const client=await pool.connect();try{await client.query('BEGIN');const l=(await client.query("SELECT m.*,i.name,i.asset FROM player_market m JOIN items i ON i.id=m.item_id WHERE m.listing_id=$1 AND m.status='active' FOR UPDATE",[listingId])).rows[0];if(!l)throw new Error('Anúncio não encontrado.');if(l.seller_id===req.user.id)throw new Error('Você não pode comprar seu próprio anúncio.');const buyer=(await client.query('SELECT coins FROM users WHERE id=$1 FOR UPDATE',[req.user.id])).rows[0];if(Number(buyer.coins)<Number(l.price))throw new Error('Moedas insuficientes.');const seller=(await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[l.seller_id])).rows[0];if(!seller)throw new Error('Vendedor não encontrado.');await client.query('UPDATE users SET coins=coins-$1 WHERE id=$2',[l.price,req.user.id]);await client.query('UPDATE users SET coins=coins+$1 WHERE id=$2',[l.price,l.seller_id]);await client.query('DELETE FROM user_inventory WHERE user_id=$1 AND item_id=$2',[l.seller_id,l.item_id]);await client.query('INSERT INTO user_inventory(user_id,item_id) VALUES($1,$2) ON CONFLICT(user_id,item_id) DO UPDATE SET quantity=user_inventory.quantity+1',[req.user.id,l.item_id]);await client.query("UPDATE player_market SET status='sold',sold_at=CURRENT_TIMESTAMP WHERE listing_id=$1",[listingId]);await client.query('COMMIT');res.json({success:true,message:'Compra concluída!'});}catch(e){await client.query('ROLLBACK');res.status(400).json({success:false,message:e.message});}finally{client.release();}});

app.get('/api/rank',async(req,res)=>{if(!usePostgres)return res.json({success:true,players:[]});const r=await pool.query(`SELECT username,level,xp,wins,games_played FROM users WHERE role<>'banned' ORDER BY level DESC,xp DESC,wins DESC LIMIT 100`);res.json({success:true,players:r.rows});});
app.post('/api/report',auth,async(req,res)=>{if(!usePostgres)return res.json({success:true});const target=Number(req.body.targetId);const reason=cleanText(req.body.reason,255);if(!target||!reason)return res.status(400).json({success:false,message:'Denúncia incompleta.'});await pool.query('INSERT INTO reports(reporter_id,target_id,reason) VALUES($1,$2,$3)',[req.user.id,target,reason]);res.json({success:true,message:'Denúncia enviada.'});});

app.get('/api/rooms',auth,(req,res)=>{res.json({success:true,rooms:[...rooms.values()].filter(r=>!r.started&&!r.locked).map(roomSummary)});});
app.post('/api/rooms',auth,async(req,res)=>{if(globalState.paused)return res.status(423).json({success:false,message:globalState.message||'O jogo está paralisado.'});const options=normalizeRoomOptions(req.body);const code=makeRoomCode();const room={code,name:cleanText(req.body.name||`Sala de ${req.user.username}`,40),ownerId:req.user.id,ownerName:req.user.username,password:cleanText(req.body.password,40),options,players:[],started:false,locked:false,game:null,createdAt:Date.now()};room.players.push(makeRoomPlayer(req.user));rooms.set(code,room);res.json({success:true,room:roomSummary(room),roomCode:code});});
app.post('/api/rooms/:code/join',auth,async(req,res)=>{const room=rooms.get(req.params.code.toUpperCase());if(!room)return res.status(404).json({success:false,message:'Sala não encontrada.'});if(room.started)return res.status(409).json({success:false,message:'A partida já começou.'});if(room.players.length>=room.options.maxPlayers)return res.status(409).json({success:false,message:'Sala cheia.'});if(room.password&&room.password!==String(req.body.password||''))return res.status(403).json({success:false,message:'Senha incorreta.'});if(room.players.some(p=>p.userId===req.user.id))return res.json({success:true,room:roomSummary(room)});room.players.push(makeRoomPlayer(req.user));emitRoom(room);res.json({success:true,room:roomSummary(room)});});
app.post('/api/rooms/:code/leave',auth,(req,res)=>{const room=rooms.get(req.params.code.toUpperCase());if(!room)return res.json({success:true});removePlayer(room,req.user.id);res.json({success:true});});
app.post('/api/rooms/:code/start',auth,(req,res)=>{const room=rooms.get(req.params.code.toUpperCase());if(!room)return res.status(404).json({success:false,message:'Sala não encontrada.'});if(room.ownerId!==req.user.id)return res.status(403).json({success:false,message:'Somente o criador inicia a sala.'});if(room.players.length<2&&!room.options.allowBots)return res.status(400).json({success:false,message:'Adicione pelo menos 2 jogadores ou ative bots.'});if(globalState.paused)return res.status(423).json({success:false,message:globalState.message||'Jogo paralisado.'});while(room.players.length<room.options.maxPlayers&&room.options.allowBots&&room.players.length<room.options.botFill)room.players.push(makeBotPlayer(room.players.length));startRoomGame(room);res.json({success:true,room:roomSummary(room)});});

function normalizeRoomOptions(body){return {maxPlayers:Math.min(8,Math.max(2,Number(body.maxPlayers)||4)),turnSeconds:Math.min(120,Math.max(15,Number(body.turnSeconds)||45)),allowBots:body.allowBots!==false,botFill:Math.min(8,Math.max(2,Number(body.botFill)||4)),difficulty:['easy','medium','hard'].includes(body.difficulty)?body.difficulty:'medium',mapId:cleanText(body.mapId||'map_saloon',80),deckId:cleanText(body.deckId||'deck_classic',80),specials:body.specials!==false,math:true,chat:body.chat!==false,worldChat:body.worldChat!==false,privateChat:body.privateChat!==false,stackDraw:body.stackDraw===true,startingCards:Math.min(12,Math.max(5,Number(body.startingCards)||7))};}
function makeRoomCode(){let c;do{c='MATX-'+Math.random().toString(36).slice(2,6).toUpperCase();}while(rooms.has(c));return c;}
function makeRoomPlayer(user){return {userId:user.id,username:user.username,role:user.role,avatar:null,connected:true,hand:[],isBot:false};}
function makeBotPlayer(n){return {userId:`bot-${Date.now()}-${n}`,username:['Calculinho','Fibonacci','Ada','Newton','Gauss','Euler','Turing','Hipátia'][n%8],role:'bot',avatar:null,connected:true,hand:[],isBot:true};}
function roomSummary(room){return {code:room.code,name:room.name,ownerId:room.ownerId,ownerName:room.ownerName,locked:!!room.password,started:room.started,players:room.players.map(p=>({userId:p.userId,username:p.username,role:p.role,connected:p.connected,isBot:p.isBot,cardCount:p.hand?.length||0})),options:room.options,createdAt:room.createdAt};}
function emitRoom(room){io.to(`room:${room.code}`).emit('room:update',roomSummary(room));io.emit('rooms:update');}
function removePlayer(room,userId){const i=room.players.findIndex(p=>String(p.userId)===String(userId));if(i<0)return;if(room.started){room.players[i].connected=false;room.players[i].hand=[];io.to(`room:${room.code}`).emit('room:system',{message:`${room.players[i].username} saiu da partida.`});}else{room.players.splice(i,1);if(room.ownerId===userId&&room.players.length){room.ownerId=room.players[0].userId;room.ownerName=room.players[0].username;}if(!room.players.length)rooms.delete(room.code);else emitRoom(room);}}

const COLORS=['red','yellow','green','blue'];
function buildDeck(){const deck=[];for(const color of COLORS){for(let n=0;n<=9;n++)deck.push({id:crypto.randomUUID(),color,value:String(n),type:'number'});deck.push({id:crypto.randomUUID(),color,value:'🚫',type:'skip'});deck.push({id:crypto.randomUUID(),color,value:'🔄',type:'reverse'});deck.push({id:crypto.randomUUID(),color,value:'+2',type:'draw2'});}for(let i=0;i<4;i++){deck.push({id:crypto.randomUUID(),color:'black',value:'🌈',type:'wild'});deck.push({id:crypto.randomUUID(),color:'black',value:'+4',type:'draw4'});}for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}return deck;}
function playable(card,top,currentColor){return card.color==='black'||card.color===currentColor||card.value===top.value;}
function startRoomGame(room){room.started=true;room.locked=true;const deck=buildDeck();room.game={deck,discard:[],currentColor:null,currentIndex:0,direction:1,pendingDraw:0,startedAt:Date.now(),lastAction:Date.now(),winner:null,matchId:crypto.randomUUID(),challenges:new Map()};room.players.forEach(p=>p.hand=[]);for(let n=0;n<room.options.startingCards;n++)for(const p of room.players){if(deck.length)p.hand.push(deck.pop());}let top;do{top=deck.pop();}while(top&&top.color==='black');room.game.discard=[top];room.game.currentColor=top.color;emitGame(room);if(room.players[room.game.currentIndex]?.isBot)setTimeout(()=>botTurn(room),900);}
function safeGameFor(player,room){const g=room.game;return {code:room.code,players:room.players.map(p=>({userId:p.userId,username:p.username,role:p.role,connected:p.connected,isBot:p.isBot,cardCount:p.hand.length,avatar:p.avatar})),top:g.discard[g.discard.length-1],currentColor:g.currentColor,currentPlayerId:room.players[g.currentIndex]?.userId,direction:g.direction,pendingDraw:g.pendingDraw,deckCount:g.deck.length,hand:player?.hand||[],mapId:room.options.mapId,deckId:room.options.deckId,startedAt:g.startedAt,turnSeconds:room.options.turnSeconds,winner:g.winner};}
function emitGame(room){for(const p of room.players){if(p.isBot)continue;for(const [sid,u] of socketUsers){if(u.userId===p.userId)io.to(sid).emit('game:state',safeGameFor(p,room));}}}
function nextIndex(room,steps=1){const g=room.game;let i=g.currentIndex;for(let n=0;n<steps;n++){do{i=(i+g.direction+room.players.length)%room.players.length;}while(room.players[i]&&!room.players[i].connected&&n<room.players.length); }return i;}
function drawCards(room,player,count){for(let i=0;i<count;i++){if(!room.game.deck.length){const top=room.game.discard.pop();room.game.deck=room.game.discard.splice(0);room.game.discard=[top];for(let j=room.game.deck.length-1;j>0;j--){const k=Math.floor(Math.random()*(j+1));[room.game.deck[j],room.game.deck[k]]=[room.game.deck[k],room.game.deck[j]];}}if(room.game.deck.length)player.hand.push(room.game.deck.pop());}}
function applyCard(room,player,card,chosenColor){const g=room.game;g.discard.push(card);g.currentColor=card.color==='black'?(COLORS.includes(chosenColor)?chosenColor:COLORS[Math.floor(Math.random()*4)]):card.color;g.pendingDraw=0;if(card.type==='draw2')g.pendingDraw=2;if(card.type==='draw4')g.pendingDraw=4;if(card.type==='reverse'&&room.players.length>2)g.direction*=-1;let skip=card.type==='skip'||(card.type==='reverse'&&room.players.length===2);g.currentIndex=nextIndex(room,skip?2:1);}
function turnAllowed(room,userId){return !globalState.paused&&room.started&&room.players[room.game.currentIndex]?.userId===userId;}
function botTurn(room){if(!room.started||room.game.winner||globalState.paused)return;const p=room.players[room.game.currentIndex];if(!p?.isBot)return;let candidates=p.hand.filter(c=>playable(c,room.game.discard.at(-1),room.game.currentColor));if(room.game.pendingDraw>0&&!room.options.stackDraw)candidates=[];let card=candidates.sort((a,b)=>scoreCard(b)-scoreCard(a))[0];if(!card){drawCards(room,p,room.game.pendingDraw||1);room.game.pendingDraw=0;room.game.currentIndex=nextIndex(room,1);emitGame(room);setTimeout(()=>botTurn(room),800);return;}p.hand.splice(p.hand.indexOf(card),1);const color=card.color==='black'?chooseBotColor(p.hand):null;applyCard(room,p,card,color);checkRoomWinner(room,p);emitGame(room);if(!room.game.winner&&room.players[room.game.currentIndex]?.isBot)setTimeout(()=>botTurn(room),900);}
function scoreCard(c){return c.type==='draw4'?100:c.type==='draw2'?80:c.type==='wild'?70:c.type==='skip'?40:c.type==='reverse'?35:10;}
function chooseBotColor(hand){const counts={red:0,yellow:0,green:0,blue:0};hand.forEach(c=>{if(counts[c.color]!=null)counts[c.color]++;});return Object.entries(counts).sort((a,b)=>b[1]-a[1])[0][0];}
async function checkRoomWinner(room,player){if(player.hand.length!==0)return;room.game.winner=player.userId;room.started=false;room.locked=false;const realPlayers=room.players.filter(p=>!p.isBot);for(const p of realPlayers){const win=String(p.userId)===String(player.userId);await finishMatchPlayer(p,room,win);}emitGame(room);emitRoom(room);io.to(`room:${room.code}`).emit('game:winner',{username:player.username,userId:player.userId});}
async function finishMatchPlayer(p,room,win){if(!usePostgres||p.isBot)return;const coins=win?150:25;const xp=win?250:60;try{await pool.query('BEGIN');await pool.query(`UPDATE users SET coins=coins+$1,xp=xp+$2,level=LEAST(100,$3),wins=wins+$4,losses=losses+$5,games_played=games_played+1 WHERE id=$6`,[coins,xp,levelForXp(Number((await pool.query('SELECT xp FROM users WHERE id=$1',[p.userId])).rows[0]?.xp||0)+xp),win?1:0,win?0:1,p.userId]);await pool.query('COMMIT');}catch{try{await pool.query('ROLLBACK')}catch{}}}

async function getGlobalState(){if(!usePostgres)return {paused:false,message:''};const r=await pool.query('SELECT paused,message FROM global_game_state WHERE id=1');return r.rows[0]||{paused:false,message:''};}
let globalState={paused:false,message:''};

io.use(async(socket,next)=>{const token=socket.handshake.auth?.token||parseCookies({headers:socket.handshake.headers}).uv_session;const payload=token&&verifyToken(token);if(!payload)return next(new Error('unauthorized'));const user=await getUserById(payload.id);if(!user)return next(new Error('unauthorized'));const mod=await activeModeration(user.id);if(mod?.action==='ban')return next(new Error('banned'));socketUsers.set(socket.id,{userId:user.id,username:user.username,role:user.role});socket.user=user;next();});

io.on('connection',socket=>{
  const me=socket.user;
  socket.on('room:join',async({code,password}={})=>{const room=rooms.get(String(code||'').toUpperCase());if(!room)return socket.emit('toast',{type:'error',message:'Sala não encontrada.'});if(room.started)return socket.emit('toast',{type:'error',message:'Partida já iniciada.'});if(room.password&&room.password!==String(password||''))return socket.emit('toast',{type:'error',message:'Senha incorreta.'});if(room.players.length>=room.options.maxPlayers)return socket.emit('toast',{type:'error',message:'Sala cheia.'});if(!room.players.some(p=>p.userId===me.id))room.players.push(makeRoomPlayer(me));socket.join(`room:${room.code}`);emitRoom(room);socket.emit('room:joined',roomSummary(room));});
  socket.on('room:leave',()=>{for(const room of rooms.values())if(room.players.some(p=>p.userId===me.id)){socket.leave(`room:${room.code}`);removePlayer(room,me.id);}});
  socket.on('room:start',()=>{for(const room of rooms.values())if(room.ownerId===me.id&&room.players.some(p=>p.userId===me.id)){if(room.players.length<2)return socket.emit('toast',{type:'error',message:'Precisa de pelo menos 2 jogadores.'});if(globalState.paused)return socket.emit('toast',{type:'error',message:globalState.message});startRoomGame(room);emitRoom(room);return;}});
  socket.on('game:play',async({cardId,chosenColor,answer}={})=>{const room=findPlayerRoom(me.id);if(!room)return socket.emit('toast',{type:'error',message:'Você não está em uma sala.'});if(!turnAllowed(room,me.id))return socket.emit('toast',{type:'error',message:'Não é sua vez.'});const p=room.players.find(x=>x.userId===me.id);const index=p.hand.findIndex(c=>c.id===cardId||c._clientId===cardId);if(index<0)return socket.emit('toast',{type:'error',message:'Carta inválida.'});const card=p.hand[index];if(!playable(card,room.game.discard.at(-1),room.game.currentColor))return socket.emit('toast',{type:'error',message:'Carta não pode ser jogada.'});const key=`${me.id}:${card.id}`;const challenge=room.game.challenges?.get(key);if(!challenge)return socket.emit('toast',{type:'error',message:'Desafio expirado. Selecione a carta novamente.'});room.game.challenges.delete(key);if(Number(answer)!==challenge.answer)return socket.emit('math:result',{ok:false});p.hand.splice(index,1);applyCard(room,p,card,chosenColor);await checkRoomWinner(room,p);emitGame(room);if(room.started&&room.players[room.game.currentIndex]?.isBot)setTimeout(()=>botTurn(room),800);});
  socket.on('game:draw',()=>{const room=findPlayerRoom(me.id);if(!room||!turnAllowed(room,me.id))return;const p=room.players.find(x=>x.userId===me.id);drawCards(room,p,room.game.pendingDraw||1);room.game.pendingDraw=0;room.game.currentIndex=nextIndex(room,1);emitGame(room);if(room.started&&room.players[room.game.currentIndex]?.isBot)setTimeout(()=>botTurn(room),800);});
  socket.on('game:challenge',({cardId}={})=>{const room=findPlayerRoom(me.id);const p=room?.players.find(x=>x.userId===me.id);const card=p?.hand.find(c=>c.id===cardId||c._clientId===cardId);if(!room||!card)return;const c=mathChallenge(card);room.game.challenges=room.game.challenges||new Map();room.game.challenges.set(`${me.id}:${card.id}`,c);socket.emit('math:challenge',{a:c.a,b:c.b,op:c.op,cardId:card.id});});
  socket.on('chat:send',async({channel,body,roomCode,receiverId}={})=>{if(!rateLimit(chatRate,me.id,10000,12))return socket.emit('toast',{type:'error',message:'Você está enviando mensagens rápido demais.'});const text=cleanText(body,500);if(!text)return;const aiModeration=await geminiModerate(text);if(!aiModeration.allowed){if(usePostgres)await pool.query('INSERT INTO reports(reporter_id,target_id,reason,status) VALUES($1,$2,$3,$4)',[me.id,me.id,'Gemini bloqueou mensagem: '+cleanText(aiModeration.reason,220),'ai-block']);return socket.emit('toast',{type:'error',message:'Mensagem bloqueada pela moderação.'});}const mod=await activeModeration(me.id);if(mod?.action==='mute')return socket.emit('toast',{type:'error',message:'Você está silenciado.'});if(text.startsWith('/')&&me.role==='CEO'){const result=await executeAdminCommand(me,text);socket.emit('admin:result',result);return;}const ch=['world','room','private'].includes(channel)?channel:'world';let room=findPlayerRoom(me.id);if(ch==='room'&&(!room||room.code!==String(roomCode||room?.code).toUpperCase()))return;let targetSocket=null;if(ch==='private'){targetSocket=[...socketUsers.entries()].find(([,u])=>Number(u.userId)===Number(receiverId))?.[0];if(!targetSocket)return socket.emit('toast',{type:'error',message:'Jogador offline.'});}const msg={channel:ch,roomCode:room?.code||null,senderId:me.id,senderName:me.username,receiverId:receiverId||null,body:text,createdAt:new Date().toISOString()};if(usePostgres)await pool.query('INSERT INTO chat_messages(channel,room_code,sender_id,receiver_id,sender_name,body) VALUES($1,$2,$3,$4,$5,$6)',[ch,msg.roomCode,me.id,receiverId||null,me.username,text]);if(ch==='world')io.emit('chat:message',msg);else if(ch==='room')io.to(`room:${room.code}`).emit('chat:message',msg);else{socket.emit('chat:message',msg);if(targetSocket)io.to(targetSocket).emit('chat:message',msg);}});
  socket.on('disconnect',()=>{socketUsers.delete(socket.id);});
});
function findPlayerRoom(userId){for(const room of rooms.values())if(room.players.some(p=>String(p.userId)===String(userId)))return room;return null;}
function mathChallenge(card){let a,b,op;if(card.type==='draw4'){a=3+Math.floor(Math.random()*9);b=2+Math.floor(Math.random()*8);op='×';}else if(card.type==='draw2'){a=2+Math.floor(Math.random()*8);b=2+Math.floor(Math.random()*8);op='×';}else if(card.type==='skip'||card.type==='reverse'){a=15+Math.floor(Math.random()*30);b=1+Math.floor(Math.random()*Math.min(15,a-1));op='−';}else if(card.type==='wild'){a=10+Math.floor(Math.random()*20);b=1+Math.floor(Math.random()*10);op='+';}else{a=5+Math.floor(Math.random()*35);b=1+Math.floor(Math.random()*25);op='+';}return {a,b,op,answer:op==='×'?a*b:op==='−'?a-b:a+b};}

async function executeAdminCommand(me,text){const parts=text.trim().split(/\s+/);const cmd=parts.shift().toLowerCase();const args=parts.join(' ');if(me.role!=='CEO')return {ok:false,message:'Comando restrito.'};try{
  if(cmd==='/help')return {ok:true,message:['/help','/paralisaruno [mensagem]','/desparalisaruno','/anuncio [mensagem]','/kick [usuario]','/ban [usuario] [minutos] [motivo]','/unban [usuario]','/mute [usuario] [minutos]','/unmute [usuario]','/darcoins [usuario] [quantidade]','/darxp [usuario] [quantidade]','/removecoins [usuario] [quantidade]','/criar staff [usuario]','/bloqueiochat','/desbloqueiochat','/status','/salas','/fecharsala [codigo]','/evento [mensagem]'].join('\n')};
  if(cmd==='/paralisaruno'){globalState={paused:true,message:cleanText(args||'UNO Matematixa paralisado pelo CEO.',500)};if(usePostgres)await pool.query('UPDATE global_game_state SET paused=true,message=$1,updated_by=$2,updated_at=CURRENT_TIMESTAMP WHERE id=1',[globalState.message,me.id]);io.emit('global:pause',globalState);await logAdmin(me.id,cmd,args);return {ok:true,message:'Jogo paralisado.'};}
  if(cmd==='/desparalisaruno'){globalState={paused:false,message:''};if(usePostgres)await pool.query('UPDATE global_game_state SET paused=false,message=\'\',updated_by=$1,updated_at=CURRENT_TIMESTAMP WHERE id=1',[me.id]);io.emit('global:resume');await logAdmin(me.id,cmd,args);return {ok:true,message:'Jogo liberado.'};}
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

(async()=>{await initDatabase();globalState=await getGlobalState();server.listen(PORT,()=>console.log(`🚀 UnoVelho Matematixa ativo na porta ${PORT}`));})();
process.on('SIGTERM',async()=>{try{await pool?.end()}finally{process.exit(0)}});
