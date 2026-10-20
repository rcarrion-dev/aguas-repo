import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt';
import { ROL, Roles } from '../auth/roles';
import { ReportesService } from './reportes.service';
import { CreateReporteDto } from './dto/create-reporte.dto';
import { UpdateReporteDto } from './dto/update-reporte.dto';
import { ModerarReporteDto } from './dto/moderar-reporte.dto';
import { ReporteResponseDto } from './dto/reporte-response.dto';
import { EstadoReporte } from './entities/reporte.entity';
import {
  evidenciaUploadOptions,
  MAX_ARCHIVOS,
  validarEvidencia,
} from '../common/storage/evidencia-storage';
import { MulterExceptionFilter } from '../common/multer/multer-exception.filter';

// Todos los endpoints piden token (guard global en AuthModule).
// Los que llevan @Roles además piden un rol específico.
@ApiTags('reportes')
@ApiBearerAuth()
@Controller('reportes')
export class ReportesController {
  constructor(private readonly service: ReportesService) {}

  // Petición multipart/form-data: los campos de texto de CreateReporteDto
  // + 1 archivo (una sola evidencia) en el campo "archivos". El autor sale del token.
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseFilters(MulterExceptionFilter)
  @UseInterceptors(
    FilesInterceptor('archivos', MAX_ARCHIVOS, evidenciaUploadOptions),
  )
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateReporteDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!dto.telefonoEstafador && !dto.enlaceSospechoso) {
      throw new BadRequestException(
        'Escribe el teléfono o el enlace del estafador (al menos uno de los dos).',
      );
    }
    // Se valida el archivo (bytes y extensión) ANTES de crear el reporte.
    const validadas = validarEvidencia(files);
    const reporte = await this.service.create(Number(user.sub), dto, validadas);
    return ReporteResponseDto.fromEntity(reporte);
  }

  // GET /reportes -> buscador (RF04), solo reportes verificados.
  // Cualquier sesión (usuario, SSC, admin). Es lo que usa SSC para el seguimiento.
  @Get()
  async findPublicos(@CurrentUser() user: JwtPayload) {
    const reportes = await this.service.findPublicos();
    return reportes.map((r) =>
      ReporteResponseDto.paraLector(ReporteResponseDto.fromEntity(r), user),
    );
  }

  // GET /reportes/todos -> panel de moderación, todos los estados. Solo admin.
  @Get('todos')
  @Roles(ROL.ADMIN)
  async findAll() {
    const reportes = await this.service.findAll();
    return reportes.map((e) => ReporteResponseDto.fromEntity(e));
  }

  // GET /reportes/mios -> solo los reportes del usuario del token.
  // OJO: debe declararse ANTES que ":id", o Nest tomaría "mios" como un id.
  @Get('mios')
  async findMios(
    @CurrentUser() user: JwtPayload,
    @Query('estado', new ParseEnumPipe(EstadoReporte, { optional: true }))
    estado?: EstadoReporte,
  ) {
    return this.service.findMios(Number(user.sub), estado);
  }

  // Detalle: admin ve cualquiera; los demás (usuario, SSC) ven los
  // verificados y, además, el usuario ve los suyos aunque estén pendientes.
  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const dto = await this.service.findOneRaw(id, user);
    return ReporteResponseDto.paraLector(dto, user);
  }

  @Patch(':id')
  @Roles(ROL.ADMIN)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReporteDto,
  ) {
    const reporte = await this.service.update(id, dto);
    return ReporteResponseDto.fromEntity(reporte);
  }

  // RF06/RF07 - aprobar/rechazar, deja bitácora + revisión automáticamente.
  // El moderador es el admin del token (ya no se manda en el body).
  @Patch(':id/moderar')
  @Roles(ROL.ADMIN)
  async moderar(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ModerarReporteDto,
  ) {
    const reporte = await this.service.moderar(id, Number(user.sub), dto);
    return ReporteResponseDto.fromEntity(reporte);
  }

  @Delete(':id')
  @Roles(ROL.ADMIN)
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
