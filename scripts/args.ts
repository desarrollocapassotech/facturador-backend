/** Parser mínimo de `--clave valor` para los scripts de administración. */
export function leerArgs(argv = process.argv.slice(2)): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const actual = argv[i];
    if (!actual.startsWith('--')) continue;
    const clave = actual.slice(2);
    const siguiente = argv[i + 1];
    if (siguiente === undefined || siguiente.startsWith('--')) {
      args[clave] = 'true';
    } else {
      args[clave] = siguiente;
      i++;
    }
  }
  return args;
}

export function requerido(args: Record<string, string>, clave: string, uso: string): string {
  const valor = args[clave]?.trim();
  if (!valor) {
    console.error(`Falta --${clave}.\n\nUso:\n${uso}`);
    process.exit(1);
  }
  return valor;
}
