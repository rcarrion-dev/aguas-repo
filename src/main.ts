import { Logger, LogLevel, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { mkdirSync } from 'node:fs';
import { AppModule } from './app.module';
import { assertJwtSecrets } from './auth/jwt';
import { carpetaUploads } from './common/storage/evidencia-storage';

// En producción no se imprimen los niveles debug/verbose.
const NIVELES_PRODUCCION: LogLevel[] = ['error', 'warn', 'log'];

async function bootstrap(): Promise<void> {
  const produccion = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: produccion ? NIVELES_PRODUCCION : undefined,
  });
  const logger = new Logger('Bootstrap');

  // Aquí el .env ya se leyó. Si falta un secreto, mejor tronar desde el
  // arranque con un mensaje claro que en el primer login.
  assertJwtSecrets();
  mkdirSync(carpetaUploads(), { recursive: true });

  // ~12 cabeceras de seguridad (nosniff, CSP, frame-ancestors, etc.) y
  // quita "X-Powered-By: Express".
  app.use(helmet());

  // whitelist: quita campos que no están en el DTO.
  // forbidNonWhitelisted: en vez de quitarlos en silencio, responde 400.
  // transform: convierte los campos de multipart/form-data al tipo del DTO.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS es una regla del NAVEGADOR. La app iOS es nativa y el dashboard
  // llama a la API desde su servidor (Next), así que ninguno lo necesita.
  // Solo se habilita para los orígenes listados en FRONT_URL (separados
  // por coma); sin FRONT_URL, ningún sitio web puede llamar a la API.
  const origenes = (process.env.FRONT_URL ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  if (origenes.length > 0) {
    app.enableCors({ origin: origenes });
  }

  // Swagger solo si se pide en el .env: en la entrega no se publica el
  // mapa completo de la API.
  if (process.env.ENABLE_DOCS === 'true') {
    const config = new DocumentBuilder()
      .setTitle('Aguas! — API de reportes')
      .setDescription(
        'API REST de reportes de phishing. Casi todo requiere un access ' +
          'token: obténlo en POST /auth/login y pégalo en Authorize.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
    logger.warn('Swagger habilitado en /docs (ENABLE_DOCS=true)');
  }

  // Dónde escucha lo decide el despliegue, no el código. En el laboratorio
  // HOST=0.0.0.0 para que la app y el dashboard lleguen por la red.
  const host = process.env.HOST ?? '127.0.0.1';
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, host);
  logger.log(`API escuchando en http://${host}:${port}`);
}

void bootstrap();
