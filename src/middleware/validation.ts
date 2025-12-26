import { z } from 'zod';

// Validação de Autenticação
export const registerSchema = z.object({
  email: z.string()
    .email('Email inválido')
    .max(255, 'Email muito longo'),
  
  password: z.string()
    .min(8, 'Senha deve ter no mínimo 8 caracteres')
    .max(100, 'Senha muito longa')
    .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
    .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
    .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
    .regex(/[^A-Za-z0-9]/, 'Senha deve conter pelo menos um caractere especial'),
  
  name: z.string()
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome muito longo')
    .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'Nome deve conter apenas letras')
});

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Senha é obrigatória')
});

// Validação de Links
export const createLinkSchema = z.object({
  name: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome muito longo'),
  
  slug: z.string()
    .max(100, 'Slug muito longo')
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens')
    .optional(),
  
  type: z.enum(['direct', 'bio'], {
    errorMap: () => ({ message: 'Tipo deve ser "direct" ou "bio"' })
  }),
  
  defaultMessage: z.string().max(500, 'Mensagem muito longa').optional(),
  
  bioTitle: z.string().max(100, 'Título muito longo').optional(),
  bioDescription: z.string().max(500, 'Descrição muito longa').optional(),
  bioAvatarUrl: z.string().url('URL inválida').optional(),
  
  agents: z.array(z.object({
    name: z.string().min(1, 'Nome do agente é obrigatório').max(100),
    phone: z.string()
      .regex(/^\+?[1-9]\d{1,14}$/, 'Telefone inválido (formato E.164)')
  })).optional(),
  
  bioButtons: z.array(z.object({
    label: z.string().min(1, 'Label é obrigatório').max(50),
    phone: z.string()
      .regex(/^\+?[1-9]\d{1,14}$/, 'Telefone inválido (formato E.164)'),
    message: z.string().max(500, 'Mensagem muito longa').optional()
  })).optional()
});

// Validação de Pagamentos
export const checkoutSchema = z.object({
  planId: z.string()
    .min(1, 'ID do plano é obrigatório')
    .max(50, 'ID do plano inválido')
    .regex(/^[a-zA-Z0-9-]+$/, 'ID do plano contém caracteres inválidos')
});

// Middleware de validação
export const validate = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Dados inválidos',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      next(error);
    }
  };
};

// Sanitização de inputs SQL
export const sanitizeSQLInput = (input: string): string => {
  return input.replace(/[%_\\]/g, '\\$&');
};
