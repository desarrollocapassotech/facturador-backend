import { evaluarChecklist, listoParaProduccion, type DatosChequeo } from './checklist';

const ahora = new Date('2026-09-29T12:00:00Z');
const base: DatosChequeo = {
  emisor: { razonSocial: 'Empresa SA', domicilioFiscal: 'Calle 1', inicioActividades: new Date('2020-01-01'), cuit: '30712345671' },
  afipSdkConfigurado: true,
  certificado: { venceEl: new Date('2028-09-01'), alias: 'facturador' },
  puntosVentaProduccion: [3],
  borradoresHomologacion: 0,
  ahora,
};
const por = (d: DatosChequeo) => Object.fromEntries(evaluarChecklist(d).map((c) => [c.id, c]));

describe('checklist de producción', () => {
  it('todo en orden: se puede activar', () => {
    const c = evaluarChecklist(base);
    expect(c.every((x) => x.ok)).toBe(true);
    expect(listoParaProduccion(c)).toBe(true);
    expect(por(base)['punto-venta'].mensaje).toMatch(/00003/);
  });

  it.each([
    ['sin certificado', { certificado: null }, 'certificado', /Falta cargarlo/],
    ['certificado vencido', { certificado: { venceEl: new Date('2026-09-01'), alias: null } }, 'certificado', /Venció el 01\/09\/2026/],
    ['sin punto de venta', { puntosVentaProduccion: [] }, 'punto-venta', /Falta cargar/],
    ['sin AfipSDK', { afipSdkConfigurado: false }, 'afipsdk', /AFIP_SDK_API_KEY/],
    ['sin inicio de actividades', { emisor: { ...base.emisor, inicioActividades: null } }, 'emisor', /inicio de actividades/],
  ] as const)('bloquea: %s', (_caso, cambio, id, mensaje) => {
    const d = { ...base, ...cambio } as DatosChequeo;
    expect(por(d)[id]).toMatchObject({ ok: false, obligatorio: true });
    expect(por(d)[id].mensaje).toMatch(mensaje);
    expect(listoParaProduccion(evaluarChecklist(d))).toBe(false);
  });

  it('un certificado por vencer avisa pero no bloquea', () => {
    const d = { ...base, certificado: { venceEl: new Date('2026-10-15T12:00:00Z'), alias: null } };
    expect(por(d).certificado).toMatchObject({ ok: true });
    expect(por(d).certificado.mensaje).toMatch(/en 16 días/);
  });

  it('los borradores de homologación avisan pero no bloquean', () => {
    const d = { ...base, borradoresHomologacion: 2 };
    expect(por(d).borradores).toMatchObject({ ok: false, obligatorio: false });
    expect(listoParaProduccion(evaluarChecklist(d))).toBe(true);
  });
});
