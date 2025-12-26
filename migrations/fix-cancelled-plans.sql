-- Script para corrigir problemas de cancelamento de plano
-- Execute este script para aplicar as correções

-- 1. Executar a função de tratamento de cancelamento
\i handle-plan-cancellation.sql

-- 2. Garantir que existe um plano gratuito
INSERT INTO subscription_plans (name, price, max_links, max_clicks_per_month, features) 
SELECT 'Gratuito', 0.00, 3, 100, '{"support": "community", "analytics": false, "max_attendants": 1}'
WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE name = 'Gratuito');

-- 3. Corrigir usuários com status cancelado que ainda estão em planos pagos
UPDATE users 
SET subscription_plan_id = (
  SELECT id FROM subscription_plans WHERE name = 'Gratuito' LIMIT 1
),
subscription_status = 'cancelled',
subscription_expires_at = NULL,
stripe_subscription_id = NULL,
updated_at = NOW()
WHERE subscription_status = 'cancelled' 
AND subscription_plan_id NOT IN (
  SELECT id FROM subscription_plans WHERE name = 'Gratuito'
);

-- 4. As limitações serão aplicadas automaticamente pelo trigger

-- 5. Verificar resultados
SELECT 
  u.id,
  u.email,
  u.subscription_status,
  sp.name as plan_name,
  sp.max_links,
  (SELECT COUNT(*) FROM links WHERE user_id = u.id) as total_links
FROM users u
JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
WHERE u.subscription_status = 'cancelled' OR sp.name = 'Gratuito'
ORDER BY u.email;