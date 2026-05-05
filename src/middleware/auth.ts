import jwt from "jsonwebtoken";
import { Response, NextFunction } from "express";
import { AuthRequest } from "../types";
import { prisma } from "../lib/prisma";

export const authMiddleware = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Tentar obter token do cookie primeiro, depois do header (para compatibilidade)
    let token = req.cookies?.["auth-token"];

    if (!token) {
      const authHeader = req.get("Authorization");
      token = authHeader?.replace("Bearer ", "");
    }

    if (!token) {
      return res.status(401).json({ error: "Token de acesso requerido" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string;
    };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        subscriptionPlan: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Token inválido" });
    }

    // Verificar se a assinatura expirou
    if (
      user.subscriptionExpiresAt &&
      new Date(user.subscriptionExpiresAt) < new Date() &&
      user.subscriptionStatus === "active"
    ) {
      const freePlan = await prisma.subscriptionPlan.findUnique({
        where: { name: "Gratuito" },
      });

      if (freePlan) {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionPlanId: freePlan.id,
            subscriptionStatus: "expired",
            subscriptionExpiresAt: null,
          },
        });

        // Atualizar objeto user
        user.subscriptionPlanId = freePlan.id;
        user.subscriptionStatus = "expired";
        user.subscriptionExpiresAt = null;
      }
    }

    req.user = user as any;
    next();
  } catch (error) {
    res.status(401).json({ error: "Token inválido" });
  }
};
