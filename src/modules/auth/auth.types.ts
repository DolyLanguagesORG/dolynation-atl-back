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
  register(input: RegisterDto): Promise<{ user: AuthUserView; tokens: AuthTokens }>;
  login(input: LoginDto): Promise<{ user: AuthUserView; tokens: AuthTokens }>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  logout(userId: number, refreshToken: string): Promise<void>;
  logoutAll(userId: number): Promise<void>;
  me(userId: number): Promise<AuthUserView>;
}
