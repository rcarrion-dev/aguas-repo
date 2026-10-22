import { Body, Controller, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import type { JwtPayload } from './jwt';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { Public } from './roles';

// Las rutas con @Public() se usan sin sesión (todavía no hay token).
// Todas tienen límite de intentos: 5 por minuto por IP + correo, así no se
// pueden probar contraseñas ni códigos de recuperación a fuerza bruta.
// change-password NO es pública: necesita el token de la sesión.
@ApiTags('auth')
@UseGuards(LoginThrottlerGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.service.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }

  // Sin límite: el refresh token no se puede adivinar, y el dashboard
  // renueva las sesiones de todos sus usuarios desde la misma IP.
  @Public()
  @Post('refresh')
  @SkipThrottle()
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.service.refresh(dto);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.service.forgotPassword(dto);
  }

  @Public()
  @Post('resend-reset-code')
  @HttpCode(200)
  resendResetCode(@Body() dto: ForgotPasswordDto) {
    return this.service.forgotPassword(dto);
  }

  @Public()
  @Post('verify-reset-code')
  @HttpCode(200)
  verifyResetCode(@Body() dto: VerifyResetCodeDto) {
    return this.service.verifyResetCode(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.service.resetPassword(dto);
  }

  @Patch('change-password')
  @ApiBearerAuth()
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.service.changePassword(Number(user.sub), dto);
  }
}
