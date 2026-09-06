import {normalizePhone} from './phone'

export function loginIdentity(value:unknown):{phone:string}|{username:string}{
  const text=typeof value==='string'?value.trim():''
  if(!text)throw new Error('Informe seu telefone ou usuário')
  if(/^[+\d\s().-]+$/.test(text))return {phone:normalizePhone(text)}
  return {username:text.toLowerCase()}
}
