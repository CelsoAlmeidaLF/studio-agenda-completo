# Studio Agenda — Pacote completo do projeto

> Gerado em 22/10/2026. Contém todo o código e a documentação produzidos no projeto.

| Pasta | Conteúdo | Como usar |
|---|---|---|
| `01-mvp/` | `agenda-studio.html`: primeiro MVP, em um único arquivo (visual Aero, dados no `localStorage`, sem PIN). | Abrir no navegador ou servir pelo SHTTPS. Fica como referência histórica. |
| `02-prototipo-telas/` | As 34 telas do protótipo (padrão visual ilove.me, marca própria) em formato `.dc.html`, mais o mapa `canvas.json` com a posição e a navegação entre as telas. | Fonte do canvas de design. Os arquivos dependem do `support.js` do editor de design, então a forma de ver é pelo link do canvas no Claude. |
| `03-documentacao/` | Regras de negócio (53), requisitos funcionais (64 + critérios de aceite), requisitos não funcionais (29), regras técnicas (30) e segurança. | Markdown. Os códigos RN, RF, RNF e RT ligam um documento ao outro. |
| `04-pwa/` | **Aplicação atual (v1.4.0):** HTML + CSS + JS com PWA, arquitetura hexagonal, IndexedDB criptografado, PIN por profissional, permissões e auditoria. | `python3 -m http.server 8080` dentro da pasta e abrir `http://localhost:8080`, ou servir por HTTPS. Veja `04-pwa/README.md`. |
| `05-testes/` | Testes unitários (`unit/`, Node) e ponta a ponta (`e2e_cdp.py`, Chrome via CDP), mais capturas de tela. Os scripts antigos de Playwright da v1.0.0 estão em `legado/`. | `node --test 05-testes/unit/` e `python3 05-testes/e2e_cdp.py` (sobe o servidor e o Chrome sozinho; precisa do pacote `websockets`). |

## Ordem de leitura sugerida
1. `03-documentacao/01-regras-de-negocio.md`
2. `03-documentacao/02-requisitos-funcionais.md`
3. `04-pwa/README.md`
4. `03-documentacao/SEGURANCA.md`

## Pendências registradas
- As regras marcadas **[A CONFIRMAR]** nos documentos ainda dependem de decisão do dono do produto.
- Ainda não estão na versão funcional: produtos, pacotes, estoque, anamnese, recorrência de agendamento, sincronização em nuvem e o plano/faturamento da assinatura. Tudo isso já aparece no protótipo.
