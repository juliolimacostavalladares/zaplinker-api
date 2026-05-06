import { Response, NextFunction } from 'express';
import { AuthRequest } from '../types';

type FeatureName = 'ai_gemini' | 'qr_code' | 'analytics' | 'custom_domain';

export const checkFeatureAccess = (feature: FeatureName) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user!;

      // Use subscriptionPlan already loaded by authMiddleware
      const subscriptionPlan = user.subscriptionPlan;

      const features = subscriptionPlan?.features as any;
      const hasFeature = features?.[feature] === true;

      if (!hasFeature) {
        return res.status(403).json({
          error: 'Recurso não disponível no seu plano',
          code: 'FEATURE_UNAVAILABLE',
          details: {
            feature,
            plan: subscriptionPlan?.name || 'free'
          }
        });
      }

      next();
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  };
};
