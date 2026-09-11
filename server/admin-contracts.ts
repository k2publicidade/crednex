import {amount} from '../src/rules.js'
import {validatePlan} from '../src/catalog.js'
import {catalog} from './catalog.js'
import {accrue,audit,balance,entry,subscribe,returnCapital,type Db} from './engine.js'

function authorize(db:Db,actor:string,userId:string,reason:unknown){
 if(!db.users.some(u=>u.id===actor&&u.role==='ADMIN_MASTER'&&u.status==='ACTIVE'))throw Object.assign(new Error('Acesso restrito'),{status:403})
 if(!db.users.some(u=>u.id===userId&&u.role==='ASSOCIATE'))throw new Error('Participante não encontrado')
 if(typeof reason!=='string'||reason.trim().length<3||reason.length>500)throw new Error('Informe um motivo de 3 a 500 caracteres')
 return reason.trim()
}
export function assignContract(db:Db,actor:string,userId:string,body:Record<string,unknown>,at=new Date()){
 const reason=authorize(db,actor,userId,body.reason),cents=amount(body.amount)
 if(!['deposit','earnings','grant'].includes(String(body.source)))throw new Error('Origem inválida')
 if(typeof body.requestId!=='string'||! /^[a-zA-Z0-9-]{16,80}$/.test(body.requestId))throw new Error('Identificador inválido')
 const requestId=`admin-${body.requestId}`
 if(requestId.length>80)throw new Error('Identificador muito longo')
 const previous=db.audit.find(a=>a.action==='ADMIN_CONTRACT_CREATED'&&a.details.requestId===requestId)
 if(previous){if(previous.actor!==actor||previous.details.userId!==userId||previous.details.cents!==cents||previous.details.planId!==body.planId||previous.details.source!==body.source||previous.details.reason!==reason)throw new Error('Identificador já utilizado');return db.contracts.find(c=>c.id===previous.details.contractId)}
 accrue(db,at)
 if(body.source==='grant')entry(db,userId,'deposit',cents,`grant:${requestId}`,`Concessão administrativa de plano: ${reason}`,at.toISOString())
 const c=subscribe(db,userId,String(body.planId),cents,body.source==='earnings'?'earnings':'deposit',at,requestId)
 audit(db,actor,'ADMIN_CONTRACT_CREATED',{userId,contractId:c.id,planId:body.planId,cents,source:body.source,reason,requestId})
 return c
}
export function editContract(db:Db,actor:string,userId:string,contractId:string,body:Record<string,unknown>,at=new Date()){
 const reason=authorize(db,actor,userId,body.reason)
 if(!['edit','close'].includes(String(body.action)))throw new Error('Ação inválida')
 const c=db.contracts.find(c=>c.id===contractId&&c.userId===userId)
 if(!c)throw new Error('Aplicação não encontrada')
 const revision=db.audit.filter(a=>a.action==='ADMIN_CONTRACT_UPDATED'&&a.details.contractId===c.id).length
 if(body.revision!==revision)throw new Error('A aplicação foi alterada. Atualize a página e confira os dados')
 if(c.status!=='ACTIVE')throw new Error('Aplicação encerrada: inclua uma nova contratação')
 accrue(db,at)
 if(c.status!=='ACTIVE')throw new Error('O prazo terminou. Atualize a página antes de editar')
 const before=structuredClone(c),key=`admin-contract:${c.id}:${revision+1}`
 if(body.action==='close'){
  if(typeof body.refund!=='boolean')throw new Error('Informe se o capital deve ser devolvido')
  if(c.family==='vault'){
   if(body.refund)returnCapital(db,c,at)
   else entry(db,userId,'vault',-(c.compoundBalance??c.principal),`${key}:vault`,'Encerramento administrativo do cofre',at.toISOString())
  }else if(body.refund)returnCapital(db,c,at)
  c.status='CLOSED'
 }else{
  const p=catalog(db).find(p=>p.id===body.planId)
  if(!p)throw new Error('Plano não encontrado')
  const principal=amount(body.amount),bps=amount(body.rate),days=Number(body.days)
  validatePlan({...p,min:principal,max:principal,bps,days,returnPrincipal:body.returnPrincipal})
  if(days&&days<=c.paidDays)throw new Error(`Prazo deve superar os ${c.paidDays} dias já pagos`)
  const origin=db.ledger.find(e=>e.key===`${c.id}:purchase`)?.wallet
  if(origin!=='deposit'&&origin!=='earnings')throw new Error('Origem do capital não encontrada')
  const delta=principal-c.principal
  if(delta>balance(db,userId,origin))throw new Error('Saldo insuficiente na carteira de origem para aumentar a aplicação')
  let restricted=c.balancePrincipal??(origin==='deposit'?c.principal:0)
  if(delta>0){entry(db,userId,origin,-delta,`${key}:principal`,`Ajuste de capital da aplicação: ${reason}`,at.toISOString());if(origin==='deposit')restricted+=delta}
  if(delta<0){const refund=-delta,locked=Math.min(refund,restricted);if(locked)entry(db,userId,'deposit',locked,`${key}:deposit`,'Redução de capital: saldo devolvido',at.toISOString());if(refund>locked)entry(db,userId,'earnings',refund-locked,`${key}:earnings`,'Redução de capital: rendimentos devolvidos',at.toISOString());restricted-=locked}
  const vaultDelta=(p.family==='vault'?principal:0)-(c.family==='vault'?c.principal:0)
  if(vaultDelta)entry(db,userId,'vault',vaultDelta,`${key}:vault`,'Ajuste de capital no cofre',at.toISOString())
  Object.assign(c,{planId:p.id,planName:p.name,family:p.family,principal,balancePrincipal:restricted,bps,days,returnPrincipal:body.returnPrincipal})
 }
 audit(db,actor,'ADMIN_CONTRACT_UPDATED',{userId,contractId:c.id,reason,before,after:structuredClone(c),refund:body.action==='close'?body.refund:undefined})
 return c
}
