"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateToken = exports.doubleCsrfProtection = exports.cookieParser = void 0;
const csrf_csrf_1 = require("csrf-csrf");
const cookie_parser_1 = __importDefault(require("cookie-parser"));
exports.cookieParser = cookie_parser_1.default;
const csrfProtection = (0, csrf_csrf_1.doubleCsrf)({
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
exports.generateToken = generateToken;
const doubleCsrfProtection = csrfProtection.doubleCsrfProtection;
exports.doubleCsrfProtection = doubleCsrfProtection;
