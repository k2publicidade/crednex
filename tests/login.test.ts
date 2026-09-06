import test from 'node:test'
import assert from 'node:assert/strict'
import {loginIdentity} from '../src/login.js'

test('login principal aceita administrador por usuário e participante por telefone',()=>{
  assert.deepEqual(loginIdentity('admin'),{username:'admin'})
  assert.deepEqual(loginIdentity(' Admin '),{username:'admin'})
  assert.deepEqual(loginIdentity('operador.master'),{username:'operador.master'})
  assert.deepEqual(loginIdentity('(11) 99999-1234'),{phone:'+5511999991234'})
  assert.deepEqual(loginIdentity('+55 11 99999-1234'),{phone:'+5511999991234'})
  assert.throws(()=>loginIdentity(''),/telefone ou usuário/)
})
