import {entry,audit,canWithdraw,type Db} from './engine.js'
import {amount} from '../src/rules.js'
import {validatePayout,type PixKeyType} from './pixpay-withdrawals.js'

export function claimPayout(db:Db,id:string,actor:string,_details?:{pixKeyType?:PixKeyType;customerDocument?:string}) {
  const w=db.withdrawals.find(w=>w.id===id)
  if(!w||w.status!=='PENDING'||w.payoutState)throw new Error('Saque já enviado ou indisponível. Confira a conciliação.')
  if(!canWithdraw(db,w.userId))throw new Error('O participante precisa ter pacote ativo para sacar')
  const input=validatePayout({withdrawalId:id,amountCents:w.net,pixKey:w.pixKey,pixKeyType:'cpf',customerDocument:w.customerDocument||w.pixKey})
  w.payoutState='SUBMITTING';w.payoutAt=new Date().toISOString();w.pixKeyType=input.pixKeyType
  audit(db,actor,'PAYOUT_SUBMITTED',{id})
  return input
}

export function applyPayout(db:Db,id:string,payload:any,webhook=false) {
  const w=db.withdrawals.find(w=>w.id===id)
  if(!w?.payoutState)throw new Error('Saque não enviado ao gateway')
  const providerId=payload?.transactionId
  if(typeof providerId!=='string'||!providerId)throw new Error('Identificador de saque inválido')
  if(webhook&&(payload.type!=='PAY_OUT'||String(payload.paymentMethod).toLowerCase()!=='pix'))throw new Error('Evento incompatível com saída PIX')
  if(w.providerId&&w.providerId!==providerId)throw new Error('Transação divergente')
  if(db.withdrawals.some(other=>other.id!==id&&other.providerId===providerId))throw new Error('Transação já associada a outro saque')
  if(amount(payload.amount)!==w.net)throw new Error('Valor divergente do saque enviado')
  const status=String(payload.status).toUpperCase()
  if(!['PENDING','PROCESSING','COMPLETED','FAILED'].includes(status))throw new Error('Situação de saque desconhecida')
  if(['PAID','REJECTED'].includes(w.status)) {
    if((w.status==='PAID'&&status==='FAILED')||(w.status==='REJECTED'&&status==='COMPLETED'))throw new Error('Confirmação contraditória: requer conciliação')
    return w
  }
  const net=status==='FAILED'?undefined:amount(payload.netAmount)
  if(net!==undefined&&net>w.net)throw new Error('Líquido do gateway inválido')
  w.providerId=providerId
  if(net!==undefined){w.gatewayNet=net;w.gatewayFee=w.net-net}
  // Only the authenticated callback finalizes or refunds the reservation.
  if(webhook&&status==='COMPLETED') {
    w.status='PAID';w.payoutState='COMPLETED';w.processedAt=new Date().toISOString();w.reference=providerId
    audit(db,'gateway','PAYOUT_COMPLETED',{id,providerId,net})
  } else if(webhook&&status==='FAILED') {
    entry(db,w.userId,w.wallet,w.cents,`${w.id}:refund`,'Saque PIX falhou: saldo devolvido')
    w.status='REJECTED';w.payoutState='FAILED';w.reference=providerId
    audit(db,'gateway','PAYOUT_FAILED',{id,providerId})
  } else w.payoutState='PROCESSING'
  return w
}

export function markPayoutUncertain(db:Db,id:string) {
  const w=db.withdrawals.find(w=>w.id===id)
  if(w&&w.status==='PENDING'&&w.payoutState==='SUBMITTING')w.payoutState='REVIEW_REQUIRED'
}
