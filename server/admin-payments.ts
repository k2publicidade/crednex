import {amount} from '../src/rules.js'
import {audit,entry,type Db} from './engine.js'
import {depositWallet} from './payments.js'

function participant(db:Db,userId:string) {
  const user=db.users.find(u=>u.id===userId&&u.role==='ASSOCIATE'&&u.status==='ACTIVE')
  if(!user)throw new Error('Participante ativo não encontrado')
  return user
}
function reason(value:unknown) {
  if(typeof value!=='string'||value.trim().length<3||value.trim().length>500)throw new Error('Informe uma referência ou motivo de 3 a 500 caracteres')
  return value.trim()
}
export function approveDeposit(db:Db,actor:string,depositId:string,reference:unknown) {
  const deposit=db.deposits.find(d=>d.id===depositId)
  if(!deposit)throw new Error('Depósito não encontrado')
  if(deposit.status==='PAID')return {ok:true,credited:false}
  if(!['PENDING','REVIEW_REQUIRED'].includes(deposit.status))throw new Error('Depósito ainda não disponível para aprovação')
  participant(db,deposit.userId)
  const memo=reason(reference)
  if(!Number.isSafeInteger(deposit.cents)||deposit.cents<=0)throw new Error('Valor do depósito inválido')
  const wallet=depositWallet(deposit.wallet)
  const credited=entry(db,deposit.userId,wallet,deposit.cents,`deposit:${deposit.id}`,wallet==='earnings'?'Depósito PIX aprovado em Rendimentos':'Depósito PIX aprovado em Saldo')
  deposit.status='PAID'
  deposit.confirmedAt??=new Date().toISOString()
  deposit.approvedBy=actor
  deposit.approvalReference=memo
  if(credited)audit(db,actor,'PIX_MANUALLY_APPROVED',{id:deposit.id,userId:deposit.userId,cents:deposit.cents,wallet,reference:memo})
  return {ok:true,credited}
}
export function addParticipantBalance(db:Db,actor:string,userId:string,body:Record<string,unknown>) {
  participant(db,userId)
  const cents=amount(body.amount),memo=reason(body.reason),requestId=body.requestId,wallet=depositWallet(body.wallet)
  if(typeof requestId!=='string'||! /^[a-zA-Z0-9-]{16,80}$/.test(requestId))throw new Error('Identificador da operação inválido')
  const key=`admin-credit:${actor}:${requestId}`
  const previous=db.ledger.find(e=>e.key===key)
  const description=`Saldo adicionado pelo administrador em ${wallet==='earnings'?'Rendimentos':'Saldo'}: ${memo}`
  if(previous){
    if(previous.userId!==userId||previous.cents!==cents||previous.description!==description)throw new Error('Identificador já utilizado em outra operação')
    return {ok:true,credited:false}
  }
  entry(db,userId,wallet,cents,key,description)
  audit(db,actor,'BALANCE_ADDED',{userId,cents,wallet,reason:memo,requestId})
  return {ok:true,credited:true}
}
