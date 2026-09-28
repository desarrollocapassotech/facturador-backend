import { BadRequestException, Injectable } from '@nestjs/common';
import { formatearCuit } from '../../shared/util/cuit';
import { PdfComprobanteRenderer, type ComprobantePdfData } from '../pdf';
import { TenantsService } from '../tenants';
import { ComprobantesService } from './comprobantes.service';
import { CONCEPTO, MONEDA_ARCA, TIPOS_COMPROBANTE } from './domain/codigos';
import { formatearNumero } from './domain/fechas';
import type { EmisorSnapshot, ReceptorSnapshot } from './emision.service';

function ddmmaaaa(d: Date | string | null | undefined): string {
  if (!d) return '';
  const iso = typeof d === 'string' ? d : d.toISOString();
  const [a, m, dd] = iso.slice(0, 10).split('-');
  return `${dd}/${m}/${a}`;
}

function slug(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'cliente';
}

/** Arma los datos del PDF desde el comprobante emitido (sus snapshots) y la plantilla del tenant. */
@Injectable()
export class ComprobantePdfService {
  constructor(
    private readonly comprobantes: ComprobantesService,
    private readonly tenants: TenantsService,
    private readonly renderer: PdfComprobanteRenderer,
  ) {}

  async generar(tenantId: string, id: string): Promise<{ buffer: Buffer; filename: string }> {
    const c = await this.comprobantes.buscar(tenantId, id);
    if ((c.estado !== 'EMITIDO' && c.estado !== 'ANULADO') || !c.cae || c.numero === null) {
      throw new BadRequestException('El PDF está disponible cuando el comprobante tiene CAE.');
    }
    const emisor = c.emisorSnapshot as unknown as EmisorSnapshot;
    const receptor = c.receptorSnapshot as unknown as ReceptorSnapshot;
    const tipo = TIPOS_COMPROBANTE[c.tipo];

    // QR de ARCA (RG 4892): se informa el CUIT y el receptor con los que se pidió el CAE.
    const qr = {
      ver: 1,
      fecha: c.fechaEmision.toISOString().slice(0, 10),
      cuit: Number(emisor.cuitArca),
      ptoVta: c.puntoVenta.numero,
      tipoCmp: tipo.codigo,
      nroCmp: c.numero,
      importe: Number(c.importeTotal),
      moneda: MONEDA_ARCA[c.moneda],
      ctz: Number(c.cotizacion),
      tipoDocRec: receptor.arca.docTipo,
      nroDocRec: receptor.arca.docNro,
      tipoCodAut: 'E',
      codAut: Number(c.cae),
    };

    const data: ComprobantePdfData = {
      letra: tipo.letra,
      codigo: tipo.codigo,
      titulo: tipo.titulo,
      puntoVenta: c.puntoVenta.numero,
      numero: c.numero,
      fechaEmision: ddmmaaaa(c.fechaEmision),
      emisor: {
        razonSocial: emisor.razonSocial,
        nombreFantasia: emisor.nombreFantasia,
        cuit: formatearCuit(emisor.cuit),
        condicionIva: emisor.condicionIva,
        domicilio: emisor.domicilio,
        ingresosBrutos: emisor.ingresosBrutos,
        inicioActividades: ddmmaaaa(emisor.inicioActividades),
      },
      receptor: {
        razonSocial: receptor.razonSocial,
        documento:
          receptor.numeroDocumento === '0'
            ? 'Sin identificar'
            : `${receptor.tipoDocumento} ${receptor.tipoDocumento === 'CUIT' || receptor.tipoDocumento === 'CUIL' ? formatearCuit(receptor.numeroDocumento) : receptor.numeroDocumento}`,
        condicionIva: receptor.condicionIva,
        domicilio: receptor.domicilio,
      },
      concepto: CONCEPTO[c.concepto].etiqueta,
      ...(c.concepto !== 'PRODUCTOS' && c.fechaServicioDesde && c.fechaServicioHasta && c.fechaVtoPago
        ? {
            periodoServicio: {
              desde: ddmmaaaa(c.fechaServicioDesde),
              hasta: ddmmaaaa(c.fechaServicioHasta),
              vtoPago: ddmmaaaa(c.fechaVtoPago),
            },
          }
        : {}),
      moneda: c.moneda,
      cotizacion: c.moneda === 'USD' ? c.cotizacion.toString() : undefined,
      lineas: c.lineas.map((l) => ({
        descripcion: l.descripcion,
        cantidad: l.cantidad.toString(),
        unidad: l.unidad,
        precioUnitario: l.precioUnitario.toString(),
        bonificacionPct: l.bonificacionPct.toString(),
        alicuotaIva: l.alicuotaIva.toString(),
        importeNeto: l.importeNeto.toString(),
        importeTotal: l.importeTotal.toString(),
      })),
      totales: {
        netoGravado: c.importeNetoGravado.toString(),
        iva: c.alicuotas.map((a) => ({
          alicuota: { 3: '0', 9: '2.5', 8: '5', 4: '10.5', 5: '21', 6: '27' }[a.arcaId] ?? '?',
          importe: a.importe.toString(),
        })),
        ivaTotal: c.importeIva.toString(),
        tributos: c.importeTributos.toString(),
        total: c.importeTotal.toString(),
      },
      ...(c.asociado
        ? {
            asociado: {
              descripcion: `${TIPOS_COMPROBANTE[c.asociado.tipo].titulo} ${TIPOS_COMPROBANTE[c.asociado.tipo].letra} ${formatearNumero(
                c.asociado.puntoVenta.numero,
                c.asociado.numero ?? 0,
              )} del ${ddmmaaaa(c.asociado.fechaEmision)}${c.motivo ? ` — Motivo: ${c.motivo}` : ''}`,
            },
          }
        : {}),
      observaciones: c.observaciones,
      cae: {
        numero: c.cae,
        vencimiento: ddmmaaaa(c.caeVencimiento),
        qrUrl: `https://www.afip.gob.ar/fe/qr/?p=${Buffer.from(JSON.stringify(qr)).toString('base64')}`,
      },
      homologacion: c.ambiente !== 'PRODUCCION',
    };

    const plantilla = await this.tenants.obtenerPlantilla(tenantId);
    const buffer = await this.renderer.render(data, plantilla);
    const prefijo = tipo.clase === 'FACTURA' ? 'Factura' : tipo.clase === 'NOTA_CREDITO' ? 'NC' : 'ND';
    const filename = `${prefijo}_${tipo.letra}_${formatearNumero(c.puntoVenta.numero, c.numero)}_${slug(receptor.razonSocial)}.pdf`;
    return { buffer, filename };
  }
}
