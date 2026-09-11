import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyDb,entry,balance,subscribe,accrue,redeem,withdraw,settleWithdrawal,migrateWalletPolicy,canWithdraw,withdrawalLimit} from '../server/engine.js'
import {DAY} from '../src/rules.js'
const at=new Date('2026-09-07T15:00:00Z')
function fixture(){const db=emptyDb();db.rules.confirmed=true;db.users.push({id:'u',name:'User',username:'user',email:'u@test.local',cpf:'52998224725',passwordHash:'',role:'ASSOCIATE',status:'ACTIVE',sponsorId:null,inviteCode:'u'});entry(db,'u','deposit',10000,'deposit','Depósito');return db}

test('depósito e rendimento de ciclo em andamento não são sacáveis; saque vem do saldo liberado',()=>{
 const db=fixture();entry(db,'u','earnings',10000,'bonus','Bonificação')
 for(const wallet of ['deposit','vault','locked'] as const)assert.throws(()=>withdraw(db,'u',wallet,100,'pix',at),/Somente/)
 const c=subscribe(db,'u','C-1',2500,'deposit',at)
 accrue(db,new Date(+at+DAY))
 assert.equal(balance(db,'u','locked'),200)
 const w=withdraw(db,'u','earnings',9000,'pix',at)
 assert.equal(w.fee,900);assert.equal(w.net,8100);assert.equal(w.fromEarnings,9000);assert.equal(w.fromCommission,0)
 assert.equal(balance(db,'u','deposit'),7500)
 assert.throws(()=>withdraw(db,'u','earnings',9000,'pix',at),/menor que o solicitado/)
 c.status='CLOSED'
 settleWithdrawal(db,w.id,'REJECTED','expired',at)
 assert.equal(balance(db,'u','earnings'),10000)
 assert.throws(()=>settleWithdrawal(db,w.id,'REJECTED','again',at))
})

test('no fim do ciclo o Investimento + Lucro é liberado e o saque é pago com a conta ativa',()=>{
 const db=fixture();const c=subscribe(db,'u','C-1',2500,'deposit',at)
 for(let d=1;d<=35;d++)accrue(db,new Date(+at+d*DAY))
 assert.equal(c.status,'CLOSED')
 assert.equal(balance(db,'u','locked'),0)
 assert.equal(balance(db,'u','earnings'),9500)
 assert.equal(canWithdraw(db,'u',new Date(+at+35*DAY)),true)
 const w=withdraw(db,'u','earnings',9500,'pix',new Date(+at+35*DAY))
 assert.equal(w.net,8550)
 settleWithdrawal(db,w.id,'PAID','comprovante-2pp-001',new Date(+at+35*DAY))
 assert.equal(db.withdrawals[0].status,'PAID')
})

test('lucro de indicação é sacável durante o ciclo, sem exigir pacote ativo',()=>{
 const db=fixture();entry(db,'u','commission',5000,'ind:level:1','Indicação nível 1')
 assert.equal(canWithdraw(db,'u',at),true)
 assert.equal(withdrawalLimit(db,'u',at),5000)
 const w=withdraw(db,'u','earnings',5000,'pix',at)
 assert.equal(w.fromEarnings,0);assert.equal(w.fromCommission,5000);assert.equal(w.net,4500)
 assert.equal(balance(db,'u','commission'),0)
 settleWithdrawal(db,w.id,'REJECTED','Chave incorreta',at)
 assert.equal(balance(db,'u','commission'),5000)
 assert.equal(balance(db,'u','earnings'),0)
})

test('reinvestimento com ganhos preserva a origem do capital e o lucro fica travado no ciclo',()=>{
 const db=fixture();entry(db,'u','earnings',2500,'bonus','Bônus')
 subscribe(db,'u','C-1',2500,'earnings',at)
 subscribe(db,'u','C-1',2500,'deposit',at)
 accrue(db,new Date(+at+30*DAY))
 assert.equal(balance(db,'u','deposit'),7500)
 assert.equal(balance(db,'u','earnings'),0)
 assert.equal(balance(db,'u','locked'),12000)
 assert.equal(canWithdraw(db,'u',new Date(+at+30*DAY)),false)
 accrue(db,new Date(+at+35*DAY))
 assert.equal(balance(db,'u','locked'),0)
 assert.equal(balance(db,'u','earnings'),19000)
})

test('resgate do Credcofre continua sacável mesmo ao encerrar o último pacote',()=>{
 const db=fixture();entry(db,'u','earnings',2500,'bonus','Bônus')
 const c=subscribe(db,'u','CREDCOFRE',2500,'earnings',at)
 redeem(db,'u',c.id,new Date(+at+DAY))
 assert.equal(balance(db,'u','earnings'),2550);assert.equal(balance(db,'u','vault'),0)
 assert.equal(balance(db,'u','deposit'),10000)
 db.rules.withdrawalMin=2500
 assert.equal(withdraw(db,'u','earnings',2500,'pix',new Date(+at+DAY)).net,2250)
})

test('bloqueio da conta impede pagar saque solicitado com resgate do Credcofre',()=>{
 const db=fixture(),c=subscribe(db,'u','CREDCOFRE',4000,'deposit',at)
 redeem(db,'u',c.id,new Date(+at+DAY));const w=withdraw(db,'u','earnings',4000,'pix',new Date(+at+DAY))
 db.users[0].status='BLOCKED'
 assert.throws(()=>settleWithdrawal(db,w.id,'PAID','receipt',new Date(+at+DAY)),/bloqueado|exige/i)
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

test('migração separa ganhos antigos do cofre e libera o resgate em rendimentos',()=>{
 const db=fixture();subscribe(db,'u','CREDCOFRE',2500,'deposit',at)
 entry(db,'u','vault',50,'old-vault-yield','Rendimento antigo')
 delete db.walletPolicyVersion;migrateWalletPolicy(db)
 assert.equal(balance(db,'u','vault'),2500);assert.equal(balance(db,'u','earnings'),50)
 const c=db.contracts[0];redeem(db,'u',c.id,at)
 assert.equal(balance(db,'u','deposit'),7500);assert.equal(balance(db,'u','earnings'),2550);assert.equal(balance(db,'u','vault'),0)
})

test('migração acompanha origem em capital legado reinvestido e o lucro do ciclo fica travado',()=>{
 const db=fixture();const c=subscribe(db,'u','C-1',2500,'deposit',at);c.status='CLOSED'
 entry(db,'u','earnings',2500,`${c.id}:return`,'Capital antigo')
 entry(db,'u','earnings',-1000,'rejected:reserve','Reserva antiga')
 entry(db,'u','earnings',1000,'rejected:refund','Recusa antiga')
 db.withdrawals.push({id:'rejected',userId:'u',wallet:'earnings',cents:1000,status:'REJECTED'})
 const reinvest=subscribe(db,'u','C-1',2500,'earnings',at)
 delete db.walletPolicyVersion;migrateWalletPolicy(db)
 assert.equal(reinvest.balancePrincipal,2500)
 assert.equal(balance(db,'u','deposit'),7500);assert.equal(balance(db,'u','earnings'),0)
 accrue(db,new Date(+at+35*DAY))
 assert.equal(balance(db,'u','locked'),0);assert.equal(balance(db,'u','earnings'),9500)
})
