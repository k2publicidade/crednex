import {audit,balance,type Db} from './engine.js'

export function deleteParticipant(db:Db,adminId:string,userId:string) {
  if(!db.users.some(u=>u.id===adminId&&u.role==='ADMIN_MASTER'&&u.status==='ACTIVE'))
    throw Object.assign(new Error('Acesso restrito'),{status:403})
  const user=db.users.find(u=>u.id===userId)
  if(!user)throw Object.assign(new Error('Participante não encontrado'),{status:404})
  if(user.role==='ADMIN_MASTER')throw Object.assign(new Error('Contas administrativas não podem ser excluídas'),{status:403})
  if((['deposit','earnings','vault'] as const).some(wallet=>balance(db,userId,wallet)!==0)
    ||db.contracts.some(c=>c.userId===userId&&c.status==='ACTIVE')
    ||db.withdrawals.some(w=>w.userId===userId&&w.status==='PENDING')
    ||db.deposits.some(d=>d.userId===userId&&d.status!=='PAID'))
    throw Object.assign(new Error('Resolva os saldos, aplicações ativas e depósitos ou saques pendentes antes de excluir esta conta.'),{status:409})
  // Preserve financial records and referral levels: do not move descendants up a level.
  db.users=db.users.filter(u=>u.id!==userId)
  for(const [key,session] of Object.entries(db.sessions))if(session.userId===userId)delete db.sessions[key]
  for(const child of db.users)if(child.sponsorId===userId)child.sponsorId=null
  db.spins=db.spins.filter(s=>s.userId!==userId||s.status!=='AVAILABLE')
  audit(db,adminId,'USER_DELETED',{userId})
  return {ok:true}
}
