/** Lista oficial de proveedores OAuth 2.0 / OIDC soportados por la API. */
export const SUPPORTED_OAUTH_PROVIDERS = ['google', 'microsoft'] as const;

/** Identificador de proveedor OAuth soportado. */
export type SupportedOAuthProvider = (typeof SUPPORTED_OAUTH_PROVIDERS)[number];

/** Configuración pública segura expuesta al BFF/frontend para iniciar el flujo OAuth. */
export interface OAuthProviderPublicConfig {
  provider: SupportedOAuthProvider;
  enabled: boolean;
  authorizationEndpoint?: string;
  clientId?: string;
  redirectUri?: string;
  scopes?: string[];
}

/** Perfil verificado normalizado devuelto por un adaptador OAuth/OIDC. */
export interface OAuthVerifiedProfile {
  provider: SupportedOAuthProvider;
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  fullName: string | null;
}

/** Parámetros de intercambio Authorization Code + PKCE. */
export interface OAuthCodeExchangeParams {
  code: string;
  codeVerifier: string;
  redirectUri: string;
}

/** Contrato común para adaptadores OAuth 2.0 / OIDC (Google, Microsoft, etc.). */
export interface OAuthProviderAdapter {
  readonly provider: SupportedOAuthProvider;
  getPublicConfig(): OAuthProviderPublicConfig;
  exchangeCodeForProfile(params: OAuthCodeExchangeParams): Promise<OAuthVerifiedProfile>;
}
