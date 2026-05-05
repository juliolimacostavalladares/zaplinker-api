import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import authRoutes from "./routes/auth";
import subscriptionRoutes from "./routes/subscription";
import profileRoutes from "./routes/profile";
import paymentsRoutes from "./routes/payments";
import aiRoutes from "./routes/ai";
import logoutRoutes from "./routes/logout";
import { authMiddleware } from "./middleware/auth";
import { checkPlanLimits } from "./middleware/planLimits";
import { AuthRequest } from "./types";
import {
  cookieParser,
  doubleCsrfProtection,
  generateToken,
} from "./middleware/csrf";
import {
  sanitizeString,
  sanitizeSlug,
  validateAndSanitizePhone,
  sanitizeUrl,
} from "./utils/sanitize";
import { prisma } from "./lib/prisma";

dotenv.config();

const app = express();

// Helmet para segurança
app.use(helmet());

// CORS restritivo
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Muitas tentativas, tente novamente em 15 minutos",
});

const createLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: "Muitas requisições, aguarde um momento",
});

const redirectLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  skipSuccessfulRequests: false,
  message: "Muitos cliques, aguarde um momento",
});

// Middleware especial para webhook do Stripe (precisa do raw body)
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// Middleware padrão para outras rotas
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));
app.use(cookieParser());

// Rotas
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/auth", logoutRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/payments", paymentsRoutes);
app.use("/api/ai", aiRoutes);

// Endpoint para obter token CSRF
app.get("/api/csrf-token", (req, res) => {
  const csrfToken = generateToken(req, res);
  res.json({ csrfToken });
});

// --- API CRUD ---

// Listar links do usuário
app.get(
  "/api/links",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const links = await prisma.link.findMany({
        where: { userId: req.user!.id },
        include: {
          agents: {
            where: { isActive: true },
          },
          bioButtons: true,
        },
        orderBy: { createdAt: "desc" },
      });

      res.json(links);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

// Criar novo link
app.post(
  "/api/links",
  doubleCsrfProtection,
  authMiddleware,
  createLimiter,
  checkPlanLimits,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        name,
        slug,
        type,
        agents,
        defaultMessage,
        bioTitle,
        bioDescription,
        bioAvatarUrl,
        bioButtons,
      } = req.body;

      // Bloquear criação de Link-in-Bio (feature em desenvolvimento)
      if (type === "bio") {
        return res
          .status(403)
          .json({ error: "Link-in-Bio estará disponível em breve" });
      }

      // Sanitizar inputs
      const sanitizedName = sanitizeString(name, 100);
      if (!sanitizedName) {
        return res.status(400).json({ error: "Nome é obrigatório" });
      }

      // Sanitizar e validar slug
      const sanitizedSlug = slug
        ? sanitizeSlug(slug)
        : sanitizeSlug(sanitizedName);
      if (!sanitizedSlug) {
        return res.status(400).json({ error: "Slug inválido" });
      }

      // Verificar se slug já existe
      const existingLink = await prisma.link.findUnique({
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
        ? sanitizeString(defaultMessage, 500)
        : "";

      // 1. Inserir na tabela 'links'
      const link = await prisma.link.create({
        data: {
          name: sanitizedName,
          slug: sanitizedSlug,
          type,
          defaultMessage: sanitizedMessage,
          bioTitle: bioTitle ? sanitizeString(bioTitle, 100) : null,
          bioDescription: bioDescription
            ? sanitizeString(bioDescription, 500)
            : null,
          bioAvatarUrl: bioAvatarUrl ? sanitizeUrl(bioAvatarUrl) : null,
          currentAgentIndex: 0,
          clicks: 0,
          userId: req.user!.id,
        },
      });

      // 2. Inserir dependentes baseados no tipo
      if (type === "direct" && agents?.length > 0) {
        const agentsData = agents.map((a: any) => {
          const sanitizedPhone = validateAndSanitizePhone(a.phone);
          if (!sanitizedPhone) {
            throw new Error(`Telefone inválido: ${a.phone}`);
          }

          return {
            linkId: link.id,
            name: sanitizeString(a.name, 100),
            phone: sanitizedPhone,
          };
        });
        await prisma.agent.createMany({ data: agentsData });
      } else if (type === "bio" && bioButtons?.length > 0) {
        const buttonsData = bioButtons.map((b: any) => {
          const sanitizedPhone = validateAndSanitizePhone(b.phone);
          if (!sanitizedPhone) {
            throw new Error(`Telefone inválido: ${b.phone}`);
          }

          return {
            linkId: link.id,
            label: sanitizeString(b.label, 50),
            phone: sanitizedPhone,
            message: sanitizeString(b.message, 500),
          };
        });
        await prisma.bioButton.createMany({ data: buttonsData });
      }

      res.status(201).json(link);
    } catch (error: any) {
      console.error("Erro ao criar link:", error);
      res.status(400).json({ error: error.message });
    }
  },
);

// --- MOTOR DE REDIRECIONAMENTO (ROUND ROBIN) ---

app.get("/r/:slug", redirectLimiter, async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    // Busca o link e seus atendentes ativos
    const link = await prisma.link.findUnique({
      where: { slug },
      include: {
        agents: {
          where: { isActive: true },
        },
      },
    });

    if (!link) return res.status(404).send("Link não encontrado");

    // Incrementar cliques
    await prisma.link.update({
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
      await prisma.link.update({
        where: { id: link.id },
        data: { currentAgentIndex: agentIndex + 1 },
      });

      const waUrl = `https://wa.me/${selectedAgent.phone}?text=${encodeURIComponent(link.defaultMessage || "")}`;
      return res.redirect(waUrl);
    }

    // Se for Bio, redireciona para a página de preview do front-end
    return res.redirect(`${process.env.FRONTEND_URL}/bio/${slug}`);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Reativar atendentes desabilitados (quando faz upgrade)
app.post(
  "/api/links/:linkId/reactivate-agents",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { linkId } = req.params;

      // Verificar se o link pertence ao usuário
      const link = await prisma.link.findFirst({
        where: {
          id: linkId,
          userId: req.user!.id,
        },
      });

      if (!link) {
        return res.status(404).json({ error: "Link não encontrado" });
      }

      // Buscar limite de atendentes do plano atual
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        include: {
          subscriptionPlan: {
            select: { features: true },
          },
        },
      });

      if (!user) {
        return res.status(404).json({ error: "Usuário não encontrado" });
      }

      const maxAttendants =
        (user.subscriptionPlan?.features as any)?.max_attendants || 1;

      // Contar atendentes ativos
      const activeCount = await prisma.agent.count({
        where: {
          linkId,
          isActive: true,
        },
      });

      const availableSlots = maxAttendants - activeCount;

      if (availableSlots > 0) {
        // Reativar atendentes desabilitados até o limite
        const inactiveAgents = await prisma.agent.findMany({
          where: {
            linkId,
            isActive: false,
          },
          take: availableSlots,
        });

        await prisma.agent.updateMany({
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
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  },
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`🚀 Back-end ZapLinker rodando na porta ${PORT}`),
);
