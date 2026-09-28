import { calcularTotales, TotalesInvalidosError } from './totales';

const s = (d: { toFixed: (n: number) => string }) => d.toFixed(2);

describe('calcularTotales', () => {
  it('Factura A simple al 21 %', () => {
    const t = calcularTotales([{ cantidad: '10', precioUnitario: '1000', alicuotaIva: '21' }], 'A');
    expect(s(t.importeNetoGravado)).toBe('10000.00');
    expect(s(t.importeIva)).toBe('2100.00');
    expect(s(t.importeTotal)).toBe('12100.00');
    expect(t.alicuotas).toHaveLength(1);
    expect(t.alicuotas[0]).toMatchObject({ arcaId: 5 });
    expect(s(t.alicuotas[0].baseImponible)).toBe('10000.00');
  });

  it('agrupa varias alícuotas en un registro por Id y ImpNeto = Σ BaseImp (10061)', () => {
    const t = calcularTotales(
      [
        { cantidad: '1', precioUnitario: '100', alicuotaIva: '21' },
        { cantidad: '2', precioUnitario: '50', alicuotaIva: '10.5' },
        { cantidad: '1', precioUnitario: '300', alicuotaIva: '21' },
        { cantidad: '1', precioUnitario: '40', alicuotaIva: '0' },
      ],
      'A',
    );
    expect(t.alicuotas.map((a) => a.arcaId)).toEqual([3, 4, 5]);
    const sumaBases = t.alicuotas.reduce((acc, a) => acc + Number(a.baseImponible), 0);
    expect(sumaBases.toFixed(2)).toBe(s(t.importeNetoGravado));
    expect(s(t.importeNetoGravado)).toBe('540.00');
    expect(s(t.importeIva)).toBe('94.50'); // 400×21% + 100×10,5% + 40×0%
    expect(s(t.alicuotas[0].importe)).toBe('0.00');
  });

  it('ajusta centavos para que Σ IVA de líneas = ImpIVA (10023)', () => {
    // Tres líneas de 0,05 al 21 %: por línea 0,01 c/u (redondeo) = 0,03; agrupado 0,15 × 21 % = 0,03.
    // Caso con diferencia: 0,07 × 3 → por línea 0,01 × 3 = 0,03; agrupado 0,21 × 21 % = 0,04.
    const t = calcularTotales(
      [
        { cantidad: '1', precioUnitario: '0.07', alicuotaIva: '21' },
        { cantidad: '1', precioUnitario: '0.07', alicuotaIva: '21' },
        { cantidad: '1', precioUnitario: '0.07', alicuotaIva: '21' },
      ],
      'A',
    );
    expect(s(t.importeIva)).toBe('0.04');
    const ivaLineas = t.lineas.reduce((acc, l) => acc + Number(l.importeIva), 0);
    expect(ivaLineas.toFixed(2)).toBe('0.04');
    expect(s(t.importeTotal)).toBe('0.25');
  });

  it('aplica bonificación antes del IVA', () => {
    const t = calcularTotales(
      [{ cantidad: '3', precioUnitario: '333.33', bonificacionPct: '10', alicuotaIva: '21' }],
      'B',
    );
    expect(s(t.lineas[0].importeNeto)).toBe('899.99'); // 999,99 × 0,9 = 899,991
    expect(s(t.importeIva)).toBe('189.00'); // 899,99 × 21 % = 188,9979
  });

  it('Factura C: no discrimina IVA', () => {
    const t = calcularTotales([{ cantidad: '8.5', precioUnitario: '15000', alicuotaIva: '21' }], 'C');
    expect(t.alicuotas).toEqual([]);
    expect(s(t.importeIva)).toBe('0.00');
    expect(s(t.importeNetoGravado)).toBe('127500.00');
    expect(s(t.importeTotal)).toBe('127500.00');
  });

  it('cantidades con decimales (horas)', () => {
    const t = calcularTotales([{ cantidad: '37.75', precioUnitario: '12500.5', alicuotaIva: '21' }], 'A');
    expect(s(t.importeNetoGravado)).toBe('471893.88'); // 471.893,875 → redondeo half-up
  });

  it.each([
    ['sin líneas', []],
    ['cantidad 0', [{ cantidad: '0', precioUnitario: '1', alicuotaIva: '21' }]],
    ['precio negativo', [{ cantidad: '1', precioUnitario: '-1', alicuotaIva: '21' }]],
    ['alícuota inválida', [{ cantidad: '1', precioUnitario: '1', alicuotaIva: '19' }]],
    ['total 0', [{ cantidad: '1', precioUnitario: '0', alicuotaIva: '21' }]],
  ])('rechaza %s', (_caso, lineas) => {
    expect(() => calcularTotales(lineas, 'A')).toThrow(TotalesInvalidosError);
  });
});
