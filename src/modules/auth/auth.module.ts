import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { UsersModule } from '../users/users.module';
import { ReadingsModule } from '../readings/readings.module';
import type { EnvSchema } from '../../config/env.validation';

@Module({
  imports: [
    UsersModule,
    ReadingsModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<EnvSchema, true>) => {
        const secret = config.get('JWT_SECRET', { infer: true });
        if (!secret) throw new Error('JWT_SECRET is not configured');
        return {
          secret,
          signOptions: { expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
