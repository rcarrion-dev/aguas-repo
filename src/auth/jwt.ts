// Los tokens se firman y verifican con @nestjs/jwt (ver tokens.service.ts).
// Antes estaba escrito a mano; la librería ya trae la comparación en tiempo
// constante, la validación de "exp" y la restricción del algoritmo.

export interface JwtPayload {
  sub: string;
  correo: string;
  rol: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

export type TipoToken = JwtPayload['type'];

const MINIMO = 32;

// Cada tipo de token tiene su propia llave. Si se filtra la del access
// token, no sirve para fabricar refresh tokens de 7 días (y viceversa).
const VARIABLE: Record<TipoToken, string> = {
  access: 'JWT_SECRET',
  refresh: 'JWT_REFRESH_SECRET',
};

// Las llaves se leen del .env, nunca del código: el repo es público y con
// la llave cualquiera podría fabricar tokens válidos. Se leen "tarde" (al
// firmar/verificar) porque cuando este archivo se carga todavía no se ha
// leído el .env.
export function secretoPara(tipo: TipoToken): string {
  const nombre = VARIABLE[tipo];
  const valor = process.env[nombre];
  if (!valor || valor.length < MINIMO) {
    throw new Error(
      `Falta ${nombre} en el .env (mínimo ${MINIMO} caracteres). Genera una con: ` +
        `node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"`,
    );
  }
  return valor;
}

// Se llama al arrancar para que el server truene de inmediato si falta una
// llave, y no hasta el primer login.
export function assertJwtSecrets(): void {
  secretoPara('access');
  secretoPara('refresh');
  if (secretoPara('access') === secretoPara('refresh')) {
    throw new Error('JWT_SECRET y JWT_REFRESH_SECRET deben ser distintas.');
  }
}
