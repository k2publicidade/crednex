import type {Account,Db} from './engine.js'

export function customerEmail(db:Db,user:Account,value:unknown){
  if(typeof value!=='string')throw new Error('Informe um e-mail válido')
  const email=value.trim().toLowerCase()
  if(email.length>254||!/^\S+@\S+\.\S+$/.test(email))throw new Error('Informe um e-mail válido')
  if(db.users.some(u=>u.id!==user.id&&u.email.toLowerCase()===email))throw new Error('E-mail já cadastrado')
  return email
}
export function completePaymentProfile(db:Db,user:Account,values:Record<string,unknown>){
  if(!user.phone||user.email)return
  const name=values.customerName
  if(typeof name!=='string'||name.trim().length<2||name.trim().length>100)throw new Error('Informe o nome completo do pagador')
  const email=customerEmail(db,user,values.customerEmail)
  user.name=name.trim();user.email=email
}
