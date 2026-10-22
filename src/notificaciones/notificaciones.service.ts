import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notificacion } from './entities/notificacion.entity';
import { UsuariosService } from '../usuarios/usuarios.service';
import { Reporte } from '../reportes/entities/reporte.entity';

@Injectable()
export class NotificacionesService {
  constructor(
    @InjectRepository(Notificacion)
    private readonly repository: Repository<Notificacion>,
    private readonly usuariosService: UsuariosService,
  ) {}

  async crear(
    idUsuario: number,
    reporte: Reporte,
    tipo: string,
    titulo: string,
    mensaje: string,
    motivo?: string,
  ): Promise<Notificacion> {
    const usuario = await this.usuariosService.findOne(idUsuario);

    const notificacion = this.repository.create({
      usuario,
      reporte,
      tipo,
      titulo,
      mensaje,
      motivo,
    });

    return this.repository.save(notificacion);
  }

  findByUsuario(idUsuario: number): Promise<Notificacion[]> {
    return this.repository.find({
      where: { usuario: { idUsuario } },
      relations: ['reporte'],
      order: { fechaNotificacion: 'DESC' },
    });
  }

  async marcarLeida(id: number, idUsuario: number): Promise<Notificacion> {
    const notificacion = await this.repository.findOne({
      where: {
        idNotificacion: id,
        usuario: { idUsuario },
      },
      relations: ['reporte'],
    });

    if (!notificacion) {
      throw new NotFoundException(`Notificación ${id} no encontrada`);
    }

    notificacion.leida = true;
    return this.repository.save(notificacion);
  }
}
