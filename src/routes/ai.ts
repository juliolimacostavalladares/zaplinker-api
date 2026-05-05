import { Router, Response } from 'express';
import { AuthRequest } from '../types';
import { authMiddleware } from '../middleware/auth';
import { generateWhatsAppMessage } from '../services/geminiService';
import { z } from 'zod';
import { sanitizeError, logError } from '../utils/errorHandler';

const router = Router();

const generateMessageSchema = z.object({
  context: z.string().min(1).max(500),
  tone: z.enum(['friendly', 'professional', 'casual', 'formal']).optional().default('friendly')
});

router.post('/generate-message', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const validated = generateMessageSchema.parse(req.body);
    const { context, tone } = validated;

    const message = await generateWhatsAppMessage(context, tone);

    res.json({ message });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: error.issues.map((e: any) => e.message)
      });
    }

    logError(error, 'Generate Message');
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;
