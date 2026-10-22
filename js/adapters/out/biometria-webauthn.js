// Adaptador de biometria: WebAuthn com a extensão PRF (porta Biometria em application/ports.js).
// Mesma base do kit de segurança do FINANC (PACOTES/stk-pkt-security/stk-pkg-secure-vault.js).
// Sem servidor: a segurança vem do segredo PRF, que o autenticador do aparelho só entrega depois
// de verificar a pessoa (digital, rosto ou bloqueio de tela). Sem PRF, a biometria não é oferecida.
import { rand, toB64, fromB64 } from './webcrypto.js';

const b64url = (s) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export function createBiometriaWebAuthn({ nomeApp = 'Studio Agenda' } = {}) {
  async function disponivel() {
    if (typeof window === 'undefined' || !window.PublicKeyCredential || !window.isSecureContext || !navigator.credentials) return false;
    // WebAuthn exige nome de domínio (HTTPS ou localhost); endereços IP são recusados pelo navegador.
    if (/^[\d.]+$|^\[|:/.test(location.hostname)) return false;
    try {
      if (PublicKeyCredential.getClientCapabilities) {
        const caps = await PublicKeyCredential.getClientCapabilities();
        if (caps['extension:prf'] === false) return false;
      }
      return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
    } catch { return false; }
  }

  async function liberar(credentialId, prfSalt) {
    const assertion = await navigator.credentials.get({ publicKey: {
      challenge: rand(32), timeout: 60000, userVerification: 'required',
      allowCredentials: [{ type: 'public-key', id: fromB64(credentialId), transports: ['internal', 'hybrid'] }],
      extensions: { prf: { eval: { first: fromB64(prfSalt) } } },
    } });
    const prf = assertion.getClientExtensionResults().prf;
    if (!prf?.results?.first) throw new Error('A biometria não liberou a chave neste navegador. Use o PIN.');
    return new Uint8Array(prf.results.first);
  }

  // Cadastra uma passkey do aparelho para o profissional e devolve o primeiro segredo PRF.
  async function cadastrar(prof) {
    const prfSalt = rand(32);
    const credential = await navigator.credentials.create({ publicKey: {
      rp: { name: nomeApp }, challenge: rand(32),
      user: { id: rand(16), name: `${prof.nome} · ${nomeApp}`, displayName: prof.nome },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      // Android: o Chrome só entrega PRF para passkeys (credenciais residentes) do Gerenciador de Senhas do Google.
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'required', requireResidentKey: true },
      timeout: 60000, extensions: { prf: { eval: { first: prfSalt } } },
    } });
    const prf = credential.getClientExtensionResults().prf;
    if (!prf || prf.enabled === false) throw new Error('Este aparelho não oferece biometria com criptografia. Continue usando o PIN.');
    const credentialId = toB64(new Uint8Array(credential.rawId));
    // Alguns navegadores só devolvem o segredo PRF numa autenticação, não no cadastro.
    const secret = prf.results?.first ? new Uint8Array(prf.results.first) : await liberar(credentialId, toB64(prfSalt));
    return { credentialId, prfSalt: toB64(prfSalt), secret };
  }

  // Pede ao navegador para esquecer a passkey que não serve mais (Chrome 132+); ignorado onde não existe.
  function esquecer(credentialId) {
    try { PublicKeyCredential.signalUnknownCredential({ rpId: location.hostname, credentialId: b64url(credentialId) }).catch(() => {}); } catch { /* sem suporte */ }
  }

  return Object.freeze({ disponivel, cadastrar, liberar, esquecer });
}

