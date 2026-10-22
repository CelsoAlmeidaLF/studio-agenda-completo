# Studio Agenda — Regras de Negócio

> Versão 0.1 · 22/10/2026 · Fonte: protótipo de telas (34 telas) e MVP `agenda-studio.html`
> Itens marcados **[A CONFIRMAR]** são decisões propostas que dependem do dono do produto.

## Glossário

| Termo | Significado |
|---|---|
| Estabelecimento | O salão/clínica que assina o sistema. Todo dado pertence a um estabelecimento. |
| Profissional | Pessoa da equipe que atende ou opera o sistema (inclui Recepção e Gerência). |
| Cliente | Pessoa atendida. Pode ser **cadastrado** ou **avulso** (passante, sem cadastro). |
| Item de comanda | Um serviço, produto ou pacote vendido, com profissional, horário e preço. |
| Comanda | Conjunto de itens de **um cliente em um dia**. É a unidade de fechamento. |
| Fechamento | Encerramento da comanda: soma, desconto, gorjeta e data de fechamento. |
| Pagamento | Registro de como o fechamento foi pago (Pix, dinheiro, débito, crédito, crédito do cliente). |
| Conta corrente | Extrato de créditos e débitos de um cliente, de um profissional ou do estabelecimento. |
| Caixa | Movimento financeiro diário do estabelecimento (entradas e saídas). |
| Bloqueio | Período em que um profissional não atende (ausência, almoço). |

---

## 1. Agenda e agendamentos

- **RN-01** Um item de comanda tem obrigatoriamente: cliente (ou avulso), profissional, serviço, data, hora de início e duração. A hora de término é `início + duração do serviço`.
- **RN-02** Um profissional não pode ter dois itens que se sobreponham no tempo. Exceção: itens com status *Cancelado*.
- **RN-03** Não é permitido agendar dentro de um **bloqueio** do profissional nem fora do **horário de funcionamento** do estabelecimento. A agenda mostra esses períodos hachurados.
- **RN-04** O horário de funcionamento é definido por dia da semana e pode ter vários intervalos no mesmo dia (ex.: 09:00–12:00 e 13:00–19:00). Dia sem intervalo = estabelecimento fechado.
- **RN-05** A grade da agenda usa o intervalo configurado (15, 30 ou 60 min). O intervalo só afeta a exibição; a duração do serviço pode ser qualquer múltiplo de 5 min.
- **RN-06** Ciclo de status do item:

  | De | Para | Observação |
  |---|---|---|
  | Marcado | Confirmado, Em espera, Atrasado, Iniciado, Cancelado | Status inicial ao criar. |
  | Confirmado | Em espera, Atrasado, Iniciado, Cancelado | Normalmente após lembrete ao cliente. |
  | Em espera / Atrasado | Iniciado, Cancelado | |
  | Iniciado | (fechamento) | Atendimento em curso. |
  | Pago | — | Só sai de *Pago* anulando o fechamento (RN-24). |
  | Cancelado | Marcado | Reativar libera de novo a validação de conflito. |

- **RN-07** Alterar data, hora ou profissional de um item já confirmado volta o item a *Marcado* e marca o lembrete como pendente.
- **RN-08** Agendamento recorrente ("Configurar repetição") gera itens independentes; editar um não altera os outros, salvo escolha explícita "este e os próximos". **[A CONFIRMAR]**
- **RN-09** Ao escolher um profissional, a lista de serviços mostra por padrão só os serviços que ele executa; o filtro pode ser desmarcado.
- **RN-10** O cliente pode ter **profissionais favoritos**; eles aparecem primeiro na escolha de profissional para esse cliente.

## 2. Clientes

- **RN-11** Busca de cliente por nome **ou** celular, ignorando acentos e maiúsculas; resultados a partir de 2 caracteres.
- **RN-12** Se a busca não achar o cliente, o operador pode: (a) criar um cliente com o nome digitado, ou (b) seguir como **cliente avulso**. O avulso não entra na lista de clientes nem em relatórios de clientes, mas o fechamento e o caixa o contabilizam.
- **RN-13** Celular é único por estabelecimento. Ao cadastrar um celular já existente, o sistema oferece abrir o cliente existente.
- **RN-14** A lista de clientes mostra os clientes dos últimos agendamentos (exclui avulsos), agrupados pela data do agendamento.
- **RN-15** Cliente com histórico (agendamentos, fechamentos ou movimentos de conta) não pode ser excluído; só **inativado**. Isso preserva a integridade financeira.
- **RN-16** Notas internas do item e observações do cliente são visíveis só para a equipe, nunca nas notificações ao cliente.

## 3. Comanda, fechamento e pagamento

- **RN-17** A comanda agrupa todos os itens do mesmo cliente na mesma data. Pode receber serviços, produtos e pacotes.
- **RN-18** Total da comanda = Σ preço dos itens − descontos + gorjeta.
- **RN-19** O preço do item vem do cadastro do serviço no momento do agendamento. Alterar o preço exige a permissão "Editar o preço de todos os agendamentos" (ou dos próprios).
- **RN-20** Desconto pode ser em valor ou percentual, aplicado ao item ou à comanda, e nunca pode deixar o total negativo.
- **RN-21** A **gorjeta** vai integralmente para o profissional indicado e não entra na base de comissão.
- **RN-22** A **data de fechamento** padrão é hoje. Pode ser outra (ex.: fechar ontem); essa data define em que dia o valor entra no caixa e em que mês entra no faturamento.
- **RN-23** O pagamento pode ser dividido entre várias formas (ex.: R$ 50 Pix + R$ 85 crédito). A soma tem que ser igual ao total. "Continuar sem pagamento" deixa a comanda **fechada com saldo pendente**, lançado como débito na conta corrente do cliente. Se parte já foi paga, essa parte entra no caixa e só o restante vira débito.
- **RN-24** Anular um fechamento estorna o caixa, as comissões e os movimentos de conta corrente gerados por ele. Exige a permissão "Realizar e anular fechamentos" e registra quem e quando.
- **RN-25** Pagar com **crédito do cliente** só é possível até o saldo disponível na conta corrente do cliente.
- **RN-26** Todo fechamento recebe um número sequencial único por estabelecimento (ex.: nº 000521).

## 4. Comissões e conta corrente da equipe

- **RN-27** Cada profissional tem um percentual de comissão padrão; um serviço pode ter percentual próprio, que prevalece. **[A CONFIRMAR]**
- **RN-28** Base de comissão = valor do item após desconto, sem gorjeta. Comissão = base × percentual, arredondada a 2 casas.
- **RN-29** A comissão é gerada **no fechamento** (não no agendamento) e lançada como crédito na conta corrente do profissional.
- **RN-30** Com fechamento sem pagamento, a comissão fica em **Comissões pendentes** até o pagamento. **[A CONFIRMAR]**
- **RN-31** Movimentos da conta corrente do profissional: comissões, gorjetas, adiantamentos, recibos (pagamento ao profissional), produtos e outros. Saldo = Σ créditos − Σ débitos.
- **RN-32** Um **recibo** quita total ou parcialmente o saldo do profissional e gera uma saída no caixa.

## 5. Caixa e financeiro

- **RN-33** Se a opção **Fechamento de caixa = Sim**, o caixa de cada dia precisa de um **valor inicial** antes do primeiro lançamento. Se = Não, o caixa é só um extrato.
- **RN-34** Saldo final do dia = valor inicial + entradas − saídas.
- **RN-35** Entram no caixa: pagamentos de fechamentos e entradas manuais. Saem: recibos de profissionais, despesas e retiradas.
- **RN-36** Lançamentos de dias já fechados não podem ser editados, só estornados com novo lançamento. **[A CONFIRMAR]**

## 6. Notificações ao cliente

- **RN-37** O lembrete do agendamento é enviado por WhatsApp (link com mensagem pronta no MVP) e, em fase posterior, por SMS/e-mail automático.
- **RN-38** A mensagem informa o nome do estabelecimento, o serviço, o profissional, a data e a hora, e o número principal do estabelecimento.
- **RN-39** Só envia notificação quem tem a permissão "Enviar notificações aos clientes".

## 7. Permissões

- **RN-40** Permissões são **por profissional**, organizadas em 8 áreas: Agenda, Estoque, Clientes, Anamnese, Contas e comissões, Financeiro, Relatórios e Gestão do estabelecimento.
- **RN-41** Em cada grupo vale uma única opção (do menor ao maior acesso). As opções extras (caixas de marcar) só valem quando a opção que as contém está escolhida.
- **RN-42** "Apenas os seus próprios" quer dizer itens em que o profissional é o executante.
- **RN-43** Sem a permissão de contatos, o profissional vê o nome do cliente, mas não o telefone nem o e-mail.
- **RN-44** Só altera permissões quem tem "Configurações da equipe → Permitir gestão das permissões". Ninguém pode remover a própria permissão de gestão se for o último gestor. **[A CONFIRMAR]**

## 8. Gestão do estabelecimento

- **RN-45** Dados obrigatórios do estabelecimento: nome, serviço principal, número principal e endereço com CEP. CNPJ e razão social são opcionais (exigidos só para o módulo fiscal).
- **RN-46** O número principal e o e-mail do estabelecimento aparecem nas notificações aos clientes.
- **RN-47** Um serviço ou profissional usado em agendamentos não pode ser excluído; só inativado.

## 9. Assinatura do sistema (Plano e faturamento)

- **RN-48** A assinatura tem um limite de **agendas ativas** (profissionais com agenda). Ativar um profissional além do limite exige mudar de plano.
- **RN-49** A renovação é automática na periodicidade escolhida (mensal) e gera uma **nota de cobrança**.
- **RN-50** Serviços adicionais (vendas online, SMS, maquininha) só são cobrados se estiverem **ativos**, e são cobrados por uso em nota mensal.
- **RN-51** Status de nota de cobrança: Em aberto, Paga, Grátis (valor zero) e Vencida.
- **RN-52** Nota vencida há mais de X dias deixa o sistema em **modo somente leitura** até a quitação. **[A CONFIRMAR X]**
- **RN-53** Valores, taxas e limites do plano mostrados nas telas são **exemplos** até a definição comercial. **[A CONFIRMAR]**
