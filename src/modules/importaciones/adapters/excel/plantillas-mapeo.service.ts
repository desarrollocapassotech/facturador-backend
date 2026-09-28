import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ArchivoInvalidoError, leerArchivo, type Celda } from './leer-archivo';
import { validarConfig, type PlantillaMapeoConfig } from './plantilla-mapeo';

@Injectable()
export class PlantillasMapeoService {
  constructor(private readonly prisma: PrismaService) {}

  listar(tenantId: string) {
    return this.prisma.plantillaMapeo.findMany({ where: { tenantId }, orderBy: { nombre: 'asc' } });
  }

  async obtener(tenantId: string, id: string): Promise<{ id: string; nombre: string; config: PlantillaMapeoConfig }> {
    const p = await this.prisma.plantillaMapeo.findUnique({ where: { tenantId_id: { tenantId, id } } });
    if (!p) throw new NotFoundException('Plantilla de mapeo no encontrada.');
    if (!p.activa) throw new BadRequestException('La plantilla está desactivada.');
    return { id: p.id, nombre: p.nombre, config: p.config as unknown as PlantillaMapeoConfig };
  }

  async crear(tenantId: string, datos: { nombre: string; formato: string; config: unknown }) {
    const config = this.validar(datos.config);
    return this.guardar(() =>
      this.prisma.plantillaMapeo.create({
        data: { tenantId, nombre: datos.nombre.trim(), formato: datos.formato, config: config as unknown as Prisma.InputJsonValue },
      }),
    );
  }

  async actualizar(tenantId: string, id: string, datos: { nombre?: string; formato?: string; config?: unknown; activa?: boolean }) {
    const existe = await this.prisma.plantillaMapeo.count({ where: { tenantId, id } });
    if (!existe) throw new NotFoundException('Plantilla de mapeo no encontrada.');
    return this.guardar(() =>
      this.prisma.plantillaMapeo.update({
        where: { tenantId_id: { tenantId, id } },
        data: {
          nombre: datos.nombre?.trim(),
          formato: datos.formato,
          activa: datos.activa,
          ...(datos.config !== undefined ? { config: this.validar(datos.config) as unknown as Prisma.InputJsonValue } : {}),
        },
      }),
    );
  }

  /** Primeras filas de cada hoja (o del CSV), para armar el mapeo desde la pantalla. */
  async previsualizar(buffer: Buffer, nombre: string, opciones: { hoja?: string; delimitador?: ',' | ';' | '\t'; encoding?: 'utf-8' | 'latin1' }) {
    try {
      const { formato, hojas, filas } = await leerArchivo(buffer, nombre, opciones);
      const texto = (c: Celda) => (c instanceof Date ? c.toISOString().slice(0, 10) : c === null ? '' : String(c));
      return { formato, hojas, filas: filas.slice(0, 15).map((f) => f.slice(0, 40).map(texto)), totalFilas: filas.length };
    } catch (err) {
      if (err instanceof ArchivoInvalidoError) throw new BadRequestException(err.message);
      throw err;
    }
  }

  private validar(config: unknown): PlantillaMapeoConfig {
    const errores = validarConfig(config);
    if (errores.length) throw new BadRequestException({ message: 'La plantilla de mapeo tiene errores.', detalle: errores.join('\n'), errores });
    return config as PlantillaMapeoConfig;
  }

  private async guardar<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe una plantilla con ese nombre.');
      }
      throw err;
    }
  }
}
