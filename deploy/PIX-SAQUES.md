# Saques PIX 2PP

Contrato consultado no painel oficial autenticado em 10/09/2026:
https://2pp.online/dashboard/integration

O administrador analisa uma solicitação pendente e envia o pagamento pelo botão
“Enviar pagamento PIX pela 2PP”. Deve informar o tipo da chave e CPF/CNPJ do
beneficiário. Chaves de telefone devem usar +55. As tarifas da 2PP são descontadas
do participante, além dos 10% CREDNEX. O líquido efetivo é registrado em gatewayNet.

POST /api/admin/withdrawals/:id/pay é exclusivo do administrador principal.
O envio chama POST /api/v1/withdrawals/pix fora da transação do banco, após gravar
uma reserva exclusiva de envio. Cliques repetidos não repetem a transferência.

Callback: POST /api/webhooks/2pp/withdrawals?token=SEGREDO&withdrawalId=ID.
Usa a configuração existente APP_PUBLIC_URL e PIXPAY_WEBHOOK_TOKEN.
O callback exige PAY_OUT, pix, identificador e valor correspondentes.
COMPLETED conclui; FAILED devolve a reserva integral uma única vez.
Uma resposta de criação, mesmo COMPLETED, aguarda o callback autenticado.

Em timeout, resultado desconhecido ou interrupção do processo após a reserva de
envio, não reenviar nem recusar manualmente: consultar a 2PP. O contrato publicado
não documenta idempotência nem consulta de saques. A aplicação bloqueia novas
tentativas para evitar pagamento duplicado. Ausência de callback requer conciliação
com o provedor. SUBMITTING persistente também requer essa conferência.

Publicação: instalar o backend conforme deploy/README.md antes de liberar a nova
interface. Push na Vercel não atualiza o servidor Ubuntu da API. Verificar que POST
/api/admin/withdrawals/deployment-probe/pay sem sessão retorna 401 e que o callback
com token inválido retorna 401. Não enviar saques reais como teste automático.

Validação local: testes de adaptador com fetch simulado, callback antecipado,
repetições, conflito de identificadores/valores, timeout e estorno único.
Homologação financeira depende de envio real aprovado e confirmação no gateway.
