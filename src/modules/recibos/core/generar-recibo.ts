import PDFDocument from 'pdfkit';
import { armarContenido, type ContenidoRecibo } from './contenido';
import type { ReciboEstilo, ReciboInput, ReciboOutput } from './recibo.types';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 36;
const CW = PAGE_W - M * 2;
const FIRMA_ALTO = 90;
const PIE_ALTO = 24;
const HEX = /^#[0-9a-fA-F]{6}$/;

interface Colores {
  primario: string;
  secundario: string;
}

/**
 * Genera el PDF de un recibo de cobro o de pago. Valida los datos (lanza ReciboInvalidoError)
 * y dibuja con el logo y los colores del estilo. No es un comprobante electrónico de ARCA.
 */
export async function generarRecibo(input: ReciboInput, estilo: ReciboEstilo = {}): Promise<ReciboOutput> {
  const c = armarContenido(input);
  const colores: Colores = {
    primario: estilo.colorPrimario && HEX.test(estilo.colorPrimario) ? estilo.colorPrimario : '#111827',
    secundario: estilo.colorSecundario && HEX.test(estilo.colorSecundario) ? estilo.colorSecundario : '#6B7280',
  };

  const pdf = await new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      info: { Title: c.numero ? `${c.titulo} N° ${c.numero}` : c.titulo, Producer: 'Facturador' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (b: Buffer) => chunks.push(b));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      dibujar(doc, c, estilo, colores);
      doc.end();
    } catch (e) {
      reject(e);
    }
  });

  return { pdf, filename: c.filename };
}

function dibujar(doc: PDFKit.PDFDocument, c: ContenidoRecibo, estilo: ReciboEstilo, col: Colores) {
  const limite = PAGE_H - M - PIE_ALTO;
  const pie = () => {
    if (estilo.textoPie) {
      doc.fontSize(7).font('Helvetica').fillColor(col.secundario)
        .text(estilo.textoPie, M, PAGE_H - M - 12, { width: CW, align: 'center', lineBreak: false, ellipsis: true });
    }
  };
  const nuevaPagina = () => {
    pie();
    doc.addPage();
    return M;
  };

  let y = encabezado(doc, c, estilo, col);

  // Cuerpo
  doc.fontSize(10).font('Helvetica').fillColor('#111');
  doc.text(c.cuerpo, M, y, { width: CW, align: 'justify', lineGap: 2 });
  y = doc.y + 14;

  // Conceptos
  const cols = [
    { t: 'Concepto', w: CW - 190, a: 'left' as const },
    { t: 'Cantidad', w: 80, a: 'right' as const },
    { t: 'Importe', w: 110, a: 'right' as const },
  ];
  const cabecera = (yy: number, titulos = cols) => {
    doc.rect(M, yy, CW, 18).fill(col.primario);
    let x = M;
    for (const k of titulos) {
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff').text(k.t, x + 4, yy + 5, { width: k.w - 8, align: k.a });
      x += k.w;
    }
    return yy + 18;
  };
  const fila = (yy: number, celdas: string[], anchos = cols) => {
    doc.fontSize(8.5).font('Helvetica');
    const alto = Math.max(18, ...celdas.map((v, i) => doc.heightOfString(v, { width: anchos[i].w - 8 }) + 8));
    if (yy + alto > limite) yy = cabecera(nuevaPagina(), anchos);
    let x = M;
    celdas.forEach((v, i) => {
      doc.fillColor('#111').text(v, x + 4, yy + 4, { width: anchos[i].w - 8, align: anchos[i].a });
      x += anchos[i].w;
    });
    doc.moveTo(M, yy + alto).lineTo(M + CW, yy + alto).lineWidth(0.5).stroke('#ddd');
    return yy + alto;
  };

  y = cabecera(y);
  for (const it of c.items) y = fila(y, [it.descripcion, it.cantidad, it.importe]);
  if (y + 22 > limite) y = nuevaPagina();
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
    .text('Total', M + 4, y + 6, { width: CW - 118, align: 'right' })
    .text(c.total, M + CW - 110, y + 6, { width: 106, align: 'right' });
  y += 26;

  // Comprobantes que cancela (solo cobro)
  if (c.comprobantesAplicados.length) {
    const colsAplic = [
      { t: 'Comprobantes que cancela', w: CW - 110, a: 'left' as const },
      { t: 'Importe', w: 110, a: 'right' as const },
    ];
    if (y + 40 > limite) y = nuevaPagina();
    y = cabecera(y + 6, colsAplic);
    for (const a of c.comprobantesAplicados) y = fila(y, [a.descripcion, a.importe], colsAplic);
    y += 8;
  }

  // Período, medio de pago, observaciones
  for (const [k, v] of c.datosExtra) {
    if (y + 14 > limite) y = nuevaPagina();
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(`${k}: `, M, y, { continued: true }).font('Helvetica').text(v, { width: CW });
    y = doc.y + 4;
  }
  if (c.observaciones) {
    doc.fontSize(8.5).font('Helvetica-Oblique').fillColor('#444');
    const alto = doc.heightOfString(c.observaciones, { width: CW });
    if (y + alto + 6 > limite) y = nuevaPagina();
    doc.text(c.observaciones, M, y + 4, { width: CW });
    y = doc.y + 4;
  }

  // Firma: al pie de la página (o en una nueva si no entra).
  if (y + FIRMA_ALTO > limite) y = nuevaPagina();
  const fy = Math.max(y + 30, limite - FIRMA_ALTO + 30);
  const fx = M + CW - 220;
  doc.moveTo(fx, fy).lineTo(fx + 220, fy).lineWidth(0.8).stroke('#000');
  doc.fontSize(8).font('Helvetica').fillColor('#444').text(c.firma.etiqueta, fx, fy + 4, { width: 220, align: 'center' });
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#000').text(c.firma.nombre, fx, fy + 16, { width: 220, align: 'center' });
  if (c.firma.documento) {
    doc.fontSize(8).font('Helvetica').fillColor('#444').text(c.firma.documento, fx, doc.y + 1, { width: 220, align: 'center' });
  }
  pie();
}

function encabezado(doc: PDFKit.PDFDocument, c: ContenidoRecibo, estilo: ReciboEstilo, col: Colores): number {
  const y = M;
  const alto = 96;
  const mitad = M + CW * 0.55;
  doc.rect(M, y, CW, alto).lineWidth(0.8).stroke('#999');

  // Quien encabeza (el tenant): logo y datos.
  let ey = y + 10;
  if (estilo.logo?.length) {
    try {
      doc.image(Buffer.from(estilo.logo), M + 10, ey, { fit: [120, 40] });
      ey += 46;
    } catch {
      // logo ilegible: se omite
    }
  }
  const anchoIzq = mitad - M - 20;
  doc.fontSize(11).font('Helvetica-Bold').fillColor(col.primario).text(c.encabezado.nombre, M + 10, ey, { width: anchoIzq });
  doc.fontSize(8).font('Helvetica').fillColor('#333');
  if (c.encabezado.documento) doc.text(c.encabezado.documento, { width: anchoIzq });
  if (c.encabezado.domicilio) doc.text(c.encabezado.domicilio, { width: anchoIzq });

  // Título, número y fecha.
  doc.moveTo(mitad, y).lineTo(mitad, y + alto).stroke('#999');
  const xr = mitad + 12;
  const wr = M + CW - xr - 10;
  doc.fontSize(15).font('Helvetica-Bold').fillColor(col.primario).text(c.titulo, xr, y + 12, { width: wr });
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#000');
  if (c.numero) doc.text(`N° ${c.numero}`, xr, y + 36, { width: wr });
  doc.font('Helvetica').text(`Fecha: ${c.fecha}`, xr, y + 50, { width: wr });
  doc.fontSize(7).fillColor('#666').text('Documento no válido como factura.', xr, y + 76, { width: wr });

  return y + alto + 18;
}
