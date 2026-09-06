import test from 'node:test'
import assert from 'node:assert/strict'
import {deleteParticipant} from '../server/accounts.js'
import {emptyDb,entry,type Account,type Db} from '../server/engine.js'

function fixture() {
  const db=emptyDb()
  const user:Account={id:'member',name:'Participante',username:'member',email:'member@test.local',passwordHash:'hash',role:'ASSOCIATE',status:'ACTIVE',sponsorId:'admin',inviteCode:'member'}
  db.users.push({...user,id:'admin',role:'ADMIN_MASTER'},user,{...user,id:'child',sponsorId:'member'})
  db.sessions={one:{userId:'member',expires:Date.now()+10000},two:{userId:'member',expires:Date.now()+10000},other:{userId:'child',expires:Date.now()+10000}}
  return db
}
test('exclusão remove cadastro e sessões, preserva histórico e não comprime indicações',()=>{
  const db=fixture()
  entry(db,'member','deposit',4000,'deposit:paid','Depósito')
  entry(db,'member','deposit',-4000,'spent','Aplicação')
  db.deposits.push({id:'paid',userId:'member',status:'PAID'})
  db.spins.push({id:'available',userId:'member',status:'AVAILABLE'},{id:'used',userId:'member',status:'USED'})
  const ledger=structuredClone(db.ledger),deposits=structuredClone(db.deposits)
  deleteParticipant(db,'admin','member')
  assert.equal(db.users.some(u=>u.id==='member'),false)
  assert.deepEqual(Object.keys(db.sessions),['other'])
  assert.equal(db.users.find(u=>u.id==='child')?.sponsorId,null)
  assert.deepEqual(db.ledger,ledger);assert.deepEqual(db.deposits,deposits)
  assert.deepEqual(db.spins.map(s=>s.id),['used'])
  assert.equal(db.audit.at(-1).action,'USER_DELETED')
  assert.throws(()=>deleteParticipant(db,'admin','member'),{status:404})
})
test('exclusão protege administradores e exige autorização',()=>{
  for(const [actor,target] of [['admin','admin'],['member','child'],['missing','member']]) {
    const db=fixture(),before=structuredClone(db)
    assert.throws(()=>deleteParticipant(db,actor,target),{status:403});assert.deepEqual(db,before)
  }
})
test('pendências financeiras impedem exclusão sem alterar dados',()=>{
  const cases:((db:Db)=>void)[]=[
    ...(['deposit','earnings','vault'] as const).map(wallet=>(db:Db)=>{entry(db,'member',wallet,1,'balance','Saldo')}),
    db=>{db.contracts.push({id:'contract',userId:'member',planId:'C-1',principal:2500,bps:800,days:35,paidDays:0,startedAt:new Date().toISOString(),status:'ACTIVE',returnPrincipal:true,commissionBase:'deposit'})},
    db=>{db.withdrawals.push({userId:'member',status:'PENDING'})},
    ...['CREATING','PENDING','REVIEW_REQUIRED'].map(status=>(db:Db)=>{db.deposits.push({userId:'member',status})}),
  ]
  for(const prepare of cases){const db=fixture();prepare(db);const before=structuredClone(db);assert.throws(()=>deleteParticipant(db,'admin','member'),{status:409});assert.deepEqual(db,before)}
})
test('participante bloqueado também pode ser excluído',()=>{
  const db=fixture();db.users.find(u=>u.id==='member')!.status='BLOCKED'
  assert.deepEqual(deleteParticipant(db,'admin','member'),{ok:true})
})
