# CREDNEX — Soluções Financeiras

Aplicação independente derivada da base técnica GOMOVE: React 19, TypeScript, Vite, Express, cliente de API e integração PIXPAY. O portal e o motor financeiro foram adaptados para as regras CREDNEX. Nenhum banco, saldo, conta, sessão ou segredo da GOMOVE é reutilizado.

## Executar

```powershell
npm install
node scripts/setup-local.mjs
npm run dev
```

Portal: http://localhost:5180. API: http://localhost:4020.

O setup gera uma senha exclusiva no `.env`, variável `CREDNEX_ADMIN_PASSWORD`. Usuário inicial: `admin`. Acesse **Regras e roleta** para revisar as definições e liberar aplicações. O cadastro público cria participantes com saldo zero. Não existem contas ou créditos fictícios no banco inicial. Para recomeçar do zero entre ciclos de teste: `npm run db:reset` (recria o admin no próximo start com a senha do `.env`).

```powershell
npm test
npm run build
npm start
```

Na versão compilada, interface e API ficam em http://localhost:4020.

## Funcionalidades

- Cadastro com indicação, login, bloqueio de conta, troca de senha e encerramento de sessões.
- Portal com visão geral, nove planos, aplicações, carteiras, depósitos, saques e extrato.
- Credcofre com capital separado dos rendimentos, resgate e encerramento da aplicação.
- Rede genealógica, comissões em três níveis, elegibilidade, salário e giros.
- Roleta com pesos e prêmios monetários configurados pelo administrador, sorteio no servidor e consumo único do giro.
- Chamados com conversas e encerramento pelo administrador.
- Central administrativa com usuários, aplicações, cobranças PIX, fila de saques, processamento, regras e auditoria.

## Regras implementadas e decisões explícitas

A mensagem do usuário prevalece sobre o PDF. O PDF contém ciclos antigos de 30 dias e taxas diferentes.

| Modalidade | Valor | Prazo | Taxa simples diária |
|---|---|---|---|
| C-1 | R$25 a R$100 | 35 dias | 8% |
| C-2 | R$100 a R$500 | 35 dias | 9% |
| C-3 | R$500 a R$1.500 | 35 dias | 10% |
| NEX-N1 a N5 | R$50 / R$100 / R$250 / R$500 / R$1.500 | 50 dias | 4% |
| Credcofre | A partir de R$25 | Sem prazo fixo | 2% |

- R$40 é o mínimo para depósitos PIX. O saldo permite contratar aplicações de R$25.
- Os intervalos dos ciclos são inclusivos. Em R$100 ou R$500, vale o plano escolhido pelo participante.
- Rendimentos em centavos, arredondados para baixo por parcela, a cada 24 horas completas desde a contratação. Sem juros compostos e sem crédito proporcional por horas.
- Os ciclos devolvem o capital à carteira de rendimentos ao encerrar o dia 35, disponível para saque ou reinvestimento. O lucro é creditado diariamente na carteira de rendimentos.
- **NEX:** a devolução do capital não foi definida pelo usuário; o administrador escolhe antes de liberar aplicações. A configuração inicial está desativada. O contrato captura a configuração vigente.
- Credcofre: principal fica bloqueado para saque enquanto a aplicação rende. O resgate encerra a aplicação imediatamente e libera o principal na carteira Credcofre. Rendimentos ficam disponíveis sem encerrar o capital. Não há resgate parcial do principal; aplicações podem ser abertas separadamente.
- Saques: rendimentos de segunda a sexta; Credcofre todos os dias. Janela `[12:00,18:00)` em `America/Sao_Paulo`. Taxa de 10% sobre o valor bruto, arredondada para o centavo mais próximo. O saldo bruto é reservado na solicitação; recusa devolve uma única vez.
- Comissão inicial configurada sobre o valor de cada aplicação confirmada, incluindo reinvestimentos e Credcofre; alternativa sobre os rendimentos. Níveis 10%, 3% e 2%, sem compressão: um nível inelegível não transfere sua comissão. Beneficiário precisa ser participante ativo com aplicação vigente. Essas escolhas aguardam revisão administrativa porque o usuário não definiu a base.
- Salário inicial por **indicados diretos**, opção de rede inteira no painel. Ativo = conta ativa com aplicação vigente. Maior faixa elegível no processamento, um pagamento por mês civil; não há complemento automático por promoção no mesmo mês. Bronze R$75 (5/10), Prata R$150 (10/25), Ouro R$350 (20/50), Diamante R$850 (35/100). Contagem e calendário são decisões operacionais explicitadas, ainda sujeitas à definição da empresa.
- Um giro pela primeira ativação do indicado, para patrocinador elegível; um giro por aplicação paga com a carteira de rendimentos. Prêmios e probabilidades aguardam cadastro; nenhum prêmio foi inventado.
- Suporte: segunda a sexta, 12h–18h; sábado e domingo, 12h–15h. Abertura de chamados disponível a qualquer hora.

## PIX e operação externa

Configure uma conta **própria da CREDNEX** em `PIXPAY_API_KEY`, `PIXPAY_API_SECRET`, `PIXPAY_BASE_URL`, `APP_PUBLIC_URL` e `PIXPAY_WEBHOOK_TOKEN` (32+ caracteres). O adaptador deriva da GOMOVE e deve ser homologado com o provedor contratado. O endpoint de cobrança é `/api/v1/transactions/pix`; webhook da aplicação `/api/webhooks/2pp?token=SEGREDO&depositId=REFERENCIA_LOCAL` (alias `/api/webhooks/pixpay` preservado).

O webhook exige segredo, identificador conhecido e valor exato. Somente pagamento confirmado credita saldo. Webhooks repetidos não duplicam crédito. Timeout de cobrança fica como `REVIEW_REQUIRED`: requer conciliação com o provedor, pois ele pode ter criado a cobrança. Não há confirmação manual irrestrita de depósito.

**Saques são solicitações administrativas.** Esta versão não envia dinheiro automaticamente. O administrador efetua o PIX fora do sistema e registra a referência do comprovante, ou recusa com motivo. Homologação real de cobrança, entrega de webhook e pagamento externo ainda não foi executada.

## Persistência e implantação

Localmente, gravação atômica em `.data/crednex.json` e fila de transações para um único processo Node. Em caso de arquivo corrompido, o original e uma cópia `.corrupt-<timestamp>` são preservados; operações financeiras falham com HTTP 503 até restauração administrativa, sem recriar saldos ou contas. Em produção, configure `DATABASE_URL` exclusiva: a tabela `crednex_state` usa versionamento otimista para impedir sobrescrita concorrente e conflitos são relidos e repetidos automaticamente (até 3 tentativas) sobre o estado mais recente; se o conflito persistir, a operação falha sem confirmação de saldo e deve ser repetida pelo usuário. Payloads antigos recebem defaults das versões novas sem perder dados. A implementação de PostgreSQL precisa de validação em banco real antes da implantação.

O Express processa rendimentos e salários a cada minuto; leituras autenticadas também atualizam rendimentos vencidos. Em ambiente serverless, agende `GET /api/cron/accrue` com `Authorization: Bearer CRON_SECRET` (24+ caracteres), preferencialmente a cada minuto. Créditos vencidos são recuperados na próxima execução sem duplicação. A implantação atual no servidor informado está documentada em `deploy/README.md`.

Não versionar `.env`, `.data`, dados de teste nem `node_modules`. Para uso externo, servir via HTTPS e configurar os segredos da nova empresa, backups, monitoramento e política de dados. E-mail de recuperação de senha e autenticação em dois fatores não fazem parte desta versão.

## Validação

Testes automatizados de catálogo, dinheiro, ciclos, NEX, juros simples, principal, fronteiras de horário, Credcofre, reservas, estornos, níveis, giros, salário e API. A integração de teste usa gateway simulado e banco temporário isolado. Execute `npm test` para verificar o resultado atual e `npm run build` para validar frontend e backend.

### Limites de aplicações e projeções

Em **Regras e roleta**, o administrador define o máximo de aplicações ativas por participante em cada plano (padrão: 2; inteiro positivo). A alteração vale para novas contratações e preserva contratos existentes. A API verifica o limite dentro da transação, inclusive em pedidos simultâneos. Encerrar um ciclo libera uma vaga; no Credcofre, o resgate libera a vaga.

Os cartões e a confirmação exibem a ocupação atual. A confirmação calcula a projeção conforme o valor informado, usando o mesmo arredondamento diário do extrato. O total do período soma os rendimentos diários e o capital devolvido quando aplicável; não representa um crédito único no vencimento. As aplicações exibem dias restantes, vencimento e retorno conforme as condições contratadas. Exemplo: R$55 no C-1 = R$4,40/dia, R$154 em rendimentos em 35 dias e R$55 de capital, total bruto de R$209. O Credcofre não apresenta total final fixo.
