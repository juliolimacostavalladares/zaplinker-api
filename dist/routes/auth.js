"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const zod_1 = require("zod");
const sanitize_1 = require("../utils/sanitize");
const prisma_1 = require("../lib/prisma");
const errorHandler_1 = require("../utils/errorHandler");
const subscriptionService_1 = require("../services/subscriptionService");
const router = (0, express_1.Router)();
// Schemas de validação
const registerSchema = zod_1.z.object({
    email: zod_1.z.string().email('Email inválido').max(255),
    password: zod_1.z.string()
        .min(8, 'Senha deve ter no mínimo 8 caracteres')
        .max(100)
        .regex(/[A-Z]/, 'Senha deve conter letra maiúscula')
        .regex(/[a-z]/, 'Senha deve conter letra minúscula')
        .regex(/[0-9]/, 'Senha deve conter número'),
    name: zod_1.z.string().min(2).max(100)
});
const loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Email inválido'),
    password: zod_1.z.string().min(1, 'Senha é obrigatória')
});
// Registro
router.post('/register', async (req, res) => {
    try {
        // Validar input
        const validated = registerSchema.parse(req.body);
        const { password, name } = validated;
        // Sanitizar e validar email
        const email = (0, sanitize_1.validateAndSanitizeEmail)(validated.email);
        if (!email) {
            return res.status(400).json({ error: 'Email inválido' });
        }
        // Sanitizar nome
        const sanitizedName = (0, sanitize_1.sanitizeString)(name, 100);
        // Verificar se usuário já existe
        const existingUser = await prisma_1.prisma.user.findUnique({
            where: { email }
        });
        if (existingUser) {
            return res.status(400).json({ error: 'Email já cadastrado' });
        }
        // Hash da senha com 12 rounds
        const passwordHash = await bcryptjs_1.default.hash(password, 12);
        // Buscar plano gratuito
        const freePlan = await subscriptionService_1.subscriptionService.getFreePlan();
        // Criar usuário
        const user = await prisma_1.prisma.user.create({
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
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
        // Enviar token via httpOnly cookie
        res.cookie('auth-token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 dias
        });
        res.status(201).json({ user });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Dados inválidos',
                details: error.issues.map((e) => e.message)
            });
        }
        (0, errorHandler_1.logError)(error, 'Register');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Login
router.post('/login', async (req, res) => {
    try {
        // Validar input
        const validated = loginSchema.parse(req.body);
        const { password } = validated;
        // Sanitizar e validar email
        const email = (0, sanitize_1.validateAndSanitizeEmail)(validated.email);
        if (!email) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        // Buscar usuário
        const user = await prisma_1.prisma.user.findUnique({
            where: { email }
        });
        if (!user) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        // Verificar senha
        const isValidPassword = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!isValidPassword) {
            return res.status(401).json({ error: 'Credenciais inválidas' });
        }
        // Gerar token
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET not configured');
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
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
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Dados inválidos',
                details: error.issues.map((e) => e.message)
            });
        }
        (0, errorHandler_1.logError)(error, 'Login');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
exports.default = router;
