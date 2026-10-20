import {
  ArgumentsHost,
  BadRequestException,
  Catch,
  ExceptionFilter,
  HttpException,
} from '@nestjs/common';
import { Response } from 'express';
import { MulterError } from 'multer';

// Sin este filtro, un archivo > 5MB (o más de 1 archivo) truena como error
// 500 sin explicar por qué (MulterError no es un HttpException). Con esto,
// el cliente recibe un 400 con un mensaje claro, igual que cualquier otro
// error de validación.
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  catch(exception: MulterError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();

    let httpException: HttpException;
    switch (exception.code) {
      case 'LIMIT_FILE_SIZE':
        httpException = new BadRequestException(
          'Cada archivo no debe exceder 5MB.',
        );
        break;
      case 'LIMIT_FILE_COUNT':
      case 'LIMIT_UNEXPECTED_FILE':
        httpException = new BadRequestException(
          'Se permite máximo 1 archivo de evidencia por petición.',
        );
        break;
      default:
        httpException = new BadRequestException(exception.message);
    }

    response
      .status(httpException.getStatus())
      .json(httpException.getResponse());
  }
}
