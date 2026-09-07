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
- Exclusão definitiva de participantes ativos ou bloqueados, com confirmação e revogação de todas as sessões. Administradores não podem ser excluídos. Saldos, aplicações ativas e depósitos ou saques pendentes impedem a exclusão até sua resolução. O histórico financeiro, de suporte e de auditoria permanece; indicados diretos ficam sem patrocinador, sem promoção de níveis. Giros não utilizados da conta excluída são removidos.

## Regras implementadas e decisões explícitas

A mensagem do usuário prevalece sobre o PDF. O PDF contém ciclos antigos de 30 dias e taxas diferentes.

| Modalidade | Valor | Prazo | Taxa simples diária |
|---|---|---|---|
| Cred-c1 | R$25 a R$100 | 30 dias | 6% |
| Cred-c2 | R$100 a R$500 | 30 dias | 6,5% |
| Cred-c3 | R$500 a R$1.500 | 30 dias | 7% |
| NEX-N1 a N5 | R$50 / R$100 / R$250 / R$500 / R$1.500 | 50 dias | 4% |
| Credcofre | A partir de R$25 | Sem prazo fixo | 2% |

- R$40 é o mínimo para depósitos PIX. O saldo permite contratar aplicações de R$25.
- Os intervalos dos ciclos são inclusivos. Em R$100 ou R$500, vale o plano escolhido pelo participante.
- Rendimentos em centavos, arredondados para baixo por parcela, a cada 24 horas completas desde a contratação. Sem juros compostos e sem crédito proporcional por horas.
- Os ciclos devolvem o capital à carteira de rendimentos ao encerrar o dia 30, disponível para saque ou reinvestimento. O lucro é creditado diariamente na carteira de rendimentos.
- **NEX:** a devolução do capital não foi definida pelo usuário; o administrador escolhe antes de liberar aplicações. A configuração inicial está desativada. O contrato captura a configuração vigente.
- Credcofre: principal fica bloqueado para saque enquanto a aplicação rende. O resgate encerra a aplicação imediatamente e libera o principal na carteira Credcofre. Rendimentos ficam disponíveis sem encerrar o capital. Não há resgate parcial do principal; aplicações podem ser abertas separadamente.
- Saques: rendimentos de segunda a sexta; Credcofre todos os dias. Janela `[12:00,18:00)` em `America/Sao_Paulo`. Taxa de 10% sobre o valor bruto, arredondada para o centavo mais próximo. O saldo bruto é reservado na solicitação; recusa devolve uma única vez.
- Comissão inicial configurada sobre o valor de cada aplicação confirmada, incluindo reinvestimentos e Credcofre; alternativa sobre os rendimentos. Níveis 10%, 3% e 2%, sem compressão: um nível inelegível não transfere sua comissão. Beneficiário precisa ser participante ativo com aplicação vigente. Essas escolhas aguardam revisão administrativa porque o usuário não definiu a base.
- Salário inicial por **indicados diretos**, opção de rede inteira no painel. Ativo = conta ativa com aplicação vigente. Maior faixa elegível no processamento, um pagamento por mês civil; não há complemento automático por promoção no mesmo mês. Bronze R$75 (5/10), Prata R$150 (10/25), Ouro R$350 (20/50), Diamante R$850 (35/100). Contagem e calendário são decisões operacionais explicitadas, ainda sujeitas à definição da empresa.
- Cada reinvestimento com saldo de rendimentos nos planos Ciclo ou Rendimento Diário libera um giro. CredCofre e ativações de indicados não geram giros. Giros antigos fora dessa regra ficam cancelados; resultados já utilizados permanecem no histórico. Prêmios e probabilidades aguardam cadastro; nenhum prêmio foi inventado.
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

Os cartões e a confirmação exibem a ocupação atual. A confirmação calcula a projeção conforme o valor informado, usando o mesmo arredondamento diário do extrato. O total do período soma os rendimentos diários e o capital devolvido quando aplicável; não representa um crédito único no vencimento. As aplicações exibem dias restantes, vencimento e retorno conforme as condições contratadas. Exemplo: R$55 no Cred-c1 = R$3,30/dia, R$99 em rendimentos em 30 dias e R$55 de capital, total bruto de R$154. O Credcofre não apresenta total final fixo.

As novas condições dos ciclos valem para novas contratações. Contratos existentes continuam usando a taxa, duração e capital registrados na contratação. Os identificadores internos C-1/C-2/C-3 são preservados para manter histórico e limites.

Participantes: busca, edição de nome/usuário/e-mail/chave PIX, saldos e histórico financeiro; redefinição administrativa de senha com encerramento de sessões e auditoria sem senha. Cadastro e troca de senha aceitam 8 a 128 caracteres. O grupo de WhatsApp é configurado em Atendimento e seu link é apresentado aos participantes autenticados.

## Carteiras e saques

- Carteira de Saldo (`deposit`): depósitos PIX e créditos administrativos para compras de pacotes, sem saque.
- Carteira de Rendimentos (`earnings`): indicações, bônus, salários, roleta e rendimentos de todos os planos, inclusive Credcofre. Reinvestimentos com ganhos continuam permitidos.
- Credcofre (`vault`): guarda apenas capital aplicado. Resgatar devolve o principal à carteira de origem; capital depositado continua não sacável. A devolução de principal dos ciclos e NEX segue a mesma regra.
- Solicitar e aprovar um saque exige conta ativa e pacote ativo não vencido. Só `earnings` é aceito; permanecem a taxa de 10% e a janela de segunda a sexta, 12h–18h de Brasília. Recusar libera a reserva mesmo sem pacote ativo.

A migração `walletPolicyVersion=1` preserva lançamentos históricos e saques pagos. Reconstrói a origem do capital por compra/devolução, adiciona transferências auditadas do principal remanescente para Saldo e move ganhos antigos do Credcofre para Rendimentos. Em saldos históricos mistos, débitos comuns consomem ganhos primeiro; reinvestimentos consomem o principal restrito primeiro, preservando sua origem no contrato. Reservas antigas do Credcofre ou incompatíveis com o capital restrito são recusadas e devolvidas para nova solicitação. A migração executa uma vez dentro da transação do banco.
