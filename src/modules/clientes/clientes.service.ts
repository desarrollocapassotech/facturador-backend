import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Cliente } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { esCuitValido, normalizarCuit } from '../../shared/util/cuit';
import { ARCA_GATEWAY, ArcaError, type ArcaGateway } from '../arca';
import { CredencialesArcaProvider } from '../tenants';
import { normalizarDocumento } from './documento';
import { ActualizarClienteDto, CrearClienteDto, ListarClientesQuery } from './dto/clientes.dto';

@Injectable()
export class ClientesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly credenciales: CredencialesArcaProvider,
    @Inject(ARCA_GATEWAY) private readonly arca: ArcaGateway,
  ) {}

  listar(tenantId: string, query: ListarClientesQuery) {
    const q = query.q?.trim();
    return this.prisma.cliente.findMany({
      where: {
        tenantId,
        ...(query.incluirInactivos ? {} : { activo: true }),
        ...(q
          ? {
              OR: [
                { razonSocial: { contains: q, mode: 'insensitive' } },
                { numeroDocumento: { contains: q.replace(/[-.\s]/g, '') } },
              ],
            }
          : {}),
      },
      orderBy: { razonSocial: 'asc' },
      take: 200,
    });
  }

  async obtener(tenantId: string, id: string): Promise<Cliente> {
    const c = await this.prisma.cliente.findUnique({ where: { tenantId_id: { tenantId, id } } });
    if (!c) throw new NotFoundException('Cliente no encontrado.');
    return c;
  }

  async crear(tenantId: string, dto: CrearClienteDto) {
    const doc = normalizarDocumento(dto.tipoDocumento, dto.numeroDocumento);
    if (!doc.ok) throw new BadRequestException(doc.error);
    return this.guardar(() =>
      this.prisma.cliente.create({
        data: {
          tenantId,
          razonSocial: dto.razonSocial,
          tipoDocumento: dto.tipoDocumento,
          numeroDocumento: doc.numero,
          condicionIva: dto.condicionIva,
          domicilio: dto.domicilio || null,
          email: dto.email || null,
          pais: dto.pais ?? 'AR',
          monedaPreferida: dto.monedaPreferida ?? 'ARS',
          diasVencimiento: dto.diasVencimiento ?? null,
        },
      }),
    );
  }

  async actualizar(tenantId: string, id: string, dto: ActualizarClienteDto) {
    const actual = await this.obtener(tenantId, id);
    const tipo = dto.tipoDocumento ?? actual.tipoDocumento;
    let numero: string | undefined;
    if (dto.tipoDocumento !== undefined || dto.numeroDocumento !== undefined) {
      const doc = normalizarDocumento(tipo, dto.numeroDocumento ?? actual.numeroDocumento);
      if (!doc.ok) throw new BadRequestException(doc.error);
      numero = doc.numero;
    }
    return this.guardar(() =>
      this.prisma.cliente.update({
        where: { tenantId_id: { tenantId, id } },
        data: {
          razonSocial: dto.razonSocial,
          tipoDocumento: dto.tipoDocumento,
          numeroDocumento: numero,
          condicionIva: dto.condicionIva,
          domicilio: dto.domicilio === undefined ? undefined : dto.domicilio || null,
          email: dto.email === undefined ? undefined : dto.email || null,
          pais: dto.pais,
          monedaPreferida: dto.monedaPreferida,
          diasVencimiento: dto.diasVencimiento,
          activo: dto.activo,
        },
      }),
    );
  }

  /** Consulta la constancia de inscripción en ARCA. Si no está disponible, lo informa sin romper. */
  async consultarPadron(tenantId: string, cuitCrudo: string) {
    const cuit = normalizarCuit(cuitCrudo);
    if (!esCuitValido(cuit)) throw new BadRequestException('El CUIT no es válido.');
    const cred = await this.credenciales.obtener(tenantId);
    try {
      const datos = await this.arca.consultarPadron(cred, cuit);
      if (!datos) throw new NotFoundException('ARCA no tiene datos para ese CUIT.');
      return {
        cuit: datos.cuit,
        razonSocial: datos.razonSocial,
        domicilio: datos.domicilio,
        condicionIva: datos.condicionIva,
        ambiente: cred.ambiente,
      };
    } catch (err) {
      if (err instanceof ArcaError) {
        throw new BadGatewayException({
          message: `No se pudo consultar el padrón de ARCA: ${err.message}`,
          detalle: err.detalle,
        });
      }
      throw err;
    }
  }

  private async guardar<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Ya existe un cliente con ese documento.');
      }
      throw err;
    }
  }
}
