require("dotenv").config();
const express=require("express");
const http=require("http");
const cors=require("cors");
const bcrypt=require("bcryptjs");
const jwt=require("jsonwebtoken");
const {Pool}=require("pg");
const {Server}=require("socket.io");

const app=express();
const server=http.createServer(app);
const io=new Server(server,{cors:{origin:process.env.FRONTEND_ORIGIN||"*",methods:["GET","POST"]}});
const pool=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},max:5});
const JWT_SECRET=process.env.JWT_SECRET;
if(!JWT_SECRET) throw new Error("JWT_SECRET ausente");

app.use(cors({origin:process.env.FRONTEND_ORIGIN||"*"}));
app.use(express.json());
app.get("/health",async(_,res)=>{try{await pool.query("select 1");res.json({ok:true})}catch(e){res.status(500).json({ok:false})}});

function sign(user){return jwt.sign({id:user.id,username:user.username,display_name:user.display_name,is_admin:user.is_admin},JWT_SECRET,{expiresIn:"7d"})}
function auth(req,res,next){try{req.user=jwt.verify((req.headers.authorization||"").replace(/^Bearer /,""),JWT_SECRET);next()}catch{res.status(401).json({error:"Não autenticado"})}}
function cleanCode(){return Math.random().toString(36).slice(2,8).toUpperCase()}
const rooms=new Map();

const COLORS=["red","green","blue","yellow"];
function makeDeck(){let d=[];for(const color of COLORS){d.push({color,value:"0"});for(let n=1;n<=9;n++)d.push({color,value:String(n)},{color,value:String(n)});for(let i=0;i<2;i++)d.push({color,value:"skip"},{color,value:"reverse"},{color,value:"draw2"})}for(let i=0;i<4;i++)d.push({color:"wild",value:"wild"},{color:"wild",value:"draw4"});return shuffle(d)}
function shuffle(a){for(let i=a.length-1;i;i--){let j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function cardPoints(c){if(["skip","reverse","draw2"].includes(c.value))return 20;if(["wild","draw4"].includes(c.value))return 50;return Number(c.value)||0}
function draw(room,p,n=1){for(let i=0;i<n;i++){if(!room.deck.length){let top=room.discard.pop();room.deck=shuffle(room.discard);room.discard=[top]}p.hand.push(room.deck.pop())}}
function valid(room,c){let t=room.discard.at(-1);return c.color==="wild"||c.color===room.color||c.color===t.color||c.value===t.value}
function next(room,n=1){room.turn=(room.turn+room.direction*n+room.players.length*10)%room.players.length}
function state(room,userId){let current=room.players[room.turn];return {id:room.id,code:room.code,status:room.status,paused:room.paused,is_host:room.host_id===userId,is_admin:!!room.admin_ids?.includes(userId),current_player_id:current?.id,current_player_name:current?.display_name,current_user_id:current?.id===userId?userId:current?.id,top_card:room.discard.at(-1),my_hand:room.players.find(p=>p.id===userId)?.hand||[],players:room.players.map(p=>({id:p.id,display_name:p.display_name,is_host:p.id===room.host_id,is_admin:!!p.is_admin,cards_count:p.hand.length,score:p.score}))}}
async function broadcast(room){for(const p of room.players)io.to(`room:${room.id}`).emit("room_state",state(room,p.id));await saveGame(room)}
async function saveGame(room){await pool.query(`insert into games(room_id,state,status,updated_at) values($1,$2,$3,now()) on conflict(room_id) do update set state=excluded.state,status=excluded.status,updated_at=now()`,[room.id,JSON.stringify({players:room.players,deck:room.deck,discard:room.discard,turn:room.turn,direction:room.direction,color:room.color,paused:room.paused}),room.status])}

app.post("/api/auth/register",async(req,res)=>{try{let {username,display_name,password}=req.body;if(!username||!display_name||!password||password.length<6)return res.status(400).json({error:"Preencha usuário, nome e senha de 6+ caracteres."});let hash=await bcrypt.hash(password,12);let q=await pool.query(`insert into profiles(username,display_name,password_hash) values($1,$2,$3) returning id,username,display_name,is_admin`,[username,display_name,hash]);res.json({token:sign(q.rows[0]),user:q.rows[0]})}catch(e){res.status(400).json({error:e.code==="23505"?"Usuário já existe.":"Não foi possível cadastrar."})}});
app.post("/api/auth/login",async(req,res)=>{try{let q=await pool.query(`select id,username,display_name,password_hash,is_admin from profiles where lower(username)=lower($1)`,[req.body.username]);let u=q.rows[0];if(!u||!(await bcrypt.compare(req.body.password||"",u.password_hash)))return res.status(401).json({error:"Usuário ou senha incorretos."});let {password_hash,...user}=u;res.json({token:sign(user),user})}catch(e){res.status(500).json({error:"Erro no login."})}});
app.get("/api/ranking",async(_,res)=>{let q=await pool.query(`select display_name,wins,points from profiles order by points desc,wins desc,display_name asc limit 100`);res.json({ranking:q.rows})});

io.use((socket,nextAuth)=>{try{socket.user=jwt.verify(socket.handshake.auth?.token||"",JWT_SECRET);nextAuth()}catch{nextAuth(new Error("Não autenticado"))}});

io.on("connection",socket=>{
socket.on("create_room",async({max_players,password,chat_enabled,swap_enabled})=>{try{max_players=Math.max(2,Math.min(10,Number(max_players)||5));let code=cleanCode();while([...rooms.values()].some(r=>r.code===code))code=cleanCode();let q=await pool.query(`insert into rooms(code,host_id,password_hash,max_players,chat_enabled,swap_enabled,status) values($1,$2,$3,$4,$5,$6,'waiting') returning id`,[code,socket.user.id,password?await bcrypt.hash(password,10):null,max_players,!!chat_enabled,!!swap_enabled]);let room={id:q.rows[0].id,code,host_id:socket.user.id,max_players,chat_enabled:!!chat_enabled,swap_enabled:!!swap_enabled,status:"waiting",paused:false,players:[{id:socket.user.id,display_name:socket.user.display_name,is_admin:socket.user.is_admin,score:0,hand:[]}],deck:[],discard:[],turn:0,direction:1,color:"red",admin_ids:[]};rooms.set(room.id,room);socket.join(`room:${room.id}`);await broadcast(room)}catch(e){socket.emit("error_message","Não foi possível criar a sala.")}});
socket.on("join_room",async({code,password})=>{try{let q=await pool.query(`select * from rooms where code=$1 and status='waiting'`,[String(code||"").toUpperCase()]);let db=q.rows[0];if(!db)return socket.emit("error_message","Sala não encontrada.");if(db.password_hash&&!(await bcrypt.compare(password||"",db.password_hash)))return socket.emit("error_message","Senha da sala incorreta.");let room=rooms.get(db.id);if(!room){room={id:db.id,code:db.code,host_id:db.host_id,max_players:db.max_players,chat_enabled:db.chat_enabled,swap_enabled:db.swap_enabled,status:db.status,paused:false,players:[],deck:[],discard:[],turn:0,direction:1,color:"red",admin_ids:[]};let ps=await pool.query(`select p.id,p.display_name,p.is_admin from room_players rp join profiles p on p.id=rp.user_id where rp.room_id=$1`,[db.id]);room.players=ps.rows.map(p=>({...p,score:0,hand:[]}));rooms.set(db.id,room)}if(room.players.length>=room.max_players)return socket.emit("error_message","Sala cheia.");if(!room.players.some(p=>p.id===socket.user.id))room.players.push({id:socket.user.id,display_name:socket.user.display_name,is_admin:socket.user.is_admin,score:0,hand:[]});await pool.query(`insert into room_players(room_id,user_id) values($1,$2) on conflict do nothing`,[room.id,socket.user.id]);socket.join(`room:${room.id}`);await broadcast(room)}catch(e){socket.emit("error_message","Não foi possível entrar.")}});
socket.on("start_game",async({room_id})=>{let room=rooms.get(room_id);if(!room||room.host_id!==socket.user.id||room.players.length<2)return;if(room.status!=="waiting")return;room.deck=makeDeck();room.discard=[room.deck.pop()];while(room.discard[0].color==="wild"){room.deck.unshift(room.discard.pop());room.discard=[room.deck.pop()]};room.color=room.discard[0].color;room.turn=0;room.direction=1;room.status="playing";for(const p of room.players){p.hand=[];p.score=0;draw(room,p,7)}await pool.query(`update rooms set status='playing' where id=$1`,[room.id]);broadcast(room)});
socket.on("play_card",async({room_id,index,color})=>{let room=rooms.get(room_id),p=room?.players.find(x=>x.id===socket.user.id);if(!room||!p||room.paused||room.status!=="playing"||room.players[room.turn].id!==p.id)return;let c=p.hand[index];if(!c||!valid(room,c))return;if(c.color==="wild"&&!["red","green","blue","yellow"].includes(color))return; p.hand.splice(index,1);room.discard.push(c);room.color=c.color==="wild"?color:c.color;if(!p.hand.length){room.status="finished";p.score+=room.players.filter(x=>x!==p).reduce((a,x)=>a+x.hand.reduce((s,c)=>s+cardPoints(c),0),0);await pool.query(`update profiles set wins=wins+1,points=points+$1 where id=$2`,[p.score,p.id]);await pool.query(`update rooms set status='finished' where id=$1`,[room.id]);return broadcast(room)}if(c.value==="skip")next(room,2);else if(c.value==="reverse"){room.direction*=-1;next(room,room.players.length===2?2:1)}else if(c.value==="draw2"){next(room);draw(room,room.players[room.turn],2);next(room)}else if(c.value==="draw4"){next(room);draw(room,room.players[room.turn],4);next(room)}else next(room);broadcast(room)});
socket.on("draw_card",async({room_id})=>{let room=rooms.get(room_id),p=room?.players.find(x=>x.id===socket.user.id);if(!room||!p||room.paused||room.status!=="playing"||room.players[room.turn].id!==p.id)return;draw(room,p);next(room);broadcast(room)});
socket.on("say_uno",()=>{});
socket.on("toggle_pause",async({room_id})=>{let room=rooms.get(room_id);if(!room||!room.admin_ids?.includes(socket.user.id))return;room.paused=!room.paused;broadcast(room)});
socket.on("chat",async({room_id,message})=>{let room=rooms.get(room_id),text=String(message||"").trim().slice(0,300);if(!room||!room.chat_enabled||!text)return;let q=await pool.query(`insert into messages(room_id,user_id,message) values($1,$2,$3) returning created_at`,[room.id,socket.user.id,text]);io.to(`room:${room.id}`).emit("chat_message",{display_name:socket.user.display_name,message:text,created_at:q.rows[0].created_at})});
socket.on("leave_room",async()=>{for(const room of rooms.values()){let i=room.players.findIndex(p=>p.id===socket.user.id);if(i>=0){room.players.splice(i,1);await pool.query(`delete from room_players where room_id=$1 and user_id=$2`,[room.id,socket.user.id]);if(!room.players.length){rooms.delete(room.id);await pool.query(`delete from rooms where id=$1`,[room.id])}else{if(room.host_id===socket.user.id)room.host_id=room.players[0].id;broadcast(room)}break}}});
});

server.listen(process.env.PORT||3000,()=>console.log("velhoUNO backend online na porta",process.env.PORT||3000));