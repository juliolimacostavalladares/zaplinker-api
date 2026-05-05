"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const stripe_1 = __importDefault(require("stripe"));
const supabase_js_1 = require("@supabase/supabase-js");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const getStripe = () => new stripe_1.default(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-12-15.clover',
});
const getSupabase = () => (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
// Listar planos disponíveis
router.get('/plans', async (req, res) => {
    try {
        const supabase = getSupabase();
        const { data: plans, error } = await supabase
            .from('subscription_plans')
            .select('*')
            .order('price', { ascending: true });
        if (error)
            throw error;
        res.json(plans);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Criar sessão de checkout
router.post('/create-checkout-session', auth_1.authMiddleware, async (req, res) => {
    try {
        const { planId } = req.body;
        const supabase = getSupabase();
        const stripe = getStripe();
        console.log('\n=== CREATING CHECKOUT SESSION ===');
        console.log('User ID:', req.user.id);
        console.log('Requested plan:', planId);
        // Sanitizar input para prevenir SQL injection
        const sanitizedPlanId = planId.replace(/[%_\\]/g, '\\$&');
        // Buscar dados do plano (case insensitive)
        const { data: plan, error: planError } = await supabase
            .from('subscription_plans')
            .select('*')
            .ilike('name', sanitizedPlanId)
            .single();
        if (planError || !plan) {
            console.error('❌ Plan not found:', planId);
            return res.status(404).json({ error: 'Plano não encontrado' });
        }
        console.log('✅ Plan found:', plan.name, '- R$', plan.price);
        // Buscar dados do usuário
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('email, name')
            .eq('id', req.user.id)
            .single();
        if (userError || !user) {
            console.error('❌ User not found');
            return res.status(404).json({ error: 'Usuário não encontrado' });
        }
        console.log('User email:', user.email);
        // Criar sessão de checkout
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'brl',
                        product_data: {
                            name: plan.name,
                            description: `${plan.max_links} links, ${plan.max_clicks_per_month} cliques/mês`,
                        },
                        unit_amount: Math.round(plan.price * 100), // Stripe usa centavos
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
                planId: plan.id, // Usar o UUID do plano
            },
        });
        console.log('✅ Checkout session created:', session.id);
        res.json({ url: session.url });
    }
    catch (error) {
        console.error('❌ Error creating checkout session:', error.message);
        res.status(500).json({ error: error.message });
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
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
    }
    console.log('\n=== WEBHOOK RECEIVED ===');
    console.log('Event Type:', event.type);
    console.log('Event ID:', event.id);
    console.log('Timestamp:', new Date().toISOString());
    const supabase = getSupabase();
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                const session = event.data.object;
                const { userId, planId } = session.metadata;
                console.log('\n--- CHECKOUT COMPLETED ---');
                console.log('User ID:', userId);
                console.log('Plan ID:', planId);
                console.log('Customer ID:', session.customer);
                console.log('Subscription ID:', session.subscription);
                // Atualizar usuário com nova assinatura
                const { error: updateError } = await supabase
                    .from('users')
                    .update({
                    subscription_plan_id: planId,
                    subscription_status: 'active',
                    subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                    stripe_customer_id: session.customer,
                    stripe_subscription_id: session.subscription,
                    updated_at: new Date().toISOString()
                })
                    .eq('id', userId);
                if (updateError) {
                    console.error('❌ Error updating user:', updateError);
                }
                else {
                    console.log('✅ User subscription activated successfully');
                }
                break;
            case 'invoice.payment_succeeded':
                const invoice = event.data.object;
                const invoiceSubscription = invoice.subscription;
                console.log('\n--- INVOICE PAYMENT SUCCEEDED ---');
                console.log('Subscription ID:', invoiceSubscription);
                console.log('Amount Paid:', invoice.amount_paid / 100, invoice.currency.toUpperCase());
                if (invoiceSubscription && typeof invoiceSubscription === 'string') {
                    const { error: renewError } = await supabase
                        .from('users')
                        .update({
                        subscription_status: 'active',
                        subscription_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                        updated_at: new Date().toISOString()
                    })
                        .eq('stripe_subscription_id', invoiceSubscription);
                    if (renewError) {
                        console.error('❌ Error renewing subscription:', renewError);
                    }
                    else {
                        console.log('✅ Subscription renewed successfully');
                    }
                }
                break;
            case 'invoice.payment_failed':
                const failedInvoice = event.data.object;
                const failedInvoiceSubscription = failedInvoice.subscription;
                console.log('\n--- INVOICE PAYMENT FAILED ---');
                console.log('Subscription ID:', failedInvoiceSubscription);
                console.log('Amount Due:', failedInvoice.amount_due / 100, failedInvoice.currency.toUpperCase());
                if (failedInvoiceSubscription && typeof failedInvoiceSubscription === 'string') {
                    const { error: failError } = await supabase
                        .from('users')
                        .update({
                        subscription_status: 'past_due',
                        updated_at: new Date().toISOString()
                    })
                        .eq('stripe_subscription_id', failedInvoiceSubscription);
                    if (failError) {
                        console.error('❌ Error marking subscription as past_due:', failError);
                    }
                    else {
                        console.log('⚠️ Subscription marked as past_due');
                    }
                }
                break;
            case 'customer.subscription.deleted':
            case 'customer.subscription.updated':
                const subscription = event.data.object;
                console.log('\n--- SUBSCRIPTION EVENT ---');
                console.log('Subscription ID:', subscription.id);
                console.log('Status:', subscription.status);
                console.log('Cancel at period end:', subscription.cancel_at_period_end);
                console.log('Canceled at:', subscription.canceled_at ? new Date(subscription.canceled_at * 1000).toISOString() : 'N/A');
                console.log('Current period end:', subscription.current_period_end ? new Date(subscription.current_period_end * 1000).toISOString() : 'N/A');
                // Buscar usuário antes de qualquer operação
                const { data: currentUser, error: userFindError } = await supabase
                    .from('users')
                    .select('id, email, subscription_status')
                    .eq('stripe_subscription_id', subscription.id)
                    .single();
                if (userFindError) {
                    console.error('❌ User not found for subscription:', subscription.id);
                    console.error('Error:', userFindError);
                    break;
                }
                console.log('✅ User found:', currentUser.email, '(ID:', currentUser.id, ')');
                // Verificar se a assinatura foi cancelada ou deletada
                const isCancelled = event.type === 'customer.subscription.deleted' ||
                    subscription.status === 'canceled' ||
                    subscription.canceled_at !== null;
                if (isCancelled) {
                    console.log('🔄 Processing subscription cancellation...');
                    console.log('Reason: Event type =', event.type, '| Status =', subscription.status, '| Canceled at =', subscription.canceled_at);
                    // Buscar plano gratuito
                    const { data: freePlan, error: freePlanError } = await supabase
                        .from('subscription_plans')
                        .select('id, name')
                        .eq('name', 'Gratuito')
                        .single();
                    if (freePlanError || !freePlan) {
                        console.error('❌ Free plan not found:', freePlanError);
                    }
                    else {
                        console.log('✅ Free plan found:', freePlan.name, '(ID:', freePlan.id, ')');
                        // Atualizar usuário para plano gratuito
                        const { data: updatedUser, error: cancelError } = await supabase
                            .from('users')
                            .update({
                            subscription_plan_id: freePlan.id,
                            subscription_status: 'cancelled',
                            subscription_expires_at: null,
                            stripe_subscription_id: null,
                            updated_at: new Date().toISOString()
                        })
                            .eq('stripe_subscription_id', subscription.id)
                            .select('id, email, subscription_status, subscription_plan_id');
                        if (cancelError) {
                            console.error('❌ Error cancelling subscription:', cancelError);
                        }
                        else {
                            console.log('✅ Subscription cancelled successfully');
                            console.log('Updated user:', updatedUser);
                        }
                    }
                }
                else if (subscription.cancel_at_period_end && subscription.current_period_end) {
                    console.log('⏳ Subscription will be cancelled at period end:', new Date(subscription.current_period_end * 1000).toISOString());
                    console.log('User can continue using until then');
                }
                else {
                    console.log('ℹ️ Subscription updated but not cancelled (status:', subscription.status, ')');
                }
                break;
            case 'billing_portal.session.created':
                console.log('\n--- BILLING PORTAL SESSION CREATED ---');
                console.log('Portal session created successfully');
                break;
            default:
                console.log('\n--- UNHANDLED EVENT ---');
                console.log('Event type not handled:', event.type);
        }
        console.log('\n=== WEBHOOK PROCESSED SUCCESSFULLY ===\n');
        res.json({ received: true });
    }
    catch (error) {
        console.error('\n❌ WEBHOOK ERROR:', error.message);
        console.error('Stack:', error.stack);
        res.status(500).json({ error: error.message });
    }
});
// Cancelar assinatura
router.post('/cancel-subscription', auth_1.authMiddleware, async (req, res) => {
    try {
        const supabase = getSupabase();
        const stripe = getStripe();
        console.log('\n=== MANUAL SUBSCRIPTION CANCELLATION ===');
        console.log('User ID:', req.user.id);
        // Buscar dados do usuário
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('stripe_subscription_id, email')
            .eq('id', req.user.id)
            .single();
        if (userError || !user || !user.stripe_subscription_id) {
            console.error('❌ Subscription not found for user');
            return res.status(404).json({ error: 'Assinatura não encontrada' });
        }
        console.log('User email:', user.email);
        console.log('Stripe subscription ID:', user.stripe_subscription_id);
        // Cancelar no Stripe imediatamente (sem esperar fim do período)
        const cancelledSubscription = await stripe.subscriptions.cancel(user.stripe_subscription_id);
        console.log('✅ Subscription cancelled in Stripe');
        console.log('Cancellation status:', cancelledSubscription.status);
        console.log('Canceled at:', cancelledSubscription.canceled_at ? new Date(cancelledSubscription.canceled_at * 1000).toISOString() : 'N/A');
        // O webhook irá processar o cancelamento e atualizar o banco
        res.json({
            message: 'Assinatura cancelada com sucesso',
            status: cancelledSubscription.status
        });
    }
    catch (error) {
        console.error('❌ Error cancelling subscription:', error.message);
        res.status(500).json({ error: error.message });
    }
});
// Criar sessão do portal do cliente
router.post('/create-portal-session', auth_1.authMiddleware, async (req, res) => {
    try {
        const supabase = getSupabase();
        const stripe = getStripe();
        // Buscar dados do usuário
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('stripe_customer_id')
            .eq('id', req.user.id)
            .single();
        if (userError || !user || !user.stripe_customer_id) {
            return res.status(404).json({ error: 'Cliente não encontrado' });
        }
        // Criar sessão do portal
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: user.stripe_customer_id,
            return_url: `${process.env.FRONTEND_URL}/dashboard`,
        });
        res.json({ url: portalSession.url });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Verificar status da assinatura
router.get('/subscription-status', auth_1.authMiddleware, async (req, res) => {
    try {
        const supabase = getSupabase();
        console.log('\n=== CHECKING SUBSCRIPTION STATUS ===');
        console.log('User ID:', req.user.id);
        // Primeiro, verificar e atualizar assinaturas expiradas
        await supabase.rpc('check_expired_subscriptions');
        const { data: user, error } = await supabase
            .from('users')
            .select('subscription_plan_id, subscription_status, subscription_expires_at, subscription_plans(*)')
            .eq('id', req.user.id)
            .single();
        if (error)
            throw error;
        // Verificar manualmente se expirou (fallback)
        if (user.subscription_expires_at && new Date(user.subscription_expires_at) < new Date() && user.subscription_status === 'active') {
            console.log('⚠️ Subscription expired, updating to free plan...');
            const { data: freePlan } = await supabase
                .from('subscription_plans')
                .select('id')
                .eq('name', 'Gratuito')
                .single();
            if (freePlan) {
                const { error: updateError } = await supabase
                    .from('users')
                    .update({
                    subscription_plan_id: freePlan.id,
                    subscription_status: 'expired',
                    subscription_expires_at: null
                })
                    .eq('id', req.user.id);
                if (updateError) {
                    console.error('❌ Error updating user:', updateError);
                    // Retornar dados atuais mesmo com erro
                    return res.json({
                        planId: user.subscription_plan_id,
                        status: user.subscription_status,
                        expiresAt: user.subscription_expires_at,
                        plan: user.subscription_plans || null,
                        error: 'Failed to downgrade: ' + updateError.message
                    });
                }
                // Buscar dados atualizados
                const { data: updatedUser } = await supabase
                    .from('users')
                    .select('subscription_plan_id, subscription_status, subscription_expires_at, subscription_plans(*)')
                    .eq('id', req.user.id)
                    .single();
                if (updatedUser) {
                    console.log('✅ User downgraded to free plan');
                    return res.json({
                        planId: updatedUser.subscription_plan_id,
                        status: updatedUser.subscription_status,
                        expiresAt: updatedUser.subscription_expires_at,
                        plan: updatedUser.subscription_plans || null
                    });
                }
            }
        }
        console.log('Plan:', user.subscription_plans?.name || 'N/A');
        console.log('Status:', user.subscription_status);
        console.log('Expires at:', user.subscription_expires_at || 'N/A');
        res.json({
            planId: user.subscription_plan_id,
            status: user.subscription_status,
            expiresAt: user.subscription_expires_at,
            plan: user.subscription_plans || null
        });
    }
    catch (error) {
        console.error('❌ Error checking subscription status:', error.message);
        res.status(500).json({ error: error.message });
    }
});
// Atualizar dados do usuário (forçar refresh)
router.post('/refresh-user', auth_1.authMiddleware, async (req, res) => {
    try {
        const supabase = getSupabase();
        const { data: user, error } = await supabase
            .from('users')
            .select('*, subscription_plans(*)')
            .eq('id', req.user.id)
            .single();
        if (error)
            throw error;
        res.json(user);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Forçar aplicação de limitações do plano
router.post('/force-plan-limits', auth_1.authMiddleware, async (req, res) => {
    try {
        const supabase = getSupabase();
        // Executar função para forçar aplicação de limitações
        const { data, error } = await supabase
            .rpc('force_apply_plan_limits', { target_user_id: req.user.id });
        if (error)
            throw error;
        // Buscar dados atualizados do usuário
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*, subscription_plans(*)')
            .eq('id', req.user.id)
            .single();
        if (userError)
            throw userError;
        res.json({
            message: data || 'Limitações aplicadas com sucesso',
            user
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
exports.default = router;
