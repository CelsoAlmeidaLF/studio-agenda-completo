# Studio Agenda — PWA (v1.2.0)

Sistema de agenda, comandas, caixa e comissões para salões e estúdios.
HTML + CSS + JavaScript puro (módulos ES), sem framework e sem dependências externas.
Funciona offline e guarda os dados **criptografados** no banco do navegador (IndexedDB).

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
    ports.js               contrato das portas: Cofre, Relogio, GeradorId
    app.js                 createApp(portas): junta consultas e casos de uso num objeto congelado
    contexto.js · erros.js
    casos/                 consultas, sessao, gestao, agenda, financeiro (+ dados internos)
  adapters/
    out/                   webcrypto, indexeddb, cofre-cifrado (sessão + repositório cifrado), relogio
    in/ui/                 dom (DOM seguro + ícones SVG), kit (roteador e componentes), telas/
```

Regras das camadas (conferidas por script): `domain` só importa `shared`; `application` importa `domain` e `shared`; `adapters/out` não conhece a aplicação; `adapters/in` não importa `adapters/out`. Só o `main.js` liga tudo.

A aplicação recebe os adaptadores por injeção e não é exportada por nenhum módulo. Assim, a sessão aberta (com a chave dos dados) não fica ao alcance de um `import()` feito pelo console.

## Testes

Rodar a partir da pasta `studio-agenda-completo`:

```bash
node --test 05-testes/unit/          # 19 testes de domínio, aplicação, cofre e dinheiro (Node 20+, sem navegador)
python3 05-testes/e2e_cdp.py         # ponta a ponta no Chrome headless via CDP, com a CSP ativa
```

## Funcionalidades

| Área | O que faz |
|---|---|
| Entrada | Configuração inicial, escolha do profissional, teclado de PIN, bloqueio após erros, "Esqueci o PIN" (restaurar backup ou apagar) |
| Agenda | Grade por profissional, horários fechados hachurados, linha da hora atual, bloqueios (almoço/ausência), lista de comandas do dia |
| Agendar / Vender | Busca por nome ou celular, novo cliente, cliente avulso, favoritos, filtro de serviços do profissional, validação de conflito e de horário de funcionamento |
| Comanda | Itens do cliente no dia, status (Marcado, Confirmado, Em espera, Iniciado, Atrasado, Cancelado), notas internas, WhatsApp e ligação |
| Fechamento | Preço (com permissão), desconto por item, gorjeta, data de fechamento, numeração sequencial |
| Pagamento | Pix, dinheiro, débito, crédito e crédito do cliente, divisão entre formas, pagamento parcial ou "continuar sem pagamento" (o que falta vira débito do cliente) |
| Clientes | Lista, ficha com visão geral, conta corrente, agendamentos e fechamentos |
| Equipe | Saldo por profissional, conta corrente (comissões, gorjetas, recibos, adiantamentos), comissões pendentes |
| Financeiro | Caixa do dia com valor inicial, entradas/saídas, categorias e dinheiro na gaveta; relatórios do mês e evolução de 6 meses |
| Gestão | Estabelecimento, horário com vários intervalos, intervalo da agenda, fechamento de caixa, serviços, profissionais, PIN, permissões |
| Segurança | Meu PIN, bloqueio automático, armazenamento persistente, backup criptografado, restauração, auditoria, apagar dados |

## Testado (v1.2.0)

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
  - estorno só com o caixa do dia aberto.
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
  - segunda aba travada;
  - nenhuma tela com rolagem horizontal.

Detalhes de segurança em `SEGURANCA.md`.
