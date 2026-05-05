"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeUrl = exports.validateUrl = exports.validateAndSanitizePhone = exports.validateAndSanitizeEmail = exports.sanitizeSlug = exports.sanitizeString = void 0;
const validator_1 = __importDefault(require("validator"));
const sanitizeString = (input, maxLength = 255) => {
    if (!input || typeof input !== 'string')
        return '';
    return validator_1.default.escape(validator_1.default.trim(input)).substring(0, maxLength);
};
exports.sanitizeString = sanitizeString;
const sanitizeSlug = (slug) => {
    if (!slug || typeof slug !== 'string')
        return '';
    return slug
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // Remove acentos
        .replace(/[^a-z0-9-]/g, '')
        .replace(/--+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 100);
};
exports.sanitizeSlug = sanitizeSlug;
const validateAndSanitizeEmail = (email) => {
    if (!email || typeof email !== 'string')
        return null;
    const normalized = validator_1.default.normalizeEmail(email, {
        gmail_remove_dots: false,
        gmail_remove_subaddress: false,
    });
    if (!normalized || !validator_1.default.isEmail(normalized))
        return null;
    if (normalized.length > 254)
        return null;
    return normalized;
};
exports.validateAndSanitizeEmail = validateAndSanitizeEmail;
const validateAndSanitizePhone = (phone) => {
    if (!phone || typeof phone !== 'string')
        return null;
    // Remove tudo exceto números
    const cleaned = phone.replace(/\D/g, '');
    // Valida formato brasileiro (11 ou 13 dígitos)
    if (cleaned.length !== 11 && cleaned.length !== 13)
        return null;
    // Valida se começa com código válido
    if (cleaned.length === 13 && !cleaned.startsWith('55'))
        return null;
    return cleaned;
};
exports.validateAndSanitizePhone = validateAndSanitizePhone;
const validateUrl = (url) => {
    if (!url || typeof url !== 'string')
        return false;
    return validator_1.default.isURL(url, {
        protocols: ['http', 'https'],
        require_protocol: true,
        require_valid_protocol: true,
    });
};
exports.validateUrl = validateUrl;
const sanitizeUrl = (url) => {
    if (!(0, exports.validateUrl)(url))
        return null;
    try {
        const parsed = new URL(url);
        // Apenas http e https
        if (!['http:', 'https:'].includes(parsed.protocol))
            return null;
        return parsed.toString();
    }
    catch {
        return null;
    }
};
exports.sanitizeUrl = sanitizeUrl;
