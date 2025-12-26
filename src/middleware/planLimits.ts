import { Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthRequest } from '../types';

export const checkAttendantLimits = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    
    const { linkId } = req.params;
    const { agents } = req.body;
    
    if (!agents || agents.length === 0) return next();
    
    // Buscar plano do usuário
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('subscription_plans(features)')
      .eq('id', req.user!.id)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const maxAttendants = user.subscription_plans?.features?.max_attendants || 1;
    
    if (agents.length > maxAttendants) {
      return res.status(403).json({ 
        error: `Limite de atendentes atingido. Seu plano permite até ${maxAttendants} atendente(s)`,
        current: agents.length,
        limit: maxAttendants
      });
    }

    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};

export const checkPlanLimits = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );
    
    // Buscar dados do usuário e plano
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('subscription_plan_id, subscription_plans(*)')
      .eq('id', req.user!.id)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Contar links existentes
    const { count: linkCount, error: countError } = await supabase
      .from('links')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user!.id);

    if (countError) throw countError;

    const plan = user.subscription_plans as { max_links: number; features: any } | null;
    
    // Se não houver plano, usar limite padrão
    if (!plan) {
      return res.status(403).json({ 
        error: 'Plano não encontrado. Configure um plano de assinatura.',
        current: linkCount,
        limit: 0
      });
    }
    
    // Verificar limite de links
    if (linkCount! >= plan.max_links) {
      return res.status(403).json({ 
        error: 'Limite de links atingido',
        current: linkCount,
        limit: plan.max_links
      });
    }

    // Verificar limite de atendentes se estiver criando um link com atendentes
    if (req.body.agents && req.body.agents.length > 0) {
      const maxAttendants = plan.features?.max_attendants || 1;
      if (req.body.agents.length > maxAttendants) {
        return res.status(403).json({ 
          error: `Limite de atendentes atingido. Seu plano permite até ${maxAttendants} atendente(s)`,
          current: req.body.agents.length,
          limit: maxAttendants
        });
      }
    }

    next();
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
};