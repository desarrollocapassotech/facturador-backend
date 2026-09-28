import { CondicionIva, Moneda, TipoDocumento } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CrearClienteDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Falta la razón social.' })
  @MaxLength(200)
  razonSocial: string;

  @IsEnum(TipoDocumento)
  tipoDocumento: TipoDocumento;

  @Transform(trim)
  @IsString()
  @MaxLength(20)
  numeroDocumento: string;

  @IsEnum(CondicionIva)
  condicionIva: CondicionIva;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  domicilio?: string;

  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'El email no es válido.' })
  email?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/, { message: 'pais debe ser un código ISO de 2 letras (ej. AR).' })
  pais?: string;

  @IsOptional()
  @IsEnum(Moneda)
  monedaPreferida?: Moneda;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  diasVencimiento?: number | null;
}

export class ActualizarClienteDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  razonSocial?: string;

  @IsOptional()
  @IsEnum(TipoDocumento)
  tipoDocumento?: TipoDocumento;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  numeroDocumento?: string;

  @IsOptional()
  @IsEnum(CondicionIva)
  condicionIva?: CondicionIva;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  domicilio?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsEmail({}, { message: 'El email no es válido.' })
  email?: string | null;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  pais?: string;

  @IsOptional()
  @IsEnum(Moneda)
  monedaPreferida?: Moneda;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  diasVencimiento?: number | null;

  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

export class ListarClientesQuery {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  incluirInactivos?: boolean;
}
