import {
  Body,
  Controller,
  ForbiddenException,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt';
import { esAdmin, ROL, Roles } from '../auth/roles';
import { UsuariosService } from './usuarios.service';
import { CreateUsuarioDto } from './dto/create-usuario.dto';
import { UpdateUsuarioDto } from './dto/update-usuario.dto';
import { UsuarioResponseDto } from './dto/usuario-response.dto';
import { CambiarEstadoDto } from './dto/cambiar-estado.dto';

// Gestión de cuentas: solo administrador.
// Excepción: GET /usuarios/:id, cada quien puede ver su propio perfil.
@Controller('usuarios')
export class UsuariosController {
  constructor(private readonly service: UsuariosService) {}

  @Post()
  @Roles(ROL.ADMIN)
  async create(@Body() dto: CreateUsuarioDto): Promise<UsuarioResponseDto> {
    const usuario = await this.service.create(dto);
    return UsuarioResponseDto.fromEntity(usuario);
  }

  @Get()
  @Roles(ROL.ADMIN)
  findAll(): Promise<UsuarioResponseDto[]> {
    return this.service.findAllConReportes();
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ): Promise<UsuarioResponseDto> {
    if (!esAdmin(user.rol) && String(id) !== user.sub) {
      throw new ForbiddenException('No tienes permiso para ver este usuario');
    }
    const usuario = await this.service.findOne(id);
    return UsuarioResponseDto.fromEntity(usuario);
  }

  @Patch(':id')
  @Roles(ROL.ADMIN)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUsuarioDto,
  ): Promise<UsuarioResponseDto> {
    const usuario = await this.service.update(id, dto);
    return UsuarioResponseDto.fromEntity(usuario);
  }

  // Suspender ({ activo: false }) o reactivar ({ activo: true }) una cuenta.
  @Patch(':id/estado')
  @Roles(ROL.ADMIN)
  async cambiarEstado(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CambiarEstadoDto,
    @CurrentUser() user: JwtPayload,
  ): Promise<UsuarioResponseDto> {
    const usuario = await this.service.cambiarEstado(
      id,
      dto.activo,
      Number(user.sub),
    );
    return UsuarioResponseDto.fromEntity(usuario);
  }

  @Delete(':id')
  @Roles(ROL.ADMIN)
  @HttpCode(204)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.remove(id, Number(user.sub));
  }
}
