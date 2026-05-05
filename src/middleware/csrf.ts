import { doubleCsrf } from 'csrf-csrf';
import cookieParser from 'cookie-parser';

const csrfSecret = process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production';

// Validar que o secret tem o tamanho correto
if (csrfSecret.length < 32) {
  throw new Error('CSRF_SECRET must be at least 32 characters long');
}

const isProduction = process.env.NODE_ENV === 'production';

const csrfProtection = doubleCsrf({
  getSecret: () => csrfSecret,
  // __Host- prefix requer HTTPS, então só usar em produção
  cookieName: isProduction ? '__Host-csrf-token' : 'csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    path: '/',
    secure: isProduction,
    httpOnly: true,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req) => req.ip || 'unknown',
});

const generateToken = csrfProtection.generateCsrfToken;
const doubleCsrfProtection = csrfProtection.doubleCsrfProtection;

export { cookieParser, doubleCsrfProtection, generateToken };
