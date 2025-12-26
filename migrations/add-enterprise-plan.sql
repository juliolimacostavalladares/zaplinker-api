-- Adicionar plano Enterprise
INSERT INTO subscription_plans (name, price, max_links, max_clicks_per_month, features)
VALUES (
  'enterprise',
  99.00,
  10000,
  100000,
  '{"analytics": true, "custom_domain": true, "priority_support": true, "white_label": true}'::jsonb
);