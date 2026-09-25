import { CondicionIva, PrismaClient } from '@prisma/client';
import { esCuitValido, normalizarCuit } from '../src/shared/util/cuit';
import { leerArgs, requerido } from './args';

const USO = `  npm run crear-tenant -- --slug capassotech --nombre "CapassoTech" \\
    --razon-social "Capasso Tech SAS" --cuit 30-12345678-9 \\
    --condicion-iva RESPONSABLE_INSCRIPTO --domicilio "Calle 123, CABA" \\
    [--iibb 901-123456-7] [--inicio-actividades 2020-03-01]

  Condiciones IVA: ${Object.keys(CondicionIva).join(', ')}`;

async function main() {
  const args = leerArgs();
  const slug = requerido(args, 'slug', USO).toLowerCase();
  const nombre = requerido(args, 'nombre', USO);
  const razonSocial = requerido(args, 'razon-social', USO);
  const cuit = normalizarCuit(requerido(args, 'cuit', USO));
  const condicionIva = requerido(args, 'condicion-iva', USO).toUpperCase();
  const domicilio = requerido(args, 'domicilio', USO);

  if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
    throw new Error('El slug solo admite minúsculas, números y guiones (2 a 60 caracteres).');
  }
  if (!esCuitValido(cuit)) {
    throw new Error(`El CUIT ${cuit} no es válido (revisá el dígito verificador).`);
  }
  if (!(condicionIva in CondicionIva)) {
    throw new Error(`Condición IVA inválida. Opciones: ${Object.keys(CondicionIva).join(', ')}`);
  }
  const inicio = args['inicio-actividades'];
  if (inicio && !/^\d{4}-\d{2}-\d{2}$/.test(inicio)) {
    throw new Error('--inicio-actividades debe tener formato YYYY-MM-DD.');
  }

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.create({
      data: {
        slug,
        nombreFantasia: nombre,
        razonSocial,
        cuit,
        condicionIva: condicionIva as CondicionIva,
        domicilioFiscal: domicilio,
        ingresosBrutos: args.iibb ?? null,
        inicioActividades: inicio ? new Date(`${inicio}T00:00:00Z`) : null,
      },
    });
    console.log(`Tenant creado: ${tenant.nombreFantasia} (slug=${tenant.slug}, id=${tenant.id}, ambiente ARCA=${tenant.ambienteArca})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const e = err as { code?: string; message?: string };
  console.error(e.code === 'P2002' ? 'Ya existe un tenant con ese slug o CUIT.' : e.message ?? err);
  process.exit(1);
});
