import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// Quita espacios al inicio y al final: así "   " cuenta como vacío.
const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );
// Petición multipart/form-data (va junto con el archivo de evidencia).
// El autor del reporte NO viaja en el body: se toma del token JWT
// (req.user.sub) en el controller.
//
// Reglas:
//  - telefonoEstafador y enlaceSospechoso: al menos uno de los dos
//  - descripcion: obligatoria
//  - empresaSuplantada: opcional
//  - evidencia: obligatoria (se valida en el controller, es un archivo)
//
// El proyecto ya solo maneja phishing/spoofing, así que no se pide tipo de
// fraude ni monto (si el usuario quiere mencionar una cantidad, va en la
// descripción).
export class CreateReporteDto {
  // "Al menos uno de los dos" (teléfono o enlace) se revisa en el
  // controller, porque depende de ambos campos a la vez.
  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  telefonoEstafador?: string;

  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  enlaceSospechoso?: string;

  @trim()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  empresaSuplantada?: string;

  @trim()
  @IsString({ message: 'La descripción es obligatoria.' })
  @IsNotEmpty({ message: 'La descripción es obligatoria.' })
  @MaxLength(2000)
  descripcion: string;
}
