import jwt from 'jsonwebtoken';
import { Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthRequest, User } from './types';

const getSupabase = () => createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export const authMiddleware = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabase();
    const token = req.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token de acesso requerido' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    // Verificar se a assinatura expirou
    if (user.subscription_expires_at && new Date(user.subscription_expires_at) < new Date() && user.subscription_status === 'active') {
      const { data: freePlan } = await supabase
        .from('subscription_plans')
        .select('id')
        .eq('name', 'Gratuito')
        .single();
      
      if (freePlan) {
        await supabase
          .from('users')
          .update({
            subscription_plan_id: freePlan.id,
            subscription_status: 'expired',
            subscription_expires_at: null
          })
          .eq('id', user.id);
        
        // Atualizar objeto user
        user.subscription_plan_id = freePlan.id;
        user.subscription_status = 'expired';
        user.subscription_expires_at = null;
      }
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido' });
  }
};