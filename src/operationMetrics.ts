type Row = Record<string, any>
export function operationDay(value: unknown): string | null {
  if (!value) return null
  const date = new Date(String(value))
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date)
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type)!.value).join('-')
}
export function operationMetrics(data: Row, now = new Date()) {
  const day = operationDay(now.toISOString())!
  const users: Row[] = data.users.filter((u:Row)=>u.role==='ASSOCIATE')
  const registration = new Map<string,string>()
  for (const log of data.audit as Row[]) if(log.action==='REGISTER'&&!registration.has(log.actor)) registration.set(log.actor,log.at)
  const newUsers = users.filter(u=>operationDay(u.createdAt??registration.get(u.id))===day)
  const deposits:Row[] = data.deposits.filter((d:Row)=>d.status==='PAID')
  const withdrawals:Row[] = data.withdrawals.filter((w:Row)=>w.status==='PAID').map((w:Row)=>({...w,net:w.gatewayNet??w.net}))
  const depositDate = (d:Row)=>d.confirmedAt??data.ledger.find((e:Row)=>e.key===`deposit:${d.id}`)?.at
  const sum=(rows:Row[],key:string)=>rows.reduce((s,r)=>s+(Number.isSafeInteger(r[key])&&r[key]>0?r[key]:0),0)
  const activeContracts=(data.contracts as Row[]).filter(c=>c.status==='ACTIVE')
  const projectedGross=activeContracts.filter(c=>(c.family??(c.planId==='CREDCOFRE'?'vault':'cycle'))!=='vault').reduce((s,c)=>s+Math.floor(Number(c.principal||0)*Number(c.bps||0)/10000),0)
  const projectedNet=Math.floor(projectedGross*.9)
  return {
    day, todayPeople:newUsers.length,totalPeople:users.length,
    todayActive:newUsers.filter(u=>u.status==='ACTIVE').length,totalActive:users.filter(u=>u.status==='ACTIVE').length,
    todayIn:sum(deposits.filter(d=>operationDay(depositDate(d))===day),'cents'),totalIn:sum(deposits,'cents'),
    todayOut:sum(withdrawals.filter(w=>operationDay(w.processedAt)===day),'net'),totalOut:sum(withdrawals,'net'),
    pendingOut:sum(data.withdrawals.filter((w:Row)=>w.status==='PENDING'),'net'),
    pendingCount:data.withdrawals.filter((w:Row)=>w.status==='PENDING').length,
    activeContracts:activeContracts.length, projectedGross, projectedNet,
    unknownUsers:users.filter(u=>!operationDay(u.createdAt??registration.get(u.id))).length,
    unknownPayments:deposits.filter(d=>!operationDay(depositDate(d))).length+withdrawals.filter(w=>!operationDay(w.processedAt)).length,
  }
}
