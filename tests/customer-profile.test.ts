import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyDb,type Account} from '../server/engine.js'
import {completePaymentProfile} from '../server/customer-profile.js'
test('primeiro PIX exige dados reais do pagador e preenche perfil após validação',()=>{
  const db=emptyDb(),user:Account={id:'phone',phone:'+5511999991234',name:'Participante',username:'phone',email:'',passwordHash:'hash',role:'ASSOCIATE',status:'ACTIVE',sponsorId:null,inviteCode:'ref123'}
  db.users.push(user)
  assert.throws(()=>completePaymentProfile(db,user,{}),/nome completo/)
  assert.throws(()=>completePaymentProfile(db,user,{customerName:'Maria Silva',customerEmail:'inválido'}),/e-mail válido/)
  assert.equal(user.name,'Participante');assert.equal(user.email,'')
  completePaymentProfile(db,user,{customerName:' Maria Silva ',customerEmail:' MARIA@example.com '})
  assert.equal(user.name,'Maria Silva');assert.equal(user.email,'maria@example.com')
  completePaymentProfile(db,user,{})
  assert.equal(user.email,'maria@example.com')
})
