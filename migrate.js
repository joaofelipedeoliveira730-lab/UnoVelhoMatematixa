require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL ausente.');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2,
  connectionTimeoutMillis: 15000,
  statement_timeout: 30000,
  query_timeout: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

pool.on('error', err => console.error('❌ PostgreSQL pool:', err.message));

(async()=>{
  try {
    const schema = fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8');
    const seed = fs.readFileSync(path.join(__dirname,'seed.sql'),'utf8');
    await pool.query(schema);
    await pool.query(seed);
    console.log('✅ schema.sql + seed.sql aplicados com migrações de compatibilidade.');
  } catch (e) {
    console.error('❌ Falha na migração:', e.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
