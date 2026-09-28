import { Module } from '@nestjs/common';
import { PdfComprobanteRenderer } from './pdf-comprobante.renderer';

@Module({
  providers: [PdfComprobanteRenderer],
  exports: [PdfComprobanteRenderer],
})
export class PdfModule {}
