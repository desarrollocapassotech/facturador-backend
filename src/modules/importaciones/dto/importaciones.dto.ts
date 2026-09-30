import { EstadoItem, Moneda, UnidadItem } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^\d{1,11}(\.\d{1,4})?$/;
const aTexto = ({ value }: { value: unknown }) => (typeof value === 'number' ? String(value) : value);
const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ItemManualDto {
  /** uuid generado en el frontend: reintentar el envío no duplica. */
  @IsString()
  @Matches(/^[A-Za-z0-9_-]{8,100}$/, { message: 'referenciaExterna inválida.' })
  referenciaExterna: string;

  @IsString()
  @IsNotEmpty({ message: 'Elegí el cliente de cada ítem.' })
  clienteId: string;

  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Cada ítem necesita una descripción.' })
  @MaxLength(500)
  descripcion: string;

  @Transform(aTexto)
  @Matches(DECIMAL, { message: 'cantidad debe ser un número con hasta 4 decimales.' })
  cantidad: string;

  @IsEnum(UnidadItem)
  unidad: UnidadItem;

  /** Si falta, se usa la tarifa vigente del cliente. */
  @IsOptional()
  @Transform(aTexto)
  @Matches(DECIMAL, { message: 'precioUnitario debe ser un número con hasta 4 decimales.' })
  precioUnitario?: string;

  @IsOptional()
  @IsEnum(Moneda)
  moneda?: Moneda;

  @IsOptional()
  @Transform(aTexto)
  @IsIn(['0', '2.5', '5', '10.5', '21', '27'])
  alicuotaIva?: string;

  @IsOptional()
  @Matches(FECHA)
  fecha?: string;

  @IsOptional()
  @Matches(FECHA)
  periodoDesde?: string;

  @IsOptional()
  @Matches(FECHA)
  periodoHasta?: string;
}

export class ImportarManualDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descripcion?: string;

  @ValidateNested({ each: true })
  @Type(() => ItemManualDto)
  @ArrayMinSize(1, { message: 'Cargá al menos un ítem.' })
  @ArrayMaxSize(500)
  items: ItemManualDto[];
}

export class EditarItemDto {
  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  descripcion?: string;

  @IsOptional()
  @Transform(aTexto)
  @Matches(DECIMAL, { message: 'cantidad debe ser un número con hasta 4 decimales.' })
  cantidad?: string;

  @IsOptional()
  @IsEnum(UnidadItem)
  unidad?: UnidadItem;

  /** null = volver a la tarifa del cliente. */
  @IsOptional()
  @Transform(aTexto)
  @Matches(DECIMAL, { message: 'precioUnitario debe ser un número con hasta 4 decimales.' })
  precioUnitario?: string | null;

  @IsOptional()
  @IsEnum(Moneda)
  moneda?: Moneda;

  @IsOptional()
  @Transform(aTexto)
  @IsIn(['0', '2.5', '5', '10.5', '21', '27'])
  alicuotaIva?: string;

  @IsOptional()
  @Matches(FECHA)
  fecha?: string | null;

  @IsOptional()
  @Matches(FECHA)
  periodoDesde?: string;

  @IsOptional()
  @Matches(FECHA)
  periodoHasta?: string;
}

export class ListarItemsQuery {
  @IsOptional()
  @IsString()
  importacionId?: string;

  @IsOptional()
  @IsEnum(EstadoItem)
  estado?: EstadoItem;

  @IsOptional()
  @IsString()
  clienteId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pagina?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  porPagina?: number;
}

export class PlantillaMapeoDto {
  @Transform(trim)
  @IsString()
  @IsNotEmpty({ message: 'Poné un nombre a la plantilla.' })
  @MaxLength(100)
  nombre: string;

  @IsIn(['xlsx', 'csv'])
  formato: 'xlsx' | 'csv';

  /** PlantillaMapeoConfig; se valida en el servicio (validarConfig). */
  @IsObject()
  config: Record<string, unknown>;
}

export class ActualizarPlantillaMapeoDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  nombre?: string;

  @IsOptional()
  @IsIn(['xlsx', 'csv'])
  formato?: 'xlsx' | 'csv';

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  activa?: boolean;
}
