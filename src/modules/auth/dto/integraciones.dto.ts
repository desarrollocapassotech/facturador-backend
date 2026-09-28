import { OrigenItem } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsEmail, IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';
import { SCOPES, type Scope } from '../claves';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CrearIntegracionDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Poné un nombre para reconocer la integración.' })
  @MaxLength(100)
  nombre: string;

  @IsOptional()
  @IsEnum(OrigenItem)
  origen?: OrigenItem;

  @IsIn(SCOPES, { each: true, message: `Permisos válidos: ${SCOPES.join(', ')}.` })
  @ArrayMinSize(1, { message: 'Elegí al menos un permiso.' })
  @ArrayMaxSize(SCOPES.length)
  scopes: Scope[];
}

export class EmitirTokenAccesoDto {
  @Transform(trim)
  @IsEmail({}, { message: 'El email no es válido.' })
  @MaxLength(200)
  email: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(120)
  nombre?: string;

  /** Path del frontend al que llevar después de entrar (lista blanca; si no es válido, se ignora). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  destino?: string;
}

export class CanjearTokenDto {
  @IsString()
  @Length(43, 43, { message: 'El enlace de acceso no es válido.' })
  token: string;
}
