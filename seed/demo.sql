-- QueryGate demo schema for Neon / Postgres
-- Run in Neon SQL Editor, then connect via QueryGate and ask: "What was MRR last month?"

CREATE TABLE IF NOT EXISTS plans (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_amount NUMERIC(10, 2) NOT NULL,
  billing_interval TEXT NOT NULL DEFAULT 'month' CHECK (billing_interval IN ('month', 'year'))
);

CREATE TABLE IF NOT EXISTS customers (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  phone TEXT,
  full_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  plan_id INT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL DEFAULT 'active',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  canceled_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_metrics (
  id SERIAL PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(id),
  metric_date DATE NOT NULL,
  api_calls INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  customer_id INT REFERENCES customers(id),
  actor_email TEXT,
  event_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO plans (name, monthly_amount, billing_interval) VALUES
  ('Starter', 29.00, 'month'),
  ('Pro', 99.00, 'month'),
  ('Enterprise', 999.00, 'year')
ON CONFLICT DO NOTHING;

INSERT INTO customers (email, phone, full_name, status, created_at) VALUES
  ('alice@acme.com', '+1-555-0101', 'Alice Acme', 'active', NOW() - INTERVAL '120 days'),
  ('bob@beta.io', '+1-555-0102', 'Bob Beta', 'active', NOW() - INTERVAL '45 days'),
  ('carol@corp.com', '+1-555-0103', 'Carol Corp', 'active', NOW() - INTERVAL '10 days')
ON CONFLICT DO NOTHING;

INSERT INTO subscriptions (customer_id, plan_id, status, started_at)
SELECT c.id, p.id, 'active', NOW() - INTERVAL '30 days'
FROM customers c
CROSS JOIN plans p
WHERE c.email = 'alice@acme.com' AND p.name = 'Pro'
ON CONFLICT DO NOTHING;

INSERT INTO subscriptions (customer_id, plan_id, status, started_at)
SELECT c.id, p.id, 'active', NOW() - INTERVAL '20 days'
FROM customers c
CROSS JOIN plans p
WHERE c.email = 'bob@beta.io' AND p.name = 'Starter'
ON CONFLICT DO NOTHING;

INSERT INTO subscriptions (customer_id, plan_id, status, started_at)
SELECT c.id, p.id, 'active', NOW() - INTERVAL '5 days'
FROM customers c
CROSS JOIN plans p
WHERE c.email = 'carol@corp.com' AND p.name = 'Enterprise'
ON CONFLICT DO NOTHING;

-- Example MRR query (active subscriptions, normalize yearly to monthly):
-- SELECT SUM(
--   CASE WHEN p.billing_interval = 'year' THEN p.monthly_amount / 12 ELSE p.monthly_amount END
-- ) AS mrr
-- FROM subscriptions s
-- JOIN plans p ON p.id = s.plan_id
-- WHERE s.status = 'active';
