import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

test('PIX confirmado compra plano e credita três níveis uma vez; pausa exige confirmação explícita',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crednex-purchase-'))
 process.env.DATABASE_URL='';process.env.CREDNEX_DATA_FILE=path.join(dir,'db.json');process.env.CREDNEX_NO_LISTEN='1';process.env.CREDNEX_ADMIN_PASSWORD='Test-password-1234'
 process.env.PIXPAY_API_KEY='test';process.env.PIXPAY_API_SECRET='test';process.env.PIXPAY_WEBHOOK_TOKEN='x'.repeat(40);process.env.APP_PUBLIC_URL='https://crednex.example';process.env.PIXPAY_BASE_URL='https://purchase-gateway.test'
 const {app}=await import('../server/index.js'),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r))
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`,nativeFetch=globalThis.fetch
 let gateway=0
 globalThis.fetch=(async(input:any,init:any)=>String(input).startsWith('https://purchase-gateway.test')?new Response(JSON.stringify({id:`payment-${++gateway}`,qrCode:'PIX-TEST',status:'PENDING'}),{status:200,headers:{'Content-Type':'application/json'}}):nativeFetch(input,init)) as typeof fetch
 const call=async(route:string,token?:string,body?:any,method=body?'POST':'GET')=>{const res=await nativeFetch(base+route,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json() as any}}
 try{
  const admin=(await call('/auth/login',undefined,{username:'admin',password:process.env.CREDNEX_ADMIN_PASSWORD})).body
  const rules=(await call('/public')).body.rules
  assert.equal((await call('/admin/rules',admin.token,{...rules,confirmed:true},'PATCH')).status,200)
  const users:any[]=[]
  for(let n=0;n<4;n++){
   await call('/auth/register',undefined,{name:`Person ${n}`,username:`person${n}`,email:`person${n}@test.local`,password:'Test-password-1234',inviteCode:n?users[n-1].user.inviteCode:'crednex'})
   const user=(await call('/auth/login',undefined,{username:`person${n}`,password:'Test-password-1234'})).body;users.push(user)
   const deposit=await call('/deposits',user.token,{amount:40,document:'12345678901'});assert.equal(deposit.status,200)
   const payload={data:{transactionId:`payment-${n+1}`,amount:'40.00',status:'COMPLETED',paymentMethod:'pix'}}
   const webhook=`/webhooks/2pp?token=${process.env.PIXPAY_WEBHOOK_TOKEN}`
   assert.equal((await call(webhook,undefined,payload)).status,200)
   await call(webhook,undefined,payload)
   assert.equal((await call('/state',user.token)).body.balances.deposit,4000)
   if(n<3)assert.equal((await call('/contracts',user.token,{planId:'C-1',amount:25,wallet:'deposit',requestId:`setup-purchase-000${n}`})).status,200)
  }
  const before=await Promise.all(users.slice(0,3).map(async u=>(await call('/state',u.token)).body.balances.commission))
  const custom={id:'CUSTOM',name:'Plano cadastrado',family:'cycle',days:30,min:2500,max:10000,bps:600,active:true,returnPrincipal:true,maxActive:2}
  assert.equal((await call('/admin/plans',users[3].token,custom)).status,403)
  assert.equal((await call('/admin/plans',admin.token,custom)).status,200)
  assert.equal((await call('/state',users[3].token)).body.plans.some((p:any)=>p.id==='CUSTOM'),true)
  const purchase={planId:'CUSTOM',amount:40,wallet:'deposit',requestId:'final-purchase-0001'}
  const results=await Promise.all([1,2].map(()=>call('/contracts',users[3].token,purchase)))
  assert.deepEqual(results.map(r=>r.status),[200,200]);assert.equal(results[0].body.id,results[1].body.id)
  const bought=(await call('/state',users[3].token)).body;assert.equal(bought.contracts.length,1);assert.equal(bought.balances.deposit,0)
  for(let i=0;i<3;i++){const state=(await call('/state',users[i].token)).body;assert.equal(state.balances.commission-before[i],[80,120,400][i]);assert.equal(state.ledger.filter((e:any)=>e.key.startsWith(results[0].body.id+':level:')).length,1)}
  assert.equal((await call('/admin/plans/CUSTOM',admin.token,{active:false},'PATCH')).status,200)
  assert.equal((await call('/public')).body.plans.some((p:any)=>p.id==='CUSTOM'),false)
  assert.equal((await call('/admin/state',admin.token)).body.plans.find((p:any)=>p.id==='CUSTOM').active,false)
  assert.equal((await call('/contracts',users[0].token,{...purchase,requestId:'another-purchase-001'})).status,422)
  assert.equal((await call('/contracts',users[3].token,{...purchase,amount:25})).status,422)
  assert.equal((await call('/admin/rules',admin.token,{...rules,confirmed:false},'PATCH')).status,422)
  assert.equal((await call('/public')).body.rules.confirmed,true)
  assert.equal((await call('/admin/rules',admin.token,{...(await call('/public')).body.rules,confirmed:false,pauseConfirmation:'PAUSAR COMPRAS'},'PATCH')).status,200)
  assert.equal((await call('/contracts',users[0].token,{planId:'C-1',amount:25,wallet:'deposit'})).status,422)
  assert.equal((await call('/contracts',users[3].token,purchase)).body.id,results[0].body.id)
 }finally{globalThis.fetch=nativeFetch;await new Promise<void>(r=>server.close(()=>r()));fs.rmSync(dir,{recursive:true,force:true})}
})
