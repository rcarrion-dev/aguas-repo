import { IsEmail, IsString, MaxLength } from 'class-validator';

// "!:" en lugar de "| undefined": el ValidationPipe garantiza que el campo
// llega, así que no hace falta repetir "!" cada vez que se usa.
export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  correo!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}
