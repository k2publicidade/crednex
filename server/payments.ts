import {amount,type Wallet} from '../src/rules.js'
import {entry,audit,type Db} from './engine.js'
import type {PixPayTransaction} from './pixpay.js'

export function depositWallet(value:unknown):Extract<Wallet,'deposit'|'earnings'> {
  if(value===undefined||value==='deposit')return 'deposit'
  if(value==='earnings')return 'earnings'
  throw new Error('Carteira de destino inválida')
}

// Called only after authenticating the webhook. A local reference allows the
// callback to arrive while the gateway's creation request is still in flight.
export function confirmDeposit(db:Db,body:unknown,reference?:string) {
  if(!body||typeof body!=='object')throw new Error('Evento de pagamento inválido')
  const envelope=body as Record<string,any>, payload=envelope.data??envelope
  if(!payload||typeof payload!=='object')throw new Error('Evento de pagamento inválido')
  const providerId=String(payload.transactionId||payload.id||payload.txid||'').trim()
  if(!providerId)throw new Error('Identificador de transação ausente')
  if(payload.type==='PAY_OUT'||(payload.paymentMethod&&String(payload.paymentMethod).toLowerCase()!=='pix'))throw new Error('Evento incompatível com depósito PIX')
  const matched=db.deposits.find(d=>d.providerId===providerId)
  const referenced=reference?db.deposits.find(d=>d.id===reference):undefined
  if(reference&&!referenced)throw new Error('Referência de cobrança inválida')
  if(matched&&referenced&&matched.id!==referenced.id)throw new Error('Referência diverge da transação')
  const deposit=matched??referenced
  if(!deposit)throw Object.assign(new Error('Cobrança não encontrada; tente novamente'),{status:409})
  if(deposit.providerId&&deposit.providerId!==providerId)throw new Error('Transação diverge da cobrança')
  if(String(payload.status).toUpperCase()!=='COMPLETED')return {ok:true,credited:false}
  if(amount(payload.amount)!==deposit.cents)throw new Error('Valor recebido diverge da cobrança')
  const wallet=depositWallet(deposit.wallet)
  const credited=entry(db,deposit.userId,wallet,deposit.cents,`deposit:${deposit.id}`,wallet==='earnings'?'Depósito PIX confirmado em Rendimentos':'Depósito PIX confirmado em Saldo')
  deposit.providerId=providerId
  deposit.status='PAID'
  deposit.confirmedAt??=new Date().toISOString()
  if(credited)audit(db,'gateway','PIX_CONFIRMED',{id:deposit.id,wallet})
  return {ok:true,credited}
}

export function attachPayment(db:Db,depositId:string,payment:PixPayTransaction) {
  const deposit=db.deposits.find(d=>d.id===depositId)
  if(!deposit)throw new Error('Cobrança local não encontrada')
  if(deposit.providerId&&deposit.providerId!==payment.id)throw new Error('Transação diverge da confirmação recebida')
  if(db.deposits.some(d=>d.id!==depositId&&d.providerId===payment.id))throw new Error('Transação já vinculada a outra cobrança')
  Object.assign(deposit,{providerId:payment.id,qrCode:payment.qrCode,status:deposit.status==='PAID'?'PAID':'PENDING'})
  return deposit
}

export function reviewStaleDeposits(db:Db,now=Date.now()) {
  for(const deposit of db.deposits) {
    if(deposit.status==='CREATING'&&now-Date.parse(deposit.at)>120_000)deposit.status='REVIEW_REQUIRED'
  }
}
