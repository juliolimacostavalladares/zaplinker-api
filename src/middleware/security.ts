import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// 1. CORS Restritivo
const corsOptions = {
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// 2. Rate Limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100,
  message: 'Muitas requisições, tente novamente mais tarde'
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Muitas tentativas de login, tente novamente em 15 minutos'
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 100,
  message: 'Muitas requisições de webhook'
});

// 3. Aplicar no app
export const securityMiddlewares = (app: express.Application) => {
  // Helmet para headers de segurança
  app.use(helmet({
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
  app.use(cors(corsOptions));

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
    } else {
      next();
    }
  });

  // Timeout de requisições
  app.use((req, res, next) => {
    req.setTimeout(30000); // 30 segundos
    next();
  });
};

// 4. Error Handler Seguro
export const errorHandler = (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' 
      ? 'Erro interno do servidor' 
      : err.message
  });
};
