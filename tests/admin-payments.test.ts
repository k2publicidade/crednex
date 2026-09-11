import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyDb,balance} from '../server/engine.js'
import {approveDeposit,addParticipantBalance} from '../server/admin-payments.js'
import {confirmDeposit} from '../server/payments.js'

function fixture(){
  const db=emptyDb()
  db.users.push({id:'member',name:'Participante',username:'member',email:'member@test.local',passwordHash:'unused',role:'ASSOCIATE',status:'ACTIVE',sponsorId:null,inviteCode:'member1'})
  db.deposits.push({id:'pix',userId:'member',cents:4000,status:'REVIEW_REQUIRED',providerId:'gateway',at:new Date().toISOString()})
  return db
}
test('aprovação e saldo funcionam com regras de aplicações ainda pendentes',()=>{
  const db=fixture()
  assert.equal(db.rules.confirmed,false)
  approveDeposit(db,'admin','pix','Recebimento conferido')
  addParticipantBalance(db,'admin','member',{amount:'10,25',reason:'Ajuste conferido',requestId:'credit-request-001'})
  assert.equal(balance(db,'member','deposit'),5025)
  assert.equal(db.rules.confirmed,false)
  assert.equal(db.audit[0].actor,'admin')
})
test('aprovação após webhook pago não duplica crédito',()=>{
  const db=fixture()
  confirmDeposit(db,{transactionId:'gateway',status:'COMPLETED',amount:'40.00'})
  assert.equal(approveDeposit(db,'admin','pix','Conferido').credited,false)
  assert.equal(db.ledger.length,1)
})
test('recusa créditos para conta bloqueada ou inexistente e depósitos em criação',()=>{
  const db=fixture(),body={amount:10,reason:'Ajuste conferido',requestId:'credit-request-001'}
  db.deposits[0].status='CREATING'
  assert.throws(()=>approveDeposit(db,'admin','pix','Conferido'))
  db.deposits[0].status='PENDING'
  db.users[0].status='BLOCKED'
  assert.throws(()=>approveDeposit(db,'admin','pix','Conferido'))
  assert.throws(()=>addParticipantBalance(db,'admin','member',body))
  assert.throws(()=>addParticipantBalance(db,'admin','missing',body))
  assert.equal(db.ledger.length,0)
})
test('administrador escolhe entre saldo para aplicar e rendimentos sacáveis',()=>{
 const db=fixture()
 addParticipantBalance(db,'admin','member',{amount:40,reason:'Crédito em rendimentos',wallet:'earnings',requestId:'credit-earnings-001'})
 assert.equal(balance(db,'member','earnings'),4000);assert.equal(balance(db,'member','deposit'),0)
 assert.throws(()=>addParticipantBalance(db,'admin','member',{amount:40,reason:'Destino indevido',wallet:'vault',requestId:'credit-invalid-001'}),/carteira de destino/i)
})
