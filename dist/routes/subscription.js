"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const supabase_js_1 = require("@supabase/supabase-js");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const getSupabase = () => (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
// Listar planos disponíveis
router.get('/plans', async (req, res) => {
    const supabase = getSupabase();
    const { data: plans, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price');
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(plans);
});
// Verificar limites do usuário
router.get('/limits', auth_1.authMiddleware, async (req, res) => {
    const supabase = getSupabase();
    const { data: limits, error } = await supabase
        .rpc('check_user_limits', { user_uuid: req.user.id });
    if (error)
        return res.status(500).json({ error: error.message });
    res.json(limits[0]);
});
exports.default = router;
