"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authMiddleware = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("./lib/prisma");
const authMiddleware = async (req, res, next) => {
    try {
        // Tentar obter token do cookie primeiro, depois do header (para compatibilidade)
        let token = req.cookies?.['auth-token'];
        if (!token) {
            const authHeader = req.get('Authorization');
            token = authHeader?.replace('Bearer ', '');
        }
        if (!token) {
            return res.status(401).json({ error: 'Token de acesso requerido' });
        }
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET);
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: decoded.userId },
            include: {
                subscriptionPlan: true
            }
        });
        if (!user) {
            return res.status(401).json({ error: 'Token inválido' });
        }
        // Verificar se a assinatura expirou
        if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date() && user.subscriptionStatus === 'active') {
            const freePlan = await prisma_1.prisma.subscriptionPlan.findUnique({
                where: { name: 'Gratuito' }
            });
            if (freePlan) {
                await prisma_1.prisma.user.update({
                    where: { id: user.id },
                    data: {
                        subscriptionPlanId: freePlan.id,
                        subscriptionStatus: 'expired',
                        subscriptionExpiresAt: null
                    }
                });
                // Atualizar objeto user
                user.subscriptionPlanId = freePlan.id;
                user.subscriptionStatus = 'expired';
                user.subscriptionExpiresAt = null;
            }
        }
        req.user = user;
        next();
    }
    catch (error) {
        res.status(401).json({ error: 'Token inválido' });
    }
};
exports.authMiddleware = authMiddleware;
