export function sanitizeError(error: any): string {
  // Never expose internal error details to clients
  if (process.env.NODE_ENV === 'production') {
    return 'Ocorreu um erro. Tente novamente.';
  }

  // In development, provide more context but still sanitize
  if (error.code === 'P2002') {
    return 'Registro duplicado';
  }
  if (error.code === 'P2025') {
    return 'Registro não encontrado';
  }
  if (error.name === 'JsonWebTokenError') {
    return 'Token inválido';
  }
  if (error.name === 'TokenExpiredError') {
    return 'Token expirado';
  }

  return 'Erro ao processar requisição';
}

export function logError(error: any, context?: string) {
  // Log full error details server-side only
  console.error(`[ERROR]${context ? ` ${context}:` : ''}`, {
    message: error.message,
    code: error.code,
    stack: error.stack,
  });
}
