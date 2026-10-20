import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../database/database.module';
import { EstadoReporte, Reporte } from './entities/reporte.entity';
import { CreateReporteDto } from './dto/create-reporte.dto';
import { UpdateReporteDto } from './dto/update-reporte.dto';
import { ModerarReporteDto } from './dto/moderar-reporte.dto';
import { ReporteResponseDto } from './dto/reporte-response.dto';
import { UsuariosService } from '../usuarios/usuarios.service';
import { BitacoraService } from '../bitacora/bitacora.service';
import { RevisionReporteService } from '../revision-reporte/revision-reporte.service';
import { NotificacionesService } from '../notificaciones/notificaciones.service';
import { EvidenciaService } from '../evidencia/evidencia.service';
import type { JwtPayload } from '../auth/jwt';
import { esAdmin } from '../auth/roles';
import type { EvidenciaValidada } from '../common/storage/evidencia-storage';

// Todas las consultas con SQL directo usan "?" para los valores (nunca
// pegarlos en el texto del SQL), así mysql2 los escapa y se evita la
// inyección SQL.

// Columnas explícitas (no "r.*"): la consulta trae solo lo que se usa.
const COLUMNAS_REPORTE = `r.id_reporte, r.id_usuario, r.descripcion,
       r.telefono_estafador, r.enlace_sospechoso, r.empresa_suplantada,
       r.fecha_reporte, r.estado, r.evidencia_principal,
       u.nombre AS u_nombre, u.apellido AS u_apellido`;

interface ReporteRow extends RowDataPacket {
  id_reporte: number;
  id_usuario: number;
  descripcion: string | null;
  telefono_estafador: string | null;
  enlace_sospechoso: string | null;
  empresa_suplantada: string;
  fecha_reporte: Date | null;
  estado: EstadoReporte;
  evidencia_principal: string;
  u_nombre: string;
  u_apellido: string;
}

function dtoDesdeFila(row: ReporteRow): ReporteResponseDto {
  const dto = new ReporteResponseDto();
  dto.idReporte = row.id_reporte;
  dto.descripcion = row.descripcion;
  dto.telefonoEstafador = row.telefono_estafador;
  dto.enlaceSospechoso = row.enlace_sospechoso;
  dto.fechaReporte = row.fecha_reporte
    ? new Date(row.fecha_reporte).toISOString()
    : '';
  dto.empresaSuplantada = row.empresa_suplantada;
  dto.estado = row.estado;
  dto.evidenciaPrincipal = row.evidencia_principal;
  dto.usuario = {
    idUsuario: row.id_usuario,
    nombre: row.u_nombre,
    apellido: row.u_apellido,
  };
  return dto;
}

@Injectable()
export class ReportesService {
  constructor(
    @InjectRepository(Reporte)
    private readonly repository: Repository<Reporte>,
    @Inject(DB_POOL)
    private readonly pool: Pool,
    private readonly usuariosService: UsuariosService,
    private readonly bitacoraService: BitacoraService,
    private readonly revisionReporteService: RevisionReporteService,
    private readonly notificacionesService: NotificacionesService,
    private readonly evidenciaService: EvidenciaService,
  ) {}

  // Crea el reporte completo de una sola vez: datos del estafador,
  //descripción y una evidencia, todo en la misma petición.
  async create(
    idUsuario: number,
    dto: CreateReporteDto,
    validadas: EvidenciaValidada[],
  ): Promise<Reporte> {
    // El token puede seguir vigente unos minutos después de suspender la
    // cuenta; aquí se revisa en la BD para cortarlo al instante.
    if (!(await this.usuariosService.estaActivo(idUsuario))) {
      throw new ForbiddenException(
        'Tu cuenta está suspendida y no puede enviar reportes.',
      );
    }
    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO reporte (id_usuario, descripcion, telefono_estafador, enlace_sospechoso, empresa_suplantada)
       VALUES (?, ?, ?, ?, ?)`,
      [
        idUsuario,
        dto.descripcion ?? '',
        dto.telefonoEstafador ?? '',
        dto.enlaceSospechoso ?? '',
        dto.empresaSuplantada ?? '',
      ],
    );

    // Recuperamos la entidad ya persistida (con su relación usuario) para
    // pasársela a EvidenciaService, que la necesita para fijar la portada.
    const guardado = await this.repository.findOne({
      where: { idReporte: result.insertId },
      relations: ['usuario'],
    });

    if (!guardado) {
      throw new NotFoundException(`Reporte ${result.insertId} no encontrado`);
    }
    await this.evidenciaService.crearVarias(guardado, validadas);

    return guardado;
  }

  // RF04 - buscador público: solo reportes ya verificados por moderación
  findPublicos(): Promise<Reporte[]> {
    return this.repository.find({
      where: { estado: EstadoReporte.VERIFICADO },
      relations: ['usuario'],
      order: { fechaReporte: 'DESC' },
    });
  }

  // Panel de moderación: todos los reportes, sin importar estado
  findAll(): Promise<Reporte[]> {
    return this.repository.find({
      relations: ['usuario'],
      order: { fechaReporte: 'DESC' },
    });
  }

  // Detalle de un reporte, leído con SQL directo.
  // Admin ve cualquiera. Los demás ven los verificados y, si son el autor,
  // también los suyos pendientes/rechazados.
  async findOneRaw(id: number, user: JwtPayload): Promise<ReporteResponseDto> {
    const [rows] = await this.pool.query<ReporteRow[]>(
      `SELECT ${COLUMNAS_REPORTE}
       FROM reporte r JOIN usuario u ON u.id_usuario = r.id_usuario
       WHERE r.id_reporte = ?`,
      [id],
    );
    const row = rows[0];
    const puedeVerlo =
      row &&
      (esAdmin(user.rol) ||
        row.estado === EstadoReporte.VERIFICADO ||
        String(row.id_usuario) === user.sub);
    if (!puedeVerlo) {
      // 404 y no 403: así no se revela que el reporte existe.
      throw new NotFoundException(`Reporte ${id} no encontrado`);
    }
    return dtoDesdeFila(row);
  }

  // "Mis reportes": los del usuario del token (id_usuario = sub). Acepta un
  // filtro opcional ?estado=... (ya validado en el controller).
  async findMios(
    idUsuario: number,
    estado?: EstadoReporte,
  ): Promise<ReporteResponseDto[]> {
    let sql = `SELECT ${COLUMNAS_REPORTE}
       FROM reporte r JOIN usuario u ON u.id_usuario = r.id_usuario
       WHERE r.id_usuario = ?`;
    const params: (number | string)[] = [idUsuario];
    if (estado) {
      sql += ' AND r.estado = ?';
      params.push(estado);
    }
    sql += ' ORDER BY r.fecha_reporte DESC';

    const [rows] = await this.pool.query<ReporteRow[]>(sql, params);
    return rows.map(dtoDesdeFila);
  }

  async findOne(id: number): Promise<Reporte> {
    const reporte = await this.repository.findOne({
      where: { idReporte: id },
      relations: ['usuario'],
    });
    if (!reporte) {
      throw new NotFoundException(`Reporte ${id} no encontrado`);
    }
    return reporte;
  }

  async update(id: number, dto: UpdateReporteDto): Promise<Reporte> {
    const reporte = await this.findOne(id);

    if (dto.telefonoEstafador !== undefined) {
      reporte.telefonoEstafador = dto.telefonoEstafador;
    }
    if (dto.enlaceSospechoso !== undefined) {
      reporte.enlaceSospechoso = dto.enlaceSospechoso;
    }
    if (dto.empresaSuplantada !== undefined) {
      reporte.empresaSuplantada = dto.empresaSuplantada;
    }
    if (dto.descripcion !== undefined) {
      reporte.descripcion = dto.descripcion;
    }

    return this.repository.save(reporte);
  }

  // RF06/RF07: aprobar o rechazar un reporte. Deja rastro completo.
  // idModerador viene del token (el admin que está moderando).
  async moderar(
    id: number,
    idModerador: number,
    dto: ModerarReporteDto,
  ): Promise<Reporte> {
    const comentario = dto.comentario?.trim() || undefined;
    if (dto.resultado === EstadoReporte.RECHAZADO && !comentario) {
      throw new BadRequestException(
        'Para rechazar un reporte escribe el motivo en "comentario".',
      );
    }

    const reporte = await this.findOne(id);
    if (reporte.estado !== EstadoReporte.PENDIENTE) {
      throw new BadRequestException(
        `El reporte ${id} ya fue revisado (${reporte.estado}).`,
      );
    }
    const moderador = await this.usuariosService.findOne(idModerador);

    reporte.estado = dto.resultado;
    await this.repository.save(reporte);

    const bitacoraGuardada = await this.bitacoraService.registrar({
      reporte,
      usuario: moderador,
      accion: `reporte_${dto.resultado}`,
      descripcion: comentario,
    });

    await this.revisionReporteService.crear({
      bitacora: bitacoraGuardada,
      resultado: dto.resultado,
      comentario,
    });

    const titulo =
      dto.resultado === EstadoReporte.VERIFICADO
        ? 'Tu reporte fue verificado'
        : 'Tu reporte fue rechazado';

    await this.notificacionesService.crear(
      reporte.usuario.idUsuario,
      reporte,
      dto.resultado,
      titulo,
      'El estado de tu reporte cambió.',
      comentario,
    );

    return reporte;
  }

  async remove(id: number): Promise<void> {
    const reporte = await this.findOne(id);
    await this.evidenciaService.borrarArchivosDeReporte(id);
    await this.repository.remove(reporte);
  }
}
