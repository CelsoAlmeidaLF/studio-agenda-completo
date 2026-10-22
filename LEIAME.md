# Studio Agenda — Pacote completo do projeto

**No ar:** https://celsoalmeidalf.github.io/studio-agenda-completo/ · **Código:** https://github.com/CelsoAlmeidaLF/studio-agenda-completo

> Gerado em 22/10/2026. Contém todo o código e a documentação produzidos no projeto.

| Pasta | Conteúdo | Como usar |
|---|---|---|
| `01-mvp/` | `agenda-studio.html`: primeiro MVP, em um único arquivo (visual Aero, dados no `localStorage`, sem PIN). | Abrir no navegador ou servir pelo SHTTPS. Fica como referência histórica. |
| `02-prototipo-telas/` | As 34 telas do protótipo (padrão visual ilove.me, marca própria) em formato `.dc.html`, mais o mapa `canvas.json` com a posição e a navegação entre as telas. | Fonte do canvas de design. Os arquivos dependem do `support.js` do editor de design, então a forma de ver é pelo link do canvas no Claude. |
| `03-documentacao/` | Regras de negócio (60), requisitos funcionais (71 + 7 critérios de aceite), requisitos não funcionais (29), regras técnicas (30) e segurança. | Markdown. Os códigos RN, RF, RNF e RT ligam um documento ao outro. |
| `04-pwa/` | **Aplicação atual (v1.6.0):** HTML + CSS + JS com PWA, arquitetura hexagonal, IndexedDB criptografado, PIN e biometria por profissional, permissões, auditoria e produtos (lista, ficha, consumo, venda, comissão de venda e venda na comanda). | `python3 -m http.server 8080` dentro da pasta e abrir `http://localhost:8080`, ou servir por HTTPS. Veja `04-pwa/README.md`. |
| `05-testes/` | Testes unitários (`unit/`, Node) e ponta a ponta (`e2e_cdp.py`, Chrome via CDP), mais capturas de tela. Os scripts antigos de Playwright da v1.0.0 estão em `legado/`. | `node --test 05-testes/unit/` e `python3 05-testes/e2e_cdp.py` (sobe o servidor e o Chrome sozinho; precisa do pacote `websockets`). |

## Ordem de leitura sugerida
1. `03-documentacao/01-regras-de-negocio.md`
2. `03-documentacao/02-requisitos-funcionais.md`
3. `04-pwa/README.md`
4. `03-documentacao/SEGURANCA.md`

## Escopo fechado
As telas mapeadas são o escopo completo do produto. Ficam **fora**: pacotes, estoque, linhas/marcas/fornecedores, configurações gerais de produtos, anamnese, recorrência de agendamento, descontos pré-definidos, dados pessoais do usuário, vendas online, maquininha e SMS/e-mail automático. Detalhes em `03-documentacao/01-regras-de-negocio.md`, seção 11.

## Pendências registradas
- As regras marcadas **[A CONFIRMAR]** nos documentos ainda dependem de decisão do dono do produto.
- Mapeado, mas ainda não na versão funcional: plano e faturamento da assinatura (depende de servidor) e sincronização em nuvem.
- As 4 telas de produtos estão no app, mas ainda não foram desenhadas no canvas do protótipo.
