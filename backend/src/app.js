import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { pool } from './db.js';
import { parseOrders } from './csv.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret';
const app = express();
app.use(cors(), express.json());
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const wrap = (fn) => (req, res) => fn(req, res).catch((e) => { console.error(e); res.status(500).json({ error: 'Something went wrong' }); });
const auth = (req, res, next) => {
  try { req.uid = jwt.verify((req.headers.authorization || '').slice(7), SECRET).uid; next(); }
  catch { res.status(401).json({ error: 'Sign in required' }); }
};
const token = (uid) => jwt.sign({ uid }, SECRET, { expiresIn: '7d' });

app.get('/health', (_, res) => res.json({ ok: true }));

app.post('/api/auth/register', wrap(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password || password.length < 8) return res.status(400).json({ error: 'Email and a password of 8+ characters are required' });
  try {
    const { rows } = await pool.query('INSERT INTO users(email, password_hash) VALUES ($1,$2) RETURNING id', [email, await bcrypt.hash(password, 10)]);
    res.status(201).json({ token: token(rows[0].id) });
  } catch (e) { res.status(e.code === '23505' ? 409 : 500).json({ error: e.code === '23505' ? 'Email already registered' : 'Something went wrong' }); }
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email = $1', [req.body.email]);
  if (!rows[0] || !(await bcrypt.compare(req.body.password || '', rows[0].password_hash))) return res.status(401).json({ error: 'Wrong email or password' });
  res.json({ token: token(rows[0].id) });
}));

// ETL: validate CSV, then bulk insert in one statement
app.post('/api/upload', auth, upload.single('file'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Attach a CSV file in the "file" field' });
  let parsed;
  try { parsed = parseOrders(req.file.buffer); } catch { return res.status(400).json({ error: 'Could not read this CSV' }); }
  const { good, errors } = parsed;
  if (good.length) await pool.query(
    `INSERT INTO orders(user_id, customer_id, order_date, category, amount)
     SELECT $1, * FROM unnest($2::text[], $3::date[], $4::text[], $5::numeric[])`,
    [req.uid, good.map((r) => r.customer_id), good.map((r) => r.order_date), good.map((r) => r.category), good.map((r) => r.amount)]);
  res.json({ inserted: good.length, rejectedLines: errors });
}));

const SUMMARY_SQL = `
  SELECT to_char(date_trunc('month', order_date), 'YYYY-MM') AS month, category, SUM(amount)::float AS revenue, COUNT(*)::int AS orders
  FROM orders WHERE user_id = $1 GROUP BY 1, 2 ORDER BY 1, 2`;

app.get('/api/summary', auth, wrap(async (req, res) => {
  const { rows } = await pool.query(SUMMARY_SQL, [req.uid]);
  res.json(rows);
}));

// RFM segmentation with NTILE window functions
app.get('/api/rfm', auth, wrap(async (req, res) => {
  const { rows } = await pool.query(`
    WITH base AS (
      SELECT customer_id, CURRENT_DATE - MAX(order_date) AS recency, COUNT(*)::int AS frequency, SUM(amount)::float AS monetary
      FROM orders WHERE user_id = $1 GROUP BY customer_id),
    scored AS (
      SELECT *, NTILE(4) OVER (ORDER BY recency DESC) AS r, NTILE(4) OVER (ORDER BY frequency) AS f, NTILE(4) OVER (ORDER BY monetary) AS m FROM base)
    SELECT customer_id, recency, frequency, monetary, r + f + m AS score,
      CASE WHEN r + f + m >= 10 THEN 'Champion' WHEN r + f + m >= 7 THEN 'Loyal' WHEN r <= 1 THEN 'At risk' ELSE 'Regular' END AS segment
    FROM scored ORDER BY monetary DESC LIMIT 100`, [req.uid]);
  res.json(rows);
}));

// GenAI: answer questions about the user's data with a local Llama3 (Ollama)
app.post('/api/insights', auth, wrap(async (req, res) => {
  const question = String(req.body.question || '').slice(0, 300);
  if (!question) return res.status(400).json({ error: 'Ask a question' });
  const { rows } = await pool.query(SUMMARY_SQL, [req.uid]);
  const prompt = `You are a data analyst. Monthly revenue by category: ${JSON.stringify(rows)}\nQuestion: ${question}\nAnswer in at most 3 sentences using only this data.`;
  try {
    const r = await fetch(`${process.env.OLLAMA_URL || 'http://localhost:11434'}/api/generate`, {
      method: 'POST', body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'llama3', prompt, stream: false }), signal: AbortSignal.timeout(60000) });
    res.json({ answer: (await r.json()).response });
  } catch { res.status(503).json({ error: 'The AI model is not reachable. Start Ollama or set OLLAMA_URL.' }); }
}));

export default app;
