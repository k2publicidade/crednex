import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
test('API: autenticação, isolamento, regras, PIX idempotente, concorrência e suporte',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'crednex-api-'))
  process.env.CREDNEX_DATA_FILE=path.join(dir,'db.json');process.env.CREDNEX_ADMIN_PASSWORD='Crednex-Test-Password-2026';process.env.CREDNEX_NO_LISTEN='1'
  process.env.PIXPAY_API_KEY='test';process.env.PIXPAY_API_SECRET='test';process.env.PIXPAY_WEBHOOK_TOKEN='a'.repeat(40);process.env.APP_PUBLIC_URL='https://crednex.example';process.env.PIXPAY_BASE_URL='https://gateway.test'
  const {app}=await import('../server/index.js');const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const address=server.address() as {port:number},base=`http://127.0.0.1:${address.port}/api`,nativeFetch=globalThis.fetch
  let counter=0
  globalThis.fetch=(async(input:any,init:any)=>String(input).startsWith('https://gateway.test')?new Response(JSON.stringify({id:`pix-${++counter}`,qrCode:'000201-TEST',status:'PENDING'}),{status:200,headers:{'Content-Type':'application/json'}}):nativeFetch(input,init)) as typeof fetch
  const call=async(url:string,body?:unknown,token?:string,method?:string)=>{const res=await nativeFetch(base+url,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()}}
  try {
    assert.equal((await call('/state')).status,401)
    const admin=(await call('/auth/login',{username:'admin',password:process.env.CREDNEX_ADMIN_PASSWORD})).body
    assert.ok(admin.token);assert.equal(admin.user.passwordHash,undefined)
    for(const username of ['alice','bob'])assert.equal((await call('/auth/register',{name:username,username,email:`${username}@test.local`,password:'Password-test-2026'})).status,200)
    const alice=(await call('/auth/login',{username:'alice',password:'Password-test-2026'})).body,bob=(await call('/auth/login',{username:'bob',password:'Password-test-2026'})).body
    assert.equal((await call('/admin/state',undefined,alice.token)).status,403)
    assert.equal((await call('/contracts',{planId:'C-1',amount:25,wallet:'deposit'},alice.token)).status,422)
    const rules=(await call('/public')).body.rules;rules.confirmed=true;rules.returnPrincipal=true
    assert.equal((await call('/admin/rules',rules,admin.token,'PATCH')).status,200)
    assert.equal((await call('/deposits',{amount:39,document:'12345678901'},alice.token)).status,422)
    const deposit=await call('/deposits',{amount:40,document:'12345678901'},alice.token);assert.equal(deposit.status,200);assert.equal(deposit.body.status,'PENDING')
    assert.equal((await call('/state',undefined,alice.token)).body.balances.deposit,0)
    assert.equal((await call('/webhooks/2pp?token=bad',{id:'pix-1',amount:40,status:'COMPLETED'})).status,401)
    const webhook=`/webhooks/2pp?token=${process.env.PIXPAY_WEBHOOK_TOKEN}`
    assert.equal((await call(webhook,{id:'pix-1',amount:41,status:'COMPLETED'})).status,422)
    assert.equal((await call(webhook,{id:'pix-1',amount:40,status:'COMPLETED',type:'PAY_OUT'})).status,422)
    await call(webhook,{id:'pix-1',amount:40,status:'PAID'})
    assert.equal((await call('/state',undefined,alice.token)).body.balances.deposit,0)
    assert.equal((await call(webhook,{status:'success',data:{transactionId:'pix-1',amount:'40.00',netAmount:'38.00',status:'COMPLETED',paymentMethod:'pix'}})).status,200)
    await call(webhook,{id:'pix-1',amount:40,status:'COMPLETED'})
    assert.equal((await call('/state',undefined,alice.token)).body.balances.deposit,4000)
    assert.equal((await call('/state',undefined,bob.token)).body.balances.deposit,0)
    const purchases=await Promise.all([1,2].map(()=>call('/contracts',{planId:'C-1',amount:25,wallet:'deposit'},alice.token)))
    assert.deepEqual(purchases.map(p=>p.status).sort(),[200,422]);assert.equal((await call('/state',undefined,alice.token)).body.balances.deposit,1500)
    assert.equal((await call('/admin/rules',{...rules,activePlanLimits:{...rules.activePlanLimits,'C-1':0}},admin.token,'PATCH')).status,422)
    assert.equal((await call('/admin/rules',rules,alice.token,'PATCH')).status,403)
    const extra=(await call('/deposits',{amount:100,document:'12345678901'},alice.token)).body
    assert.ok(extra.id)
    await call(webhook,{id:'pix-2',amount:100,status:'COMPLETED'})
    const limited=await Promise.all([1,2].map(()=>call('/contracts',{planId:'C-1',amount:25,wallet:'deposit'},alice.token)))
    assert.deepEqual(limited.map(p=>p.status).sort(),[200,422])
    assert.match(limited.find(p=>p.status===422)!.body.error,/2\/2/)
    const afterLimit=(await call('/state',undefined,alice.token)).body
    assert.equal(afterLimit.contracts.length,2);assert.equal(afterLimit.balances.deposit,9000)
    const ticket=(await call('/tickets',{subject:'Teste',message:'Ajuda'},alice.token)).body
    assert.equal((await call(`/tickets/${ticket.id}/reply`,{message:'Não autorizado'},bob.token)).status,422)
    assert.equal((await call(`/tickets/${ticket.id}/reply`,{message:'Respondido',close:true},admin.token)).body.status,'CLOSED')
    const state=(await call('/admin/state',undefined,admin.token)).body;assert.equal(state.sessions,undefined);assert.ok(state.audit.length);assert.equal(state.users[0].passwordHash,undefined)
    assert.equal((await call(`/admin/users/${alice.user.id}`,{status:'BLOCKED'},admin.token,'PATCH')).status,200)
    assert.equal((await call('/state',undefined,alice.token)).status,401)
    await call('/auth/logout',{},bob.token);assert.equal((await call('/state',undefined,bob.token)).status,401)
  } finally {globalThis.fetch=nativeFetch;await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));fs.rmSync(dir,{recursive:true,force:true})}
})
