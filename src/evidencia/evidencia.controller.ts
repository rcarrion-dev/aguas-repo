import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  UploadedFiles,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtPayload } from '../auth/jwt';
import { ROL, Roles } from '../auth/roles';
import { EvidenciaService } from './evidencia.service';
import { CreateEvidenciaDto } from './dto/create-evidencia.dto';
import { EvidenciaResponseDto } from './dto/evidencia-response.dto';
import {
  evidenciaUploadOptions,
  MAX_ARCHIVOS,
  validarEvidencia,
} from '../common/storage/evidencia-storage';
import { MulterExceptionFilter } from '../common/multer/multer-exception.filter';

@Controller('evidencia')
@UseFilters(MulterExceptionFilter)
export class EvidenciaController {
  constructor(private readonly service: EvidenciaService) {}

  // Petición multipart/form-data: idReporte (texto) + 1 archivo en el
  // campo "archivos" (PDF o imagen, máx. 5 MB).
  @Post()
  @UseInterceptors(
    FilesInterceptor('archivos', MAX_ARCHIVOS, evidenciaUploadOptions),
  )
  async create(
    @Body() dto: CreateEvidenciaDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: JwtPayload,
  ) {
    const validadas = validarEvidencia(files);
    const evidencias = await this.service.create(
      dto.idReporte,
      validadas,
      user,
    );
    return evidencias.map((e) => EvidenciaResponseDto.fromEntity(e));
  }

  @Get('reporte/:idReporte')
  findByReporte(
    @Param('idReporte', ParseIntPipe) idReporte: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.findByReporte(idReporte, user);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    const evidencia = await this.service.findOneVisible(id, user);
    return EvidenciaResponseDto.fromEntity(evidencia);
  }

  @Delete(':id')
  @Roles(ROL.ADMIN)
  @HttpCode(204)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
