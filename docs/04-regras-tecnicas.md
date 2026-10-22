# Studio Agenda — Regras Técnicas

> Versão 0.1 · 22/10/2026 · Segue o processo de desenvolvimento: **1)** PoC em HTML + PWA → **2)** escolha da tecnologia final (Capacitor, Kotlin ou MAUI) → **3)** homologação → **4)** produção → **5)** Play Store.

## 1. Arquitetura

- **RT-01 · Hexagonal (Ports & Adapters).** O núcleo de domínio não importa nada de UI, banco, rede ou framework.

  ```
  src/
    domain/            entidades, value objects, regras (RN-xx) — JS puro
      agenda/          Agendamento, Bloqueio, HorarioFuncionamento, ConflitoPolicy
      comanda/         Comanda, ItemComanda, Fechamento, Pagamento
      financeiro/      Caixa, Lancamento, ContaCorrente
      equipe/          Profissional, Comissao, Permissao
      cliente/         Cliente
    application/       casos de uso (AgendarItem, FecharComanda, ...)
      ports/           interfaces: Repositorios, Notificador, Relogio, GeradorId
    adapters/
      in/ui/           telas (HTML/JS no PoC)
      out/persistence/ LocalStorageRepo (PoC), IndexedDbRepo, FirestoreRepo
      out/notify/      WhatsAppLinkNotifier, SmsNotifier (futuro)
  ```

  > **Na PoC (v1.1.0)** a mesma separação está em `04-pwa/js/`: `domain/` (agenda, financeiro, permissões), `application/` (`ports.js`, `app.js`, `casos/`), `adapters/out/` (webcrypto, indexeddb, cofre-cifrado, relógio) e `adapters/in/ui/` (telas). A raiz de composição é `main.js`, que injeta os adaptadores em `createApp()`. As regras de dependência entre camadas são conferidas por script.

- **RT-02 · Casos de uso explícitos.** Cada ação de negócio é um caso de uso com entrada e saída tipadas, por exemplo `AgendarItem`, `AlterarStatusItem`, `FecharComanda`, `RegistrarPagamento`, `AnularFechamento`, `LancarCaixa`, `PagarRecibo` e `AtualizarPermissoes`. A UI só chama casos de uso; nunca grava no repositório diretamente.
- **RT-03 · Permissão como política de domínio.** `PermissaoPolicy.pode(profissional, acao, recurso)` é chamada dentro de cada caso de uso, e repetida nas regras do banco (RNF-16).
- **RT-04 · Relógio e IDs injetáveis.** `Relogio.agora()` e `GeradorId.novo()` são portas, para testes determinísticos (fuso America/Sao_Paulo).

## 2. Modelo de dados

- **RT-05 · Multiestabelecimento.** Toda coleção fica sob `estabelecimentos/{estId}/...`. Nenhum documento existe fora de um estabelecimento.
- **RT-06 · Entidades principais:**

  | Entidade | Campos-chave |
  |---|---|
  | Estabelecimento | id, nome, servicoPrincipal, cnpj?, endereco, contatos, horario[diaSemana][{ini,fim}], usaFechamentoCaixa, plano |
  | Profissional | id, nome, sigla, cor, area, comissaoPct, ativo, permissoes{}, favoritoDe[] |
  | Cliente | id, nome, celular (único), email?, obs, ativo, criadoEm |
  | Servico | id, nome, categoria, duracaoMin, precoCentavos, comissaoPct?, profissionais[], ativo |
  | Produto | id, codigo (seq.), nome, categoria, ativo, consumo{unidade, precoInterno, precoProf}, venda{ativo, preco}, comissoes{profissionalId: pct}, criadoEm/Por, alteradoEm/Por |
  | Comanda | id, clienteId \| avulsoNome, data, status (aberta/fechada/anulada), fechamentoId? |
  | ItemComanda | id, comandaId, tipo (servico/produto), refId (srvId ou prodId), qtd, precoUnit, profissionalId, inicio, fimCalc, precoCentavos, descontoCentavos, status, notaInterna, notificado |
  | Fechamento | id, numero (seq.), comandaId, dataFechamento, totalCentavos, gorjetas[], pagamentos[], criadoPor, anuladoPor? |
  | Lancamento | id, conta (caixa \| cliente:{id} \| profissional:{id}), tipo, valorCentavos (+/−), origem (fechamentoId…), data, autor |
  | Bloqueio | id, profissionalId, inicio, fim, motivo |
  | Auditoria | id, acao, entidade, antes, depois, autor, em |

- **RT-07 · Dinheiro em centavos inteiros** (RNF-23). Formatação só na borda, com `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})`.
- **RT-08 · Datas.** Persistir em ISO 8601 com fuso. A "data de negócio" (dia do caixa, dia da agenda) é `yyyy-mm-dd` calculada em America/Sao_Paulo.
- **RT-09 · Saldo é derivado.** O saldo de uma conta corrente é a soma dos lançamentos. Se houver cache de saldo, ele é recalculável e nunca a fonte da verdade.
- **RT-10 · Nada é apagado no financeiro.** Anulação gera lançamentos de estorno com a mesma origem (RN-24, RN-36).
- **RT-11 · Numeração de fechamento** por contador transacional por estabelecimento (sem lacunas em condições normais).

## 3. Persistência e sincronização

- **RT-12 · PoC:** `localStorage` atrás de um `Repositorio` (já é o caso no MVP). Trocar por IndexedDB quando passar de ~5 MB.
- **RT-13 · Produção:** Firestore com cache offline (mesmo padrão do app Despesas da Casa), ou API própria. A escolha fica isolada no adapter `out/persistence`.
- **RT-14 · Escrita atômica:** `FecharComanda` + `RegistrarPagamento` + lançamentos de caixa/comissão em uma única transação ou batch (RNF-24).
- **RT-15 · Concorrência otimista:** cada documento editável tem `versao`; uma atualização com versão desatualizada é recusada (RNF-13).
- **RT-16 · Regras de segurança do banco** espelham as permissões. Exemplo: só grava em `lancamentos` com `conta == caixa` quem tem "Caixa: criação e edição".

## 4. Frontend (PoC)

- **RT-17 · HTML + CSS + JS sem framework obrigatório**, em módulos ES. PWA com `manifest.json` e service worker (cache-first para o shell, network-first para dados).
- **RT-18 · Design system:** tokens CSS (cores, tipografia, espaçamento) em um único arquivo. O visual segue o padrão aprovado no protótipo de telas (cabeçalho cinza, cartões brancos, uma cor de destaque). Desde 22/10/2026 esse visual é o template **Studio Claro** (`FINANC/.designers/templates/studio-claro`), com SCSS, vitrine, guia e `starter/` para projetos novos.
- **RT-19 · Grade da agenda:** posicionamento absoluto por `(inicio − abertura) / intervalo × alturaLinha`. Só a área da grade rola na horizontal, com a coluna de horas e o cabeçalho fixos.
- **RT-20 · Validação dupla:** a UI valida para dar resposta rápida e o caso de uso valida de novo (fonte da verdade).
- **RT-21 · Sem `alert/confirm/prompt`:** confirmações destrutivas usam o padrão "toque de novo para confirmar" ou um modal próprio.

## 5. Integrações

- **RT-22 · WhatsApp (MVP):** link `https://wa.me/55DDDNUMERO?text=` com a mensagem codificada; o telefone é normalizado para E.164. Não é envio automático.
- **RT-23 · SMS/e-mail (futuro):** atrás da porta `Notificador`, com fila e reenvio; registrar custo por mensagem (RN-50).
- **RT-24 · Pix:** no PoC, só registro manual. Na produção, cobrança via PSP com webhook de confirmação. QR estático/dinâmico conforme o PSP escolhido.
- **RT-25 · Maquininha/cartão:** apenas registra forma, valor, bandeira e NSU/ID (RNF-22).

## 6. Qualidade e entrega

- **RT-26 · Testes:** unitários no `domain` e no `application` (sem DOM); testes de contrato para cada adapter de repositório; E2E dos fluxos CA-01 a CA-05 (ver Requisitos Funcionais).
- **RT-27 · Ambientes:** desenvolvimento (localhost/SHTTPS), homologação (projeto Firebase separado) e produção.
- **RT-28 · Versionamento:** SemVer no app (`v0.x` até a homologação). Migrações de esquema versionadas no adapter de persistência.
- **RT-29 · Observabilidade:** registrar erros não tratados e falhas de sincronização com o ID do estabelecimento, sem dados pessoais no log.
- **RT-30 · Escolha da tecnologia final (etapa 2):**

  | Opção | Quando escolher |
  |---|---|
  | Capacitor | Reaproveitar 100% do PWA. Caminho mais curto para a Play Store. |
  | Kotlin nativo | Se precisar de integração profunda com Android (maquininha via SDK, notificações locais avançadas). |
  | .NET MAUI | Se o backend for .NET 9 e houver interesse em Windows desktop para a recepção. |
