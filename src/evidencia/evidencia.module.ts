import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Evidencia } from './entities/evidencia.entity';
import { Reporte } from '../reportes/entities/reporte.entity';
import { EvidenciaService } from './evidencia.service';
import { EvidenciaController } from './evidencia.controller';
import { UploadsController } from './uploads.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [TypeOrmModule.forFeature([Evidencia, Reporte]), DatabaseModule],
  controllers: [EvidenciaController, UploadsController],
  providers: [EvidenciaService],
  exports: [EvidenciaService],
})
export class EvidenciaModule {}
