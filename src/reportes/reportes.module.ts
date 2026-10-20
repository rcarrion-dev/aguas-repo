import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Reporte } from './entities/reporte.entity';
import { ReportesService } from './reportes.service';
import { ReportesController } from './reportes.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { UsuariosModule } from '../usuarios/usuarios.module';
import { BitacoraModule } from '../bitacora/bitacora.module';
import { RevisionReporteModule } from '../revision-reporte/revision-reporte.module';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { EvidenciaModule } from '../evidencia/evidencia.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Reporte]),
    DatabaseModule,
    AuthModule,
    UsuariosModule,
    BitacoraModule,
    RevisionReporteModule,
    NotificacionesModule,
    EvidenciaModule, // para crear la evidencia en el mismo POST /reportes
  ],
  controllers: [ReportesController],
  providers: [ReportesService],
  exports: [ReportesService],
})
export class ReportesModule {}
