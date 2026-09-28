import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import type { ContextoFuente, FuenteDatosAdapter, ResultadoExtraccion } from '../../domain/item-facturable';
import { ArchivoInvalidoError, leerArchivo } from './leer-archivo';
import { mapearFilas } from './mapear-filas';
import type { PlantillaMapeoConfig } from './plantilla-mapeo';

export interface ParametrosExcel {
  archivo: Buffer;
  nombre: string;
  plantilla: { id: string; nombre: string; config: PlantillaMapeoConfig };
}

@Injectable()
export class ExcelCsvAdapter implements FuenteDatosAdapter<ParametrosExcel> {
  readonly origen = 'EXCEL' as const;

  async extraer(_ctx: ContextoFuente, p: ParametrosExcel): Promise<ResultadoExtraccion> {
    let filas;
    try {
      ({ filas } = await leerArchivo(p.archivo, p.nombre, p.plantilla.config));
    } catch (err) {
      if (err instanceof ArchivoInvalidoError) throw new BadRequestException(err.message);
      throw err;
    }
    // El prefijo por plantilla evita choques entre referencias de archivos de sistemas distintos.
    const { items, advertencias, filasLeidas } = mapearFilas(filas, p.plantilla.config, { prefijoReferencia: p.plantilla.id });
    return {
      items,
      advertencias,
      descripcionLote: p.nombre,
      parametros: { plantilla: p.plantilla.nombre, filasLeidas },
      archivoSha256: createHash('sha256').update(p.archivo).digest('hex'),
    };
  }
}
