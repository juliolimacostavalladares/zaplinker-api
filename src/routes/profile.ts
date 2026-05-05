import { Router, Response } from 'express';
import { AuthRequest } from '../types';
import { authMiddleware } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

// Obter dados do perfil do usuário
router.get('/', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
        subscriptionPlan: {
          select: {
            name: true,
            price: true,
            maxLinks: true,
            maxClicksPerMonth: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Cancelar assinatura (agora via Stripe)
router.post('/cancel-subscription', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { stripeSubscriptionId: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (!user.stripeSubscriptionId) {
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
    // Buscar todos os links do usuário
    const userLinks = await prisma.link.findMany({
      where: { userId: req.user!.id },
      select: { id: true }
    });

    if (userLinks.length > 0) {
      const linkIds = userLinks.map(link => link.id);

      // Excluir dados relacionados aos links
      await prisma.bioButton.deleteMany({
        where: { linkId: { in: linkIds } }
      });
      await prisma.agent.deleteMany({
        where: { linkId: { in: linkIds } }
      });
    }

    // Excluir links do usuário
    await prisma.link.deleteMany({
      where: { userId: req.user!.id }
    });

    // Excluir usuário
    await prisma.user.delete({
      where: { id: req.user!.id }
    });

    res.json({ message: 'Conta excluída com sucesso' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;