import test from 'node:test'
import assert from 'node:assert/strict'
import {emptyDb,entry,balance,subscribe,accrue,redeem,withdraw,settleWithdrawal,draw,salary,network,userSpins,canWithdraw} from '../server/engine.js'
import {PLANS,DAY,amount,withdrawalOpen,rankFor} from '../src/rules.js'
const start=new Date('2026-09-01T15:00:00Z')
function fixture(){const db=emptyDb();db.rules.confirmed=true;db.users.push({id:'a',name:'Ana',username:'ana',email:'a@test.local',cpf:'52998224725',passwordHash:'',role:'ASSOCIATE',status:'ACTIVE',sponsorId:null,inviteCode:'ana'});entry(db,'a','deposit',10000000,'fund','Teste');return db}

test('roleta exclusiva de reinvestimentos em todos os planos Ciclo e Rendimento Diário',()=>{
  for(const plan of PLANS)for(const wallet of ['deposit','earnings'] as const){
    const db=fixture();entry(db,'a','earnings',plan.min,'earn','Teste')
    const contract=subscribe(db,'a',plan.id,plan.min,wallet,start)
    const expected=wallet==='earnings'&&plan.family!=='vault'?1:0
    assert.equal(db.spins.length,expected,`${plan.id} / ${wallet}`)
    if(expected)assert.equal(db.spins[0].key,`reinvestment:${contract.id}`)
  }
})

test('giros antigos inelegíveis são cancelados na consulta e recusados no sorteio',()=>{
  const db=fixture();db.rules.prizes=[{label:'R$1',cents:100,weight:1}]
  entry(db,'a','earnings',10000,'earn','Teste')
  const vault=subscribe(db,'a','CREDCOFRE',2500,'earnings',start)
  const deposit=subscribe(db,'a','C-1',2500,'deposit',start)
  db.spins.push(...[`reinvestment:${vault.id}`,`reinvestment:${deposit.id}`,'activation:b'].map((key,i)=>({id:`old-${i}`,key,userId:'a',status:'AVAILABLE'})))
  db.spins.push({id:'used',key:'activation:old',userId:'a',status:'USED',prize:db.rules.prizes[0]})
  assert.deepEqual(userSpins(db,'a').map(s=>s.status),['CANCELLED','CANCELLED','CANCELLED','USED'])
  const before=balance(db,'a','earnings')
  assert.throws(()=>draw(db,'a',()=>0),/Nenhum giro disponível/)
  assert.equal(balance(db,'a','earnings'),before)
  const valid=subscribe(db,'a','NEX-N1',5000,'earnings',start)
  valid.status='CLOSED'
  assert.equal(draw(db,'a',()=>0).key,`reinvestment:${valid.id}`)
  assert.throws(()=>draw(db,'a',()=>0),/Nenhum giro disponível/)
  assert.equal(db.spins.at(-1).status,'USED')
})
test('catálogo respeita ciclos de 35 dias e NEX de 50 dias',()=>{assert.equal(PLANS.length,9);assert.deepEqual(PLANS.slice(0,3).map(p=>[p.days,p.bps]),[[35,800],[35,900],[35,1000]]);assert.deepEqual(PLANS.slice(3,8).map(p=>p.min),[5000,10000,25000,50000,150000])})
test('valores monetários rejeitam frações de centavo e entradas inválidas',()=>{for(const v of [null,true,{},'1.001','-1','Infinity','1e5'])assert.throws(()=>amount(v));assert.equal(amount('40,25'),4025)})
test('ciclo simples: 35 dias, lucro travado e liberado junto do principal no encerramento',()=>{const db=fixture(),before=balance(db,'a','deposit');const c=subscribe(db,'a','C-1',10000,'deposit',start);assert.equal(accrue(db,new Date(+start+DAY-1)),0);assert.equal(accrue(db,new Date(+start+DAY)),1);assert.equal(balance(db,'a','earnings'),0);assert.equal(balance(db,'a','locked'),800);assert.equal(canWithdraw(db,'a',new Date(+start+DAY)),false);accrue(db,new Date(+start+90*DAY));assert.equal(c.paidDays,35);assert.equal(c.status,'CLOSED');assert.equal(balance(db,'a','locked'),0);assert.equal(balance(db,'a','earnings'),38000);assert.equal(balance(db,'a','deposit'),before-10000);assert.equal(accrue(db,new Date(+start+91*DAY)),0)})
test('NEX é fixo, 4% por 50 dias, capital conforme configuração capturada',()=>{const db=fixture();assert.throws(()=>subscribe(db,'a','NEX-N1',5100,'deposit',start));db.rules.returnPrincipal=true;const before=balance(db,'a','deposit');const c=subscribe(db,'a','NEX-N1',5000,'deposit',start);db.rules.returnPrincipal=false;accrue(db,new Date(+start+51*DAY));assert.equal(balance(db,'a','earnings'),10000);assert.equal(balance(db,'a','deposit'),before);assert.equal(c.paidDays,50)})
test('faixas inclusivas de cada ciclo: C-1 25–100, C-2 150–500, C-3 700–1500',()=>{const db=fixture();subscribe(db,'a','C-1',2500,'deposit',start);subscribe(db,'a','C-1',10000,'deposit',start);assert.throws(()=>subscribe(db,'a','C-1',2400,'deposit',start));assert.throws(()=>subscribe(db,'a','C-1',10001,'deposit',start));subscribe(db,'a','C-2',15000,'deposit',start);subscribe(db,'a','C-2',50000,'deposit',start);assert.throws(()=>subscribe(db,'a','C-2',10000,'deposit',start));subscribe(db,'a','C-3',70000,'deposit',start);subscribe(db,'a','C-3',150000,'deposit',start);assert.throws(()=>subscribe(db,'a','C-3',69999,'deposit',start));assert.throws(()=>subscribe(db,'a','C-3',150001,'deposit',start))})
test('horários de saque em São Paulo: fronteiras e fins de semana',()=>{assert.equal(withdrawalOpen('earnings',new Date('2026-09-04T14:59:59Z')),false);assert.equal(withdrawalOpen('earnings',new Date('2026-09-04T15:00:00Z')),true);assert.equal(withdrawalOpen('earnings',new Date('2026-09-04T20:59:59Z')),true);assert.equal(withdrawalOpen('earnings',new Date('2026-09-04T21:00:00Z')),false);assert.equal(withdrawalOpen('earnings',new Date('2026-09-05T15:00:00Z')),false);assert.equal(withdrawalOpen('vault',new Date('2026-09-06T15:00:00Z')),false)})
test('Credcofre: juros compostos acumulam e o resgate integral fica sacável em rendimentos',()=>{
 const db=fixture(),before=balance(db,'a','deposit'),c=subscribe(db,'a','CREDCOFRE',4000,'deposit',start)
 accrue(db,new Date(+start+2*DAY));assert.equal(c.compoundBalance,4161);assert.equal(balance(db,'a','vault'),4161)
 redeem(db,'a',c.id,new Date(+start+2*DAY));assert.equal(balance(db,'a','vault'),0);assert.equal(balance(db,'a','deposit'),before-4000);assert.equal(balance(db,'a','earnings'),4161)
 const w=withdraw(db,'a','earnings',4000,'pix',new Date(+start+2*DAY));assert.equal(w.net,3600);assert.equal(balance(db,'a','earnings'),161)
 accrue(db,new Date(+start+10*DAY));assert.equal(c.paidDays,2);assert.throws(()=>redeem(db,'a',c.id))
})

test('reserva impede gasto duplo; recusa devolve saldo apenas uma vez',()=>{const db=fixture();subscribe(db,'a','C-1',2500,'deposit',start);entry(db,'a','earnings',10000,'earn','Teste');const w=withdraw(db,'a','earnings',9000,'pix',start);assert.throws(()=>withdraw(db,'a','earnings',9000,'pix',start));settleWithdrawal(db,w.id,'REJECTED','Chave incorreta');assert.equal(balance(db,'a','earnings'),10000);assert.throws(()=>settleWithdrawal(db,w.id,'REJECTED','Outra'));assert.equal(balance(db,'a','earnings'),10000)})
test('comissões de 10%, 3%, 2% em três níveis sem giro por primeira ativação',()=>{const db=fixture();subscribe(db,'a','C-1',2500,'deposit',start);for(const [id,sponsorId]of [['b','a'],['c','b'],['d','c']]){db.users.push({...db.users[0],id,username:id,inviteCode:id,sponsorId});entry(db,id,'deposit',100000,`fund:${id}`,'Teste');subscribe(db,id,'C-1',10000,'deposit',start)}const last=db.contracts.at(-1)!;const entries=db.ledger.filter(e=>e.key.startsWith(last.id+':level'));assert.deepEqual(entries.map(e=>[e.userId,e.cents]),[['c',1000],['b',300],['a',200]]);assert.equal(db.spins.length,0);const before=db.spins.length;subscribe(db,'d','C-1',2500,'deposit',start);assert.equal(db.spins.length,before);assert.equal(network(db,'a').length,3)})
test('reinvestimento gera um giro e consumo não pode ser repetido',()=>{const db=fixture();entry(db,'a','earnings',5000,'earn','Teste');subscribe(db,'a','C-1',2500,'earnings',start);db.rules.prizes=[{label:'R$1',cents:100,weight:1}];draw(db,'a',()=>0);assert.equal(balance(db,'a','earnings'),2600);assert.throws(()=>draw(db,'a',()=>0))})
test('salário não duplica no mês; exige ambos os critérios',()=>{const db=fixture();subscribe(db,'a','C-1',2500,'deposit',start);for(let i=0;i<10;i++){const uid=`u${i}`;db.users.push({...db.users[0],id:uid,username:uid,inviteCode:uid,sponsorId:'a'});if(i<5){entry(db,uid,'deposit',2500,`fund:${uid}`,'Teste');subscribe(db,uid,'C-1',2500,'deposit',start)}}salary(db,start);salary(db,start);assert.equal(db.ledger.filter(e=>e.key.startsWith('salary:')).length,1);assert.equal(db.ledger.find(e=>e.key.startsWith('salary:'))?.cents,7500);assert.equal(rankFor(4,100),undefined);assert.equal(rankFor(35,100)?.name,'Diamante')})
test('configuração pendente e carteira inválida impedem contratação',()=>{const db=fixture();db.rules.confirmed=false;assert.throws(()=>subscribe(db,'a','C-1',2500,'deposit'));db.rules.confirmed=true;assert.throws(()=>subscribe(db,'a','C-1',2500,'vault'))})

test('limite por usuário e plano bloqueia sem débito e libera vaga no encerramento',()=>{
  const db=fixture();db.rules.activePlanLimits['C-1']=2
  subscribe(db,'a','C-1',2500,'deposit',start)
  subscribe(db,'a','C-1',2500,'deposit',new Date(+start+DAY))
  const before=structuredClone(db)
  assert.throws(()=>subscribe(db,'a','C-1',2500,'deposit',start),/2\/2/)
  assert.deepEqual(db,before)
  subscribe(db,'a','C-2',15000,'deposit',start)
  entry(db,'b','deposit',2500,'fund-b','Teste');subscribe(db,'b','C-1',2500,'deposit',start)
  accrue(db,new Date(+start+35*DAY))
  subscribe(db,'a','C-1',2500,'deposit',new Date(+start+30*DAY))
  assert.equal(db.contracts.filter(c=>c.userId==='a'&&c.planId==='C-1'&&c.status==='ACTIVE').length,2)
})
test('alterar limite preserva contratos e resgate do cofre libera vaga',()=>{
  const db=fixture();subscribe(db,'a','CREDCOFRE',2500,'deposit',start);const c=subscribe(db,'a','CREDCOFRE',2500,'deposit',start)
  db.rules.activePlanLimits.CREDCOFRE=1
  assert.throws(()=>subscribe(db,'a','CREDCOFRE',2500,'deposit',start),/Limite/)
  redeem(db,'a',c.id,start)
  assert.throws(()=>subscribe(db,'a','CREDCOFRE',2500,'deposit',start),/Limite/)
  db.rules.activePlanLimits.CREDCOFRE=2
  subscribe(db,'a','CREDCOFRE',2500,'deposit',start)
})
