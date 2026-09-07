import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyDb,entry,balance,subscribe,accrue,redeem,withdraw,settleWithdrawal,migrateWalletPolicy,canWithdraw} from '../server/engine.js'
import {DAY} from '../src/rules.js'
const at=new Date('2026-09-07T15:00:00Z')
function fixture(){const db=emptyDb();db.rules.confirmed=true;db.users.push({id:'u',name:'User',username:'user',email:'u@test.local',passwordHash:'',role:'ASSOCIATE',status:'ACTIVE',sponsorId:null,inviteCode:'u'});entry(db,'u','deposit',10000,'deposit','Depósito');return db}

test('depósito não é sacável e saque de ganhos exige pacote ativo e não vencido',()=>{
 const db=fixture();entry(db,'u','earnings',1000,'bonus','Bonificação')
 for(const wallet of ['deposit','vault'] as const)assert.throws(()=>withdraw(db,'u',wallet,100,'pix',at),/Somente/)
 assert.throws(()=>withdraw(db,'u','earnings',100,'pix',at),/pacote ativo/)
 const c=subscribe(db,'u','C-1',2500,'deposit',at)
 const w=withdraw(db,'u','earnings',900,'pix',at)
 assert.equal(w.fee,90);assert.equal(w.net,810);assert.equal(balance(db,'u','deposit'),7500)
 assert.throws(()=>withdraw(db,'u','earnings',200,'pix',at),/Saldo insuficiente/)
 assert.equal(canWithdraw(db,'u',new Date(+at+30*DAY)),false)
 assert.throws(()=>settleWithdrawal(db,w.id,'PAID','receipt',new Date(+at+30*DAY)),/pacote ativo/)
 c.status='CLOSED'
 assert.throws(()=>settleWithdrawal(db,w.id,'PAID','receipt',at),/pacote ativo/)
 settleWithdrawal(db,w.id,'REJECTED','expired',at)
 assert.equal(balance(db,'u','earnings'),1000)
 assert.throws(()=>settleWithdrawal(db,w.id,'REJECTED','again',at))
})

test('reinvestimento com ganhos preserva a origem do capital e capital depositado não vira rendimento',()=>{
 const db=fixture();entry(db,'u','earnings',2500,'bonus','Bônus')
 subscribe(db,'u','C-1',2500,'earnings',at)
 subscribe(db,'u','C-1',2500,'deposit',at)
 accrue(db,new Date(+at+30*DAY))
 assert.equal(balance(db,'u','deposit'),10000)
 assert.equal(balance(db,'u','earnings'),11500)
 assert.equal(canWithdraw(db,'u',new Date(+at+30*DAY)),false)
 const rows=db.ledger.length;accrue(db,new Date(+at+31*DAY));assert.equal(db.ledger.length,rows)
})

test('Credcofre de rendimentos devolve ganhos, mas encerramento do último pacote bloqueia saque',()=>{
 const db=fixture();entry(db,'u','earnings',2500,'bonus','Bônus')
 const c=subscribe(db,'u','CREDCOFRE',2500,'earnings',at)
 redeem(db,'u',c.id,new Date(+at+DAY))
 assert.equal(balance(db,'u','earnings'),2550);assert.equal(balance(db,'u','vault'),0)
 assert.equal(balance(db,'u','deposit'),10000)
 assert.throws(()=>withdraw(db,'u','earnings',2500,'pix',new Date(+at+DAY)),/pacote ativo/)
})

test('migração de capital legado preserva total, corrige reservas incompatíveis e não duplica ajustes',()=>{
 const db=fixture();const c=subscribe(db,'u','C-1',2500,'deposit',at);c.status='CLOSED'
 entry(db,'u','earnings',2500,`${c.id}:return`,'Capital antigo')
 entry(db,'u','earnings',500,'old-bonus','Bônus antigo')
 entry(db,'u','earnings',-2000,'old-withdraw:reserve','Reserva antiga')
 db.withdrawals.push({id:'old-withdraw',userId:'u',wallet:'earnings',cents:2000,status:'PENDING'})
 delete db.walletPolicyVersion
 const before=db.ledger.slice();migrateWalletPolicy(db)
 assert.equal(db.withdrawals[0].status,'REJECTED')
 assert.equal(balance(db,'u','deposit'),10000);assert.equal(balance(db,'u','earnings'),500)
 assert.deepEqual(db.ledger.slice(0,before.length),before)
 const migrated=structuredClone(db);migrateWalletPolicy(db);assert.deepEqual(db,migrated)
})

test('migração separa ganhos antigos do cofre e conserva capital ativo',()=>{
 const db=fixture();subscribe(db,'u','CREDCOFRE',2500,'deposit',at)
 entry(db,'u','vault',50,'old-vault-yield','Rendimento antigo')
 delete db.walletPolicyVersion;migrateWalletPolicy(db)
 assert.equal(balance(db,'u','vault'),2500);assert.equal(balance(db,'u','earnings'),50)
 const c=db.contracts[0];redeem(db,'u',c.id,at)
 assert.equal(balance(db,'u','deposit'),10000);assert.equal(balance(db,'u','vault'),0)
})

test('migração acompanha origem em capital legado reinvestido e saque já recusado',()=>{
 const db=fixture();const c=subscribe(db,'u','C-1',2500,'deposit',at);c.status='CLOSED'
 entry(db,'u','earnings',2500,`${c.id}:return`,'Capital antigo')
 entry(db,'u','earnings',-1000,'rejected:reserve','Reserva antiga')
 entry(db,'u','earnings',1000,'rejected:refund','Recusa antiga')
 db.withdrawals.push({id:'rejected',userId:'u',wallet:'earnings',cents:1000,status:'REJECTED'})
 const reinvest=subscribe(db,'u','C-1',2500,'earnings',at)
 delete db.walletPolicyVersion;migrateWalletPolicy(db)
 assert.equal(reinvest.balancePrincipal,2500)
 accrue(db,new Date(+at+30*DAY))
 assert.equal(balance(db,'u','deposit'),10000);assert.equal(balance(db,'u','earnings'),4500)
})
