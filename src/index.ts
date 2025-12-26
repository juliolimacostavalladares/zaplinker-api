import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import subscriptionRoutes from './routes/subscription';
import profileRoutes from './routes/profile';
import paymentsRoutes from './routes/payments';
import { authMiddleware } from './auth';
import { checkPlanLimits } from './middleware/planLimits';
import { AuthRequest } from './types';

dotenv.config();

const app = express();

// Helmet para segurança
app.use(helmet());

// CORS restritivo
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Muitas tentativas, tente novamente em 15 minutos'
});

// Middleware especial para webhook do Stripe (precisa do raw body)
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

// Middleware padrão para outras rotas
app.use(express.json());

// Rotas
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/payments', paymentsRoutes);

// --- API CRUD ---

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

// Listar links do usuário
app.get('/api/links', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { data, error } = await supabase
    .from('links')
    .select('*, agents!inner(*, is_active), bio_buttons(*)')
    .eq('user_id', req.user!.id)
    .eq('agents.is_active', true)
    .order('created_at', { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Criar novo link
app.post('/api/links', authMiddleware, checkPlanLimits, async (req: AuthRequest, res: Response) => {
  try {
    const { 
      name, 
      slug, 
      type, 
      agents, 
      defaultMessage, 
      bioTitle, 
      bioDescription, 
      bioAvatarUrl, 
      bioButtons 
    } = req.body;

    // Bloquear criação de Link-in-Bio (feature em desenvolvimento)
    if (type === 'bio') {
      return res.status(403).json({ error: 'Link-in-Bio estará disponível em breve' });
    }

    // 1. Inserir na tabela 'links'
    const { data: link, error: linkError } = await supabase
      .from('links')
      .insert([{ 
        name, 
        slug: slug || name.toLowerCase().replace(/\s+/g, '-'), 
        type, 
        default_message: defaultMessage,
        bio_title: bioTitle,
        bio_description: bioDescription,
        bio_avatar_url: bioAvatarUrl,
        current_agent_index: 0,
        clicks: 0,
        user_id: req.user!.id
      }])
      .select()
      .single();

    if (linkError) throw linkError;

    // 2. Inserir dependentes baseados no tipo
    if (type === 'direct' && agents?.length > 0) {
      const agentsData = agents.map((a: any) => ({
        link_id: link.id,
        name: a.name,
        phone: a.phone
      }));
      await supabase.from('agents').insert(agentsData);
    } 
    else if (type === 'bio' && bioButtons?.length > 0) {
      const buttonsData = bioButtons.map((b: any) => ({
        link_id: link.id,
        label: b.label,
        phone: b.phone,
        message: b.message
      }));
      await supabase.from('bio_buttons').insert(buttonsData);
    }

    res.status(201).json(link);
  } catch (error: any) {
    console.error("Erro ao criar link:", error);
    res.status(400).json({ error: error.message });
  }
});

// --- MOTOR DE REDIRECIONAMENTO (ROUND ROBIN) ---

app.get('/r/:slug', async (req: Request, res: Response) => {
  const { slug } = req.params;

  // Busca o link e seus atendentes ativos
  const { data: link, error } = await supabase
    .from('links')
    .select('*, agents!inner(*)')
    .eq('slug', slug)
    .eq('agents.is_active', true)
    .single();

  if (error || !link) return res.status(404).send('Link não encontrado');

  // Incrementar cliques
  await supabase.rpc('increment_clicks', { link_id: link.id });

  if (link.type === 'direct') {
    const agents = link.agents;
    if (!agents || agents.length === 0) return res.status(400).send('Nenhum atendente ativo configurado');

    // Lógica Round Robin: Seleciona o atendente baseado no índice atual
    const agentIndex = link.current_agent_index % agents.length;
    const selectedAgent = agents[agentIndex];

    // Atualiza o índice para o próximo clique
    await supabase
      .from('links')
      .update({ current_agent_index: agentIndex + 1 })
      .eq('id', link.id);

    const waUrl = `https://wa.me/${selectedAgent.phone}?text=${encodeURIComponent(link.default_message || '')}`;
    return res.redirect(waUrl);
  } 
  
  // Se for Bio, redireciona para a página de preview do front-end
  return res.redirect(`${process.env.FRONTEND_URL}/bio/${slug}`);
});

// Reativar atendentes desabilitados (quando faz upgrade)
app.post('/api/links/:linkId/reactivate-agents', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { linkId } = req.params;
    
    // Verificar se o link pertence ao usuário
    const { data: link, error: linkError } = await supabase
      .from('links')
      .select('id')
      .eq('id', linkId)
      .eq('user_id', req.user!.id)
      .single();
    
    if (linkError || !link) {
      return res.status(404).json({ error: 'Link não encontrado' });
    }
    
    // Buscar limite de atendentes do plano atual
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('subscription_plans(features)')
      .eq('id', req.user!.id)
      .single();
    
    if (userError || !user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }
    
    const maxAttendants = user.subscription_plans?.features?.max_attendants || 1;
    
    // Contar atendentes ativos
    const { count: activeCount } = await supabase
      .from('agents')
      .select('*', { count: 'exact', head: true })
      .eq('link_id', linkId)
      .eq('is_active', true);
    
    const availableSlots = maxAttendants - (activeCount || 0);
    
    if (availableSlots > 0) {
      // Reativar atendentes desabilitados até o limite
      const { error: updateError } = await supabase
        .from('agents')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('link_id', linkId)
        .eq('is_active', false)
        .limit(availableSlots);
      
      if (updateError) throw updateError;
    }
    
    res.json({ message: 'Atendentes reativados com sucesso', reactivated: availableSlots });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Back-end ZapLinker rodando na porta ${PORT}`));