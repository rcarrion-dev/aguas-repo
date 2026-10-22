import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { RolesModule } from './roles/roles.module';
import { UsuariosModule } from './usuarios/usuarios.module';
import { ReportesModule } from './reportes/reportes.module';
import { EvidenciaModule } from './evidencia/evidencia.module';
import { BitacoraModule } from './bitacora/bitacora.module';
import { RevisionReporteModule } from './revision-reporte/revision-reporte.module';
import { NotificacionesModule } from './notificaciones/notificaciones.module';

@Module({
  imports: [
    // Lee el archivo .env y lo hace disponible en toda la app vía ConfigService
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_NAME'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        // false a propósito: las tablas ya existen (4Fantasticos_base_datos.sql).
        synchronize: false,
      }),
    }),

    AuthModule,
    RolesModule,
    UsuariosModule,
    ReportesModule,
    EvidenciaModule,
    BitacoraModule,
    RevisionReporteModule,
    NotificacionesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
