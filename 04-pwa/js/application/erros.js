// Erros da aplicação que a interface trata de forma especial.
export class Denied extends Error {}
export class NeedCaixa extends Error { constructor(data) { super('O caixa deste dia ainda não foi aberto.'); this.data = data; } }
export class HorarioPassado extends Error { constructor() { super('Este horário já passou. Registrar mesmo assim?'); } } // R5: exige confirmarPassado: true
