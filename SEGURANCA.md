# Studio Agenda — Segurança (v1.1.0)

## 1. Criptografia dos dados (em repouso)

| Item | Como é feito |
|---|---|
| Algoritmo dos dados | AES-256-GCM (Web Crypto API nativa do navegador). |
| Chave dos dados (DEK) | Aleatória, gerada na configuração, única por estabelecimento. Nunca é gravada em claro. |
| Chave do PIN (KEK) | Derivada do PIN com PBKDF2-SHA256, **600.000 iterações** e sal aleatório de 16 bytes por profissional. |
| Envelope | Cada profissional tem a sua cópia da DEK embrulhada com a própria KEK (store `keys`). |
| Verificação do PIN | Não existe hash de PIN salvo. PIN errado = falha de autenticação do AES-GCM ao abrir a DEK. |
| Registro | Cada registro é cifrado com IV aleatório de 12 bytes e o `id` (`tipo:uuid`) como dado autenticado (AAD). Trocar ou adulterar um registro é detectado ao decifrar e aparece em **Segurança › Registros com falha de integridade**. O tipo do registro é lido do `id` autenticado, nunca do campo em claro. |
| O que fica legível no banco | Só o tipo do registro (ex.: `cli`), o id aleatório e, em `keys`, nome, sigla e cor do profissional para a tela de entrada. Nomes de clientes, telefones, valores e agenda ficam cifrados. |

## 2. PIN e sessão

- **PIN:** 6 números. São recusados números repetidos (111111), sequências (123456, 654321) e PINs muito comuns.
- **Bloqueio por tentativas:** depois de 5 erros, o acesso fica bloqueado por 30 s. O tempo dobra a cada novo erro, até 1 h. Durante o bloqueio, nem o PIN certo entra.
- **Bloqueio automático:** depois de 1 a 15 minutos sem uso (padrão: 5), configurável em Segurança. Bloquear apaga a chave e os dados da memória e recarrega a página.
- **Botão "Bloquear agora":** fica no menu.
- **Uma tentativa por vez:** o cofre não aceita duas verificações de PIN ao mesmo tempo, então o contador não é contornado com tentativas em paralelo.
- **Troca de PIN:** exige o PIN atual, e essa conferência conta tentativas como a entrada. Um gestor pode redefinir o PIN de outro profissional ou remover o acesso dele (ver §3).
- **Inativar um profissional apaga o acesso por PIN dele.** Para voltar, o gestor cria um PIN novo.
- **Troca da chave dos dados** (Segurança › Trocar a chave dos dados): depois de desligar alguém, recifra todos os registros com uma chave nova. Só quem fez a troca continua com acesso; os outros PINs são recriados pelo gestor. Cópias antigas do banco e backups antigos não abrem os dados novos.
- **Esqueci o PIN:** não há recuperação (o PIN é a chave). Os caminhos são três: outro gestor redefine; restaurar um backup; ou apagar tudo e começar do zero (é preciso digitar "APAGAR").

## 3. Autorização (permissões)

- As permissões são por profissional, com níveis por área: agenda, clientes, contas, caixa, relatórios, gestão e segurança.
- **A checagem fica nos casos de uso (`js/application/`)**, não só na tela. As consultas também filtram o que cada um vê: quem só vê os próprios atendimentos não abre a comanda de um colega nem vê os agendamentos dele na ficha do cliente.
- **A sessão não fica ao alcance do console.** A aplicação é montada por injeção de dependências em `main.js` e nenhum módulo exporta a instância com a chave. Importar os arquivos pelo console devolve só fábricas, e uma fábrica nova nasce bloqueada. (Testado no e2e.)
- **Sem escalada de privilégio:** quem gere a equipe mas não gere permissões não pode redefinir o PIN, remover o acesso nem editar o cadastro de alguém com mais acesso do que ele. Não é possível remover o acesso nem inativar o último gestor de permissões.
- **Campos fixos:** a tela do estabelecimento só grava os campos dela. A numeração dos fechamentos e o tempo de bloqueio automático (esse com permissão de segurança) não mudam por ali.
- **Validação nos casos de uso** (RT-20): PIN, datas, horas, formas de pagamento, tipos de lançamento, gorjeta, valores em centavos e celular são conferidos mesmo sem a tela.
- Sem a permissão de contatos, o profissional não vê telefone, e-mail nem os botões de WhatsApp e ligação.
- O sistema impede remover o último gestor de permissões e impede que alguém inative a si mesmo.

## 4. Proteções do navegador

- **Content-Security-Policy** (no `index.html`): `default-src 'self'`, sem scripts inline, sem `eval`, sem conexões externas (`connect-src 'self'`), `object-src 'none'`, `base-uri 'none'` e `form-action 'none'`.
- **Sem `innerHTML`:** toda a interface é montada com `textContent` e atributos (`util.h`). Nenhum dado digitado vira HTML, o que impede XSS.
- **Sem dependências externas:** nenhuma biblioteca de terceiros, nenhuma fonte ou CDN, então não há risco de cadeia de suprimentos.
- **`referrer: no-referrer`.** Links de WhatsApp abrem com `rel="noopener noreferrer"`.
- **Contexto seguro obrigatório:** fora de HTTPS ou localhost o app não abre.
- **Service worker:** guarda em cache apenas os arquivos do app. Os dados nunca passam por ele.
- **Uma aba por vez:** a trava do navegador (`navigator.locks`) impede duas abas abertas ao mesmo tempo, que poderiam gravar uma por cima da outra (ex.: números de fechamento repetidos).

## 5. Integridade financeira

- Dinheiro é guardado em **centavos inteiros**; não há ponto flutuante em valores.
- **Fechamento atômico:** fechamento, pagamentos, caixa, comissões, gorjeta, numeração e auditoria são gravados em uma única transação do IndexedDB. Ou grava tudo, ou nada.
- Nada é apagado no financeiro: anular um fechamento gera lançamentos de **estorno**.
- **Auditoria** de todas as ações relevantes, com autor e data/hora: login de configuração, agendamentos, status, fechamentos, anulações, lançamentos, preços, permissões, PINs e backup.

## 6. Backup

- O arquivo exportado continua **cifrado**: são os mesmos registros AES-GCM e as chaves embrulhadas.
- Para restaurar, é preciso informar o PIN de um profissional que existia na data do backup. Sem esse PIN, nada é alterado.
- Antes de substituir, todos os registros do backup são verificados. Se algum estiver adulterado ou corrompido, a restauração é recusada.
- A substituição acontece numa única transação: se falhar no meio, os dados atuais continuam como estavam.
- Guarde o backup fora do aparelho. Restaurar **substitui** os dados atuais.

## 7. Configuração recomendada no servidor (produção)

Algumas proteções só funcionam como cabeçalho HTTP, não como `<meta>`:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin
```

## 8. Limites conhecidos (seja transparente com o cliente)

1. **PIN de 6 números é curto.** Se alguém copiar o banco do aparelho, pode tentar todos os PINs fora do app. Os 600 mil ciclos do PBKDF2 tornam isso lento, mas não impossível. Proteja o aparelho com senha ou biometria. Para mais segurança, a evolução natural é PIN + chave guardada em hardware (WebAuthn/Passkey) ou o app nativo com Android Keystore.
2. **O contador de tentativas fica no próprio aparelho.** Ele protege contra quem usa o app, não contra quem manipula o banco diretamente (ver item 1).
3. **Quem tem um PIN tem a chave dos dados.** As permissões valem para o uso pelo app e não podem ser contornadas importando os módulos pelo console. Mas uma pessoa com PIN e conhecimento técnico pode reescrever a decifragem fora do app e ler tudo. Por isso: dê PIN só para quem precisa e, ao desligar alguém, use **Trocar a chave dos dados**.
4. **Dados só neste aparelho.** Não há sincronização entre aparelhos nesta versão. Faça backups regulares. A sincronização em nuvem (Firestore) está prevista nas Regras Técnicas (RT-13).
5. **O navegador pode limpar os dados** se faltar espaço e o armazenamento não estiver como persistente. Instale o app na tela inicial e confirme o status em **Segurança › Armazenamento persistente**.
6. **Memória:** o JavaScript não permite zerar memória de verdade. Por isso, o bloqueio recarrega a página para descartar os dados.
