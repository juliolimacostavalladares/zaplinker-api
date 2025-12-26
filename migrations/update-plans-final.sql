-- Atualizar planos conforme especificação

-- Plano Gratuito (Curioso)
UPDATE subscription_plans 
SET 
  max_links = 5,
  max_clicks_per_month = 500,
  features = '{
    "analytics": true, 
    "qr_code": false, 
    "max_attendants": 1, 
    "ai_gemini": false,
    "custom_domain": false
  }'::jsonb
WHERE name = 'Gratuito';

-- Plano Profissional
UPDATE subscription_plans 
SET 
  name = 'Profissional',
  price = 49.00,
  max_links = 999999,
  max_clicks_per_month = 999999,
  features = '{
    "analytics": true, 
    "qr_code": true, 
    "max_attendants": 10, 
    "ai_gemini": true,
    "custom_domain": false
  }'::jsonb
WHERE name = 'Pro' OR name = 'pro';

-- Inserir Plano Profissional se não existir
INSERT INTO subscription_plans (name, price, max_links, max_clicks_per_month, features)
SELECT 'Profissional', 49.00, 999999, 999999, '{
  "analytics": true, 
  "qr_code": true, 
  "max_attendants": 10, 
  "ai_gemini": true,
  "custom_domain": false
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Profissional');

-- Plano Big Boss
UPDATE subscription_plans 
SET 
  name = 'Big Boss',
  price = 149.00,
  max_links = 999999,
  max_clicks_per_month = 999999,
  features = '{
    "analytics": true, 
    "qr_code": true, 
    "max_attendants": 999999, 
    "ai_gemini": true,
    "custom_domain": true,
    "priority_support": true
  }'::jsonb
WHERE name = 'Premium';

-- Inserir Plano Big Boss se não existir
INSERT INTO subscription_plans (name, price, max_links, max_clicks_per_month, features)
SELECT 'Big Boss', 149.00, 999999, 999999, '{
  "analytics": true, 
  "qr_code": true, 
  "max_attendants": 999999, 
  "ai_gemini": true,
  "custom_domain": true,
  "priority_support": true
}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Big Boss');

-- Remover planos antigos que não são mais usados
DELETE FROM subscription_plans WHERE name NOT IN ('Gratuito', 'Profissional', 'Big Boss');
