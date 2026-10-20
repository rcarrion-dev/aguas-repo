import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestConUsuario } from './request-con-usuario';
import { NombreRol, PUBLIC_KEY, ROLES_KEY } from './roles';

// Guard GLOBAL que corre después de AuthGuard: si el endpoint tiene
// @Roles(...), revisa que el rol del token sea uno de esos.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const objetivos = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, objetivos)) {
      return true;
    }
    const permitidos = this.reflector.getAllAndOverride<NombreRol[]>(
      ROLES_KEY,
      objetivos,
    );
    if (!permitidos || permitidos.length === 0) {
      return true;
    }
    const user = context.switchToHttp().getRequest<RequestConUsuario>().user;
    if (!user || !permitidos.includes(user.rol as NombreRol)) {
      throw new ForbiddenException('No tienes permiso para hacer esto');
    }
    return true;
  }
}
