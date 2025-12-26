-- Tabela de planos de assinatura
CREATE TABLE subscription_plans (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  max_links INTEGER NOT NULL,
  max_clicks_per_month INTEGER,
  features JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de usuários
CREATE TABLE users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  subscription_plan_id UUID REFERENCES subscription_plans(id),
  subscription_status VARCHAR(20) DEFAULT 'active',
  subscription_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Adicionar coluna user_id na tabela links
ALTER TABLE links ADD COLUMN user_id UUID REFERENCES users(id);

-- Inserir planos básicos
INSERT INTO subscription_plans (name, price, max_links, max_clicks_per_month, features) VALUES
('Gratuito', 0.00, 3, 100, '{"support": "community", "analytics": false}'),
('Pro', 29.90, 50, 5000, '{"support": "email", "analytics": true, "custom_domain": false}'),
('Premium', 59.90, 200, 20000, '{"support": "priority", "analytics": true, "custom_domain": true}');

-- Função para verificar limites do usuário
CREATE OR REPLACE FUNCTION check_user_limits(user_uuid UUID)
RETURNS TABLE(
  current_links INTEGER,
  max_links INTEGER,
  current_month_clicks INTEGER,
  max_clicks_per_month INTEGER,
  can_create_link BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    (SELECT COUNT(*)::INTEGER FROM links WHERE user_id = user_uuid),
    sp.max_links,
    (SELECT COALESCE(SUM(clicks), 0)::INTEGER 
     FROM links 
     WHERE user_id = user_uuid 
     AND created_at >= date_trunc('month', CURRENT_DATE)),
    sp.max_clicks_per_month,
    (SELECT COUNT(*) FROM links WHERE user_id = user_uuid) < sp.max_links AS can_create_link
  FROM users u
  JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
  WHERE u.id = user_uuid;
END;
$$ LANGUAGE plpgsql;