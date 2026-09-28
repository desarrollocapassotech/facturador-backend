/** Datos listos para dibujar: el renderer no consulta nada ni calcula importes. */
export interface ComprobantePdfData {
  letra: 'A' | 'B' | 'C';
  codigo: number;
  titulo: string; // FACTURA | NOTA DE CRÉDITO | NOTA DE DÉBITO
  puntoVenta: number;
  numero: number;
  fechaEmision: string; // dd/mm/aaaa
  emisor: {
    razonSocial: string;
    nombreFantasia?: string;
    cuit: string;
    condicionIva: string;
    domicilio: string;
    ingresosBrutos?: string | null;
    inicioActividades?: string | null;
  };
  receptor: {
    razonSocial: string;
    documento: string; // "CUIT 30-66834690-8"
    condicionIva: string;
    domicilio?: string | null;
  };
  concepto: string;
  periodoServicio?: { desde: string; hasta: string; vtoPago: string };
  moneda: 'ARS' | 'USD';
  cotizacion?: string;
  lineas: Array<{
    descripcion: string;
    cantidad: string;
    unidad: string;
    precioUnitario: string;
    bonificacionPct: string;
    alicuotaIva: string;
    importeNeto: string;
    importeTotal: string;
  }>;
  totales: {
    netoGravado: string;
    iva: Array<{ alicuota: string; importe: string }>;
    ivaTotal: string;
    tributos: string;
    total: string;
  };
  asociado?: { descripcion: string };
  observaciones?: string | null;
  cae: { numero: string; vencimiento: string; qrUrl: string };
  homologacion: boolean;
}

export interface EstiloPdf {
  logo: Buffer | null;
  colorPrimario: string;
  colorSecundario: string;
  textoPie: string | null;
  mostrarDuplicado: boolean;
}
