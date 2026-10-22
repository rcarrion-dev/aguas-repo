import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DB_POOL } from '../database/database.module';
import { MailService } from '../mail/mail.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { CREDENCIALES_INVALIDAS, CUENTA_SUSPENDIDA } from './mensajes';
import { dummyHash, hashPassword, verifyPassword } from './password';
import { ROL } from './roles';
import { TokensService, type ClaimsToken } from './tokens.service';

// IMPORTANTE: todas las consultas usan "?" en lugar de pegar los valores en
// el texto del SQL. mysql2 escapa cada "?" por su cuenta, así un correo como
// "x' OR '1'='1" se busca literal y no se ejecuta como SQL (inyección SQL).

const RECUPERACION_SOLICITADA =
  'Si el correo corresponde a una cuenta activa, recibirás un código de recuperación. Si ya lo solicitaste, espera 60 segundos antes de pedir otro.';

// Filas tipadas: así el compilador sabe qué columnas trae cada consulta.
interface IdRow extends RowDataPacket {
  id_usuario: number;
}
interface RolRow extends RowDataPacket {
  id_rol: number;
}
interface CuentaRow extends RowDataPacket {
  id_usuario: number;
  nombre: string;
  correo: string;
  password_hash: string;
  activo: number;
  nombre_rol: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  nombre: string;
  correo: string;
  rol: string;
}

function claimsDe(cuenta: CuentaRow): ClaimsToken {
  return {
    sub: String(cuenta.id_usuario),
    correo: cuenta.correo,
    rol: cuenta.nombre_rol,
  };
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DB_POOL) private readonly pool: Pool,
    private readonly tokens: TokensService,
    private readonly mailService: MailService,
  ) {}

  async register(
    dto: RegisterDto,
  ): Promise<{ idUsuario: number; correo: string }> {
    // Riesgo conocido (documentado): el 409 confirma que el correo ya tiene
    // cuenta. Evitarlo requiere confirmar el registro por correo.
    const [existentes] = await this.pool.query<IdRow[]>(
      'SELECT id_usuario FROM usuario WHERE correo = ?',
      [dto.correo],
    );
    if (existentes[0]) {
      throw new ConflictException('El correo ya está registrado');
    }

    // El registro público SIEMPRE crea cuentas con rol 'usuario'.
    // Las cuentas de SSC y administrador se crean con POST /usuarios (solo
    // admin) o directo en la BD.
    const [roles] = await this.pool.query<RolRow[]>(
      'SELECT id_rol FROM rol WHERE nombre_rol = ?',
      [ROL.USUARIO],
    );
    if (!roles[0]) {
      throw new InternalServerErrorException(
        `No existe el rol '${ROL.USUARIO}' en la base de datos`,
      );
    }

    const passwordHash = await hashPassword(dto.password);
    const [result] = await this.pool.query<ResultSetHeader>(
      `INSERT INTO usuario (nombre, apellido, correo, password_hash, telefono, id_rol)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        dto.nombre,
        dto.apellido,
        dto.correo,
        passwordHash,
        dto.telefono ?? '',
        roles[0].id_rol,
      ],
    );
    return { idUsuario: result.insertId, correo: dto.correo };
  }

  private async cuentaPor(
    campo: 'correo' | 'id_usuario',
    valor: string | number,
  ): Promise<CuentaRow | undefined> {
    // "campo" no viene del cliente: solo puede ser uno de estos dos nombres
    // (lista blanca), por eso es seguro ponerlo en el texto del SQL.
    const columna = campo === 'correo' ? 'u.correo' : 'u.id_usuario';
    const [rows] = await this.pool.query<CuentaRow[]>(
      `SELECT u.id_usuario, u.nombre, u.correo, u.password_hash, u.activo, r.nombre_rol
       FROM usuario u JOIN rol r ON r.id_rol = u.id_rol
       WHERE ${columna} = ?`,
      [valor],
    );
    return rows[0];
  }

  async login(dto: LoginDto): Promise<LoginResponse> {
    const cuenta = await this.cuentaPor('correo', dto.correo);
    // Si el correo no existe se hace el mismo trabajo que con uno real, para
    // que la respuesta tarde lo mismo y el tiempo no delate qué correos hay.
    const ok = await verifyPassword(
      dto.password,
      cuenta?.password_hash ?? (await dummyHash()),
    );
    if (!cuenta || !ok) {
      throw new UnauthorizedException(CREDENCIALES_INVALIDAS);
    }
    // Se revisa DESPUÉS de la contraseña: así solo el dueño de la cuenta
    // se entera de que está suspendida.
    if (!cuenta.activo) {
      throw new ForbiddenException(CUENTA_SUSPENDIDA);
    }

    const claims = claimsDe(cuenta);
    return {
      accessToken: await this.tokens.firmar(claims, 'access'),
      refreshToken: await this.tokens.firmar(claims, 'refresh'),
      nombre: cuenta.nombre,
      correo: cuenta.correo,
      rol: cuenta.nombre_rol,
    };
  }

  async refresh(dto: RefreshDto): Promise<{ accessToken: string }> {
    const payload = await this.tokens.verificar(dto.refreshToken, 'refresh');
    if (!payload) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    // La cuenta se vuelve a leer de la BD: si la suspendieron o la borraron,
    // no se entrega un nuevo access token.
    const cuenta = await this.cuentaPor('id_usuario', Number(payload.sub));
    if (!cuenta) {
      throw new UnauthorizedException('Refresh token inválido');
    }
    if (!cuenta.activo) {
      throw new ForbiddenException(CUENTA_SUSPENDIDA);
    }
    return {
      accessToken: await this.tokens.firmar(claimsDe(cuenta), 'access'),
    };
  }

  async forgotPassword(
    dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    const codigo = randomInt(0, 1000000).toString().padStart(6, '0');
    const codigoHash = await hashPassword(codigo);
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      // Evita que dos solicitudes simultáneas envíen códigos para la misma cuenta.
      const [usuarios] = await connection.query<RowDataPacket[]>(
        `SELECT id_usuario, correo, activo
         FROM usuario
         WHERE correo = ?
         FOR UPDATE`,
        [dto.correo],
      );
      const user = usuarios[0];

      if (!user || !user.activo) {
        await connection.commit();
        return { message: RECUPERACION_SOLICITADA };
      }

      const [recientes] = await connection.query<RowDataPacket[]>(
        `SELECT id_password_reset
         FROM password_reset
         WHERE id_usuario = ?
           AND ultimo_envio > DATE_SUB(NOW(), INTERVAL 60 SECOND)`,
        [user.id_usuario],
      );

      if (recientes[0]) {
        await connection.commit();
        return { message: RECUPERACION_SOLICITADA };
      }

      await connection.query<ResultSetHeader>(
        `INSERT INTO password_reset (
           id_usuario, codigo_hash, codigo_expira, intentos,
           codigo_verificado, reset_token_hash, reset_token_expira,
           utilizado, ultimo_envio
         )
         VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), 0,
                 FALSE, NULL, NULL, FALSE, NOW())
         ON DUPLICATE KEY UPDATE
           codigo_hash = ?,
           codigo_expira = DATE_ADD(NOW(), INTERVAL 10 MINUTE),
           intentos = 0,
           codigo_verificado = FALSE,
           reset_token_hash = NULL,
           reset_token_expira = NULL,
           utilizado = FALSE,
           ultimo_envio = NOW()`,
        [user.id_usuario, codigoHash, codigoHash],
      );

      await this.mailService.sendPasswordResetCode(user.correo, codigo);
      await connection.commit();

      return { message: RECUPERACION_SOLICITADA };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async verifyResetCode(
    dto: VerifyResetCodeDto,
  ): Promise<{ resetToken: string }> {
    const mensaje = 'Código inválido, vencido o no disponible. Solicita uno nuevo.';
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const [usuarios] = await connection.query<RowDataPacket[]>(
        `SELECT id_usuario, activo
         FROM usuario
         WHERE correo = ?
         FOR UPDATE`,
        [dto.correo],
      );
      const user = usuarios[0];

      if (!user || !user.activo) {
        throw new UnauthorizedException(mensaje);
      }

      const [solicitudes] = await connection.query<RowDataPacket[]>(
        `SELECT id_password_reset, codigo_hash, intentos
         FROM password_reset
         WHERE id_usuario = ?
           AND codigo_expira > NOW()
           AND codigo_verificado = FALSE
           AND utilizado = FALSE
         FOR UPDATE`,
        [user.id_usuario],
      );
      const solicitud = solicitudes[0];

      if (!solicitud || solicitud.intentos >= 5) {
        throw new UnauthorizedException(mensaje);
      }

      if (!(await verifyPassword(dto.codigo, solicitud.codigo_hash))) {
        await connection.query<ResultSetHeader>(
          `UPDATE password_reset
           SET intentos = intentos + 1
           WHERE id_password_reset = ?`,
          [solicitud.id_password_reset],
        );
        // Conserva el intento fallido aunque devolvamos un error.
        await connection.commit();
        throw new UnauthorizedException(mensaje);
      }

      const resetToken = randomBytes(32).toString('hex');
      const resetTokenHash = createHash('sha256')
        .update(resetToken)
        .digest('hex');

      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE password_reset
         SET codigo_verificado = TRUE,
             reset_token_hash = ?,
             reset_token_expira = DATE_ADD(NOW(), INTERVAL 10 MINUTE)
         WHERE id_password_reset = ?
           AND codigo_expira > NOW()
           AND codigo_verificado = FALSE
           AND utilizado = FALSE
           AND intentos < 5`,
        [resetTokenHash, solicitud.id_password_reset],
      );

      if (result.affectedRows !== 1) {
        throw new UnauthorizedException(mensaje);
      }

      await connection.commit();

      return { resetToken };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    const mensaje = 'Token de recuperación inválido o vencido. Solicita un código nuevo.';
    const resetTokenHash = createHash('sha256')
      .update(dto.resetToken)
      .digest('hex');

    const [solicitudes] = await this.pool.query<RowDataPacket[]>(
      `SELECT id_usuario
       FROM password_reset
       WHERE reset_token_hash = ?
         AND reset_token_expira > NOW()
         AND codigo_verificado = TRUE
         AND utilizado = FALSE`,
      [resetTokenHash],
    );
    const solicitud = solicitudes[0];

    if (!solicitud) {
      throw new UnauthorizedException(mensaje);
    }

    const passwordHash = await hashPassword(dto.password);
    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const [usuarios] = await connection.query<RowDataPacket[]>(
        `SELECT id_usuario, activo
         FROM usuario
         WHERE id_usuario = ?
         FOR UPDATE`,
        [solicitud.id_usuario],
      );
      const user = usuarios[0];

      if (!user || !user.activo) {
        throw new UnauthorizedException(mensaje);
      }

      // Valida y consume el token junto con el cambio de contraseña.
      const [result] = await connection.query<ResultSetHeader>(
        `UPDATE password_reset
         SET utilizado = TRUE,
             reset_token_hash = NULL,
             reset_token_expira = NULL
         WHERE id_usuario = ?
           AND reset_token_hash = ?
           AND reset_token_expira > NOW()
           AND codigo_verificado = TRUE
           AND utilizado = FALSE`,
        [user.id_usuario, resetTokenHash],
      );

      if (result.affectedRows !== 1) {
        throw new UnauthorizedException(mensaje);
      }

      await connection.query<ResultSetHeader>(
        `UPDATE usuario
         SET password_hash = ?
         WHERE id_usuario = ?`,
        [passwordHash, user.id_usuario],
      );

      await connection.commit();

      return { message: 'Tu contraseña se actualizó correctamente. Inicia sesión.' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async changePassword(
    idUsuario: number,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    if (!Number.isSafeInteger(idUsuario) || idUsuario <= 0) {
      throw new UnauthorizedException('Sesión inválida');
    }

    const connection = await this.pool.getConnection();

    try {
      await connection.beginTransaction();

      const [usuarios] = await connection.query<RowDataPacket[]>(
        `SELECT id_usuario, password_hash, activo
         FROM usuario
         WHERE id_usuario = ?
         FOR UPDATE`,
        [idUsuario],
      );
      const user = usuarios[0];

      if (!user) {
        throw new UnauthorizedException('Sesión inválida');
      }
      if (!user.activo) {
        throw new ForbiddenException(CUENTA_SUSPENDIDA);
      }
      if (!(await verifyPassword(dto.currentPassword, user.password_hash))) {
        throw new BadRequestException('La contraseña actual es incorrecta');
      }
      if (dto.currentPassword === dto.newPassword) {
        throw new BadRequestException(
          'La nueva contraseña debe ser diferente de la actual',
        );
      }

      const passwordHash = await hashPassword(dto.newPassword);

      await connection.query<ResultSetHeader>(
        `UPDATE usuario
         SET password_hash = ?
         WHERE id_usuario = ?`,
        [passwordHash, user.id_usuario],
      );

      await connection.query<ResultSetHeader>(
        `UPDATE password_reset
         SET utilizado = TRUE,
             reset_token_hash = NULL,
             reset_token_expira = NULL
         WHERE id_usuario = ?`,
        [user.id_usuario],
      );

      await connection.commit();

      return { message: 'Tu contraseña se cambió correctamente.' };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}
