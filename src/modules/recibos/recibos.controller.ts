import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentAuth, type AuthContext } from '../auth';
import { GenerarReciboDto } from './dto/recibos.dto';
import { RecibosService } from './recibos.service';

@Controller('recibos')
export class RecibosController {
  constructor(private readonly recibos: RecibosService) {}

  /** Genera el PDF a pedido; no se guarda nada (ARCHITECTURE.md §5: `recibos` no tiene tablas). */
  @Post('pdf')
  @HttpCode(200)
  async pdf(@CurrentAuth() auth: AuthContext, @Body() dto: GenerarReciboDto, @Res() res: Response) {
    const { pdf, filename } = await this.recibos.generar(auth.tenantId, dto);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(pdf);
  }
}
