import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthRequest } from '../types';
import { authMiddleware } from '../auth';

const router = Router();
const getSupabase = () => createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Listar planos disponíveis
router.get('/plans', async (req, res: Response) => {
  const supabase = getSupabase();
  const { data: plans, error } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('price');

  if (error) return res.status(500).json({ error: error.message });
  res.json(plans);
});

// Verificar limites do usuário
router.get('/limits', authMiddleware, async (req: AuthRequest, res: Response) => {
  const supabase = getSupabase();
  const { data: limits, error } = await supabase
    .rpc('check_user_limits', { user_uuid: req.user!.id });

  if (error) return res.status(500).json({ error: error.message });
  res.json(limits[0]);
});

export default router;