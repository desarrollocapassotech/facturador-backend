import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'El email no es válido.' })
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Falta la contraseña.' })
  @MaxLength(72)
  password: string;

  /** Solo hace falta si el mismo email tiene cuenta en más de una empresa. */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{2,60}$/)
  tenantSlug?: string;
}
