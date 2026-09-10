import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyDb,entry,balance,settleWithdrawal} from '../server/engine.js'
import {claimPayout,applyPayout,markPayoutUncertain} from '../server/payouts.js'

function fixture(){
  const db=emptyDb()
  db.users.push({id:'u',role:'ASSOCIATE',status:'ACTIVE'} as any)
  db.contracts.push({userId:'u',status:'ACTIVE',startedAt:'2026-01-01',days:0} as any)
  entry(db,'u','earnings',4000,'credit','test')
  entry(db,'u','earnings',-4000,'w:reserve','test')
  db.withdrawals.push({id:'w',userId:'u',wallet:'earnings',cents:4000,net:3600,pixKey:'test@example.test',status:'PENDING'})
  return db
}
const details={pixKeyType:'email' as const,customerDocument:'12345678901'}
const event={transactionId:'p',amount:'36.00',netAmount:'33.00',type:'PAY_OUT',paymentMethod:'pix',status:'COMPLETED'}

test('uma reserva permite somente um envio; callback antes da resposta não regride nem duplica',()=>{
  const db=fixture()
  assert.equal(claimPayout(db,'w','admin',{...details,amountCents:1} as any).amountCents,3600)
  assert.throws(()=>claimPayout(db,'w','admin',details))
  assert.throws(()=>settleWithdrawal(db,'w','PAID','manual'))
  applyPayout(db,'w',event,true)
  applyPayout(db,'w',event,true)
  applyPayout(db,'w',{...event,status:'PENDING'})
  assert.equal(db.withdrawals[0].status,'PAID')
  assert.equal(db.withdrawals[0].gatewayNet,3300)
  assert.equal(db.audit.filter(a=>a.action==='PAYOUT_COMPLETED').length,1)
  assert.equal(balance(db,'u','earnings'),0)
})
test('timeout não libera saldo nem permite reenvio; falha confirmada estorna uma única vez',()=>{
  const db=fixture();claimPayout(db,'w','admin',details);markPayoutUncertain(db,'w')
  assert.equal(db.withdrawals[0].payoutState,'REVIEW_REQUIRED')
  assert.throws(()=>claimPayout(db,'w','admin',details))
  assert.equal(balance(db,'u','earnings'),0)
  applyPayout(db,'w',{...event,status:'FAILED'},true)
  applyPayout(db,'w',{...event,status:'FAILED'},true)
  assert.equal(balance(db,'u','earnings'),4000)
  assert.throws(()=>applyPayout(db,'w',event,true),/contraditória/)
})
test('callback não aceita entrada, valor incorreto ou troca de identificador',()=>{
  const db=fixture();claimPayout(db,'w','admin',details)
  assert.throws(()=>applyPayout(db,'w',{...event,type:'PAY_IN'},true))
  assert.throws(()=>applyPayout(db,'w',{...event,amount:'40.00'},true))
  applyPayout(db,'w',{...event,status:'PENDING'})
  assert.throws(()=>applyPayout(db,'w',{...event,transactionId:'different'},true))
  assert.equal(db.withdrawals[0].status,'PENDING')
})
