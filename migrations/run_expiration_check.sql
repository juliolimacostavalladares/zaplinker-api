-- Aplicar migration de verificação de expiração
\i migrations/add_check_expired_subscriptions.sql

-- Executar verificação imediata de assinaturas expiradas
SELECT check_expired_subscriptions();

-- Verificar usuários que foram atualizados
SELECT 
  id, 
  email, 
  subscription_status, 
  subscription_expires_at,
  updated_at
FROM users
WHERE subscription_status = 'expired'
ORDER BY updated_at DESC;
