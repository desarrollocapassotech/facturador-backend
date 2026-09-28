import { Moneda, OrigenItem, UnidadItem } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const aTexto = ({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CrearTarifaDto {
  @IsString()
  @IsNotEmpty()
  clienteId: string;

  /** null / ausente = cualquier origen. */
  @IsOptional()
  @IsEnum(OrigenItem)
  origen?: OrigenItem | null;

  /** Ej. id del proyecto en el tracker; ausente = todo el cliente. */
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  claveExterna?: string | null;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  descripcion?: string | null;

  @IsEnum(UnidadItem)
  unidad: UnidadItem;

  @Transform(aTexto)
  @Matches(/^\d{1,11}(\.\d{1,4})?$/, { message: 'precioUnitario debe ser un número con hasta 4 decimales.' })
  precioUnitario: string;

  @IsEnum(Moneda)
  moneda: Moneda;

  @Transform(aTexto)
  @IsIn(['0', '2.5', '5', '10.5', '21', '27'], { message: 'alicuotaIva debe ser 0, 2.5, 5, 10.5, 21 o 27.' })
  alicuotaIva: string;

  @Matches(FECHA, { message: 'vigenteDesde debe tener formato YYYY-MM-DD.' })
  vigenteDesde: string;

  @IsOptional()
  @Matches(FECHA, { message: 'vigenteHasta debe tener formato YYYY-MM-DD.' })
  vigenteHasta?: string | null;
}

export class ActualizarTarifaDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  descripcion?: string | null;

  @IsOptional()
  @Transform(aTexto)
  @Matches(/^\d{1,11}(\.\d{1,4})?$/, { message: 'precioUnitario debe ser un número con hasta 4 decimales.' })
  precioUnitario?: string;

  @IsOptional()
  @Transform(aTexto)
  @IsIn(['0', '2.5', '5', '10.5', '21', '27'])
  alicuotaIva?: string;

  @IsOptional()
  @Matches(FECHA)
  vigenteDesde?: string;

  @IsOptional()
  @Matches(FECHA)
  vigenteHasta?: string | null;
}
