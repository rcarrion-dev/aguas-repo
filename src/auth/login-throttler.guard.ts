import { Injectable } from '@nestjs/common';
import { ThrottlerException, ThrottlerGuard } from '@nestjs/throttler';
import { DEMASIADOS_INTENTOS } from './mensajes';

// Límite de intentos para /auth (OWASP A07): sin esto se pueden probar
// miles de contraseñas por correo sin que nadie se entere.
//
// Se cuenta por IP + correo, no solo por IP: el dashboard hace el login
// desde su propio servidor, así que todos los administradores llegan con la
// misma IP y un límite solo por IP los bloquearía entre ellos.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req.body as { correo?: unknown } | undefined;
    const correo =
      typeof body?.correo === 'string' ? body.correo.trim().toLowerCase() : '';
    const ip = typeof req.ip === 'string' ? req.ip : 'sin-ip';
    return Promise.resolve(`${ip}|${correo}`);
  }

  protected throwThrottlingException(): Promise<void> {
    throw new ThrottlerException(DEMASIADOS_INTENTOS);
  }
}
