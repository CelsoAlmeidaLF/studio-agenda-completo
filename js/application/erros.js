// Erros da aplicação que a interface trata de forma especial.
export class Denied extends Error {}
export class NeedCaixa extends Error { constructor(data) { super('O caixa deste dia ainda não foi aberto.'); this.data = data; } }
