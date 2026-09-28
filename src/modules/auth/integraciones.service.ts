import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { OrigenItem } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service';
import type { AuthContext } from './auth-context';
import { generarApiKey, hashesIguales, prefijoDeApiKey, sha256Hex, type Scope } from './claves';

const SELECT_PUBLICO = {
  id: true,
  nombre: true,
  origen: true,
  keyPrefijo: true,
  scopes: true,
  ultimoUsoEn: true,
  revocadaEn: true,
  createdAt: true,
} as const;

const CLAVE_INVALIDA = 'API key inválida o revocada.';
const UN_MINUTO = 60_000;

@Injectable()
export class IntegracionesService {
  constructor(private readonly prisma: PrismaService) {}

  listar(tenantId: string) {
    return this.prisma.integracion.findMany({ where: { tenantId }, select: SELECT_PUBLICO, orderBy: { createdAt: 'desc' } });
  }

  /** Crea la integración y devuelve la clave completa UNA sola vez (solo se guarda su hash). */
  async crear(auth: AuthContext, datos: { nombre: string; origen: OrigenItem; scopes: Scope[] }) {
    const { clave, prefijo, hash } = generarApiKey();
    const integracion = await this.prisma.integracion.create({
      data: {
        tenantId: auth.tenantId,
        nombre: datos.nombre.trim(),
        origen: datos.origen,
        scopes: [...new Set(datos.scopes)],
        keyPrefijo: prefijo,
        keyHash: hash,
        creadaPorId: auth.usuarioId ?? null,
      },
      select: SELECT_PUBLICO,
    });
    return { integracion, clave };
  }

  async revocar(tenantId: string, id: string) {
    const { count } = await this.prisma.integracion.updateMany({
      where: { tenantId, id, revocadaEn: null },
      data: { revocadaEn: new Date() },
    });
    if (!count) {
      const existe = await this.prisma.integracion.count({ where: { tenantId, id } });
      if (!existe) throw new NotFoundException('Integración no encontrada.');
    }
    return this.prisma.integracion.findUniqueOrThrow({ where: { tenantId_id: { tenantId, id } }, select: SELECT_PUBLICO });
  }

  /** Valida `X-Api-Key` y arma el AuthContext de la integración. */
  async validarApiKey(clave: string): Promise<AuthContext> {
    const prefijo = prefijoDeApiKey(clave);
    if (!prefijo) throw new UnauthorizedException(CLAVE_INVALIDA);
    const integracion = await this.prisma.integracion.findUnique({
      where: { keyPrefijo: prefijo },
      select: { id: true, tenantId: true, keyHash: true, scopes: true, revocadaEn: true, ultimoUsoEn: true, tenant: { select: { activo: true } } },
    });
    // Se compara el hash aunque no exista, para no revelar por tiempo qué prefijos son válidos.
    const coincide = hashesIguales(sha256Hex(clave), integracion?.keyHash ?? sha256Hex(`${prefijo}-inexistente`));
    if (!integracion || !coincide || integracion.revocadaEn || !integracion.tenant.activo) {
      throw new UnauthorizedException(CLAVE_INVALIDA);
    }
    if (!integracion.ultimoUsoEn || Date.now() - integracion.ultimoUsoEn.getTime() > UN_MINUTO) {
      await this.prisma.integracion.update({ where: { id: integracion.id }, data: { ultimoUsoEn: new Date() } });
    }
    return { tenantId: integracion.tenantId, tipo: 'integracion', integracionId: integracion.id, scopes: integracion.scopes };
  }
}
