"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const dotenv_1 = __importDefault(require("dotenv"));
const auth_1 = __importDefault(require("./routes/auth"));
const subscription_1 = __importDefault(require("./routes/subscription"));
const profile_1 = __importDefault(require("./routes/profile"));
const payments_1 = __importDefault(require("./routes/payments"));
const ai_1 = __importDefault(require("./routes/ai"));
const logout_1 = __importDefault(require("./routes/logout"));
const auth_2 = require("./middleware/auth");
const planLimits_1 = require("./middleware/planLimits");
const csrf_1 = require("./middleware/csrf");
const sanitize_1 = require("./utils/sanitize");
const errorHandler_1 = require("./utils/errorHandler");
const prisma_1 = require("./lib/prisma");
dotenv_1.default.config();
const app = (0, express_1.default)();
// Helmet para segurança
app.use((0, helmet_1.default)());
// CORS restritivo
app.use((0, cors_1.default)({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
}));
// Rate limiting
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: "Muitas tentativas, tente novamente em 15 minutos",
});
const createLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 5,
    message: "Muitas requisições, aguarde um momento",
});
const redirectLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 50,
    skipSuccessfulRequests: false,
    message: "Muitos cliques, aguarde um momento",
});
// Middleware especial para webhook do Stripe (precisa do raw body)
app.use("/api/payments/webhook", express_1.default.raw({ type: "application/json" }));
// Middleware padrão para outras rotas
app.use(express_1.default.json({ limit: "10kb" }));
app.use(express_1.default.urlencoded({ extended: true, limit: "10kb" }));
app.use((0, csrf_1.cookieParser)());
// Rotas
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", auth_1.default);
app.use("/api/auth", logout_1.default);
app.use("/api/subscription", subscription_1.default);
app.use("/api/profile", profile_1.default);
app.use("/api/payments", payments_1.default);
app.use("/api/ai", ai_1.default);
// Endpoint para obter token CSRF
app.get("/api/csrf-token", (req, res) => {
    const csrfToken = (0, csrf_1.generateToken)(req, res);
    res.json({ csrfToken });
});
// --- API CRUD ---
// Listar links do usuário
app.get("/api/links", auth_2.authMiddleware, async (req, res) => {
    try {
        const links = await prisma_1.prisma.link.findMany({
            where: { userId: req.user.id },
            include: {
                agents: {
                    where: { isActive: true },
                },
                bioButtons: true,
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(links);
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Get Links');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Criar novo link
app.post("/api/links", csrf_1.doubleCsrfProtection, auth_2.authMiddleware, createLimiter, planLimits_1.checkPlanLimits, async (req, res) => {
    try {
        const { name, slug, type, agents, defaultMessage, bioTitle, bioDescription, bioAvatarUrl, bioButtons, } = req.body;
        // Bloquear criação de Link-in-Bio (feature em desenvolvimento)
        if (type === "bio") {
            return res
                .status(403)
                .json({ error: "Link-in-Bio estará disponível em breve" });
        }
        // Sanitizar inputs
        const sanitizedName = (0, sanitize_1.sanitizeString)(name, 100);
        if (!sanitizedName) {
            return res.status(400).json({ error: "Nome é obrigatório" });
        }
        // Sanitizar e validar slug
        const sanitizedSlug = slug
            ? (0, sanitize_1.sanitizeSlug)(slug)
            : (0, sanitize_1.sanitizeSlug)(sanitizedName);
        if (!sanitizedSlug) {
            return res.status(400).json({ error: "Slug inválido" });
        }
        // Verificar se slug já existe
        const existingLink = await prisma_1.prisma.link.findUnique({
            where: { slug: sanitizedSlug },
        });
        if (existingLink) {
            return res.status(409).json({
                error: "Este slug já está em uso. Escolha outro.",
                suggestion: `${sanitizedSlug}-${Date.now().toString().slice(-4)}`,
            });
        }
        // Sanitizar mensagem padrão
        const sanitizedMessage = defaultMessage
            ? (0, sanitize_1.sanitizeString)(defaultMessage, 500)
            : "";
        // 1. Inserir na tabela 'links'
        const link = await prisma_1.prisma.link.create({
            data: {
                name: sanitizedName,
                slug: sanitizedSlug,
                type,
                defaultMessage: sanitizedMessage,
                bioTitle: bioTitle ? (0, sanitize_1.sanitizeString)(bioTitle, 100) : null,
                bioDescription: bioDescription
                    ? (0, sanitize_1.sanitizeString)(bioDescription, 500)
                    : null,
                bioAvatarUrl: bioAvatarUrl ? (0, sanitize_1.sanitizeUrl)(bioAvatarUrl) : null,
                currentAgentIndex: 0,
                clicks: 0,
                userId: req.user.id,
            },
        });
        // 2. Inserir dependentes baseados no tipo
        if (type === "direct" && agents?.length > 0) {
            const agentsData = agents.map((a) => {
                const sanitizedPhone = (0, sanitize_1.validateAndSanitizePhone)(a.phone);
                if (!sanitizedPhone) {
                    throw new Error(`Telefone inválido: ${a.phone}`);
                }
                return {
                    linkId: link.id,
                    name: (0, sanitize_1.sanitizeString)(a.name, 100),
                    phone: sanitizedPhone,
                };
            });
            await prisma_1.prisma.agent.createMany({ data: agentsData });
        }
        else if (type === "bio" && bioButtons?.length > 0) {
            const buttonsData = bioButtons.map((b) => {
                const sanitizedPhone = (0, sanitize_1.validateAndSanitizePhone)(b.phone);
                if (!sanitizedPhone) {
                    throw new Error(`Telefone inválido: ${b.phone}`);
                }
                return {
                    linkId: link.id,
                    label: (0, sanitize_1.sanitizeString)(b.label, 50),
                    phone: sanitizedPhone,
                    message: (0, sanitize_1.sanitizeString)(b.message, 500),
                };
            });
            await prisma_1.prisma.bioButton.createMany({ data: buttonsData });
        }
        res.status(201).json(link);
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Create Link');
        res.status(400).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// --- MOTOR DE REDIRECIONAMENTO (ROUND ROBIN) ---
app.get("/r/:slug", redirectLimiter, async (req, res) => {
    try {
        const { slug } = req.params;
        // Busca o link e seus atendentes ativos
        const link = await prisma_1.prisma.link.findUnique({
            where: { slug },
            include: {
                agents: {
                    where: { isActive: true },
                },
            },
        });
        if (!link)
            return res.status(404).send("Link não encontrado");
        // Incrementar cliques
        await prisma_1.prisma.link.update({
            where: { id: link.id },
            data: { clicks: { increment: 1 } },
        });
        if (link.type === "direct") {
            const agents = link.agents;
            if (!agents || agents.length === 0)
                return res.status(400).send("Nenhum atendente ativo configurado");
            // Lógica Round Robin: Seleciona o atendente baseado no índice atual
            const agentIndex = link.currentAgentIndex % agents.length;
            const selectedAgent = agents[agentIndex];
            // Atualiza o índice para o próximo clique
            await prisma_1.prisma.link.update({
                where: { id: link.id },
                data: { currentAgentIndex: agentIndex + 1 },
            });
            const waUrl = `https://wa.me/${selectedAgent.phone}?text=${encodeURIComponent(link.defaultMessage || "")}`;
            return res.redirect(waUrl);
        }
        // Se for Bio, redireciona para a página de preview do front-end
        return res.redirect(`${process.env.FRONTEND_URL}/bio/${slug}`);
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Redirect');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
// Reativar atendentes desabilitados (quando faz upgrade)
app.post("/api/links/:linkId/reactivate-agents", csrf_1.doubleCsrfProtection, auth_2.authMiddleware, async (req, res) => {
    try {
        const { linkId } = req.params;
        // Verificar se o link pertence ao usuário
        const link = await prisma_1.prisma.link.findFirst({
            where: {
                id: linkId,
                userId: req.user.id,
            },
        });
        if (!link) {
            return res.status(404).json({ error: "Link não encontrado" });
        }
        // Buscar limite de atendentes do plano atual
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: req.user.id },
            include: {
                subscriptionPlan: {
                    select: { features: true },
                },
            },
        });
        if (!user) {
            return res.status(404).json({ error: "Usuário não encontrado" });
        }
        const maxAttendants = user.subscriptionPlan?.features?.max_attendants || 1;
        // Contar atendentes ativos
        const activeCount = await prisma_1.prisma.agent.count({
            where: {
                linkId,
                isActive: true,
            },
        });
        const availableSlots = maxAttendants - activeCount;
        if (availableSlots > 0) {
            // Reativar atendentes desabilitados até o limite
            const inactiveAgents = await prisma_1.prisma.agent.findMany({
                where: {
                    linkId,
                    isActive: false,
                },
                take: availableSlots,
            });
            await prisma_1.prisma.agent.updateMany({
                where: {
                    id: { in: inactiveAgents.map((a) => a.id) },
                },
                data: {
                    isActive: true,
                    updatedAt: new Date(),
                },
            });
        }
        res.json({
            message: "Atendentes reativados com sucesso",
            reactivated: availableSlots,
        });
    }
    catch (error) {
        (0, errorHandler_1.logError)(error, 'Reactivate Agents');
        res.status(500).json({ error: (0, errorHandler_1.sanitizeError)(error) });
    }
});
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Back-end ZapLinker rodando na porta ${PORT}`));
