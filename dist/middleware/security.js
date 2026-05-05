"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.securityMiddlewares = void 0;
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
// 1. CORS Restritivo
const corsOptions = {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
// 2. Rate Limiting
const generalLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100,
    message: 'Muitas requisições, tente novamente mais tarde'
});
const authLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Muitas tentativas de login, tente novamente em 15 minutos'
});
const webhookLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minuto
    max: 100,
    message: 'Muitas requisições de webhook'
});
// 3. Aplicar no app
const securityMiddlewares = (app) => {
    // Helmet para headers de segurança
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                scriptSrc: ["'self'"],
                imgSrc: ["'self'", 'data:', 'https:'],
            },
        },
    }));
    // CORS restritivo
    app.use((0, cors_1.default)(corsOptions));
    // Rate limiting geral
    app.use('/api/', generalLimiter);
    // Rate limiting específico para auth
    app.use('/api/auth/login', authLimiter);
    app.use('/api/auth/register', authLimiter);
    // Rate limiting para webhook
    app.use('/api/payments/webhook', webhookLimiter);
    // HTTPS redirect em produção
    app.use((req, res, next) => {
        if (req.header('x-forwarded-proto') !== 'https' && process.env.NODE_ENV === 'production') {
            res.redirect(`https://${req.header('host')}${req.url}`);
        }
        else {
            next();
        }
    });
    // Timeout de requisições
    app.use((req, res, next) => {
        req.setTimeout(30000); // 30 segundos
        next();
    });
};
exports.securityMiddlewares = securityMiddlewares;
// 4. Error Handler Seguro
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production'
            ? 'Erro interno do servidor'
            : err.message
    });
};
exports.errorHandler = errorHandler;
