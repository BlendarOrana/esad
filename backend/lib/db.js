import pkg from 'pg';
const { Pool } = pkg;
import dotenv from 'dotenv';

dotenv.config();

export const promisePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 40,
});

export const connectDB = async () => {
  try {
    const res = await promisePool.query('SELECT NOW()');
    console.log('✅ PostgreSQL connected. Time:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Error connecting to PostgreSQL:', err.message);
  }
};