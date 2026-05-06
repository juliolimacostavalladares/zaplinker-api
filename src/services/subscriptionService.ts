import { prisma } from '../lib/prisma';

export const subscriptionService = {
  /**
   * Busca o plano gratuito
   */
  async getFreePlan() {
    return await prisma.subscriptionPlan.findUnique({
      where: { name: 'Gratuito' }
    });
  },

  /**
   * Verifica se a assinatura do usuário expirou
   */
  isSubscriptionExpired(expiresAt: Date | null, status: string | null): boolean {
    if (!expiresAt || !status) return false;
    return new Date(expiresAt) < new Date() && status === 'active';
  },

  /**
   * Downgrade usuário para plano gratuito
   */
  async downgradeToFreePlan(userId: string) {
    const freePlan = await this.getFreePlan();

    if (!freePlan) {
      throw new Error('Free plan not found');
    }

    return await prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionPlanId: freePlan.id,
        subscriptionStatus: 'expired',
        subscriptionExpiresAt: null
      },
      include: {
        subscriptionPlan: true
      }
    });
  }
};
