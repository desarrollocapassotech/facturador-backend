import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import type { ContextoFuente, FuenteDatosAdapter, ResultadoExtraccion } from '../../domain/item-facturable';
import { agruparHoras } from './agrupar-horas';
import { ConexionTrackerService } from './conexion-tracker.service';
import { TrackerClient, TrackerError } from './tracker-client';
import type { ParametrosTracker } from './tracker.types';

const MAX_DIAS = 370;

@Injectable()
export class TrackerAdapter implements FuenteDatosAdapter<ParametrosTracker> {
  readonly origen = 'TRACKER' as const;

  constructor(
    private readonly conexiones: ConexionTrackerService,
    private readonly client: TrackerClient,
  ) {}

  async extraer(ctx: ContextoFuente, p: ParametrosTracker): Promise<ResultadoExtraccion> {
    if (p.desde > p.hasta) throw new BadRequestException('La fecha "desde" es posterior a "hasta".');
    if ((Date.parse(p.hasta) - Date.parse(p.desde)) / 86_400_000 > MAX_DIAS) {
      throw new BadRequestException(`El rango no puede superar ${MAX_DIAS} días.`);
    }
    const conexion = await this.conexiones.datos(ctx.tenantId);
    let registros;
    try {
      registros = await this.client.obtenerHoras(conexion, p.desde, p.hasta);
    } catch (err) {
      if (err instanceof TrackerError) throw new BadGatewayException(err.message);
      throw err;
    }
    const { items, advertencias } = agruparHoras(registros, p);
    return {
      items,
      advertencias,
      descripcionLote: `Tracker ${p.desde} a ${p.hasta} (${p.baseHoras === 'TRABAJADAS' ? 'horas trabajadas' : 'horas facturables'})`,
      parametros: { ...p, registrosLeidos: registros.length },
    };
  }
}
