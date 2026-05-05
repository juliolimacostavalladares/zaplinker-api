"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeSQLInput = exports.validate = exports.checkoutSchema = exports.createLinkSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
// Validação de Autenticação
exports.registerSchema = zod_1.z.object({
    email: zod_1.z.string()
        .email('Email inválido')
        .max(255, 'Email muito longo'),
    password: zod_1.z.string()
        .min(8, 'Senha deve ter no mínimo 8 caracteres')
        .max(100, 'Senha muito longa')
        .regex(/[A-Z]/, 'Senha deve conter pelo menos uma letra maiúscula')
        .regex(/[a-z]/, 'Senha deve conter pelo menos uma letra minúscula')
        .regex(/[0-9]/, 'Senha deve conter pelo menos um número')
        .regex(/[^A-Za-z0-9]/, 'Senha deve conter pelo menos um caractere especial'),
    name: zod_1.z.string()
        .min(2, 'Nome deve ter no mínimo 2 caracteres')
        .max(100, 'Nome muito longo')
        .regex(/^[a-zA-ZÀ-ÿ\s]+$/, 'Nome deve conter apenas letras')
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Email inválido'),
    password: zod_1.z.string().min(1, 'Senha é obrigatória')
});
// Validação de Links
exports.createLinkSchema = zod_1.z.object({
    name: zod_1.z.string()
        .min(1, 'Nome é obrigatório')
        .max(100, 'Nome muito longo'),
    slug: zod_1.z.string()
        .max(100, 'Slug muito longo')
        .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens')
        .optional(),
    type: zod_1.z.enum(['direct', 'bio'], {
        errorMap: () => ({ message: 'Tipo deve ser "direct" ou "bio"' })
    }),
    defaultMessage: zod_1.z.string().max(500, 'Mensagem muito longa').optional(),
    bioTitle: zod_1.z.string().max(100, 'Título muito longo').optional(),
    bioDescription: zod_1.z.string().max(500, 'Descrição muito longa').optional(),
    bioAvatarUrl: zod_1.z.string().url('URL inválida').optional(),
    agents: zod_1.z.array(zod_1.z.object({
        name: zod_1.z.string().min(1, 'Nome do agente é obrigatório').max(100),
        phone: zod_1.z.string()
            .regex(/^\+?[1-9]\d{1,14}$/, 'Telefone inválido (formato E.164)')
    })).optional(),
    bioButtons: zod_1.z.array(zod_1.z.object({
        label: zod_1.z.string().min(1, 'Label é obrigatório').max(50),
        phone: zod_1.z.string()
            .regex(/^\+?[1-9]\d{1,14}$/, 'Telefone inválido (formato E.164)'),
        message: zod_1.z.string().max(500, 'Mensagem muito longa').optional()
    })).optional()
});
// Validação de Pagamentos
exports.checkoutSchema = zod_1.z.object({
    planId: zod_1.z.string()
        .min(1, 'ID do plano é obrigatório')
        .max(50, 'ID do plano inválido')
        .regex(/^[a-zA-Z0-9-]+$/, 'ID do plano contém caracteres inválidos')
});
// Middleware de validação
const validate = (schema) => {
    return (req, res, next) => {
        try {
            schema.parse(req.body);
            next();
        }
        catch (error) {
            if (error instanceof zod_1.z.ZodError) {
                return res.status(400).json({
                    error: 'Dados inválidos',
                    details: error.issues.map(e => ({
                        field: e.path.join('.'),
                        message: e.message
                    }))
                });
            }
            next(error);
        }
    };
};
exports.validate = validate;
// Sanitização de inputs SQL
const sanitizeSQLInput = (input) => {
    return input.replace(/[%_\\]/g, '\\$&');
};
exports.sanitizeSQLInput = sanitizeSQLInput;
