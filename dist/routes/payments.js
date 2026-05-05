"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const auth_1 = require("../middleware/auth");
const errorHandler_1 = require("../utils/errorHandler");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
const getStripe = () => new stripe_1.default(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-12-15.clover',
});
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
// Criar sessão de checkout
router.post('/create-checkout-session', auth_1.authMiddleware, async (req, res) => {
    try {
        const { planId } = req.body;
        const stripe = getStripe();
        // Sanitizar input para prevenir SQL injection
        const sanitizedPlanId = planId.replace(/[%_\\]/g, '\\$&');
        // Buscar dados do plano
        const plan = await prisma_1.prisma.subscriptionPlan.findFirst({
            where: {
                name: {
                    equals: sanitizedPlanId,
                    mode: 'insensitive'
                }
            }
        });
        if (!plan) {
            return res.status(404).json({ error: 'Plano não encontrado' });
        }
        // Buscar dados do usuário
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { email: true, name: true }
        });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        // Criar sessão de checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: plan.name,
                            description: `${plan.maxLinks} links, ${plan.maxClicksPerMonth} cliques/mês`,
                        },
                        unit_amount: Math.round(Number(plan.price) * 100),
                        recurring: {
                            interval: 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.FRONTEND_URL}/dashboard?success=true`,
            cancel_url: `${process.env.FRONTEND_URL}/pricing?cancelled=true`,
            customer_email: user.email,
            metadata: {
                userId: req.user.id,
                planId: plan.id,
            },
        });
        res.json({ url: session.url });
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Create Checkout Session');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Webhook do Stripe
router.post('/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
    const stripe = getStripe();
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        (0, errorHandler_1.logError)(err, 'Webhook Signature Verification');
        return res.status(400).send('Webhook signature verification failed');
    }
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                const { userId, planId } = session.metadata;
                // Atualizar usuário com nova assinatura
                await prisma_1.prisma.user.update({
                    where: { id: userId },
                    data: {
                        subscriptionPlanId: planId,
                        subscriptionStatus: 'active',
                        subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        stripeCustomerId: session.customer,
                        stripeSubscriptionId: session.subscription,
                    }
                });
                break;
            case 'invoice.payment_succeeded':
                const invoice = event.data.object;
                const invoiceSubscription = invoice.subscription;
                if (invoiceSubscription && typeof invoiceSubscription === 'string') {
                    await prisma_1.prisma.user.updateMany({
                        where: { stripeSubscriptionId: invoiceSubscription },
                        data: {
                            subscriptionStatus: 'active',
                            subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                        }
                    });
                }
                break;
            case 'invoice.payment_failed':
                const failedInvoice = event.data.object;
                const failedInvoiceSubscription = failedInvoice.subscription;
                if (failedInvoiceSubscription && typeof failedInvoiceSubscription === 'string') {
                    await prisma_1.prisma.user.updateMany({
                        where: { stripeSubscriptionId: failedInvoiceSubscription },
                        data: { subscriptionStatus: 'past_due' }
                    });
                }
                break;
            case 'customer.subscription.deleted':
            case 'customer.subscription.updated':
                const subscription = event.data.object;
                // Buscar usuário antes de qualquer operação
                const currentUser = await prisma_1.prisma.user.findFirst({
                    where: { stripeSubscriptionId: subscription.id },
                    select: { id: true, email: true, subscriptionStatus: true }
                });
                if (!currentUser) {
                    (0, errorHandler_1.logError)(new Error('User not found for subscription'), 'Webhook - Find User');
                    break;
                }
                // Verificar se a assinatura foi cancelada ou deletada
                const isCancelled = event.type === 'customer.subscription.deleted' ||
                    subscription.status === 'canceled' ||
                    subscription.canceled_at !== null;
                if (isCancelled) {
                    // Buscar plano gratuito
                    const freePlan = await prisma_1.prisma.subscriptionPlan.findUnique({
                        where: { name: 'Gratuito' }
                    });
                    if (!freePlan) {
                        (0, errorHandler_1.logError)(new Error('Free plan not found'), 'Webhook - Find Free Plan');
                    }
                    else {
                        // Atualizar usuário para plano gratuito
                        await prisma_1.prisma.user.updateMany({
                            where: { stripeSubscriptionId: subscription.id },
                            data: {
                                subscriptionPlanId: freePlan.id,
                                subscriptionStatus: 'cancelled',
                                subscriptionExpiresAt: null,
                                stripeSubscriptionId: null,
                            }
                        });
                    }
                }
                break;
            case 'billing_portal.session.created':
                break;
            default:
                break;
        }
        res.json({ received: true });
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Webhook Processing');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Cancelar assinatura
router.post('/cancel-subscription', auth_1.authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        // Buscar dados do usuário
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { stripeSubscriptionId: true, email: true }
        });
        if (!user || !user.stripeSubscriptionId) {
            return res.status(404).json({ error: 'Assinatura não encontrada' });
        }
        // Cancelar no Stripe imediatamente (sem esperar fim do período)
        const cancelledSubscription = await stripe.subscriptions.cancel(user.stripeSubscriptionId);
        // O webhook irá processar o cancelamento e atualizar o banco
        res.json({
            message: 'Assinatura cancelada com sucesso',
            status: cancelledSubscription.status
        });
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Cancel Subscription');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Criar sessão do portal do cliente
router.post('/create-portal-session', auth_1.authMiddleware, async (req, res) => {
    try {
        const stripe = getStripe();
        // Buscar dados do usuário
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: { stripeCustomerId: true }
        });
        if (!user || !user.stripeCustomerId) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }
        // Criar sessão do portal
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${process.env.FRONTEND_URL}/dashboard`,
        });
        res.json({ url: portalSession.url });
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Create Portal Session');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Verificar status da assinatura
router.get('/subscription-status', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            select: {
                subscriptionPlanId: true,
                subscriptionStatus: true,
                subscriptionExpiresAt: true,
                subscriptionPlan: true
            }
        });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        // Verificar manualmente se expirou (fallback)
        if (user.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt) < new Date() && user.subscriptionStatus === 'active') {
            const freePlan = await prisma_1.prisma.subscriptionPlan.findUnique({
                where: { name: 'Gratuito' }
            });
            if (freePlan) {
                try {
                    await prisma_1.prisma.user.update({
                        where: { id: req.user.id },
                        data: {
                            subscriptionPlanId: freePlan.id,
                            subscriptionStatus: 'expired',
                            subscriptionExpiresAt: null
                        }
                    });
                    // Buscar dados atualizados
                    const updatedUser = await prisma_1.prisma.user.findUnique({
                        where: { id: req.user.id },
                        select: {
                            subscriptionPlanId: true,
                            subscriptionStatus: true,
                            subscriptionExpiresAt: true,
                            subscriptionPlan: true
                        }
                    });
                    if (updatedUser) {
                        return res.json({
                            planId: updatedUser.subscriptionPlanId,
                            status: updatedUser.subscriptionStatus,
                            expiresAt: updatedUser.subscriptionExpiresAt,
                            plan: updatedUser.subscriptionPlan || null
                        });
                    }
                }
                catch (updateError) {
                    (0, errorHandler_1.logError)(updateError, 'Subscription Status - Update Expired');
                    return res.json({
                        planId: user.subscriptionPlanId,
                        status: user.subscriptionStatus,
                        expiresAt: user.subscriptionExpiresAt,
                        plan: user.subscriptionPlan || null,
                        error: 'Failed to downgrade'
                    });
                }
            }
        }
        res.json({
            planId: user.subscriptionPlanId,
            status: user.subscriptionStatus,
            expiresAt: user.subscriptionExpiresAt,
            plan: user.subscriptionPlan || null
        });
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Subscription Status');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Atualizar dados do usuário (forçar refresh)
router.post('/refresh-user', auth_1.authMiddleware, async (req, res) => {
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            include: { subscriptionPlan: true }
        });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json(user);
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Refresh User');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Forçar aplicação de limitações do plano
router.post('/force-plan-limits', auth_1.authMiddleware, async (req, res) => {
    try {
        // Buscar dados atualizados do usuário
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            include: { subscriptionPlan: true }
        });
        if (!user) {
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        res.json({
            message: 'Limitações aplicadas com sucesso',
            user
        });
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Force Plan Limits');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
exports.default = router;
