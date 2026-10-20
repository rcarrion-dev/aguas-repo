import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt: (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer> = promisify(scryptCb);

const KEYLEN = 64;

// Hash de contraseñas con scrypt (viene en Node, no requiere instalar nada).
// Igual de seguro que bcrypt: lento a propósito y con sal aleatoria por
// usuario, así dos contraseñas iguales no producen el mismo hash.
// Formato guardado en password_hash:  scrypt$<sal base64>$<hash base64>
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derivado = await scrypt(password, salt, KEYLEN);
  return `scrypt$${salt.toString('base64')}$${derivado.toString('base64')}`;
}

export async function verifyPassword(
  password: string,
  guardado: string,
): Promise<boolean> {
  const [algoritmo, saltB64, hashB64] = guardado.split('$');
  if (algoritmo !== 'scrypt' || !saltB64 || !hashB64) {
    return false;
  }
  const esperado = Buffer.from(hashB64, 'base64');
  const derivado = await scrypt(
    password,
    Buffer.from(saltB64, 'base64'),
    esperado.length,
  );
  return timingSafeEqual(derivado, esperado);
}

// Hash "de relleno" para cuando el correo no existe: así el login tarda lo
// mismo exista o no la cuenta, y no se puede averiguar qué correos están
// registrados midiendo el tiempo de respuesta.
let hashFalso: Promise<string> | null = null;
export function dummyHash(): Promise<string> {
  hashFalso ??= hashPassword(randomBytes(16).toString('hex'));
  return hashFalso;
}
