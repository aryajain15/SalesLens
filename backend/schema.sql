CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL, order_date DATE NOT NULL, category TEXT NOT NULL, amount NUMERIC(12,2) NOT NULL CHECK (amount > 0));
CREATE INDEX IF NOT EXISTS idx_orders_user_date ON orders (user_id, order_date);
