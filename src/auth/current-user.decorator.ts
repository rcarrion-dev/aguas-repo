import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import type { JwtPayload } from './jwt';
import type { RequestConUsuario } from './request-con-usuario';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const user = context.switchToHttp().getRequest<RequestConUsuario>().user;
    // Solo pasa si se usa en un endpoint @Public(); mejor un 401 claro.
    if (!user) {
      throw new UnauthorizedException('Falta el token');
    }
    return user;
  },
);
