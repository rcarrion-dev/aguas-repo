import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../database/database.module';
import { CUENTA_SUSPENDIDA } from './mensajes';
import type { RequestConUsuario } from './request-con-usuario';
import { PUBLIC_KEY } from './roles';
import { TokensService } from './tokens.service';

interface CuentaRow extends RowDataPacket {
  correo: string;
  activo: number;
  nombre_rol: string;
}

// Guard GLOBAL (se registra en AuthModule): todos los endpoints piden
// "Authorization: Bearer <accessToken>", salvo los marcados con @Public().
//
// Un token firmado solo prueba quién era el usuario cuando inició sesión.
// Por eso, en cada petición se vuelve a leer la cuenta en la BD: si la
// borraron o la suspendieron, el token deja de servir al instante (antes
// seguía funcionando hasta 15 minutos), y el rol que se usa es el actual,
// no el que venía en el token.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokensService,
    @Inject(DB_POOL) private readonly pool: Pool,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const esPublico = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (esPublico) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestConUsuario>();
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) {
      throw new UnauthorizedException('Falta el token');
    }
    const payload = await this.tokens.verificar(
      header.slice('Bearer '.length),
      'access',
    );
    if (!payload) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const [rows] = await this.pool.query<CuentaRow[]>(
      `SELECT u.correo, u.activo, r.nombre_rol
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = ?`,
      [Number(payload.sub)],
    );
    const cuenta = rows[0];
    if (!cuenta) {
      throw new UnauthorizedException('Token inválido o expirado');
    }
    if (!cuenta.activo) {
      throw new ForbiddenException(CUENTA_SUSPENDIDA);
    }

    req.user = { ...payload, correo: cuenta.correo, rol: cuenta.nombre_rol };
    return true;
  }
}
