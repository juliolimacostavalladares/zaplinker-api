import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authMiddleware } from '../middleware/auth';
import { AuthRequest } from '../types';

const router = Router();

/**
 * GET /api/analytics/summary
 * Retorna resumo geral de analytics do usuário
 */
router.get('/summary', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    // Buscar todos os links do usuário
    const links = await prisma.link.findMany({
      where: { userId },
      include: {
        agents: {
          where: { isActive: true },
        },
      },
    });

    // Calcular métricas
    const totalLinks = links.length;
    const totalClicks = links.reduce((acc, link) => acc + link.clicks, 0);
    const activeAgents = links.reduce((acc, link) => acc + link.agents.length, 0);

    // Buscar limites do plano
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        subscriptionPlan: {
          select: {
            maxLinks: true,
            maxClicksPerMonth: true,
          },
        },
      },
    });

    const maxLinks = user?.subscriptionPlan?.maxLinks || 1;
    const maxClicksPerMonth = user?.subscriptionPlan?.maxClicksPerMonth || 100;

    // Calcular cliques do mês atual
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const linksThisMonth = await prisma.link.findMany({
      where: {
        userId,
        createdAt: {
          gte: firstDayOfMonth,
        },
      },
    });

    const currentMonthClicks = linksThisMonth.reduce((acc, link) => acc + link.clicks, 0);

    res.json({
      totalLinks,
      totalClicks,
      activeAgents,
      currentMonthClicks,
      maxLinks,
      maxClicksPerMonth,
    });
  } catch (error: any) {
    console.error('Erro ao buscar analytics summary:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/clicks-by-period?period=7d|30d|90d
 * Retorna cliques agrupados por dia no período especificado
 */
router.get('/clicks-by-period', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const period = req.query.period as string || '7d';

    // Calcular data inicial baseada no período
    const now = new Date();
    let startDate = new Date();

    switch (period) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }

    // Buscar links criados no período
    const links = await prisma.link.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        clicks: true,
        createdAt: true,
      },
    });

    // Agrupar cliques por dia
    const clicksByDay = new Map<string, number>();

    // Inicializar todos os dias do período com 0
    for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      clicksByDay.set(dateKey, 0);
    }

    // Somar cliques (distribuídos uniformemente desde a criação)
    links.forEach(link => {
      const linkDate = link.createdAt.toISOString().split('T')[0];
      const current = clicksByDay.get(linkDate) || 0;
      clicksByDay.set(linkDate, current + link.clicks);
    });

    // Converter para array ordenado
    const data = Array.from(clicksByDay.entries())
      .map(([date, clicks]) => ({
        date,
        clicks,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const total = data.reduce((acc, item) => acc + item.clicks, 0);

    res.json({
      data,
      total,
      period,
    });
  } catch (error: any) {
    console.error('Erro ao buscar clicks by period:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/analytics/links-stats
 * Retorna estatísticas detalhadas de cada link
 */
router.get('/links-stats', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const links = await prisma.link.findMany({
      where: { userId },
      include: {
        agents: {
          where: { isActive: true },
        },
      },
      orderBy: { clicks: 'desc' },
    });

    const stats = links.map(link => ({
      id: link.id,
      name: link.name,
      slug: link.slug,
      clicks: link.clicks,
      agents: link.agents.length,
      createdAt: link.createdAt,
    }));

    res.json(stats);
  } catch (error: any) {
    console.error('Erro ao buscar links stats:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
