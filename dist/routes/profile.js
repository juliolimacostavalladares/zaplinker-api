"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const prisma_1 = require("../lib/prisma");
const errorHandler_1 = require("../utils/errorHandler");
const router = (0, express_1.Router)();
// Obter dados do perfil do usuário
router.get('/', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                id: true,
                email: true,
                name: true,
                subscriptionStatus: true,
                subscriptionExpiresAt: true,
                subscriptionPlan: {
                    select: {
                        name: true,
                        price: true,
                        maxLinks: true,
                        maxClicksPerMonth: true
                    }
                }
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json(user);
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Get Profile');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Cancelar assinatura (agora via Stripe)
router.post('/cancel-subscription', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { stripeSubscriptionId: true }
        });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        if (!user.stripeSubscriptionId) {
            return res.status(400).json({ error: 'Nenhuma assinatura ativa encontrada' });
        }
        // Redirecionar para o endpoint de pagamentos para cancelar via Stripe
        return res.status(400).json({
            error: 'Use o endpoint /api/payments/cancel-subscription para cancelar via Stripe'
        });
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Cancel Subscription');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Excluir conta permanentemente
router.delete('/delete-account', auth_1.authMiddleware, async (req, res) => {
    try {
        // Buscar todos os links do usuário
        const userLinks = await prisma_1.prisma.link.findMany({
            where: { userId: req.user.id },
            select: { id: true }
        });
        if (userLinks.length > 0) {
            const linkIds = userLinks.map(link => link.id);
            // Excluir dados relacionados aos links
            await prisma_1.prisma.bioButton.deleteMany({
                where: { linkId: { in: linkIds } }
            });
            await prisma_1.prisma.agent.deleteMany({
                where: { linkId: { in: linkIds } }
            });
        }
        // Excluir links do usuário
        await prisma_1.prisma.link.deleteMany({
            where: { userId: req.user.id }
        });
        // Excluir usuário
        await prisma_1.prisma.user.delete({
            where: { id: req.user.id }
        });
        res.json({ message: 'Conta excluída com sucesso' });
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Delete Account');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
exports.default = router;
