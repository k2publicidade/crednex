import test from 'node:test'
import assert from 'node:assert/strict'
import {validatePayout,validDocument} from '../server/pixpay-withdrawals.js'
const base={withdrawalId:'test',amountCents:3600,customerDocument:'529.982.247-25'}
test('CPF e CNPJ validam dígitos e rejeitam sequências repetidas',()=>{
  for(const doc of ['52998224725','11222333000181'])assert.equal(validDocument(doc),true)
  for(const doc of ['73998692062','52998224724','11222333000182','00000000000','11111111111111'])assert.equal(validDocument(doc),false)
  assert.throws(()=>validatePayout({...base,pixKey:'73998692062',pixKeyType:'cpf'}),/inválido/)
  assert.equal(validatePayout({...base,pixKey:'529.982.247-25',pixKeyType:'cpf'}).pixKey,'52998224725')
  assert.throws(()=>validatePayout({...base,pixKey:'test@example.test',pixKeyType:'email',customerDocument:'12345678901'}),/beneficiário inválido/)
})
test('telefone normaliza DDD e país sem adivinhar o tipo da chave',()=>{
  for(const key of ['(73) 99869-2062','73998692062','5573998692062','+55 73 99869-2062'])assert.equal(validatePayout({...base,pixKey:key,pixKeyType:'phone'}).pixKey,'+5573998692062')
  assert.throws(()=>validatePayout({...base,pixKey:'73998692062',pixKeyType:'' as any}),/tipo/)
  assert.throws(()=>validatePayout({...base,pixKey:'abc73998692062',pixKeyType:'phone'}),/tipo/)
})
