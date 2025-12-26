-- Atualizar plano Básico
UPDATE subscription_plans 
SET 
  max_links = 5,
  max_clicks_per_month = 1000,
  features = '{"analytics": true, "custom_domain": false, "qr_code": false, "max_attendants": 1, "ai_gemini": false}'::jsonb
WHERE name = 'Básico';

-- Atualizar plano Pro
UPDATE subscription_plans 
SET 
  max_links = 999999,
  max_clicks_per_month = 999999,
  features = '{"analytics": true, "custom_domain": true, "qr_code": true, "max_attendants": 10, "ai_gemini": true}'::jsonb
WHERE name = 'pro';

-- Inserir plano Pro se não existir
INSERT INTO subscription_plans (name, price, max_links, max_clicks_per_month, features)
SELECT 'pro', 49.00, 999999, 999999, '{"analytics": true, "custom_domain": true, "qr_code": true, "max_attendants": 10, "ai_gemini": true}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'pro');