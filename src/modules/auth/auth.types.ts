import type { RegisterDto, LoginDto } from './dto/auth.dto';
import type { PublicUser } from '../users/users.service';

/** Par de tokens JWT emitidos tras autenticar o refrescar una sesión. */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/** Vista pública del usuario devuelta en respuestas de autenticación. */
export type AuthUserView = PublicUser;

/**
 * Resultado de un registro de cuenta.
 *
 * `tokens` es `null` cuando `EMAIL_VERIFICATION_REQUIRED` está activo: la
 * cuenta queda pendiente de confirmar y no se emite ninguna sesión hasta que el
 * usuario valida su correo.
 */
export interface RegisterResult {
  user: AuthUserView;
  tokens: AuthTokens | null;
  emailVerificationRequired: boolean;
}

/** Representación básica de un usuario autenticado. */
export interface AuthenticatedUser {
  id: number;
  email: string;
  fullName: string;
}

/**
 * Contrato público para `AuthService`.
 * La implementación vive en `auth.service.ts`; esta interfaz facilita simularla en pruebas.
 */
export interface IAuthService {
  register(input: RegisterDto): Promise<RegisterResult>;
  login(input: LoginDto): Promise<{ user: AuthUserView; tokens: AuthTokens }>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  logout(userId: number, refreshToken: string): Promise<void>;
  logoutAll(userId: number): Promise<void>;
  me(userId: number): Promise<AuthUserView>;
  verifyEmail(
    token: string,
  ): Promise<{ emailVerified: boolean; user: PublicUser; tokens: AuthTokens }>;
  forgotPassword(email: string): Promise<{ emailSent: boolean }>;
  resendVerification(email: string): Promise<{ emailSent: boolean }>;
  resetPassword(token: string, password: string): Promise<{ passwordUpdated: boolean }>;
}
