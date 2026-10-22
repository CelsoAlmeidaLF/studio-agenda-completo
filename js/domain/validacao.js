// Validações de formato usadas pelos casos de uso (RT-20: a regra vale mesmo sem a tela).
export const isData = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s);
export const isMes = (s) => typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export const isHora = (s) => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const isCentavos = (n) => Number.isInteger(n) && n >= 0 && n <= 100000000000;
export const isPositivo = (n) => isCentavos(n) && n > 0;
export const isCelular = (d) => /^\d{10,13}$/.test(d);
