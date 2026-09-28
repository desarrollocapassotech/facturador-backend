import Decimal from 'decimal.js';
import type { Advertencia, ItemFacturableInput } from '../../domain/item-facturable';
import type { ParametrosTracker, RegistroHorasTracker } from './tracker.types';

// QUÉ se factura de las horas del tracker (ARCHITECTURE.md §7.3). Función pura:
// - Agrupa por (cliente, proyecto, mes) — o un ítem por registro.
// - Proyectos por hora: cantidad = Σ horas facturables (o trabajadas), unidad HORA.
// - Proyectos mensuales: cantidad 1, unidad MES.
// - Sin precio: el staging aplica la tarifa del Facturador (NUNCA project.rate del tracker).
// - referenciaExterna estable → reimportar el mes no duplica; si cambian las horas, se actualiza.

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

export function nombreMes(yyyyMm: string): string {
  return `${MESES[Number(yyyyMm.slice(5, 7)) - 1]} ${yyyyMm.slice(0, 4)}`;
}

function ultimoDia(yyyyMm: string): string {
  const [a, m] = yyyyMm.split('-').map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/** Texto libre de condición IVA del tracker → enum del Facturador (o undefined si no se reconoce). */
export function condicionIvaDeTexto(texto: string | null | undefined): string | undefined {
  const t = (texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (!t.trim()) return undefined;
  if (/monotrib/.test(t)) return 'MONOTRIBUTO';
  if (/inscript|\bri\b|responsable/.test(t)) return 'RESPONSABLE_INSCRIPTO';
  if (/exent/.test(t)) return 'EXENTO';
  if (/consumidor/.test(t)) return 'CONSUMIDOR_FINAL';
  if (/exterior/.test(t)) return 'CLIENTE_EXTERIOR';
  return undefined;
}

interface Grupo {
  clave: string;
  mes: string;
  cliente: NonNullable<RegistroHorasTracker['client']>;
  proyecto: RegistroHorasTracker['project'];
  trabajadas: Decimal;
  facturables: Decimal;
  ids: string[];
  desde: string;
  hasta: string;
}

export function agruparHoras(
  registros: RegistroHorasTracker[],
  p: ParametrosTracker,
): { items: ItemFacturableInput[]; advertencias: Advertencia[] } {
  const advertencias: Advertencia[] = [];
  const grupos = new Map<string, Grupo>();
  const filtro = p.clienteExternoIds?.length ? new Set(p.clienteExternoIds) : null;
  let sinCliente = 0;

  for (const r of registros) {
    if (!r.client) {
      sinCliente++;
      continue;
    }
    if (filtro && !filtro.has(r.client.id)) continue;
    const mes = r.date.slice(0, 7);
    const clave = p.agrupacion === 'registro' ? `entry:${r.id}` : `${r.client.id}:${r.project.id}:${mes}`;
    const g = grupos.get(clave) ?? {
      clave,
      mes,
      cliente: r.client,
      proyecto: r.project,
      trabajadas: new Decimal(0),
      facturables: new Decimal(0),
      ids: [],
      desde: r.date,
      hasta: r.date,
    };
    g.trabajadas = g.trabajadas.plus(new Decimal(r.hours || '0'));
    g.facturables = g.facturables.plus(new Decimal(r.billableHours || '0'));
    g.ids.push(r.id);
    if (r.date < g.desde) g.desde = r.date;
    if (r.date > g.hasta) g.hasta = r.date;
    grupos.set(clave, g);
  }
  if (sinCliente) {
    advertencias.push({ mensaje: `${sinCliente} registro(s) de proyectos sin cliente en el tracker: no se importaron.` });
  }

  const items: ItemFacturableInput[] = [];
  for (const g of grupos.values()) {
    const mensual = g.proyecto.billingType === 'monthly';
    const horas = (p.baseHoras === 'TRABAJADAS' ? g.trabajadas : g.facturables).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
    const periodo =
      p.agrupacion === 'registro'
        ? { desde: g.desde, hasta: g.hasta }
        : { desde: `${g.mes}-01` < p.desde ? p.desde : `${g.mes}-01`, hasta: ultimoDia(g.mes) > p.hasta ? p.hasta : ultimoDia(g.mes) };

    if (!mensual && horas.lte(0)) {
      advertencias.push({
        referencia: `tracker:${g.clave}`,
        mensaje: `${g.proyecto.name} (${g.cliente.name}, ${nombreMes(g.mes)}): sin horas ${p.baseHoras === 'TRABAJADAS' ? 'trabajadas' : 'facturables'}; no se importó.`,
      });
      continue;
    }

    const cuit = g.cliente.cuit?.replace(/\D/g, '');
    const periodoTexto = nombreMes(g.mes);
    items.push({
      origen: 'TRACKER',
      referenciaExterna: `tracker:${g.clave}`,
      cliente: {
        referenciaExterna: g.cliente.id,
        ...(cuit && cuit.length === 11 ? { tipoDocumento: 'CUIT' as const, numeroDocumento: cuit } : {}),
        alta: {
          razonSocial: g.cliente.razonSocial?.trim() || g.cliente.name,
          condicionIva: condicionIvaDeTexto(g.cliente.ivaCondition),
        },
      },
      descripcion: mensual ? `${g.proyecto.name} - Abono ${periodoTexto}` : `${g.proyecto.name} - Horas ${periodoTexto}`,
      cantidad: mensual ? '1' : horas.toString(),
      unidad: mensual ? 'MES' : 'HORA',
      periodo,
      metadatos: {
        tarifa: { claveExterna: g.proyecto.id, variables: { proyecto: g.proyecto.name, periodo: periodoTexto, cliente: g.cliente.name } },
        proyecto: { id: g.proyecto.id, nombre: g.proyecto.name, billingType: g.proyecto.billingType },
        clienteTracker: { id: g.cliente.id, nombre: g.cliente.name },
        horasTrabajadas: g.trabajadas.toString(),
        horasFacturables: g.facturables.toString(),
        baseHoras: p.baseHoras,
        registros: g.ids.length,
        idsRegistros: g.ids,
      },
    });
  }
  return { items, advertencias };
}
