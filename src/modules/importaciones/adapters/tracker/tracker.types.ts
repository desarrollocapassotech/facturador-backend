// Respuesta de GET /integrations/billable-hours del tracker (ARCHITECTURE.md §10 D2).

export interface RegistroHorasTracker {
  id: string;
  date: string; // YYYY-MM-DD
  hours: string; // trabajadas
  billableHours: string; // calculadas por el tracker
  taskBillingType?: string;
  taskTitle?: string;
  collaborator?: { id: string; name: string };
  project: { id: string; name: string; billingType: string | null };
  client: {
    id: string;
    name: string;
    razonSocial?: string | null;
    cuit?: string | null;
    ivaCondition?: string | null;
    billingCurrency?: string | null;
  } | null;
}

export interface RespuestaHorasTracker {
  from: string;
  to: string;
  generatedAt: string;
  entries: RegistroHorasTracker[];
}

export type BaseHoras = 'FACTURABLES' | 'TRABAJADAS';
export type AgrupacionTracker = 'proyecto-mes' | 'registro';

export interface ParametrosTracker {
  desde: string;
  hasta: string;
  baseHoras: BaseHoras;
  agrupacion: AgrupacionTracker;
  /** Solo estos clientes del tracker (ids); vacío = todos. */
  clienteExternoIds?: string[];
}

export interface ConexionTrackerDatos {
  baseUrl: string;
  apiKey: string;
}
