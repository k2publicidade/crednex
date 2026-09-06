export const TIMEZONE = 'America/Sao_Paulo'
export const DAY = 86_400_000
export const PLANS = [
  { id:'C-1', family:'cycle', days:30, min:2500, max:10000, bps:600 },
  { id:'C-2', family:'cycle', days:30, min:10000, max:50000, bps:650 },
  { id:'C-3', family:'cycle', days:30, min:50000, max:150000, bps:700 },
  ...[5000,10000,25000,50000,150000].map((value,i)=>({id:`NEX-N${i+1}`,family:'daily',days:50,min:value,max:value,bps:400})),
  {id:'CREDCOFRE',family:'vault',days:0,min:2500,max:100_000_000,bps:200},
] as const
export const LEVELS = [1000,300,200]
export const RANKS = [
  {name:'Bronze',active:5,total:10,cents:7500},
  {name:'Prata',active:10,total:25,cents:15000},
  {name:'Ouro',active:20,total:50,cents:35000},
  {name:'Diamante',active:35,total:100,cents:85000},
]
export type Wallet = 'deposit'|'earnings'|'vault'
export interface Rules {
  activePlanLimits:Record<string,number>; confirmed:boolean; depositMin:number; returnPrincipal:boolean; commissionBase:'deposit'|'earnings';
  salaryScope:'direct'|'network'; prizes:{label:string;cents:number;weight:number}[]
}
export const DEFAULT_RULES:Rules = {activePlanLimits:Object.fromEntries(PLANS.map(p=>[p.id,2])),confirmed:false,depositMin:4000,returnPrincipal:false,commissionBase:'deposit',salaryScope:'direct',prizes:[]}
export function amount(value:unknown) {
  if(typeof value!=='string' && typeof value!=='number') throw new Error('Informe um valor válido')
  const text=String(value).replace(',','.')
  if(!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('Use um valor positivo com até duas casas decimais')
  const cents=Math.round(Number(text)*100)
  if(!Number.isSafeInteger(cents)||cents<=0||cents>100_000_000) throw new Error('Valor fora do limite permitido')
  return cents
}
export function withdrawalOpen(wallet:Wallet,date=new Date()) {
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:TIMEZONE,weekday:'short',hour:'2-digit',hourCycle:'h23'}).formatToParts(date)
  const day=parts.find(p=>p.type==='weekday')?.value, hour=Number(parts.find(p=>p.type==='hour')?.value)
  return hour>=12&&hour<18&&(wallet==='vault'||!['Sat','Sun'].includes(day||''))
}
export const fee=(cents:number)=>Math.round(cents*0.1)
export function rankFor(active:number,total:number) { return [...RANKS].reverse().find(r=>active>=r.active&&total>=r.total) }

export function activePlanLimit(rules:Rules,planId:string) {return rules.activePlanLimits?.[planId] ?? 2}
export function validatePlanLimits(value:unknown):Record<string,number> {
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Informe os limites de aplicações por plano')
  const limits=value as Record<string,number>
  if(Object.keys(limits).length!==PLANS.length||PLANS.some(p=>!Number.isSafeInteger(limits[p.id])||limits[p.id]<1))throw new Error('Cada plano deve ter um limite inteiro positivo de aplicações ativas')
  return Object.fromEntries(PLANS.map(p=>[p.id,limits[p.id]]))
}
export function projectedReturn(principal:number,bps:number,days:number,returnPrincipal:boolean) {
  const daily=Math.floor(principal*bps/10000),earnings=daily*days,capital=returnPrincipal?principal:0
  return {daily,earnings,capital,total:earnings+capital}
}
export function remainingDays(startedAt:string,days:number,at=new Date()) {
  return days?Math.max(0,Math.ceil((Date.parse(startedAt)+days*DAY-at.getTime())/DAY)):null
}

export const planName=(id:string)=>({'C-1':'Cred-c1','C-2':'Cred-c2','C-3':'Cred-c3'} as Record<string,string>)[id]||id
