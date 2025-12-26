-- Função para processar cancelamento de plano e aplicar limitações imediatas
CREATE OR REPLACE FUNCTION handle_plan_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    free_plan_id UUID;
    max_attendants_allowed INTEGER;
    user_links RECORD;
    attendant_count INTEGER;
    excess_attendants INTEGER;
    link_count INTEGER;
    max_links_allowed INTEGER;
    excess_links INTEGER;
BEGIN
    -- Verificar se o status mudou para 'cancelled' ou se o plano foi alterado para gratuito
    IF (NEW.subscription_status = 'cancelled' OR 
        (OLD.subscription_plan_id IS DISTINCT FROM NEW.subscription_plan_id AND 
         EXISTS(SELECT 1 FROM subscription_plans WHERE id = NEW.subscription_plan_id AND name = 'Gratuito'))) THEN
        
        -- Buscar o plano gratuito
        SELECT id INTO free_plan_id
        FROM subscription_plans 
        WHERE name = 'Gratuito'
        LIMIT 1;
        
        -- Se não encontrar plano gratuito, criar um
        IF free_plan_id IS NULL THEN
            INSERT INTO subscription_plans (name, price, max_links, max_clicks_per_month, features)
            VALUES ('Gratuito', 0.00, 3, 100, '{"support": "community", "analytics": false, "max_attendants": 1}')
            RETURNING id INTO free_plan_id;
        END IF;
        
        -- Garantir que o usuário está no plano gratuito
        IF NEW.subscription_plan_id != free_plan_id THEN
            NEW.subscription_plan_id := free_plan_id;
        END IF;
        
        -- Definir status como cancelado e limpar dados de assinatura
        NEW.subscription_status := 'cancelled';
        NEW.subscription_expires_at := NULL;
        NEW.updated_at := NOW();
        
        -- Buscar limites do plano gratuito
        SELECT 
            max_links,
            COALESCE((features->>'max_attendants')::INTEGER, 1)
        INTO max_links_allowed, max_attendants_allowed
        FROM subscription_plans 
        WHERE id = free_plan_id;
        
        -- Contar links atuais do usuário
        SELECT COUNT(*) INTO link_count
        FROM links 
        WHERE user_id = NEW.id AND is_active = true;
        
        -- Se exceder o limite de links, desabilitar os excedentes
        IF link_count > max_links_allowed THEN
            excess_links := link_count - max_links_allowed;
            
            -- Desabilitar os links mais recentes (mantém os mais antigos)
            UPDATE links 
            SET is_active = false, 
                updated_at = NOW()
            WHERE user_id = NEW.id 
            AND is_active = true
            AND id IN (
                SELECT id FROM links 
                WHERE user_id = NEW.id AND is_active = true
                ORDER BY created_at DESC 
                LIMIT excess_links
            );
            
            RAISE NOTICE 'Desabilitados % links em excesso para o usuário %', excess_links, NEW.id;
        END IF;
        
        -- Para cada link ativo do usuário, verificar e desabilitar atendentes em excesso
        FOR user_links IN 
            SELECT id FROM links WHERE user_id = NEW.id AND is_active = true
        LOOP
            -- Contar atendentes ativos do link
            SELECT COUNT(*) INTO attendant_count
            FROM agents 
            WHERE link_id = user_links.id AND is_active = true;
            
            -- Se exceder o limite, desabilitar os excedentes
            IF attendant_count > max_attendants_allowed THEN
                excess_attendants := attendant_count - max_attendants_allowed;
                
                -- Desabilitar os atendentes mais recentes (mantém os mais antigos)
                UPDATE agents 
                SET is_active = false, 
                    updated_at = NOW()
                WHERE link_id = user_links.id 
                AND is_active = true
                AND id IN (
                    SELECT id FROM agents 
                    WHERE link_id = user_links.id AND is_active = true
                    ORDER BY created_at DESC 
                    LIMIT excess_attendants
                );
                
                RAISE NOTICE 'Desabilitados % atendentes em excesso para o link %', excess_attendants, user_links.id;
            END IF;
        END LOOP;
        
        RAISE NOTICE 'Plano cancelado e limitações aplicadas para usuário %', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Adicionar colunas necessárias se não existirem
ALTER TABLE links ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE links ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Criar trigger para processar cancelamentos
DROP TRIGGER IF EXISTS trigger_handle_plan_cancellation ON users;
CREATE TRIGGER trigger_handle_plan_cancellation
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION handle_plan_cancellation();

-- Função para forçar aplicação de limitações em usuários existentes
CREATE OR REPLACE FUNCTION force_apply_plan_limits(target_user_id UUID DEFAULT NULL)
RETURNS TEXT AS $$
DECLARE
    user_record RECORD;
    result_text TEXT := '';
BEGIN
    -- Se um usuário específico foi fornecido, processar apenas ele
    IF target_user_id IS NOT NULL THEN
        SELECT * INTO user_record FROM users WHERE id = target_user_id;
        IF FOUND THEN
            -- Simular um update para disparar o trigger
            UPDATE users 
            SET updated_at = NOW() 
            WHERE id = target_user_id;
            result_text := 'Limitações aplicadas para usuário ' || target_user_id;
        ELSE
            result_text := 'Usuário não encontrado: ' || target_user_id;
        END IF;
    ELSE
        -- Processar todos os usuários com status cancelado ou plano gratuito
        FOR user_record IN 
            SELECT u.* FROM users u
            JOIN subscription_plans sp ON u.subscription_plan_id = sp.id
            WHERE u.subscription_status = 'cancelled' OR sp.name = 'Gratuito'
        LOOP
            -- Simular um update para disparar o trigger
            UPDATE users 
            SET updated_at = NOW() 
            WHERE id = user_record.id;
        END LOOP;
        result_text := 'Limitações aplicadas para todos os usuários com planos cancelados/gratuitos';
    END IF;
    
    RETURN result_text;
END;
$$ LANGUAGE plpgsql;