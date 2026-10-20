import { IsIn, IsNotEmpty, IsString, ValidateIf } from 'class-validator';
import { EstadoReporte } from '../entities/reporte.entity';

export class ModerarReporteDto {
  @IsIn([EstadoReporte.VERIFICADO, EstadoReporte.RECHAZADO])
  resultado!: EstadoReporte.VERIFICADO | EstadoReporte.RECHAZADO;

  @ValidateIf(
    (dto: ModerarReporteDto) => dto.resultado === EstadoReporte.RECHAZADO,
  )
  @IsNotEmpty()
  @IsString()
  comentario?: string;
}
