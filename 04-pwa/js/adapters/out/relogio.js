// Adaptadores de relógio e de geração de ids (RT-04): injetados na aplicação para permitir testes determinísticos.
export const relogioDoSistema = { agora: () => new Date() };
export const idsAleatorios = { novo: () => crypto.randomUUID() };
