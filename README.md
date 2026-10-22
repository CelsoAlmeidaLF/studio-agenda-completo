# Studio Agenda — PWA (v1.5.1)

Sistema de agenda, comandas, caixa e comissões para salões e estúdios.
HTML + CSS + JavaScript puro (módulos ES), sem framework e sem dependências externas.
Funciona offline e guarda os dados **criptografados** no banco do navegador (IndexedDB).

## No ar

**https://celsoalmeidalf.github.io/studio-agenda-completo/** (GitHub Pages, branch `gh-pages` = conteúdo desta pasta).

O endereço `celsoalmeidalf.github.io` é dividido com outros apps (FINANC, BarGestão e a versão antiga `studio-agenda`). Por isso o service worker só apaga caches com o prefixo `studio-agenda-completo-`.

## Como rodar

O app precisa de **HTTPS ou localhost**, porque a criptografia do navegador (Web Crypto) e o service worker só funcionam em contexto seguro.

```bash
# na pasta do projeto
python3 -m http.server 8080
# abra http://localhost:8080
```

No celular, sirva a pasta pelo SHTTPS (ou outro servidor HTTPS) e use **Adicionar à tela inicial** para instalar como app.

### Primeiro acesso
1. Informe o nome do estabelecimento, o seu nome e crie um **PIN de 6 números**.
2. Se quiser, marque **Incluir equipe, serviços e clientes de exemplo**.
3. Entre com o PIN. Para dar acesso a outro profissional, vá em **Gestão › Lista de profissionais**, abra o profissional e crie o PIN dele.

## Estrutura (arquitetura hexagonal)

```
index.html                 shell + Content-Security-Policy
manifest.webmanifest       instalação PWA
sw.js                      cache offline dos arquivos do app (nunca dos dados)
css/app.css                design system (tokens + componentes)
js/
  main.js                  raiz de composição: cria os adaptadores, monta a aplicação e entrega às telas
  shared/                  núcleo compartilhado, puro: dinheiro em centavos, datas, texto
  domain/                  regras de negócio puras (sem DOM, sem banco)
    agenda.js              status, horário de funcionamento, conflitos
    financeiro.js          formas de pagamento, totais, comissão
    permissoes.js          catálogo, perfis, política can(), regra contra escalada
    equipe.js · pin.js · validacao.js
  application/             casos de uso (a interface só fala com esta camada)
    ports.js               contrato das portas: Cofre, Biometria (opcional), Relogio, GeradorId
    app.js                 createApp(portas): junta consultas e casos de uso num objeto congelado
    contexto.js · erros.js
    casos/                 consultas, sessao, gestao, agenda, financeiro (+ dados internos)
  adapters/
    out/                   webcrypto, indexeddb, cofre-cifrado (sessão + repositório cifrado), biometria-webauthn, relogio
    in/ui/                 dom (DOM seguro + ícones SVG), kit (roteador e componentes), telas/
```

Regras das camadas (conferidas por script): `domain` só importa `shared`; `application` importa `domain` e `shared`; `adapters/out` não conhece a aplicação; `adapters/in` não importa `adapters/out`. Só o `main.js` liga tudo.

A aplicação recebe os adaptadores por injeção e não é exportada por nenhum módulo. Assim, a sessão aberta (com a chave dos dados) não fica ao alcance de um `import()` feito pelo console.

## Visual (template Studio Claro)

O visual deste app é o template **`studio-claro`** em `FINANC/.designers/templates/studio-claro/`, mantido como padrão pelo Celso em 22/10/2026. Lá ficam a fonte em SCSS, a vitrine com todos os componentes, o guia de uso (README) e um `starter/` para projetos novos.
Na v1.3.0, o visual recebeu o acabamento do Studio Claro 1.1: cantos e sombras suaves, transições e foco rosa, com a mesma fonte e as mesmas cores. O `css/app.css` daqui é a origem conferida pelo `npm run check` (em `.designers`). Para mudar o visual: edite o SCSS do template, rode `npm run build` e `npm run check`, copie o dist para `css/app.css` e troque a versão do cache no `sw.js`.

## Testes

Rodar a partir da pasta `studio-agenda-completo`:

```bash
node --test 05-testes/unit/          # 25 testes de domínio, aplicação, cofre, dinheiro e biometria (Node 20+, sem navegador)
python3 05-testes/e2e_cdp.py         # ponta a ponta no Chrome headless via CDP, com a CSP ativa
```

## Telas e aparelhos

Funciona em celular, tablet, notebook e telas grandes. Medido no Chrome em 390, 844×390 (deitado), 768, 1024, 1366, 1920 e 2560 px, sem rolagem horizontal em nenhum.

| Aparelho | Como fica |
|---|---|
| Celular em pé | uma coluna, menu em gaveta, barras de ação fixas embaixo |
| Celular deitado | topo e controles compactos; agenda com linhas mais baixas (cabem umas 3 horas); PIN com o teclado ao lado |
| Tablet em pé (768) | menu fixo de 236 px |
| Tablet deitado (1024) | menu fixo de 272 px |
| Notebook e telas grandes (≥ 1200) | clientes e equipe com lista ao lado da ficha; comanda, fechamento, caixa, relatórios e gestão em duas colunas; comandas em grade; conteúdo de até 1240 px (1480 px a partir de 1700 px) |

As regras ficam no template Studio Claro 1.3 (parte `12-telas-e-orientacao`).

## Funcionalidades

| Área | O que faz |
|---|---|
| Entrada | Configuração inicial, escolha do profissional, teclado de PIN, **entrada com biometria** (digital ou rosto, WebAuthn PRF), bloqueio após erros, "Esqueci o PIN" (restaurar backup ou apagar) |
| Agenda | Grade por profissional, horários fechados hachurados, linha da hora atual, bloqueios (almoço/ausência), lista de comandas do dia |
| Agendar / Vender | Busca por nome ou celular, novo cliente, cliente avulso, favoritos, filtro de serviços do profissional, validação de conflito e de horário de funcionamento |
| Comanda | Itens do cliente no dia, status (Marcado, Confirmado, Em espera, Iniciado, Atrasado, Cancelado), notas internas, WhatsApp e ligação |
| Fechamento | Preço (com permissão), desconto por item, gorjeta, data de fechamento, numeração sequencial |
| Pagamento | Pix, dinheiro, débito, crédito e crédito do cliente, divisão entre formas, pagamento parcial ou "continuar sem pagamento" (o que falta vira débito do cliente) |
| Clientes | Lista, ficha com visão geral, conta corrente, agendamentos e fechamentos |
| Equipe | Saldo por profissional, conta corrente (comissões, gorjetas, recibos, adiantamentos), comissões pendentes |
| Financeiro | Caixa do dia com valor inicial, entradas/saídas, categorias e dinheiro na gaveta; relatórios do mês e evolução de 6 meses |
| Gestão | Estabelecimento, horário com vários intervalos, intervalo da agenda, fechamento de caixa, serviços, profissionais, PIN, permissões |
| Segurança | Meu PIN e biometria, bloqueio automático, armazenamento persistente, backup criptografado, restauração, auditoria, apagar dados |

## Testado (v1.5.0)

- **Unitários (`05-testes/unit/`):**
  - a aplicação não expõe o cofre;
  - escalada de privilégio bloqueada;
  - troca do próprio PIN só com o PIN atual;
  - último gestor protegido;
  - inativar apaga o PIN;
  - campos fixos do estabelecimento;
  - edição de cliente com permissão;
  - visibilidade da comanda;
  - validações nos casos de uso;
  - tipo de registro autenticado;
  - uma tentativa de PIN por vez e bloqueio;
  - backup só com PIN e sem registros adulterados;
  - troca da chave dos dados;
  - "1.500" lido como R$ 1.500,00;
  - pagamento parcial com o resto pendente;
  - item cancelado não volta a ativo em comanda fechada;
  - estorno só com o caixa do dia aberto;
  - biometria: ativar com PIN, entrar sem PIN, segredo errado, cancelamento, troca de PIN, PIN do gestor, desativação, backup e troca da chave.
- **E2E (`05-testes/e2e_cdp.py`, celular de 390 px):**
  - configuração inicial com PIN fraco recusado;
  - PIN errado;
  - agenda;
  - favorito e comanda;
  - item incluído depois de abrir o fechamento entra no total;
  - pagamento parcial com o resto pendente e abertura do caixa;
  - entrada de "1.500" no caixa e dinheiro na gaveta;
  - nenhum caractere usado como ícone;
  - console sem acesso à sessão;
  - tela de segurança;
  - biometria com o autenticador virtual do Chrome (WebAuthn PRF): ativar e entrar sem PIN;
  - layout: menu fixo no tablet em pé; no notebook, lista ao lado da ficha de cliente e relatórios em duas colunas;
  - segunda aba travada;
  - nenhuma tela com rolagem horizontal.

Detalhes de segurança em `SEGURANCA.md`.
