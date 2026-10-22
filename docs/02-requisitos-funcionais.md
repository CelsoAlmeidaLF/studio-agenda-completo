# Studio Agenda — Requisitos Funcionais

> Versão 0.2 · 22/10/2026 · Prioridade MoSCoW: **M** = obrigatório no MVP, **S** = deveria ter, **C** = poderia ter, **W** = fora desta versão.
> A coluna **Tela** remete ao número da tela no protótipo; a coluna **RN** remete às regras de negócio.
> No status, **MVP** quer dizer que já está no `agenda-studio.html`.

## 1. Agenda

| ID | Requisito | Tela | RN | Prior. | Status |
|---|---|---|---|---|---|
| RF-01 | Exibir a agenda do dia em grade: horários nas linhas e um profissional por coluna. | 1 | RN-05 | M | MVP |
| RF-02 | Navegar entre dias (anterior, próximo, hoje e seletor de data). | 1 | — | M | MVP |
| RF-03 | Alternar entre a visão em grade e a lista de comandas do dia. | 1, 2 | — | S | Protótipo |
| RF-04 | Mostrar a linha da hora atual e os períodos fechados e bloqueados hachurados. | 1 | RN-03 | S | Parcial |
| RF-05 | Criar agendamento tocando em um horário livre (profissional e hora já preenchidos). | 1 | RN-01 | M | MVP |
| RF-06 | Impedir conflito de horário do mesmo profissional e informar com quem é o conflito. | — | RN-02 | M | MVP |
| RF-07 | Criar e editar bloqueios de agenda (ausência, almoço) por profissional. | 1 | RN-03 | S | Pendente |
| RF-08 | Filtrar quais profissionais aparecem na grade. | 1 | — | C | Pendente |
| RF-09 | Configurar repetição de agendamento (semanal, quinzenal, mensal). | 5 | RN-08 | C | Pendente |

## 2. Agendar / Vender e comanda

| ID | Requisito | Tela | RN | Prior. | Status |
|---|---|---|---|---|---|
| RF-10 | Buscar cliente por nome ou celular, com destaque do trecho digitado. | 21, 22 | RN-11 | M | Protótipo |
| RF-11 | Criar cliente com o nome digitado ou seguir como cliente avulso. | 22 | RN-12 | M | Protótipo |
| RF-12 | Adicionar à comanda um serviço (data, hora, profissional) ou um produto (quantidade, vendedor), com notas internas. | 5, 23, P4 | RN-17, RN-57 | M | PWA v1.1 |
| RF-13 | Escolher o profissional agrupado por área, com busca. | 6 | — | M | Protótipo |
| RF-14 | Escolher o serviço agrupado por categoria, filtrando pelos serviços do profissional. | 7 | RN-09 | M | Protótipo |
| RF-15 | Marcar o profissional como favorito do cliente. | 23 | RN-10 | C | Protótipo |
| RF-16 | Exibir a comanda com todos os itens do cliente no dia, valor total e atalhos de WhatsApp e ligação. | 3 | RN-17 | M | Protótipo |
| RF-17 | Alterar o status do item (Marcado, Confirmado, Em espera, Iniciado, Atrasado, Cancelado). | 4 | RN-06 | M | Parcial |
| RF-18 | Editar ou excluir um item da comanda. | 3 | RN-07 | M | MVP |

## 3. Fechamento e pagamento

| ID | Requisito | Tela | RN | Prior. | Status |
|---|---|---|---|---|---|
| RF-19 | Fechar a comanda mostrando os itens, o total, desconto, gorjeta e a data de fechamento. | 8 | RN-18–22 | M | Parcial |
| RF-20 | Editar o preço de um item no fechamento (conforme permissão). | 8 | RN-19 | S | Pendente |
| RF-21 | Registrar o pagamento em uma ou mais formas (Pix, dinheiro, débito, crédito, crédito do cliente). | 9 | RN-23, RN-25 | M | Parcial (1 forma) |
| RF-22 | Continuar sem pagamento, deixando saldo devedor para o cliente. | 9 | RN-23 | S | Pendente |
| RF-23 | Calcular e lançar a comissão do profissional no fechamento. | 8 | RN-27–29 | M | MVP |
| RF-24 | Anular um fechamento com estorno completo. | 3 | RN-24 | S | Parcial |
| RF-25 | Gerar o número sequencial do fechamento. | 8 | RN-26 | S | Pendente |

## 4. Clientes

| ID | Requisito | Tela | RN | Prior. | Status |
|---|---|---|---|---|---|
| RF-26 | Listar clientes dos últimos agendamentos, agrupados por data, com busca. | 16 | RN-14 | M | Parcial |
| RF-27 | Ficha do cliente — Visão geral: dados, contatos, anamnese, última e próxima visita. | 10 | — | M | Parcial |
| RF-28 | Ficha — Conta corrente: créditos, débitos e saldo, com lançamento manual. | 11 | RN-25, RN-31 | S | Protótipo |
| RF-29 | Ficha — Agendamentos: próximos e passados, com status. | 12b | — | M | Parcial |
| RF-30 | Ficha — Fechamentos: histórico de fechamentos pagos. | 12 | — | S | Protótipo |
| RF-31 | Cadastrar, editar e inativar cliente. | 10 | RN-13, RN-15 | M | MVP (sem inativar) |
| RF-32 | Fichas de anamnese (histórico, tratamento e avaliação com fotos). | 10 | — | C | Pendente |

## 5. Equipe e comissões

| ID | Requisito | Tela | RN | Prior. | Status |
|---|---|---|---|---|---|
| RF-33 | Listar a equipe com a área e o saldo de cada profissional. | 17 | RN-31 | M | Protótipo |
| RF-34 | Ficha do profissional — Conta corrente com entradas, saídas, saldo e filtros. | 18, 20 | RN-31 | M | Protótipo |
| RF-35 | Ficha do profissional — Comissões pendentes. | 19 | RN-30 | S | Protótipo |
| RF-36 | Lançar adiantamento e pagar recibo ao profissional. | 18 | RN-32 | S | Pendente |
| RF-37 | Cadastrar profissional: nome, sigla, cor, área e percentual de comissão. | — | RN-27 | M | MVP |

## 6. Financeiro

| ID | Requisito | Tela | RN | Prior. | Status |
|---|---|---|---|---|---|
| RF-38 | Caixa do dia: valor inicial, entradas, saídas, saldo final e lista de lançamentos. | 15 | RN-33–35 | M | Protótipo |
| RF-39 | Lançar entrada ou saída manual no caixa. | 15 | RN-35 | S | Pendente |
| RF-40 | Mostrar o total por forma de pagamento (categorias). | 15 | — | S | MVP (relatório) |
| RF-41 | Filtrar lançamentos por período, tipo e categoria. | 20 | — | S | Protótipo |
| RF-42 | Conta corrente do estabelecimento e transações. | 14 | — | C | Pendente |

## 7. Relatórios

| ID | Requisito | RN | Prior. | Status |
|---|---|---|---|---|
| RF-43 | Faturamento do mês, atendimentos, ticket médio e comissões. | — | M | MVP |
| RF-44 | Evolução do faturamento mensal (6 meses). | — | M | MVP |
| RF-45 | Comissão por profissional. | RN-28 | M | MVP |
| RF-46 | Serviços mais vendidos e produtos mais vendidos (quantidade e valor). | RN-60 | M | PWA v1.1 |
| RF-47 | Clientes do mês (atendidos e novos). | — | S | MVP |
| RF-48 | Baixar relatórios em CSV (conforme permissão). | — | C | Pendente |

## 8. Gestão do estabelecimento

| ID | Requisito | Tela | RN | Prior. | Status |
|---|---|---|---|---|---|
| RF-49 | Dados gerais: nome, serviço principal, razão social, CNPJ, endereço e contatos. | 25, 26 | RN-45, RN-46 | M | Protótipo |
| RF-50 | Horário de funcionamento por dia, com vários intervalos. | 27 | RN-04 | M | Parcial (horário único) |
| RF-51 | Configurar o uso de fechamento de caixa (Sim/Não). | 28 | RN-33 | S | Protótipo |
| RF-52 | Cadastro de serviços (nome, categoria, duração, preço, profissionais que executam). | 24 | RN-47 | M | MVP (sem categoria) |
| RF-53 | Cadastro de descontos pré-definidos. | 24 | RN-20 | W | Fora do escopo |
| RF-54 | Produtos: ver a seção 12. Linhas, marcas, fornecedores e estoque estão fora do escopo. | 24 | RN-54 | M | PWA v1.1 |
| RF-55 | Permissões por profissional nas 8 áreas. | 29 | RN-40–44 | M | Protótipo |

## 9. Notificações

| ID | Requisito | RN | Prior. | Status |
|---|---|---|---|---|
| RF-56 | Gerar lembrete por WhatsApp com mensagem pronta e marcar o cliente como avisado. | RN-37, RN-38 | M | MVP |
| RF-57 | Envio automático de SMS ou e-mail. | RN-37 | W | Pendente |

## 10. Assinatura do sistema

| ID | Requisito | Tela | RN | Prior. | Status |
|---|---|---|---|---|---|
| RF-58 | Mostrar o plano, os serviços ativos/inativos e as taxas. | 30 | RN-48, RN-50 | S | Protótipo |
| RF-59 | Listar notas de cobrança com status. | 31 | RN-51 | S | Protótipo |
| RF-60 | Listar pagamentos da assinatura. | 32 | — | S | Protótipo |
| RF-61 | Mostrar os dados de faturamento e a forma de pagamento preferida. | 33 | — | S | Protótipo |

## 11. Acesso

| ID | Requisito | Prior. | Status |
|---|---|---|---|
| RF-62 | Login por profissional (e-mail/celular e senha) e encerramento de sessão. | M | Pendente |
| RF-63 | Menu lateral com o perfil, o estabelecimento e as áreas permitidas. | M | Protótipo |
| RF-64 | Recuperação de senha. | S | Pendente |

---

## 12. Produtos

Telas P1 a P4: lista de produtos, ficha do produto, comissões de venda e aba Produto na comanda.

| ID | Requisito | Tela | RN | Prior. | Status |
|---|---|---|---|---|---|
| RF-65 | Lista de produtos agrupada por categoria, com contagem, busca por nome/categoria/código e ícone de carrinho nos produtos à venda. | P1 | RN-54 | M | PWA v1.1 |
| RF-66 | Cadastrar produto (nome e categoria) e abrir a ficha. | P1, P2 | RN-54 | M | PWA v1.1 |
| RF-67 | Ficha do produto com seções recolhíveis: Informações básicas, Consumo e Venda, cada uma com Editar; rodapé com código, criação e última alteração (data e autor). | P2 | RN-54, RN-55, RN-56 | M | PWA v1.1 |
| RF-68 | Desativar e reativar o produto. | P2 | RN-54 | M | PWA v1.1 |
| RF-69 | Comissões de venda: preço de venda em destaque e profissionais agrupados por área, com "Sem comissão" ou o percentual; tocar abre a edição do percentual. | P3 | RN-58 | M | PWA v1.1 |
| RF-70 | Aba Produto em "Adicionar à comanda": produto agrupado por categoria, quantidade, vendedor, aviso da comissão, total; editar e excluir antes do fechamento. | P4 | RN-56, RN-57, RN-59 | M | PWA v1.1 |
| RF-71 | Produto vendido aparece na comanda, no fechamento (com desconto) e na lista de comandas, mas não na grade da agenda nem nos lembretes. | 3 | RN-56 | M | PWA v1.1 |

---

## Critérios de aceite dos fluxos principais

**CA-01 · Agendar sem conflito (RF-05, RF-06)**
Dado que Ana tem um atendimento das 10:00 às 11:00,
quando eu tento agendar Ana às 10:30,
então o sistema recusa e informa "Ana já tem [cliente] às 10:00".

**CA-02 · Fechar e pagar (RF-19, RF-21, RF-23)**
Dada uma comanda com Mão R$ 40 (Bianca, 40%) e Design R$ 70 (Camila, 40%),
quando aplico desconto de R$ 10 no Design e pago R$ 100 em Pix,
então o caixa do dia recebe +R$ 100 em Pix, Bianca recebe +R$ 16,00 de comissão, Camila recebe +R$ 24,00, e os itens ficam com status *Pago*.

**CA-03 · Pagamento dividido (RF-21)**
Dado um total de R$ 135,
quando informo R$ 50 em Pix e R$ 80 em crédito,
então o botão de confirmar fica desabilitado e o sistema mostra "Faltam R$ 5,00".

**CA-04 · Permissão de contatos (RF-55)**
Dado um profissional com "Sem acesso, ver apenas o nome dos clientes",
quando ele abre a ficha de um cliente,
então vê o nome, mas o telefone, o e-mail e os botões de WhatsApp e ligação não aparecem.

**CA-05 · Caixa com valor inicial (RF-38, RF-51)**
Dado que o fechamento de caixa está ativo e o caixa de hoje não tem valor inicial,
quando tento receber um pagamento,
então o sistema pede o valor inicial antes de concluir.

**CA-06 · Venda de produto com comissão (RF-70, RN-58)**
Dado o produto Gel de sobrancelha a R$ 20,00 com comissão de venda de 10% para Camila,
quando adiciono 2 unidades vendidas por Camila na comanda e fecho com pagamento em Pix,
então o caixa recebe o valor do fechamento, Camila recebe +R$ 4,00 em "Comissão de venda", o relatório mostra 2 un. em "Produtos mais vendidos" e a grade da agenda não mostra o produto.

**CA-07 · Venda inativa (RN-56)**
Dado um produto com venda inativa ou sem preço,
quando tento ativar a venda sem preço,
então o sistema recusa com "Informe o preço de venda para ativar a venda." e o produto não aparece na aba Produto.

## 13. Escopo fechado (decisão de 22/10/2026)

As telas mapeadas no protótipo são o escopo completo do produto. **O que não foi mapeado não será construído.** Ficam fora:

| Fora do escopo | Observação |
|---|---|
| Pacotes de serviços | A aba "Pacote" em "Adicionar à comanda" não existe. |
| Estoque (entradas, saídas, posição, inventário) | O produto tem só os preços de consumo como referência de custo; não há controle de quantidade. |
| Linhas, marcas e fornecedores de produtos | Produto tem apenas nome e categoria. |
| Configurações gerais de produtos | — |
| Anamnese | A área de permissão "Anamnese" não é usada. |
| Recorrência de agendamento | Cada agendamento é criado individualmente. |
| Descontos pré-definidos | O desconto é digitado no fechamento, item a item. |
| Dados pessoais / perfil do usuário | O profissional é editado em Gestão › Profissionais. |
| Vendas online, maquininha integrada e SMS/e-mail automático | O lembrete continua por link de WhatsApp. |
