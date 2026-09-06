import {audit,balance,type Db} from './engine.js'
import {hash} from './passwords.js'
import {validPassword} from '../src/security.js'
import {normalizePhone} from '../src/phone.js'

function editableParticipant(db:Db,adminId:string,userId:string){
  if(!db.users.some(u=>u.id===adminId&&u.role==='ADMIN_MASTER'&&u.status==='ACTIVE'))throw Object.assign(new Error('Acesso restrito'),{status:403})
  const user=db.users.find(u=>u.id===userId)
  if(!user)throw Object.assign(new Error('Participante não encontrado'),{status:404})
  if(user.role!=='ASSOCIATE')throw Object.assign(new Error('Use Meu perfil para editar a conta administrativa'),{status:403})
  return user
}
export function updateParticipant(db:Db,adminId:string,userId:string,values:Record<string,unknown>){
  const user=editableParticipant(db,adminId,userId),changes:Record<string,string>={}
  for(const key of Object.keys(values)){
    if(!['name','username','email','phone','pixKey','status'].includes(key))throw new Error('Campo de cadastro inválido')
    if(typeof values[key]!=='string')throw new Error('Dados do cadastro inválidos')
    changes[key]=(values[key] as string).trim()
  }
  if(!Object.keys(changes).length)throw new Error('Informe os dados para alterar')
  if('name' in changes&&(changes.name.length<2||changes.name.length>100))throw new Error('Nome deve ter entre 2 e 100 caracteres')
  if('username' in changes){changes.username=changes.username.toLowerCase();if(!/^[a-z0-9._-]{3,40}$/.test(changes.username))throw new Error('Usuário deve ter de 3 a 40 caracteres, sem espaços')}
  if('phone' in changes){
    if(changes.phone)changes.phone=normalizePhone(changes.phone)
    else if(user.phone)throw new Error('Informe o telefone de acesso do participante')
  }
  if('email' in changes){changes.email=changes.email.toLowerCase();if(changes.email.length>254||(!changes.email?!(changes.phone||user.phone):!/^\S+@\S+\.\S+$/.test(changes.email)))throw new Error('E-mail inválido')}
  if('pixKey' in changes&&changes.pixKey.length>150)throw new Error('Chave PIX muito longa')
  if('status' in changes&&!['ACTIVE','BLOCKED'].includes(changes.status))throw new Error('Situação inválida')
  if(db.users.some(u=>u.id!==userId&&((changes.username&&u.username.toLowerCase()===changes.username)||(changes.email&&u.email.toLowerCase()===changes.email)||(changes.phone&&u.phone===changes.phone))))throw new Error('Usuário, telefone ou e-mail já cadastrado')
  Object.assign(user,changes)
  if(changes.status==='BLOCKED')for(const [key,s] of Object.entries(db.sessions))if(s.userId===userId)delete db.sessions[key]
  audit(db,adminId,'USER_UPDATED',{userId,fields:Object.keys(changes)})
  const {passwordHash,...safe}=user
  return safe
}
export function resetParticipantPassword(db:Db,adminId:string,userId:string,password:unknown,confirmation:unknown){
  const user=editableParticipant(db,adminId,userId)
  if(!validPassword(password))throw new Error('Use uma senha de 8 a 128 caracteres')
  if(password!==confirmation)throw new Error('As senhas não conferem')
  user.passwordHash=hash(password)
  for(const [key,s] of Object.entries(db.sessions))if(s.userId===userId)delete db.sessions[key]
  audit(db,adminId,'USER_PASSWORD_RESET',{userId})
  return {ok:true}
}

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
