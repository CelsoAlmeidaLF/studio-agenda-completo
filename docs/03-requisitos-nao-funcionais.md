# Studio Agenda — Requisitos Não Funcionais

> Versão 0.1 · 22/10/2026 · Cada requisito tem uma métrica verificável.

## Usabilidade e acessibilidade

| ID | Requisito | Métrica |
|---|---|---|
| RNF-01 | Interface responsiva para celular, tablet, notebook e telas grandes. | Sem rolagem horizontal da página de 360 px a 2560 px. Só a grade da agenda rola na horizontal. |
| RNF-02 | Agendar um cliente já cadastrado em poucos toques. | No máximo 6 toques do "+" até salvar. |
| RNF-03 | Alvos de toque confortáveis. | Mínimo de 44 × 44 px. |
| RNF-04 | Contraste legível. | Texto ≥ 4,5:1, texto grande ≥ 3:1 (WCAG 2.1 AA). |
| RNF-05 | Navegável por teclado e leitor de tela. | Todos os controles são `button`, `a` ou `input` reais, com rótulo e foco visível. |
| RNF-06 | Idioma e formatos brasileiros. | pt-BR em todos os textos, sem chave de tradução aparente; moeda R$ 1.234,56; datas dd/mm/aaaa; fuso America/Sao_Paulo. |
| RNF-07 | Mensagens de erro úteis. | Toda validação diz o que houve e como corrigir (ex.: "Ana já tem Renata às 10:00"). |

## Desempenho

| ID | Requisito | Métrica |
|---|---|---|
| RNF-08 | Abertura rápida. | Primeira tela utilizável em ≤ 2,5 s em 4G (LCP), ≤ 1 s com o app em cache. |
| RNF-09 | Resposta imediata às ações. | Troca de tela e salvar local em ≤ 200 ms. |
| RNF-10 | Escala de dados por estabelecimento. | Agenda do dia fluida com 30 profissionais e 300 itens; busca de cliente em ≤ 300 ms com 20 mil clientes. |

## Disponibilidade e funcionamento offline

| ID | Requisito | Métrica |
|---|---|---|
| RNF-11 | Funcionar sem internet. | Agenda, comanda e fechamento funcionam offline (PWA + armazenamento local). |
| RNF-12 | Sincronizar ao voltar a conexão. | Pendências enviadas automaticamente em ≤ 30 s após reconectar, com aviso de "sincronizando". |
| RNF-13 | Conflito de edição simultânea. | Dois aparelhos editando o mesmo item: o segundo salvamento é recusado e mostra a versão atual. Nunca sobrescrever em silêncio. |
| RNF-14 | Disponibilidade do serviço em nuvem. | ≥ 99,5% ao mês. |

## Segurança e privacidade (LGPD)

| ID | Requisito | Métrica |
|---|---|---|
| RNF-15 | Autenticação obrigatória. | Nenhum dado acessível sem sessão. Sessão expira após 12 h de inatividade. |
| RNF-16 | Autorização no servidor. | Permissões (RN-40) validadas no backend/regras do banco, não só escondendo botões. |
| RNF-17 | Isolamento entre estabelecimentos. | Nenhuma consulta retorna dados de outro estabelecimento (teste automatizado obrigatório). |
| RNF-18 | Dados em trânsito e em repouso protegidos. | HTTPS/TLS 1.2+; banco com criptografia em repouso. |
| RNF-19 | Dados sensíveis de saúde. | Anamnese e fotos com acesso restrito por permissão própria e registro de quem acessou. |
| RNF-20 | Direitos do titular (LGPD). | Exportar e anonimizar os dados de um cliente a pedido, mantendo os valores financeiros. |
| RNF-21 | Trilha de auditoria. | Fechamento, anulação, estorno, mudança de preço e de permissão registram quem, quando e o valor antes/depois. |
| RNF-22 | Nenhum dado de cartão armazenado. | Pagamentos com cartão só por gateway ou maquininha certificada PCI. O sistema guarda apenas forma, valor e ID da transação. |

## Confiabilidade dos dados financeiros

| ID | Requisito | Métrica |
|---|---|---|
| RNF-23 | Precisão monetária. | Valores guardados em centavos (inteiros). Nunca usar ponto flutuante para dinheiro. |
| RNF-24 | Operações atômicas. | Fechamento + pagamento + caixa + comissões gravados juntos ou nenhum (transação). |
| RNF-25 | Backup. | Backup diário com retenção de 30 dias; restauração testada a cada trimestre. |

## Manutenibilidade e portabilidade

| ID | Requisito | Métrica |
|---|---|---|
| RNF-26 | Arquitetura hexagonal. | Regras de negócio sem dependência de UI, banco ou framework (ver Regras Técnicas). |
| RNF-27 | Cobertura de testes. | ≥ 80% no domínio (agenda, fechamento, comissão, permissões). |
| RNF-28 | Portabilidade. | O mesmo núcleo atende o PWA e a versão empacotada (Capacitor, Kotlin ou MAUI), sem reescrever regras. |
| RNF-29 | Compatibilidade. | Chrome/Edge/Safari das 2 últimas versões; Android 9+; iOS 15+. |
