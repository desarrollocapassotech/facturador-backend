import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { hashPassword, normalizarEmail, validarPassword } from '../src/modules/auth/password';
import { leerArgs, requerido } from './args';

const USO = `  npm run crear-usuario -- --tenant capassotech --email persona@empresa.com [--nombre "Nombre"]

  La contraseña se toma de la variable de entorno NUEVA_PASSWORD (así no queda en el historial
  de la terminal). Si no está definida, se genera una aleatoria y se muestra una sola vez.
  Si el usuario ya existe en ese tenant, se le asigna la contraseña nueva y se cierran sus sesiones.`;

async function main() {
  const args = leerArgs();
  const slug = requerido(args, 'tenant', USO).toLowerCase();
  const email = normalizarEmail(requerido(args, 'email', USO));
  const nombre = args.nombre ?? null;

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('El email no es válido.');
  }

  const generada = !process.env.NUEVA_PASSWORD;
  const password = process.env.NUEVA_PASSWORD ?? randomBytes(12).toString('base64url');
  const errorPassword = validarPassword(password);
  if (errorPassword) throw new Error(errorPassword);

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug } });
    if (!tenant) throw new Error(`No existe el tenant "${slug}".`);

    const passwordHash = await hashPassword(password);
    const usuario = await prisma.usuario.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email } },
      create: { tenantId: tenant.id, email, nombre, passwordHash, creadoPor: 'script' },
      update: {
        passwordHash,
        activo: true,
        tokenVersion: { increment: 1 },
        ...(nombre ? { nombre } : {}),
      },
    });

    console.log(`Usuario listo: ${usuario.email} en ${tenant.nombreFantasia} (id=${usuario.id})`);
    if (generada) {
      console.log(`Contraseña generada (se muestra una sola vez): ${password}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message ?? err);
  process.exit(1);
});
