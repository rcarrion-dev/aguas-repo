import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from './entities/usuario.entity';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { RolesService } from '../roles/roles.service';
import { hashPassword } from '../auth/password';
import { ROL } from '../auth/roles';
import { UsuarioResponseDto } from './dto/usuario-response.dto';

@Injectable()
export class UsuariosService {
  constructor(
    @InjectRepository(Usuario)
    private readonly repository: Repository<Usuario>,
    private readonly rolesService: RolesService,
  ) {}

  async create(dto: CreateUsuarioDto): Promise<Usuario> {
    const existente = await this.repository.findOne({
      where: { correo: dto.correo },
    });
    if (existente) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }

    // findOne del RolesService ya lanza NotFoundException si idRol no existe
    const rol = await this.rolesService.findOne(dto.idRol);
    const passwordHash = await hashPassword(dto.password);

    const usuario = this.repository.create({
      nombre: dto.nombre,
      apellido: dto.apellido,
      correo: dto.correo,
      passwordHash,
      telefono: dto.telefono,
      rol,
    });
    return this.repository.save(usuario);
  }

  findAll(): Promise<Usuario[]> {
    return this.repository.find({ relations: ['rol'] });
  }

  // Lista del panel: cada cuenta con cuántos reportes ha mandado y cuántos
  // le rechazaron. Una sola consulta (sin parámetros del cliente).
  async findAllConReportes(): Promise<UsuarioResponseDto[]> {
    const filas: {
      id_usuario: number;
      nombre: string;
      apellido: string;
      correo: string;
      telefono: string | null;
      nombre_rol: string;
      fecha_registro: Date;
      activo: number;
      total: string | number;
      rechazados: string | number | null;
    }[] = await this.repository.query(
      `SELECT u.id_usuario, u.nombre, u.apellido, u.correo, u.telefono,
              r.nombre_rol, u.fecha_registro, u.activo,
              COUNT(rep.id_reporte) AS total,
              SUM(rep.estado = 'rechazado') AS rechazados
       FROM usuario u
       JOIN rol r ON r.id_rol = u.id_rol
       LEFT JOIN reporte rep ON rep.id_usuario = u.id_usuario
       GROUP BY u.id_usuario, r.nombre_rol
       ORDER BY u.fecha_registro DESC`,
    );
    return filas.map((f) => {
      const dto = new UsuarioResponseDto();
      dto.idUsuario = f.id_usuario;
      dto.nombre = f.nombre;
      dto.apellido = f.apellido;
      dto.correo = f.correo;
      dto.telefono = f.telefono ?? '';
      dto.rol = f.nombre_rol;
      dto.fechaRegistro = new Date(f.fecha_registro).toISOString();
      dto.activo = Boolean(f.activo);
      dto.totalReportes = Number(f.total);
      dto.reportesRechazados = Number(f.rechazados ?? 0);
      return dto;
    });
  }

  // Suspender / reactivar. Solo cuentas de usuario y SSC: un administrador
  // no puede suspenderse a sí mismo ni a otro administrador.
  async cambiarEstado(
    id: number,
    activo: boolean,
    idAdmin: number,
  ): Promise<Usuario> {
    if (id === idAdmin) {
      throw new BadRequestException('No puedes suspender tu propia cuenta.');
    }
    const usuario = await this.findOne(id);
    if (usuario.rol?.nombreRol === ROL.ADMIN) {
      throw new BadRequestException(
        'Las cuentas de administrador no se pueden suspender.',
      );
    }
    usuario.activo = activo;
    return this.repository.save(usuario);
  }

  // Para endpoints que una cuenta suspendida no debe poder usar aunque su
  // access token siga vigente (dura hasta 15 minutos).
  async estaActivo(id: number): Promise<boolean> {
    const usuario = await this.repository.findOne({
      where: { idUsuario: id },
      select: { idUsuario: true, activo: true },
    });
    return Boolean(usuario?.activo);
  }

  async findOne(id: number): Promise<Usuario> {
    const usuario = await this.repository.findOne({
      where: { idUsuario: id },
      relations: ['rol'],
    });
    if (!usuario) {
      throw new NotFoundException(`Usuario ${id} no encontrado`);
    }
    return usuario;
  }

  // Usado por el módulo de auth para el login (sí incluye passwordHash)
  findByCorreo(correo: string): Promise<Usuario | null> {
    return this.repository.findOne({
      where: { correo },
      relations: ['rol'],
    });
  }

  async update(id: number, dto: UpdateUsuarioDto): Promise<Usuario> {
    const usuario = await this.findOne(id);

    if (dto.nombre !== undefined) usuario.nombre = dto.nombre;
    if (dto.apellido !== undefined) usuario.apellido = dto.apellido;
    if (dto.telefono !== undefined) usuario.telefono = dto.telefono;

    return this.repository.save(usuario);
  }

  // Mismas reglas que suspender: nadie borra su propia cuenta ni la de un
  // administrador. Si no, un solo admin podría dejar al sistema sin nadie
  // que modere (o un token robado de admin borraría a los demás).
  async remove(id: number, idAdmin: number): Promise<void> {
    if (id === idAdmin) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta.');
    }
    const usuario = await this.findOne(id);
    if (usuario.rol?.nombreRol === ROL.ADMIN) {
      throw new BadRequestException(
        'Las cuentas de administrador no se pueden eliminar desde la API.',
      );
    }
    // Sus reportes apuntan a la cuenta (llave foránea). Antes esto tronaba
    // con un 500; es una regla de negocio, así que se responde 409.
    const [{ total }] = await this.repository.query<{ total: string }[]>(
      'SELECT COUNT(*) AS total FROM reporte WHERE id_usuario = ?',
      [id],
    );
    if (Number(total) > 0) {
      throw new ConflictException(
        'La cuenta tiene reportes y no se puede eliminar. Suspéndela en su lugar.',
      );
    }
    await this.repository.remove(usuario);
  }
}
