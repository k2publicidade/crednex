import {amount} from '../src/rules.js'
import {audit,entry,type Db} from './engine.js'

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
  const credited=entry(db,deposit.userId,'deposit',deposit.cents,`deposit:${deposit.id}`,'Depósito PIX aprovado pelo administrador')
  deposit.status='PAID'
  deposit.confirmedAt??=new Date().toISOString()
  deposit.approvedBy=actor
  deposit.approvalReference=memo
  if(credited)audit(db,actor,'PIX_MANUALLY_APPROVED',{id:deposit.id,userId:deposit.userId,cents:deposit.cents,reference:memo})
  return {ok:true,credited}
}
export function addParticipantBalance(db:Db,actor:string,userId:string,body:Record<string,unknown>) {
  participant(db,userId)
  const cents=amount(body.amount),memo=reason(body.reason),requestId=body.requestId
  if(typeof requestId!=='string'||! /^[a-zA-Z0-9-]{16,80}$/.test(requestId))throw new Error('Identificador da operação inválido')
  const key=`admin-credit:${actor}:${requestId}`
  const previous=db.ledger.find(e=>e.key===key)
  const description=`Saldo adicionado pelo administrador: ${memo}`
  if(previous){
    if(previous.userId!==userId||previous.cents!==cents||previous.description!==description)throw new Error('Identificador já utilizado em outra operação')
    return {ok:true,credited:false}
  }
  entry(db,userId,'deposit',cents,key,description)
  audit(db,actor,'BALANCE_ADDED',{userId,cents,reason:memo,requestId})
  return {ok:true,credited:true}
}
