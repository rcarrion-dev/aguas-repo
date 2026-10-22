import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { secretoPara, type JwtPayload, type TipoToken } from './jwt';

export const ACCESS_TTL = 15 * 60; // 15 minutos
export const REFRESH_TTL = 7 * 24 * 60 * 60; // 7 días

export type ClaimsToken = Pick<JwtPayload, 'sub' | 'correo' | 'rol'>;

@Injectable()
export class TokensService {
  constructor(private readonly jwt: JwtService) {}

  firmar(claims: ClaimsToken, tipo: TipoToken): Promise<string> {
    return this.jwt.signAsync(
      { sub: claims.sub, correo: claims.correo, rol: claims.rol, type: tipo },
      {
        secret: secretoPara(tipo),
        algorithm: 'HS256',
        expiresIn: tipo === 'access' ? ACCESS_TTL : REFRESH_TTL,
      },
    );
  }

  // null si la firma no cuadra, si expiró o si es de otro tipo (un refresh
  // token no sirve como access token, y al revés).
  async verificar(token: string, tipo: TipoToken): Promise<JwtPayload | null> {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret: secretoPara(tipo),
        algorithms: ['HS256'],
      });
      return payload.type === tipo ? payload : null;
    } catch {
      return null;
    }
  }
}
