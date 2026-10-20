import { PartialType } from '@nestjs/mapped-types';
import { CreateReporteDto } from './create-reporte.dto';

// El autor ya no está en CreateReporteDto (viene del token), y el "estado"
// no se toca aquí: para eso existe /reportes/:id/moderar.
export class UpdateReporteDto extends PartialType(CreateReporteDto) {}
