import {DEFAULT_SUPPORT,type SupportSettings} from '../src/support.js'
import crypto from 'node:crypto'
import {activePlanLimit,DAY,PLANS,LEVELS,DEFAULT_RULES,rankFor,withdrawalOpen,fee,type Wallet,type Rules} from '../src/rules.js'
import type {User} from '../src/types.js'
export type Account=User & {passwordHash:string}
export interface Entry {id:string;key:string;userId:string;wallet:Wallet;cents:number;description:string;at:string}
export interface Contract {balancePrincipal?:number;id:string;userId:string;planId:string;principal:number;bps:number;days:number;paidDays:number;startedAt:string;status:'ACTIVE'|'CLOSED';returnPrincipal:boolean;commissionBase:Rules['commissionBase']}
export interface Db {walletPolicyVersion?:number;version:number;support:SupportSettings;users:Account[];sessions:Record<string,{userId:string;expires:number}>;rules:Rules;ledger:Entry[];contracts:Contract[];deposits:any[];withdrawals:any[];tickets:any[];spins:any[];audit:any[];salaryMonths:string[]}
export const id=()=>crypto.randomUUID()
export const emptyDb=():Db=>({walletPolicyVersion:1,version:1,support:{...DEFAULT_SUPPORT},users:[],sessions:{},rules:structuredClone(DEFAULT_RULES),ledger:[],contracts:[],deposits:[],withdrawals:[],tickets:[],spins:[],audit:[],salaryMonths:[]})
export const balance=(db:Db,userId:string,wallet:Wallet)=>db.ledger.filter(e=>e.userId===userId&&e.wallet===wallet).reduce((s,e)=>s+e.cents,0)
export function entry(db:Db,userId:string,wallet:Wallet,cents:number,key:string,description:string,at=new Date().toISOString()) {
  if(db.ledger.some(e=>e.key===key)) return false
  if(!Number.isSafeInteger(cents)) throw new Error('Valor inválido no extrato')
  if(cents<0&&balance(db,userId,wallet)+cents<0) throw new Error('Saldo insuficiente')
  db.ledger.push({id:id(),key,userId,wallet,cents,description,at}); return true
}
export function audit(db:Db,actor:string,action:string,details:unknown) {db.audit.push({id:id(),actor,action,details,at:new Date().toISOString()})}
export function eligible(db:Db,userId:string) {return db.users.some(u=>u.id===userId&&u.status==='ACTIVE'&&u.role==='ASSOCIATE')&&db.contracts.some(c=>c.userId===userId&&c.status==='ACTIVE')}
function commissions(db:Db,userId:string,cents:number,key:string,at:string) {
  let current=db.users.find(u=>u.id===userId); const seen=new Set([userId])
  for(let level=0;level<3;level++) {
    current=db.users.find(u=>u.id===current?.sponsorId)
    if(!current||seen.has(current.id))break
    seen.add(current.id)
    if(eligible(db,current.id)) entry(db,current.id,'earnings',Math.floor(cents*LEVELS[level]/10000),`${key}:level:${level+1}`,`Indicação nível ${level+1}`,at)
  }
}
function spin(db:Db,userId:string,key:string) {if(!db.spins.some(s=>s.key===key))db.spins.push({id:id(),key,userId,status:'AVAILABLE',at:new Date().toISOString()})}
export function userSpins(db:Db,userId:string) {
  return db.spins.filter(s=>s.userId===userId).map(s=>{
    if(s.status!=='AVAILABLE')return s
    const contract=db.contracts.find(c=>s.key===`reinvestment:${c.id}`&&c.userId===userId)
    const plan=PLANS.find(p=>p.id===contract?.planId)
    const valid=contract&&(plan?.family==='cycle'||plan?.family==='daily')&&db.ledger.some(e=>e.key===`${contract.id}:purchase`&&e.userId===userId&&e.wallet==='earnings'&&e.cents===-contract.principal)
    return valid?s:{...s,status:'CANCELLED'}
  })
}
export function subscribe(db:Db,userId:string,planId:string,cents:number,wallet:Wallet,at=new Date()) {
  if(!db.rules.confirmed)throw new Error('As regras operacionais aguardam definição pelo administrador')
  const plan=PLANS.find(p=>p.id===planId)
  if(!plan||!Number.isSafeInteger(cents)||cents<plan.min||cents>plan.max)throw new Error('Valor incompatível com o plano selecionado')
  if(!['deposit','earnings'].includes(wallet))throw new Error('Carteira de origem inválida')
  const active=db.contracts.filter(c=>c.userId===userId&&c.planId===planId&&c.status==='ACTIVE').length
  const limit=activePlanLimit(db.rules,planId)
  if(active>=limit)throw new Error(`Limite de aplicações ativas em ${planId} atingido (${active}/${limit}). Aguarde o encerramento de uma aplicação para investir novamente.`)
  const contract:Contract={balancePrincipal:wallet==='deposit'?cents:0,id:id(),userId,planId,principal:cents,bps:plan.bps,days:plan.days,paidDays:0,startedAt:at.toISOString(),status:'ACTIVE',returnPrincipal:plan.family==='cycle'||db.rules.returnPrincipal,commissionBase:db.rules.commissionBase}
  entry(db,userId,wallet,-cents,`${contract.id}:purchase`,`Aplicação ${planId}`,at.toISOString())
  db.contracts.push(contract)
  if(plan.family==='vault')entry(db,userId,'vault',cents,`${contract.id}:principal`,'Capital no Credcofre',at.toISOString())
  if(db.rules.commissionBase==='deposit')commissions(db,userId,cents,contract.id,at.toISOString())
  if(wallet==='earnings'&&(plan.family==='cycle'||plan.family==='daily'))spin(db,userId,`reinvestment:${contract.id}`)
  return contract
}
export function accrue(db:Db,at=new Date()) {
  let count=0
  for(const c of db.contracts.filter(c=>c.status==='ACTIVE')) {
    const elapsed=Math.max(0,Math.floor((at.getTime()-Date.parse(c.startedAt))/DAY))
    const due=c.days?Math.min(c.days,elapsed):elapsed
    for(let day=c.paidDays+1;day<=due;day++) {
      const paidAt=new Date(Date.parse(c.startedAt)+day*DAY).toISOString(), cents=Math.floor(c.principal*c.bps/10000)
      const key=`${c.id}:day:${day}`
      if(entry(db,c.userId,'earnings',cents,key,`Rendimento ${c.planId} · dia ${day}`,paidAt)) {
        if(c.commissionBase==='earnings') commissions(db,c.userId,cents,key,paidAt)
        count++
      }
      c.paidDays=day
    }
    if(c.days&&c.paidDays===c.days) {
      if(c.returnPrincipal)returnCapital(db,c,at)
      c.status='CLOSED'
    }
  }
  return count
}
export function redeem(db:Db,userId:string,contractId:string,at=new Date()) {
  const c=db.contracts.find(c=>c.id===contractId&&c.userId===userId&&c.planId==='CREDCOFRE'&&c.status==='ACTIVE')
  if(!c)throw new Error('Credcofre ativo não encontrado')
  accrue(db,at)
  entry(db,userId,'vault',-c.principal,`${c.id}:redeem`,'Resgate de capital Credcofre',at.toISOString())
  returnCapital(db,c,at)
  c.status='CLOSED'
  audit(db,userId,'VAULT_REDEEM',{contractId})
}
export function withdraw(db:Db,userId:string,wallet:Wallet,cents:number,pixKey:string,at=new Date()) {
  if(wallet!=='earnings')throw new Error('Somente a Carteira de Rendimentos permite saques. Depósitos não podem ser sacados')
  if(!canWithdraw(db,userId,at))throw new Error('É necessário ter um pacote ativo para sacar')
  if(!withdrawalOpen(wallet,at))throw new Error('Fora da janela de saques: 12h às 18h, horário de Brasília')
  if(!Number.isSafeInteger(cents)||cents<=0||!pixKey.trim())throw new Error('Informe valor e chave PIX válidos')
  if(balance(db,userId,'earnings')<cents)throw new Error('Saldo insuficiente na Carteira de Rendimentos')
  const request={id:id(),userId,wallet,cents,fee:fee(cents),net:cents-fee(cents),pixKey:pixKey.trim(),status:'PENDING',at:at.toISOString()}
  if(request.net<=0)throw new Error('Valor líquido inválido')
  entry(db,userId,wallet,-cents,`${request.id}:reserve`,'Reserva para saque PIX',at.toISOString())
  db.withdrawals.push(request); return request
}
export function settleWithdrawal(db:Db,requestId:string,status:string,reference:string,at=new Date()) {
  const w=db.withdrawals.find(w=>w.id===requestId)
  if(!w||w.status!=='PENDING')throw new Error('Saque não encontrado ou já concluído')
  if(!['PAID','REJECTED'].includes(status)||!reference.trim())throw new Error('Informe o comprovante ou motivo')
  if(status==='PAID'&&(w.wallet!=='earnings'||!canWithdraw(db,w.userId,at)))throw new Error('Pagamento bloqueado: o saque exige Carteira de Rendimentos e pacote ativo')
  if(status==='REJECTED')entry(db,w.userId,w.wallet,w.cents,`${w.id}:refund`,'Saque recusado: saldo devolvido')
  w.status=status;w.reference=reference;w.processedAt=new Date().toISOString()
}
export function network(db:Db,userId:string) {
  const result:{user:Account;level:number;active:boolean}[]=[], queue=[{id:userId,level:0}],seen=new Set([userId])
  while(queue.length){const parent=queue.shift()!;for(const user of db.users.filter(u=>u.sponsorId===parent.id)){if(seen.has(user.id))continue;seen.add(user.id);result.push({user,level:parent.level+1,active:eligible(db,user.id)});queue.push({id:user.id,level:parent.level+1})}}
  return result
}
export function salary(db:Db,at=new Date()) {
  const month=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit'}).format(at)
  if(!db.rules.confirmed)return
  for(const user of db.users.filter(u=>eligible(db,u.id))) {
    const members=network(db,user.id).filter(m=>db.rules.salaryScope==='network'||m.level===1),rank=rankFor(members.filter(m=>m.active).length,members.length)
    if(rank)entry(db,user.id,'earnings',rank.cents,`salary:${month}:${user.id}`,`Salário ${rank.name} · ${month}`,at.toISOString())
  }
}
export function draw(db:Db,userId:string,random=(max:number)=>crypto.randomInt(max)) {
  const prizes=db.rules.prizes, total=prizes.reduce((s,p)=>s+p.weight,0)
  if(!total)throw new Error('Os prêmios da roleta ainda não foram configurados')
  const token=userSpins(db,userId).find(s=>s.status==='AVAILABLE');if(!token)throw new Error('Nenhum giro disponível')
  let value=random(total),winner=prizes[prizes.length-1]
  for(const prize of prizes){if(value<prize.weight){winner=prize;break}value-=prize.weight}
  if(winner.cents)entry(db,userId,'earnings',winner.cents,`spin:${token.id}`,`Roleta · ${winner.label}`)
  token.status='USED';token.prize=winner;return token
}

export function canWithdraw(db:Db,userId:string,at=new Date()) {
  return db.users.some(u=>u.id===userId&&u.role==='ASSOCIATE'&&u.status==='ACTIVE')&&db.contracts.some(c=>c.userId===userId&&c.status==='ACTIVE'&&Date.parse(c.startedAt)<=at.getTime()&&(!c.days||Date.parse(c.startedAt)+c.days*DAY>at.getTime()))
}
function returnCapital(db:Db,c:Contract,at:Date) {
  const restricted=c.balancePrincipal??(db.ledger.find(e=>e.key===`${c.id}:purchase`)?.wallet==='earnings'?0:c.principal)
  if(restricted)entry(db,c.userId,'deposit',restricted,`${c.id}:return:deposit`,`Capital devolvido à Carteira de Saldo · ${c.planId}`,at.toISOString())
  if(c.principal>restricted)entry(db,c.userId,'earnings',c.principal-restricted,`${c.id}:return`,`Capital de rendimentos devolvido · ${c.planId}`,at.toISOString())
}

// Replays existing origin without altering historical ledger rows or paid withdrawals.
export function migrateWalletPolicy(db:Db) {
  if(db.walletPolicyVersion===1)return
  for(const user of db.users) {
    const restricted={earnings:0,vault:0},running={earnings:0,vault:0},reservedOrigins=new Map<string,number>()
    for(const e of db.ledger.filter(e=>e.userId===user.id)) {
      const purchase=db.contracts.find(c=>e.key===`${c.id}:purchase`)
      if(purchase)purchase.balancePrincipal=e.wallet==='deposit'?purchase.principal:Math.min(restricted.earnings,purchase.principal)
      if(e.wallet==='deposit')continue
      const reservation=db.withdrawals.find(w=>e.key===`${w.id}:reserve`)
      const consumed=e.cents<0?(purchase?Math.min(restricted[e.wallet],-e.cents):Math.min(restricted[e.wallet],Math.max(0,-e.cents-Math.max(0,running[e.wallet]-restricted[e.wallet])))):0
      if(reservation)reservedOrigins.set(reservation.id,consumed)
      if(e.cents<0)restricted[e.wallet]-=consumed
      else {
        const refund=db.withdrawals.find(w=>e.key===`${w.id}:refund`)
        if(refund)restricted[e.wallet]+=reservedOrigins.get(refund.id)??0
        const capital=db.contracts.find(c=>e.key===`${c.id}:return`||e.key===`${c.id}:principal`)
        if(capital)restricted[e.wallet]+=capital.balancePrincipal??capital.principal
      }
      running[e.wallet]+=e.cents
    }
    const pending=db.withdrawals.filter(w=>w.userId===user.id&&w.status==='PENDING')
    for(const w of pending)if(w.wallet==='earnings'||w.wallet==='vault')restricted[w.wallet as 'earnings'|'vault']+=reservedOrigins.get(w.id)??0
    const cancelEarnings=restricted.earnings>balance(db,user.id,'earnings')
    for(const w of pending)if(w.wallet!=='earnings'||cancelEarnings){settleWithdrawal(db,w.id,'REJECTED','Adequação das carteiras: solicite novamente apenas rendimentos com pacote ativo');audit(db,'system','WALLET_POLICY_WITHDRAWAL_RELEASED',{id:w.id,userId:user.id})}
    const move=(from:'earnings'|'vault',to:'deposit'|'earnings',cents:number)=>{
      if(cents<=0)return
      const key=`wallet-policy:${user.id}:${from}:${to}`
      entry(db,user.id,from,-cents,`${key}:debit`,'Separação das carteiras: transferência de origem')
      entry(db,user.id,to,cents,`${key}:credit`,'Separação das carteiras: transferência de origem')
      audit(db,'system','WALLET_POLICY_TRANSFER',{userId:user.id,from,to,cents})
    }
    move('earnings','deposit',Math.min(restricted.earnings,balance(db,user.id,'earnings')))
    const active=db.contracts.filter(c=>c.userId===user.id&&c.planId==='CREDCOFRE'&&c.status==='ACTIVE')
    const locked=active.reduce((s,c)=>s+c.principal,0),lockedRestricted=active.reduce((s,c)=>s+(c.balancePrincipal??c.principal),0)
    const unlocked=Math.max(0,balance(db,user.id,'vault')-locked)
    move('vault','deposit',Math.min(unlocked,Math.max(0,restricted.vault-lockedRestricted)))
    move('vault','earnings',Math.max(0,balance(db,user.id,'vault')-locked))
  }
  db.walletPolicyVersion=1
}
