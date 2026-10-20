import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ROL, Roles } from '../auth/roles';
import { BitacoraService } from './bitacora.service';
import { BitacoraResponseDto } from './dto/bitacora-response.dto';

// Auditoría: solo administrador.
@Roles(ROL.ADMIN)
@Controller('bitacora')
export class BitacoraController {
  constructor(private readonly service: BitacoraService) {}

  // Vista global de auditoría (NF04 / RF10) - pensada para administrador
  @Get()
  async findAll() {
    const entradas = await this.service.findAll();
    return entradas.map((e) => BitacoraResponseDto.fromEntity(e));
  }

  // Historial de un reporte específico
  @Get('reporte/:idReporte')
  async findByReporte(@Param('idReporte', ParseIntPipe) idReporte: number) {
    const entradas = await this.service.findByReporte(idReporte);
    return entradas.map((e) => BitacoraResponseDto.fromEntity(e));
  }
}
