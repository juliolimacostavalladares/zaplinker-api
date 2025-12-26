import { Router, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { AuthRequest } from '../types';
import { authMiddleware } from '../auth';

const router = Router();
const getSupabase = () => createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Obter dados do perfil do usuário
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const supabase = getSupabase();
    const { data: user, error } = await supabase
      .from('users')
      .select(`
        id, email, name, subscription_status, subscription_expires_at,
        subscription_plans (name, price, max_links, max_clicks_per_month)
      `)
      .eq('id', req.user!.id)
      .single();

    if (error) throw error;

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancelar assinatura (agora via Stripe)
router.post('/cancel-subscription', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const supabase = getSupabase();

    // Buscar dados do usuário
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('stripe_subscription_id')
      .eq('id', req.user!.id)
      .single();

    if (userError || !user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!user.stripe_subscription_id) {
      return res.status(400).json({ error: 'Nenhuma assinatura ativa encontrada' });
    }

    // Redirecionar para o endpoint de pagamentos para cancelar via Stripe
    return res.status(400).json({ 
      error: 'Use o endpoint /api/payments/cancel-subscription para cancelar via Stripe' 
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Excluir conta permanentemente
router.delete('/delete-account', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const supabase = getSupabase();

    // Buscar todos os links do usuário
    const { data: userLinks } = await supabase
      .from('links')
      .select('id')
      .eq('user_id', req.user!.id);

    if (userLinks && userLinks.length > 0) {
      const linkIds = userLinks.map(link => link.id);
      
      // Excluir dados relacionados aos links
      await supabase.from('bio_buttons').delete().in('link_id', linkIds);
      await supabase.from('agents').delete().in('link_id', linkIds);
    }
    
    // Excluir links do usuário
    await supabase.from('links').delete().eq('user_id', req.user!.id);
    
    // Excluir usuário
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', req.user!.id);

    if (error) throw error;

    res.json({ message: 'Conta excluída com sucesso' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;