// Regra do PIN: 6 dígitos, sem sequências óbvias.
export function pinProblem(pin) {
  if (!/^\d{6}$/.test(pin)) return 'O PIN precisa ter exatamente 6 números.';
  if (/^(\d)\1{5}$/.test(pin)) return 'Não use o mesmo número repetido.';
  const asc = '0123456789012', desc = '9876543210987';
  if (asc.includes(pin) || desc.includes(pin)) return 'Não use sequências como 123456.';
  if (['121212', '112233', '102030', '010203', '123123', '696969'].includes(pin)) return 'Esse PIN é muito comum. Escolha outro.';
  return null;
}
