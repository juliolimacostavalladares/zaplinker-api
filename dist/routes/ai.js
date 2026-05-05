"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const geminiService_1 = require("../services/geminiService");
const zod_1 = require("zod");
const router = (0, express_1.Router)();
const generateMessageSchema = zod_1.z.object({
    context: zod_1.z.string().min(1).max(500),
    tone: zod_1.z.enum(['friendly', 'professional', 'casual', 'formal']).optional().default('friendly')
});
router.post('/generate-message', auth_1.authMiddleware, async (req, res) => {
    try {
        const validated = generateMessageSchema.parse(req.body);
        const { context, tone } = validated;
        const message = await (0, geminiService_1.generateWhatsAppMessage)(context, tone);
        res.json({ message });
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({
                error: 'Dados inválidos',
                details: error.issues.map((e) => e.message)
            });
        }
        res.status(500).json({ error: error.message || 'Erro ao gerar mensagem' });
    }
});
exports.default = router;
