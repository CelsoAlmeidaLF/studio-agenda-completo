// Validações de formato usadas pelos casos de uso (RT-20: a regra vale mesmo sem a tela).
export const isData = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);
export const isMes = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isHora = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const isCentavos = (n) => Number.isInteger(n) && n >= 0 && n <= 100000000000;
export const isPositivo = (n) => isCentavos(n) && n > 0;
export const isCelular = (d) => /^\d{10,13}$/.test(d);
// E-mail: formato simples (algo@dominio.ext, sem espaços). A confirmação real é do próprio e-mail, não do app.
export const isEmail = (s) => typeof s === 'string' && s.length <= 120 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
// Celular brasileiro só com dígitos: tira o DDI 55 quando sobram 10 ou 11 dígitos (DDD + número).
// "5511988887777" e "11988887777" são o mesmo aparelho (RN-13). Números de 10-11 dígitos não são mexidos
// (55 pode ser DDD do Rio Grande do Sul).
export function normalizaCelular(digitos) {
  const d = String(digitos || '').replace(/\D/g, '');
  return (d.length === 12 || d.length === 13) && d.startsWith('55') ? d.slice(2) : d;
}
