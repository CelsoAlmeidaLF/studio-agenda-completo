// Adaptador de criptografia: Web Crypto API (nativa do navegador, sem bibliotecas externas).
//
// Esquema de chaves (envelope encryption):
//   PIN (6 dígitos) --PBKDF2-SHA256, 600.000 iterações, sal aleatório por profissional--> KEK
//   KEK (AES-GCM 256) embrulha a DEK.
//   DEK (AES-GCM 256, aleatória, única por estabelecimento) cifra todos os registros.
// O PIN nunca é salvo. PIN errado = falha de autenticação do AES-GCM ao desembrulhar a DEK.

const enc = new TextEncoder();
const dec = new TextDecoder();
export const PBKDF2_ITER = 600000;

export const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

export async function deriveKEK(pin, salt, iterations = PBKDF2_ITER) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

// A DEK precisa ser "extractable" só para poder ser embrulhada para outros profissionais.
// Ela vive apenas na memória da sessão e nunca é gravada em claro.
export const newDEK = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

export async function wrapDEK(dek, kek) {
  const iv = rand(12);
  const w = await crypto.subtle.wrapKey('raw', dek, kek, { name: 'AES-GCM', iv });
  return { iv, wrapped: new Uint8Array(w) };
}

export function unwrapDEK(wrapped, iv, kek) {
  return crypto.subtle.unwrapKey('raw', wrapped, kek, { name: 'AES-GCM', iv },
    { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// Cada registro é cifrado com IV aleatório e o id como dado autenticado (AAD):
// um registro não pode ser trocado de lugar com outro sem quebrar a verificação.
export async function seal(key, id, type, obj) {
  const iv = rand(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(id) }, key, enc.encode(JSON.stringify(obj)));
  return { id, type, iv, ct: new Uint8Array(ct) };
}

export async function open(key, rec) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv, additionalData: enc.encode(rec.id) }, key, rec.ct);
  return JSON.parse(dec.decode(pt));
}

// Base64 para exportar backup (em blocos para não estourar a pilha).
export function toB64(u8) {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b) {
  const s = atob(b);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

