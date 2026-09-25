const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** "30-71234567-8" → "30712345678". */
export function normalizarCuit(cuit: string): string {
  return cuit.replace(/[-\s.]/g, '');
}

/** CUIT/CUIL válido: 11 dígitos con dígito verificador correcto (módulo 11). */
export function esCuitValido(cuit: string): boolean {
  const d = normalizarCuit(cuit);
  if (!/^\d{11}$/.test(d)) return false;

  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(d[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto;
  return verificador !== 10 && verificador === Number(d[10]);
}
