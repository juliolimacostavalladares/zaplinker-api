import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { sanitizeString, validateAndSanitizeEmail } from '../utils/sanitize';
import { prisma } from '../lib/prisma';
import { sanitizeError, logError } from '../utils/errorHandler';
import { subscriptionService } from '../services/subscriptionService';

const router = Router();

// Schemas de validação
const registerSchema = z.object({
  email: z.string().email('Email inválido').max(255),
  password: z.string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .max(100)
    .regex(/[A-Z]/, 'Senha deve conter letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter letra minúscula')
    .regex(/[0-9]/, 'Senha deve conter número'),
  name: z.string().min(2).max(100)
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória')
});

// Registro
router.post('/register', async (req: Request, res: Response) => {
  try {
    // Validar input
    const validated = registerSchema.parse(req.body);
    const { password, name } = validated;

    // Sanitizar e validar email
    const email = validateAndSanitizeEmail(validated.email);
    if (!email) {
      return res.status(400).json({ error: 'Email inválido' });
    }

    // Sanitizar nome
    const sanitizedName = sanitizeString(name, 100);

    // Verificar se usuário já existe
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    // Hash da senha com 12 rounds
    const passwordHash = await bcrypt.hash(password, 12);

    // Buscar plano gratuito
    const freePlan = await subscriptionService.getFreePlan();

    // Criar usuário
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: sanitizedName,
        subscriptionPlanId: freePlan?.id
      },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionPlanId: true,
        subscriptionStatus: true,
        createdAt: true
      }
    });

    // Gerar token
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET not configured');
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Enviar token via httpOnly cookie
    res.cookie('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
    });

    res.status(201).json({ user });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: error.issues.map((e: any) => e.message)
      });
    }
    logError(error, 'Register');
    res.status(500).json({ error: sanitizeError(error) });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    // Validar input
    const validated = loginSchema.parse(req.body);
    const { password } = validated;

    // Sanitizar e validar email
    const email = validateAndSanitizeEmail(validated.email);
    if (!email) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Buscar usuário
    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Verificar senha
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    // Gerar token
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET not configured');
    }
    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    // Remover hash da senha da resposta
    const { passwordHash, ...userWithoutPassword } = user;

    // Enviar token via httpOnly cookie
    res.cookie('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
    });

    res.json({ user: userWithoutPassword });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Dados inválidos',
        details: error.issues.map((e: any) => e.message)
      });
    }
    logError(error, 'Login');
    res.status(500).json({ error: sanitizeError(error) });
  }
});

export default router;