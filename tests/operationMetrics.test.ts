import test from 'node:test'
import assert from 'node:assert/strict'
import {operationDay,operationMetrics} from '../src/operationMetrics'

test('daily overview uses Sao Paulo dates, confirmation and settlement rather than request dates',()=>{
  assert.equal(operationDay('2026-09-07T02:59:59Z'),'2026-09-06')
  assert.equal(operationDay('2026-09-07T03:00:00Z'),'2026-09-07')
  const m=operationMetrics({users:[{id:'admin',role:'ADMIN_MASTER'},{id:'a',role:'ASSOCIATE',status:'ACTIVE'},{id:'b',role:'ASSOCIATE',status:'BLOCKED'},{id:'old',role:'ASSOCIATE'}],audit:[{actor:'a',action:'REGISTER',at:'2026-09-06T18:00:00Z'},{actor:'b',action:'REGISTER',at:'2026-09-06T18:00:00Z'}],deposits:[{id:'d',status:'PAID',cents:4000,confirmedAt:'2026-09-07T02:00:00Z'},{id:'old',status:'PAID',cents:1000},{status:'PENDING',cents:9000}],withdrawals:[{status:'PAID',cents:1000,net:900,processedAt:'2026-09-06T18:00:00Z',at:'2026-09-05T18:00:00Z'},{status:'PENDING',net:500},{status:'REJECTED',net:500}],ledger:[{key:'admin-credit:x',cents:50000,at:'2026-09-06T18:00:00Z'}],contracts:[]},new Date('2026-09-06T20:00:00Z'))
  assert.equal(m.todayPeople,2);assert.equal(m.totalPeople,3);assert.equal(m.todayActive,1)
  assert.equal(m.todayIn,4000);assert.equal(m.totalIn,5000);assert.equal(m.todayOut,900)
  assert.equal(m.pendingOut,500);assert.equal(m.unknownUsers,1);assert.equal(m.unknownPayments,1)
})

test('legacy deposit recovers its actual credit date from the ledger',()=>{
  const m=operationMetrics({users:[],audit:[],contracts:[],withdrawals:[],deposits:[{id:'d',status:'PAID',cents:1234}],ledger:[{key:'deposit:d',at:'2026-09-06T12:00:00Z'}]},new Date('2026-09-06T20:00:00Z'))
  assert.equal(m.todayIn,1234);assert.equal(m.unknownPayments,0)
})
