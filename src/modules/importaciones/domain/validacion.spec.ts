import type { ItemFacturableInput } from './item-facturable';
import { decimalCanonico, hashContenido, validarItem } from './validacion';

const item = (o: Partial<ItemFacturableInput> = {}): ItemFacturableInput => ({
  origen: 'EXCEL',
  referenciaExterna: 'fila-1',
  cliente: { numeroDocumento: '30712345678', tipoDocumento: 'CUIT' },
  descripcion: 'Desarrollo',
  cantidad: '10',
  unidad: 'HORA',
  precioUnitario: '1000',
  alicuotaIva: '21',
  periodo: { desde: '2026-09-01', hasta: '2026-09-30' },
  ...o,
});

const campos = (i: ItemFacturableInput, exigirPrecio = true) => validarItem(i, { exigirPrecio }).map((e) => e.campo);

describe('validarItem', () => {
  it('acepta un ítem completo', () => {
    expect(validarItem(item())).toEqual([]);
  });

  it.each([
    ['sin cliente', { cliente: {} }, 'cliente'],
    ['cantidad 0', { cantidad: '0' }, 'cantidad'],
    ['cantidad negativa', { cantidad: '-1' }, 'cantidad'],
    ['cantidad no numérica', { cantidad: 'diez' }, 'cantidad'],
    ['cantidad con 5 decimales', { cantidad: '1.12345' }, 'cantidad'],
    ['precio negativo', { precioUnitario: '-5' }, 'precioUnitario'],
    ['alícuota inexistente', { alicuotaIva: '19' }, 'alicuotaIva'],
    ['moneda rara', { moneda: 'EUR' as 'ARS' }, 'moneda'],
    ['fecha inválida', { fecha: '2026-02-30' }, 'fecha'],
    ['período invertido', { periodo: { desde: '2026-09-30', hasta: '2026-09-01' } }, 'periodo'],
    ['servicio sin período ni fecha', { periodo: undefined }, 'periodo'],
    ['sin descripción', { descripcion: '  ' }, 'descripcion'],
    ['sin referencia', { referenciaExterna: '' }, 'referenciaExterna'],
    ['unidad inválida', { unidad: 'KILO' as 'HORA' }, 'unidad'],
  ])('rechaza: %s', (_caso, cambio, campo) => {
    expect(campos(item(cambio))).toContain(campo);
  });

  it('un producto no necesita período', () => {
    expect(validarItem(item({ unidad: 'UNIDAD', periodo: undefined }))).toEqual([]);
  });

  it('precio 0 es válido; sin precio solo si va a salir de una tarifa', () => {
    expect(validarItem(item({ precioUnitario: '0' }))).toEqual([]);
    expect(campos(item({ precioUnitario: undefined }))).toContain('precioUnitario');
    expect(campos(item({ precioUnitario: undefined }), false)).toEqual([]);
  });
});

describe('hashContenido', () => {
  it('es estable ante formatos equivalentes', () => {
    expect(hashContenido(item({ cantidad: '10.50', precioUnitario: '1000.0' }))).toBe(hashContenido(item({ cantidad: '10.5', precioUnitario: '1000' })));
    expect(hashContenido(item({ cliente: { tipoDocumento: 'CUIT', numeroDocumento: '30-71234567-8' } }))).toBe(
      hashContenido(item({ cliente: { tipoDocumento: 'CUIT', numeroDocumento: '30712345678' } })),
    );
  });

  it('cambia si cambia algo facturable, no si cambian los metadatos', () => {
    const h = hashContenido(item());
    expect(hashContenido(item({ cantidad: '11' }))).not.toBe(h);
    expect(hashContenido(item({ precioUnitario: '999' }))).not.toBe(h);
    expect(hashContenido(item({ metadatos: { algo: 1 } }))).toBe(h);
  });
});

describe('decimalCanonico', () => {
  it('normaliza', () => {
    expect(decimalCanonico('10.50')).toBe('10.5');
    expect(decimalCanonico(' 7 ')).toBe('7');
    expect(decimalCanonico('1,5')).toBeNull();
    expect(decimalCanonico(undefined)).toBeNull();
  });
});
