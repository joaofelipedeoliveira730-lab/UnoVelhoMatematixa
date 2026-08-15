require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL ausente.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 2
});

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(sql);
  console.log('Banco UnoVelho: schema.sql aplicado sem operações destrutivas.');
}

main()
  .catch((error) => {
    console.error('Falha na migração:', error.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
