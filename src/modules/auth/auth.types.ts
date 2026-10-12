import type { RegisterDto, LoginDto } from './dto/auth.dto';
import type { PublicUser } from '../users/users.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export type AuthUserView = PublicUser;

export interface AuthenticatedUser {
  id: number;
  email: string;
  fullName: string;
}

/**
 * Public contract for the AuthService.
 * Implementation lives in auth.service.ts; this interface lets us mock it cleanly in tests.
 */
export interface IAuthService {
  register(input: RegisterDto): Promise<{ user: AuthUserView; tokens: AuthTokens }>;
  login(input: LoginDto): Promise<{ user: AuthUserView; tokens: AuthTokens }>;
  refresh(refreshToken: string): Promise<AuthTokens>;
  logout(userId: number): Promise<void>;
  me(userId: number): Promise<AuthUserView>;
}
