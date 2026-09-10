export const MIN_PASSWORD_LENGTH=8
export function validPassword(value:unknown):value is string {
  return typeof value==='string'&&value.length>=MIN_PASSWORD_LENGTH&&value.length<=128
}
export function normalizeCpf(value:unknown) {
  const cpf=String(value??'').replace(/\D/g,'')
  if(!/^\d{11}$/.test(cpf)||/^(\d)\1+$/.test(cpf))throw new Error('Informe um CPF válido')
  const digit=(base:string,weights:number[])=>{const remainder=base.split('').reduce((sum,n,i)=>sum+Number(n)*weights[i],0)%11;return remainder<2?0:11-remainder}
  if(digit(cpf.slice(0,9),[10,9,8,7,6,5,4,3,2])!==Number(cpf[9])||digit(cpf.slice(0,10),[11,10,9,8,7,6,5,4,3,2])!==Number(cpf[10]))throw new Error('Informe um CPF válido')
  return cpf
}
