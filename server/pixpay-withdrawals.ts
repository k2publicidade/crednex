import {pixPayConfig,normalizeCustomerDocument} from './pixpay.js'

export type PixKeyType='cpf'|'cnpj'|'email'|'phone'|'evp'
export interface PayoutInput {
  withdrawalId:string
  amountCents:number
  pixKey:string
  pixKeyType:PixKeyType
  customerDocument:string
}

export function validatePayout(input:PayoutInput) {
  if(!input.withdrawalId||!Number.isSafeInteger(input.amountCents)||input.amountCents<=0)throw new Error('Saque inválido')
  if(typeof input.pixKey!=='string')throw new Error('Informe a chave PIX')
  let key=input.pixKey.trim()
  if(input.pixKeyType==='cpf'||input.pixKeyType==='cnpj')key=key.replace(/[.\-/\s]/g,'')
  if(input.pixKeyType==='phone') {
    key=key.replace(/[()\s-]/g,'')
    if(/^\d{10,11}$/.test(key))key='+55'+key
    else if(/^55\d{10,11}$/.test(key))key='+'+key
  }
  const valid={cpf:/^\d{11}$/,cnpj:/^\d{14}$/,email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/,phone:/^\+55\d{10,11}$/,evp:/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i}
  if(!valid[input.pixKeyType]?.test(key))throw new Error('Chave PIX incompatível com o tipo informado')
  if((input.pixKeyType==='cpf'||input.pixKeyType==='cnpj')&&!validDocument(key))throw new Error('Chave PIX com CPF/CNPJ inválido. Confira o tipo: telefone deve ser selecionado como Telefone.')
  const document=normalizeCustomerDocument(input.customerDocument)
  if(!validDocument(document))throw new Error('CPF/CNPJ do beneficiário inválido')
  if((input.pixKeyType==='cpf'||input.pixKeyType==='cnpj')&&key!==document)throw new Error('O documento do beneficiário deve corresponder à chave CPF/CNPJ')
  return {...input,pixKey:key,customerDocument:document}
}

export function validDocument(value:string) {
  if(!/^\d{11}$|^\d{14}$/.test(value)||/^(\d)\1+$/.test(value))return false
  const digit=(base:string,weights:number[])=>{
    const remainder=base.split('').reduce((sum,n,i)=>sum+Number(n)*weights[i],0)%11
    return remainder<2?0:11-remainder
  }
  const size=value.length-2
  const weights=value.length===11?[10,9,8,7,6,5,4,3,2]:[5,4,3,2,9,8,7,6,5,4,3,2]
  const second=value.length===11?[11,...weights]:[6,...weights]
  return digit(value.slice(0,size),weights)===Number(value[size])&&digit(value.slice(0,size+1),second)===Number(value[size+1])
}

// The documented API does not promise idempotency or a lookup endpoint.
// Call only after committing an exclusive submission claim. Never retry an
// uncertain HTTP result automatically: the transfer may already exist.
export async function createPixPayWithdrawal(input:PayoutInput) {
  const checked=validatePayout(input),config=pixPayConfig()
  const callback=new URL(config.webhookUrl)
  callback.pathname='/api/webhooks/2pp/withdrawals'
  callback.searchParams.set('withdrawalId',checked.withdrawalId)
  const response=await fetch(`${config.baseUrl}/api/v1/withdrawals/pix`,{
    method:'POST',
    headers:{'X-API-Key':config.apiKey,'X-API-Secret':config.apiSecret,'Content-Type':'application/json'},
    body:JSON.stringify({amount:checked.amountCents/100,pixKey:checked.pixKey,pixKeyType:checked.pixKeyType,customerDocument:checked.customerDocument,webhookUrl:callback.toString()}),
    signal:AbortSignal.timeout(15000),
  })
  const payload=await response.json() as any
  if(!response.ok||payload?.status!=='success')throw new Error('Envio não confirmado pela 2PP. Confira a transação no gateway antes de tentar novamente.')
  const data=payload.data
  if(typeof data?.transactionId!=='string'||!data.transactionId.trim())throw new Error('2PP não retornou o identificador do saque. Requer conciliação.')
  return data as {transactionId:string;amount:string;netAmount:string;systemFee?:string;gatewayFee?:string;status:string}
}
