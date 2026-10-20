import type { JwtPayload } from '../../auth/jwt';
import { ROL } from '../../auth/roles';
import { Reporte } from '../entities/reporte.entity';

export class ReporteResponseDto {
  idReporte: number;
  descripcion: string | null;
  telefonoEstafador: string | null;
  enlaceSospechoso: string | null;
  fechaReporte: string;
  empresaSuplantada: string;
  estado: string;
  evidenciaPrincipal: string;
  usuario?: { idUsuario: number; nombre: string; apellido: string };

  static fromEntity(reporte: Reporte): ReporteResponseDto {
    const dto = new ReporteResponseDto();
    dto.idReporte = reporte.idReporte;
    dto.descripcion = reporte.descripcion;
    dto.telefonoEstafador = reporte.telefonoEstafador;
    dto.enlaceSospechoso = reporte.enlaceSospechoso;
    dto.fechaReporte = reporte.fechaReporte?.toISOString();
    dto.empresaSuplantada = reporte.empresaSuplantada;
    dto.estado = reporte.estado;
    dto.evidenciaPrincipal = reporte.evidenciaPrincipal;

    // Solo id/nombre/apellido del autor: nunca correo ni passwordHash aquí,
    // el buscador público no debe filtrar datos de contacto del usuario.
    if (reporte.usuario) {
      dto.usuario = {
        idUsuario: reporte.usuario.idUsuario,
        nombre: reporte.usuario.nombre,
        apellido: reporte.usuario.apellido,
      };
    }
    return dto;
  }

  // Quién hizo un reporte es un dato personal. Admin y SSC lo necesitan para
  // moderar y dar seguimiento; un usuario de la app solo lo ve en los suyos.
  static paraLector(
    dto: ReporteResponseDto,
    lector: JwtPayload,
  ): ReporteResponseDto {
    const esPropio = String(dto.usuario?.idUsuario) === lector.sub;
    if (lector.rol === ROL.USUARIO && !esPropio) {
      delete dto.usuario;
    }
    return dto;
  }
}
