import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../lib/prisma';

type FeatureName = 'ai_gemini' | 'qr_code' | 'analytics' | 'custom_domain';

export const checkFeatureAccess = (feature: FeatureName) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        include: {
          subscriptionPlan: {
            select: { features: true, name: true }
          }
        }
      });

      if (!user) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const features = user.subscriptionPlan?.features as any;
      const hasFeature = features?.[feature] === true;

      if (!hasFeature) {
        return res.status(403).json({
          error: 'Recurso não disponível no seu plano',
          code: 'FEATURE_UNAVAILABLE',
          details: {
            feature,
            plan: user.subscriptionPlan?.name || 'free'
          }
        });
      }

      next();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
};
