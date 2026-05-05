import validator from 'validator';

export const sanitizeString = (input: string, maxLength: number = 255): string => {
  if (!input || typeof input !== 'string') return '';

  return validator.escape(
    validator.trim(input)
  ).substring(0, maxLength);
};

export const sanitizeSlug = (slug: string): string => {
  if (!slug || typeof slug !== 'string') return '';

  return slug
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Remove acentos
    .replace(/[^a-z0-9-]/g, '')
    .replace(/--+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100);
};

export const validateAndSanitizeEmail = (email: string): string | null => {
  if (!email || typeof email !== 'string') return null;

  const normalized = validator.normalizeEmail(email, {
    gmail_remove_dots: false,
    gmail_remove_subaddress: false,
  });

  if (!normalized || !validator.isEmail(normalized)) return null;
  if (normalized.length > 254) return null;

  return normalized;
};

export const validateAndSanitizePhone = (phone: string): string | null => {
  if (!phone || typeof phone !== 'string') return null;

  // Remove tudo exceto números
  const cleaned = phone.replace(/\D/g, '');

  // Valida formato brasileiro (11 ou 13 dígitos)
  if (cleaned.length !== 11 && cleaned.length !== 13) return null;

  // Valida se começa com código válido
  if (cleaned.length === 13 && !cleaned.startsWith('55')) return null;

  return cleaned;
};

export const validateUrl = (url: string): boolean => {
  if (!url || typeof url !== 'string') return false;

  return validator.isURL(url, {
    protocols: ['http', 'https'],
    require_protocol: true,
    require_valid_protocol: true,
  });
};

export const sanitizeUrl = (url: string): string | null => {
  if (!validateUrl(url)) return null;

  try {
    const parsed = new URL(url);
    // Apenas http e https
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
};
