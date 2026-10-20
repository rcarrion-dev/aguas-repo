import { Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt';
import { NotificacionesService } from './notificaciones.service';
import { NotificacionResponseDto } from './dto/notificacion-response.dto';

@ApiBearerAuth()
// Cada quien ve y marca solo SUS notificaciones (el token lo exige el
// guard global de AuthModule).
@Controller('notificaciones')
export class NotificacionesController {
  constructor(private readonly service: NotificacionesService) {}

  @Get('mias')
  async findMias(@CurrentUser() user: JwtPayload) {
    const notificaciones = await this.service.findByUsuario(Number(user.sub));
    return notificaciones.map((e) => NotificacionResponseDto.fromEntity(e));
  }

  @Patch(':id/leer')
  async marcarLeida(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
  ) {
    const notificacion = await this.service.marcarLeida(id, Number(user.sub));
    return NotificacionResponseDto.fromEntity(notificacion);
  }
}
