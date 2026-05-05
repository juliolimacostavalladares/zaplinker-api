import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../lib/prisma';

export const checkAttendantLimits = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { linkId } = req.params;
    const { agents } = req.body;

    if (!agents || agents.length === 0) return next();

    // Buscar plano do usuário
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        subscriptionPlan: {
          select: { features: true }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    const maxAttendants = (user.subscriptionPlan?.features as any)?.max_attendants || 1;

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
    // Buscar dados do usuário e plano
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: {
        subscriptionPlan: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    // Contar links existentes
    const linkCount = await prisma.link.count({
      where: { userId: req.user!.id }
    });

    const plan = user.subscriptionPlan;

    // Se não houver plano, usar limite padrão
    if (!plan) {
      return res.status(403).json({
        error: 'Plano não encontrado. Configure um plano de assinatura.',
        current: linkCount,
        limit: 0
      });
    }

    // Verificar limite de links
    if (linkCount >= plan.maxLinks) {
      return res.status(403).json({
        error: 'Limite de links atingido',
        current: linkCount,
        limit: plan.maxLinks
      });
    }

    // Verificar limite de atendentes se estiver criando um link com atendentes
    if (req.body.agents && req.body.agents.length > 0) {
      const maxAttendants = (plan.features as any)?.max_attendants || 1;
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