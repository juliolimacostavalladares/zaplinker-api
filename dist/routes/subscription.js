"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../utils/errorHandler");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
// Listar planos disponíveis
router.get('/plans', async (req, res) => {
    try {
        const plans = await prisma_1.prisma.subscriptionPlan.findMany({
            orderBy: { price: 'asc' }
        });
        res.json(plans);
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Get Plans');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Verificar limites do usuário
router.get('/limits', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                subscriptionPlan: true,
                links: {
                    select: {
                        id: true,
                        clicks: true
                    }
                }
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        const totalLinks = user.links.length;
        const totalClicks = user.links.reduce((sum, link) => sum + link.clicks, 0);
        const maxLinks = user.subscriptionPlan?.maxLinks || 1;
        const maxClicks = user.subscriptionPlan?.maxClicksPerMonth || 100;
        res.json({
            totalLinks,
            maxLinks,
            totalClicks,
            maxClicks,
            canCreateMoreLinks: totalLinks < maxLinks
        });
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Get Limits');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
exports.default = router;
