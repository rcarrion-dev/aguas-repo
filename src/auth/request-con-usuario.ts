import type { Request } from 'express';
import type { JwtPayload } from './jwt';

// La petición después de pasar por AuthGuard: trae al usuario del token.
export interface RequestConUsuario extends Request {
  user?: JwtPayload;
}
