import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import { importeEnLetras } from './numero-a-letras';
import type { ComprobantePdfData, EstiloPdf } from './pdf.types';

// Layout adaptado de Vialto (liquidaciones-arca/factura-pdf.service.ts), sin viajes ni Prisma:
// recibe los datos ya armados y devuelve el PDF.

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 28;
const CW = PAGE_W - M * 2;
const PIE_ALTO = 150; // espacio reservado al pie en la última página

function fmt(n: string | number): string {
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtCantidad(n: string): string {
  return Number(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
}

const UNIDAD: Record<string, string> = { HORA: 'hs', UNIDAD: 'u.', SERVICIO: 'serv.', MES: 'mes' };

/** Marca de agua de homologación (copiada de Vialto: pdf-homologacion-watermark.ts). */
function marcaDeAgua(doc: PDFKit.PDFDocument) {
  doc.save();
  doc.opacity(0.16).fillColor('#b71c1c').font('Helvetica-Bold');
  doc.translate(PAGE_W / 2, PAGE_H / 2).rotate(-42);
  const banda = Math.sqrt(PAGE_W * PAGE_W + PAGE_H * PAGE_H);
  doc.fontSize(28).text('COMPROBANTE DE PRUEBA', -banda / 2, -28, { width: banda, align: 'center', lineBreak: false });
  doc.fontSize(22).text('SIN VALIDEZ FISCAL', -banda / 2, 8, { width: banda, align: 'center', lineBreak: false });
  doc.restore();
}

@Injectable()
export class PdfComprobanteRenderer {
  async render(d: ComprobantePdfData, estilo: EstiloPdf): Promise<Buffer> {
    const qr = await QRCode.toBuffer(d.cae.qrUrl, { width: 160, margin: 1 });
    const copias = estilo.mostrarDuplicado ? ['ORIGINAL', 'DUPLICADO'] : ['ORIGINAL'];

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${d.titulo} ${d.letra}`, Producer: 'Facturador' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try {
        copias.forEach((copia, i) => {
          if (i > 0) doc.addPage();
          this.dibujarCopia(doc, d, estilo, copia, qr);
        });
        doc.end();
      } catch (e) {
        reject(e);
      }
    });
  }

  private dibujarCopia(doc: PDFKit.PDFDocument, d: ComprobantePdfData, e: EstiloPdf, copia: string, qr: Buffer) {
    let y = this.encabezado(doc, d, e, copia);
    y = this.receptor(doc, d, y);

    const discrimina = d.letra === 'A';
    const cols = discrimina
      ? [
          { t: 'Descripción', w: 205, a: 'left' as const },
          { t: 'Cantidad', w: 58, a: 'right' as const },
          { t: 'Precio unit.', w: 70, a: 'right' as const },
          { t: '% Bonif.', w: 40, a: 'right' as const },
          { t: 'Subtotal', w: 70, a: 'right' as const },
          { t: 'IVA %', w: 36, a: 'right' as const },
          { t: 'Subtotal c/IVA', w: CW - 479, a: 'right' as const },
        ]
      : [
          { t: 'Descripción', w: 261, a: 'left' as const },
          { t: 'Cantidad', w: 64, a: 'right' as const },
          { t: 'Precio unit.', w: 80, a: 'right' as const },
          { t: '% Bonif.', w: 44, a: 'right' as const },
          { t: 'Subtotal', w: CW - 449, a: 'right' as const },
        ];

    const encabezadoTabla = (yy: number) => {
      doc.rect(M, yy, CW, 16).fill(e.colorPrimario);
      let x = M;
      for (const c of cols) {
        doc.fontSize(7).font('Helvetica-Bold').fillColor('#fff').text(c.t, x + 3, yy + 5, { width: c.w - 6, align: c.a });
        x += c.w;
      }
      return yy + 16;
    };

    y = encabezadoTabla(y);
    for (const l of d.lineas) {
      // En B el precio y subtotal se muestran con IVA incluido (el IVA no se discrimina).
      const conIva = d.letra === 'B';
      const unitario = conIva
        ? Number(l.precioUnitario) * (1 + Number(l.alicuotaIva) / 100)
        : Number(l.precioUnitario);
      const celdas = discrimina
        ? [l.descripcion, `${fmtCantidad(l.cantidad)} ${UNIDAD[l.unidad] ?? ''}`, fmt(l.precioUnitario), fmt(l.bonificacionPct), fmt(l.importeNeto), fmt(l.alicuotaIva), fmt(l.importeTotal)]
        : [l.descripcion, `${fmtCantidad(l.cantidad)} ${UNIDAD[l.unidad] ?? ''}`, fmt(unitario), fmt(l.bonificacionPct), fmt(conIva ? l.importeTotal : l.importeNeto)];

      doc.fontSize(7.5).font('Helvetica');
      const alto = Math.max(16, ...celdas.map((v, i) => doc.heightOfString(v, { width: cols[i].w - 6 }) + 8));
      if (y + alto > PAGE_H - M - PIE_ALTO) {
        doc.addPage();
        y = encabezadoTabla(M);
      }
      let x = M;
      celdas.forEach((v, i) => {
        doc.fillColor('#111').text(v, x + 3, y + 4, { width: cols[i].w - 6, align: cols[i].a });
        x += cols[i].w;
      });
      doc.moveTo(M, y + alto).lineTo(M + CW, y + alto).lineWidth(0.5).stroke('#ddd');
      y += alto;
    }

    if (d.asociado) {
      y += 8;
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#111').text('Comprobante asociado: ', M, y, { continued: true })
        .font('Helvetica').text(d.asociado.descripcion);
      y += 12;
    }
    if (d.observaciones) {
      y += 6;
      doc.fontSize(7.5).font('Helvetica-Oblique').fillColor('#444').text(d.observaciones, M, y, { width: CW });
    }

    this.pie(doc, d, e, qr);
    if (d.homologacion) marcaDeAgua(doc);
  }

  private encabezado(doc: PDFKit.PDFDocument, d: ComprobantePdfData, e: EstiloPdf, copia: string): number {
    let y = M;
    doc.rect(M, y, CW, 16).lineWidth(0.8).stroke('#000');
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#000').text(copia, M, y + 4, { width: CW, align: 'center' });
    y += 20;

    const alto = 112;
    const x1 = M + CW / 2 - 30;
    const x2 = M + CW / 2 + 30;
    doc.rect(M, y, CW, alto).lineWidth(0.8).stroke('#999');

    // Emisor
    let ey = y + 8;
    if (e.logo) {
      try {
        doc.image(e.logo, M + 8, ey, { fit: [110, 40] });
        ey += 46;
      } catch {
        // logo ilegible: se omite
      }
    }
    const anchoIzq = x1 - M - 16;
    doc.fontSize(10).font('Helvetica-Bold').fillColor(e.colorPrimario).text(d.emisor.razonSocial, M + 8, ey, { width: anchoIzq });
    ey = doc.y + 2;
    doc.fontSize(7).font('Helvetica').fillColor('#333').text(d.emisor.domicilio, M + 8, ey, { width: anchoIzq });
    doc.text(d.emisor.condicionIva, { width: anchoIzq });

    // Letra
    doc.rect(x1, y, x2 - x1, 52).fillAndStroke('#fff', '#000');
    doc.fontSize(32).font('Helvetica-Bold').fillColor('#000').text(d.letra, x1, y + 6, { width: x2 - x1, align: 'center' });
    doc.fontSize(7).font('Helvetica-Bold').text(`COD. ${String(d.codigo).padStart(3, '0')}`, x1, y + 40, { width: x2 - x1, align: 'center' });
    doc.moveTo((x1 + x2) / 2, y + 52).lineTo((x1 + x2) / 2, y + alto).stroke('#999');

    // Datos del comprobante
    const xr = x2 + 10;
    const wr = M + CW - xr - 8;
    doc.fontSize(13).font('Helvetica-Bold').fillColor(e.colorPrimario).text(d.titulo, xr, y + 8, { width: wr });
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#000')
      .text(`N° ${String(d.puntoVenta).padStart(5, '0')}-${String(d.numero).padStart(8, '0')}`, xr, y + 28, { width: wr });
    doc.font('Helvetica').fontSize(7.5).fillColor('#222');
    const filas = [
      `Fecha de emisión: ${d.fechaEmision}`,
      `CUIT: ${d.emisor.cuit}`,
      `Ingresos Brutos: ${d.emisor.ingresosBrutos || '-'}`,
      `Inicio de actividades: ${d.emisor.inicioActividades || '-'}`,
    ];
    filas.forEach((f, i) => doc.text(f, xr, y + 44 + i * 11, { width: wr }));

    return y + alto + 4;
  }

  private receptor(doc: PDFKit.PDFDocument, d: ComprobantePdfData, y: number): number {
    const colW = CW / 2 - 12;
    const izq = [
      ['Cliente', d.receptor.razonSocial],
      ['Documento', d.receptor.documento],
      ['Condición IVA', d.receptor.condicionIva],
      ['Domicilio', d.receptor.domicilio || '-'],
    ];
    const der = [
      ['Concepto', d.concepto],
      ['Moneda', d.moneda === 'USD' ? `Dólares (cotización ${d.cotizacion ?? '-'})` : 'Pesos argentinos'],
      ...(d.periodoServicio
        ? [
            ['Período facturado', `${d.periodoServicio.desde} al ${d.periodoServicio.hasta}`],
            ['Vencimiento de pago', d.periodoServicio.vtoPago],
          ]
        : []),
    ];
    const filas = Math.max(izq.length, der.length);
    const alto = 10 + filas * 12;
    doc.rect(M, y, CW, alto).lineWidth(0.8).stroke('#999');
    const dibujar = (items: string[][], x: number) =>
      items.forEach(([k, v], i) => {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000').text(`${k}: `, x, y + 6 + i * 12, { width: colW, continued: true, lineBreak: false })
          .font('Helvetica').fillColor('#222').text(v, { width: colW, lineBreak: false, ellipsis: true });
      });
    dibujar(izq, M + 8);
    dibujar(der, M + CW / 2 + 4);
    return y + alto + 6;
  }

  private pie(doc: PDFKit.PDFDocument, d: ComprobantePdfData, e: EstiloPdf, qr: Buffer) {
    const y = PAGE_H - M - PIE_ALTO + 10;
    doc.moveTo(M, y).lineTo(M + CW, y).lineWidth(0.8).stroke('#999');

    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#000').text('Son: ', M, y + 6, { continued: true })
      .font('Helvetica').text(importeEnLetras(d.totales.total, d.moneda), { width: CW - 220 });

    // Totales
    const tx = M + CW - 210;
    const filas: Array<[string, string, boolean?]> = [];
    const simbolo = d.moneda === 'USD' ? 'US$' : '$';
    if (d.letra === 'A') {
      filas.push(['Importe neto gravado', d.totales.netoGravado]);
      for (const a of d.totales.iva) filas.push([`IVA ${fmt(a.alicuota)} %`, a.importe]);
      filas.push(['Otros tributos', d.totales.tributos]);
    } else {
      filas.push(['Subtotal', d.totales.total]);
      filas.push(['Otros tributos', d.totales.tributos]);
    }
    filas.push(['Importe total', d.totales.total, true]);
    let ty = y + 26;
    for (const [k, v, fuerte] of filas) {
      doc.fontSize(fuerte ? 9.5 : 8).font(fuerte ? 'Helvetica-Bold' : 'Helvetica').fillColor('#000')
        .text(`${k}: ${simbolo}`, tx, ty, { width: 130 }).text(fmt(v), tx + 130, ty, { width: 80, align: 'right' });
      ty += fuerte ? 14 : 11;
    }
    if (d.letra === 'B') {
      doc.fontSize(6.5).font('Helvetica').fillColor('#444')
        .text(`Régimen de Transparencia Fiscal al Consumidor (Ley 27.743) — IVA contenido: ${simbolo} ${fmt(d.totales.ivaTotal)}`, tx - 90, ty + 2, { width: 300, align: 'right' });
    }

    // QR + CAE
    doc.image(qr, M, y + 26, { width: 72, height: 72 });
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text('Comprobante autorizado', M + 80, y + 32);
    doc.fontSize(8).font('Helvetica').text(`CAE N°: ${d.cae.numero}`, M + 80, y + 46).text(`Vto. CAE: ${d.cae.vencimiento}`, M + 80, y + 58);
    doc.fontSize(6.5).fillColor('#666').text('ARCA — Agencia de Recaudación y Control Aduanero', M + 80, y + 72);

    if (e.textoPie) {
      doc.fontSize(7).font('Helvetica').fillColor(e.colorSecundario).text(e.textoPie, M, PAGE_H - M - 14, { width: CW, align: 'center' });
    }
  }
}
