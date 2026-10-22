// Portas (interfaces) que a aplicação espera dos adaptadores de saída (RT-01, RT-04).
// JavaScript não tem interface: o contrato fica documentado aqui e é cumprido por adapters/out/*.
//
// @typedef {object} Cofre  — implementado por adapters/out/cofre-cifrado.js
//   Sessão:       isSetup(), vaultInfo(), listLogins(), setup(estNome, admin, pin, registros),
//                 login(profId, pin) -> prof, lock(), isUnlocked(), userId(), integrity(), lockRemaining(entrada)
//   Repositório:  all(tipo) -> objeto[], get(tipo, id) -> objeto|null (somente leitura),
//                 commit(ops) grava tudo ou nada. ops: {put: tipo, obj} | {del: tipo, id} |
//                 {putKey: prof, pin} | {delKey: profId} | {keyLabel: prof}
//   Chaves:       hasLogin(profId), verifyPin(pin) (PIN de quem está na sessão), rotateDEK(pin) -> nº de acessos removidos
//   Backup:       exportBackup() -> texto, importBackup(texto, pin), wipe()
//   Biometria:    bioInfo(profId) -> {credentialId, prfSalt}|null, loginBio(profId, segredo) -> prof,
//                 enableBio(pin, {credentialId, prfSalt, secret}) -> id anterior|null, disableBio() -> id anterior|null
//
// @typedef {object} Biometria — opcional, implementado por adapters/out/biometria-webauthn.js
//   disponivel() -> boolean, cadastrar(prof) -> {credentialId, prfSalt, secret}, liberar(credentialId, prfSalt) -> segredo,
//   esquecer(credentialId). O segredo (32 bytes do PRF) só sai depois que o aparelho confere a pessoa.
//
// @typedef {object} Relogio — { agora(): Date }            (adapters/out/relogio.js)
// @typedef {object} GeradorId — { novo(): string }          (adapters/out/relogio.js)
export const PORTAS = Object.freeze(['cofre', 'relogio', 'ids']);
// Sem o adaptador de biometria, a aplicação funciona só com PIN.
export const SEM_BIOMETRIA = Object.freeze({ disponivel: async () => false, cadastrar: async () => { throw new Error('Biometria indisponível.'); }, liberar: async () => { throw new Error('Biometria indisponível.'); }, esquecer: () => {} });
