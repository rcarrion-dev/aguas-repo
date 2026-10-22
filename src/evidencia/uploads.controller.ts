import { Controller, Get, Param, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt';
import { contentTypeDe } from '../common/storage/evidencia-storage';
import { EvidenciaService } from './evidencia.service';

// GET /uploads/<archivo> → el archivo de evidencia.
// Misma URL que antes (la app y el dashboard ya la tienen guardada), pero
// ahora pide token (guard global) y solo entrega evidencia de reportes que
// el usuario puede ver.
@ApiTags('evidencia')
@ApiBearerAuth()
@Controller('uploads')
export class UploadsController {
  constructor(private readonly service: EvidenciaService) {}

  @Get(':archivo')
  async descargar(
    @Param('archivo') archivo: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const ruta = await this.service.archivoVisible(archivo, user);
    res.set({
      'Content-Type': contentTypeDe(archivo),
      // Segunda capa: el navegador no "adivina" el tipo, y si alguna vez se
      // colara un archivo raro, no puede ejecutar scripts.
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    });
    res.sendFile(ruta, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({
          message: 'Archivo no encontrado',
          error: 'Not Found',
          statusCode: 404,
        });
      }
    });
  }
}
