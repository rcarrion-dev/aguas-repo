import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { memoryStorage } from 'multer';
import type { Request } from 'express';

// Todo lo de guardar y servir archivos de evidencia vive aquí: el controller
// solo recibe el archivo y el service decide a qué reporte pertenece.

export const CINCO_MB = 5 * 1024 * 1024;
export const MAX_ARCHIVOS = 1; // una sola evidencia por reporte

export const PREFIJO_URL = '/uploads/';

export function carpetaUploads(): string {
  return resolve(process.env.UPLOADS_DIR ?? join(process.cwd(), 'uploads'));
}

export type FormatoEvidencia = 'png' | 'jpg' | 'gif' | 'webp' | 'pdf';

interface TipoPermitido {
  formato: FormatoEvidencia;
  contentType: string;
  extensiones: string[];
  // Los primeros bytes del archivo ("número mágico"). El mimetype y la
  // extensión los decide el cliente; los bytes no se pueden fingir sin que
  // el archivo deje de ser una imagen o un PDF.
  coincide: (b: Buffer) => boolean;
}

const TIPOS: TipoPermitido[] = [
  {
    formato: 'png',
    contentType: 'image/png',
    extensiones: ['.png'],
    coincide: (b) =>
      b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  {
    formato: 'jpg',
    contentType: 'image/jpeg',
    extensiones: ['.jpg', '.jpeg'],
    coincide: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    formato: 'gif',
    contentType: 'image/gif',
    extensiones: ['.gif'],
    coincide: (b) => b.subarray(0, 4).toString('latin1') === 'GIF8',
  },
  {
    formato: 'webp',
    contentType: 'image/webp',
    extensiones: ['.webp'],
    coincide: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    formato: 'pdf',
    contentType: 'application/pdf',
    extensiones: ['.pdf'],
    coincide: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
];

const EXTENSIONES = TIPOS.flatMap((t) => t.extensiones);
// Algunos clientes (Postman en Windows, ciertos navegadores) mandan
// "application/octet-stream" para un archivo válido. Se acepta porque la
// prueba real son los bytes.
const MIMETYPES = [
  ...TIPOS.map((t) => t.contentType),
  'image/jpg',
  'application/octet-stream',
];

const MENSAJE_TIPO =
  'Formato de archivo no permitido. Solo se aceptan PDF o imágenes (jpg, png, gif, webp).';

// Opciones de multer para FilesInterceptor. El archivo se queda en memoria
// (máx. 5 MB) hasta que se valida; nunca se escribe en disco con el nombre
// ni el tipo que mandó el cliente.
export const evidenciaUploadOptions = {
  storage: memoryStorage(),
  limits: { fileSize: CINCO_MB, files: MAX_ARCHIVOS },
  fileFilter: (
    _req: Request,
    file: Express.Multer.File,
    cb: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    // Las DOS tienen que ser válidas (antes bastaba una, y así pasaba un
    // .html declarado como image/png).
    const extension = extname(file.originalname).toLowerCase();
    if (
      !EXTENSIONES.includes(extension) ||
      !MIMETYPES.includes(file.mimetype)
    ) {
      cb(new BadRequestException(MENSAJE_TIPO), false);
      return;
    }
    cb(null, true);
  },
};

export interface EvidenciaValidada {
  file: Express.Multer.File;
  tipo: TipoPermitido;
}

// Revisa los bytes y que coincidan con la extensión. Se llama ANTES de
// crear el reporte, para que un archivo inválido no deje un reporte a medias.
export function validarEvidencia(
  files: Express.Multer.File[] | undefined,
): EvidenciaValidada[] {
  if (!files || files.length === 0) {
    throw new BadRequestException('Debes adjuntar un archivo de evidencia.');
  }
  return files.map((file) => {
    const extension = extname(file.originalname).toLowerCase();
    const tipo = TIPOS.find((t) => t.coincide(file.buffer));
    if (!tipo || !tipo.extensiones.includes(extension)) {
      throw new BadRequestException(MENSAJE_TIPO);
    }
    return { file, tipo };
  });
}

// Nombre aleatorio (UUID) + la extensión que dicen los BYTES, no el cliente.
export async function guardarEvidencia(
  evidencia: EvidenciaValidada,
): Promise<{ url: string; formato: FormatoEvidencia; esPdf: boolean }> {
  const nombre = `${randomUUID()}.${evidencia.tipo.formato}`;
  await mkdir(carpetaUploads(), { recursive: true });
  await writeFile(join(carpetaUploads(), nombre), evidencia.file.buffer, {
    flag: 'wx',
  });
  return {
    url: PREFIJO_URL + nombre,
    formato: evidencia.tipo.formato,
    esPdf: evidencia.tipo.formato === 'pdf',
  };
}

// Nombres válidos: los UUID nuevos y los que generaba la versión anterior
// ("1712345678-123456789.png", incluso con .JPG). Nada de "/", "..", ni
// otras extensiones.
const NOMBRE_VALIDO = /^[A-Za-z0-9-]{1,100}\.(png|jpe?g|gif|webp|pdf)$/i;

export function nombreArchivoValido(nombre: string): boolean {
  return NOMBRE_VALIDO.test(nombre) && basename(nombre) === nombre;
}

export function rutaEvidencia(nombre: string): string {
  return join(carpetaUploads(), nombre);
}

export function contentTypeDe(nombre: string): string {
  const extension = extname(nombre).toLowerCase();
  return (
    TIPOS.find((t) => t.extensiones.includes(extension))?.contentType ??
    'application/octet-stream'
  );
}

// Borra el archivo de una URL "/uploads/<nombre>". Si ya no existe, no pasa
// nada: lo importante es que no quede accesible.
export async function borrarEvidencia(url: string | null | undefined) {
  if (!url?.startsWith(PREFIJO_URL)) return;
  const nombre = url.slice(PREFIJO_URL.length);
  if (!nombreArchivoValido(nombre)) return;
  await unlink(rutaEvidencia(nombre)).catch(() => undefined);
}
