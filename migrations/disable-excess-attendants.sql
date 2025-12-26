-- Função para desabilitar atendentes em excesso quando o plano é alterado
-- E processar cancelamentos de plano com aplicação imediata de limitações
CREATE OR REPLACE FUNCTION disable_excess_attendants()
RETURNS TRIGGER AS $$
DECLARE
    max_attendants_allowed INTEGER;
    max_links_allowed INTEGER;
    user_links RECORD;
    attendant_count INTEGER;
    excess_attendants INTEGER;
    link_count INTEGER;
    excess_links INTEGER;
    free_plan_id UUID;
BEGIN
    -- Verificar se é um cancelamento de plano
    IF NEW.subscription_status = 'cancelled' OR 
       (OLD.subscription_plan_id IS DISTINCT FROM NEW.subscription_plan_id AND 
        EXISTS(SELECT 1 FROM subscription_plans WHERE id = NEW.subscription_plan_id AND name = 'Gratuito')) THEN
        
        -- Buscar o plano gratuito
        SELECT id INTO free_plan_id
        FROM subscription_plans 
        WHERE name = 'Gratuito'
        LIMIT 1;
        
        -- Garantir que o usuário está no plano gratuito
        IF free_plan_id IS NOT NULL AND NEW.subscription_plan_id != free_plan_id THEN
            NEW.subscription_plan_id := free_plan_id;
        END IF;
        
        -- Definir status como cancelado e limpar dados de assinatura
        NEW.subscription_status := 'cancelled';
        NEW.subscription_expires_at := NULL;
        NEW.updated_at := NOW();
    END IF;
    
    -- Buscar os limites do plano atual
    SELECT 
        COALESCE((features->>'max_attendants')::INTEGER, 1),
        max_links
    INTO max_attendants_allowed, max_links_allowed
    FROM subscription_plans 
    WHERE id = NEW.subscription_plan_id;
    
    -- Se não conseguir obter os limites, usar valores padrão do plano gratuito
    IF max_attendants_allowed IS NULL THEN
        max_attendants_allowed := 1;
    END IF;
    IF max_links_allowed IS NULL THEN
        max_links_allowed := 3;
    END IF;
    
    -- Verificar e limitar links ativos
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
        END IF;
    END LOOP;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Adicionar coluna is_active na tabela agents se não existir
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Criar trigger para executar a função quando o plano do usuário for alterado
DROP TRIGGER IF EXISTS trigger_disable_excess_attendants ON users;
CREATE TRIGGER trigger_disable_excess_attendants
    AFTER UPDATE OF subscription_plan_id ON users
    FOR EACH ROW
    WHEN (OLD.subscription_plan_id IS DISTINCT FROM NEW.subscription_plan_id)
    EXECUTE FUNCTION disable_excess_attendants();