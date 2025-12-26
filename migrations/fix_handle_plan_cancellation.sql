-- Corrigir função handle_plan_cancellation
-- Esta função está causando erro porque tenta usar created_at que não existe em agents

CREATE OR REPLACE FUNCTION handle_plan_cancellation()
RETURNS TRIGGER AS $func$
DECLARE
  new_max_links integer;
  new_max_attendants integer;
  excess_links integer;
  excess_attendants integer;
  user_links RECORD;
BEGIN
  -- Buscar limites do novo plano
  SELECT max_links, (features->>'max_attendants')::integer
  INTO new_max_links, new_max_attendants
  FROM subscription_plans
  WHERE id = NEW.subscription_plan_id;

  -- Se não houver limites definidos, não fazer nada
  IF new_max_links IS NULL THEN
    RETURN NEW;
  END IF;

  -- Calcular excesso de links
  SELECT COUNT(*) - new_max_links INTO excess_links
  FROM links
  WHERE user_id = NEW.id AND is_active = true;

  -- Se houver excesso de links, desativar os mais antigos
  IF excess_links > 0 THEN
    UPDATE links
    SET is_active = false
    WHERE user_id = NEW.id
      AND is_active = true
      AND id IN (
        SELECT id FROM links
        WHERE user_id = NEW.id AND is_active = true
        ORDER BY id DESC
        LIMIT excess_links
      );
  END IF;

  -- Se houver limite de atendentes, aplicar
  IF new_max_attendants IS NOT NULL THEN
    FOR user_links IN
      SELECT id FROM links WHERE user_id = NEW.id AND is_active = true
    LOOP
      -- Calcular excesso de atendentes para este link
      SELECT COUNT(*) - new_max_attendants INTO excess_attendants
      FROM agents
      WHERE link_id = user_links.id AND is_active = true;

      -- Se houver excesso, desativar os mais antigos
      IF excess_attendants > 0 THEN
        UPDATE agents
        SET is_active = false
        WHERE link_id = user_links.id
          AND is_active = true
          AND id IN (
            SELECT id FROM agents
            WHERE link_id = user_links.id AND is_active = true
            ORDER BY id DESC
            LIMIT excess_attendants
          );
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$func$ LANGUAGE plpgsql;
