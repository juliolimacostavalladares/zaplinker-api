import { doubleCsrf } from 'csrf-csrf';
import cookieParser from 'cookie-parser';

const csrfProtection = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || 'default-csrf-secret-change-in-production',
  cookieName: '__Host-psifi.x-csrf-token',
  cookieOptions: {
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  getSessionIdentifier: (req) => req.ip || 'unknown',
});

const generateToken = csrfProtection.generateCsrfToken;
const doubleCsrfProtection = csrfProtection.doubleCsrfProtection;

export { cookieParser, doubleCsrfProtection, generateToken };
