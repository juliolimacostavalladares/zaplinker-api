import { Router, Response } from 'express';
import { AuthRequest } from '../types';
import { authMiddleware } from '../middleware/auth';

const router = Router();

// Logout - limpar cookie
router.post('/logout', authMiddleware, (req: AuthRequest, res: Response) => {
  res.clearCookie('auth-token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
  });
  res.json({ message: 'Logout realizado com sucesso' });
});

export default router;
