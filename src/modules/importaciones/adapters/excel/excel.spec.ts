import ExcelJS from 'exceljs';
import { validarItem } from '../../domain/validacion';
import { ArchivoInvalidoError, detectarDelimitador, formatoDeArchivo, leerArchivo, leerCsv } from './leer-archivo';
import { aDecimal, aFecha, aMoneda, aUnidad, mapearFilas } from './mapear-filas';
import { validarConfig, type PlantillaMapeoConfig } from './plantilla-mapeo';

const config: PlantillaMapeoConfig = {
  filaEncabezado: 1,
  columnas: [
    { campo: 'cliente.numeroDocumento', encabezado: 'CUIT', tipo: 'texto' },
    { campo: 'cliente.razonSocial', encabezado: 'Cliente', tipo: 'texto' },
    { campo: 'descripcion', encabezado: 'Concepto', alias: ['Descripción'], tipo: 'texto' },
    { campo: 'cantidad', encabezado: 'Horas', tipo: 'decimal', separadorDecimal: ',' },
    { campo: 'precioUnitario', encabezado: 'Precio', tipo: 'decimal', separadorDecimal: ',' },
    { campo: 'fecha', encabezado: 'Fecha', tipo: 'fecha', formatoFecha: 'DD/MM/YYYY' },
    { campo: 'metadatos.proyecto', encabezado: 'Proyecto', tipo: 'texto' },
  ],
  valoresPorDefecto: { unidad: 'HORA', alicuotaIva: '21', moneda: 'ARS' },
  referencia: { columnas: ['Id'] },
};

const CSV = [
  'Id;CUIT;Cliente;Descripción;Horas;Precio;Fecha;Proyecto',
  'A-1;30-71234567-1;Acme SA;Desarrollo web;10,5;12.500,00;03/09/2026;Web',
  ';;;;;;;',
  'A-2;30712345671;Acme SA;Soporte;2;12.500;15/09/2026;Soporte',
].join('\r\n');

describe('lectura de archivos', () => {
  it('reconoce el formato por extensión y rechaza .xls', () => {
    expect(formatoDeArchivo('horas.XLSX')).toBe('xlsx');
    expect(formatoDeArchivo('horas.csv')).toBe('csv');
    expect(() => formatoDeArchivo('horas.xls')).toThrow(ArchivoInvalidoError);
    expect(() => formatoDeArchivo('horas.pdf')).toThrow(/xlsx o \.csv/);
  });

  it('detecta el delimitador', () => {
    expect(detectarDelimitador('a;b;c\n1;2;3')).toBe(';');
    expect(detectarDelimitador('a,b,c')).toBe(',');
    expect(detectarDelimitador('a\tb\tc')).toBe('\t');
  });

  it('lee CSV en latin1 con comillas', () => {
    const latin1 = Buffer.from('Nombre;Importe\n"Pérez; Juan";1.000,50\n', 'latin1');
    expect(leerCsv(latin1, { encoding: 'latin1' }).slice(0, 2)).toEqual([
      ['Nombre', 'Importe'],
      ['Pérez; Juan', '1.000,50'],
    ]);
  });

  it('lee CSV en UTF-8 con BOM', () => {
    const utf8 = Buffer.from('﻿Nombre;Importe\nMaría;5\n', 'utf8');
    expect(leerCsv(utf8, {}).slice(0, 2)).toEqual([
      ['Nombre', 'Importe'],
      ['María', '5'],
    ]);
  });

  it('lee xlsx con fechas, fórmulas y la hoja pedida', async () => {
    const libro = new ExcelJS.Workbook();
    libro.addWorksheet('Otra').addRow(['nada']);
    const ws = libro.addWorksheet('Horas');
    ws.addRow(['Id', 'CUIT', 'Cliente', 'Concepto', 'Horas', 'Precio', 'Fecha', 'Proyecto']);
    ws.addRow(['X-1', '30712345671', 'Acme SA', 'Desarrollo', 10.5, 12500, new Date(Date.UTC(2026, 8, 3)), 'Web']);
    ws.addRow(['X-2', '30712345671', 'Acme SA', 'Total', { formula: 'E2*2', result: 21 }, 12500, new Date(Date.UTC(2026, 8, 4)), 'Web']);
    const buffer = Buffer.from(await libro.xlsx.writeBuffer());

    const { formato, hojas, filas } = await leerArchivo(buffer, 'horas.xlsx', { hoja: 'horas' });
    expect(formato).toBe('xlsx');
    expect(hojas).toEqual(['Otra', 'Horas']);
    const { items } = mapearFilas(filas, config, { prefijoReferencia: 'pm1' });
    expect(items[0]).toMatchObject({ referenciaExterna: 'pm1:X-1', cantidad: '10.5', precioUnitario: '12500', fecha: '2026-09-03' });
    expect(items[1].cantidad).toBe('21');
    await expect(leerArchivo(buffer, 'horas.xlsx', { hoja: 'No existe' })).rejects.toThrow(/Hojas del archivo: Otra, Horas/);
    await expect(leerArchivo(Buffer.from('no soy un excel'), 'horas.xlsx', {})).rejects.toThrow(ArchivoInvalidoError);
  });
});

describe('mapearFilas', () => {
  const { items, advertencias, filasLeidas } = mapearFilas(leerCsv(Buffer.from(CSV), {}), config, { prefijoReferencia: 'pm1' });

  it('convierte coma decimal, fechas y defaults, y saltea filas vacías', () => {
    expect(filasLeidas).toBe(2);
    expect(advertencias).toEqual([]);
    expect(items[0]).toMatchObject({
      origen: 'EXCEL',
      referenciaExterna: 'pm1:A-1',
      cliente: { numeroDocumento: '30-71234567-1', tipoDocumento: 'CUIT', alta: { razonSocial: 'Acme SA' } },
      descripcion: 'Desarrollo web',
      cantidad: '10.5',
      precioUnitario: '12500.00',
      unidad: 'HORA',
      moneda: 'ARS',
      alicuotaIva: '21',
      fecha: '2026-09-03',
      metadatos: { fila: 2, proyecto: 'Web' },
    });
    expect(items.map((i) => validarItem(i))).toEqual([[], []]);
  });

  it('sin columna de referencia usa un hash estable de la fila', () => {
    const sinRef = { ...config, referencia: undefined };
    const a = mapearFilas(leerCsv(Buffer.from(CSV), {}), sinRef, { prefijoReferencia: 'pm1' }).items;
    const b = mapearFilas(leerCsv(Buffer.from(CSV), {}), sinRef, { prefijoReferencia: 'pm1' }).items;
    expect(a[0].referenciaExterna).toMatch(/^pm1:fila:[0-9a-f]{24}$/);
    expect(a.map((i) => i.referenciaExterna)).toEqual(b.map((i) => i.referenciaExterna));
    expect(a[0].referenciaExterna).not.toBe(a[1].referenciaExterna);
  });

  it('avisa las columnas que no encuentra', () => {
    const r = mapearFilas([['Otra'], ['x']], config, { prefijoReferencia: 'p' });
    expect(r.advertencias.map((a) => a.mensaje)).toEqual(expect.arrayContaining(['No se encontró la columna "CUIT" (campo cliente.numeroDocumento).']));
  });

  it('lo que no puede convertir lo deja para que la validación lo marque', () => {
    const r = mapearFilas([['Id', 'CUIT', 'Concepto', 'Horas', 'Fecha'], ['1', '20123456786', 'X', 'diez', '31/02/2026']], config, { prefijoReferencia: 'p' });
    const campos = validarItem(r.items[0]).map((e) => e.campo);
    expect(campos).toEqual(expect.arrayContaining(['cantidad', 'fecha']));
  });
});

describe('conversiones', () => {
  it.each([
    [['$ 1.234,50', ','], '1234.50'],
    [['1,234.50', '.'], '1234.50'],
    [[1234.5, ','], '1234.5'],
    [['21%', ','], '21'],
  ] as const)('aDecimal(%j) → %s', ([v, sep], esperado) => {
    expect(aDecimal(v, sep)).toBe(esperado);
  });

  it('fechas', () => {
    expect(aFecha('3/9/26')).toBe('2026-09-03');
    expect(aFecha('2026-09-03')).toBe('2026-09-03');
    expect(aFecha('09/03/2026', 'MM/DD/YYYY')).toBe('2026-09-03');
    expect(aFecha(46268)).toBe('2026-09-03'); // serial de Excel
    expect(aFecha('31/02/2026')).toBe('31/02/2026');
  });

  it('unidades y monedas', () => {
    expect(aUnidad('Hs')).toBe('HORA');
    expect(aUnidad('Abono')).toBe('MES');
    expect(aMoneda('U$S')).toBe('USD');
    expect(aMoneda('Pesos')).toBe('ARS');
  });
});

describe('validarConfig', () => {
  it('acepta la config de ejemplo', () => {
    expect(validarConfig(config)).toEqual([]);
  });

  it('detecta problemas', () => {
    const errores = validarConfig({
      filaEncabezado: 0,
      delimitador: '|',
      columnas: [
        { campo: 'inventado', encabezado: 'X', tipo: 'texto' },
        { campo: 'descripcion', encabezado: '', tipo: 'color' },
      ],
    });
    expect(errores.join(' | ')).toMatch(/filaEncabezado/);
    expect(errores.join(' | ')).toMatch(/delimitador/);
    expect(errores.join(' | ')).toMatch(/"inventado" no existe/);
    expect(errores.join(' | ')).toMatch(/falta el encabezado/);
    expect(errores.join(' | ')).toMatch(/Falta mapear la columna de "cantidad"/);
    expect(errores.join(' | ')).toMatch(/identifique al cliente/);
  });
});
