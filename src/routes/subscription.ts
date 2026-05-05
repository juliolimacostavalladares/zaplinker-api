import { Router, Response } from 'express';
import { AuthRequest } from '../types';
import { authMiddleware } from '../middleware/auth';
import { sanitizeError, logError } from '../utils/errorHandler';
import { prisma } from '../lib/prisma';

const router = Router();

// Listar planos disponíveis
router.get('/plans', async (req, res: Response) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' }
    });

    res.json(plans);
  } catch (error: any) {
    logError(error, 'Get Plans');
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Verificar limites do usuário
router.get('/limits', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        subscriptionPlan: true,
        links: {
          select: {
            id: true,
            clicks: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const totalLinks = user.links.length;
    const totalClicks = user.links.reduce((sum, link) => sum + link.clicks, 0);
    const maxLinks = user.subscriptionPlan?.maxLinks || 1;
    const maxClicks = user.subscriptionPlan?.maxClicksPerMonth || 100;

    res.json({
      totalLinks,
      maxLinks,
      totalClicks,
      maxClicks,
      canCreateMoreLinks: totalLinks < maxLinks
    });
  } catch (error: any) {
    logError(error, 'Get Limits');
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;