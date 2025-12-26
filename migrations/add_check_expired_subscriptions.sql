-- Função para verificar e atualizar assinaturas expiradas
CREATE OR REPLACE FUNCTION check_expired_subscriptions()
RETURNS void AS $$
DECLARE
  free_plan_id uuid;
BEGIN
  -- Buscar ID do plano gratuito
  SELECT id INTO free_plan_id
  FROM subscription_plans
  WHERE name = 'Gratuito'
  LIMIT 1;

  -- Atualizar usuários com assinaturas expiradas
  UPDATE users
  SET 
    subscription_plan_id = free_plan_id,
    subscription_status = 'expired',
    subscription_expires_at = NULL
  WHERE 
    subscription_expires_at IS NOT NULL
    AND subscription_expires_at < NOW()
    AND subscription_status = 'active';
END;
$$ LANGUAGE plpgsql;

-- Trigger para verificar expiração ao consultar usuário
CREATE OR REPLACE FUNCTION check_user_subscription_expiry()
RETURNS TRIGGER AS $$
DECLARE
  free_plan_id uuid;
BEGIN
  -- Se a assinatura expirou
  IF NEW.subscription_expires_at IS NOT NULL 
     AND NEW.subscription_expires_at < NOW() 
     AND NEW.subscription_status = 'active' THEN
    
    -- Buscar plano gratuito
    SELECT id INTO free_plan_id
    FROM subscription_plans
    WHERE name = 'Gratuito'
    LIMIT 1;
    
    -- Atualizar para plano gratuito
    NEW.subscription_plan_id := free_plan_id;
    NEW.subscription_status := 'expired';
    NEW.subscription_expires_at := NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger que executa antes de SELECT
DROP TRIGGER IF EXISTS trigger_check_subscription_expiry ON users;
CREATE TRIGGER trigger_check_subscription_expiry
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION check_user_subscription_expiry();
