import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { RolesGuard } from './roles.guard';
import { TokensService } from './tokens.service';

export const UN_MINUTO = 60_000;
export const INTENTOS_POR_MINUTO = 5;

@Module({
  imports: [
    DatabaseModule,
    // Correo para los códigos de recuperación de contraseña.
    MailModule,
    // Las llaves se pasan en cada firma/verificación (TokensService), una
    // distinta para access y refresh.
    JwtModule.register({}),
    // Solo lo usa LoginThrottlerGuard en /auth; no es un límite global.
    ThrottlerModule.forRoot([{ ttl: UN_MINUTO, limit: INTENTOS_POR_MINUTO }]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    TokensService,
    LoginThrottlerGuard,
    // Guards globales: aplican a TODOS los endpoints de la API.
    // El orden importa: primero se valida el token, luego el rol.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
