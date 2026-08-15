require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized:false }, max:2 });
(async()=>{try{const sql=fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');await pool.query(sql);const seed=fs.readFileSync(path.join(__dirname,'seed.sql'),'utf8');await pool.query(seed);console.log('✅ schema.sql + seed.sql aplicados sem apagar contas.')}catch(e){console.error('❌ Falha:',e.message);process.exitCode=1;}finally{await pool.end();}})();
