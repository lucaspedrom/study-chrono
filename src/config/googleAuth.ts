/**
 * Identificador público do cliente OAuth 2.0 (Google Identity Services).
 *
 * NOTA DE ARQUITETURA E SEGURANÇA:
 * Em aplicações web client-side (SPA), o OAuth Client ID é uma chave pública
 * de identificação do app frente aos servidores do Google (enviada diretamente
 * no cabeçalho/query para accounts.google.com).
 *
 * A segurança é garantida pelas "Origens JavaScript autorizadas" no Google Cloud Console,
 * impedindo que domínios não autorizados utilizem esta identificação.
 */
export const DEFAULT_GOOGLE_CLIENT_ID: string =
  "78936423657-kpbiu801v9sutfunp0ve1gbfk0v22i7j.apps.googleusercontent.com";
