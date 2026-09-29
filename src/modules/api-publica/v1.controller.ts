import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  UnprocessableEntityException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiHeader, ApiOkResponse, ApiOperation, ApiProduces, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { ApiKey, CurrentAuth, type AuthContext } from '../auth';
import { ClientesService, CrearClienteDto } from '../clientes';
import { ComprobantePdfService, ComprobantesService, EmisionService } from '../comprobantes';
import { ImportacionesService, type ItemFacturableInput } from '../importaciones';
import {
  BorradoresGeneradosDto,
  CargarItemsDto,
  ClientePublicoDto,
  ComprobantePublicoDto,
  ComprobantesPaginadosDto,
  EmitirApiDto,
  GenerarBorradoresApiDto,
  ItemPublicoDto,
  ListarComprobantesApiQuery,
  ResultadoCargaDto,
} from './dto/api-publica.dto';
import { Idempotente, IdempotenciaInterceptor } from './idempotencia/idempotencia.interceptor';
import { clientePublico, comprobantePublico, importacionPublica, itemPublico, type ComprobanteInterno } from './representaciones';

const CLAVE_IDEMPOTENCIA = {
  name: 'Idempotency-Key',
  required: false,
  description: 'Opcional (obligatoria para emitir). 8 a 100 caracteres. Reintentar con la misma clave devuelve la misma respuesta durante 24 h.',
};

const comprobante = (c: unknown) => comprobantePublico(c as ComprobanteInterno);

/** API pública para sistemas integrados: todas las rutas exigen `X-Api-Key` con el scope indicado. */
@ApiTags('API pública')
@ApiSecurity('api-key')
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 300, ttl: 60_000 } })
@UseInterceptors(IdempotenciaInterceptor)
@Controller('v1')
export class V1Controller {
  constructor(
    private readonly importaciones: ImportacionesService,
    private readonly comprobantes: ComprobantesService,
    private readonly emision: EmisionService,
    private readonly pdf: ComprobantePdfService,
    private readonly clientes: ClientesService,
  ) {}

  // ── Ítems ────────────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Cargar ítems a facturar',
    description:
      'Ingresa los ítems al staging (scope `items:write`). Es idempotente por `referenciaExterna`: reenviar un ítem igual no lo duplica y uno distinto lo actualiza (si todavía no se facturó). Cada ítem vuelve con su estado y sus errores.',
  })
  @ApiHeader(CLAVE_IDEMPOTENCIA)
  @ApiOkResponse({ type: ResultadoCargaDto })
  @ApiKey('items:write')
  @Idempotente()
  @Post('items')
  @HttpCode(200)
  async cargarItems(@CurrentAuth() auth: AuthContext, @Body() dto: CargarItemsDto): Promise<ResultadoCargaDto> {
    const imp = await this.importaciones.importarApi(auth, dto.items as ItemFacturableInput[], { descripcion: dto.descripcion, confirmar: dto.confirmar });
    const refs = dto.items.map((i) => i.referenciaExterna.trim());
    const items = await this.importaciones.itemsPorReferencia(auth.tenantId, auth.origenIntegracion ?? 'API', refs);
    const porRef = new Map(items.map((i) => [i.referenciaExterna, i]));
    return {
      importacion: importacionPublica(imp),
      items: refs.map((r) => porRef.get(r)).filter((i): i is NonNullable<typeof i> => Boolean(i)).map(itemPublico),
    };
  }

  @ApiOperation({ summary: 'Consultar ítems por tu referencia', description: 'Hasta 200 referencias (`?referencia=a&referencia=b`). Scope `items:write`.' })
  @ApiOkResponse({ type: [ItemPublicoDto] })
  @ApiKey('items:write')
  @Get('items')
  async items(@CurrentAuth() auth: AuthContext, @Query('referencia') referencia?: string | string[]): Promise<ItemPublicoDto[]> {
    const refs = (Array.isArray(referencia) ? referencia : referencia ? [referencia] : []).slice(0, 200);
    if (!refs.length) throw new BadRequestException('Indicá al menos una referencia (?referencia=…).');
    return (await this.importaciones.itemsPorReferencia(auth.tenantId, auth.origenIntegracion ?? 'API', refs)).map(itemPublico);
  }

  @ApiOperation({ summary: 'Ver una importación y sus ítems' })
  @ApiOkResponse({ type: ResultadoCargaDto })
  @ApiKey('items:write')
  @Get('importaciones/:id')
  async importacion(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<ResultadoCargaDto> {
    const [imp, items] = await Promise.all([this.importaciones.obtener(auth.tenantId, id), this.importaciones.itemsDe(auth.tenantId, id)]);
    return { importacion: importacionPublica(imp), items: items.map(itemPublico) };
  }

  @ApiOperation({ summary: 'Confirmar una importación', description: 'Deja sus ítems válidos listos para generar borradores.' })
  @ApiHeader(CLAVE_IDEMPOTENCIA)
  @ApiOkResponse({ type: ResultadoCargaDto })
  @ApiKey('items:write')
  @Idempotente()
  @Post('importaciones/:id/confirmar')
  @HttpCode(200)
  async confirmar(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<ResultadoCargaDto> {
    const imp = await this.importaciones.confirmar(auth.tenantId, id);
    return { importacion: importacionPublica(imp), items: (await this.importaciones.itemsDe(auth.tenantId, id)).map(itemPublico) };
  }

  // ── Clientes ─────────────────────────────────────────────────────────────

  @ApiOperation({ summary: 'Buscar clientes por documento o nombre', description: 'Scope `items:write`.' })
  @ApiOkResponse({ type: [ClientePublicoDto] })
  @ApiKey('items:write')
  @Get('clientes')
  async buscarClientes(@CurrentAuth() auth: AuthContext, @Query('q') q?: string): Promise<ClientePublicoDto[]> {
    if (!q?.trim()) throw new BadRequestException('Indicá qué buscar (?q=CUIT o nombre).');
    return (await this.clientes.listar(auth.tenantId, { q })).map(clientePublico);
  }

  @ApiOperation({ summary: 'Dar de alta un cliente', description: 'Valida el documento (dígito verificador del CUIT). `409` si ya existe. Scope `items:write`.' })
  @ApiHeader(CLAVE_IDEMPOTENCIA)
  @ApiOkResponse({ type: ClientePublicoDto })
  @ApiKey('items:write')
  @Idempotente()
  @Post('clientes')
  async crearCliente(@CurrentAuth() auth: AuthContext, @Body() dto: CrearClienteDto): Promise<ClientePublicoDto> {
    return clientePublico(await this.clientes.crear(auth.tenantId, dto));
  }

  // ── Comprobantes ─────────────────────────────────────────────────────────

  @ApiOperation({
    summary: 'Generar borradores desde ítems',
    description:
      'Un borrador por cliente y moneda (o también por mes). Solo toma ítems VALIDO de importaciones confirmadas. La letra se sugiere según las condiciones de IVA. Scope `comprobantes:write`.',
  })
  @ApiHeader(CLAVE_IDEMPOTENCIA)
  @ApiOkResponse({ type: BorradoresGeneradosDto })
  @ApiKey('comprobantes:write')
  @Idempotente()
  @Post('comprobantes/borradores')
  async generar(@CurrentAuth() auth: AuthContext, @Body() dto: GenerarBorradoresApiDto): Promise<BorradoresGeneradosDto> {
    let itemIds = dto.itemIds;
    if (dto.referencias?.length) {
      const encontrados = await this.importaciones.itemsPorReferencia(auth.tenantId, auth.origenIntegracion ?? 'API', dto.referencias);
      const faltan = dto.referencias.filter((r) => !encontrados.some((i) => i.referenciaExterna === r));
      if (faltan.length) throw new BadRequestException(`No existen ítems con estas referencias: ${faltan.slice(0, 20).join(', ')}.`);
      itemIds = [...(itemIds ?? []), ...encontrados.map((i) => i.id)];
    }
    const r = await this.comprobantes.generarDesdeItems(auth, {
      itemIds,
      importacionId: dto.importacionId,
      agrupacion: dto.agrupacion,
      fechaEmision: dto.fechaEmision,
    });
    const completos = await Promise.all(r.comprobantes.map((c) => this.comprobantes.obtener(auth.tenantId, c.id)));
    return { comprobantes: completos.map(comprobante) };
  }

  @ApiOperation({ summary: 'Listar comprobantes', description: 'Scope `comprobantes:read`.' })
  @ApiOkResponse({ type: ComprobantesPaginadosDto })
  @ApiKey('comprobantes:read')
  @Get('comprobantes')
  async listar(@CurrentAuth() auth: AuthContext, @Query() q: ListarComprobantesApiQuery): Promise<ComprobantesPaginadosDto> {
    const r = await this.comprobantes.listar(auth.tenantId, q);
    const completos = await Promise.all(r.items.map((c) => this.comprobantes.obtener(auth.tenantId, c.id)));
    return { total: r.total, pagina: r.pagina, porPagina: r.porPagina, items: completos.map(comprobante) };
  }

  @ApiOperation({ summary: 'Ver un comprobante', description: 'Scope `comprobantes:read`.' })
  @ApiOkResponse({ type: ComprobantePublicoDto })
  @ApiKey('comprobantes:read')
  @Get('comprobantes/:id')
  async obtener(@CurrentAuth() auth: AuthContext, @Param('id') id: string): Promise<ComprobantePublicoDto> {
    return comprobante(await this.comprobantes.obtener(auth.tenantId, id));
  }

  @ApiOperation({
    summary: 'Emitir un comprobante en ARCA',
    description:
      '`Idempotency-Key` obligatoria: reintentar con la misma clave nunca emite dos veces. Responde EMITIDO, `422` si ARCA rechaza (con el motivo) o PENDIENTE_VERIFICACION si no se supo el resultado (se verifica solo; te llega el webhook). Scope `comprobantes:write`.',
  })
  @ApiHeader({ ...CLAVE_IDEMPOTENCIA, required: true, description: 'Obligatoria. 8 a 100 caracteres (letras, números, - o _).' })
  @ApiOkResponse({ type: ComprobantePublicoDto })
  @ApiBody({ type: EmitirApiDto, required: false })
  @ApiKey('comprobantes:write')
  @Idempotente({ obligatoria: true })
  @Post('comprobantes/:id/emitir')
  @HttpCode(200)
  async emitir(@CurrentAuth() auth: AuthContext, @Param('id') id: string, @Body() dto: EmitirApiDto, @Res({ passthrough: true }) res: Response): Promise<ComprobantePublicoDto> {
    const clave = String(res.req.headers['idempotency-key']);
    const version = dto.version ?? (await this.comprobantes.obtener(auth.tenantId, id)).version;
    try {
      return comprobante(await this.emision.emitir(auth, id, version, clave));
    } catch (err) {
      // El rechazo de ARCA trae el comprobante en su forma interna: hacia afuera va la pública.
      if (err instanceof UnprocessableEntityException) {
        const cuerpo = err.getResponse() as { message?: string; detalle?: string | null; comprobante?: unknown };
        if (cuerpo?.comprobante) {
          throw new UnprocessableEntityException({ message: cuerpo.message, detalle: cuerpo.detalle ?? null, comprobante: comprobante(cuerpo.comprobante) });
        }
      }
      throw err;
    }
  }

  @ApiOperation({ summary: 'Descargar el PDF', description: 'Solo comprobantes con CAE. Scope `comprobantes:read`.' })
  @ApiProduces('application/pdf')
  @ApiKey('comprobantes:read')
  @Get('comprobantes/:id/pdf')
  async descargarPdf(@CurrentAuth() auth: AuthContext, @Param('id') id: string, @Res() res: Response) {
    const { buffer, filename } = await this.pdf.generar(auth.tenantId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(buffer);
  }
}
